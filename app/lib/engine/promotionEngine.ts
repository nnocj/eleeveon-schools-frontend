import { db, TermType } from "../db";
import { SyncStatus } from "../constants/syncStatus";

import {
  AcademicPeriod,
  AcademicStructure,
  Class,
  Student,
  Score,
  ReportCard,
  ReportCardItem,
  Assignment,
  Subject,
  Teacher,
  GradeRule,
  GradingSystem,
} from "../db";

// ======================================================
// HELPERS
// ======================================================

// Get system state (branch context + current period)
const getSystemState = async () => {
  const settings = await db.settings.toArray();
  return settings?.[0] || null;
};

// ======================================================
// PASS MARK (DYNAMIC, NOT FIXED 50)
// ======================================================
const getPassMark = async (branchId: number) => {
  const gradingSystem = await db.gradingSystems
    .where("branchId")
    .equals(branchId)
    .and((g) => g.default === true)
    .first();

  if (!gradingSystem) return 50;

  const rules = await db.gradeRules
    .where("gradingSystemId")
    .equals(gradingSystem.id!)
    .toArray();

  // Pass mark = lowest "pass" grade threshold
  const passRule = rules
    .filter((r) => r.grade.toLowerCase() !== "f")
    .sort((a, b) => a.minScore - b.minScore)[0];

  return passRule?.minScore ?? 50;
};

// ======================================================
// NEXT ACADEMIC PERIOD
// ======================================================
const getNextPeriod = async (
  branchId: number,
  academicStructureId: number,
  currentPeriodId: number
) => {
  const periods = await db.academicPeriods
    .where("branchId")
    .equals(branchId)
    .and((p) => p.academicStructureId === academicStructureId)
    .sortBy("order");

  const index = periods.findIndex((p) => p.id === currentPeriodId);

  return periods[index + 1] || null;
};

// ======================================================
// FIRST PERIOD (FOR NEW ACADEMIC YEAR)
// ======================================================
const getFirstPeriod = async (
  branchId: number,
  academicStructureId: number
) => {
  const periods = await db.academicPeriods
    .where("branchId")
    .equals(branchId)
    .and((p) => p.academicStructureId === academicStructureId)
    .sortBy("order");

  return periods[0] || null;
};

// ======================================================
// AVERAGE CALCULATION (SYSTEM-AWARE)
// ======================================================
const computeStudentAverage = (scores: Score[]) => {
  if (!scores.length) return 0;

  const total = scores.reduce((sum, s) => sum + (s.total || 0), 0);
  return total / scores.length;
};

// ======================================================
// SNAPSHOT REPORT CARDS (ADAPTED TO NEW MODEL)
// ======================================================
const snapshotReportCards = async (current: any) => {
  if (!current) return;

  const branchId = current.branchId;

  const [
    students,
    scores,
    subjects,
    teachers,
    assignments,
  ] = await Promise.all([
    db.students.where("branchId").equals(branchId).toArray(),
    db.scores.where("branchId").equals(branchId).toArray(),
    db.subjects.where("branchId").equals(branchId).toArray(),
    db.teachers.where("branchId").equals(branchId).toArray(),
    db.assignments.where("branchId").equals(branchId).toArray(),
  ]);

  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  const teacherMap = new Map(teachers.map((t) => [t.id, t.fullName]));
  const assignmentMap = new Map(
    assignments.map((a) => [`${a.classId}_${a.subjectId}`, a.teacherId])
  );

  await db.transaction(
    "rw",
    db.reportCards,
    db.reportCardItems,
    async () => {
      for (const student of students) {
        if (!student.id) continue;

        const studentScores = scores.filter(
          (s) =>
            s.studentId === student.id &&
            s.academicStructureId === current.currentAcademicStructureId &&
            s.academicPeriodId === current.currentAcademicPeriodId
        );

        const total = studentScores.reduce(
          (a, b) => a + (b.total || 0),
          0
        );

        const average = computeStudentAverage(studentScores);

        let reportCard = await db.reportCards
          .where("studentId")
          .equals(student.id)
          .and(
            (r) =>
              r.academicStructureId ===
                current.currentAcademicStructureId &&
              r.academicPeriodId === current.currentAcademicPeriodId
          )
          .first();

        let reportCardId: number;

        if (!reportCard?.id) {
          reportCardId = await db.reportCards.add({
            branchId,
            studentId: student.id,
            classId: student.currentClassId!,
            academicStructureId: current.currentAcademicStructureId,
            academicPeriodId: current.currentAcademicPeriodId,
            total,
            average,
            updatedAt: Date.now(),
            version: 1,
            deviceId: "local",
            synced: SyncStatus.PENDING,
            isDeleted: false,
          });
        } else {
          reportCardId = reportCard.id;

          await db.reportCards.update(reportCardId, {
            total,
            average,
            updatedAt: Date.now(),
            synced: SyncStatus.PENDING,
          });
        }

        for (const sc of studentScores) {
          const teacherId = assignmentMap.get(
            `${student.currentClassId}_${sc.subjectId}`
          );

          const existing = await db.reportCardItems
            .where("reportCardId")
            .equals(reportCardId)
            .and((i) => i.subjectId === sc.subjectId)
            .first();

          const payload: ReportCardItem = {
            branchId,
            reportCardId,
            studentId: student.id,
            classId: student.currentClassId!,
            academicStructureId:
              current.currentAcademicStructureId,
            academicPeriodId: current.currentAcademicPeriodId,

            subjectId: sc.subjectId,
            subjectName: subjectMap.get(sc.subjectId) || "Unknown",

            teacherId: teacherId ?? undefined,
            teacherName: teacherId
              ? teacherMap.get(teacherId) || "N/A"
              : "N/A",

            total: sc.total,
            average: sc.average,
            grade: sc.grade,
            remark: sc.remark,

            updatedAt: Date.now(),
            version: 1,
            deviceId: "local",
            synced: SyncStatus.PENDING,
            isDeleted: false,
          };

          if (existing?.id) {
            await db.reportCardItems.update(existing.id, payload);
          } else {
            await db.reportCardItems.add(payload);
          }
        }
      }
    }
  );
};

