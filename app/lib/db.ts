import Dexie, { Table } from "dexie";
import { SyncStatus } from "./constants/syncStatus";

// ================= TYPES =================
export type Role = "admin" | "teacher" | "student";
export type TermType = "Term 1" | "Term 2" | "Term 3";
export type SystemMode = "active" | "locked" | "promotion";

// ================= BASE =================
export interface BaseSync {
  id?: number;
  updatedAt: number;
  version: number;
  deviceId: string;
  synced: SyncStatus;
  isDeleted?: boolean;
}

// ================= CORE ENTITIES =================
export interface Student extends BaseSync {
  fullName: string;
  age: number;
  parentName: string;
  parentPhone: string;
  classId: number;
  academicYear: string;
  term: TermType;
  status?: "active" | "graduated";
}

export interface Teacher extends BaseSync {
  fullName: string;
  age: number;
  email: string;
  phone: string;
  relativePhone: string;
  employmentDate: string;
  salary: number;
  role: "teacher" | "head_teacher";
  signature?: string;
}

export interface Class extends BaseSync {
  name: string;
}

export interface Subject extends BaseSync {
  name: string;
}

export interface Assignment extends BaseSync {
  teacherId: number;
  classId: number;
  subjectId: number;
}

// ================= SCORES =================
export interface Score extends BaseSync {
  studentId: number;
  subjectId: number;
  classTest: number;
  project: number;
  exam: number;
  ca: number;
  total: number;
  grade: string;
  academicYear: string;
  term: TermType;
}

// ================= ATTENDANCE =================
export interface Attendance extends BaseSync {
  studentId: number;
  classId: number;
  academicYear: string;
  term: TermType;
  date: string;
  status: "present" | "absent" | "late";
}

export interface TeacherAttendance extends BaseSync {
  teacherId: number;
  date: string;
  clockIn?: string;
  clockOut?: string;
}

// ================= REPORTS =================
export interface ReportCard extends BaseSync {
  studentId: number;
  classId: number;
  academicYear: string;
  term: TermType;
  total: number;
  average: number;
  position?: number;
}

export interface ReportCardItem extends BaseSync {
  reportCardId: number;

  studentId: number;
  classId: number;
  academicYear: string;
  term: TermType;

  subjectId: number;
  subjectName: string;

  teacherId?: number;
  teacherName?: string;

  classTest: number;
  project: number;
  exam: number;

  ca: number;
  total: number;
  grade: string;
}

// ================= FEES =================
export interface FeeStructure extends BaseSync {
  classId: number;
  academicYear: string;
  term: TermType;
  items: { name: string; amount: number }[];
}

export interface Payment extends BaseSync {
  studentId: number;
  amount: number;
  method: "cash" | "momo" | "bank";
  date: string;
  receiptNumber: string;
  academicYear: string;
  term: TermType;
  note?: string;
}

// ================= CLASS TEACHERS =================
export interface ClassTeacher extends BaseSync {
  classId: number;
  teacherId: number;
}

// ================= SETTINGS =================
export interface Setting extends BaseSync {
  currentTerm: TermType;
  academicYear: string;
  mode: "auto" | "manual";
  schoolName?: string;
  motto?: string;
  logo?: string;
  address?: string;
}

// ================= DATABASE =================
class AppDB extends Dexie {
  students!: Table<Student>;
  teachers!: Table<Teacher>;
  classes!: Table<Class>;
  subjects!: Table<Subject>;
  assignments!: Table<Assignment>;

  scores!: Table<Score>;

  attendance!: Table<Attendance>;
  teacherAttendance!: Table<TeacherAttendance>;

  reportCards!: Table<ReportCard>;
  reportCardItems!: Table<ReportCardItem>;

  feeStructures!: Table<FeeStructure>;
  payments!: Table<Payment>;

  classTeachers!: Table<ClassTeacher>;

  settings!: Table<Setting>;

  constructor() {
    super("EleeveonDB");

    this.version(17).stores({
      students: "++id, classId, academicYear, term",
      teachers: "++id, email, role",
      classes: "++id, name",
      subjects: "++id, name",
      assignments: "++id, teacherId, classId, subjectId",

      scores: "++id, studentId, subjectId, academicYear, term",

      attendance: "++id, studentId, classId, academicYear, term, date",
      teacherAttendance: "++id, teacherId, date",

      reportCards: "++id, studentId, academicYear, term",
      reportCardItems:
        "++id, reportCardId, studentId, classId, subjectId, academicYear, term",

      feeStructures: "++id, classId, academicYear, term",
      payments: "++id, studentId, academicYear, term, date",

      classTeachers: "++id, classId, teacherId",

      settings: "++id, academicYear, currentTerm",
    });

    this.on("blocked", () => {
      console.warn("⚠️ DB blocked by another tab");
    });

    this.on("versionchange", () => {
      console.warn("🔄 DB version changed — closing safely");
      this.close();
    });
  }
}

export const db = new AppDB();

// ================= SAFE INIT =================
(async () => {
  try {
    await db.open();
  } catch (err) {
    console.error("❌ DB INIT ERROR:", err);
    await db.delete();
    location.reload();
  }
})();