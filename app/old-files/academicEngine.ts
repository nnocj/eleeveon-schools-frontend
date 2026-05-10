/*import { db, TermType } from "../db";
import { SyncStatus } from "../constants/syncStatus";
import {
  TERMS,
  getAverage,
  nextAcademicYear,
  buildNextClassMap,
} from "../calculations/promotion";

const PASS_MARK = 50;

// ================= SYSTEM STATE (SINGLE SOURCE OF TRUTH) =================
const getSystemState = async () => {
  const settings = await db.settings.toArray();
  return settings?.[0] || null;
};

// ================= SNAPSHOT =================
const snapshotReportCards = async (current: any) => {
  if (!current) return;

  const [students, scores, subjects, teachers, assignments] =
    await Promise.all([
      db.students.toArray(),
      db.scores.toArray(),
      db.subjects.toArray(),
      db.teachers.toArray(),
      db.assignments.toArray(),
    ]);

  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  const teacherMap = new Map(teachers.map((t) => [t.id, t.fullName]));
  const assignmentMap = new Map(
    assignments.map((a) => [`${a.classId}_${a.subjectId}`, a.teacherId])
  );

  await db.transaction("rw", db.reportCards, db.reportCardItems, async () => {
    for (const student of students) {
      if (!student.id) continue;

      const studentScores = scores.filter(
        (s) =>
          s.studentId === student.id &&
          s.academicYear === current.academicYear &&
          s.term === current.currentTerm
      );

      const total = studentScores.reduce((a, b) => a + (b.total || 0), 0);
      const average =
        studentScores.length > 0 ? total / studentScores.length : 0;

      let reportCard = await db.reportCards
        .where("studentId")
        .equals(student.id)
        .filter(
          (r) =>
            r.academicYear === current.academicYear &&
            r.term === current.currentTerm
        )
        .first();

      let reportCardId: number;

      if (!reportCard?.id) {
        reportCardId = await db.reportCards.add({
          studentId: student.id,
          classId: student.classId,
          academicYear: current.academicYear,
          term: current.currentTerm,
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
          `${student.classId}_${sc.subjectId}`
        );

        const existing = await db.reportCardItems
          .where("reportCardId")
          .equals(reportCardId)
          .and((i) => i.subjectId === sc.subjectId)
          .first();

        const payload = {
          reportCardId,
          studentId: student.id,
          classId: student.classId,
          academicYear: current.academicYear,
          term: current.currentTerm,

          subjectId: sc.subjectId,
          subjectName: subjectMap.get(sc.subjectId) || "Unknown",

          teacherId: teacherId ?? undefined,
          teacherName: teacherId
            ? teacherMap.get(teacherId) || "N/A"
            : "N/A",

          classTest: sc.classTest,
          project: sc.project,
          exam: sc.exam,
          ca: sc.ca,
          total: sc.total,
          grade: sc.grade,

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
  });
};

// ================= TERM PROMOTION =================
export const processTermPromotion = async (current: any) => {
  if (!current) return;

  const nextIndex = TERMS.indexOf(current.currentTerm as TermType) + 1;
  const nextTerm = TERMS[nextIndex];

  if (!nextTerm) return;

  await snapshotReportCards(current);

  const students = await db.students.toArray();

  await db.transaction("rw", db.students, db.settings, async () => {
    for (const s of students) {
      if (!s.id) continue;

      await db.students.update(s.id, {
        term: nextTerm as TermType,
      });
    }

    await db.settings.update(current.id!, {
      currentTerm: nextTerm as TermType,
      updatedAt: Date.now(),
      synced: SyncStatus.PENDING,
    });
  });
};

// ================= YEAR PROMOTION =================
export const processYearPromotion = async (
  current: any,
  overrides: Record<number, "promote" | "repeat" | "graduate"> = {},
  classSelections: Record<number, number> = {}
) => {
  if (!current) return;

  const [students, scores, classes] = await Promise.all([
    db.students.toArray(),
    db.scores.toArray(),
    db.classes.toArray(),
  ]);

  const classMap = buildNextClassMap(classes);
  const newYear = nextAcademicYear(current.academicYear);

  await snapshotReportCards(current);

  await db.transaction("rw", db.students, db.settings, async () => {
    for (const s of students) {
      if (!s.id) continue;

      const studentScores = scores.filter(
        (sc) =>
          sc.studentId === s.id &&
          sc.academicYear === current.academicYear &&
          sc.term === current.currentTerm
      );

      const avg = getAverage(studentScores);

      // ================= MANUAL OVERRIDE =================
      if (classSelections[s.id] !== undefined) {
        await db.students.update(s.id, {
          classId: classSelections[s.id],
          academicYear: newYear,
          term: "Term 1" as TermType,
        });
        continue;
      }

      const nextClassId = classMap[s.classId];
      const safeNextClassId =
        nextClassId ?? undefined;

      let decision = overrides[s.id];

      if (!decision) {
        if (avg < PASS_MARK) decision = "repeat";
        else if (!safeNextClassId) decision = "graduate";
        else decision = "promote";
      }

      if (decision === "repeat") {
        await db.students.update(s.id, {
          academicYear: newYear,
          term: "Term 1" as TermType,
        });
      } else if (decision === "promote" && safeNextClassId !== undefined) {
        await db.students.update(s.id, {
          classId: safeNextClassId,
          academicYear: newYear,
          term: "Term 1" as TermType,
        });
      } else if (decision === "graduate") {
        await db.students.update(s.id, {
          status: "graduated",
        });
      }
    }

    await db.settings.update(current.id!, {
      academicYear: newYear,
      currentTerm: "Term 1" as TermType,
      updatedAt: Date.now(),
      synced: SyncStatus.PENDING,
    });
  });
};

// ================= ENTRY POINT =================
export const runAcademicEngine = async (
  overrides?: Record<number, "promote" | "repeat" | "graduate">,
  classSelections?: Record<number, number>
) => {
  const current = await getSystemState();
  if (!current) return;

  if (current.currentTerm === "Term 3") {
    return processYearPromotion(
      current,
      overrides || {},
      classSelections || {}
    );
  }

  return processTermPromotion(current);
};*/