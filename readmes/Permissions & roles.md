Yes — that would make the app much stronger.
You should have separate portals:
/admin dashboard/teacher dashboard/student dashboard/parent dashboard
But keep one shared database and sync system underneath.
For teachers, the dashboard can show:
Teacher Dashboard- My assigned class subjects- Assessment entry- Student attendance- My class if class teacher- My salary records- My attendance / clock-in records- Announcements
For students:
Student Dashboard- My profile- My class / curriculum- My attendance- My report cards- My fees balance- Pay fees- Receipts- Assignments / course outline
For parents:
Parent Dashboard- My children- Fees and payments- Pay fees- Report cards- Attendance- Announcements
For this, add later:
TeacherPayrollStudentFeeInvoiceStudentFeePaymentRequestAnnouncement
But do not mix portals with admin dashboard. The admin dashboard is for managing the institution. Teacher/student/parent dashboards are for self-service access.
Best architecture:
app/dashboard/page.tsx          → admin/branch dashboardapp/teacher/page.tsx            → teacher portalapp/student/page.tsx            → student portalapp/parent/page.tsx             → parent portal
And route users after login based on role:
if (role === "teacher") router.replace("/teacher");else if (role === "student") router.replace("/student");else if (role === "parent") router.replace("/parent");else router.replace("/account");
This is a very good next expansion. It turns your app from a school admin system into a full school



Yes, I’ve read them well and I understand what to do.
Your app/layout.tsx already has the correct global provider order:
AccountProvider  SettingsProvider    ActiveBranchProvider      SyncBootstrapProvider        SyncBootstrap        children
That means all portals can share the same account session, branch context, theme, Dexie, and sync bootstrap safely. 
Your current dashboard file is really the best guide for the new Admin portal layout, because it already has:


signed-in gate


sync-aware redirect


school/branch requirement


mobile-first sidebar shell


branch switch drawer


no horizontal overflow handling


tab-based module loading


SyncStatusStrip


role-ready navigation structure 


So yes, I know what to do next.
We should create them in this order:


app/components/layouts/AdminLayout.tsx
Move most of your current dashboard shell here.


app/admin/page.tsx
Small page that only renders <AdminLayout />.


app/components/layouts/OwnerLayout.tsx
For school/branch/account control. This should be based on your account setup shell, not the admin dashboard.


app/owner/page.tsx
Small page that renders <OwnerLayout />.


TeacherLayout.tsx + app/teacher/page.tsx
Teacher sees only classroom tools: assigned classes, attendance, assessment entry.


StudentLayout.tsx + app/student/page.tsx
Student self-service portal.


ParentLayout.tsx + app/parent/page.tsx
Parent self-service portal.


Important: your current app/dashboard/page.tsx should eventually become either:
/app/admin/page.tsx
or redirect to:
/admin
Best next file to write first: AdminLayout.tsx, because it is directly based on the dashboard file you uploaded. ecosystem.

Yes, I’m aware.
That means the portal separation should be:
Owner portal


can manage account


can manage schools


can manage branches


can switch school/branch


can access setup/billing/sync/account users


Admin portal


cannot switch school/branch


is locked to assigned schoolId + branchId


manages daily operations only for that branch


should not show school/branch switch drawer


So AdminLayout.tsx should remove:
Switch WorkspaceSchool selectBranch selectGo to Account Setup
and instead show a read-only context:
School: Active SchoolBranch: Assigned BranchRole: Admin / Branch Admin
The admin header can still show:
Current Branch · Sync status · Logout
But no switching.
So yes: owner = multi-branch control, admin = one branch workspace.


BACKEND
src/accounts/dto/account-users.dto.ts
src/accounts/accounts.controller.ts
src/accounts/accounts.service.ts


GET /accounts/users
POST /accounts/users
PATCH /accounts/users/:id
POST /accounts/users/:id/memberships
PATCH /accounts/memberships/:id


app/account/accountUsers.tsx


This page should become real by allowing:

view account users
create/invite user manually
assign role
assign schoolId/branchId
activate/deactivate user
create memberships for teacher/student/parent/admin/accountant
show membership badges per user

One important note: because your schools and branches live in Dexie/sync payloads, the backend can only store schoolId and branchId as local Dexie IDs in UserMembership, which your schema already supports. So the frontend must send those IDs from useActiveBranch() / local school list.

You can tell me to go ahead, and I’ll write the full drop-in backend + upgraded accountUsers.tsx.