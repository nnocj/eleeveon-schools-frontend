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

export type SystemMode = "active" | "locked" | "promotion";

export type AcademicLevel =
  | "nursery"
  | "primary"
  | "junior_high"
  | "senior_high"
  | "tertiary";

export type AttendanceStatus = "present" | "absent" | "late";

export type PaymentMethod = "cash" | "momo" | "bank" | "card";

export type TransactionType = "income" | "expense";

export type CurriculumSubjectType = "core" | "elective" | "optional";

export type DeliveryMode = "physical" | "online" | "hybrid";

// ======================================================
// BASE SYNC
// ======================================================

export interface BaseSync {
  id?: number;
  createdAt?: number;
  updatedAt: number;
  version: number;
  deviceId: string;
  synced: SyncStatus;
  isDeleted?: boolean;
}

// ======================================================
// CORE STRUCTURE
// ======================================================

export interface School extends BaseSync {
  name: string;
  logo?: string;
  motto?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
}

export interface Branch extends BaseSync {
  schoolId: number;
  name: string;
  code?: string;
  city?: string;
  active?: boolean;
}

export interface AcademicStructure extends BaseSync {
  branchId: number;
  name: string;
  level: AcademicLevel;
  startDate: string;
  endDate: string;
  active?: boolean;
}

export interface AcademicPeriod extends BaseSync {
  branchId: number;
  academicStructureId: number;
  name: string;
  type?: TermType;
  startDate: string;
  endDate: string;
  order: number;
  active?: boolean;
}

export interface Organization extends BaseSync {
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
  active?: boolean;
}

// ======================================================
// PEOPLE
// ======================================================

export interface Student extends BaseSync {
  branchId: number;
  organizationId?: number;
  currentClassId?: number;
  admissionNumber?: string;
  fullName: string;
  status?: "active" | "graduated" | "transferred" | "withdrawn";
}

export interface Teacher extends BaseSync {
  branchId: number;
  fullName: string;
  role: "teacher" | "head_teacher" | "lecturer" | "principal";
  active?: boolean;
}

export interface Parent extends BaseSync {
  branchId: number;
  fullName: string;
  phone: string;
  email?: string;
}

// ======================================================
// CLASS = UNIVERSAL LEARNING UNIT (SCHOOL OR UNIVERSITY)
// ======================================================

export interface Class extends BaseSync {
  branchId: number;
  academicStructureId: number;
  organizationId?: number;

  name: string;          // e.g. "Basic 6", "BSc Computer Science Year 2"
  code?: string;

  level?: string;        // optional descriptor
  capacity?: number;

  active?: boolean;
}

// ======================================================
// CURRICULUM LAYER
// ======================================================

export interface Subject extends BaseSync {
  branchId: number;
  name: string;
  code?: string;
  category?: "academic" | "technical" | "vocational" | "elective" | "core";
  active?: boolean;
}

export interface Curriculum extends BaseSync {
  branchId: number;
  name: string;
  academicStructureId: number;
  active?: boolean;
}

export interface CurriculumSubject extends BaseSync {
  branchId: number;
  curriculumId: number;
  subjectId: number;
  classId?: number;
  academicPeriodId?: number;

  type?: CurriculumSubjectType;
  orderIndex?: number;
  minimumPassScore?: number;

  active?: boolean;
}

// ======================================================
// STUDENT CLASS ENROLLMENT (RENAMED + CLEANED)
// ======================================================

export interface StudentClassEnrollment extends BaseSync {
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
// 🔥 SINGLE SUBJECT ENGINE (CORE LOGIC)
// ======================================================

export interface AcademicSubjectContext extends BaseSync {
  branchId: number;

  curriculumSubjectId: number;

  classId: number;
  subjectId: number;
  academicPeriodId: number;

  organizationId?: number;

  credits?: number;
  type?: CurriculumSubjectType;
  orderIndex?: number;
  minimumPassScore?: number;

  assessmentStructureId: number;
  gradingSystemId?: number;

  active: boolean;
  locked?: boolean;

