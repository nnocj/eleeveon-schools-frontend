"use client";

/**
 * Subjects.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE SUBJECT MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: subjects
 *
 * Subject is the reusable academic identity.
 * It is later attached to:
 * - CurriculumSubject for global curriculum rules
 * - ClassSubject for class/period delivery
 * - AssessmentEntry and Reports through ClassSubject
 *
 * Architecture:
 * Active Account -> Active School -> Active Branch -> Subjects
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Soft delete only.
 * - Mobile-first cards and responsive drawer.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SyncStatus } from "../lib/constants/syncStatus";
import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  ClassSubject,
  CurriculumSubject,
  Organization,
  Subject,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type SubjectCategory =
  | "academic"
  | "technical"
  | "vocational"
  | "elective"
  | "core";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type FormState = {
  id?: number;
  organizationId?: number;
  name: string;
  code?: string;
  description?: string;
  photo?: string;
  bannerImage?: string;
  credits?: number;
  category?: SubjectCategory;
  active?: boolean;
};

type SubjectView = {
  row: Subject;
  organizationName: string;
  curriculumUseCount: number;
  classSubjectUseCount: number;
};

const emptyForm: FormState = {
  organizationId: undefined,
  name: "",
  code: "",
  description: "",
  photo: "",
  bannerImage: "",
  credits: undefined,
  category: "academic",
  active: true,
};

function categoryTone(category?: SubjectCategory): "green" | "blue" | "gray" | "orange" | "purple" {
  if (category === "core") return "green";
  if (category === "elective") return "orange";
  if (category === "technical") return "purple";
  if (category === "vocational") return "blue";
  return "gray";
}

function categoryLabel(category?: SubjectCategory) {
  if (!category) return "Academic";
  return category.charAt(0).toUpperCase() + category.slice(1);
}

// ======================================================
// COMPONENT
// ======================================================

export default function SubjectsPage() {
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

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<Subject[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);

  const [search, setSearch] = useState("");
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterCategory, setFilterCategory] = useState<"all" | SubjectCategory>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  // ======================================================
  // AUTH + CONTEXT PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/account");
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
  // LOAD DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const clearData = () => {
    setRows([]);
    setOrganizations([]);
    setCurriculumSubjects([]);
    setClassSubjects([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        subjectRows,
        organizationRows,
        curriculumSubjectRows,
        classSubjectRows,
      ] = await Promise.all([
        db.subjects.toArray(),
        db.organizations.toArray(),
        db.curriculumSubjects.toArray(),
        db.classSubjects.toArray(),
      ]);

      setRows(
        subjectRows
          .filter(sameTenant)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setOrganizations(
        organizationRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setCurriculumSubjects(curriculumSubjectRows.filter(sameTenant));
      setClassSubjects(classSubjectRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load subjects:", error);
      clearData();
      alert("Failed to load subjects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const organizationMap = useMemo(
    () => new Map(organizations.map((row) => [row.id, row])),
    [organizations]
  );

  const curriculumSubjectCountMap = useMemo(() => {
    const map = new Map<number, number>();

    curriculumSubjects.forEach((row) => {
      map.set(row.subjectId, (map.get(row.subjectId) || 0) + 1);
    });

    return map;
  }, [curriculumSubjects]);

  const classSubjectCountMap = useMemo(() => {
    const map = new Map<number, number>();

    classSubjects.forEach((row) => {
      map.set(row.subjectId, (map.get(row.subjectId) || 0) + 1);
    });

    return map;
  }, [classSubjects]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<SubjectView[]>(() => {
    return rows.map((row) => {
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;

      return {
        row,
        organizationName: organization?.name || "No organization",
        curriculumUseCount: curriculumSubjectCountMap.get(row.id || 0) || 0,
        classSubjectUseCount: classSubjectCountMap.get(row.id || 0) || 0,
      };
    });
  }, [rows, organizationMap, curriculumSubjectCountMap, classSubjectCountMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterCategory !== "all" && row.category !== filterCategory) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.code || ""}
          ${row.description || ""}
          ${row.category || ""}
          ${row.credits || ""}
          ${item.organizationName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name));
  }, [viewRows, search, filterOrganizationId, filterCategory, filterStatus]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((row) => row.active !== false).length,
      inactive: rows.filter((row) => row.active === false).length,
      curriculumUsage: curriculumSubjects.length,
      classUsage: classSubjects.length,
      core: rows.filter((row) => row.category === "core").length,
    };
  }, [rows, curriculumSubjects.length, classSubjects.length]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (field: "photo" | "bannerImage", file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [field]: value });
  };

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const openCreate = () => {
    if (!requireTenant()) return;

    setEditMode(false);
    setForm(emptyForm);
    setDrawerOpen(true);
  };

  const openEdit = (row: Subject) => {
    setEditMode(true);

    setForm({
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      code: row.code || "",
      description: row.description || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      credits: row.credits,
      category: row.category || "academic",
      active: row.active ?? true,
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId) return "Select a school first";
    if (!branchId) return "Select a branch first";
    if (!form.name.trim()) return "Enter subject name";

    if (form.organizationId && !organizationMap.get(Number(form.organizationId))) {
      return "Selected organization is not in this branch";
    }

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      const sameName = row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
      const sameCode =
        form.code?.trim() &&
        row.code?.trim().toLowerCase() === form.code.trim().toLowerCase();

      return (sameName || sameCode) && !row.isDeleted;
    });

    if (duplicate) return "A subject with this name or code already exists";

    return null;
  };

  const save = async () => {
    const error = validate();

    if (error) {
      alert(error);
      return;
    }

    if (!authenticated || !accountId || !schoolId || !branchId) return;

    try {
      setSaving(true);

      const existing = editMode && form.id ? rows.find((row) => row.id === form.id) : undefined;

      const payload = prepareSyncData(
        {
          accountId,
          schoolId: Number(schoolId),
          branchId: Number(branchId),
          organizationId: form.organizationId ? Number(form.organizationId) : undefined,
          name: form.name.trim(),
          code: form.code?.trim() || undefined,
          description: form.description?.trim() || undefined,
          photo: form.photo || undefined,
          bannerImage: form.bannerImage || undefined,
          credits: form.credits == null ? undefined : Number(form.credits),
          category: form.category || "academic",
          active: form.active !== false,
        },
        existing
      ) as Subject;

      if (editMode && form.id) {
        await db.subjects.update(form.id, {
          accountId: payload.accountId,
          schoolId: payload.schoolId,
          branchId: payload.branchId,
          cloudId: payload.cloudId,
          createdAt: payload.createdAt,
          organizationId: payload.organizationId,
          name: payload.name,
          code: payload.code,
          description: payload.description,
          photo: payload.photo,
          bannerImage: payload.bannerImage,
          credits: payload.credits,
          category: payload.category,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        } as Partial<Subject>);
      } else {
        await db.subjects.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save subject:", error);
      alert("Failed to save subject");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const curriculumUseCount = curriculumSubjectCountMap.get(id) || 0;
    const classSubjectUseCount = classSubjectCountMap.get(id) || 0;
    const totalUsage = curriculumUseCount + classSubjectUseCount;

    if (totalUsage) {
      const proceed = confirm(
        `This subject is used in ${curriculumUseCount} curriculum subject(s) and ${classSubjectUseCount} class subject(s). Delete anyway?`
      );
      if (!proceed) return;
    } else if (!confirm("Delete this subject?")) {
      return;
    }

    await db.subjects.update(id, {
      isDeleted: true,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<Subject>);

    await load();
  };

  const toggleActive = async (row: Subject) => {
    if (!row.id) return;

    await db.subjects.update(row.id, {
      active: row.active === false,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<Subject>);

    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="sub-page" style={{ "--sub-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sub-state-card">
          <div className="sub-spinner" />
          <h2>Opening subjects...</h2>
          <p>Checking account, branch, subjects, organizations, curriculum links, and class delivery links.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="sub-page" style={{ "--sub-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sub-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing subjects.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="sub-page" style={{ "--sub-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sub-state-card">
          <h2>Select a branch first</h2>
          <p>Subjects belong to one active school branch.</p>
          <button type="button" className="sub-primary-btn" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="sub-page" style={{ "--sub-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sub-hero">
        <div className="sub-hero-left">
          <div className="sub-hero-icon">📘</div>
          <div className="sub-title-wrap">
            <p>Academic Identity</p>
            <h2>Subjects</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="sub-primary-btn" onClick={openCreate}>
          + Create Subject
        </button>
      </section>

      <section className="sub-context-card">
        <div>
          <p>Subject Scope</p>
          <h3>{summary.active} active subject(s)</h3>
          <span>{summary.total} total subject record(s) in this branch</span>
        </div>
        <div className="sub-pill-row">
          <Chip tone="blue">Same Tenant</Chip>
          <Chip tone="green">Branch Scoped</Chip>
          <Chip tone="purple">Reusable Identity</Chip>
        </div>
      </section>

      <section className="sub-summary-grid" aria-label="Subject summary">
        <SummaryCard label="Total Subjects" value={summary.total} icon="📚" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Inactive" value={summary.inactive} icon="⏸️" />
        <SummaryCard label="Curriculum Usage" value={summary.curriculumUsage} icon="🧩" />
        <SummaryCard label="Class Delivery" value={summary.classUsage} icon="🏫" />
        <SummaryCard label="Core" value={summary.core} icon="⭐" />
      </section>

      <section className="sub-filter-card">
        <input
          placeholder="Search subject, code, category, organization..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={filterOrganizationId || ""}
          onChange={(event) => setFilterOrganizationId(Number(event.target.value) || undefined)}
        >
          <option value="">All Organizations</option>
          {organizations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} · {row.type}
            </option>
          ))}
        </select>

        <select
          value={filterCategory}
          onChange={(event) => setFilterCategory(event.target.value as "all" | SubjectCategory)}
        >
          <option value="all">All Categories</option>
          <option value="academic">Academic</option>
          <option value="core">Core</option>
          <option value="elective">Elective</option>
          <option value="technical">Technical</option>
          <option value="vocational">Vocational</option>
        </select>

        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value as "all" | "active" | "inactive")}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </section>

      <section className="sub-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="sub-card">
              {row.bannerImage && (
                <div
                  className="sub-banner"
                  style={{
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.46), rgba(15,23,42,.1)), url(${row.bannerImage})`,
                  }}
                />
              )}

              <div className="sub-card-inner">
                <div className="sub-card-top">
                  <div
                    className="sub-avatar"
                    style={{
                      background: row.photo
                        ? `url(${row.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
                    }}
                  >
                    {!row.photo && row.name.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="sub-main-info">
                    <h3>{row.name}</h3>
                    <p>{item.organizationName}{row.description ? ` · ${row.description}` : ""}</p>

                    <div className="sub-chip-row">
                      {row.code && <Chip tone="gray">{row.code}</Chip>}
                      <Chip tone={categoryTone(row.category as SubjectCategory)}>{categoryLabel(row.category as SubjectCategory)}</Chip>
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                    </div>
                  </div>
                </div>

                <div className="sub-mini-grid">
                  <MiniStat label="Credits" value={row.credits ?? "-"} />
                  <MiniStat label="Curriculum Links" value={item.curriculumUseCount} />
                  <MiniStat label="Class Subject Links" value={item.classSubjectUseCount} />
                </div>

                <div className="sub-action-row">
                  <button type="button" onClick={() => toggleActive(row)}>
                    {row.active === false ? "Activate" : "Deactivate"}
                  </button>
                  <button type="button" onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => remove(row.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No subjects found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="sub-drawer-layer">
          <button type="button" aria-label="Close drawer" className="sub-drawer-overlay" onClick={() => setDrawerOpen(false)} />

          <aside className="sub-drawer">
            <div className="sub-drawer-head">
              <div>
                <p>Subject Record</p>
                <h2>{editMode ? "Edit Subject" : "Create Subject"}</h2>
                <span>
                  This subject will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="sub-form-grid">
              <Field label="Subject Name">
                <input
                  value={form.name}
                  onChange={(event) => updateForm({ name: event.target.value })}
                  placeholder="e.g. Mathematics, English Language"
                />
              </Field>

              <div className="sub-form-two">
                <Field label="Subject Code">
                  <input
                    value={form.code || ""}
                    onChange={(event) => updateForm({ code: event.target.value })}
                    placeholder="e.g. MATH, ENG"
                  />
                </Field>

                <Field label="Credits">
                  <input
                    type="number"
                    value={form.credits ?? ""}
                    onChange={(event) =>
                      updateForm({
                        credits: event.target.value === "" ? undefined : Number(event.target.value),
                      })
                    }
                    placeholder="Credits"
                  />
                </Field>
              </div>

              <Field label="Category">
                <select
                  value={form.category || "academic"}
                  onChange={(event) => updateForm({ category: event.target.value as SubjectCategory })}
                >
                  <option value="academic">Academic</option>
                  <option value="core">Core</option>
                  <option value="elective">Elective</option>
                  <option value="technical">Technical</option>
                  <option value="vocational">Vocational</option>
                </select>
              </Field>

              <Field label="Organization / Department">
                <select
                  value={form.organizationId || ""}
                  onChange={(event) => updateForm({ organizationId: Number(event.target.value) || undefined })}
                >
                  <option value="">No organization</option>
                  {organizations.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.type}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Description">
                <textarea
                  value={form.description || ""}
                  onChange={(event) => updateForm({ description: event.target.value })}
                  placeholder="Brief subject description"
                  rows={4}
                />
              </Field>

              <label className="sub-check">
                <input
                  type="checkbox"
                  checked={form.active !== false}
                  onChange={(event) => updateForm({ active: event.target.checked })}
                />
                <span>Active</span>
              </label>

              <div className="sub-form-two">
                <FileField
                  label="Subject Photo"
                  value={form.photo}
                  alt="Subject"
                  onChange={(file) => handleImageUpload("photo", file)}
                />

                <FileField
                  label="Subject Banner Image"
                  value={form.bannerImage}
                  alt="Subject banner"
                  wide
                  onChange={(file) => handleImageUpload("bannerImage", file)}
                />
              </div>

              <button type="button" onClick={save} disabled={saving} className="sub-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Subject"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="sub-summary-card">
      <div className="sub-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`sub-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sub-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="sub-empty-card">
      <div className="sub-empty-icon">📘</div>
      <h3>No subjects found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="sub-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FileField({
  label,
  value,
  alt,
  wide,
  onChange,
}: {
  label: string;
  value?: string;
  alt: string;
  wide?: boolean;
  onChange: (file?: File) => void;
}) {
  return (
    <Field label={label}>
      <input type="file" accept="image/*" onChange={(event) => onChange(event.target.files?.[0])} />
      {value && (
        <img
          src={value}
          alt={alt}
          className={wide ? "sub-preview wide" : "sub-preview"}
        />
      )}
    </Field>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes subSpin { to { transform: rotate(360deg); } }

.sub-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}
.sub-page *, .sub-page *::before, .sub-page *::after { box-sizing: border-box; }
.sub-page button, .sub-page input, .sub-page select, .sub-page textarea { font: inherit; max-width: 100%; }
.sub-page img { max-width: 100%; }
.sub-page input,
.sub-page select,
.sub-page textarea {
  width: 100%;
  min-height: 43px;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 15px;
  padding: 0 12px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  outline: none;
  font-weight: 750;
}
.sub-page textarea {
  min-height: 100px;
  padding: 12px;
  resize: vertical;
}
.sub-page input[type="file"] {
  padding: 10px;
  font-size: 12px;
}

.sub-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}
.sub-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.sub-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.sub-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--sub-primary) 18%, transparent); border-top-color: var(--sub-primary); animation: subSpin .8s linear infinite; }

.sub-primary-btn,
.sub-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--sub-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.sub-save-btn { width: 100%; }
.sub-primary-btn:disabled,
.sub-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.sub-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--sub-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.sub-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.sub-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--sub-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--sub-primary) 28%, transparent); font-size: 22px; }
.sub-title-wrap { min-width: 0; }
.sub-title-wrap p, .sub-title-wrap h2, .sub-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub-title-wrap p { margin: 0 0 2px; color: var(--sub-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sub-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.sub-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.sub-context-card,
.sub-filter-card,
.sub-card,
.sub-empty-card {
  min-width: 0;
  margin-top: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}
.sub-context-card {
  padding: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, color-mix(in srgb, var(--sub-primary) 10%, #fff), #fff 68%);
}
.sub-context-card p { margin: 0; color: var(--sub-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sub-context-card h3 { margin: 4px 0 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.05em; }
.sub-context-card span { display: block; margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.sub-pill-row { display: flex; flex-wrap: wrap; gap: 7px; }

.sub-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.sub-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .04);
  overflow: hidden;
}
.sub-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--sub-primary) 12%, #fff); }
.sub-summary-card div:last-child { min-width: 0; }
.sub-summary-card strong, .sub-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub-summary-card strong { font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.sub-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.sub-filter-card { padding: 13px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.sub-list { display: grid; gap: 10px; margin-top: 10px; }
.sub-card { background: linear-gradient(135deg, #fff, #f8fafc); }
.sub-banner { height: 86px; background-size: cover; background-position: center; }
.sub-card-inner { padding: 13px; }
.sub-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.sub-avatar { width: 56px; height: 56px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.sub-main-info { min-width: 0; flex: 1; }
.sub-main-info h3, .sub-main-info p { display: block; overflow: hidden; text-overflow: ellipsis; }
.sub-main-info h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.sub-main-info p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.sub-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.sub-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.sub-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.sub-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.sub-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.sub-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.sub-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.sub-mini-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 12px; }
.sub-mini-stat { min-width: 0; padding: 10px; border-radius: 17px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .12); }
.sub-mini-stat strong, .sub-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub-mini-stat strong { font-size: 13px; font-weight: 1000; }
.sub-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.sub-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.sub-action-row button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.sub-action-row button.danger { color: #dc2626; background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.13); }
.sub-empty-card { padding: 13px; display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; text-align: center; border-style: dashed; }
.sub-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--sub-primary) 12%, #fff); font-size: 28px; }
.sub-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.sub-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.sub-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.sub-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.sub-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 560px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.sub-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.sub-drawer-head div { min-width: 0; }
.sub-drawer-head p { margin: 0; color: var(--sub-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sub-drawer-head h2, .sub-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.sub-drawer-head h2 { margin: 2px 0 0; font-size: 24px; font-weight: 1000; letter-spacing: -.05em; }
.sub-drawer-head span { margin-top: 5px; color: var(--muted, #64748b); font-size: 12px; line-height: 1.4; font-weight: 700; }
.sub-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border-radius: 999px; border: 1px solid rgba(148, 163, 184, .24); background: var(--surface, #fff); color: var(--text, #0f172a); font-weight: 1000; cursor: pointer; }
.sub-form-grid { display: grid; gap: 12px; }
.sub-form-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.sub-field { display: grid; gap: 6px; min-width: 0; }
.sub-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.sub-check { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .14); font-size: 13px; font-weight: 850; }
.sub-check input { width: 18px; min-height: 18px; flex: 0 0 auto; }
.sub-preview { width: 92px; height: 84px; border-radius: 16px; margin-top: 8px; object-fit: cover; display: block; border: 1px solid rgba(148, 163, 184, .24); }
.sub-preview.wide { width: 100%; max-width: 260px; }

@media (max-width: 390px) {
  .sub-page { padding: 6px; }
  .sub-hero { padding: 10px; border-radius: 24px; flex-wrap: wrap; }
  .sub-hero-icon { width: 42px; height: 42px; border-radius: 16px; }
  .sub-hero .sub-primary-btn { width: 100%; }
  .sub-summary-grid { grid-template-columns: minmax(0, 1fr); }
  .sub-card-top { flex-direction: column; }
  .sub-action-row { grid-template-columns: minmax(0, 1fr); }
}

@media (min-width: 560px) {
  .sub-page { padding: 14px; }
  .sub-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sub-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sub-mini-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sub-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sub-action-row { display: flex; flex-wrap: wrap; justify-content: flex-end; }
  .sub-action-row button { padding: 0 14px; }
}

@media (min-width: 980px) {
  .sub-page { padding: 18px; }
  .sub-summary-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .sub-filter-card { grid-template-columns: minmax(260px, 1.4fr) repeat(3, minmax(160px, 1fr)); }
  .sub-card-inner { padding: 16px; }
  .sub-card-top { align-items: center; }
}
`;
