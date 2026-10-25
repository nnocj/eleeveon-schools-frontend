"use client";

/**
 * Shared branch identity-card presentation source.
 * Reads the exact design saved in Branch Settings; resolves logo/signature
 * assets through the same owner-based media service used by Branch Settings.
 * This module changes presentation only; issuance and verification stay intact.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { db, type IdentityCredentialDesignSetting } from "../../../lib/db/db";
import { resolveOwnerMediaUrl, revokeMediaObjectUrl } from "../../../lib/media/mediaAssetUtils";
import { useDataRevision } from "../../../hooks/useDataRevision";
import type { IdentityCredentialCardBranding } from "./IdentityCredentialCard";

type AnyRow = Record<string, any>;
const id = (v: unknown) => String(v ?? "").trim();
const active = (r: AnyRow) => !r.isDeleted && r.active !== false;
const generic = (v: unknown) => !id(v) || id(v) === "all";

export function chooseIdentityCardDesign(
  designs: Partial<IdentityCredentialDesignSetting>[],
  subjectType: string,
  credentialType = "qr_code",
): Partial<IdentityCredentialDesignSetting> {
  const candidates = designs.filter(d => {
    if (d.isDeleted || d.active === false) return false;
    return (generic(d.subjectType) || id(d.subjectType) === subjectType) &&
      (generic(d.credentialType) || id(d.credentialType) === credentialType ||
        // An existing QR verification URL is also the verification channel for an ID card.
        (credentialType === "qr_code" && id(d.credentialType) ===
          (subjectType === "student" ? "student_id" : "staff_id")) ||
        (["student_id", "staff_id", "mobile_pass"].includes(credentialType) && id(d.credentialType) === "qr_code"));
  });
  const score = (d: Partial<IdentityCredentialDesignSetting>) =>
    (id(d.subjectType) === subjectType ? 100 : 0) +
    (id(d.credentialType) === credentialType ? 30 : generic(d.credentialType) ? 10 : 0) +
    (d.isDefault ? 5 : 0);
  const sorted = [...candidates].sort((a, b) =>
    score(b) - score(a) || Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
  return sorted[0] || {
    name: `${subjectType === "teacher" ? "Teacher" : "Student"} ID`,
    templateKey: "modern_clean", orientation: "landscape", sides: "front_and_back",
    primaryColor: "#174777", secondaryColor: "#172554",
    backgroundColor: "#ffffff", textColor: "#111827", mutedTextColor: "#64748b",
    showSchoolLogo: true, showBranchLogo: true, showSchoolName: true,
    showBranchName: true, showPhoto: true, showQrCode: true,
    showExpiryDate: true, showCredentialReference: true,
    qrPosition: "front_right", qrSize: "medium",
    visibleFields: { fullName: true, admissionNumber: subjectType === "student",
      staffNumber: subjectType !== "student", className: subjectType === "student" },
    footerText: "Official school identity credential",
  };
}

export const IDENTITY_DESIGN_CHANGED_EVENT = "eleeveon:identity-design-updated";

export function useIdentityCardPresentation(args: {
  accountId?: string | null;
  schoolId: string;
  branchId: string;
  school?: AnyRow | null;
  branch?: AnyRow | null;
}) {
  const { accountId, schoolId, branchId, school, branch } = args;
  const revision = useDataRevision();
  const [serial, setSerial] = useState(0);
  const [designs, setDesigns] = useState<IdentityCredentialDesignSetting[]>([]);
  const [academicYear, setAcademicYear] = useState("");
  const [branding, setBranding] = useState<IdentityCredentialCardBranding>({
    schoolName: school?.name || "School Identification", branchName: branch?.name || "",
    motto: school?.motto || "", address: branch?.address || school?.address || "",
    schoolLogoUrl: school?.logo || "", branchLogoUrl: branch?.logo || "",
  });

  useEffect(() => {
    const refresh = () => setSerial(x => x + 1);
    window.addEventListener(IDENTITY_DESIGN_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(IDENTITY_DESIGN_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const allocated: string[] = [];
    if (!schoolId || !branchId) return;
    const read = async () => {
      try {
        const [schoolRow, branchRow, settingsRows, designRows] = await Promise.all([
          db.schools.get(schoolId), db.branches.get(branchId),
          db.schoolBranchSettings.toArray(), db.identityCredentialDesignSettings.toArray(),
        ]);
        if (cancelled) return;
        const s = (schoolRow || school || {}) as AnyRow;
        const b = (branchRow || branch || {}) as AnyRow;
        const a = id(accountId || s.accountId || b.accountId);
        const scoped = (r: AnyRow) => id(r.schoolId) === schoolId &&
          id(r.branchId) === branchId && (!a || !r.accountId || id(r.accountId) === a);
        setDesigns(designRows.filter(r => scoped(r) && active(r)));
        const branchSettings = settingsRows.filter(r => scoped(r) && active(r))
          .sort((x, y) => Number(y.updatedAt || 0) - Number(x.updatedAt || 0))[0] as AnyRow | undefined;
        const academicStructure = branchSettings?.currentAcademicStructureId
          ? await db.academicStructures.get(id(branchSettings.currentAcademicStructureId)) : null;
        if (!cancelled) setAcademicYear(id(branchSettings?.academicYear || academicStructure?.name));

        const media = async (ownerTable: string, ownerId: string, fieldKey: string, mediaId: unknown, fallback: unknown) => {
          try {
            const url = await resolveOwnerMediaUrl({
              accountId: a || undefined, ownerTable, ownerId: ownerId || undefined,
              fieldKey, fallbackAssetId: id(mediaId) || undefined,
            });
            if (typeof url === "string" && url) {
              if (url.startsWith("blob:")) allocated.push(url);
              return url;
            }
          } catch (e) { console.warn("Identity card image could not be resolved", fieldKey, e); }
          return id(fallback);
        };
        const [schoolLogoUrl, branchLogoUrl, settingsLogoUrl, signatureUrl] = await Promise.all([
          media("schools", schoolId, "logo", s.logoMediaId, s.logo),
          media("branches", branchId, "logo", b.logoMediaId, b.logo),
          branchSettings ? media("schoolBranchSettings", id(branchSettings.id), "logo", branchSettings.logoMediaId, branchSettings.logo) : "",
          branchSettings ? media("schoolBranchSettings", id(branchSettings.id), "reportCardSignatureImage", branchSettings.reportCardSignatureImageMediaId, branchSettings.reportCardSignatureImage) : "",
        ]);
        if (cancelled) { allocated.forEach(revokeMediaObjectUrl); return; }
        setBranding({
          schoolName: id(s.name) || "School Identification", branchName: id(b.name),
          motto: id(s.motto), address: id(b.address || s.address),
          schoolLogoUrl: schoolLogoUrl || settingsLogoUrl,
          branchLogoUrl: branchLogoUrl || settingsLogoUrl,
          signatureUrl,
        });
      } catch (error) {
        console.warn("Could not refresh identity card presentation", error);
      }
    };
    void read();
    return () => {
      cancelled = true;
      allocated.forEach(revokeMediaObjectUrl);
    };
  }, [accountId, schoolId, branchId, school?.name, school?.logo, branch?.name, branch?.logo, revision, serial]);

  const designFor = useCallback((subjectType: string, credentialType = "qr_code") =>
    chooseIdentityCardDesign(designs, subjectType, credentialType), [designs]);

  return useMemo(() => ({ branding, designs, academicYear, designFor, refresh: () => setSerial(s => s + 1) }),
    [branding, designs, academicYear, designFor]);
}
