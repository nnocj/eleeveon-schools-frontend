"use client";

/**
 * curriculumPathways.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE CURRICULUM PATHWAY MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: curriculumPathways
 * Supporting tables:
 * - curriculums
 * - curriculumSubjects
 * - studentCurriculums
 *
 * Architecture:
 * CurriculumPathway is the stream / track / specialization layer
 * under a Curriculum.
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Mobile-first cards and drawer UI.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  Curriculum,
  CurriculumPathway,
  CurriculumSubject,
  StudentCurriculum,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type FormState = {
  id?: number;
  curriculumId?: number;
  name: string;
  code?: string;
  photo?: string;
  bannerImage?: string;
  description?: string;
  active?: boolean;
};

type PathwayView = {
  row: CurriculumPathway;
  curriculumName: string;
  subjectCount: number;
  studentCount: number;
};

const emptyForm: FormState = {
  curriculumId: undefined,
  name: "",
  code: "",
  photo: "",
  bannerImage: "",
  description: "",
  active: true,
};

// ======================================================
// COMPONENT
// ======================================================

export default function CurriculumPathwaysPage() {
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

  const [rows, setRows] = useState<CurriculumPathway[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [studentCurriculums, setStudentCurriculums] = useState<StudentCurriculum[]>([]);

  const [search, setSearch] = useState("");
  const [filterCurriculumId, setFilterCurriculumId] = useState<number | undefined>();
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
    setCurriculums([]);
    setCurriculumSubjects([]);
    setStudentCurriculums([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [pathwayRows, curriculumRows, subjectRows, studentCurriculumRows] =
        await Promise.all([
          db.curriculumPathways.toArray(),
          db.curriculums.toArray(),
          db.curriculumSubjects.toArray(),
          db.studentCurriculums.toArray(),
        ]);

      setRows(pathwayRows.filter(sameTenant));

      setCurriculums(
        curriculumRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setCurriculumSubjects(subjectRows.filter(sameTenant));
      setStudentCurriculums(studentCurriculumRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load curriculum pathways:", error);
      clearData();
      alert("Failed to load curriculum pathways");
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

  const curriculumMap = useMemo(
    () => new Map(curriculums.map((row) => [row.id, row])),
    [curriculums]
  );

  const usageMaps = useMemo(() => {
    const subjectMap = new Map<number, number>();
    const studentMap = new Map<number, number>();

    curriculumSubjects.forEach((row) => {
      if (!row.pathwayId) return;
      subjectMap.set(row.pathwayId, (subjectMap.get(row.pathwayId) || 0) + 1);
    });

    studentCurriculums.forEach((row) => {
      if (!row.pathwayId) return;
      studentMap.set(row.pathwayId, (studentMap.get(row.pathwayId) || 0) + 1);
    });

    return { subjectMap, studentMap };
  }, [curriculumSubjects, studentCurriculums]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<PathwayView[]>(() => {
    return rows.map((row) => {
      const curriculum = curriculumMap.get(row.curriculumId);
      const id = row.id || 0;

      return {
        row,
        curriculumName: curriculum?.name || "Unknown curriculum",
        subjectCount: usageMaps.subjectMap.get(id) || 0,
        studentCount: usageMaps.studentMap.get(id) || 0,
      };
    });
  }, [rows, curriculumMap, usageMaps]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterCurriculumId && row.curriculumId !== filterCurriculumId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.code || ""}
          ${row.description || ""}
          ${item.curriculumName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const byCurriculum = a.curriculumName.localeCompare(b.curriculumName);
        if (byCurriculum !== 0) return byCurriculum;
        return a.row.name.localeCompare(b.row.name);
      });
  }, [viewRows, search, filterCurriculumId, filterStatus]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((row) => row.active !== false).length,
      inactive: rows.filter((row) => row.active === false).length,
      subjectLinks: curriculumSubjects.filter((row) => row.pathwayId).length,
      studentLinks: studentCurriculums.filter((row) => row.pathwayId).length,
    };
  }, [rows, curriculumSubjects, studentCurriculums]);

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
    setForm({ ...emptyForm, curriculumId: filterCurriculumId });
    setDrawerOpen(true);
  };

  const openEdit = (row: CurriculumPathway) => {
    setEditMode(true);
    setForm({
      id: row.id,
      curriculumId: row.curriculumId,
      name: row.name,
      code: row.code || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      description: row.description || "",
      active: row.active ?? true,
    });
    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId || !branchId) return "Select a branch first";
    if (!form.curriculumId) return "Select curriculum";
    if (!form.name.trim()) return "Enter pathway name";

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      const sameCurriculum = row.curriculumId === Number(form.curriculumId);
      const sameName = row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
      const sameCode =
        !!form.code?.trim() &&
        row.code?.trim().toLowerCase() === form.code.trim().toLowerCase();

      return sameCurriculum && (sameName || sameCode) && !row.isDeleted;
    });

    if (duplicate) return "A pathway with this name or code already exists under this curriculum";

    return null;
  };

  const save = async () => {
    const error = validate();

    if (error) {
      alert(error);
      return;
    }

    try {
      setSaving(true);

      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        curriculumId: Number(form.curriculumId),
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,
        description: form.description?.trim() || undefined,
        active: form.active !== false,
      }) as CurriculumPathway;

      if (editMode && form.id) {
        await db.curriculumPathways.update(form.id, {
          ...payload,
          id: form.id,
          isDeleted: false,
        });
      } else {
        await db.curriculumPathways.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save curriculum pathway:", error);
      alert("Failed to save curriculum pathway");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: PathwayView) => {
    if (!item.row.id) return;

    const totalUsage = item.subjectCount + item.studentCount;

    if (totalUsage) {
      const proceed = confirm(
        `This pathway is used by ${item.subjectCount} curriculum subject(s) and ${item.studentCount} student curriculum record(s). Delete anyway?`
      );
      if (!proceed) return;
    } else if (!confirm("Delete this pathway?")) {
      return;
    }

    await db.curriculumPathways.update(item.row.id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: CurriculumPathway) => {
    if (!row.id) return;

    await db.curriculumPathways.update(row.id, {
      active: row.active === false,
      updatedAt: Date.now(),
    });

    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="cp-page" style={{ "--cp-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cp-state-card">
          <div className="cp-spinner" />
          <h2>Opening curriculum pathways...</h2>
          <p>Checking account, branch, curriculums, pathways, subject links, and student links.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="cp-page" style={{ "--cp-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cp-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing curriculum pathways.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="cp-page" style={{ "--cp-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cp-state-card">
          <h2>Select a branch first</h2>
          <p>Curriculum pathways belong to one active school branch.</p>
          <button type="button" className="cp-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="cp-page" style={{ "--cp-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="cp-hero">
        <div className="cp-hero-left">
          <div className="cp-hero-icon">🗺️</div>
          <div className="cp-title-wrap">
            <p>Streams & Tracks</p>
            <h2>Curriculum Pathways</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="cp-primary-btn" onClick={openCreate}>
          + Create Pathway
        </button>
      </section>

      <section className="cp-summary-grid" aria-label="Curriculum pathway summary">
        <SummaryCard label="Pathways" value={summary.total} icon="🗺️" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Inactive" value={summary.inactive} icon="⏸️" />
        <SummaryCard label="Subject Links" value={summary.subjectLinks} icon="📖" />
        <SummaryCard label="Student Links" value={summary.studentLinks} icon="🎓" />
      </section>

      <section className="cp-filter-card">
        <input
          placeholder="Search pathway, code, curriculum..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filterCurriculumId || ""} onChange={(event) => setFilterCurriculumId(Number(event.target.value) || undefined)}>
          <option value="">All Curriculums</option>
          {curriculums.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as any)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </section>

      <section className="cp-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="cp-entity-card">
              {row.bannerImage && (
                <div
                  className="cp-card-banner"
                  style={{ backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.44), rgba(15,23,42,.08)), url(${row.bannerImage})` }}
                />
              )}

              <div className="cp-card-body">
                <div className="cp-card-top">
                  <Avatar name={row.name} photo={row.photo} primary={primary} />

                  <div className="cp-card-main">
                    <h3>{row.name}</h3>
                    <p>{item.curriculumName}</p>

                    <div className="cp-chip-row">
                      {row.code && <Chip tone="gray">{row.code}</Chip>}
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                    </div>
                  </div>
                </div>

                {row.description && <p className="cp-description">{row.description}</p>}

                <div className="cp-stat-grid">
                  <MiniStat label="Subjects" value={item.subjectCount} />
                  <MiniStat label="Students" value={item.studentCount} />
                  <MiniStat label="Curriculum" value={item.curriculumName} />
                </div>

                <div className="cp-action-row">
                  <button type="button" onClick={() => toggleActive(row)}>{row.active === false ? "Activate" : "Deactivate"}</button>
                  <button type="button" onClick={() => openEdit(row)}>Edit</button>
                  <button type="button" className="danger" onClick={() => remove(item)}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No curriculum pathways found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="cp-drawer-layer">
          <button type="button" className="cp-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="cp-drawer">
            <div className="cp-drawer-head">
              <div>
                <p>Pathway Setup</p>
                <h2>{editMode ? "Edit Pathway" : "Create Pathway"}</h2>
                <span>
                  Pathway will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="cp-form-grid">
              <Field label="Curriculum">
                <select value={form.curriculumId || ""} onChange={(event) => updateForm({ curriculumId: Number(event.target.value) || undefined })}>
                  <option value="">Select Curriculum</option>
                  {curriculums.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </Field>

              <Field label="Pathway Name">
                <input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="e.g. General Pathway, Science Track" />
              </Field>

              <Field label="Pathway Code">
                <input value={form.code || ""} onChange={(event) => updateForm({ code: event.target.value })} placeholder="e.g. SCI, GEN, BUS" />
              </Field>

              <Field label="Description">
                <textarea value={form.description || ""} onChange={(event) => updateForm({ description: event.target.value })} placeholder="Describe this pathway or track" rows={4} />
              </Field>

              <div className="cp-check-grid">
                <Check label="Active" checked={form.active !== false} onChange={(checked) => updateForm({ active: checked })} />
              </div>

              <Field label="Pathway Photo">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("photo", event.target.files?.[0])} />
                {form.photo && <img src={form.photo} alt="Pathway" className="cp-preview-photo" />}
              </Field>

              <Field label="Pathway Banner Image">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("bannerImage", event.target.files?.[0])} />
                {form.bannerImage && <img src={form.bannerImage} alt="Pathway banner" className="cp-preview-banner" />}
              </Field>

              <button type="button" onClick={save} disabled={saving} className="cp-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Pathway"}
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
    <article className="cp-summary-card">
      <div className="cp-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Avatar({ name, photo, primary }: { name: string; photo?: string; primary: string }) {
  return (
    <div
      className="cp-avatar"
      style={{ background: photo ? `url(${photo}) center/cover` : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))` }}
    >
      {!photo && name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`cp-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cp-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="cp-empty-card">
      <div className="cp-empty-icon">🗺️</div>
      <h3>No pathways found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="cp-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="cp-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes cpSpin { to { transform: rotate(360deg); } }

.cp-page {
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

.cp-page *, .cp-page *::before, .cp-page *::after { box-sizing: border-box; }
.cp-page button, .cp-page input, .cp-page select, .cp-page textarea { font: inherit; max-width: 100%; }
.cp-page img { max-width: 100%; }

.cp-page input,
.cp-page select,
.cp-page textarea {
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
.cp-page textarea { padding-top: 10px; resize: vertical; }

.cp-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}
.cp-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.cp-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.cp-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--cp-primary) 18%, transparent); border-top-color: var(--cp-primary); animation: cpSpin .8s linear infinite; }

.cp-primary-btn,
.cp-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--cp-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.cp-primary-btn:disabled,
.cp-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.cp-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--cp-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.cp-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.cp-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--cp-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--cp-primary) 28%, transparent); font-size: 22px; }
.cp-title-wrap { min-width: 0; }
.cp-title-wrap p, .cp-title-wrap h2, .cp-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-title-wrap p { margin: 0 0 2px; color: var(--cp-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.cp-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.cp-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.cp-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.cp-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .04); overflow: hidden; }
.cp-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--cp-primary) 12%, #fff); }
.cp-summary-card div:last-child { min-width: 0; }
.cp-summary-card strong, .cp-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-summary-card strong { font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.cp-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.cp-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; padding: 10px; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 16px 40px rgba(15, 23, 42, .055); }
.cp-list { display: grid; gap: 10px; margin-top: 10px; }
.cp-entity-card,
.cp-empty-card { min-width: 0; border-radius: 24px; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .045); overflow: hidden; }
.cp-card-banner { height: 92px; background-size: cover; background-position: center; }
.cp-card-body { padding: 13px; }
.cp-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.cp-avatar { width: 58px; height: 58px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.cp-card-main { min-width: 0; flex: 1; }
.cp-card-main h3, .cp-card-main p, .cp-description { display: block; overflow: hidden; text-overflow: ellipsis; }
.cp-card-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.cp-card-main p, .cp-description { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.cp-description { margin-top: 9px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; white-space: normal; }
.cp-chip-row, .cp-action-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.cp-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cp-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.cp-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.cp-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.cp-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.cp-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.cp-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.cp-stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
.cp-mini-stat { min-width: 0; padding: 9px; border-radius: 17px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .13); overflow: hidden; }
.cp-mini-stat strong, .cp-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-mini-stat strong { font-size: 17px; font-weight: 1000; }
.cp-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.cp-action-row button { min-height: 40px; border: 1px solid rgba(148, 163, 184, .24); border-radius: 999px; padding: 0 13px; background: var(--surface, #fff); color: var(--text, #0f172a); font-size: 12px; font-weight: 950; cursor: pointer; }
.cp-action-row button.danger { color: #dc2626; background: rgba(239, 68, 68, .08); border-color: rgba(239, 68, 68, .12); }
.cp-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; padding: 22px; text-align: center; border-style: dashed; }
.cp-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--cp-primary) 12%, #fff); font-size: 28px; }
.cp-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.cp-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.cp-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.cp-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.cp-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 600px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.cp-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.cp-drawer-head div { min-width: 0; }
.cp-drawer-head p { margin: 0; color: var(--cp-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.cp-drawer-head h2, .cp-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.cp-drawer-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.cp-drawer-head span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.cp-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid rgba(148, 163, 184, .24); border-radius: 15px; background: #fff; font-weight: 1000; cursor: pointer; }
.cp-form-grid { display: grid; gap: 12px; }
.cp-check-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.cp-field { display: grid; gap: 6px; min-width: 0; }
.cp-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.cp-check { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .14); font-weight: 850; }
.cp-check input { width: 18px; min-height: 18px; flex: 0 0 auto; }
.cp-preview-photo { width: 94px; height: 82px; border-radius: 16px; margin-top: 8px; object-fit: cover; }
.cp-preview-banner { width: 100%; height: 126px; border-radius: 16px; margin-top: 8px; object-fit: cover; }
.cp-save-btn { width: 100%; }

@media (min-width: 680px) {
  .cp-page { padding: 12px; }
  .cp-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .cp-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .cp-page { padding: 16px; }
  .cp-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .cp-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .cp-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .cp-page { padding: 6px; }
  .cp-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .cp-primary-btn { width: 100%; }
  .cp-summary-grid { gap: 6px; }
  .cp-summary-card { padding: 10px; border-radius: 19px; }
  .cp-entity-card, .cp-empty-card { border-radius: 20px; }
  .cp-card-body { padding: 11px; }
  .cp-card-top { align-items: flex-start; }
  .cp-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .cp-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cp-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cp-action-row button { width: 100%; padding: 0 8px; }
  .cp-action-row button.danger { grid-column: 1 / -1; }
  .cp-drawer { width: min(96vw, 600px); padding: 12px; }
}
`;