  isElective?: boolean;
  groupCode?: string;
}

// ======================================================
// GRADING SYSTEM
// ======================================================

export interface GradingSystem extends BaseSync {
  branchId: number;
  name: string;
  type: "percentage" | "gpa" | "competency" | "custom";
  active?: boolean;
}

export interface GradeRule extends BaseSync {
  branchId: number;
  gradingSystemId: number;
  minScore: number;
  maxScore: number;
  grade: string;
  order: number;
}

// ======================================================
// ASSESSMENT
// ======================================================

export interface AssessmentStructure extends BaseSync {
  branchId: number;
  name: string;
  totalScore?: number;
}

export interface AssessmentStructureItem extends BaseSync {
  branchId: number;
  assessmentStructureId: number;
  name: string;
  weight: number;
  maxScore: number;
  order: number;
}

// ======================================================
// EXECUTION
// ======================================================

export interface AssessmentComponent extends BaseSync {
  branchId: number;
  classId: number;
  subjectId: number;
  academicPeriodId: number;
  assessmentStructureId: number;
  active: boolean;
}

export interface AssessmentEntry extends BaseSync {
  branchId: number;
  studentId: number;
  classId: number;
  subjectId: number;
  academicPeriodId: number;
  assessmentStructureItemId: number;
  score: number;
  grade?: string;
}

// ======================================================
// RESULTS
// ======================================================

export interface ComputedResult extends BaseSync {
  branchId: number;
  studentId: number;
  classId: number;
  subjectId: number;
  academicPeriodId: number;
  total: number;
  average?: number;
  grade: string;
}

// ======================================================
// ATTENDANCE
// ======================================================

export interface Attendance extends BaseSync {
  branchId: number;
  studentId: number;
  classId: number;
  academicPeriodId: number;
  date: string;
  status: AttendanceStatus;
}

// ======================================================
// REPORTING
// ======================================================

export interface ReportCard extends BaseSync {
  branchId: number;
  studentId: number;
  classId: number;
  academicPeriodId: number;
  total: number;
  average: number;
}

export interface ReportCardItem extends BaseSync {
  branchId: number;
  reportCardId: number;
  subjectId: number;
  subjectName: string;
  total: number;
  grade: string;
}

// ======================================================
// FINANCE
// ======================================================

export interface Payment extends BaseSync {
  branchId: number;
  studentId: number;
  amount: number;
  method: PaymentMethod;
  date: string;
}

// ======================================================
// SETTINGS
// ======================================================

export interface Setting extends BaseSync {
  branchId?: number;
  currentAcademicStructureId?: number;
  currentAcademicPeriodId?: number;
  mode: "auto" | "manual";
  theme?: "light" | "dark";
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

  classes!: Table<Class>;
  subjects!: Table<Subject>;
  curriculums!: Table<Curriculum>;
  curriculumSubjects!: Table<CurriculumSubject>;

  studentClassEnrollments!: Table<StudentClassEnrollment>;

  academicSubjectContexts!: Table<AcademicSubjectContext>;

  gradingSystems!: Table<GradingSystem>;
  gradeRules!: Table<GradeRule>;

  assessmentStructures!: Table<AssessmentStructure>;
  assessmentStructureItems!: Table<AssessmentStructureItem>;

  assessmentComponents!: Table<AssessmentComponent>;
  assessmentEntries!: Table<AssessmentEntry>;
  computedResults!: Table<ComputedResult>;

  attendance!: Table<Attendance>;

  reportCards!: Table<ReportCard>;
  reportCardItems!: Table<ReportCardItem>;

  payments!: Table<Payment>;
  settings!: Table<Setting>;

  constructor() {
    super("EleeveonDB");

    this.version(26).stores({
      schools: "++id,name,updatedAt",
      branches: "++id,schoolId,name,updatedAt",

      academicStructures: "++id,branchId,level",
      academicPeriods: "++id,branchId,academicStructureId,order",

      organizations: "++id,branchId,type,parentOrganizationId",

      students: "++id,branchId,currentClassId,admissionNumber,fullName,status",
      teachers: "++id,branchId,role,fullName",

      classes: "++id,branchId,academicStructureId,name",
      subjects: "++id,branchId,name,code",

      curriculums: "++id,branchId,name,academicStructureId",
      curriculumSubjects: "++id,branchId,curriculumId,subjectId,classId,academicPeriodId",

      studentClassEnrollments:
        "++id,branchId,studentId,classId,academicPeriodId,status",

      academicSubjectContexts:
        "++id,branchId,curriculumSubjectId,classId,subjectId,academicPeriodId,active",

      gradingSystems: "++id,branchId,name,type",
      gradeRules: "++id,branchId,gradingSystemId,minScore,maxScore",

      assessmentStructures: "++id,branchId,name",
      assessmentStructureItems: "++id,branchId,assessmentStructureId,order",

      assessmentComponents:
        "++id,branchId,classId,subjectId,academicPeriodId",

      assessmentEntries:
        "++id,branchId,studentId,classId,subjectId,academicPeriodId",

      computedResults:
        "++id,branchId,studentId,classId,subjectId,academicPeriodId",

      attendance:
        "++id,branchId,studentId,classId,academicPeriodId,date",

      reportCards:
        "++id,branchId,studentId,classId,academicPeriodId",

      reportCardItems:
        "++id,branchId,reportCardId,subjectId",

      payments: "++id,branchId,studentId,method,date",

      settings: "++id,branchId",
    });
  }
}

export const db = new AppDB();

(async () => {
  try {
    await db.open();
  } catch (err) {
    console.error("DB INIT ERROR:", err);
    await db.delete();
    location.reload();
  }
})();