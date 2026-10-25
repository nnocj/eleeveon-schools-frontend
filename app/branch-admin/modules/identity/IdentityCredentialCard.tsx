"use client";

import React, { useEffect, useState } from "react";
import type {
  IdentityCredential,
  IdentityCredentialDesignSetting,
} from "../../../lib/db/db";
import IdentityQrCode from "./IdentityQrCode";

export type IdentityCredentialCardSubject = {
  fullName: string;
  admissionNumber?: string | null;
  staffNumber?: string | null;
  className?: string | null;
  organizationName?: string | null;
  academicYear?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  emergencyPhone?: string | null;
  photoUrl?: string | null;
  photoCandidates?: string[];
};

export type IdentityCredentialCardBranding = {
  schoolName: string;
  branchName?: string | null;
  motto?: string | null;
  address?: string | null;
  schoolLogoUrl?: string | null;
  branchLogoUrl?: string | null;
  signatureUrl?: string | null;
  // Optional ordered alternatives resolved from the branch's mediaAssets.
  schoolLogoCandidates?: string[];
  branchLogoCandidates?: string[];
  signatureCandidates?: string[];
};

export type IdentityCredentialCardProps = {
  credential?: Partial<IdentityCredential> | null;
  design: Partial<IdentityCredentialDesignSetting>;
  subject: IdentityCredentialCardSubject;
  branding: IdentityCredentialCardBranding;
  side?: "front" | "back";
  scale?: number;
  className?: string;
};

function readableDate(value?: number | string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
}

function qrValue(credential?: Partial<IdentityCredential> | null) {
  const metadata = (credential?.metadata || {}) as Record<string, unknown>;
  return String(
    metadata.qrValue ||
      metadata.qrPayload ||
      credential?.credentialReference ||
      "",
  );
}

/**
 * Image with graceful fallbacks. In particular, an old /media/files/... URL
 * may return 404 after storage was migrated to Supabase. Never show a broken
 * image glyph on a printable school ID. The final fallback is an empty slot.
 */
function CardAssetImage({
  sources, alt, style, fallback,
}: {
  sources: Array<string | null | undefined>;
  alt: string;
  style: React.CSSProperties;
  fallback?: React.ReactNode;
}) {
  const choices = Array.from(new Set(sources.map(v => String(v || "").trim())
    .filter(v => /^(https?:\/\/|blob:|data:image\/|\/)/i.test(v))));
  const key = choices.join("\u0001");
  const [failed, setFailed] = useState(0);
  useEffect(() => { setFailed(0); }, [key]);
  const url = choices[failed];
  return url ? <img src={url} alt={alt} style={style}
    onError={() => setFailed(index => index + 1)} /> : <>{fallback || null}</>;
}

/** SVG is actual print content, unlike CSS background graphics that browsers
 * may suppress unless the user enables "Print backgrounds". */
function PrintableGradient({ from, to, accent }: {
  from: string; to: string; accent?: string;
}) {
  const id = React.useId().replace(/:/g, "");
  return <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 1000 100" preserveAspectRatio="none"
    style={{position:"absolute",inset:0,width:"100%",height:"100%",zIndex:0,pointerEvents:"none",display:"block"}}>
    <defs><linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor={from}/>
      <stop offset={accent ? "55%" : "100%"} stopColor={to}/>
      {accent && <stop offset="100%" stopColor={accent}/>}
    </linearGradient></defs>
    <rect x="0" y="0" width="1000" height="100" fill={`url(#${id})`}/>
  </svg>;
}

