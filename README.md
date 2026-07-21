Eleeveon Schools Multi-Device Rebuild Plan

We will rebuild the system around one rule:

Every synced business record has one permanent string ID used everywhere: Dexie, backend, relationships, memberships, media, permissions, reports and sync.

There will be no numeric local relationship IDs in synced business data.

Phase 1 — Permanent identity foundation

This is where we start.

Goal

Replace the current dual identity system:

id?: number;
cloudId?: string;

with:

id: string;

The id will be created with:

crypto.randomUUID()

before the record is first saved, including when offline.

New base type
export interface BaseSync {
  id: string;
  accountId: string;

  createdAt: number;
  updatedAt: number;
  version: number;

  createdByDeviceId: string;
  updatedByDeviceId: string;

  syncStatus: SyncStatus;
  isDeleted: boolean;
}
Relationships

Old:

studentId: number;
classId: number;
branchId: number;

New:

studentId: string;
classId: string;
branchId: string;

These string IDs mean the same thing on every device.

First file batch

Send together:

lib/db/db.ts
lib/db/db-version.ts
lib/constants/syncStatus.ts
lib/sync table registry
lib/sync shared types
What we will do
Rewrite all synced entity interfaces to string IDs.
Remove cloudId.
Remove numeric foreign-key relationships.
Keep numeric IDs only for truly local-only tables such as blob storage or debug logs.
Rebuild Dexie schemas and indexes.
Increase the database version.
Reset the development database rather than migrate old data.
Phase 2 — Safe local data layer

Pages should not create or mutate synced records directly.

Goal

Create one controlled API for all local business data.

Core functions
createLocal()
updateLocal()
softDeleteLocal()
getLocalById()
listScopedLocal()
Creation rules

createLocal() will automatically add:

id: crypto.randomUUID()
accountId
createdAt
updatedAt
version
createdByDeviceId
updatedByDeviceId
syncStatus
isDeleted

The page will not be allowed to provide or override identity fields.

Update rules

Before updating:

Find the exact record by permanent ID
Verify account
Verify school
Verify branch
Protect immutable fields
Apply patch
Increment version
Mark pending
Scope rules

All queries must match exact scope:

row.accountId === workspace.accountId
row.schoolId === workspace.schoolId
row.branchId === workspace.branchId

Missing scope will not be treated as permission to show the record everywhere.

Second file batch
lib/local/createLocal.ts
lib/local/updateLocal.ts
lib/local/softDeleteLocal.ts
lib/local/listActiveLocal.ts
lib/local/helpers.ts
lib/local/index.ts
Phase 3 — Relationship validation

Permanent IDs alone are not enough. The system must verify that referenced records belong together.

Goal

Prevent records such as an Isaac assessment referencing Jennifer, a class from another branch, or a period from another school.

Relationship registry

We will define required relationships centrally:

const RELATIONSHIPS = {
  studentEnrollments: {
    studentId: "students",
    classId: "classes",
    academicStructureId: "academicStructures",
    academicPeriodId: "academicPeriods",
  },

  assessmentEntries: {
    studentId: "students",
    classId: "classes",
    subjectId: "subjects",
    classSubjectId: "classSubjects",
    assessmentStructureItemId: "assessmentStructureItems",
    academicPeriodId: "academicPeriods",
  },
};
Before saving

For every relation, the data layer will verify:

the parent exists;
it belongs to the same account;
it belongs to the same school;
it belongs to the same branch where applicable;
it is not deleted;
the relationship is permitted.
Third file batch
lib/sync/entityRegistry.ts
lib/sync/relationRegistry.ts
lib/sync/relationshipValidator.ts
lib/sync/recordValidator.ts

Some of these may be new files.

Phase 4 — Backend Prisma identity reset

After frontend types are settled, we rebuild backend identity.

Goal

The backend must never know or accept device-local record identity.

Membership model

New membership structure:

model UserMembership {
  id        String @id @default(uuid())
  accountId String
  userId    String
  role      String

  schoolId  String?
  branchId  String?

  teacherId String?
  studentId String?
  parentId  String?

  active    Boolean @default(true)
}

Remove:

