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

// ======================================================
// BASE SYNC MODEL
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
// SCHOOLS
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

// ======================================================
// BRANCHES
// ======================================================

export interface Branch extends BaseSync {
  schoolId: number;

  name: string;
  code?: string;

  logo?: string;

  phone?: string;
  email?: string;

  address?: string;
  city?: string;

  active?: boolean;
}

// ======================================================
// ACADEMIC STRUCTURE
// ======================================================

export interface AcademicStructure extends BaseSync {
  branchId: number;

  name: string;

  level: AcademicLevel;

  startDate: string;
  endDate: string;

  active?: boolean;
}

// ======================================================
// ACADEMIC PERIODS
// ======================================================

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

// ======================================================
// ORGANIZATIONS
// ======================================================

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

  description?: string;
}

// ======================================================
// CLASSES
// ======================================================

export interface Class extends BaseSync {
  branchId: number;

  academicStructureId: number;

  organizationId?: number;

  name: string;

  code?: string;

  level?: string;

  photo?: string;

  capacity?: number;

  active?: boolean;
}

// ======================================================
// STUDENTS
// ======================================================

export interface Student extends BaseSync {
  branchId: number;

  organizationId?: number;

  currentClassId?: number;

  admissionNumber?: string;

  fullName: string;

  gender?: string;

  age?: number;

  dateOfBirth?: string;

  photo?: string;

  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;

  address?: string;

  status?:
    | "active"
    | "graduated"
    | "transferred"
    | "withdrawn";
}

// ======================================================
// TEACHERS
// ======================================================

export interface Teacher extends BaseSync {
  branchId: number;

  organizationId?: number;

  fullName: string;

  gender?: string;
  age?: number;

  photo?: string;

  email?: string;
  phone?: string;

  relativePhone?: string;

  employmentDate?: string;

  salary?: number;

  role:
    | "teacher"
    | "head_teacher"
    | "lecturer"
    | "principal";

  qualification?: string;

  signature?: string;

  active?: boolean;
}

// ======================================================
// PARENTS
// ======================================================

export interface Parent extends BaseSync {
  branchId: number;

  fullName: string;

  phone: string;

  email?: string;

  address?: string;

  occupation?: string;

  emergencyContact?: string;

  relationship?:
    | "father"
    | "mother"
    | "guardian";
}

// ======================================================
// STUDENT PARENT RELATION
// ======================================================

export interface StudentParent extends BaseSync {
  branchId: number;

  studentId: number;

  parentId: number;

  relationship:
    | "father"
    | "mother"
    | "guardian"
    | "other";

  isPrimary?: boolean;
}

// ======================================================
// SUBJECTS
// ======================================================

export interface Subject extends BaseSync {
  branchId: number;

  organizationId?: number;

  name: string;

  code?: string;

  photo?: string;

  classIds?: number[];

  active?: boolean;
}

// ======================================================
// SUBJECT OFFERINGS
// ======================================================

export interface SubjectOffering extends BaseSync {
  branchId: number;

  subjectId: number;

  classId: number;

  academicStructureId: number;

  teacherId?: number;

  compulsory?: boolean;

  active?: boolean;
}

// ======================================================
// ASSIGNMENTS
// ======================================================

export interface Assignment extends BaseSync {
  branchId: number;

  teacherId: number;

  classId: number;

  subjectId: number;
}

// ======================================================
// CLASS TEACHERS
// ======================================================

export interface ClassTeacher extends BaseSync {
  branchId: number;

  classId: number;

  teacherId: number;
}

// ======================================================
// STUDENT ENROLLMENT
// ======================================================

export interface StudentEnrollment extends BaseSync {
  branchId: number;

  studentId: number;

  classId: number;

  academicStructureId: number;

  academicPeriodId: number;

  startDate: string;

  endDate?: string;

  status:
    | "active"
    | "completed"
    | "promoted"
    | "withdrawn";
}

