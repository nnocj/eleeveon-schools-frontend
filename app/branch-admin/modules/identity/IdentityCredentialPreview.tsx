"use client";

import React from "react";
import type { IdentityCredential, IdentityCredentialDesignSetting } from "../../../lib/db/db";
import IdentityCredentialCard, {
  type IdentityCredentialCardBranding,
  type IdentityCredentialCardSubject,
} from "./IdentityCredentialCard";

export type IdentityCredentialPreviewProps = {
  design: Partial<IdentityCredentialDesignSetting>;
  credential?: Partial<IdentityCredential> | null;
  subject?: Partial<IdentityCredentialCardSubject>;
  branding: IdentityCredentialCardBranding;
};

export default function IdentityCredentialPreview({
  design, credential, subject, branding,
}: IdentityCredentialPreviewProps) {
  const previewSubject: IdentityCredentialCardSubject = {
    fullName: subject?.fullName || "Jonathan Commey",
    admissionNumber: subject?.admissionNumber || "STD-2026-014",
    staffNumber: subject?.staffNumber || "TCH-2026-014",
    className: subject?.className || "Grade 6",
    organizationName: subject?.organizationName || "",
    academicYear: subject?.academicYear || "2026/2027",
    gender: subject?.gender || "Male",
    dateOfBirth: subject?.dateOfBirth || "2013-06-15",
    phone: subject?.phone || "+233 24 000 0000",
    emergencyPhone: subject?.emergencyPhone || "+233 24 000 0001",
    photoUrl: subject?.photoUrl || "",
  };
  const previewCredential: Partial<IdentityCredential> = credential || {
    credentialReference: "ELV-STD-2026-014",
    credentialType: "qr_code",
    status: "active", generatedAt: Date.now(),
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    metadata: { qrValue: "eleeveon://credential/ELV-STD-2026-014" },
  };
  const dual = design.sides === "front_and_back";
  return (
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start",
      justifyContent: "center", padding: 16, borderRadius: 16,
      background: "var(--surface-muted, rgba(148,163,184,.12))", overflowX: "auto" }}>
      <IdentityCredentialCard design={design} credential={previewCredential}
        subject={previewSubject} branding={branding} />
      {dual && <IdentityCredentialCard side="back" design={design}
        credential={previewCredential} subject={previewSubject} branding={branding} />}
    </div>
  );
}
