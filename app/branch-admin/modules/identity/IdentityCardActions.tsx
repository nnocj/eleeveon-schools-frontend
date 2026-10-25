"use client";

/**
 * Student/Teacher profile identity actions.
 * Preserves the established server-issued verification URL, replace and revoke.
 * The on-screen and printable card uses the exact saved branch credential design.
 */
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { db, type IdentityCredential } from "../../../lib/db/db";
import { identityApi, type IdentityCardResult, type IdentityTarget } from "./identityApi";
import IdentityCredentialCard, { type IdentityCredentialCardSubject } from "./IdentityCredentialCard";
import { useIdentityCardPresentation } from "./identityCardPresentation";

const id = (v: unknown) => String(v ?? "").trim();
const timestamp = (v: unknown): number | undefined => {
  if (!v) return undefined;
  const d = new Date(v as string | number).getTime();
  return Number.isFinite(d) ? d : undefined;
};

export default function IdentityCardActions({
  subjectId, subjectType, schoolId, branchId, name, detail, photoUrl,
}: IdentityTarget & { name: string; detail?: string; photoUrl?: string }) {
  const target = useMemo(() => ({ subjectId, subjectType, schoolId, branchId }),
    [subjectId, subjectType, schoolId, branchId]);
  const [card, setCard] = useState<IdentityCardResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState<Record<string, any> | null>(null);
  const [academicYear, setAcademicYear] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const { branding, designFor, refresh } = useIdentityCardPresentation({
    schoolId, branchId,
  });
  const design = designFor(subjectType, "qr_code");

  useEffect(() => {
    let cancelled = false;
    setCard(null);
    identityApi.get(target)
      .then(result => { if (!cancelled) setCard(result); })
      .catch(() => { if (!cancelled) setCard({ status: "not_issued" }); });
    return () => { cancelled = true; };
  }, [target]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const record = subjectType === "student"
          ? await db.students.get(subjectId)
          : await db.teachers.get(subjectId);
        const settings = (await db.schoolBranchSettings.toArray()).find(r =>
          !r.isDeleted && id(r.schoolId) === schoolId && id(r.branchId) === branchId);
        const currentStructure = settings?.currentAcademicStructureId
          ? await db.academicStructures.get(id(settings.currentAcademicStructureId)) : null;
        const orgId = id((record as any)?.organizationId);
        const org = orgId ? await db.organizations.get(orgId) : null;
        if (!cancelled) {
          setPerson(record || null);
          setAcademicYear(id(currentStructure?.name));
          setOrganizationName(id(org?.name));
        }
      } catch (err) {
        console.warn("Identity profile details could not be loaded", err);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [schoolId, branchId, subjectId, subjectType]);

  const subject: IdentityCredentialCardSubject = {
    fullName: name || id(person?.fullName) || "Cardholder",
    admissionNumber: subjectType === "student" ? id(person?.admissionNumber) : "",
    staffNumber: subjectType === "teacher" ? id(person?.staffNumber || person?.employeeNumber || person?.employeeId) : "",
    className: subjectType === "student" ? detail || "" : "",
    organizationName,
    academicYear,
    gender: id(person?.gender),
    dateOfBirth: id(person?.dateOfBirth),
    phone: id(person?.phone),
    emergencyPhone: id(person?.emergencyPhone || person?.relativePhone || person?.parentPhone),
    photoUrl: photoUrl || id(person?.photo),
  };

  const credential: Partial<IdentityCredential> = {
    subjectId, subjectType, credentialType: "qr_code", status: "active",
    credentialReference: subject.admissionNumber || subject.staffNumber || "",
    generatedAt: timestamp(card?.issuedAt),
    expiresAt: timestamp(card?.expiresAt),
    metadata: { qrValue: card?.verificationUrl || "" },
  } as Partial<IdentityCredential>;
  const hasCard = card?.status === "active" && Boolean(card.verificationUrl);
  const doubleSided = design.sides === "front_and_back";

  async function issue(replace = false) {
    setBusy(true); setError("");
    try {
      const result = await identityApi.issue(target, replace);
      setCard(result); setOpen(result.status === "active" && Boolean(result.verificationUrl));
      refresh();
    } catch (e: any) {
      setError(e?.message || "Connect to the internet and synchronize this person before issuing an ID.");
    } finally { setBusy(false); }
  }
  async function revoke() {
    if (!window.confirm("Revoke this card? Its QR link will stop verifying.")) return;
    setBusy(true); setError("");
    try {
      await identityApi.revoke(target);
      setCard({ status: "revoked" }); setOpen(false);
    } catch (e: any) { setError(e?.message || "Could not revoke ID."); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" disabled={busy} onClick={() => hasCard ? (refresh(), setOpen(true)) : void issue()}>
      <span>▣</span><b>{busy ? "Working..." : hasCard ? "View ID Card" : "Generate ID"}</b>
      <small>{hasCard ? "View, print or replace" : "Issue a verifiable student or teacher ID"}</small>
    </button>
    {hasCard && <button type="button" disabled={busy} onClick={() => void issue(true)}>
      <span>↻</span><b>Replace ID</b><small>Invalidate the previous verification link</small>
    </button>}
    {hasCard && <button type="button" disabled={busy} onClick={() => void revoke()}>
      <span>⊘</span><b>Revoke ID</b><small>Disable this card's public verification</small>
    </button>}
    {error && <p role="alert" style={{color:"#b91c1c",fontSize:12}}>{error}</p>}
    {open && hasCard && typeof document !== "undefined" && createPortal(
      <div className="eleeveon-card-backdrop" role="dialog" aria-modal="true" aria-label="ID card preview">
        <style>{`
          .eleeveon-card-backdrop{position:fixed;inset:0;z-index:2147483000;background:#020617b8;display:grid;place-items:center;padding:12px;overflow:auto}
          .eleeveon-card-panel{width:min(100%,960px);max-height:95dvh;overflow:auto;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);padding:14px;border-radius:14px}
          .eleeveon-card-panel button{cursor:pointer;padding:9px 14px;border:1px solid var(--border,#cbd5e1);border-radius:9px;background:var(--surface,#fff);color:var(--text,#111827)}
          .eleeveon-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px}
          .eleeveon-card-art{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;align-items:flex-start;overflow-x:auto;padding:15px 0}
          .eleeveon-card-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
          @media print{
            @page{margin:7mm}
            body *{visibility:hidden!important}
            .eleeveon-card-backdrop,.eleeveon-card-backdrop *{visibility:visible!important}
            .eleeveon-card-backdrop{position:absolute!important;inset:auto!important;top:0!important;left:0!important;width:100%!important;padding:0!important;background:#fff!important;display:block!important;overflow:visible!important}
            .eleeveon-card-panel{width:100%;max-width:none;max-height:none;overflow:visible;padding:0;background:#fff!important;border-radius:0}
            .eleeveon-card-head,.eleeveon-card-actions,.eleeveon-card-help{display:none!important}
            .eleeveon-card-art{display:flex;gap:6mm;overflow:visible;padding:0}
          }
        `}</style>
        <section className="eleeveon-card-panel">
          <div className="eleeveon-card-head"><strong>{subjectType === "teacher" ? "Teacher" : "Student"} ID Card</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close ID preview">✕ Close</button></div>
          <div className="eleeveon-card-art">
            <IdentityCredentialCard design={design} credential={credential} subject={subject} branding={branding}/>
            {doubleSided && <IdentityCredentialCard side="back" design={design} credential={credential} subject={subject} branding={branding}/>}
          </div>
          <p className="eleeveon-card-help" style={{fontSize:11,opacity:.75,textAlign:"center"}}>
            Layout and visible fields follow Branch Settings. Verification needs internet access.
          </p>
          <div className="eleeveon-card-actions">
            <button type="button" onClick={() => window.print()}>Print ID</button>
            <button type="button" onClick={() => {
              if (card.verificationUrl) void navigator.clipboard?.writeText(card.verificationUrl);
            }}>Copy verification link</button>
            <button type="button" onClick={() => setOpen(false)}>Done</button>
          </div>
        </section>
      </div>, document.body)}
  </>;
}