// ======================================================
// GRADING SYSTEMS
// ======================================================

export type GradingSystemType =
  | "percentage"
  | "gpa"
  | "competency"
  | "custom";

export interface GradingSystem extends BaseSync {
  branchId: number;

  organizationId?: number;

  name: string;

  type: GradingSystemType;

  description?: string;

  active?: boolean;

  default?: boolean;

  locked?: boolean;
}

// ======================================================
// GRADE RULES
// ======================================================

export interface GradeRule extends BaseSync {
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

// ======================================================
// ASSESSMENT STRUCTURES
// ======================================================

export interface AssessmentStructure extends BaseSync {
  branchId: number;

  organizationId?: number;

  academicStructureId: number; // 🔥 ADD THIS

  name: string;

  description?: string;

  totalScore?: number;

  active?: boolean;

  locked?: boolean;
}

// ======================================================
// ASSESSMENT STRUCTURE ITEMS
// ======================================================

export interface AssessmentStructureItem extends BaseSync {
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
// ASSESSMENT APPLICABILITY
// ======================================================

export interface AssessmentApplicability extends BaseSync {
  branchId: number;

  organizationId?: number;

  academicStructureId?: number;

  classId?: number;

  subjectId?: number;

  gradingSystemId?: number;

  assessmentStructureId?: number;

  active?: boolean;
}

// ======================================================
// ASSESSMENT COMPONENT
// LINKS CONFIGURATION → REAL USAGE
// ======================================================

export interface AssessmentComponent extends BaseSync {
  branchId: number;

  organizationId?: number;

  classId: number;

  subjectId: number;

  academicPeriodId: number;

  assessmentStructureId: number;

  gradingSystemId?: number;

  active: boolean;
}

// ======================================================
// ASSESSMENT ENTRY
// TEACHER MARK INPUT
// ======================================================

export interface AssessmentEntry extends BaseSync {
  schoolId?: number;

  branchId: number;

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

// ======================================================
// COMPUTED RESULTS
// ======================================================

export interface ComputedResult extends BaseSync {
  branchId: number;

  organizationId?: number;

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
// ASSESSMENTS
// ======================================================

export interface Assessment extends BaseSync {
  branchId: number;

  studentId: number;

  classId: number;

  subjectId: number;

  academicStructureId: number;

  academicPeriodId: number;

  componentId: number;

  score: number;

  maxScore: number;
}

// ======================================================
// SCORES
// ======================================================

export interface Score extends BaseSync {
  branchId: number;

  studentId: number;

  classId: number;

  subjectId: number;

  academicStructureId: number;

  academicPeriodId: number;

  total: number;

  average?: number;

  grade: string;

  remark?: string;
}

// ======================================================
// ATTENDANCE
// ======================================================

export interface Attendance extends BaseSync {
  branchId: number;

  studentId: number;

  classId: number;

  academicStructureId: number;

  academicPeriodId: number;

  date: string;

  status: AttendanceStatus;
}

// ======================================================
// TEACHER ATTENDANCE
// ======================================================

export interface TeacherAttendance extends BaseSync {
  branchId: number;

  teacherId: number;

  date: string;

  clockIn?: string;

  clockOut?: string;
}

// ======================================================
// REPORT CARDS
// ======================================================

export interface ReportCard extends BaseSync {
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

// ======================================================
// REPORT CARD ITEMS
// ======================================================

export interface ReportCardItem extends BaseSync {
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
// FEE STRUCTURES
// ======================================================

export interface FeeStructure extends BaseSync {
  branchId: number;

  classId?: number;

  academicStructureId: number;

  academicPeriodId: number;

  items: {
    name: string;
    amount: number;
  }[];
}

// ======================================================
// PAYMENTS
// ======================================================

export interface Payment extends BaseSync {
  branchId: number;

  studentId: number;

  amount: number;

  method: PaymentMethod;

  date: string;

  receiptNumber?: string;

