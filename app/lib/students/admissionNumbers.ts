/** Shared Eleeveon admissions numbering. Local-first allocation is provisional until server validation. */
import { db, type SchoolBranchSetting, type Student, type AdmissionNumberConfiguration } from "../db/db";
import { updateLocal } from "../sync/syncUtils";

export type AdmissionResolution = { admissionNumber?: string; provisional: boolean };
const normalize = (v: unknown) => String(v ?? "").trim().toUpperCase();
export const formatAdmissionNumber = (cfg: AdmissionNumberConfiguration, sequence: number) =>
  `${normalize(cfg.prefix)}${cfg.separator || ""}${String(sequence).padStart(Math.max(1, cfg.padding || 3), "0")}`;

export async function readAdmissionConfiguration(schoolId: string, branchId: string): Promise<AdmissionNumberConfiguration> {
  const rows = await db.schoolBranchSettings.where("branchId").equals(branchId).toArray();
  const row = rows.find(r => r.schoolId === schoolId && !r.isDeleted);
  return (row as any)?.admissionNumbers || { mode: "manual", prefix: "", separator: "-", nextSequence: 1, padding: 3, scope: "branch" };
}

/** Generate a candidate based on existing records; caller must handle uniqueness when saving. */
export async function resolveAdmissionNumber(args: {
  schoolId: string; branchId: string; accountId: string;
  supplied?: string; excludeStudentId?: string;
}): Promise<AdmissionResolution> {
  const cfg = await readAdmissionConfiguration(args.schoolId, args.branchId);
  const supplied = (args.supplied || "").trim();
  const students = await db.students.where("branchId").equals(args.branchId).toArray();
  const occupied = new Set(students.filter(s => s.schoolId === args.schoolId && s.id !== args.excludeStudentId).map(s => normalize(s.admissionNumber)).filter(Boolean));
  if (supplied) {
    if (cfg.mode === "automatic" && !args.excludeStudentId) throw new Error("This branch generates admission numbers automatically. Clear the entered number.");
    if (occupied.has(normalize(supplied))) throw new Error("Admission number already exists in this branch.");
    return { admissionNumber: supplied, provisional: false };
  }
  if (cfg.mode === "manual" || args.excludeStudentId) return { admissionNumber: undefined, provisional: false };
  let sequence = Math.max(1, Math.floor(cfg.nextSequence || 1));
  // Imported legacy numbers count too, so switching on automatic numbering won't overwrite them.
  while (occupied.has(normalize(formatAdmissionNumber(cfg, sequence)))) sequence++;
  const candidate = formatAdmissionNumber(cfg, sequence);
  // Persist high-water mark, never decrement. A cloud-side reservation must make this globally authoritative.
  const settingsRows = await db.schoolBranchSettings.where("branchId").equals(args.branchId).toArray();
  const row = settingsRows.find(r => r.schoolId === args.schoolId && !r.isDeleted);
  if (row) await updateLocal("schoolBranchSettings", row.id, { admissionNumbers: { ...cfg, nextSequence: sequence + 1 } } as any);
  return { admissionNumber: candidate, provisional: true };
}
