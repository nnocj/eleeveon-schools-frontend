/** Offline-first student admission numbering; provisional until server confirmation. */
import { db, type AdmissionNumberConfiguration } from "../db/db";
import { updateLocal } from "../sync/syncUtils";

export type AdmissionResolution = { admissionNumber?: string; provisional: boolean };
const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase();
type Config = AdmissionNumberConfiguration & { mode: "manual" | "automatic" | "automatic_or_manual" };
const FALLBACK: Config = { mode: "manual", prefix: "", separator: "-", nextSequence: 1, padding: 3, scope: "branch" };

export function formatAdmissionNumber(cfg: AdmissionNumberConfiguration, sequence: number): string {
  const prefix = normalize(cfg.prefix);
  const separator = prefix ? String(cfg.separator ?? "-") : "";
  return `${prefix}${separator}${String(sequence).padStart(Math.max(1, Number(cfg.padding) || 3), "0")}`;
}

export async function readAdmissionConfiguration(schoolId: string, branchId: string, accountId?: string): Promise<Config> {
  const rows = await db.schoolBranchSettings.where("branchId").equals(branchId).toArray();
  const row = rows.filter((r: any) => !r.isDeleted && r.schoolId === schoolId && (!accountId || !r.accountId || r.accountId === accountId))
    .sort((a: any, b: any) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
  const raw = (row as any)?.admissionNumbers;
  if (!raw || typeof raw !== "object") return { ...FALLBACK };
  const mode = ["manual", "automatic", "automatic_or_manual"].includes(raw.mode) ? raw.mode : "manual";
  return { mode, prefix: normalize(raw.prefix), separator: String(raw.separator ?? "-"),
    padding: Math.min(12, Math.max(1, Math.floor(Number(raw.padding) || 3))),
    nextSequence: Math.max(1, Math.floor(Number(raw.nextSequence) || 1)), scope: "branch" };
}

/** Existing confirmed IDs stay unchanged. Never reuse deleted IDs without backend correction/release. */
export async function resolveAdmissionNumber(args: {
  schoolId: string; branchId: string; accountId: string; supplied?: string; excludeStudentId?: string;
}): Promise<AdmissionResolution> {
  const cfg = await readAdmissionConfiguration(args.schoolId, args.branchId, args.accountId);
  const supplied = String(args.supplied ?? "").trim();
  const students = await db.students.where("branchId").equals(args.branchId).toArray();
  // Include deleted records: backend reservation registry retains their numbers.
  const occupied = new Set(students.filter((s: any) => s.schoolId === args.schoolId &&
    (!s.accountId || s.accountId === args.accountId) && s.id !== args.excludeStudentId)
    .map((s: any) => normalize(s.admissionNumber)).filter(Boolean));
  if (supplied) {
    if (cfg.mode === "automatic" && !args.excludeStudentId) {
      throw new Error("Automatic mode generates admission numbers. Leave the number blank.");
    }
    if (occupied.has(normalize(supplied))) throw new Error("Admission number already exists in this branch.");
    return { admissionNumber: supplied, provisional: false };
  }
  if (cfg.mode === "manual" || args.excludeStudentId) return { admissionNumber: undefined, provisional: false };
  const rows = await db.schoolBranchSettings.where("branchId").equals(args.branchId).toArray();
  const settingsRow = rows.filter((r: any) => r.schoolId === args.schoolId && !r.isDeleted &&
    (!r.accountId || r.accountId === args.accountId))
    .sort((a: any, b: any) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
  if (!settingsRow) throw new Error("Save Branch Settings before allocating automatic admission numbers.");
  let sequence = cfg.nextSequence;
  while (occupied.has(normalize(formatAdmissionNumber(cfg, sequence)))) sequence++;
  const candidate = formatAdmissionNumber(cfg, sequence);
  await updateLocal("schoolBranchSettings", settingsRow.id, {
    admissionNumbers: { ...cfg, nextSequence: sequence + 1 },
  } as any);
  return { admissionNumber: candidate, provisional: true };
}
