import { db } from "../db";
import { TermType } from "../types/academic";
import { prepareSyncData } from "../sync/syncUtils";

/**
 * 🔥 GLOBAL SCHOOL STATE
 */
export const getSchoolState = async () => {
  const settings = await db.settings.toArray();
  return settings[0] || null;
};

export const updateSchoolState = async (
  term: TermType,
  academicYear: string
) => {
  const existing = await db.settings.toArray();

  if (existing.length === 0) {
    return db.settings.add(prepareSyncData({
      currentTerm: term,
      academicYear,
      mode: "auto", // 🔥 FIX
    }));
  }

  return db.settings.update(existing[0].id!, {
    currentTerm: term,
    academicYear,
  });
};