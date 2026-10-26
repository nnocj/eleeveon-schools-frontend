"use client";

import React, { useCallback, useEffect, useState } from "react";
import { db } from "../../../lib/db/db";
import { updateLocal } from "../../../lib/sync/syncUtils";
import { identityApi, type IdentityPolicy, type IssuanceMode } from "./identityApi";

const defaultPolicy: IdentityPolicy = {
  studentMode: "manual", teacherMode: "manual", expiryMonths: 12,
  showClassPublicly: true, showNamePublicly: false,
};

type CachedPolicy = IdentityPolicy & { schoolId?: string; branchId?: string };

type Props = {
  accountId: string;
  schoolId: string;
  branchId: string;
  onClose: () => void;
};

/**
 * Backend identity policy is authoritative. For the offline-first frontend,
 * cache the last known policy and pending changes on the existing branch
 * settings Dexie record. Never imply the backend accepted an offline edit.
 */
export default function IdentityIssuanceSettings({ accountId, schoolId, branchId, onClose }: Props) {
  const [policy, setPolicy] = useState<IdentityPolicy>(defaultPolicy);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const readSetting = useCallback(async () => {
    if (!accountId || !schoolId || !branchId) return null;
    const all = await db.schoolBranchSettings.toArray();
    return all.filter((row: any) => !row.isDeleted &&
      (!row.accountId || row.accountId === accountId) &&
      String(row.schoolId) === schoolId && String(row.branchId) === branchId)
      .sort((a: any, b: any) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null;
  }, [accountId, schoolId, branchId]);

  const cachePolicy = useCallback(async (next: IdentityPolicy, isPending: boolean) => {
    const row = await readSetting();
    if (!row) throw new Error("Save Branch Settings once to enable offline ID policy persistence.");
    await updateLocal("schoolBranchSettings", row.id, {
      identityIssuancePolicyCache: { ...next, schoolId, branchId },
      identityIssuancePolicyPending: isPending,
    } as any);
  }, [readSetting, schoolId, branchId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const run = async () => {
      try {
        const cached = await readSetting();
        if (cancelled) return;
        const saved = (cached as any)?.identityIssuancePolicyCache as CachedPolicy | undefined;
        const wasPending = (cached as any)?.identityIssuancePolicyPending === true;
        if (saved) setPolicy({ ...defaultPolicy, ...saved });
        setPending(wasPending);
        if (wasPending && saved) {
          // A previously saved offline edit is retried before reading the server.
          try {
            const updated = await identityApi.savePolicy({ ...saved, schoolId, branchId });
            await cachePolicy(updated, false);
            if (!cancelled) { setPolicy(updated); setPending(false); setMessage(""); }
            return;
          } catch {
            if (!cancelled) setMessage("Saved on this device. Server update pending.");
            return;
          }
        }
        try {
          const server = await identityApi.policy(schoolId, branchId);
          await cachePolicy(server, false);
          if (!cancelled) { setPolicy(server); setPending(false); setMessage(""); }
        } catch {
          if (!cancelled) setMessage(saved ? "Showing saved settings from this device." : "Connect to load ID issuance settings.");
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not load settings.");
      } finally { if (!cancelled) setLoading(false); }
    };
    void run();
    return () => { cancelled = true; };
  }, [schoolId, branchId, readSetting, cachePolicy]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      // Durable local write FIRST, even without a network connection.
      await cachePolicy(policy, true);
      setPending(true);
      try {
        const saved = await identityApi.savePolicy({ ...policy, schoolId, branchId });
        await cachePolicy(saved, false);
        setPolicy(saved);
        setPending(false);
        setMessage("ID issuance settings saved.");
      } catch {
        setMessage("Saved on this device. Will retry when this panel is opened online.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings could not be saved.");
    } finally { setSaving(false); }
  };

  const select = (key: "studentMode" | "teacherMode", label: string) => (
    <label style={{ display: "grid", gap: 5, marginBottom: 12, fontSize: 13 }}>
      {label}
      <select value={policy[key]}
        onChange={(event) => setPolicy((p) => ({ ...p, [key]: event.target.value as IssuanceMode }))}
        style={{ minHeight: 40, padding: 8, borderRadius: 8, background: "var(--surface,#fff)", color: "var(--text,#111827)" }}>
        <option value="manual">Manual — Generate from person</option>
        <option value="automatic">Automatic — After sync</option>
        <option value="disabled">Disabled</option>
      </select>
    </label>
  );

  return <div className="ba-sheet-backdrop" role="dialog" aria-modal="true" aria-label="ID issuance settings" style={{ zIndex: 2000 }}>
    <section className="ba-sheet small" style={{ padding: 16, maxWidth: 520, margin: "auto" }}>
      <div className="ba-sheet-head"><h2>ID issuance</h2><button type="button" onClick={onClose}>✕</button></div>
      <p style={{ fontSize: 12 }}>Card issuance and QR verification policies are scoped to this branch.</p>
      {loading ? <p>Loading saved settings…</p> : <>
        {select("studentMode", "Students")}{select("teacherMode", "Teachers")}
        <label style={{ display: "grid", gap: 5, fontSize: 13 }}>Expiry (months)
          <input type="number" min={1} max={120} value={policy.expiryMonths}
            onChange={(event) => setPolicy((p) => ({ ...p, expiryMonths: Math.max(1, Math.min(120, Number(event.target.value) || 12)) }))}/>
        </label>
        <label style={{ display: "flex", gap: 8, marginTop: 12, fontSize: 13 }}>
          <input type="checkbox" checked={policy.showClassPublicly}
            onChange={(event) => setPolicy((p) => ({ ...p, showClassPublicly: event.target.checked }))}/>
          Show a student's class on public verification
        </label>
        <label style={{ display: "flex", gap: 8, marginTop: 12, fontSize: 13 }}>
          <input type="checkbox" checked={policy.showNamePublicly}
            onChange={(event) => setPolicy((p) => ({ ...p, showNamePublicly: event.target.checked }))}/>
          Show full name publicly when a QR is scanned
        </label>
      </>}
      {message && <p role="status" style={{ fontSize: 12 }}>{message}</p>}
      {pending && <p style={{ fontSize: 12, color: "var(--muted,#64748b)" }}>Pending server synchronization</p>}
      <div className="ba-sheet-actions" style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button type="button" onClick={onClose}>Close</button>
        <button type="button" className="primary" disabled={saving || loading} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  </div>;
}
