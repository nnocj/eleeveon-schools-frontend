"use client";

/**
 * app/parent/modules/Parentprofile.tsx
 * ---------------------------------------------------------
 * PARENT PORTAL — PROFILE
 * ---------------------------------------------------------
 *
 * Parent-scoped profile editor:
 * - No school selector.
 * - No branch selector.
 * - Uses active parent membership.
 * - Lets parent update respectful title, name, contact, address,
 *   occupation, emergency contact, relationship, photo, and cover photo.
 *
 * Designed to match the newer portal module style:
 * - Mobile-first
 * - Theme-variable friendly
 * - Card + form layout
 * - Smart selectors to avoid unnecessary typing
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  db,
  Parent,
  Student,
  StudentParent,
} from "../../lib/db";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type ParentForm = {
  title: string;
  fullName: string;
  phone: string;
  email: string;
  address: string;
  occupation: string;
  emergencyContact: string;
  relationship: "father" | "mother" | "guardian";
  photo: string;
  coverPhoto: string;
};

type Props = {
  navigate?: (key: string) => void;
};

// ======================================================
// CONSTANTS
// ======================================================

const TITLE_OPTIONS = [
  { label: "No title", value: "" },
  { label: "Mr.", value: "Mr." },
  { label: "Mrs.", value: "Mrs." },
  { label: "Miss", value: "Miss" },
  { label: "Ms.", value: "Ms." },
  { label: "Dr.", value: "Dr." },
  { label: "Prof.", value: "Prof." },
  { label: "Rev.", value: "Rev." },
  { label: "Pastor", value: "Pastor" },
  { label: "Imam", value: "Imam" },
  { label: "Alhaji", value: "Alhaji" },
  { label: "Hajia", value: "Hajia" },
  { label: "Nana", value: "Nana" },
  { label: "Custom", value: "__custom__" },
];

const RELATIONSHIP_OPTIONS: { label: string; value: ParentForm["relationship"] }[] = [
  { label: "Father", value: "father" },
  { label: "Mother", value: "mother" },
  { label: "Guardian", value: "guardian" },
];

const OCCUPATION_SUGGESTIONS = [
  "Teacher",
  "Trader",
  "Nurse",
  "Doctor",
  "Engineer",
  "Driver",
  "Farmer",
  "Business Owner",
  "Civil Servant",
  "Pastor",
  "Student",
  "Self-employed",
  "Other",
];

// ======================================================
// HELPERS
// ======================================================

const now = () => Date.now();

const normalizePhone = (value: string) => value.trim().replace(/\s+/g, " ");

const parentDisplayName = (parent?: Parent | ParentForm) => {
  if (!parent?.fullName) return "Parent";

  const title = String(parent.title || "").trim();
  const name = String(parent.fullName || "").trim();

  if (!title) return name;

  const normalizedTitle = title.replace(/\.$/, "").toLowerCase();
  const lowerName = name.toLowerCase();

  if (
    lowerName.startsWith(`${normalizedTitle} `) ||
    lowerName.startsWith(`${normalizedTitle}. `)
  ) {
    return name;
  }

  return `${title} ${name}`;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "P";

const toForm = (parent?: Parent): ParentForm => ({
  title: parent?.title || "",
  fullName: parent?.fullName || "",
  phone: parent?.phone || "",
  email: parent?.email || "",
  address: parent?.address || "",
  occupation: parent?.occupation || "",
  emergencyContact: parent?.emergencyContact || "",
  relationship: parent?.relationship || "guardian",
  photo: parent?.photo || "",
  coverPhoto: parent?.coverPhoto || "",
});

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ======================================================
// COMPONENT
// ======================================================

export default function Parentprofile({ navigate }: Props) {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const membershipContext = useActiveMembership() as any;

  const activeMembership = membershipContext?.activeMembership;
  const activeParentId =
    membershipContext?.activeParentId ||
    activeMembership?.parentLocalId ||
    undefined;

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [parents, setParents] = useState<Parent[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  const [form, setForm] = useState<ParentForm>(toForm());
  const [customTitleOpen, setCustomTitleOpen] = useState(false);
  const [customOccupationOpen, setCustomOccupationOpen] = useState(false);
  const [message, setMessage] = useState("");

  // ======================================================
  // AUTH PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/owner");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
    router,
  ]);

  // ======================================================
  // DATA LOADING
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const clearData = () => {
    setParents([]);
    setSelectedParentId(null);
    setStudentParents([]);
    setStudents([]);
    setForm(toForm());
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [parentRows, studentParentRows, studentRows] = await Promise.all([
        db.parents.toArray(),
        db.studentParents.toArray(),
        db.students.toArray(),
      ]);

      const scopedParents = parentRows.filter(sameTenant);
      const scopedStudentParents = studentParentRows.filter(sameTenant);
      const scopedStudents = studentRows.filter(sameTenant);

      const parentIds = new Set<number>();

      if (activeParentId) parentIds.add(Number(activeParentId));
      if (activeMembership?.parentLocalId) parentIds.add(Number(activeMembership.parentLocalId));

      const userEmail = String((activeMembership as any)?.email || "").toLowerCase();

      scopedParents
        .filter((parent) => userEmail && String(parent.email || "").toLowerCase() === userEmail)
        .forEach((parent) => {
          if (parent.id) parentIds.add(parent.id);
        });

      const linkedParents = parentIds.size
        ? scopedParents.filter((parent) => parent.id && parentIds.has(parent.id))
        : scopedParents;

      const primaryParent =
        linkedParents.find((parent) => parent.id === Number(activeParentId)) ||
        linkedParents[0];

      const selectedId = primaryParent?.id || null;

      const linkedStudentParents = selectedId
        ? scopedStudentParents.filter((link) => link.parentId === selectedId)
        : [];

      const childIds = new Set(linkedStudentParents.map((link) => link.studentId));
      const linkedStudents = scopedStudents.filter((student) => student.id && childIds.has(student.id));

      setParents(linkedParents);
      setSelectedParentId(selectedId);
      setStudentParents(linkedStudentParents);
      setStudents(linkedStudents);
      setForm(toForm(primaryParent));

      const selectedTitle = primaryParent?.title || "";
      setCustomTitleOpen(Boolean(selectedTitle && !TITLE_OPTIONS.some((opt) => opt.value === selectedTitle)));
      setCustomOccupationOpen(Boolean(primaryParent?.occupation && !OCCUPATION_SUGGESTIONS.includes(primaryParent.occupation)));
    } catch (error) {
      console.error("Failed to load parent profile:", error);
      clearData();
      alert("Failed to load parent profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, activeParentId]);

  // ======================================================
  // DERIVED
  // ======================================================

  const currentParent = useMemo(
    () => parents.find((parent) => parent.id === selectedParentId),
    [parents, selectedParentId]
  );

  const primaryChildren = useMemo(() => {
    return students.map((student) => {
      const link = studentParents.find((row) => row.studentId === student.id);
      return {
        student,
        relationship: link?.relationship || "guardian",
        isPrimary: Boolean(link?.isPrimary),
      };
    });
  }, [students, studentParents]);

  const completion = useMemo(() => {
    const fields = [
      form.title,
      form.fullName,
      form.phone,
      form.email,
      form.address,
      form.occupation,
      form.emergencyContact,
      form.relationship,
      form.photo,
    ];

    const filled = fields.filter((value) => String(value || "").trim()).length;
    return Math.round((filled / fields.length) * 100);
  }, [form]);

  // ======================================================
  // ACTIONS
  // ======================================================

  const updateForm = <K extends keyof ParentForm>(key: K, value: ParentForm[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
    setMessage("");
  };

  const handleTitleChange = (value: string) => {
    if (value === "__custom__") {
      setCustomTitleOpen(true);
      updateForm("title", "");
      return;
    }

    setCustomTitleOpen(false);
    updateForm("title", value);
  };

  const handleOccupationChange = (value: string) => {
    if (value === "Other") {
      setCustomOccupationOpen(true);
      updateForm("occupation", "");
      return;
    }

    setCustomOccupationOpen(false);
    updateForm("occupation", value);
  };

  const handleImageUpload = async (key: "photo" | "coverPhoto", file?: File | null) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    updateForm(key, dataUrl);
  };

  const validate = () => {
    if (!form.fullName.trim()) return "Full name is required.";
    if (!form.phone.trim()) return "Phone number is required.";

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Please enter a valid email address.";
    }

    return "";
  };

  const save = async () => {
    const error = validate();
    if (error) {
      setMessage(error);
      return;
    }

    if (!selectedParentId || !currentParent) {
      setMessage("No parent profile was found to update.");
      return;
    }

    try {
      setSaving(true);

      await db.parents.update(selectedParentId, {
        title: form.title.trim(),
        fullName: form.fullName.trim(),
        phone: normalizePhone(form.phone),
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        occupation: form.occupation.trim() || undefined,
        emergencyContact: normalizePhone(form.emergencyContact) || undefined,
        relationship: form.relationship,
        photo: form.photo || undefined,
        coverPhoto: form.coverPhoto || undefined,
        updatedAt: now(),
        version: Number(currentParent.version || 0) + 1,
        synced: "pending" as any,
      } as Partial<Parent>);

      setMessage("Profile updated successfully.");
      await load();
    } catch (error) {
      console.error("Failed to save parent profile:", error);
      setMessage("Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="pprof-page" style={{ "--pprof-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="pprof-state-card">
          <div className="pprof-spinner" />
          <h2>Opening profile...</h2>
          <p>Checking your parent profile and linked children.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="pprof-page" style={{ "--pprof-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="pprof-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before editing your profile.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="pprof-page" style={{ "--pprof-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="pprof-state-card">
          <h2>Assigned school branch required</h2>
          <p>Your parent profile must be linked to a school branch.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="pprof-page" style={{ "--pprof-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="pprof-hero">
        <div className="pprof-hero-left">
          <div className="pprof-hero-avatar">
            {form.photo ? <img src={form.photo} alt={parentDisplayName(form)} /> : initials(form.fullName)}
          </div>

          <div className="pprof-title-wrap">
            <p>Parent Profile</p>
            <h2>{parentDisplayName(form)}</h2>
            <span>{activeSchool?.name || "School"} · {activeBranch?.name || "Branch"}</span>
          </div>
        </div>

        <div className="pprof-hero-actions">
          <button type="button" className="pprof-ghost-btn" onClick={load}>
            Refresh
          </button>
          <button type="button" className="pprof-primary-btn" disabled={saving} onClick={save}>
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </section>

      <section className="pprof-context-grid">
        <article>
          <div className="pprof-context-icon">👨‍👩‍👧</div>
          <div>
            <span>Linked Children</span>
            <strong>{students.length}</strong>
            <p>Your profile is linked only to children in your assigned branch.</p>
          </div>
        </article>

        <article>
          <div className="pprof-context-icon">✅</div>
          <div>
            <span>Profile Completion</span>
            <strong>{completion}%</strong>
            <p>Complete your details so the school can reach you quickly.</p>
          </div>
        </article>
      </section>

      {message && (
        <section className={`pprof-message ${message.includes("success") ? "success" : "warning"}`}>
          {message}
        </section>
      )}

      <section className="pprof-main-grid">
        <section className="pprof-card pprof-preview-card">
          <div className="pprof-cover">
            {form.coverPhoto ? <img src={form.coverPhoto} alt="Profile cover" /> : <span>Parent Profile</span>}
          </div>

          <div className="pprof-preview-content">
            <div className="pprof-preview-avatar">
              {form.photo ? <img src={form.photo} alt={parentDisplayName(form)} /> : initials(form.fullName)}
            </div>

            <h3>{parentDisplayName(form)}</h3>
            <p>{form.relationship ? form.relationship : "guardian"} · {form.phone || "No phone yet"}</p>

            <div className="pprof-chip-row">
              <Chip tone="blue">{form.title || "No title"}</Chip>
              <Chip tone="gray">{form.occupation || "Occupation not set"}</Chip>
              <Chip tone={completion >= 80 ? "green" : "orange"}>{completion}% complete</Chip>
            </div>
          </div>

          <div className="pprof-upload-grid">
            <label>
              <span>Profile Photo</span>
              <input type="file" accept="image/*" onChange={(event) => handleImageUpload("photo", event.target.files?.[0])} />
            </label>

            <label>
              <span>Cover Photo</span>
              <input type="file" accept="image/*" onChange={(event) => handleImageUpload("coverPhoto", event.target.files?.[0])} />
            </label>
          </div>
        </section>

        <section className="pprof-card">
          <div className="pprof-section-head">
            <div>
              <p>Respectful Identity</p>
              <h3>How should the school address you?</h3>
            </div>
          </div>

          <div className="pprof-form-grid">
            <label>
              <span>Preferred Title</span>
              <select value={customTitleOpen ? "__custom__" : form.title} onChange={(event) => handleTitleChange(event.target.value)}>
                {TITLE_OPTIONS.map((option) => (
                  <option key={option.value || "none"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {customTitleOpen && (
              <label>
                <span>Custom Title</span>
                <input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  placeholder="Example: Nana, Elder, Lady"
                />
              </label>
            )}

            <label className="wide">
              <span>Full Name</span>
              <input
                value={form.fullName}
                onChange={(event) => updateForm("fullName", event.target.value)}
                placeholder="Enter full name"
              />
            </label>

            <label>
              <span>Relationship</span>
              <select value={form.relationship} onChange={(event) => updateForm("relationship", event.target.value as ParentForm["relationship"])}>
                {RELATIONSHIP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Occupation</span>
              <select value={customOccupationOpen ? "Other" : form.occupation} onChange={(event) => handleOccupationChange(event.target.value)}>
                <option value="">Select occupation</option>
                {OCCUPATION_SUGGESTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            {customOccupationOpen && (
              <label>
                <span>Custom Occupation</span>
                <input
                  value={form.occupation}
                  onChange={(event) => updateForm("occupation", event.target.value)}
                  placeholder="Enter occupation"
                />
              </label>
            )}
          </div>
        </section>

        <section className="pprof-card">
          <div className="pprof-section-head">
            <div>
              <p>Contact Details</p>
              <h3>How can the school reach you?</h3>
            </div>
          </div>

          <div className="pprof-form-grid">
            <label>
              <span>Phone Number</span>
              <input
                value={form.phone}
                onChange={(event) => updateForm("phone", event.target.value)}
                placeholder="Example: 024 000 0000"
              />
            </label>

            <label>
              <span>Email Address</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateForm("email", event.target.value)}
                placeholder="name@example.com"
              />
            </label>

            <label>
              <span>Emergency Contact</span>
              <input
                value={form.emergencyContact}
                onChange={(event) => updateForm("emergencyContact", event.target.value)}
                placeholder="Alternative phone number"
              />
            </label>

            <label className="wide">
              <span>Address</span>
              <textarea
                value={form.address}
                onChange={(event) => updateForm("address", event.target.value)}
                placeholder="Residential address"
              />
            </label>
          </div>
        </section>

        <section className="pprof-card">
          <div className="pprof-section-head">
            <div>
              <p>Linked Children</p>
              <h3>Children connected to this profile</h3>
            </div>

            {navigate && (
              <button type="button" onClick={() => navigate("children")}>
                View children
              </button>
            )}
          </div>

          <div className="pprof-child-list">
            {primaryChildren.map(({ student, relationship, isPrimary }) => (
              <article key={student.id} className="pprof-child-card">
                <div className="pprof-child-avatar">
                  {student.photo ? <img src={student.photo} alt={student.fullName} /> : initials(student.fullName)}
                </div>

                <div>
                  <strong>{student.fullName}</strong>
                  <span>{student.admissionNumber || "No admission number"}</span>
                  <div className="pprof-chip-row">
                    <Chip tone="blue">{relationship}</Chip>
                    {isPrimary && <Chip tone="green">Primary contact</Chip>}
                  </div>
                </div>
              </article>
            ))}

            {!primaryChildren.length && (
              <EmptyCard text="No children are linked to this parent profile yet." />
            )}
          </div>
        </section>
      </section>

      <section className="pprof-save-bar">
        <div>
          <strong>{parentDisplayName(form)}</strong>
          <span>{completion}% profile completion</span>
        </div>

        <button type="button" disabled={saving} onClick={save}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </section>
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`pprof-chip ${tone}`}>{children}</span>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="pprof-empty-card">
      <div className="pprof-empty-icon">👤</div>
      <h3>No data yet</h3>
      <p>{text}</p>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes pprofSpin { to { transform: rotate(360deg); } }

.pprof-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(92px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--pprof-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111111);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.pprof-page *,
.pprof-page *::before,
.pprof-page *::after {
  box-sizing: border-box;
}

.pprof-page button,
.pprof-page input,
.pprof-page select,
.pprof-page textarea {
  font: inherit;
  max-width: 100%;
}

.pprof-page input,
.pprof-page select,
.pprof-page textarea {
  width: 100%;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111111));
  outline: none;
  font-weight: 750;
}

.pprof-page input,
.pprof-page select {
  min-height: 44px;
}

.pprof-page textarea {
  min-height: 92px;
  padding-top: 10px;
  resize: vertical;
}

.pprof-page input:focus,
.pprof-page select:focus,
.pprof-page textarea:focus {
  border-color: var(--pprof-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--pprof-primary) 12%, transparent);
}

.pprof-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.08));
  text-align: center;
}

.pprof-state-card h2 {
  margin: 0;
  color: var(--text, #111111);
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.pprof-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.pprof-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--pprof-primary) 18%, transparent);
  border-top-color: var(--pprof-primary);
  animation: pprofSpin .8s linear infinite;
}

.pprof-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--pprof-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card-bg, var(--surface, #fff)), color-mix(in srgb, var(--pprof-primary) 7%, var(--card-bg, #fff)) 72%);
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}

.pprof-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.pprof-hero-avatar,
.pprof-preview-avatar,
.pprof-child-avatar {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  background: var(--pprof-primary);
  color: #fff;
  font-weight: 1000;
  overflow: hidden;
}

.pprof-hero-avatar {
  width: 54px;
  height: 54px;
  border-radius: 20px;
  font-size: 20px;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--pprof-primary) 28%, transparent);
}

.pprof-hero-avatar img,
.pprof-preview-avatar img,
.pprof-child-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pprof-title-wrap {
  min-width: 0;
}

.pprof-title-wrap p,
.pprof-title-wrap h2,
.pprof-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pprof-title-wrap p {
  margin: 0 0 2px;
  color: var(--pprof-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.pprof-title-wrap h2 {
  margin: 0;
  color: var(--text, #111111);
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.pprof-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.pprof-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.pprof-ghost-btn,
.pprof-primary-btn,
.pprof-save-bar button,
.pprof-section-head button {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-weight: 950;
  cursor: pointer;
}

.pprof-ghost-btn,
.pprof-section-head button {
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--surface, #fff);
  color: var(--text, #111111);
}

.pprof-primary-btn,
.pprof-save-bar button {
  border: 0;
  background: var(--pprof-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--pprof-primary) 25%, transparent);
}

.pprof-primary-btn:disabled,
.pprof-save-bar button:disabled {
  opacity: .58;
  cursor: not-allowed;
}

.pprof-context-grid,
.pprof-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.pprof-context-grid article,
.pprof-card,
.pprof-message,
.pprof-save-bar {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.pprof-context-grid article {
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 22px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--pprof-primary) 10%, var(--card-bg, var(--surface, #fff))), var(--card-bg, var(--surface, #fff)) 70%);
}

.pprof-context-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--pprof-primary);
  color: #fff;
  font-size: 20px;
}

.pprof-context-grid article > div:last-child {
  min-width: 0;
}

.pprof-context-grid span {
  display: block;
  color: var(--pprof-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.pprof-context-grid strong {
  display: block;
  margin-top: 3px;
  color: var(--text, #111111);
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.pprof-context-grid p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.pprof-message {
  margin-top: 10px;
  padding: 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 900;
}

.pprof-message.success {
  background: rgba(34,197,94,.12);
  color: #22c55e;
}

.pprof-message.warning {
  background: rgba(245,158,11,.14);
  color: #f59e0b;
}

.pprof-card {
  min-width: 0;
  border-radius: 26px;
  padding: 12px;
  overflow: hidden;
}

.pprof-cover {
  height: 150px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background:
    radial-gradient(circle at 18% 12%, color-mix(in srgb, var(--pprof-primary) 28%, transparent), transparent 18rem),
    color-mix(in srgb, var(--pprof-primary) 10%, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  overflow: hidden;
}

.pprof-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pprof-cover span {
  color: var(--pprof-primary);
  font-size: 13px;
  font-weight: 1000;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.pprof-preview-content {
  display: grid;
  place-items: center;
  text-align: center;
  margin-top: -42px;
}

.pprof-preview-avatar {
  width: 84px;
  height: 84px;
  border-radius: 30px;
  border: 4px solid var(--card-bg, var(--surface, #fff));
  font-size: 28px;
}

.pprof-preview-content h3 {
  margin: 8px 0 0;
  color: var(--text, #111111);
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.pprof-preview-content p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 800;
  text-transform: capitalize;
}

.pprof-upload-grid,
.pprof-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 9px;
  margin-top: 12px;
}

.pprof-upload-grid label,
.pprof-form-grid label {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.pprof-upload-grid label span,
.pprof-form-grid label span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.pprof-upload-grid input[type="file"] {
  min-height: 44px;
  padding: 10px;
}

.pprof-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.pprof-section-head div {
  min-width: 0;
}

.pprof-section-head p {
  margin: 0;
  color: var(--pprof-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.pprof-section-head h3 {
  margin: 2px 0 0;
  color: var(--text, #111111);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.pprof-section-head button {
  flex: 0 0 auto;
  min-height: 36px;
  font-size: 12px;
}

.pprof-chip-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.pprof-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}

.pprof-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.pprof-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.pprof-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.pprof-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.pprof-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.pprof-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }

.pprof-child-list {
  display: grid;
  gap: 9px;
}

.pprof-child-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--muted, #64748b) 7%, transparent);
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.pprof-child-avatar {
  width: 48px;
  height: 48px;
  border-radius: 17px;
  font-size: 18px;
}

.pprof-child-card div:last-child {
  min-width: 0;
}

.pprof-child-card strong,
.pprof-child-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pprof-child-card strong {
  color: var(--text, #111111);
  font-size: 14px;
  font-weight: 1000;
}

.pprof-child-card span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.pprof-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 160px;
  border-radius: 20px;
  text-align: center;
  border: 1px dashed var(--border, rgba(0,0,0,.10));
  padding: 14px;
  background: var(--card-bg, var(--surface, #fff));
}

.pprof-empty-icon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 20px;
  background: color-mix(in srgb, var(--pprof-primary) 12%, var(--surface, #fff));
  font-size: 25px;
}

.pprof-empty-card h3 {
  margin: 0;
  color: var(--text, #111111);
  font-size: 16px;
  font-weight: 1000;
}

.pprof-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.6;
}

.pprof-save-bar {
  position: sticky;
  bottom: 10px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  padding: 10px;
  border-radius: 22px;
  backdrop-filter: blur(14px);
}

.pprof-save-bar div {
  min-width: 0;
}

.pprof-save-bar strong,
.pprof-save-bar span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pprof-save-bar strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
}

.pprof-save-bar span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 800;
}

@media (min-width: 700px) {
  .pprof-page {
    padding: calc(12px * var(--local-density-scale, 1));
  }

  .pprof-context-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pprof-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pprof-form-grid .wide {
    grid-column: 1 / -1;
  }

  .pprof-upload-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1080px) {
  .pprof-page {
    padding: calc(16px * var(--local-density-scale, 1));
  }

  .pprof-main-grid {
    grid-template-columns: minmax(320px, .78fr) minmax(0, 1.22fr);
    align-items: start;
  }

  .pprof-preview-card {
    position: sticky;
    top: 12px;
  }
}

@media (max-width: 560px) {
  .pprof-page {
    padding: calc(6px * var(--local-density-scale, 1));
  }

  .pprof-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .pprof-hero-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .pprof-ghost-btn,
  .pprof-primary-btn {
    width: 100%;
  }

  .pprof-card {
    border-radius: 22px;
    padding: 10px;
  }

  .pprof-cover {
    height: 124px;
    border-radius: 19px;
  }

  .pprof-section-head {
    align-items: stretch;
    flex-direction: column;
  }

  .pprof-section-head button {
    width: 100%;
  }

  .pprof-save-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .pprof-save-bar button {
    width: 100%;
  }
}
`;
