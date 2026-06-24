import Dexie, { Table } from "dexie";
import { SyncStatus } from "./constants/syncStatus";

// ======================================================
// GLOBAL TYPES
// ======================================================

export type Role =
  
  | "developer"
  | "platform_team"
  | "owner"
  | "super_admin"
  | "branch_admin"
  | "admin"
  | "teacher"
  | "student"
  | "accountant"
  | "parent";

export type TermType =
  | "Term 1"
  | "Term 2"
  | "Term 3"
  | "Semester 1"
  | "Semester 2"
  | "Quarter 1"
  | "Quarter 2"
  | "Quarter 3"
  | "Quarter 4"

export type SystemMode =
  | "active"
  | "locked"
  | "promotion";

export type AcademicLevel =
  | "nursery"
  | "primary"
  | "junior_high"
  | "senior_high"
  | "tertiary";

export type AttendanceStatus =
  | "present"
  | "absent"
  | "late";

export type PaymentMethod =
  | "cash"
  | "momo"
  | "bank"
  | "card";

export type TransactionType =
  | "income"
  | "expense";

export type CurriculumSubjectType =
  | "core"
  | "elective"
  | "optional";

export type DeliveryMode =
  | "physical"
  | "online"
  | "hybrid";

export type ExpenseSourceType =
  | "utilities"
  | "salary"
  | "transport"
  | "feeding"
  | "maintenance"
  | "procurement"
  | "events"
  | "academic"
  | "administration"
  | "technology"
  | "marketing"
  | "security"
  | "other";

export type CurrencyCode =
  | "GHS"
  | "USD"
  | "EUR"
  | "GBP"
  | "NGN"
  | "KES"
  | "ZAR"
  | "XOF"
  | "XAF"
  | string;

export type PaymentChannel =
  | "cash"
  | "momo"
  | "bank"
  | "card"
  | "manual";

export type PaymentProvider =
  | "paystack"
  | "hubtel"
  | "flutterwave"
  | "manual"
  | "cash"
  | "bank"
  | string;

export type PaymentStatus =
  | "draft"
  | "pending"
  | "processing"
  | "paid"
  | "part_paid"
  | "failed"
  | "cancelled"
  | "refunded"
  | "reversed";

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "part_paid"
  | "paid"
  | "overdue"
  | "cancelled"
  | "void";

export type PayrollRunStatus =
  | "draft"
  | "review"
  | "approved"
  | "processing"
  | "paid"
  | "cancelled";

export type PayrollItemStatus =
  | "pending"
  | "approved"
  | "paid"
  | "failed"
  | "cancelled";

export type StaffPayType =
  | "monthly"
  | "weekly"
  | "daily"
  | "hourly"
  | "contract"
  | "commission";

export type CommunicationChannel =
  | "in_app"
  | "sms"
  | "email"
  | "whatsapp"
  | "push";

export type AnnouncementAudience =
  | "all"
  | "staff"
  | "teachers"
  | "parents"
  | "students"
  | "class"
  | "organization"
  | "custom";

export type MessageRecipientType =
  | "user"
  | "teacher"
  | "student"
  | "parent"
  | "staff"
  | "class"
  | "organization";

export type DeliveryStatus =
  | "draft"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type NotificationPriority =
  | "low"
  | "normal"
  | "high"
  | "urgent";

export type MediaAssetKind =
  | "image"
  | "document"
  | "audio"
  | "video"
  | "other";

export type MediaUploadStatus =
  | "local"
  | "queued"
  | "uploading"
  | "uploaded"
  | "failed";

export type MediaOwnerTable = string;
export type MediaFieldKey = string;




// ======================================================
// BASE SYNC
// ======================================================

export interface BaseSync {
  id?: number;          // local Dexie id
  cloudId?: string;     // cloud UUID
  accountId: string;    // client/account owner
  createdAt?: number;
  updatedAt: number;
  version: number;
  deviceId: string;
  synced: SyncStatus;
  isDeleted?: boolean;
}

// ======================================================
// MEDIA ASSETS (LOCAL-FIRST FILE / IMAGE SYSTEM)
// ======================================================
//
// Keep large file/blob data out of normal school records so sync payloads
// stay small. Records such as Student, Teacher, Parent, School, Branch,
// Announcement, Income, Expense, etc. may keep their old string fields for
// backwards compatibility, but new uploads should be stored here and linked
// by ownerTable + ownerLocalId + fieldKey or by the optional *MediaId fields.
//
// ownerTempKey prevents unsaved upload collisions. New records do not yet
// have a local id, so Students, Teachers, Parents, Classes, Settings, etc.
// can attach media with a temporary form/session key first, then clear it
// after attachMediaAssetToOwner(...) sets ownerLocalId / ownerCloudId.

export interface MediaAsset extends BaseSync {
  schoolId?: number | null;
  branchId?: number | null;

  ownerTable?: MediaOwnerTable | null;
  ownerLocalId?: number | null;
  ownerCloudId?: string | null;
  ownerTempKey?: string | null;
  fieldKey?: MediaFieldKey | null;

  fileName: string;
  originalFileName?: string | null;
  extension?: string | null;
  mimeType: string;
  assetKind: MediaAssetKind;

  sizeBytes: number;
  originalSizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  checksum?: string | null;

  localBlobId?: number | null;
  localObjectUrl?: string | null;
  thumbnailDataUrl?: string | null;
  previewDataUrl?: string | null;

  remoteUrl?: string | null;
  remoteKey?: string | null;
  remoteProvider?: string | null;

  uploadStatus: MediaUploadStatus;
  uploadedAt?: string | null;
  lastUploadAttemptAt?: string | null;
  uploadError?: string | null;

  metadata?: any;
  active?: boolean;
}

export interface MediaBlob {
  id?: number;
  accountId: string;
  assetLocalId?: number | null;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  createdAt?: number;
  updatedAt?: number;
}

// ======================================================
// ACCOUNT ACCESS (CLOUD AUTH CACHE)
// ======================================================
//
// These records mirror the backend Prisma AppUser, UserMembership,
// and PermissionRule models for offline/PWA context.
// They do NOT replace the school people records such as Teacher,
// Student, and Parent. Instead, memberships link login users to
// those local records through teacherLocalId, studentLocalId,
// and parentLocalId.

