"use client";

import React, { useMemo } from "react";
import type { IdentityCredential, IdentityCredentialDesignSetting } from "../../../lib/db/db";
import IdentityCredentialCard, {
  type IdentityCredentialCardBranding,
  type IdentityCredentialCardSubject,
} from "./IdentityCredentialCard";

export type PrintableCredential = {
  credential: Partial<IdentityCredential>;
  subject: IdentityCredentialCardSubject;
};

export type IdentityCredentialPrintSheetProps = {
  open: boolean;
  onClose: () => void;
  design: Partial<IdentityCredentialDesignSetting>;
  designForCredential?: (credential: Partial<IdentityCredential>) => Partial<IdentityCredentialDesignSetting>;
  branding: IdentityCredentialCardBranding;
  credentials: PrintableCredential[];
  title?: string;
};

export default function IdentityCredentialPrintSheet({
  open, onClose, design, designForCredential, branding, credentials,
  title = "Print Identity Credentials",
}: IdentityCredentialPrintSheetProps) {
  const printable = useMemo(() => credentials.filter(item => item.subject?.fullName), [credentials]);
  if (!open) return null;
  return (
    <div className="identity-print-modal" role="dialog" aria-modal="true">
      <style>{`
        .identity-print-modal{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.62);display:grid;place-items:center;padding:18px}
        .identity-print-shell{width:min(1280px,100%);max-height:94dvh;overflow:auto;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);border-radius:18px}
        .identity-print-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;background:inherit;border-bottom:1px solid var(--border,rgba(148,163,184,.3))}
        .identity-print-actions{display:flex;gap:8px}.identity-print-actions button{min-height:36px;border-radius:10px;padding:0 14px;border:1px solid var(--border,rgba(148,163,184,.35));background:transparent;color:inherit;cursor:pointer}
        .identity-print-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;padding:24px;overflow-x:auto}
        .identity-print-item{break-inside:avoid;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;justify-content:center;width:100%;min-height:240px}
        .eleeveon-identity-card,.eleeveon-identity-card *{print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}
        .eleeveon-identity-card{box-shadow:none!important;break-inside:avoid!important;page-break-inside:avoid!important}
        .eleeveon-identity-card svg{print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}
        @media print{
          @page{margin:7mm}
          body *{visibility:hidden!important}
          .identity-print-modal,.identity-print-modal *{visibility:visible!important}
          .identity-print-modal{position:absolute!important;top:0;left:0;right:0;bottom:auto;display:block;width:100%;background:#fff;padding:0;overflow:visible}
          .identity-print-shell{width:100%;max-height:none;overflow:visible;border-radius:0;background:#fff}
          .identity-print-head{display:none!important}
          .identity-print-grid{display:block;padding:0;overflow:visible}
          .identity-print-item{page-break-inside:avoid;break-inside:avoid;margin-bottom:7mm;min-height:0}
        }
      `}</style>
      <section className="identity-print-shell">
        <header className="identity-print-head">
          <div><strong>{title}</strong><div style={{fontSize:12,opacity:.65}}>{printable.length} credential{printable.length===1?"":"s"}</div></div>
          <div className="identity-print-actions">
            <button type="button" onClick={onClose}>Close</button>
            <button type="button" onClick={() => window.print()}>Print</button>
          </div>
        </header>
        <div className="identity-print-grid">
          {printable.map((item, index) => {
            const selectedDesign = designForCredential?.(item.credential) || design;
            const twoSides = selectedDesign.sides === "front_and_back";
            return <div className="identity-print-item" key={item.credential.id || item.credential.credentialReference || index}>
              <IdentityCredentialCard design={selectedDesign} credential={item.credential} subject={item.subject} branding={branding} />
              {twoSides && <IdentityCredentialCard side="back" design={selectedDesign} credential={item.credential} subject={item.subject} branding={branding} />}
            </div>;
          })}
        </div>
      </section>
    </div>
  );
}