  note?: string;
}

// ======================================================
// INCOME
// ======================================================

export type IncomeSourceType =
  | "student"
  | "parent"
  | "teacher"
  | "school_fee"
  | "organization"
  | "event"
  | "donation"
  | "external"
  | "salary_recovery"
  | "pta"
  | "transport"
  | "admission"
  | "uniform"
  | "book_sale"
  | "canteen"
  | "boarding"
  | "system"
  | "other";

export interface Income extends BaseSync {
  branchId: number;

  organizationId?: number;

  title: string;

  category?: string;

  amount: number;

  method?: PaymentMethod;

  date: string;

  note?: string;

  sourceType?: IncomeSourceType;

  studentId?: number;

  parentId?: number;

  teacherId?: number;

  classId?: number;

  academicStructureId?: number;

  academicPeriodId?: number;

  feeStructureId?: number;

  paymentId?: number;

  externalSource?: string;

  externalContact?: string;

  receiptNumber?: string;

  transactionId?: string;

  referenceNumber?: string;

  autoGenerated?: boolean;

  syncedFromPayment?: boolean;

  status?:
    | "pending"
    | "completed"
    | "cancelled"
    | "refunded";
}

// ======================================================
// EXPENSES
// ======================================================

export type ExpenseSourceType =
  | "salary"
  | "maintenance"
  | "utility"
  | "transport"
  | "fuel"
  | "feeding"
  | "canteen"
  | "event"
  | "academic"
  | "sports"
  | "library"
  | "laboratory"
  | "uniform"
  | "bookshop"
  | "boarding"
  | "pta"
  | "tax"
  | "donation"
  | "refund"
  | "procurement"
  | "repair"
  | "technology"
  | "internet"
  | "security"
  | "cleaning"
  | "marketing"
  | "admission"
  | "construction"
  | "health"
  | "staff_welfare"
  | "training"
  | "external"
  | "other";

export interface Expense extends BaseSync {
  branchId: number;

  organizationId?: number;

  title: string;

  category?: string;

  amount: number;

  method?: PaymentMethod;

  date: string;

  note?: string;

  sourceType?: ExpenseSourceType;

  classId?: number;

  studentId?: number;

  parentId?: number;

  teacherId?: number;

  academicStructureId?: number;

  academicPeriodId?: number;

  subjectId?: number;

  approvedBy?: number;

  requestedBy?: number;

  paidBy?: number;

  vendor?: string;

  vendorContact?: string;

  vendorAddress?: string;

  receiptNumber?: string;

  invoiceNumber?: string;

  transactionId?: string;

  referenceNumber?: string;

  department?: string;

  destination?: string;

  expenseLocation?: string;

  eventName?: string;

  projectName?: string;

  recurring?: boolean;

  autoGenerated?: boolean;

  reimbursable?: boolean;

  refunded?: boolean;

  status?:
    | "pending"
    | "approved"
    | "paid"
    | "cancelled"
    | "rejected"
    | "refunded";
}

// ======================================================
// SETTINGS
// ======================================================

export interface Setting extends BaseSync {
  schoolId?: number;

  branchId?: number;

  currentAcademicStructureId?: number;

  currentAcademicPeriodId?: number;

  mode: "auto" | "manual";

  schoolName?: string;

  motto?: string;

  logo?: string;

  address?: string;

  fontFamily?: string;

  primaryColor?: string;

  theme?: "light" | "dark";
}

// ======================================================
// DATABASE
// ======================================================

class AppDB extends Dexie {
  // ======================================================
  // CORE
  // ======================================================

  schools!: Table<School>;
  branches!: Table<Branch>;

  academicStructures!: Table<AcademicStructure>;
  academicPeriods!: Table<AcademicPeriod>;

  organizations!: Table<Organization>;

  // ======================================================
  // PEOPLE
  // ======================================================

  students!: Table<Student>;
  teachers!: Table<Teacher>;

