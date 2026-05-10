import { db } from "../db";

export const generateStudentTranscript = async (studentId: number) => {
  const system = await db.settings.toArray();
  const settings = system?.[0];

  if (!settings?.branchId) return null;

  const results = await db.computedResults
    .where("studentId")
    .equals(studentId)
    .toArray();

  const grouped = new Map<number, any[]>();

  for (const r of results) {
    if (!grouped.has(r.subjectId)) grouped.set(r.subjectId, []);
    grouped.get(r.subjectId)!.push(r);
  }

  const subjects = Array.from(grouped.entries()).map(
    ([subjectId, data]) => {
      const total = data.reduce((s, r) => s + (r.total ?? 0), 0);
      const avg = data.length ? total / data.length : 0;

      return {
        subjectId,
        total,
        average: avg,
        grade: data[0]?.grade ?? "F",
      };
    }
  );

  const totalScore = subjects.reduce((s, x) => s + x.total, 0);
  const overallAverage =
    subjects.length > 0 ? totalScore / subjects.length : 0;

  return {
    studentId,
    branchId: settings.branchId,
    totalScore,
    overallAverage,
    subjects,
    generatedAt: Date.now(),
  };
};