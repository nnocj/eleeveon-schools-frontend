import Dexie, { Table } from "dexie";
import { SyncStatus } from "./constants/syncStatus";

// ======================================================
// GLOBAL TYPES
// ======================================================

export type Role =
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
  | "Semester 2";

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
// CORE (SCHOOL STRUCTURE)
// ======================================================

export interface School extends BaseSync {
  name: string;
  logo?: string;
  motto?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  photo?: string;
  bannerImage?: string;
  galleryImages?: string[];
}

export interface Branch extends BaseSync {
  schoolId: number;
  name: string;
  code?: string;
  logo?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  photo?: string;
  bannerImage?: string;
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
  bannerImage?: string;
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
  bannerImage?: string;
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
  gender?: string;
  age?: number;
  dateOfBirth?: string;
  photo?: string;
  coverPhoto?: string;
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
  gender?: string;
  age?: number;
  photo?: string;
  coverPhoto?: string;
  email?: string;
  phone?: string;
  relativePhone?: string;
  employmentDate?: string;
  salary?: number;
  role: "teacher" | "head_teacher" | "lecturer" | "principal";
  qualification?: string;
  signature?: string;
  active?: boolean;
}

export interface Parent extends BaseSync {
  schoolId: number;
  branchId: number;
  fullName: string;
  phone: string;
  photo?: string;
  coverPhoto?: string;
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
  bannerImage?: string;
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
  bannerImage?: string;
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
  bannerImage?: string;
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
  bannerImage?: string;
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
  bannerImage?: string;
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
  bannerImage?: string;

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
  bannerImage?: string;
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
  reportCardBackgroundImage?: string;
  reportCardWatermark?: string;
  reportCardSignatureImage?: string;

  dashboardHeroImage?: string;
  dashboardBannerImage?: string;
  studentPortalImage?: string;
  teacherPortalImage?: string;
  classroomPlaceholderImage?: string;
  subjectPlaceholderImage?: string;

  schoolGalleryImages?: string[];
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

  studentReportSnapshots!: Table<StudentReportSnapshot, number>;
  studentPromotions!: Table<StudentPromotion, number>;

  feeStructures!: Table<FeeStructure>;
  payments!: Table<Payment>;

  incomes!: Table<Income>;
  expenses!: Table<Expense>;

  schoolBranchSettings!: Table<SchoolBranchSetting>;

  constructor() {
    super("EleeveonDB");

    this.version(26).stores({
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
        "++id,cloudId,accountId,schoolId,branchId,currentClassId,admissionNumber,fullName,status,updatedAt",

      teachers:
        "++id,cloudId,accountId,schoolId,branchId,role,fullName,updatedAt",

      parents:
        "++id,cloudId,accountId,schoolId,branchId,phone,email,fullName",

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

      studentReportSnapshots:
        "++id,cloudId,accountId, schoolId, branchId, studentId, classId, academicStructureId, academicPeriodId, promotedToClassId, snapshotType, synced, isDeleted, updatedAt",

      studentPromotions:
        "++id,cloudId,accountId, schoolId, branchId, studentId, fromClassId, toClassId, fromAcademicStructureId, toAcademicStructureId, fromAcademicPeriodId, toAcademicPeriodId, average, recommendation, finalDecision, snapshotId, note",

      feeStructures:
        "++id,cloudId,accountId, schoolId, branchId,classId,academicPeriodId",

      payments:
        "++id,cloudId,accountId, schoolId, branchId,studentId,method,date",

      incomes:
        "++id,cloudId,accountId, schoolId, branchId,organizationId,title,date,amount,paymentMethod,updatedAt",

      expenses:
        "++id,cloudId, accountId,schoolId,branchId,organizationId,title,date,amount,expenseSourceType,paymentMethod,updatedAt",

      schoolBranchSettings:
        "++id,cloudId,accountId, schoolId, branchId, currentAcademicStructureId, currentAcademicPeriodId, synced, isDeleted, updatedAt",
    });
  }
}

export const db = new AppDB();

if (typeof window !== "undefined") {
  db.open().catch(async err => {
    console.error("DB INIT ERROR:", err);

    try {
      await db.delete();
      window.location.reload();
    } catch (deleteError) {
      console.error("DB DELETE ERROR:", deleteError);
    }
  });
}