  parents!: Table<Parent>;
  studentParents!: Table<StudentParent>;

  // ======================================================
  // ACADEMICS
  // ======================================================

  classes!: Table<Class>;

  subjects!: Table<Subject>;

  subjectOfferings!: Table<SubjectOffering>;

  assignments!: Table<Assignment>;

  classTeachers!: Table<ClassTeacher>;

  studentEnrollments!: Table<StudentEnrollment>;

  // ======================================================
  // GRADING / ASSESSMENT
  // ======================================================

  gradingSystems!: Table<GradingSystem>;

  gradeRules!: Table<GradeRule>;

  assessmentStructures!: Table<AssessmentStructure>;

  assessmentStructureItems!: Table<AssessmentStructureItem>;

  assessmentApplicabilities!: Table<AssessmentApplicability>;

  assessmentComponents!: Table<AssessmentComponent>;

  assessmentEntries!: Table<AssessmentEntry>;

  computedResults!: Table<ComputedResult>;

  assessments!: Table<Assessment>;

  scores!: Table<Score>;

  // ======================================================
  // ATTENDANCE
  // ======================================================

  attendance!: Table<Attendance>;

  teacherAttendance!: Table<TeacherAttendance>;

  // ======================================================
  // REPORTS
  // ======================================================

  reportCards!: Table<ReportCard>;

  reportCardItems!: Table<ReportCardItem>;

  // ======================================================
  // FINANCE
  // ======================================================

  feeStructures!: Table<FeeStructure>;

  payments!: Table<Payment>;

  incomes!: Table<Income>;

  expenses!: Table<Expense>;

  // ======================================================
  // SETTINGS
  // ======================================================

  settings!: Table<Setting>;