export interface LocalAppUser {
  id: string;           // cloud UUID from AppUser
  accountId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role: Role;
  active: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalUserMembership {
  id: string;           // cloud UUID from UserMembership
  accountId: string;
  userId: string;
  role: Role;

  // These remain local Dexie IDs because schools/branches and people
  // records are synced as local-first data.
  schoolId?: number | null;
  branchId?: number | null;

  teacherLocalId?: number | null;
  studentLocalId?: number | null;
  parentLocalId?: number | null;

  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalPermissionRule {
  id: string;           // cloud UUID from PermissionRule
  accountId: string;

  moduleKey: string;
  moduleLabel: string;

  developer: "yes" | "no";
  owner: "yes" | "no";
  admin: "yes" | "no";
  branch: "yes" | "no";
  teacher: "yes" | "no";
  student: "yes" | "no";
  parent: "yes" | "no";
  accountant: "yes" | "no";

  locked: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ======================================================
// PLATFORM / BACKEND CACHE TABLES
// ======================================================
//
// These tables mirror the upgraded Prisma platform schema for local UI access.
// Some of them are backend-owned, so the frontend should normally treat them
// as read-only cache records unless a specific module intentionally writes them.

export type AccountStatus =
  | "active"
  | "suspended"
  | "closed"
  | string;

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "expired"
  | "cancelled"
  | "suspended"
  | string;

export type BillingCycle =
  | "monthly"
  | "yearly"
  | "manual"
  | string;

export type PlatformJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | string;

export type PlatformJobPriority =
  | "low"
  | "normal"
  | "high"
  | "urgent"
  | string;

export interface LocalAccount {
  id: string; // cloud UUID from Account
  name: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  currency?: string | null;
  status: AccountStatus;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalUserSession {
  id: string; // cloud UUID from UserSession
  accountId: string;
  userId: string;
  refreshTokenHash?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalSubscriptionPlan {
  id: string;
  name: string;
  code: string;
  description?: string | null;

  currency?: string;
  priceMonthly: number;
  priceYearly: number;

  maxSchools?: number | null;
  maxBranches?: number | null;
  maxUsers?: number | null;
  maxStudents?: number | null;
  maxTeachers?: number | null;
  maxStorageMb?: number | null;

  offlineSync?: boolean;
  cloudBackup?: boolean;
  reports?: boolean;
  finance?: boolean;
  parentPortal?: boolean;
  studentPortal?: boolean;
  teacherPortal?: boolean;
  advancedAnalytics?: boolean;
  apiAccess?: boolean;

  features?: string[];
  metadata?: any;

  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalAccountSubscription {
  id: string;
  accountId: string;
  planId: string;

  status: SubscriptionStatus;
  billingCycle: BillingCycle;

  trialStartedAt?: string | null;
  trialEndsAt?: string | null;

  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  nextBillingDate?: string | null;

  cancelledAt?: string | null;
  cancelReason?: string | null;

  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalInvoice {
  id: string;
  accountId: string;
  subscriptionId?: string | null;

  invoiceNumber: string;
  currency?: string;

  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;

  status: "draft" | "issued" | "paid" | "void" | "overdue" | string;
  dueDate?: string | null;
  paidAt?: string | null;

  note?: string | null;
  metadata?: any;

  createdAt?: string;
  updatedAt?: string;
}

export interface LocalAppPayment {
  id: string;
  accountId: string;
  subscriptionId?: string | null;
  invoiceId?: string | null;

  amount: number;
  currency?: string;

  method: PaymentChannel | string;
  provider?: PaymentProvider | null;

  status: PaymentStatus | string;

  providerReference?: string | null;
  receiptNumber?: string | null;
  payerName?: string | null;
  payerPhone?: string | null;
  payerEmail?: string | null;

  paidAt?: string | null;
  note?: string | null;
  metadata?: any;

  createdAt?: string;
  updatedAt?: string;
}

export interface LocalBillingEvent {
  id: string;
  accountId: string;
  type: string;
  message: string;
  metadata?: any;
  createdAt?: string;
}

export interface LocalSyncDevice {
  id: string;
  accountId: string;
  deviceId: string;
  userId?: string | null;
  deviceName?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  lastSeenAt?: string | null;
  active?: boolean;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalSyncConflict {
  id: string;
  accountId: string;
  tableName: string;
  localId?: number | null;
  cloudId?: string | null;
  deviceId?: string | null;
  status: "open" | "resolved" | "ignored" | string;
  resolution?: "server_wins" | "client_wins" | "manual_merge" | string | null;
  clientPayload?: any;
  serverPayload?: any;
  resolvedPayload?: any;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalApiClient {
  id: string;
  accountId: string;
  name: string;
  description?: string | null;
  clientId: string;
  allowedOrigins?: string[];
  scopes?: string[];
  active?: boolean;
  lastUsedAt?: string | null;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalApiKey {
  id: string;
  accountId: string;
  apiClientId?: string | null;
  name: string;
  keyPrefix: string;
  scopes?: string[];
  active?: boolean;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdByUserId?: string | null;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalWebhook {
  id: string;
  accountId: string;
  name: string;
  url: string;
  events: string[];
  secret?: string | null;
  active?: boolean;
  lastTriggeredAt?: string | null;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalWebhookLog {
  id: string;
  accountId: string;
  webhookId?: string | null;
  eventType: string;
  targetUrl: string;
  status: "pending" | "success" | "failed" | string;
  statusCode?: number | null;
  requestPayload?: any;
  responseBody?: string | null;
  error?: string | null;
  attempts?: number;
  deliveredAt?: string | null;
  createdAt?: string;
}

export interface LocalIntegrationMapping {
  id: string;
  accountId: string;
  integrationKey: string; // eleeveon_learn | external_lms | external_sms etc.
  localTable: string;
  localId?: number | null;
  cloudId?: string | null;
  externalTable?: string | null;
  externalId: string;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalAuditLog {
  id: string;
  accountId: string;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  schoolId?: number | null;
  branchId?: number | null;
  before?: any;
  after?: any;
  metadata?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: string;
}

export interface LocalBackgroundJob {
  id: string;
  accountId: string;
  type: string;
  status: PlatformJobStatus;
  priority?: PlatformJobPriority;
  payload?: any;
  result?: any;
  error?: string | null;
  attempts?: number;
  maxAttempts?: number;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalStorageUsage {
  id: string;
  accountId: string;
  usedMb: number;
  limitMb?: number | null;
  fileCount?: number;
  imageCount?: number;
  documentCount?: number;
  videoCount?: number;
  lastCalculatedAt?: string | null;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalAccountFeatureFlag {
  id: string;
  accountId: string;
  key: string;
  enabled: boolean;
  value?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalAccountSystemSetting {
  id: string;
  accountId: string;
  key: string;
  value: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalNotificationDeliveryLog {
  id: string;
  accountId: string;
  channel: CommunicationChannel | string;
  purpose: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  status: DeliveryStatus | string;
  provider?: string | null;
  providerReference?: string | null;
  subject?: string | null;
  body?: string | null;
  metadata?: any;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  failedReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
}



// ======================================================
// CORE (SCHOOL STRUCTURE)
// ======================================================

export interface School extends BaseSync {
  name: string;
  logo?: string;
  logoMediaId?: number;
  motto?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  photo?: string;
  photoMediaId?: number;
  bannerImage?: string;
  bannerImageMediaId?: number;
  galleryImages?: string[];
  galleryMediaIds?: number[];
}

export interface Branch extends BaseSync {
  schoolId: number;
  name: string;
  code?: string;
  logo?: string;
  logoMediaId?: number;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  photo?: string;
  photoMediaId?: number;
  bannerImage?: string;
  bannerImageMediaId?: number;
  active?: boolean;
}

export interface AcademicStructure extends BaseSync {
  schoolId: number;
  branchId: number;
  name: string;
  level: AcademicLevel;
  startDate: string;
  endDate: string;
  photo?: string;
  photoMediaId?: number;
  bannerImage?: string;
  bannerImageMediaId?: number;
  active?: boolean;
}

export interface AcademicPeriod extends BaseSync {
  schoolId: number;
  branchId: number;
  academicStructureId: number;
  name: string;
  type?: TermType;
  startDate: string;
  endDate: string;
  photo?: string;
  photoMediaId?: number;
  order: number;
  active?: boolean;
}

export interface Organization extends BaseSync {
  schoolId: number;
  branchId: number;
  parentOrganizationId?: number;
  name: string;
  type:
    | "department"
    | "faculty"
    | "house"
    | "club"
    | "committee"
    | "administration";
  description?: string;
  photo?: string;
  photoMediaId?: number;
  bannerImage?: string;
  bannerImageMediaId?: number;
  active?: boolean;
}

// ======================================================
// PEOPLE
// ======================================================

export interface Student extends BaseSync {
  schoolId: number;
  branchId: number;
  organizationId?: number;
  currentClassId?: number;
  admissionNumber?: string;
  fullName: string;
  email?: string;
  gender?: string;
  age?: number;
  dateOfBirth?: string;
  photo?: string;
  photoMediaId?: number;
  coverPhoto?: string;
  coverPhotoMediaId?: number;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  address?: string;
  status?: "active" | "graduated" | "transferred" | "withdrawn";
}

export interface Teacher extends BaseSync {
  schoolId: number;
  branchId: number;
  organizationId?: number;
  fullName: string;
  title: string;
  gender?: string;
  age?: number;
  photo?: string;
  photoMediaId?: number;
  coverPhoto?: string;
  coverPhotoMediaId?: number;
  email?: string;
  phone?: string;
  relativePhone?: string;
  employmentDate?: string;
  salary?: number;
  role: "teacher" | "head_teacher" | "lecturer" | "principal";
  qualification?: string;
  signature?: string;
  signatureMediaId?: number;
  active?: boolean;
}

export interface Parent extends BaseSync {
  schoolId: number;
  branchId: number;
  fullName: string;
  title: string;
  phone: string;
  photo?: string;
  photoMediaId?: number;
  coverPhoto?: string;
  coverPhotoMediaId?: number;
  email?: string;
  address?: string;
  occupation?: string;
  emergencyContact?: string;
  relationship?: "father" | "mother" | "guardian";
}

export interface StudentParent extends BaseSync {
  schoolId: number;
  branchId: number;
  studentId: number;
  parentId: number;
  relationship: "father" | "mother" | "guardian" | "other";
  isPrimary?: boolean;
}

// ======================================================
// ACADEMIC STRUCTURE
// ======================================================

export interface Class extends BaseSync {
  schoolId: number;
  branchId: number;
  organizationId?: number;
  name: string;
  code?: string;
  level?: string;
  photo?: string;
  photoMediaId?: number;
  bannerImage?: string;
  bannerImageMediaId?: number;
  capacity?: number;
  active?: boolean;
}

export interface Subject extends BaseSync {
  schoolId: number;
  branchId: number;
  organizationId?: number;
  name: string;
  code?: string;
  description?: string;
  photo?: string;
  photoMediaId?: number;
  bannerImage?: string;
  bannerImageMediaId?: number;
  credits?: number;
  category?: "academic" | "technical" | "vocational" | "elective" | "core";
  active?: boolean;
}

export interface Program extends BaseSync {
  schoolId: number;
  branchId: number;
  organizationId?: number;
  name: string;
  code?: string;
  photo?: string;
  photoMediaId?: number;
  bannerImage?: string;
  bannerImageMediaId?: number;
  awardType?: string;
  durationYears?: number;
  description?: string;
  active?: boolean;
}

export interface Curriculum extends BaseSync {
  schoolId: number;
  branchId: number;
  organizationId?: number;
  programId?: number;
  academicStructureId: number;
  name: string;
  code?: string;
  photo?: string;
  photoMediaId?: number;
  bannerImage?: string;
  bannerImageMediaId?: number;
  description?: string;
  curriculumVersion?: string;
  totalCredits?: number;
  durationPeriods?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  active?: boolean;
  locked?: boolean;
}

export interface CurriculumPathway extends BaseSync {
  schoolId: number;
  branchId: number;
  curriculumId: number;
  name: string;
  code?: string;
  photo?: string;
  photoMediaId?: number;
  bannerImage?: string;
  bannerImageMediaId?: number;
  description?: string;
  active?: boolean;
}

export interface CurriculumSubject extends BaseSync {
  schoolId: number;
  branchId: number;

  curriculumId: number;
  subjectId: number;

  pathwayId?: number;

  organizationId?: number;

  // =========================
  // ACADEMIC RULES (GLOBAL)
  // =========================
  type?: CurriculumSubjectType;

  credits?: number;
  contactHours?: number;

  minimumPassScore?: number;

  orderIndex?: number;

  active?: boolean;
}

export interface ClassSubject extends BaseSync {
  schoolId: number;
  branchId: number;

  classId: number;
  subjectId: number;

  curriculumSubjectId: number;

  // =========================
  // ACADEMIC CONTEXT
  // =========================
  academicStructureId: number;
  academicPeriodId?: number;

  // =========================
  // TEACHING ASSIGNMENT
  // =========================
  teacherId?: number;

  // =========================
  // OVERRIDES (ONLY IF NEEDED)
  // =========================
  name?: string;
  code?: string;

  // override curriculum defaults if school customizes
  credits?: number;
  contactHours?: number;
  type?: CurriculumSubjectType;

  compulsory?: boolean;
  elective?: boolean;

  // =========================
  // MEDIA
  // =========================
  photo?: string;
  photoMediaId?: number;
  bannerImage?: string;
  bannerImageMediaId?: number;

  // =========================
  // STATUS
  // =========================
  active?: boolean;
  locked?: boolean;
}

export interface SubjectPrerequisite extends BaseSync {
  schoolId: number;
  branchId: number;
  curriculumSubjectId: number;
  prerequisiteSubjectId: number;
  minimumGrade?: string;
  minimumScore?: number;
  type?: "prerequisite" | "corequisite" | "recommended";
  groupCode?: string;
  active?: boolean;
}

export interface StudentCurriculum extends BaseSync {
  schoolId: number;
  branchId: number;
  studentId: number;
  curriculumId: number;
  pathwayId?: number;
  startAcademicPeriodId?: number;
  endAcademicPeriodId?: number;
  status?: "active" | "completed" | "withdrawn";
  active?: boolean;
}

export interface SubjectOffering extends BaseSync {
  schoolId: number;
  branchId: number;
  curriculumSubjectId?: number;
  classSubjectId?: number;
  subjectId: number;
  classId?: number;
  academicPeriodId?: number;
  organizationId?: number;
  teacherId?: number;
  room?: string;
  deliveryMode?: DeliveryMode;
  capacity?: number;
  compulsory?: boolean;
  active?: boolean;
}

export interface Assignment extends BaseSync {
  schoolId: number;
  branchId: number;
  teacherId: number;
  classId: number;
  subjectId: number;
}

export interface ClassTeacher extends BaseSync {
  schoolId: number;
  branchId: number;
  classId: number;
  teacherId: number;
}

export interface StudentEnrollment extends BaseSync {
  schoolId: number;
  branchId: number;
  studentId: number;
  classId: number;
  academicStructureId: number;
  academicPeriodId: number;
  startDate: string;
  endDate?: string;
  status: "active" | "completed" | "promoted" | "withdrawn";
}

// ======================================================
// ASSESSMENT ACTIVATION ENGINE
// ======================================================

export interface AssessmentApplicability extends BaseSync {
  schoolId: number;
  branchId: number;

  classSubjectId: number; // 🔥 ONLY source of truth

  assessmentStructureId: number;
  gradingSystemId?: number;

  organizationId?: number;

  active: boolean;
  locked?: boolean;

  // optional metadata (NOT relational)
  isElective?: boolean;
  groupCode?: string;
}

// ======================================================
// GRADING & ASSESSMENT
// ======================================================

export type GradingSystemType =
  | "percentage"
  | "gpa"
  | "competency"
  | "custom";

export interface GradingSystem extends BaseSync {
  schoolId: number;
  branchId: number;
  organizationId?: number;
  name: string;
  type: GradingSystemType;
  description?: string;
  photo?: string;
  photoMediaId?: number;
  active?: boolean;
  default?: boolean;
  locked?: boolean;
}

export interface GradeRule extends BaseSync {
  schoolId: number;
  branchId: number;
  gradingSystemId: number;
  minScore: number;
  maxScore: number;
  grade: string;
  remark?: string;
  gpa?: number;
  color?: string;
  order: number;
  active?: boolean;
}

export interface AssessmentStructure extends BaseSync {
  schoolId: number;
  branchId: number;
  organizationId?: number;
  academicStructureId: number;
  name: string;
  description?: string;
  photo?: string;
  photoMediaId?: number;
  bannerImage?: string;
  bannerImageMediaId?: number;
  totalScore?: number;
  active?: boolean;
  locked?: boolean;
}

export interface AssessmentStructureItem extends BaseSync {
  schoolId: number;
  branchId: number;
  assessmentStructureId: number;
  name: string;
  weight: number;
  maxScore: number;
  order: number;
  compulsory?: boolean;
  active?: boolean;
}

// ======================================================
// ASSESSMENT EXECUTION
// ======================================================

export interface AssessmentComponent extends BaseSync {
  schoolId: number;
  branchId: number;
  organizationId?: number;
  classId: number;
  subjectId: number;
  academicPeriodId: number;
  assessmentStructureId: number;
  gradingSystemId?: number;
  active: boolean;
}

export interface AssessmentEntry extends BaseSync {
  schoolId: number;
  branchId: number;

  classSubjectId?: number;

  organizationId?: number;
  academicStructureId?: number;
  academicPeriodId: number;

  gradingSystemId?: number;
  assessmentStructureId?: number;
  assessmentStructureItemId: number;

  studentId: number;
  classId: number;
  subjectId: number;

  score: number;
  grade?: string;
  remark?: string;

  published?: boolean;
  locked?: boolean;
  active?: boolean;
}

export interface ComputedResult extends BaseSync {
 
  branchId: number;
  organizationId?: number;
 schoolId: number;
  classSubjectId?: number;

  studentId: number;
  classId: number;
  subjectId: number;

  academicStructureId: number;
  academicPeriodId: number;

  gradingSystemId?: number;

  total: number;
  average?: number;
  percentage?: number;

  grade: string;
  remark?: string;
  gpa?: number;
  position?: number;

  published?: boolean;
  locked?: boolean;
}

// ======================================================
// ATTENDANCE
// ======================================================

export interface Attendance extends BaseSync {
  schoolId: number;
  branchId: number;
  studentId: number;
  classId: number;
  academicStructureId: number;
  academicPeriodId: number;
  date: string;
  status: AttendanceStatus;
}

export interface TeacherAttendance extends BaseSync {
  schoolId: number;
  branchId: number;
  teacherId: number;
  date: string;
  clockIn?: string;
  clockOut?: string;
}

// ======================================================
// REPORTING
// ======================================================

export interface ReportCard extends BaseSync {
  schoolId: number;
  branchId: number;
  studentId: number;
  classId: number;
  academicStructureId: number;
  academicPeriodId: number;
  total: number;
  average: number;
  position?: number;
  attendancePercent?: number;
  classTeacherRemark?: string;
  headTeacherRemark?: string;
  published?: boolean;
}

export interface ReportCardItem extends BaseSync {
  schoolId: number;
  branchId: number;
  reportCardId: number;
  studentId: number;
  classId: number;
  academicStructureId: number;
  academicPeriodId: number;
  subjectId: number;
  subjectName: string;
  teacherId?: number;
  teacherName?: string;
  total: number;
  average?: number;
  grade: string;
  remark?: string;
  position?: number;
}

// ======================================================
// REPORT CARD TEMPLATE / VISIBILITY SETTINGS
// ======================================================
//
// These tables make report cards enterprise-configurable without hard-coding
// one permanent design. A school or branch can choose a template design,
// then control which fields are actually printed. When a field is disabled,
// report components should remove the field/column/box completely instead of
// rendering an empty placeholder.

export type ReportCardTemplateKey =
  | "classic"
  | "modern"
  | "compact"
  | "ghana_private_school"
  | "british_style"
  | "montessori"
  | "kindergarten_narrative"
  | string;

export type ReportCardPageSize =
  | "A4"
  | "Letter"
  | string;

export type ReportCardOrientation =
  | "portrait"
  | "landscape";

export interface ReportCardTemplate extends BaseSync {
  schoolId: number;
  branchId?: number | null;

  name: string;
  templateKey: ReportCardTemplateKey;
  description?: string;

  pageSize?: ReportCardPageSize;
  orientation?: ReportCardOrientation;

  previewImage?: string;
  previewImageMediaId?: number;

  isDefault?: boolean;
  active?: boolean;
  locked?: boolean;

  metadata?: any;
}

export interface ReportCardTemplateSetting extends BaseSync {
  schoolId: number;
  branchId?: number | null;

  templateId?: number | null;
  templateKey?: ReportCardTemplateKey;

  name?: string;

  // =========================
  // TOP / IDENTITY FIELDS
  // =========================
  showStudentPhoto?: boolean;
  showAdmissionNumber?: boolean;
  showGender?: boolean;
  showClass?: boolean;
  showAcademicStructure?: boolean;
  showAcademicPeriod?: boolean;
  showBranch?: boolean;
  showNumberOnRoll?: boolean;

  // =========================
  // RESULT TABLE FIELDS
  // =========================
  showTeacherNames?: boolean;
  showAssessmentBreakdown?: boolean;
  showSubjectTotal?: boolean;
  showSubjectAverage?: boolean;
  showSubjectGrade?: boolean;
  showSubjectRemark?: boolean;
  showSubjectPosition?: boolean;

  // =========================
  // SUMMARY FIELDS
  // =========================
  showTotal?: boolean;
  showAverage?: boolean;
  showClassPosition?: boolean;
  showGPA?: boolean;
  showAttendance?: boolean;
  showAttendancePercent?: boolean;
  showPromotionStatus?: boolean;

  // =========================
  // REMARKS / SIGNATURES / NOTICE
  // =========================
  showClassTeacherRemark?: boolean;
  showHeadTeacherRemark?: boolean;
  showNextAcademicPeriod?: boolean;
  showClassTeacherSignature?: boolean;
  showHeadTeacherSignature?: boolean;
  showParentSignature?: boolean;

  // =========================
  // BRANDING / VISUALS
  // =========================
  showLogo?: boolean;
  showWatermark?: boolean;
  showReportBackground?: boolean;
  showOfficialSignatureImage?: boolean;

  // =========================
  // LABEL CUSTOMIZATION
  // =========================
  studentNameLabel?: string;
  admissionNumberLabel?: string;
  genderLabel?: string;
  classLabel?: string;
  academicStructureLabel?: string;
  academicPeriodLabel?: string;
  numberOnRollLabel?: string;

  subjectLabel?: string;
  totalLabel?: string;
  averageLabel?: string;
  gradeLabel?: string;
  subjectPositionLabel?: string;
  classPositionLabel?: string;
  gpaLabel?: string;
  attendanceLabel?: string;
  attendancePercentLabel?: string;

  classTeacherRemarkLabel?: string;
  headTeacherRemarkLabel?: string;
  nextAcademicPeriodLabel?: string;
  classTeacherSignatureLabel?: string;
  headTeacherSignatureLabel?: string;
  parentSignatureLabel?: string;

  footerText?: string;

  active?: boolean;
  metadata?: any;
}


export interface StudentReportSnapshot extends BaseSync {
  schoolId: number;
  branchId: number;

  studentId: number;
  classId: number;
  academicStructureId: number;
  academicPeriodId: number;

  academicYear?: string;
  term?: string;

  reportData: any;

  total?: number;
  average?: number;
  position?: number;
  recommendation?: "promote" | "repeat" | "graduate";
  promotedToClassId?: number;

  snapshotType: "promotion" | "terminal" | "manual";
}


export interface StudentPromotion extends BaseSync {
  schoolId: number;
  branchId: number;

  studentId: number;

  fromClassId: number;
  toClassId?: number;

  fromAcademicStructureId: number;
  toAcademicStructureId?: number;

  fromAcademicPeriodId: number;
  toAcademicPeriodId?: number;

  average?: number;
  recommendation: "promote" | "repeat" | "graduate";
  finalDecision: "promote" | "repeat" | "graduate";

  snapshotId?: number;
  note?: string;
}

// ======================================================
// FINANCE
// ======================================================

export interface FeeStructure extends BaseSync {
  schoolId: number;
  branchId: number;
  classId?: number;
  academicStructureId: number;
  academicPeriodId: number;
  items: { name: string; amount: number }[];
}

export interface Payment extends BaseSync {
  schoolId: number;
  branchId: number;
  studentId: number;
  amount: number;
  method: PaymentMethod;
  date: string;
  receiptNumber?: string;
  note?: string;
}

export interface Income extends BaseSync {
  schoolId: number;
  branchId: number;
  organizationId?: number;
  title: string;
  description?: string;
  amount: number;
  paymentMethod?: PaymentMethod;
  date: string;
  source?: string;
  receivedBy?: string;
  referenceNumber?: string;
  receiptNumber?: string;
  photo?: string;
  photoMediaId?: number;
}

export interface Expense extends BaseSync {
  schoolId: number;
  branchId: number;
  organizationId?: number;
  title: string;
  description?: string;
  amount: number;
  paymentMethod?: PaymentMethod;
  expenseSourceType?: ExpenseSourceType;
  date: string;
  paidTo?: string;
  approvedBy?: string;
  receiptNumber?: string;
  referenceNumber?: string;
  photo?: string;
}

export interface MoneyFields {
  currencyCode?: CurrencyCode;
  currencySymbol?: string;
  currencyName?: string;
  exchangeRate?: number;
}

// ======================================================
// 3) CURRENCY TABLES
// ======================================================

export interface Currency extends BaseSync {
  code: CurrencyCode;
  name: string;
  symbol: string;
  countryCode?: string;
  decimalPlaces?: number;
  active?: boolean;
  default?: boolean;
}

export interface SchoolCurrencySetting extends BaseSync {
  schoolId: number;
  branchId: number;
  currencyCode: CurrencyCode;
  currencySymbol: string;
  currencyName: string;
  allowMultipleCurrencies?: boolean;
  defaultForFees?: boolean;
  defaultForPayroll?: boolean;
  defaultForIncomeExpense?: boolean;
  active?: boolean;
}

// ======================================================
// 4) PAYMENT GATEWAY / TRANSACTION TABLES
// ======================================================

export interface PaymentIntent extends BaseSync, MoneyFields {
  schoolId: number;
  branchId: number;
  purpose: "student_fee" | "subscription" | "income" | "payroll" | "other";
  studentId?: number;
  parentId?: number;
  teacherId?: number;
  feeInvoiceId?: number;
  incomeId?: number;
  payrollRunId?: number;
  payrollItemId?: number;
  amount: number;
  channel: PaymentChannel;
  provider?: PaymentProvider;
  status: PaymentStatus;
  payerName?: string;
  payerPhone?: string;
  payerEmail?: string;
  momoNetwork?: "mtn" | "telecel" | "airteltigo" | string;
  providerReference?: string;
  authorizationUrl?: string;
  accessCode?: string;
  description?: string;
  metadata?: any;
  expiresAt?: string;
  paidAt?: string;
  cancelledAt?: string;
}

export interface PaymentTransaction extends BaseSync, MoneyFields {
  schoolId: number;
  branchId: number;
  paymentIntentId?: number;
  purpose: "student_fee" | "subscription" | "income" | "expense" | "payroll" | "refund" | "other";
  amount: number;
  channel: PaymentChannel;
  provider?: PaymentProvider;
  status: PaymentStatus;
  direction: "inflow" | "outflow";
  payerName?: string;
  payerPhone?: string;
  payerEmail?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  providerReference?: string;
  receiptNumber?: string;
  referenceNumber?: string;
  paidAt?: string;
  failedAt?: string;
  note?: string;
  metadata?: any;
}

export interface PaymentProviderEvent extends BaseSync {
  schoolId?: number;
  branchId?: number;
  provider: PaymentProvider;
  eventType: string;
  providerReference?: string;
  paymentIntentId?: number;
  paymentTransactionId?: number;
  rawPayload: any;
  processed?: boolean;
  processedAt?: string;
  error?: string;
}

export interface PaymentRefund extends BaseSync, MoneyFields {
  schoolId: number;
  branchId: number;
  paymentTransactionId: number;
  amount: number;
  reason?: string;
  status: PaymentStatus;
  provider?: PaymentProvider;
  providerReference?: string;
  requestedBy?: string;
  approvedBy?: string;
  refundedAt?: string;
  note?: string;
}


// ======================================================
// 4B) BRANCH WALLET / PAYOUT TABLES
// ======================================================

export interface PaymentSettlement extends BaseSync, MoneyFields {
  schoolId: number;
  branchId: number;
  paymentTransactionId?: number;
  provider?: PaymentProvider;
  amount: number;
  grossAmount?: number;
  netAmount?: number;
  fee?: number;
  providerFee?: number;
  platformFee?: number;
  status: PaymentStatus | "settled" | "processing" | "failed" | string;
  referenceNumber?: string;
  providerReference?: string;
  settledAt?: string;
  note?: string;
  metadata?: any;
}

export interface WithdrawalRequest extends BaseSync, MoneyFields {
  schoolId: number;
  branchId: number;
  amount: number;
  method: "bank" | "momo" | PaymentChannel | string;
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  momoNetwork?: "mtn" | "telecel" | "airteltigo" | string;
  momoNumber?: string;
  status: "requested" | "pending" | "review" | "approved" | "paid" | "rejected" | "cancelled" | string;
  referenceNumber?: string;
  requestedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  rejectedAt?: string;
  note?: string;
  metadata?: any;
}

export interface SchoolPayoutSetting extends BaseSync {
  schoolId: number;
  branchId: number;

  settlementMode: "direct_subaccount" | "platform_wallet" | string;
  preferredMethod: "bank" | "momo" | string;

  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;

  momoNetwork?: "mtn" | "telecel" | "airteltigo" | string;
  momoNumber?: string;
  momoName?: string;

  paystackSubaccountCode?: string;
  settlementSchedule?: "manual" | "daily" | "weekly" | "monthly" | string;

  contactEmail?: string;
  contactPhone?: string;

  status?: "active" | "inactive" | "verified" | "pending" | string;
  active?: boolean;
  note?: string;
  metadata?: any;
}

// ======================================================
// 5) STUDENT FEE INVOICING TABLES
// ======================================================

export interface StudentFeeInvoice extends BaseSync, MoneyFields {
  schoolId: number;
  branchId: number;
  studentId: number;
  classId?: number;
  academicStructureId?: number;
  academicPeriodId?: number;
  invoiceNumber: string;
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  amountPaid?: number;
  balance?: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate?: string;
  paidAt?: string;
  note?: string;
  locked?: boolean;
}

export interface StudentFeeInvoiceItem extends BaseSync, MoneyFields {
  schoolId: number;
  branchId: number;
  invoiceId: number;
  feeStructureId?: number;
  name: string;
  description?: string;
  quantity?: number;
  unitAmount?: number;
  amount: number;
  required?: boolean;
  order?: number;
}

export interface StudentFeePayment extends BaseSync, MoneyFields {
  schoolId: number;
  branchId: number;
  invoiceId?: number;
  studentId: number;
  parentId?: number;
  amount: number;
  method: PaymentChannel;
  provider?: PaymentProvider;
  status: PaymentStatus;
  paymentIntentId?: number;
  paymentTransactionId?: number;
  receiptNumber?: string;
  referenceNumber?: string;
  providerReference?: string;
  payerName?: string;
  payerPhone?: string;
  payerEmail?: string;
  date: string;
  paidAt?: string;
  note?: string;
  photo?: string;
  photoMediaId?: number;
}

// ======================================================
// 6) PAYROLL TABLES
// ======================================================

export interface StaffPayrollProfile extends BaseSync, MoneyFields {
  schoolId: number;
  branchId: number;
  teacherId?: number;
  staffUserId?: string;
  fullName: string;
  role?: string;
  payType: StaffPayType;
  baseSalary: number;
  allowanceDefault?: number;
  deductionDefault?: number;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  momoNetwork?: "mtn" | "telecel" | "airteltigo" | string;
  momoNumber?: string;
  momoName?: string;
  preferredPaymentMethod?: PaymentChannel;
  taxId?: string;
  ssnitNumber?: string;
  active?: boolean;
}

export interface PayrollRun extends BaseSync, MoneyFields {
  schoolId: number;
  branchId: number;
  title: string;
  description?: string;
  periodStart: string;
  periodEnd: string;
  payDate?: string;
  status: PayrollRunStatus;
  grossAmount: number;
  totalAllowances?: number;
  totalDeductions?: number;
  netAmount: number;
  amountPaid?: number;
  approvedBy?: string;
  approvedAt?: string;
  processedBy?: string;
  processedAt?: string;
  note?: string;
  locked?: boolean;
}

export interface PayrollItem extends BaseSync, MoneyFields {
  schoolId: number;
  branchId: number;
  payrollRunId: number;
  payrollProfileId?: number;
  teacherId?: number;
  staffUserId?: string;
  fullName: string;
  role?: string;
  baseSalary: number;
  allowances?: number;
  deductions?: number;
  bonus?: number;
  tax?: number;
  grossAmount: number;
  netAmount: number;
  status: PayrollItemStatus;
  paymentMethod?: PaymentChannel;
  provider?: PaymentProvider;
  paymentIntentId?: number;
  paymentTransactionId?: number;
  receiptNumber?: string;
  referenceNumber?: string;
  providerReference?: string;
  paidAt?: string;
  note?: string;
}

export interface StaffPaymentRecord extends BaseSync, MoneyFields {
  schoolId: number;
  branchId: number;
  teacherId?: number;
  staffUserId?: string;
  payrollRunId?: number;
  payrollItemId?: number;
  amount: number;
  method: PaymentChannel;
  provider?: PaymentProvider;
  status: PaymentStatus;
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  bankName?: string;
  bankAccountNumber?: string;
  momoNetwork?: string;
  momoNumber?: string;
  referenceNumber?: string;
  receiptNumber?: string;
  providerReference?: string;
  date: string;
  paidAt?: string;
  note?: string;
  photo?: string;
  photoMediaId?: number;
}

// ======================================================
// 7) ANNOUNCEMENTS & MESSAGING TABLES
// ======================================================

export interface Announcement extends BaseSync {
  schoolId: number;
  branchId: number;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  classId?: number;
  organizationId?: number;
  channels: CommunicationChannel[];
  priority?: NotificationPriority;
  publishAt?: string;
  expiresAt?: string;
  published?: boolean;
  publishedAt?: string;
  createdBy?: string;
  photo?: string;
  photoMediaId?: number;
  attachmentUrl?: string;
  attachmentMediaId?: number;
  metadata?: any;
}

export interface AnnouncementRecipient extends BaseSync {
  schoolId: number;
  branchId: number;
  announcementId: number;
  recipientType: MessageRecipientType;
  recipientLocalId?: number;
  userId?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  whatsappNumber?: string;
  channels: CommunicationChannel[];
  status: DeliveryStatus;
  deliveredAt?: string;
  readAt?: string;
  failedReason?: string;
}

export interface MessageThread extends BaseSync {
  schoolId: number;
  branchId: number;
  title?: string;
  threadType: "direct" | "group" | "class" | "parent_teacher" | "support" | "announcement";
  classId?: number;
  organizationId?: number;
  studentId?: number;
  teacherId?: number;
  parentId?: number;
  createdBy?: string;
  lastMessageAt?: string;
  archived?: boolean;
}

export interface Message extends BaseSync {
  schoolId: number;
  branchId: number;
  threadId: number;
  senderUserId?: string;
  senderRole?: Role;
  senderName?: string;
  body: string;
  channel?: CommunicationChannel;
  attachmentUrl?: string;
  attachmentMediaId?: number;
  photo?: string;
  photoMediaId?: number;
  deliveredAt?: string;
  readAt?: string;
  status?: DeliveryStatus;
}

export interface CommunicationLog extends BaseSync {
  schoolId: number;
  branchId: number;
  channel: CommunicationChannel;
  purpose: "announcement" | "message" | "fee_reminder" | "payroll" | "attendance" | "report" | "other";
  relatedTable?: string;
  relatedLocalId?: number;
  recipientType?: MessageRecipientType;
  recipientLocalId?: number;
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  whatsappNumber?: string;
  subject?: string;
  body?: string;
  status: DeliveryStatus;
  provider?: string;
  providerReference?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedReason?: string;
  metadata?: any;
}

export interface NotificationTemplate extends BaseSync {
  schoolId: number;
  branchId: number;
  name: string;
  purpose: "announcement" | "fee_reminder" | "payment_receipt" | "payroll_notice" | "attendance_alert" | "report_ready" | "custom";
  channel: CommunicationChannel;
  subject?: string;
  body: string;
  variables?: string[];
  active?: boolean;
}
// ======================================================
// SETTINGS
// ======================================================

export interface SchoolBranchSetting extends BaseSync {
  schoolId: number;
  branchId: number;

  mode?: string;
  theme?: "light" | "dark";
  primaryColor?: string;
  fontFamily?: string;
  fontSize?: number;

  academicYear?: string;
  currentTerm?: string;
  currentAcademicStructureId?: number;
  currentAcademicPeriodId?: number;

  logo?: string;
  logoMediaId?: number;
  reportCardBackgroundImage?: string;
  reportCardBackgroundImageMediaId?: number;
  reportCardWatermark?: string;
  reportCardWatermarkMediaId?: number;
  reportCardSignatureImage?: string;
  reportCardSignatureImageMediaId?: number;

  dashboardHeroImage?: string;
  dashboardHeroImageMediaId?: number;
  dashboardBannerImage?: string;
  dashboardBannerImageMediaId?: number;
  studentPortalImage?: string;
  studentPortalImageMediaId?: number;
  teacherPortalImage?: string;
  teacherPortalImageMediaId?: number;
  classroomPlaceholderImage?: string;
  classroomPlaceholderImageMediaId?: number;
  subjectPlaceholderImage?: string;
  subjectPlaceholderImageMediaId?: number;

  schoolGalleryImages?: string[];
  schoolGalleryMediaIds?: number[];
}

// ======================================================
// SCHEDULING TYPES
// ======================================================

export type ScheduleScopeType =
  | "account"
  | "school"
  | "branch"
  | "class"
  | "subject"
  | "teacher"
  | "student"
  | "parent"
  | "staff"
  | "department"
  | "business"
  | "personal"
  | "custom";

export type CalendarEventType =
  | "general"
  | "school_event"
  | "branch_event"
  | "class_event"
  | "lesson"
  | "exam"
  | "assessment"
  | "meeting"
  | "parent_teacher_meeting"
  | "fee_deadline"
  | "payroll_date"
  | "holiday"
  | "vacation"
  | "deadline"
  | "reminder"
  | "maintenance"
  | "custom";

export type CalendarVisibility =
  | "private"
  | "branch"
  | "school"
  | "public";

export type CalendarEventStatus =
  | "draft"
  | "scheduled"
  | "confirmed"
  | "cancelled"
  | "postponed"
  | "completed";

export type CalendarParticipantType =
  | "user"
  | "teacher"
  | "student"
  | "parent"
  | "accountant"
  | "branch_admin"
  | "school_admin"
  | "class"
  | "branch"
  | "school"
  | "group"
  | "external";

export type CalendarResponseStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "tentative"
  | "no_response";

export type CalendarReminderChannel =
  | "in_app"
  | "email"
  | "sms"
  | "whatsapp";

export type ScheduleTimetableType =
  | "school"
  | "branch"
  | "class"
  | "teacher"
  | "exam"
  | "room"
  | "custom";

export type ScheduleDayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type ScheduleSessionType =
  | "lesson"
  | "break"
  | "assembly"
  | "exam"
  | "meeting"
  | "activity"
  | "custom";

export type ScheduleResourceType =
  | "classroom"
  | "laboratory"
  | "hall"
  | "library"
  | "office"
  | "bus"
  | "device"
  | "equipment"
  | "online_room"
  | "custom";

export type ScheduleConflictType =
  | "teacher_double_booked"
  | "class_double_booked"
  | "student_double_booked"
  | "room_double_booked"
  | "resource_double_booked"
  | "branch_event_overlap"
  | "school_event_overlap"
  | "custom";

export type ScheduleConflictSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type ScheduleConflictStatus =
  | "open"
  | "ignored"
  | "resolved";

// ======================================================
// CALENDAR EVENTS
// ======================================================

export interface CalendarEvent extends BaseSync {
  schoolId: number;
  branchId: number;

  /**
   * Generic reusable scope.
   * Examples:
   * scopeType="class", scopeId=classId
   * scopeType="teacher", scopeId=teacherId
   * scopeType="business", scopeId=businessId in another Eleeveon app
   */
  scopeType: ScheduleScopeType;
  scopeId?: number | null;

  title: string;
  description?: string;

  eventType: CalendarEventType;
  status: CalendarEventStatus;
  visibility: CalendarVisibility;

  /**
   * Start/end are timestamps for easy Dexie filtering.
   */
  startAt: number;
  endAt: number;
  allDay?: boolean;

  timezone?: string;
  location?: string;
  onlineMeetingUrl?: string;

  /**
   * Optional school links.
   */
  classId?: number | null;
  subjectId?: number | null;
  classSubjectId?: number | null;
  teacherLocalId?: number | null;
  studentLocalId?: number | null;
  parentLocalId?: number | null;

  academicStructureId?: number | null;
  academicPeriodId?: number | null;

  /**
   * Optional recurrence rule for repeated events.
   * Example:
   * FREQ=WEEKLY;BYDAY=MO,WE
   */
  recurrenceRule?: string;
  recurrenceEndAt?: number | null;
  parentEventId?: number | null;

  /**
   * Communication links.
   */
  announcementId?: number | null;
  messageThreadId?: number | null;

  color?: string;
  priority?: "low" | "normal" | "high" | "urgent";

  createdByUserId?: number | string | null;
  createdByRole?: string;

  active?: boolean;
}

// ======================================================
// CALENDAR PARTICIPANTS
// ======================================================

export interface CalendarEventParticipant extends BaseSync {
  schoolId: number;
  branchId: number;

  eventId: number;

  participantType: CalendarParticipantType;
  participantId?: number | null;
  userLocalId?: number | null;

  role?: string;
  displayName?: string;
  email?: string;
  phone?: string;

  responseStatus: CalendarResponseStatus;
  responseNote?: string;
  respondedAt?: number | null;

  required?: boolean;
  canEdit?: boolean;
  active?: boolean;
}

// ======================================================
// CALENDAR REMINDERS
// ======================================================

export interface CalendarEventReminder extends BaseSync {
  schoolId: number;
  branchId: number;

  eventId: number;
  participantId?: number | null;

  channel: CalendarReminderChannel;

  /**
   * 1440 = one day before
   * 60 = one hour before
   * 10 = ten minutes before
   */
  minutesBefore: number;

  scheduledAt?: number;
  sentAt?: number | null;

  status?: "pending" | "sent" | "failed" | "cancelled";
  error?: string;

  active?: boolean;
}

// ======================================================
// CALENDAR RESPONSES
// ======================================================

export interface CalendarEventResponse extends BaseSync {
  schoolId: number;
  branchId: number;

  eventId: number;
  participantId?: number | null;

  userLocalId?: number | null;
  participantType?: CalendarParticipantType;

  responseStatus: CalendarResponseStatus;
  note?: string;
  respondedAt: number;
}

// ======================================================
// TIMETABLES
// ======================================================

export interface ScheduleTimetable extends BaseSync {
  schoolId: number;
  branchId: number;

  name: string;
  description?: string;

  timetableType: ScheduleTimetableType;

  /**
   * Generic reusable scope.
   * Examples:
   * class timetable: scopeType="class", scopeId=classId
   * teacher timetable: scopeType="teacher", scopeId=teacherId
   * exam timetable: scopeType="branch", scopeId=branchId
   */
  scopeType: ScheduleScopeType;
  scopeId?: number | null;

  academicStructureId?: number | null;
  academicPeriodId?: number | null;

  classId?: number | null;
  teacherLocalId?: number | null;

  effectiveFrom?: number | null;
  effectiveTo?: number | null;

  status?: "draft" | "active" | "archived";

  active?: boolean;
  isDefault?: boolean;

  createdByUserId?: number | string | null;
  createdByRole?: string;
}

// ======================================================
// TIMETABLE SESSIONS
// ======================================================

export interface ScheduleSession extends BaseSync {
  schoolId: number;
  branchId: number;

  timetableId: number;

  sessionType: ScheduleSessionType;
  dayOfWeek: ScheduleDayOfWeek;

  /**
   * Use minutes from midnight for easier conflict checking.
   * 8:30am = 510
   * 2:15pm = 855
   */
  startMinute: number;
  endMinute: number;

  title?: string;
  description?: string;

  classId?: number | null;
  subjectId?: number | null;
  classSubjectId?: number | null;
  teacherLocalId?: number | null;

  resourceId?: number | null;
  roomName?: string;
  location?: string;

  color?: string;

  effectiveFrom?: number | null;
  effectiveTo?: number | null;

  active?: boolean;
}

// ======================================================
// SCHEDULE RESOURCES
// ======================================================

export interface ScheduleResource extends BaseSync {
  schoolId: number;
  branchId: number;

  name: string;
  resourceType: ScheduleResourceType;

  description?: string;
  capacity?: number | null;
  location?: string;

  /**
   * Reusable scope for future Eleeveon apps.
   */
  scopeType?: ScheduleScopeType;
  scopeId?: number | null;

  active?: boolean;
}

// ======================================================
// SCHEDULE CONFLICTS
// ======================================================

export interface ScheduleConflict extends BaseSync {
  schoolId: number;
  branchId: number;

  conflictType: ScheduleConflictType;
  severity: ScheduleConflictSeverity;
  status: ScheduleConflictStatus;

  title: string;
  description?: string;

  /**
   * Link either calendar event conflict,
   * timetable session conflict, or both.
   */
  eventIdA?: number | null;
  eventIdB?: number | null;

  sessionIdA?: number | null;
  sessionIdB?: number | null;

  resourceId?: number | null;

  teacherLocalId?: number | null;
  classId?: number | null;
  studentLocalId?: number | null;

  conflictStartAt?: number | null;
  conflictEndAt?: number | null;

  dayOfWeek?: ScheduleDayOfWeek;
  startMinute?: number | null;
  endMinute?: number | null;

  detectedAt: number;
  resolvedAt?: number | null;
  resolvedByUserId?: number | string | null;
  resolutionNote?: string;
}


// ======================================================
// DATABASE
// ======================================================

class AppDB extends Dexie {
  schools!: Table<School>;
  branches!: Table<Branch>;
  academicStructures!: Table<AcademicStructure>;
  academicPeriods!: Table<AcademicPeriod>;
  organizations!: Table<Organization>;

  students!: Table<Student>;
  teachers!: Table<Teacher>;
  parents!: Table<Parent>;
  studentParents!: Table<StudentParent>;

  classes!: Table<Class>;
  subjects!: Table<Subject>;
  programs!: Table<Program>;

  curriculums!: Table<Curriculum>;
  curriculumPathways!: Table<CurriculumPathway>;
  curriculumSubjects!: Table<CurriculumSubject>;

  classSubjects!: Table<ClassSubject>;

  subjectPrerequisites!: Table<SubjectPrerequisite>;
  studentCurriculums!: Table<StudentCurriculum>;
  subjectOfferings!: Table<SubjectOffering>;

  assignments!: Table<Assignment>;
  classTeachers!: Table<ClassTeacher>;
  studentEnrollments!: Table<StudentEnrollment>;

  gradingSystems!: Table<GradingSystem>;
  gradeRules!: Table<GradeRule>;

  assessmentStructures!: Table<AssessmentStructure>;
  assessmentStructureItems!: Table<AssessmentStructureItem>;

  assessmentApplicabilities!: Table<AssessmentApplicability>;

  assessmentComponents!: Table<AssessmentComponent>;
  assessmentEntries!: Table<AssessmentEntry>;
  computedResults!: Table<ComputedResult>;

  attendance!: Table<Attendance>;
  teacherAttendance!: Table<TeacherAttendance>;

  reportCards!: Table<ReportCard>;
  reportCardItems!: Table<ReportCardItem>;
  reportCardTemplates!: Table<ReportCardTemplate, number>;
  reportCardTemplateSettings!: Table<ReportCardTemplateSetting, number>;

  studentReportSnapshots!: Table<StudentReportSnapshot, number>;
  studentPromotions!: Table<StudentPromotion, number>;

  feeStructures!: Table<FeeStructure>;
  payments!: Table<Payment>;

  incomes!: Table<Income>;
  expenses!: Table<Expense>;

  currencies!: Table<Currency>;
  schoolCurrencySettings!: Table<SchoolCurrencySetting>;

  paymentIntents!: Table<PaymentIntent>;
  paymentTransactions!: Table<PaymentTransaction>;
  paymentProviderEvents!: Table<PaymentProviderEvent>;
  paymentRefunds!: Table<PaymentRefund>;
  paymentSettlements!: Table<PaymentSettlement>;
  withdrawalRequests!: Table<WithdrawalRequest>;
  schoolPayoutSettings!: Table<SchoolPayoutSetting>;

  studentFeeInvoices!: Table<StudentFeeInvoice>;
  studentFeeInvoiceItems!: Table<StudentFeeInvoiceItem>;
  studentFeePayments!: Table<StudentFeePayment>;

  staffPayrollProfiles!: Table<StaffPayrollProfile>;
  payrollRuns!: Table<PayrollRun>;
  payrollItems!: Table<PayrollItem>;
  staffPaymentRecords!: Table<StaffPaymentRecord>;

  announcements!: Table<Announcement>;
  announcementRecipients!: Table<AnnouncementRecipient>;
  messageThreads!: Table<MessageThread>;
  messages!: Table<Message>;
  communicationLogs!: Table<CommunicationLog>;
  notificationTemplates!: Table<NotificationTemplate>;

  schoolBranchSettings!: Table<SchoolBranchSetting>;

  mediaAssets!: Table<MediaAsset, number>;
  mediaBlobs!: Table<MediaBlob, number>;

  calendarEvents!: Table<CalendarEvent, number>;
  calendarEventParticipants!: Table<CalendarEventParticipant, number>;
  calendarEventReminders!: Table<CalendarEventReminder, number>;
  calendarEventResponses!: Table<CalendarEventResponse, number>;
 
  scheduleTimetables!: Table<ScheduleTimetable, number>;
  scheduleSessions!: Table<ScheduleSession, number>;
  scheduleResources!: Table<ScheduleResource, number>;
  scheduleConflicts!: Table<ScheduleConflict, number>;
 

  appUsers!: Table<LocalAppUser, string>;
  userMemberships!: Table<LocalUserMembership, string>;
  permissionRules!: Table<LocalPermissionRule, string>;

  // Platform/backend cache tables added in the platform-ready upgrade.
  accounts!: Table<LocalAccount, string>;
  userSessions!: Table<LocalUserSession, string>;
  subscriptionPlans!: Table<LocalSubscriptionPlan, string>;
  accountSubscriptions!: Table<LocalAccountSubscription, string>;
  invoices!: Table<LocalInvoice, string>;
  appPayments!: Table<LocalAppPayment, string>;
  billingEvents!: Table<LocalBillingEvent, string>;
  syncDevices!: Table<LocalSyncDevice, string>;
  syncConflicts!: Table<LocalSyncConflict, string>;
  apiClients!: Table<LocalApiClient, string>;
  apiKeys!: Table<LocalApiKey, string>;
  webhooks!: Table<LocalWebhook, string>;
  webhookLogs!: Table<LocalWebhookLog, string>;
  integrationMappings!: Table<LocalIntegrationMapping, string>;
  auditLogs!: Table<LocalAuditLog, string>;
  backgroundJobs!: Table<LocalBackgroundJob, string>;
  storageUsages!: Table<LocalStorageUsage, string>;
  accountFeatureFlags!: Table<LocalAccountFeatureFlag, string>;
  accountSystemSettings!: Table<LocalAccountSystemSetting, string>;
  notificationDeliveryLogs!: Table<LocalNotificationDeliveryLog, string>;

  constructor() {
    super("EleeveonDB");

    this.version(36).stores({
      schools: "++id,cloudId,accountId, name,updatedAt",

      branches:
        "++id,cloudId,accountId,schoolId,name,updatedAt",

      academicStructures:
        "++id,cloudId,accountId, schoolId, branchId,level,updatedAt",

      academicPeriods:
        "++id,cloudId,accountId, schoolId, branchId,academicStructureId,order,updatedAt",

      organizations:
        "++id,cloudId,accountId,schoolId,branchId,parentOrganizationId,type,updatedAt",

      students:
        "++id,cloudId,accountId,schoolId,branchId,currentClassId,admissionNumber,fullName,email,status,updatedAt",

      teachers:
        "++id,cloudId,accountId,schoolId,branchId,role,fullName,title,updatedAt",

      parents:
        "++id,cloudId,accountId,schoolId,branchId,phone,email,title,fullName",

      studentParents:
        "++id,cloudId,accountId,schoolId,branchId,studentId,parentId",

      classes:
        "++id,cloudId,accountId,schoolId,branchId,organizationId,name,updatedAt",

      subjects:
        "++id,cloudId,accountId, schoolId, branchId,organizationId,name,code,category,updatedAt",

      programs:
        "++id,cloudId,accountId,schoolId,branchId,organizationId,code,name,active,updatedAt",

      curriculums:
        "++id,cloudId,accountId,schoolId,branchId,organizationId,programId,academicStructureId,name,active,updatedAt",

      curriculumPathways:
        "++id,cloudId,accountId,schoolId,branchId,curriculumId,active,updatedAt",

      curriculumSubjects: "++id,cloudId,accountId, schoolId, branchId,curriculumId,subjectId,pathwayId,organizationId,active",

      classSubjects: 
        "++id,cloudId,accountId, schoolId, branchId, classId, subjectId, curriculumSubjectId,academicStructureId, academicPeriodId, teacherId, active, locked",
        
        
      subjectPrerequisites:
        "++id,cloudId,accountId, schoolId, branchId,curriculumSubjectId,prerequisiteSubjectId,type,active,updatedAt",

      studentCurriculums:
        "++id,cloudId,accountId,schoolId,branchId,studentId,curriculumId,status,active,updatedAt",

      subjectOfferings:
        "++id,cloudId,accountId,schoolId,branchId,classSubjectId,curriculumSubjectId,subjectId,classId,academicPeriodId,teacherId,active,updatedAt",

      assignments:
        "++id,cloudId,accountId,schoolId,branchId,teacherId,classId,subjectId",

      classTeachers:
        "++id,cloudId,accountId,schoolId,branchId,classId,teacherId",

      studentEnrollments:
        "++id,cloudId,accountId,schoolId,branchId,studentId,classId,academicPeriodId,status,updatedAt",

      gradingSystems:
        "++id,cloudId,accountId, schoolId, branchId,organizationId,name,type,active,updatedAt",

      gradeRules:
        "++id,cloudId,accountId, schoolId, branchId,gradingSystemId,minScore,maxScore,grade,order,updatedAt",

      assessmentStructures:
        "++id,cloudId,accountId, schoolId, branchId,organizationId,academicStructureId,name,active,updatedAt",

      assessmentStructureItems:
        "++id,cloudId,accountId, schoolId, branchId,assessmentStructureId,order,active,updatedAt",

      assessmentApplicabilities:
        "++id,cloudId,accountId, schoolId, branchId,classSubjectId,assessmentStructureId,gradingSystemId,active,locked",

      assessmentComponents:
        "++id,cloudId,accountId, schoolId, branchId,classId,subjectId,academicPeriodId,assessmentStructureId,active",

      assessmentEntries:
        "++id,cloudId,accountId, schoolId, branchId,classSubjectId,studentId,assessmentStructureItemId,published,active",

      computedResults:
        "++id,cloudId,accountId, schoolId, branchId,classSubjectId,studentId,grade,gpa,position,published",

      attendance:
        "++id,cloudId,accountId, schoolId, branchId,studentId,classId,academicPeriodId,date",

      teacherAttendance:
        "++id,cloudId,accountId, schoolId, branchId,teacherId,date",

      reportCards:
        "++id,cloudId,accountId, schoolId, branchId,studentId,classId,academicPeriodId",

      reportCardItems:
        "++id,cloudId,accountId, schoolId, branchId,reportCardId,subjectId,academicPeriodId",

      reportCardTemplates:
        "++id,cloudId,accountId,schoolId,branchId,templateKey,name,isDefault,active,updatedAt",

      reportCardTemplateSettings:
        "++id,cloudId,accountId,schoolId,branchId,templateId,templateKey,name,active,updatedAt",

      studentReportSnapshots:
        "++id,cloudId,accountId, schoolId, branchId, studentId, classId, academicStructureId, academicPeriodId, promotedToClassId, snapshotType, synced, isDeleted, updatedAt",

      studentPromotions:
        "++id,cloudId,accountId, schoolId, branchId, studentId, fromClassId, toClassId, fromAcademicStructureId, toAcademicStructureId, fromAcademicPeriodId, toAcademicPeriodId, average, recommendation, finalDecision, snapshotId, note",

      schoolBranchSettings:
        "++id,cloudId,accountId, schoolId, branchId, currentAcademicStructureId, currentAcademicPeriodId, synced, isDeleted, updatedAt",

      currencies:
        "++id,cloudId,accountId,code,countryCode,active,default,updatedAt",

      schoolCurrencySettings:
        "++id,cloudId,accountId,schoolId,branchId,currencyCode,active,updatedAt",

      paymentIntents:
        "++id,cloudId,accountId,schoolId,branchId,purpose,studentId,parentId,teacherId,feeInvoiceId,incomeId,payrollRunId,payrollItemId,status,channel,provider,providerReference,updatedAt",

      paymentTransactions:
        "++id,cloudId,accountId,schoolId,branchId,paymentIntentId,purpose,direction,status,channel,provider,providerReference,receiptNumber,referenceNumber,paidAt,updatedAt",

      paymentProviderEvents:
        "++id,cloudId,accountId,schoolId,branchId,provider,eventType,providerReference,paymentIntentId,paymentTransactionId,processed,createdAt,updatedAt",

      paymentRefunds:
        "++id,cloudId,accountId,schoolId,branchId,paymentTransactionId,status,provider,providerReference,refundedAt,updatedAt",

      paymentSettlements:
        "++id,cloudId,accountId,schoolId,branchId,paymentTransactionId,status,provider,providerReference,referenceNumber,settledAt,updatedAt",

      withdrawalRequests:
        "++id,cloudId,accountId,schoolId,branchId,status,method,referenceNumber,requestedAt,approvedAt,paidAt,updatedAt",

      schoolPayoutSettings:
        "++id,cloudId,accountId,schoolId,branchId,preferredMethod,settlementMode,paystackSubaccountCode,status,active,updatedAt",

      studentFeeInvoices:
        "++id,cloudId,accountId,schoolId,branchId,studentId,classId,academicStructureId,academicPeriodId,invoiceNumber,status,dueDate,paidAt,updatedAt",

      studentFeeInvoiceItems:
        "++id,cloudId,accountId,schoolId,branchId,invoiceId,feeStructureId,name,required,order,updatedAt",

      studentFeePayments:
        "++id,cloudId,accountId,schoolId,branchId,invoiceId,studentId,parentId,status,method,provider,paymentIntentId,paymentTransactionId,receiptNumber,referenceNumber,providerReference,date,paidAt,updatedAt",

      staffPayrollProfiles:
        "++id,cloudId,accountId,schoolId,branchId,teacherId,staffUserId,fullName,payType,preferredPaymentMethod,active,updatedAt",

      payrollRuns:
        "++id,cloudId,accountId,schoolId,branchId,status,periodStart,periodEnd,payDate,approvedAt,processedAt,locked,updatedAt",

      payrollItems:
        "++id,cloudId,accountId,schoolId,branchId,payrollRunId,payrollProfileId,teacherId,staffUserId,status,paymentMethod,provider,paymentIntentId,paymentTransactionId,paidAt,updatedAt",

      staffPaymentRecords:
        "++id,cloudId,accountId,schoolId,branchId,teacherId,staffUserId,payrollRunId,payrollItemId,status,method,provider,referenceNumber,receiptNumber,providerReference,date,paidAt,updatedAt",

      announcements:
        "++id,cloudId,accountId,schoolId,branchId,audience,classId,organizationId,published,publishAt,expiresAt,createdBy,updatedAt",

      announcementRecipients:
        "++id,cloudId,accountId,schoolId,branchId,announcementId,recipientType,recipientLocalId,userId,status,deliveredAt,readAt,updatedAt",

      messageThreads:
        "++id,cloudId,accountId,schoolId,branchId,threadType,classId,organizationId,studentId,teacherId,parentId,createdBy,lastMessageAt,archived,updatedAt",

      messages:
        "++id,cloudId,accountId,schoolId,branchId,threadId,senderUserId,senderRole,channel,status,deliveredAt,readAt,updatedAt",


      calendarEvents:
    "++id, cloudId, accountId, schoolId, branchId, scopeType, scopeId, eventType, status, visibility, startAt, endAt, classId, subjectId, classSubjectId, teacherLocalId, studentLocalId, parentLocalId, academicStructureId, academicPeriodId, announcementId, messageThreadId, createdByUserId, active, isDeleted, updatedAt, synced",

  calendarEventParticipants:
    "++id, cloudId, accountId, schoolId, branchId, eventId, participantType, participantId, userLocalId, role, email, responseStatus, required, active, isDeleted, updatedAt, synced",

  calendarEventReminders:
    "++id, cloudId, accountId, schoolId, branchId, eventId, participantId, channel, minutesBefore, scheduledAt, sentAt, status, active, isDeleted, updatedAt, synced",

  calendarEventResponses:
    "++id, cloudId, accountId, schoolId, branchId, eventId, participantId, userLocalId, participantType, responseStatus, respondedAt, isDeleted, updatedAt, synced",

  scheduleTimetables:
    "++id, cloudId, accountId, schoolId, branchId, name, timetableType, scopeType, scopeId, academicStructureId, academicPeriodId, classId, teacherLocalId, effectiveFrom, effectiveTo, status, active, isDefault, isDeleted, updatedAt, synced",

  scheduleSessions:
    "++id, cloudId, accountId, schoolId, branchId, timetableId, sessionType, dayOfWeek, startMinute, endMinute, classId, subjectId, classSubjectId, teacherLocalId, resourceId, active, isDeleted, updatedAt, synced",

  scheduleResources:
    "++id, cloudId, accountId, schoolId, branchId, name, resourceType, scopeType, scopeId, active, isDeleted, updatedAt, synced",

  scheduleConflicts:
    "++id, cloudId, accountId, schoolId, branchId, conflictType, severity, status, eventIdA, eventIdB, sessionIdA, sessionIdB, resourceId, teacherLocalId, classId, studentLocalId, detectedAt, resolvedAt, isDeleted, updatedAt, synced",
      communicationLogs:
        "++id,cloudId,accountId,schoolId,branchId,channel,purpose,relatedTable,relatedLocalId,recipientType,recipientLocalId,status,provider,providerReference,sentAt,deliveredAt,readAt,updatedAt",

      notificationTemplates:
        "++id,cloudId,accountId,schoolId,branchId,purpose,channel,name,active,updatedAt",

      feeStructures:
        "++id,cloudId,accountId,schoolId,branchId,classId,academicStructureId,academicPeriodId,currencyCode,updatedAt",

      payments:
        "++id,cloudId,accountId,schoolId,branchId,studentId,method,currencyCode,date,receiptNumber,updatedAt",

      incomes:
        "++id,cloudId,accountId,schoolId,branchId,organizationId,title,date,amount,paymentMethod,currencyCode,updatedAt",

      expenses:
        "++id,cloudId,accountId,schoolId,branchId,organizationId,title,date,amount,expenseSourceType,paymentMethod,currencyCode,updatedAt",
      
      mediaAssets:
        "++id,cloudId,accountId,schoolId,branchId,ownerTable,ownerLocalId,ownerCloudId,ownerTempKey,fieldKey,assetKind,mimeType,uploadStatus,active,isDeleted,updatedAt,synced",

      mediaBlobs:
        "++id,accountId,assetLocalId,mimeType,sizeBytes,createdAt,updatedAt",
      
      appUsers:
        "id,accountId,email,role,active,updatedAt",

      userMemberships:
        "id,accountId,userId,role,schoolId,branchId,teacherLocalId,studentLocalId,parentLocalId,active,updatedAt",

      permissionRules:
        "id,accountId,moduleKey,developer,owner,admin,branch,teacher,student,parent,accountant,locked,updatedAt",

      // ======================================================
      // PLATFORM / BACKEND CACHE STORES
      // ======================================================
      accounts:
        "id,email,status,createdAt,updatedAt",

      userSessions:
        "id,accountId,userId,deviceId,expiresAt,revokedAt,updatedAt",

      subscriptionPlans:
        "id,code,active,priceMonthly,priceYearly,updatedAt",

      accountSubscriptions:
        "id,accountId,planId,status,billingCycle,currentPeriodEnd,nextBillingDate,updatedAt",

      invoices:
        "id,accountId,subscriptionId,invoiceNumber,status,dueDate,paidAt,updatedAt",

      appPayments:
        "id,accountId,subscriptionId,invoiceId,status,method,provider,providerReference,receiptNumber,paidAt,updatedAt",

      billingEvents:
        "id,accountId,type,createdAt",

      syncDevices:
        "id,accountId,deviceId,userId,lastSeenAt,active,updatedAt",

      syncConflicts:
        "id,accountId,tableName,localId,cloudId,deviceId,status,resolvedAt,updatedAt",

      apiClients:
        "id,accountId,clientId,name,active,lastUsedAt,updatedAt",

      apiKeys:
        "id,accountId,apiClientId,keyPrefix,name,active,expiresAt,lastUsedAt,updatedAt",

      webhooks:
        "id,accountId,name,active,lastTriggeredAt,updatedAt",

      webhookLogs:
        "id,accountId,webhookId,eventType,status,statusCode,deliveredAt,createdAt",

      integrationMappings:
        "id,accountId,integrationKey,localTable,localId,cloudId,externalId,updatedAt",

      auditLogs:
        "id,accountId,userId,action,entityType,entityId,schoolId,branchId,createdAt",

      backgroundJobs:
        "id,accountId,type,status,priority,scheduledAt,startedAt,completedAt,updatedAt",

      storageUsages:
        "id,accountId,lastCalculatedAt,updatedAt",

      accountFeatureFlags:
        "id,accountId,key,enabled,updatedAt",

      accountSystemSettings:
        "id,accountId,key,updatedAt",

      notificationDeliveryLogs:
        "id,accountId,channel,purpose,status,provider,providerReference,sentAt,deliveredAt,readAt,updatedAt",
    });
  }
}

export const db = new AppDB();

if (typeof window !== "undefined") {
  db.open().catch(err => {
    // Do not auto-delete the local database here.
    // This app is offline-first, so deleting IndexedDB can destroy unsynced school data.
    // If a true schema reset is needed, do it intentionally from a backup/recovery tool.
    console.error("DB INIT ERROR:", err);
  });
}
