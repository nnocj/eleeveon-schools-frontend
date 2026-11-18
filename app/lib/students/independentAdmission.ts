/** Independent-only atomic admission allocation. Cloud continues to use its existing server-authoritative path. */
import { db, type Student } from "../db/db";
import { createLocal } from "../sync/syncUtils";
import { resolveSyncPolicy } from "../sync/resolveSyncPolicy";
import { formatAdmissionNumber, readAdmissionConfiguration } from "./admissionNumbers";

const norm = (v: unknown) => String(v ?? "").trim().toUpperCase();
export async function isIndependentAdmissionAccount(accountId: string): Promise<boolean> {
  const policy = await resolveSyncPolicy(accountId);
  return policy.mode === "offline" && policy.allowLocalMutations && !policy.allowPush && !policy.allowPull;
}

/** All student and branch-setting writes are in one IndexedDB transaction.
 * Deleted student records still reserve their numbers. No remote allocation occurs.
 * Independent Multi-Device must additionally reconcile cross-device number collisions
 * before enabling concurrent enrollment on multiple devices.
 */
export async function createIndependentStudentWithAdmission(args: {
  accountId: string; schoolId: string; branchId: string; supplied?: string; student: Partial<Student>;
}) {
  return db.transaction("rw", db.students, db.schoolBranchSettings, async () => {
    const cfg = await readAdmissionConfiguration(args.schoolId, args.branchId, args.accountId);
    const rows = await db.students.where("branchId").equals(args.branchId).toArray();
    const occupied = new Set(rows.filter((s: any) => s.schoolId === args.schoolId &&
      (!s.accountId || s.accountId === args.accountId)).map((s: any) => norm(s.admissionNumber)).filter(Boolean));
    let candidate = String(args.supplied ?? "").trim();
    if (candidate && cfg.mode === "automatic") throw new Error("Automatic mode generates admission numbers. Leave the number blank.");
    if (candidate && occupied.has(norm(candidate))) throw new Error("Admission number already exists in this branch.");
    if (!candidate && cfg.mode !== "manual") {
      const settingsRows = await db.schoolBranchSettings.where("branchId").equals(args.branchId).toArray();
      const settings = settingsRows.filter((r: any) => r.schoolId === args.schoolId && !r.isDeleted &&
        (!r.accountId || r.accountId === args.accountId)).sort((a: any,b: any) => Number(b.updatedAt || 0)-Number(a.updatedAt || 0))[0];
      if (!settings) throw new Error("Save Branch Settings before allocating automatic admission numbers.");
      let seq = cfg.nextSequence;
      while (occupied.has(norm(formatAdmissionNumber(cfg, seq)))) seq++;
      candidate = formatAdmissionNumber(cfg, seq);
      await db.schoolBranchSettings.update(settings.id, { admissionNumbers: { ...cfg, nextSequence: seq + 1 }, updatedAt: Date.now() } as any);
    }
    return createLocal("students", { ...args.student, accountId: args.accountId, schoolId: args.schoolId,
      branchId: args.branchId, admissionNumber: candidate || undefined,
      admissionNumberProvisional: false, admissionNumberConfirmed: true } as Student);
  });
}