  constructor() {
    super("EleeveonDB");

    this.version(23).stores({
      // ======================================================
      // CORE
      // ======================================================

      schools: `
        ++id,
        name,
        updatedAt
      `,

      branches: `
        ++id,
        schoolId,
        name,
        updatedAt
      `,

      academicStructures: `
        ++id,
        branchId,
        level,
        updatedAt
      `,

      academicPeriods: `
        ++id,
        branchId,
        academicStructureId,
        order,
        updatedAt
      `,

      organizations: `
        ++id,
        branchId,
        parentOrganizationId,
        type
      `,

      // ======================================================
      // PEOPLE
      // ======================================================

      students: `
        ++id,
        branchId,
        currentClassId,
        admissionNumber,
        fullName,
        status,
        updatedAt
      `,

      teachers: `
        ++id,
        branchId,
        role,
        fullName,
        updatedAt
      `,

      parents: `
        ++id,
        branchId,
        phone,
        email,
        fullName
      `,

      studentParents: `
        ++id,
        branchId,
        studentId,
        parentId
      `,

      // ======================================================
      // ACADEMICS
      // ======================================================

      classes: `
        ++id,
        branchId,
        academicStructureId,
        name,
        updatedAt
      `,

      subjects: `
        ++id,
        branchId,
        name,
        updatedAt
      `,

      subjectOfferings: `
        ++id,
        branchId,
        subjectId,
        classId,
        academicStructureId,
        teacherId,
        compulsory,
        active
      `,

      assignments: `
        ++id,
        branchId,
        teacherId,
        classId,
        subjectId
      `,

      classTeachers: `
        ++id,
        branchId,
        classId,
        teacherId
      `,

      studentEnrollments: `
        ++id,
        branchId,
        studentId,
        classId,
        academicStructureId,
        academicPeriodId,
        status,
        updatedAt
      `,

      // ======================================================
      // GRADING SYSTEMS
      // ======================================================

      gradingSystems: `
        ++id,
        branchId,
        organizationId,
        name,
        type,
        active,
        default,
        updatedAt
      `,

      gradeRules: `
        ++id,
        branchId,
        gradingSystemId,
        minScore,
        maxScore,
        grade,
        gpa,
        order,
        active,
        updatedAt
      `,

      assessmentStructures: `
        ++id,
        branchId,
        organizationId,
        name,
        active,
        updatedAt
      `,

      assessmentStructureItems: `
        ++id,
        branchId,
        assessmentStructureId,
        order,
        weight,
        compulsory,
        active,
        updatedAt
      `,

      assessmentApplicabilities: `
        ++id,
        branchId,
        organizationId,
        academicStructureId,
        classId,
        subjectId,
        gradingSystemId,
        assessmentStructureId,
        active,
        updatedAt
      `,

      assessmentComponents: `
        ++id,
        branchId,
        organizationId,
        classId,
        subjectId,
        academicPeriodId,
        assessmentStructureId,
        gradingSystemId,
        active,
        updatedAt
      `,

      assessmentEntries: `
        ++id,
        schoolId,
        branchId,
        organizationId,
        academicStructureId,
        academicPeriodId,
        gradingSystemId,
        assessmentStructureId,
        assessmentStructureItemId,
        studentId,
        classId,
        subjectId,
        score,
        grade,
        published,
        locked,
        active,
        updatedAt
      `,

      computedResults: `
        ++id,
        branchId,
        organizationId,
        studentId,
        classId,
        subjectId,
        academicStructureId,
        academicPeriodId,
        gradingSystemId,
        grade,
        gpa,
        position,
        published,
        locked,
        updatedAt
      `,

      assessments: `
        ++id,
        branchId,
        studentId,
        classId,
        subjectId,
        academicPeriodId,
        componentId
      `,

      scores: `
        ++id,
        branchId,
        studentId,
       subjectId,
        classId,
        academicPeriodId
      `,

      // ======================================================
      // ATTENDANCE
      // ======================================================

      attendance: `
        ++id,
        branchId,
        studentId,
        classId,
        academicPeriodId,
        date
      `,

      teacherAttendance: `
        ++id,
        branchId,
        teacherId,
        date
      `,

      // ======================================================
      // REPORTS
      // ======================================================

      reportCards: `
        ++id,
        branchId,
        studentId,
        classId,
        academicPeriodId
      `,

      reportCardItems: `
        ++id,
        branchId,
        reportCardId,
        subjectId,
        academicPeriodId
      `,

      // ======================================================
      // FINANCE
      // ======================================================

      feeStructures: `
        ++id,
        branchId,
        classId,
        academicStructureId,
        academicPeriodId
      `,

      payments: `
        ++id,
        branchId,
        studentId,
        method,
        date
      `,

      incomes: `
        ++id,
        branchId,
        organizationId,
        sourceType,
        category,
        studentId,
        parentId,
        teacherId,
        classId,
        academicStructureId,
        academicPeriodId,
        feeStructureId,
        paymentId,
        method,
        externalSource,
        receiptNumber,
        transactionId,
        status,
        date,
        updatedAt
      `,

      expenses: `
        ++id,
        branchId,
        organizationId,
        sourceType,
        category,
        classId,
        studentId,
        parentId,
        teacherId,
        academicStructureId,
        academicPeriodId,
        subjectId,
        approvedBy,
        requestedBy,
        paidBy,
        vendor,
        department,
        expenseLocation,
        eventName,
        projectName,
        method,
        receiptNumber,
        invoiceNumber,
        transactionId,
        status,
        refunded,
        recurring,
        date,
        updatedAt
      `,

      // ======================================================
      // SETTINGS
      // ======================================================

      settings: `
        ++id,
        schoolId,
        branchId
      `,
    });
  }
}

// ======================================================
// EXPORT DATABASE
// ======================================================

export const db = new AppDB();

// ======================================================
// SAFE DATABASE INIT
// ======================================================

(async () => {
  try {
    await db.open();
  } catch (err) {
    console.error("DB INIT ERROR:", err);

    await db.delete();

    location.reload();
  }
})();