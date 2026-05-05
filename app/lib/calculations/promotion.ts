import { db } from "../db";

export const TERMS = ["Term 1", "Term 2", "Term 3"];
const PASS_MARK = 50;

// ---------------- HELPERS ----------------

export const getAverage = (scores: any[]) => {
  if (!scores.length) return 0;
  return scores.reduce((s, r) => s + r.total, 0) / scores.length;
};

export const nextTerm = (term: string): string | null => {
  const index = TERMS.indexOf(term as any);
  return TERMS[index + 1] || null;
};

export const nextAcademicYear = (year: string) => {
  const [start] = year.split("/").map(Number);// taking end out
  return `${start + 1}`;
};

export const buildNextClassMap = (classes: any[]) => {
  const sorted = [...classes].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const map: Record<number, number | null> = {};

  sorted.forEach((c, i) => {
    map[c.id] = sorted[i + 1]?.id || null;
  });

  return map;
};