export default function IdentityCredentialCard({
  credential,
  design,
  subject,
  branding,
  side = "front",
  scale = 1,
  className,
}: IdentityCredentialCardProps) {
  const landscape = design.orientation !== "portrait";
  const template = String(design.templateKey || "modern_clean");
  const premium = template === "premium_gradient";
  const classic = template === "classic_school";
  const compact = template === "compact_qr_pass";
  const width = landscape ? 380 : 240;
  const height = landscape ? 240 : 380;
  const visible = design.visibleFields || {};
  const labels = design.customLabels || {};
  const primary = design.primaryColor || "#2f6fed";
  const secondary = design.secondaryColor || "#172554";
  const background = design.backgroundColor || "#ffffff";
  const text = design.textColor || "#111827";
  const muted = design.mutedTextColor || "#64748b";
  const border = design.borderColor || primary;
  const qrPosition = design.qrPosition || "front_right";
  const qrSize = design.qrSize || "medium";
  const schoolLogoSources = branding.schoolLogoCandidates?.length
    ? branding.schoolLogoCandidates : [branding.schoolLogoUrl];
  const branchLogoSources = branding.branchLogoCandidates?.length
    ? branding.branchLogoCandidates : [branding.branchLogoUrl];
  const logos = [
    design.showSchoolLogo !== false && schoolLogoSources.some(Boolean)
      ? {key: "school", sources: schoolLogoSources} : null,
    design.showBranchLogo !== false && branchLogoSources.some(Boolean) &&
      !(schoolLogoSources[0] && schoolLogoSources[0] === branchLogoSources[0] && design.showSchoolLogo !== false)
      ? {key: "branch", sources: branchLogoSources} : null,
  ].filter(Boolean) as {key:string;sources:(string|null|undefined)[]}[];
  const showQr = design.showQrCode !== false && Boolean(qrValue(credential));
  const qrOnBack = qrPosition.startsWith("back_");

  const fieldRows = [
    visible.admissionNumber !== false && subject.admissionNumber
      ? [labels.admissionNumber || "Student ID", subject.admissionNumber]
      : null,
    visible.staffNumber && subject.staffNumber
      ? [labels.staffNumber || "Staff ID", subject.staffNumber]
      : null,
    visible.className !== false && subject.className
      ? [labels.className || "Class", subject.className]
      : null,
    visible.organizationName && subject.organizationName
      ? [labels.organizationName || "Organization", subject.organizationName]
      : null,
    visible.academicYear && subject.academicYear
      ? [labels.academicYear || "Academic Year", subject.academicYear]
      : null,
    visible.gender && subject.gender
      ? [labels.gender || "Gender", subject.gender]
      : null,
    visible.dateOfBirth && subject.dateOfBirth
      ? [labels.dateOfBirth || "Date of birth", readableDate(subject.dateOfBirth) || subject.dateOfBirth]
      : null,
    visible.phone && subject.phone
      ? [labels.phone || "Phone", subject.phone]
      : null,
    visible.emergencyPhone && subject.emergencyPhone
      ? [labels.emergencyPhone || "Emergency", subject.emergencyPhone]
      : null,
  ].filter(Boolean) as string[][];

  const cardStyle: React.CSSProperties = {
    width,
    height,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
    position: "relative",
    overflow: "hidden",
    border:
      design.borderStyle === "none"
        ? "none"
        : `${design.borderStyle === "double" ? 3 : 1}px ${design.borderStyle === "double" ? "double" : "solid"} ${border}`,
    borderRadius: Math.max(0, Number(design.borderRadiusPx ?? 16)),
    background: premium ? `linear-gradient(145deg,${background},#f4f7fc)` : background,
    color: text,
    fontFamily: classic ? "Georgia,serif" : "inherit",
    boxSizing: "border-box",
    boxShadow:
      design.borderStyle === "accent"
        ? `inset 6px 0 0 ${primary}, 0 10px 28px rgba(15,23,42,.12)`
        : "0 10px 28px rgba(15,23,42,.12)",
  };

  if (side === "back") {
    return (
      <article className={`eleeveon-identity-card ${className || ""}`} style={cardStyle}>
        <div style={{height:8,position:"relative",overflow:"hidden",background:primary}}>
          <PrintableGradient from={primary} to={secondary}/>
        </div>
        <div
          style={{
            padding: 18,
            height: "calc(100% - 8px)",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {logos.length > 0 && <div style={{display:"flex",gap:6}}>{logos.map(item => (
          <CardAssetImage key={item.key} sources={item.sources} alt={`${item.key} logo`}
            style={{width:42,height:42,objectFit:"contain"}} />
        ))}</div>}
          {design.showSchoolName !== false && <strong style={{ fontSize: 15 }}>{branding.schoolName}</strong>}
          {design.showBranchName !== false && branding.branchName && <span style={{fontSize:10}}>{branding.branchName}</span>}
          {design.showMotto !== false && branding.motto && <span style={{fontSize:10,color:muted}}>{branding.motto}</span>}
          {branding.address && design.showAddress !== false ? (
            <span style={{ fontSize: 10, color: muted }}>{branding.address}</span>
          ) : null}
          {showQr && qrOnBack && <IdentityQrCode value={qrValue(credential)} size={qrSize} />}
          {design.showCredentialReference !== false &&
          credential?.credentialReference ? (
            <code style={{ fontSize: 9, wordBreak: "break-all" }}>
              {credential.credentialReference}
            </code>
          ) : null}
          {design.showSignature && <div style={{fontSize:9,marginTop:"auto"}}>
            <CardAssetImage sources={branding.signatureCandidates?.length ? branding.signatureCandidates : [branding.signatureUrl]}
              alt="Authorized signature" style={{height:32,maxWidth:100,objectFit:"contain"}} />
            <span style={{display:"block",borderTop:`1px solid ${muted}`,paddingTop:3}}>{design.signatureLabel || "Authorized Signature"}</span>
          </div>}
          <p style={{ margin: "auto 0 0", fontSize: 9, color: muted }}>
            {design.footerText ||
              "This credential remains the property of the issuing school."}
          </p>
        </div>
      </article>
    );
  }

  const qrSideBack = qrOnBack;
  const qrAbsolute: React.CSSProperties =
    qrPosition === "front_left"
      ? { bottom: 18, left: 12 }
      : qrPosition === "front_center"
        ? { bottom: 12, left: "50%", transform: "translateX(-50%)" }
        : { bottom: 18, right: 12 };

  return (
    <article className={`eleeveon-identity-card ${className || ""}`} style={cardStyle}>
      <header
        style={{
          minHeight: compact ? 34 : classic ? 56 : 44,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "#fff",
          position: "relative",
          isolation: "isolate",
          overflow: "hidden",
          background: classic ? primary : secondary,
        }}
      >
        <PrintableGradient from={primary} to={classic ? primary : secondary}
          accent={premium ? (design.accentColor || primary) : undefined}/>
        {logos.map(item => <div key={item.key} style={{position:"relative",zIndex:1,flex:"0 0 auto"}}>
          <CardAssetImage sources={item.sources} alt={`${item.key} logo`}
            style={{width:30,height:30,borderRadius:6,objectFit:"contain",background:"#fff",padding:2}} />
        </div>)}
        <div style={{ minWidth: 0, position:"relative",zIndex:1 }}>
          {design.showSchoolName !== false ? (
            <strong
              style={{
                display: "block",
                fontSize: 12,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {branding.schoolName}
            </strong>
          ) : null}
          {design.showMotto !== false && branding.motto && <span style={{ display: "block", fontSize: 8, opacity: 0.9 }}>{branding.motto}</span>}
          {design.showBranchName !== false && branding.branchName ? (
            <span style={{ display: "block", fontSize: 8, opacity: 0.9 }}>
              {branding.branchName}
            </span>
          ) : null}
        </div>
      </header>

      {design.watermarkText ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: landscape ? 38 : 28,
            opacity: Number(design.watermarkOpacity ?? 0.06),
            transform: "rotate(-28deg)",
            pointerEvents: "none",
          }}
        >
          {design.watermarkText}
        </div>
      ) : null}

      <div
        style={{
          padding: 14,
          display: "grid",
          gridTemplateColumns: landscape ? "82px 1fr" : "1fr",
          gap: 12,
        }}
      >
        {design.showPhoto !== false && (
          <CardAssetImage
            sources={subject.photoCandidates?.length ? subject.photoCandidates : [subject.photoUrl]}
            alt="Cardholder photo"
            style={{
              width: landscape ? 76 : 88,
              height: landscape ? 86 : 102,
              justifySelf: landscape ? "start" : "center",
              objectFit: "cover",
              borderRadius: design.photoShape === "circle" ? "50%" : design.photoShape === "square" ? 4 : 12,
              border: `2px solid ${primary}`,
            }}
            fallback={<div style={{
              width: landscape ? 76 : 88, height: landscape ? 86 : 102,
              justifySelf: landscape ? "start" : "center", display: "grid", placeItems: "center",
              borderRadius: design.photoShape === "circle" ? "50%" : design.photoShape === "square" ? 4 : 12,
              background: `${primary}18`, color: primary, fontWeight: 800, fontSize: 28,
            }}>
              {subject.fullName.split(/\s+/).slice(0, 2)
                .map(part => part[0]).join("").toUpperCase()}
            </div>}
          />
        )}

        <div style={{ minWidth: 0 }}>
          {visible.fullName !== false ? (
            <h3
              style={{
                margin: "0 0 7px",
                fontSize: landscape ? 16 : 15,
                lineHeight: 1.15,
              }}
            >
              {subject.fullName}
            </h3>
          ) : null}

          {fieldRows.map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "grid",
                gridTemplateColumns: "72px 1fr",
                gap: 4,
                fontSize: 9,
                marginBottom: 4,
              }}
            >
              <span style={{ color: muted }}>{label}</span>
              <b style={{ overflowWrap: "anywhere" }}>{value}</b>
            </div>
          ))}

          {design.showCredentialReference !== false && credential?.credentialReference &&
            (design.sides === "front_only" || !design.sides) && (
            <div style={{fontSize:8,color:muted,overflowWrap:"anywhere"}}>{credential.credentialReference}</div>
          )}
          {design.showIssueDate && credential?.generatedAt ? (
            <small style={{ display: "block", color: muted, fontSize: 8 }}>
              Issued: {readableDate(credential.generatedAt)}
            </small>
          ) : null}
          {design.showExpiryDate && credential?.expiresAt ? (
            <small style={{ display: "block", color: muted, fontSize: 8 }}>
              Expires: {readableDate(credential.expiresAt)}
            </small>
          ) : null}
        </div>
      </div>

      {showQr && !qrSideBack ? (
        <div style={{ position: "absolute", ...qrAbsolute }}>
          <IdentityQrCode value={qrValue(credential)} size={qrSize} />
        </div>
      ) : null}

      {design.showSignature && (design.sides === "front_only" || !design.sides) && <div
        style={{position:"absolute",bottom:36,left:12,fontSize:8}}>
        <CardAssetImage sources={branding.signatureCandidates?.length ? branding.signatureCandidates : [branding.signatureUrl]}
          alt="Authorized signature" style={{display:"block",height:25,maxWidth:88,objectFit:"contain"}} />
        <span style={{borderTop:`1px solid ${muted}`}}>{design.signatureLabel || "Authorized Signature"}</span>
      </div>}
      {design.showAddress && branding.address && <div style={{position:"absolute",bottom:24,left:12,right:12,fontSize:8,color:muted}}>{branding.address}</div>}
      <footer
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 8,
          maxWidth: showQr && !qrSideBack ? "56%" : "100%",
          fontSize: 7.5,
          color: muted,
        }}
      >
        {design.footerText || (design.showMotto !== false ? branding.motto : "") || "Official school credential"}
      </footer>
    </article>
  );
}