school local IDs
branch local IDs
studentLocalId
teacherLocalId
parentLocalId
Sync record model
model SyncRecord {
  rowId      String  @id @default(uuid())
  accountId  String
  tableName  String
  entityId   String
  version    Int
  payload    Json
  isDeleted  Boolean
  updatedAt  BigInt

  @@unique([accountId, tableName, entityId])
}

The backend upserts only by:

accountId + tableName + entityId
Fourth file batch
prisma/schema.prisma
src/sync DTO files
src/memberships DTO files
src/workspace-bootstrap DTO files

We will reset the backend development database after the Prisma redesign.

Phase 5 — Rebuild backend push and pull
Goal

Ensure retries, offline records and multiple devices always resolve to the same permanent entity.

Push

Each record sent by the frontend contains:

{
  id: "permanent-uuid",
  accountId: "account-uuid",
  studentId: "student-uuid",
  classId: "class-uuid",
  version: 4
}

The server will:

override account identity using the JWT;
validate the record schema;
validate all required relationships;
verify tenant ownership;
reject wrong-branch references;
upsert by permanent ID;
handle version conflicts;
return accepted and rejected records explicitly.
Pull

The server returns records unchanged with permanent IDs.

No foreign-key remapping will be required because every device uses the same IDs.

Dependency order
1. Schools
2. Branches
3. Academic structures and periods
4. People
5. Classes, subjects and curricula
6. Relationship tables
7. Enrollments
8. Assessments and attendance
9. Reports and promotion
10. Finance and communications
11. Media metadata
Fifth file batch
src/sync/*
frontend lib/sync/push*
frontend lib/sync/pull*
frontend lib/sync/runSync*
frontend lib/sync/bootstrap*
Phase 6 — One workspace authority
Goal

Prevent one page from thinking the user is in Branch A while another thinks the user is in Branch B.

New workspace structure
interface WorkspaceScope {
  accountId: string;
  userId: string;
  membershipId: string;
  role: Role;

  schoolId?: string;
  branchId?: string;

  teacherId?: string;
  studentId?: string;
  parentId?: string;

  key: string;
  ready: boolean;
}
One source

Every page will use:

const workspace = useWorkspaceScope();

Pages will no longer read identity independently from:

localStorage;
sessionStorage;
active branch state;
settings;
first membership;
first branch;
URL fallback.
Storage

One account- and user-scoped storage key:

eleeveon:workspace:<userId>:<accountId>
Workspace transitions

When switching:

invalidate old workspace
cancel old queries
clear page state
verify new membership
construct new workspace
render new portal
Sixth file batch
account-context
active-membership-context
active-branch-context
settings-context
activeMembership.ts
RolePortalShell.tsx
useBranchWorkspaceScope.ts
app/providers.tsx

We may replace useBranchWorkspaceScope() with a generic useWorkspaceScope().

Phase 7 — Race-safe loading
Goal

Prevent delayed Branch A requests or media loads from overwriting Branch B after switching.

Every loader will capture:

const requestedWorkspaceKey = workspace.key;
const requestId = ++requestRef.current;

Before committing:

if (requestId !== requestRef.current) return;
if (workspaceRef.current.key !== requestedWorkspaceKey) return;

This applies to:

student lists;
enrollments;
assessments;
reports;
branding;
settings;
media previews;
dashboard counts.
Seventh file batch
useBackgroundLoader
useEntityMediaUrls
useEntityMediaController
useDataRevision
useBranchTableRevision
shared loading helpers
Phase 8 — Media rebuild
Goal

Isaac’s image can only belong to Isaac’s permanent ID.

Media model
interface MediaAsset extends BaseSync {
  schoolId?: string;
  branchId?: string;

  ownerTable: string;
  ownerId: string;
  fieldKey: string;

  remoteKey?: string;
  remoteUrl?: string;
  uploadStatus: MediaUploadStatus;
}

Permanent identity:

accountId + ownerTable + ownerId + fieldKey

No canonical use of:

ownerLocalId
photoMediaId as numeric local ID
student numeric ID
Backend validation

Before accepting an upload:

authenticate user;
verify account;
find owner by permanent ID;
verify owner belongs to the correct school and branch;
verify user has permission to edit that owner;
save the file to durable object storage.
Durable storage

Production files should not live only in the backend’s local uploads directory.

We will introduce a storage adapter so development may use local storage, while production uses durable object storage.

Eighth file batch
frontend lib/media/*
frontend media hooks
backend src/media/*
media storage adapter
Phase 9 — Transactional academic services

Module pages should not manually execute several dependent writes.

Enrollment service
enrollStudent()

One transaction:

verify student;
verify class;
verify period;
prevent duplicate active enrollment;
create enrollment;
update current class.
Assessment service
saveAssessmentBatch()

One transaction:

validate each student;
validate applicability;
create or update the correct logical entry;
prevent duplicates.

Logical assessment uniqueness:

studentId
+ classSubjectId
+ assessmentStructureItemId
+ academicPeriodId
Attendance service

Logical uniqueness:

studentId + academicPeriodId + date
Promotion service

One idempotent operation:

create report snapshot;
complete source enrollment;
create destination enrollment;
update current class;
create promotion record;
record operation ID.

Retrying will not promote the student twice.

Ninth file batch
lib/services/enrollmentService.ts
lib/services/assessmentService.ts
lib/services/attendanceService.ts
lib/services/promotionService.ts
lib/services/reportService.ts
Phase 10 — Rewrite modules

Once Phases 1–9 are stable, we rewrite the pages.

Batch A — Core ownership entities
Schools
Branches
Academic Structures
Academic Periods
Organizations
Classes
Subjects
Students
Teachers
Parents
Batch B — Relationship entities
Student Parents
Class Teachers
Class Subjects
Curricula
Curriculum Subjects
Student Curriculums
Subject Offerings
Student Enrollments
Batch C — Academic execution
Assessment Structures
Assessment Structure Items
Assessment Applicability
Assessment Entry
Student Attendance
Teacher Attendance
Batch D — Results and progression
Computed Results
Student Reports
Report Cards
Broadsheets
Cumulative Records
Promotion
Student Report Snapshots
Batch E — Remaining modules
Calendar
Timetables
Communications
Finance
Payroll
Settings
Phase 11 — Backend logical uniqueness

Permanent IDs prevent accidental identity collision, but logical duplicates must also be prevented.

The backend will enforce unique business keys where applicable.

Examples:

Enrollment:
studentId + academicPeriodId + active status

Assessment:
studentId + classSubjectId
+ assessmentStructureItemId + academicPeriodId

Attendance:
studentId + academicPeriodId + date

Student-parent link:
studentId + parentId

Class subject:
classId + subjectId + academicPeriodId

This prevents two devices from independently creating duplicate logical records.

Phase 12 — Multi-device integrity tests

The architecture will be tested specifically against the failures you fear.

Required test 1 — Numeric collision is irrelevant

Even though Dexie no longer uses numeric business IDs, we will simulate different insertion orders across two devices.

Verify:

scores remain attached;
photos remain attached;
attendance remains attached;
reports remain attached.
Required test 2 — Offline creation

Device A and Device B each create students offline.

After sync:

both exist;
neither replaces the other;
relationships remain correct.
Required test 3 — Workspace race

Begin loading Branch A, immediately switch to Branch B, then allow Branch A to finish.

Branch A data must never commit.

Required test 4 — Media race

Start loading Isaac’s photo, switch workspace, then resolve the image later.

The image must be discarded.

Required test 5 — Sync retry

Push the same record repeatedly.

Only one server record should exist.

Required test 6 — Promotion retry

Interrupt promotion midway, retry it, then sync from another device.

There must be:

one promotion record;
one destination enrollment;
one correct current class.
Required test 7 — Cross-branch attack

Submit a real student ID belonging to another branch.

The backend must reject it.

Required test 8 — Reinstallation

Clear Dexie completely and bootstrap from the cloud.

All students, relationships, reports and media must reconstruct correctly.

Exact execution sequence

We will follow this order without skipping ahead:

1. db.ts and permanent identity types
2. Dexie schemas and indexes
3. local CRUD layer
4. relationship registry and validation
5. Prisma models
6. backend sync
7. frontend sync
8. membership and workspace
9. race-safe loaders
10. media
11. domain transaction services
12. core modules
13. relationship modules
14. assessments and attendance
15. reports and promotion
16. multi-device tests
First batch to send

Send these together:

lib/db/db.ts
lib/db/db-version.ts
lib/constants/syncStatus.ts
the file containing sync table classifications/registry
the main frontend sync types file