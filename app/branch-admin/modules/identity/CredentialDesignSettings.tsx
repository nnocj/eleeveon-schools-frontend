"use client";

import React, { useEffect, useState } from "react";
import {
  db,
  type Branch,
  type IdentityCredentialDesignSetting,
  type School,
} from "../../../lib/db/db";
import IdentityCredentialPreview from "./IdentityCredentialPreview";
import { useIdentityCardPresentation, IDENTITY_DESIGN_CHANGED_EVENT } from "./identityCardPresentation";
import { SyncStatus } from "../../../lib/constants/syncStatus";

type Props = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  school?: School | null;
  branch?: Branch | null;
  primaryColor?: string;
  onClose: () => void;
  onSaved?: () => void;
};

const DEFAULT_VISIBLE_FIELDS = {
  fullName: true,
  admissionNumber: true,
  staffNumber: false,
  className: true,
  organizationName: false,
  academicYear: false,
  gender: false,
  dateOfBirth: false,
  phone: false,
  emergencyPhone: false,
};

function deviceId() {
  if (typeof window === "undefined") return "web";
  return (
    localStorage.getItem("eleeveon_device_id") ||
    localStorage.getItem("deviceId") ||
    "web"
  );
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ||
    `identity-design-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultDesign(
  accountId?: string | null,
  schoolId?: string | null,
  branchId?: string | null,
  primaryColor?: string,
): IdentityCredentialDesignSetting {
  const now = Date.now();
  const currentDeviceId = deviceId();
  return {
    id: makeId(),
    accountId: String(accountId || ""),
    schoolId: String(schoolId || ""),
    branchId: branchId || null,
    name: "Default Student ID",
    templateKey: "modern_clean",
    subjectType: "student",
    credentialType: "qr_code",
    orientation: "landscape",
    sides: "front_and_back",
    isDefault: true,
    active: true,
    primaryColor: primaryColor || "#2f6fed",
    secondaryColor: "#172554",
    accentColor: "#f59e0b",
    backgroundColor: "#ffffff",
    textColor: "#111827",
    mutedTextColor: "#64748b",
    borderColor: primaryColor || "#2f6fed",
    borderStyle: "solid",
    borderRadiusPx: 16,
    watermarkText: "",
    watermarkOpacity: 0.06,
    showSchoolLogo: true,
    showBranchLogo: true,
    showSchoolName: true,
    showBranchName: true,
    showMotto: true,
    showAddress: false,
    showPhoto: true,
    photoShape: "rounded",
    showQrCode: true,
    qrPosition: "front_right",
    qrSize: "medium",
    showCredentialReference: true,
    showIssueDate: false,
    showExpiryDate: true,
    showSignature: false,
    signatureLabel: "Authorized Signature",
    visibleFields: { ...DEFAULT_VISIBLE_FIELDS },
    customLabels: {},
    footerText: "Official school identity credential",
    createdAt: now,
    updatedAt: now,
    version: 1,
    deviceId: currentDeviceId,
    createdByDeviceId: currentDeviceId,
    updatedByDeviceId: currentDeviceId,
    synced: SyncStatus.PENDING,
    isDeleted: false,
  };
}

export default function CredentialDesignSettings({
  accountId,
  schoolId,
  branchId,
  school,
  branch,
  primaryColor,
  onClose,
  onSaved,
}: Props) {
  const [designs, setDesigns] = useState<IdentityCredentialDesignSetting[]>([]);
  const [form, setForm] = useState<IdentityCredentialDesignSetting>(() =>
    defaultDesign(accountId, schoolId, branchId, primaryColor),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const { branding } = useIdentityCardPresentation({
    accountId, schoolId: String(schoolId || ""), branchId: String(branchId || ""),
    school: school as any, branch: branch as any,
  });

  const load = async () => {
    if (!accountId || !schoolId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = (await db.identityCredentialDesignSettings.toArray()).filter(
        (row) =>
          String(row.accountId || "") === String(accountId) &&
          String(row.schoolId || "") === String(schoolId) &&
          String(row.branchId || "") === String(branchId || ""),
      );

      const activeRows = rows
        .filter((row) => !row.isDeleted)
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));

      setDesigns(activeRows);
      setForm(
        activeRows[0] ||
          defaultDesign(accountId, schoolId, branchId, primaryColor),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [accountId, schoolId, branchId]);

  const update = <K extends keyof IdentityCredentialDesignSetting>(
    key: K,
    value: IdentityCredentialDesignSetting[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const updateVisible = (key: string, value: boolean) =>
    setForm((current) => ({
      ...current,
      visibleFields: {
        ...DEFAULT_VISIBLE_FIELDS,
        ...(current.visibleFields || {}),
        [key]: value,
      },
    }));

  const selectDesign = (id: string) => {
    const selected = designs.find((item) => item.id === id);
    if (selected) setForm(selected);
  };

  const createNew = (subjectType: "student" | "teacher") => {
    const teacher = subjectType === "teacher";
    const audienceHasDefault = designs.some(
      (row) => row.subjectType === subjectType && row.isDefault && !row.isDeleted,
    );
    setForm({
      ...defaultDesign(accountId, schoolId, branchId, primaryColor),
      name: teacher ? "Teacher ID" : "Student ID",
      subjectType,
      credentialType: teacher ? "staff_id" : "student_id",
      isDefault: !audienceHasDefault,
      visibleFields: {
        ...DEFAULT_VISIBLE_FIELDS,
        admissionNumber: !teacher,
        staffNumber: teacher,
        className: !teacher,
      },
    });
    setMessage("");
  };

  const save = async () => {
    if (!accountId || !schoolId) {
      setMessage("Account and school context are required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const now = Date.now();
      const currentDeviceId = deviceId();

      if (form.isDefault) {
        // Student and teacher designs can each have their own default.
        // Saving a teacher ID must not unset the student's default layout.
        const otherDefaults = designs.filter(
          (item) => item.id !== form.id && item.isDefault &&
            String(item.subjectType || "all") === String(form.subjectType || "all") &&
            String(item.credentialType || "all") === String(form.credentialType || "all"),
        );
        for (const row of otherDefaults) {
          await db.identityCredentialDesignSettings.put({
            ...row,
            isDefault: false,
            updatedAt: now,
            version: Number(row.version || 0) + 1,
            updatedByDeviceId: currentDeviceId,
            deviceId: currentDeviceId,
            synced: SyncStatus.PENDING,
          });
        }
      }

      const payload: IdentityCredentialDesignSetting = {
        ...form,
        id: form.id || makeId(),
        accountId: String(accountId),
        schoolId: String(schoolId),
        branchId: branchId || null,
        visibleFields: {
          ...DEFAULT_VISIBLE_FIELDS,
          ...(form.visibleFields || {}),
        },
        createdAt: form.createdAt || now,
        updatedAt: now,
        version: Number(form.version || 0) + 1,
        deviceId: currentDeviceId,
        createdByDeviceId: form.createdByDeviceId || currentDeviceId,
        updatedByDeviceId: currentDeviceId,
        synced: SyncStatus.PENDING,
        isDeleted: false,
      };

      await db.identityCredentialDesignSettings.put(payload);
      window.dispatchEvent(new Event(IDENTITY_DESIGN_CHANGED_EVENT));
      setForm(payload);
      setMessage("ID card design saved.");
      await load();
      onSaved?.();
    } catch (error) {
      console.error(error);
      setMessage("ID card design could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="credential-settings-backdrop" role="dialog" aria-modal="true">
      <style>{`
        .credential-settings-backdrop{position:fixed;inset:0;z-index:1100;background:rgba(15,23,42,.58);display:flex;justify-content:flex-end}
        .credential-settings-sheet{width:min(760px,100%);height:100%;overflow:auto;background:var(--surface,#fff);color:var(--text,#111827);padding:18px}
        .credential-settings-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;position:sticky;top:-18px;z-index:5;background:inherit;padding:18px 0 12px;border-bottom:1px solid var(--border,rgba(148,163,184,.3))}
        .credential-settings-head h2{margin:0;font-size:18px}.credential-settings-head p{margin:4px 0 0;font-size:12px;opacity:.68}
        .credential-settings-head button,.credential-settings-actions button,.credential-settings-toolbar button{min-height:36px;border-radius:10px;border:1px solid var(--border,rgba(148,163,184,.35));background:transparent;color:inherit;padding:0 12px}
        .credential-settings-toolbar{display:flex;gap:8px;align-items:center;margin:14px 0;flex-wrap:wrap}.credential-settings-toolbar select{flex:1;min-width:220px}
        .credential-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.credential-settings-grid label{display:grid;gap:5px;font-size:11px;font-weight:700}
        .credential-settings-grid input,.credential-settings-grid select,.credential-settings-toolbar select{min-height:39px;border-radius:10px;border:1px solid var(--border,rgba(148,163,184,.4));background:var(--input-bg,transparent);color:inherit;padding:0 10px}
        .credential-settings-sub{margin-top:16px;padding-top:14px;border-top:1px solid var(--border,rgba(148,163,184,.28))}.credential-settings-sub h3{font-size:13px;margin:0 0 10px}
        .credential-toggle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.credential-toggle{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:9px 10px;border:1px solid var(--border,rgba(148,163,184,.28));border-radius:10px;font-size:11px}
        .credential-settings-actions{position:sticky;bottom:-18px;background:inherit;display:flex;justify-content:flex-end;gap:8px;padding:14px 0 18px;margin-top:18px;border-top:1px solid var(--border,rgba(148,163,184,.3))}
        .credential-settings-actions .primary{background:${primaryColor || "#2f6fed"};border-color:${primaryColor || "#2f6fed"};color:white}
        .credential-settings-message{font-size:12px;margin:8px 0;color:var(--primary-color,#2563eb)}
        @media(max-width:620px){.credential-settings-grid,.credential-toggle-grid{grid-template-columns:1fr}.credential-settings-sheet{padding:14px}.credential-settings-head{top:-14px}}
      `}</style>

      <section className="credential-settings-sheet">
        <header className="credential-settings-head">
          <div>
            <h2>ID Card Designs</h2>
            <p>
              Choose a design for students, teachers or other people. Saved
              options are used when their ID cards are viewed or printed.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="credential-settings-toolbar">
          <select
            value={designs.some((item) => item.id === form.id) ? form.id : ""}
            onChange={(event) => selectDesign(event.target.value)}
            disabled={loading}
          >
            <option value="">
              {loading ? "Loading designs..." : "Unsaved new design"}
            </option>
            {designs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.isDefault ? " — Default" : ""}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => createNew("student")}>
            + Student ID
          </button>
          <button type="button" onClick={() => createNew("teacher")}>
            + Teacher ID
          </button>
        </div>

        <IdentityCredentialPreview design={form} branding={branding} />

        <section className="credential-settings-sub">
          <h3>Template and scope</h3>
          <div className="credential-settings-grid">
            <label>
              Design name
              <input
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </label>
            <label>
              Template
              <select
                value={form.templateKey}
                onChange={(event) =>
                  update("templateKey", event.target.value as any)
                }
              >
                <option value="modern_clean">Modern Clean</option>
                <option value="classic_school">Classic School ID</option>
                <option value="compact_qr_pass">Compact QR Pass</option>
                <option value="premium_gradient">Premium Gradient</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Person type
              <select
                value={form.subjectType || "all"}
                onChange={(event) =>
                  update("subjectType", event.target.value as any)
                }
              >
                <option value="all">All people</option>
                <option value="student">Students</option>
                <option value="teacher">Teachers</option>
                <option value="staff">Staff</option>
                <option value="parent">Parents</option>
                <option value="guardian">Guardians</option>
                <option value="visitor">Visitors</option>
              </select>
            </label>
            <label>
              Credential type
              <select
                value={form.credentialType || "all"}
                onChange={(event) =>
                  update("credentialType", event.target.value as any)
                }
              >
                <option value="all">All credentials</option>
                <option value="qr_code">QR Code</option>
                <option value="student_id">Student ID</option>
                <option value="staff_id">Staff ID</option>
                <option value="parent_pass">Parent Pass</option>
                <option value="visitor_pass">Visitor Pass</option>
                <option value="mobile_pass">Mobile Pass</option>
              </select>
            </label>
            <label>
              Orientation
              <select
                value={form.orientation}
                onChange={(event) =>
                  update("orientation", event.target.value as any)
                }
              >
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
            <label>
              Card sides
              <select
                value={form.sides}
                onChange={(event) => update("sides", event.target.value as any)}
              >
                <option value="front_only">Front only</option>
                <option value="front_and_back">Front and back</option>
              </select>
            </label>
          </div>
        </section>

        <section className="credential-settings-sub">
          <h3>Colour and shape</h3>
          <div className="credential-settings-grid">
            {[
              ["Primary colour", "primaryColor"],
              ["Secondary colour", "secondaryColor"],
              ["Background", "backgroundColor"],
              ["Text colour", "textColor"],
              ["Border colour", "borderColor"],
            ].map(([label, key]) => (
              <label key={key}>
                {label}
                <input
                  type="color"
                  value={String((form as any)[key] || "#ffffff")}
                  onChange={(event) => update(key as any, event.target.value)}
                />
              </label>
            ))}
            <label>
              Border style
              <select
                value={form.borderStyle || "solid"}
                onChange={(event) =>
                  update("borderStyle", event.target.value as any)
                }
              >
                <option value="none">None</option>
                <option value="solid">Solid</option>
                <option value="double">Double</option>
                <option value="accent">Accent</option>
              </select>
            </label>
            <label>
              Corner radius
              <input
                type="number"
                min={0}
                max={40}
                value={Number(form.borderRadiusPx ?? 16)}
                onChange={(event) =>
                  update("borderRadiusPx", Number(event.target.value))
                }
              />
            </label>
            <label>
              Photo shape
              <select
                value={form.photoShape || "rounded"}
                onChange={(event) =>
                  update("photoShape", event.target.value as any)
                }
              >
                <option value="rounded">Rounded</option>
                <option value="circle">Circle</option>
                <option value="square">Square</option>
              </select>
            </label>
          </div>
        </section>

        <section className="credential-settings-sub">
          <h3>QR and visible elements</h3>
          <div className="credential-settings-grid">
            <label>
              QR position
              <select
                value={form.qrPosition || "front_right"}
                onChange={(event) =>
                  update("qrPosition", event.target.value as any)
                }
              >
                <option value="front_left">Front left</option>
                <option value="front_right">Front right</option>
                <option value="front_center">Front centre</option>
                <option value="back_left">Back left</option>
                <option value="back_right">Back right</option>
                <option value="back_center">Back centre</option>
              </select>
            </label>
            <label>
              QR size
              <select
                value={form.qrSize || "medium"}
                onChange={(event) =>
                  update("qrSize", event.target.value as any)
                }
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </label>
            <label>
              Footer
              <input
                value={form.footerText || ""}
                onChange={(event) => update("footerText", event.target.value)}
              />
            </label>
            <label>
              Signature label
              <input value={form.signatureLabel || ""}
                onChange={(event) => update("signatureLabel", event.target.value)} />
            </label>
            <label>
              Watermark opacity
              <input type="number" min={0} max={1} step={0.01}
                value={Number(form.watermarkOpacity ?? 0.06)}
                onChange={(event) => update("watermarkOpacity", Math.max(0,Math.min(1,Number(event.target.value))))}/>
            </label>
            <label>
              Watermark text
              <input
                value={form.watermarkText || ""}
                onChange={(event) => update("watermarkText", event.target.value)}
              />
            </label>
          </div>

          <div className="credential-toggle-grid" style={{ marginTop: 10 }}>
            {[
              ["School logo", "showSchoolLogo"],
              ["Branch logo", "showBranchLogo"],
              ["School name", "showSchoolName"],
              ["Branch name", "showBranchName"],
              ["Photo", "showPhoto"],
              ["Motto", "showMotto"],
              ["Address", "showAddress"],
              ["Authorized signature", "showSignature"],
              ["QR code", "showQrCode"],
              ["Credential reference", "showCredentialReference"],
              ["Issue date", "showIssueDate"],
              ["Expiry date", "showExpiryDate"],
              ["Default design", "isDefault"],
              ["Active", "active"],
            ].map(([label, key]) => (
              <label className="credential-toggle" key={key}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean((form as any)[key])}
                  onChange={(event) => update(key as any, event.target.checked)}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="credential-settings-sub">
          <h3>Information fields</h3>
          <div className="credential-toggle-grid">
            {[
              ["Full name", "fullName"],
              ["Admission number", "admissionNumber"],
              ["Staff number", "staffNumber"],
              ["Class", "className"],
              ["Organization", "organizationName"],
              ["Academic year", "academicYear"],
              ["Gender", "gender"],
              ["Date of birth", "dateOfBirth"],
              ["Phone", "phone"],
              ["Emergency phone", "emergencyPhone"],
            ].map(([label, key]) => (
              <label className="credential-toggle" key={key}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(
                    (form.visibleFields as Record<string, boolean> | undefined)?.[
                      key
                    ],
                  )}
                  onChange={(event) =>
                    updateVisible(key, event.target.checked)
                  }
                />
              </label>
            ))}
          </div>
        </section>

        {message ? (
          <div className="credential-settings-message">{message}</div>
        ) : null}

        <div className="credential-settings-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving..." : "Save ID design"}
          </button>
        </div>
      </section>
    </div>
  );
}
