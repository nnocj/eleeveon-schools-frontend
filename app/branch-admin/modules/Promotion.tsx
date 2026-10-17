"use client";

/**
 * app/branch-admin/modules/Promotion.tsx
 * ELEEVEON SHARED PROMOTION ENGINE
 * Called by Students.tsx. Promotion history, full reusable report snapshots,
 * enrollment transitions and student updates are handled here exclusively.
 * Uses the same buildReportEngineOutput() used by the former Promotion Center.
 */
import { db, type Student, type StudentEnrollment, type StudentPromotion, type StudentReportSnapshot } from "../../lib/db/db";
import { createLocal, updateLocal } from "../../lib/sync/syncUtils";
import { buildReportEngineOutput } from "./reports/engine/report-engine";
import type { ReportEngineDataset, ReportFiltersState } from "./reports/engine/report-types";

export type PromotionDecision = "promote" | "repeat" | "graduate";
export interface StudentPromotionDraft {
  items: Array<{ id: string }>;
  decision: PromotionDecision;
  fromStructureId: string;
  fromPeriodId: string;
  toStructureId: string;
  toPeriodId: string;
  toClassId: string;
  note: string;
}
export interface PromotionRunRequest extends Omit<StudentPromotionDraft, "items"> {
  context: { accountId: string; schoolId: string; branchId: string };
  studentIds: string[];
  sourceClassId?: string;
}
export interface PromotionRunResult {
  processed: number;
  failed: number;
  errors: string[];
  snapshotIds: string[];
}
const id = (v: unknown) => String(v ?? "").trim();
const eq = (a: unknown, b: unknown) => !!id(a) && id(a) === id(b);
const date = () => new Date().toISOString().slice(0, 10);
const number = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const savedId = (v: unknown) => {
  if (typeof v === "string" || typeof v === "number") return id(v);
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    return id(r.id || r.localId || r.cloudId);
  }
  return "";
};
const isEligible = (student: Student) => !student.isDeleted && student.active !== false && !["graduated", "transferred", "withdrawn"].includes(id(student.status));

/** Every table is independently scoped; never let another branch enter report computation. */
async function loadPromotionDataset(context: PromotionRunRequest["context"]) {
  const tables = [
    "schools", "branches", "schoolBranchSettings", "academicStructures", "academicPeriods",
    "students", "teachers", "parents", "studentParents", "classes", "subjects",
    "classSubjects", "studentEnrollments", "classTeachers", "assessmentApplicabilities",
    "assessmentStructures", "assessmentStructureItems", "assessmentEntries", "gradingStructures",
    "gradeRules", "attendance", "studentAttendanceSummaries", "computedResults",
    "reportCards", "reportCardItems",
  ] as const;
  const values = await Promise.all(tables.map(async (table) => ((db as any)[table]?.toArray?.() ?? []) as any[]));
  const dataset: Record<string, any[]> = {};
  tables.forEach((table, i) => {
    dataset[table] = values[i].filter((row) =>
      !row.isDeleted && (!row.accountId || eq(row.accountId, context.accountId)) &&
      (!row.schoolId || eq(row.schoolId, context.schoolId)) &&
      (!row.branchId || eq(row.branchId, context.branchId)) &&
      (table !== "schools" || eq(row.id, context.schoolId)) &&
      (table !== "branches" || eq(row.id, context.branchId))
    );
  });
  return dataset as unknown as ReportEngineDataset;
}

function findById<T extends { id?: unknown }>(rows: T[] | undefined, wanted: string) {
  return rows?.find((row) => eq(row.id, wanted));
}