// ======================================================
// TERM / PERIOD PROMOTION
// ======================================================
export const processPeriodPromotion = async (current: any) => {
  if (!current) return;

  const next = await getNextPeriod(
    current.branchId,
    current.currentAcademicStructureId,
    current.currentAcademicPeriodId
  );

  if (!next) return;

  await snapshotReportCards(current);

  const students = await db.students
    .where("branchId")
    .equals(current.branchId)
    .toArray();

  await db.transaction("rw", db.students, db.settings, async () => {
    for (const s of students) {
      if (!s.id) continue;

      await db.students.update(s.id, {
        updatedAt: Date.now(),
      });
    }

    await db.settings.update(current.id!, {
      currentAcademicPeriodId: next.id!,
      updatedAt: Date.now(),
      synced: SyncStatus.PENDING,
    });
  });
};

// ======================================================
// YEAR / STRUCTURE PROMOTION
// ======================================================
export const processYearPromotion = async (
  current: any,
  overrides: Record<number, "promote" | "repeat" | "graduate"> = {},
  classSelections: Record<number, number> = {}
) => {
  if (!current) return;

  const [students, scores, classes, structures] =
    await Promise.all([
      db.students.where("branchId").equals(current.branchId).toArray(),
      db.scores.where("branchId").equals(current.branchId).toArray(),
      db.classes.where("branchId").equals(current.branchId).toArray(),
      db.academicStructures
        .where("branchId")
        .equals(current.branchId)
        .toArray(),
    ]);

  const newStructure = structures.find(
    (s) => s.id !== current.currentAcademicStructureId
  );

  const firstPeriod = newStructure
    ? await getFirstPeriod(current.branchId, newStructure.id!)
    : null;

  const passMark = await getPassMark(current.branchId);

  await snapshotReportCards(current);

  await db.transaction("rw", db.students, db.settings, async () => {
    for (const s of students) {
      if (!s.id) continue;

      const studentScores = scores.filter(
        (sc) =>
          sc.studentId === s.id &&
          sc.academicStructureId ===
            current.currentAcademicStructureId &&
          sc.academicPeriodId === current.currentAcademicPeriodId
      );

      const avg = computeStudentAverage(studentScores);

      let decision = overrides[s.id];

      if (!decision) {
        if (avg < passMark) decision = "repeat";
        else decision = "promote";
      }

      if (classSelections[s.id] !== undefined) {
        await db.students.update(s.id, {
          currentClassId: classSelections[s.id],
          updatedAt: Date.now(),
        });
        continue;
      }

      if (decision === "repeat") {
        await db.students.update(s.id, {
          updatedAt: Date.now(),
        });
      }

      if (decision === "promote") {
        await db.students.update(s.id, {
          currentClassId: classSelections[s.id] ?? s.currentClassId,
          updatedAt: Date.now(),
        });
      }

      if (decision === "graduate") {
        await db.students.update(s.id, {
          status: "graduated",
          updatedAt: Date.now(),
        });
      }
    }

    await db.settings.update(current.id!, {
      currentAcademicStructureId:
        newStructure?.id ?? current.currentAcademicStructureId,
      currentAcademicPeriodId:
        firstPeriod?.id ?? current.currentAcademicPeriodId,
      updatedAt: Date.now(),
      synced: SyncStatus.PENDING,
    });
  });
};

// ======================================================
// ENTRY POINT
// ======================================================
export const runAcademicEngine = async (
  overrides: Record<number, "promote" | "repeat" | "graduate"> = {},
  classSelections: Record<number, number> = {}
) => {
  const current = await getSystemState();
  if (!current) return;

  const isYearEnd =
    current.currentAcademicPeriodId === undefined;

  if (isYearEnd) {
    return processYearPromotion(
      current,
      overrides,
      classSelections
    );
  }

  return processPeriodPromotion(current);
};