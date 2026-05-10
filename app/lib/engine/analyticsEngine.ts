import { db } from "../db";

const avg = (arr: number[]) =>
  arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

export const getSchoolAnalytics = async () => {
  const system = await db.settings.toArray();
  const branchId = system?.[0]?.branchId;

  if (!branchId) return null;

  const results = await db.computedResults
    .where("branchId")
    .equals(branchId)
    .toArray();

  const values = results.map((r) => r.percentage ?? 0);

  return {
    totalStudents: new Set(results.map((r) => r.studentId)).size,
    averageScore: avg(values),
    passRate: values.filter((v) => v >= 50).length / values.length * 100,
  };
};