/** One call serves individual, class, and branch-grouped promotion requests. */
export async function processStudentPromotions(request: PromotionRunRequest): Promise<PromotionRunResult> {
  const { context, decision, fromStructureId, fromPeriodId, toStructureId, toPeriodId, toClassId, note, sourceClassId } = request;
  const { accountId, schoolId, branchId } = context;
  if (![accountId, schoolId, branchId, fromStructureId, fromPeriodId].every(Boolean)) throw new Error("Missing required workspace or source academic context.");
  const dataset = await loadPromotionDataset(context);
  const d = dataset as any;
  const sourcePeriod = findById(d.academicPeriods, fromPeriodId) as any;
  if (!sourcePeriod || !eq(sourcePeriod.academicStructureId, fromStructureId)) throw new Error("Source period does not belong to the selected academic structure.");
  if (decision !== "graduate") {
    const destinationPeriod = findById(d.academicPeriods, toPeriodId) as any;
    if (!destinationPeriod || !eq(destinationPeriod.academicStructureId, toStructureId)) throw new Error("Invalid destination academic structure or period.");
    if (!findById(d.classes, toClassId)) throw new Error("Destination class is not in the selected branch.");
    if (eq(fromStructureId, toStructureId) && eq(fromPeriodId, toPeriodId)) throw new Error("Use a different destination period for promotion or repetition.");
  }
  const enrollments = d.studentEnrollments as StudentEnrollment[];
  const students = d.students as Student[];
  const uniqueIds = [...new Set(request.studentIds.map(id).filter(Boolean))];
  if (!uniqueIds.length) throw new Error("No students were selected.");
  const result: PromotionRunResult = { processed: 0, failed: 0, errors: [], snapshotIds: [] };
  const reportCache = new Map<string, any>();
  const today = date();

  for (const studentId of uniqueIds) {
    const student = students.find((s) => eq(s.id, studentId));
    try {
      if (!student || !isEligible(student)) throw new Error("Student is not eligible in this workspace.");
      const matching = enrollments.filter((e) => !e.isDeleted && eq(e.studentId, studentId) && e.status === "active" &&
        eq(e.academicStructureId, fromStructureId) && eq(e.academicPeriodId, fromPeriodId) &&
        (!sourceClassId || eq(e.classId, sourceClassId)));
      if (matching.length !== 1 || !matching[0].id) throw new Error("Exactly one active source enrollment is required.");
      const source = matching[0];
      if (decision === "promote" && eq(source.classId, toClassId)) throw new Error("Promotion requires a different destination class.");
      if (decision === "repeat" && !eq(source.classId, toClassId)) throw new Error("Repeat must retain the source class.");
      const existingPromotions = (await db.studentPromotions.toArray()).filter((p: any) => !p.isDeleted &&
        eq(p.accountId, accountId) && eq(p.schoolId, schoolId) && eq(p.branchId, branchId) &&
        eq(p.studentId, studentId) && eq(p.fromClassId, source.classId) &&
        eq(p.fromAcademicStructureId, fromStructureId) && eq(p.fromAcademicPeriodId, fromPeriodId));
      if (existingPromotions.length) throw new Error("Promotion already processed for the source enrollment.");
      const liveEnrollments = (await db.studentEnrollments.toArray()).filter((e: any) => !e.isDeleted &&
        eq(e.studentId, studentId) && eq(e.accountId, accountId) && eq(e.schoolId, schoolId) && eq(e.branchId, branchId));
      const destination = decision === "graduate" ? undefined : liveEnrollments.find((e: any) =>
        eq(e.classId, toClassId) && eq(e.academicStructureId, toStructureId) && eq(e.academicPeriodId, toPeriodId));
      if (decision !== "graduate" && liveEnrollments.some((e: any) => e.status === "active" && !eq(e.id, source.id) &&
        !eq(e.id, destination?.id) && eq(e.academicStructureId, toStructureId) && eq(e.academicPeriodId, toPeriodId)))
        throw new Error("Another active destination-period enrollment exists.");

      // Compute the exact source-class report BEFORE changing any enrollment.
      const classId = id(source.classId);
      if (!reportCache.has(classId)) {
        const filters: ReportFiltersState = {
          branchId, academicStructureId: fromStructureId, academicPeriodId: fromPeriodId,
          classId, classSubjectId: undefined, studentId: undefined, sortMode: "position",
        };
        reportCache.set(classId, buildReportEngineOutput(dataset, filters));
      }
      const engine = reportCache.get(classId);
      const engineItem = (engine?.classReports || []).find((item: any) => eq(item?.report?.studentId, studentId));
      if (!engineItem?.report) throw new Error("Report engine has no complete source-period report for this student; snapshot was not fabricated.");
      const report = engineItem.report;
      const fromClass = findById(d.classes, classId) as any;
      const nextClass = findById(d.classes, toClassId) as any;
      const school = findById(d.schools, schoolId) as any;
      const branch = findById(d.branches, branchId) as any;
      const fromStructure = findById(d.academicStructures, fromStructureId) as any;
      const nextStructure = findById(d.academicStructures, toStructureId) as any;
      const nextPeriod = findById(d.academicPeriods, toPeriodId) as any;
      const setting = (d.schoolBranchSettings as any[]).find((row) => eq(row.branchId, branchId));
      const parentLink = (d.studentParents as any[]).find((row) => eq(row.studentId, studentId) && row.isPrimary && !row.isDeleted)
        || (d.studentParents as any[]).find((row) => eq(row.studentId, studentId) && !row.isDeleted);
      const parent = (d.parents as any[]).find((row) => eq(row.id, parentLink?.parentId));
      const classTeacherLink = (d.classTeachers as any[]).find((row) => eq(row.classId, classId) && !row.isDeleted);
      const classTeacher = (d.teachers as any[]).find((row) => eq(row.id, classTeacherLink?.teacherId));
      const headTeacher = (d.teachers as any[]).find((row) => ["head_teacher", "principal"].includes(row.role) && !row.isDeleted);
      const branding = { ...(engineItem.header?.branding || engine?.header?.branding || {}),
        schoolName: school?.name || "School Name", branchName: branch?.name || "",
        logo: setting?.logo || branch?.logo || school?.logo || "",
        address: branch?.address || school?.address || "", phone: branch?.phone || school?.phone || "",
        email: branch?.email || school?.email || "", primaryColor: setting?.primaryColor || "#2563eb",
      };
      const reportData = {
        generatedAt: new Date().toISOString(),
        header: { ...(engine?.header || {}), ...(engineItem.header || {}), school, branch,
          academicStructure: fromStructure, academicStructureName: fromStructure?.name,
          academicPeriod: sourcePeriod, academicPeriodName: sourcePeriod?.name,
          classData: fromClass, className: fromClass?.name || "", branding },
        branding,
        currentAcademicPeriod: sourcePeriod,
        nextAcademicPeriod: decision === "graduate" ? undefined : nextPeriod,
        student: { ...(engineItem.student || {}), ...student, name: student.fullName },
        studentInfo: { studentPhoto: student.photo || "", parentName: parent?.fullName || student.parentName || "",
          parentPhone: parent?.phone || student.parentPhone || "", parentEmail: parent?.email || student.parentEmail || "",
          numberOnRoll: enrollments.filter((e) => e.status === "active" && eq(e.classId, classId) &&
            eq(e.academicStructureId, fromStructureId) && eq(e.academicPeriodId, fromPeriodId)).length },
        signatures: { classTeacherName: classTeacher?.fullName || "", headTeacherName: headTeacher?.fullName || "",
          principalName: headTeacher?.fullName || "", parentName: parent?.fullName || student.parentName || "" },
        report: { ...report, studentId, total: number(report.total), average: number(report.average),
          overallPosition: report.overallPosition ?? report.position,
          subjectResults: Array.isArray(report.subjectResults) ? report.subjectResults : [] },
        promotion: { recommendation: decision, finalDecision: decision,
          fromClassId: classId, fromClassName: fromClass?.name, toClassId: decision === "graduate" ? undefined : toClassId,
          toClassName: decision === "graduate" ? undefined : nextClass?.name, fromAcademicStructureId: fromStructureId,
          fromAcademicStructureName: fromStructure?.name, toAcademicStructureId: decision === "graduate" ? undefined : toStructureId,
          toAcademicStructureName: decision === "graduate" ? undefined : nextStructure?.name,
          fromAcademicPeriodId: fromPeriodId, fromAcademicPeriodName: sourcePeriod?.name,
          toAcademicPeriodId: decision === "graduate" ? undefined : toPeriodId,
          toAcademicPeriodName: decision === "graduate" ? undefined : nextPeriod?.name, note: note.trim() || undefined },
        snapshotMeta: { source: "promotion", snapshotType: "promotion", academicYear: setting?.academicYear,
          term: setting?.currentTerm || sourcePeriod?.name, reportEngineVersion: "student-report-engine",
          savedAt: new Date().toISOString() },
      };
      const snapshotPayload = {
        accountId, schoolId, branchId, studentId, classId, academicStructureId: fromStructureId,
        academicPeriodId: fromPeriodId, academicYear: setting?.academicYear,
        term: setting?.currentTerm || sourcePeriod?.name, reportData,
        total: number(report.total), average: number(report.average),
        position: report.overallPosition ?? report.position,
        recommendation: decision, promotedToClassId: decision === "graduate" ? undefined : toClassId,
        snapshotType: "promotion",
      } as StudentReportSnapshot;
      // createLocal returns the real local ID; must not create an unlinked promotion.
      const snapshotReturn = await createLocal("studentReportSnapshots", snapshotPayload);
      const snapshotId = savedId(snapshotReturn);
      if (!snapshotId) throw new Error("Snapshot created, but its local ID was not returned; review the snapshot before retrying.");
      result.snapshotIds.push(snapshotId);
      // Promotion record is written before altering the student's source enrollment.
      await createLocal("studentPromotions", {
        accountId, schoolId, branchId, studentId,
        fromClassId: classId, toClassId: decision === "graduate" ? undefined : toClassId,
        fromAcademicStructureId: fromStructureId, toAcademicStructureId: decision === "graduate" ? undefined : toStructureId,
        fromAcademicPeriodId: fromPeriodId, toAcademicPeriodId: decision === "graduate" ? undefined : toPeriodId,
        average: number(report.average), recommendation: decision, finalDecision: decision,
        snapshotId, note: note.trim() || undefined,
      } as StudentPromotion);
      await updateLocal("studentEnrollments", id(source.id), {
        status: decision === "promote" ? "promoted" : "completed", endDate: today,
      } as Partial<StudentEnrollment>);
      if (decision !== "graduate") {
        if (destination?.id) await updateLocal("studentEnrollments", id(destination.id), {
          status: "active", endDate: undefined, isDeleted: false,
        } as Partial<StudentEnrollment>);
        else await createLocal("studentEnrollments", {
          accountId, schoolId, branchId, studentId, classId: toClassId,
          academicStructureId: toStructureId, academicPeriodId: toPeriodId,
          startDate: today, status: "active", isDeleted: false,
        } as StudentEnrollment);
      }
      await updateLocal("students", studentId, {
        currentClassId: decision === "graduate" ? null : toClassId,
        status: decision === "graduate" ? "graduated" : "active",
      } as unknown as Partial<Student>);
      result.processed++;
    } catch (error) {
      result.failed++;
      result.errors.push(`${student?.fullName || studentId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
