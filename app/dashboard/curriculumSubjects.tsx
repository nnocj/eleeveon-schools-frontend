"use client";

/**
 * curriculumSubjects.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE CURRICULUM SUBJECT RULES PAGE
 * ---------------------------------------------------------
 *
 * DB table: curriculumSubjects
 * Supporting tables:
 * - curriculums
 * - curriculumPathways
 * - subjects
 * - organizations
 * - classSubjects
 * - subjectPrerequisites
 *
 * Architecture:
 * CurriculumSubject is the global curriculum rule layer.
 * ClassSubject later becomes the real delivery context:
 * class + subject + curriculumSubject + academic period + teacher.
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
  ClassSubject,
  Curriculum,
  CurriculumPathway,
  CurriculumSubject,
  CurriculumSubjectType,
  Organization,
  Subject,
  SubjectPrerequisite,
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
  subjectId?: number;
  pathwayId?: number;
  organizationId?: number;
  type?: CurriculumSubjectType;
  credits?: number;
  contactHours?: number;
  minimumPassScore?: number;
  orderIndex?: number;
  active?: boolean;
};

type CurriculumSubjectView = {
  row: CurriculumSubject;
  curriculumName: string;
  subjectName: string;
  subjectCode?: string;
  pathwayName: string;
  organizationName: string;
  classSubjectCount: number;
  prerequisiteCount: number;
};

const emptyForm: FormState = {
  curriculumId: undefined,
  subjectId: undefined,
  pathwayId: undefined,
  organizationId: undefined,
  type: "core",
  credits: undefined,
  contactHours: undefined,
  minimumPassScore: undefined,
  orderIndex: undefined,
  active: true,
};

// ======================================================
// COMPONENT
// ======================================================

export default function CurriculumSubjectsPage() {
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

  const [rows, setRows] = useState<CurriculumSubject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [prerequisites, setPrerequisites] = useState<SubjectPrerequisite[]>([]);

  const [search, setSearch] = useState("");
  const [filterCurriculumId, setFilterCurriculumId] = useState<number | undefined>();
  const [filterPathwayId, setFilterPathwayId] = useState<number | undefined>();
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterType, setFilterType] = useState<"all" | CurriculumSubjectType>("all");
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
    setSubjects([]);
    setPathways([]);
    setOrganizations([]);
    setClassSubjects([]);
    setPrerequisites([]);
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
        curriculumSubjectRows,
        curriculumRows,
        subjectRows,
        pathwayRows,
        organizationRows,
        classSubjectRows,
        prerequisiteRows,
      ] = await Promise.all([
        db.curriculumSubjects.toArray(),
        db.curriculums.toArray(),
        db.subjects.toArray(),
        db.curriculumPathways.toArray(),
        db.organizations.toArray(),
        db.classSubjects.toArray(),
        db.subjectPrerequisites.toArray(),
      ]);

      setRows(curriculumSubjectRows.filter(sameTenant));

      setCurriculums(
        curriculumRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setSubjects(
        subjectRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setPathways(
        pathwayRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setOrganizations(
        organizationRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setClassSubjects(classSubjectRows.filter(sameTenant));
      setPrerequisites(prerequisiteRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load curriculum subjects:", error);
      clearData();
      alert("Failed to load curriculum subjects");
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

  const subjectMap = useMemo(
    () => new Map(subjects.map((row) => [row.id, row])),
    [subjects]
  );

  const pathwayMap = useMemo(
    () => new Map(pathways.map((row) => [row.id, row])),
    [pathways]
  );

  const organizationMap = useMemo(
    () => new Map(organizations.map((row) => [row.id, row])),
    [organizations]
  );

  const usageMaps = useMemo(() => {
    const classSubjectMap = new Map<number, number>();
    const prerequisiteMap = new Map<number, number>();

    classSubjects.forEach((row) => {
      if (!row.curriculumSubjectId) return;
      classSubjectMap.set(
        row.curriculumSubjectId,
        (classSubjectMap.get(row.curriculumSubjectId) || 0) + 1
      );
    });

    prerequisites.forEach((row) => {
      if (!row.curriculumSubjectId) return;
      prerequisiteMap.set(
        row.curriculumSubjectId,
        (prerequisiteMap.get(row.curriculumSubjectId) || 0) + 1
      );
    });

    return { classSubjectMap, prerequisiteMap };
  }, [classSubjects, prerequisites]);

  const filteredPathwaysForForm = useMemo(() => {
    if (!form.curriculumId) return pathways;
    return pathways.filter((row) => row.curriculumId === form.curriculumId);
  }, [pathways, form.curriculumId]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<CurriculumSubjectView[]>(() => {
    return rows.map((row) => {
      const curriculum = curriculumMap.get(row.curriculumId);
      const subject = subjectMap.get(row.subjectId);
      const pathway = row.pathwayId ? pathwayMap.get(row.pathwayId) : undefined;
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
      const id = row.id || 0;

      return {
        row,
        curriculumName: curriculum?.name || "Unknown curriculum",
        subjectName: subject?.name || "Unknown subject",
        subjectCode: subject?.code,
        pathwayName: pathway?.name || "No pathway",
        organizationName: organization?.name || "No organization",
        classSubjectCount: usageMaps.classSubjectMap.get(id) || 0,
        prerequisiteCount: usageMaps.prerequisiteMap.get(id) || 0,
      };
    });
  }, [rows, curriculumMap, subjectMap, pathwayMap, organizationMap, usageMaps]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterCurriculumId && row.curriculumId !== filterCurriculumId) return false;
        if (filterPathwayId && row.pathwayId !== filterPathwayId) return false;
        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterType !== "all" && row.type !== filterType) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;

        if (!query) return true;

        return `
          ${item.curriculumName}
          ${item.subjectName}
          ${item.subjectCode || ""}
          ${item.pathwayName}
          ${item.organizationName}
          ${row.type || ""}
          ${row.credits || ""}
          ${row.contactHours || ""}
          ${row.minimumPassScore || ""}
          ${row.orderIndex || ""}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const byCurriculum = a.curriculumName.localeCompare(b.curriculumName);
        if (byCurriculum !== 0) return byCurriculum;
        return Number(a.row.orderIndex || 9999) - Number(b.row.orderIndex || 9999);
      });
  }, [
    viewRows,
    search,
    filterCurriculumId,
    filterPathwayId,
    filterOrganizationId,
    filterType,
    filterStatus,
  ]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((row) => row.active !== false).length,
      core: rows.filter((row) => row.type === "core").length,
      elective: rows.filter((row) => row.type === "elective").length,
      optional: rows.filter((row) => row.type === "optional").length,
      classSubjects: classSubjects.length,
    };
  }, [rows, classSubjects]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
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
    setForm({
      ...emptyForm,
      curriculumId: filterCurriculumId,
      pathwayId: filterPathwayId,
      organizationId: filterOrganizationId,
      type: filterType === "all" ? "core" : filterType,
    });
    setDrawerOpen(true);
  };

  const openEdit = (row: CurriculumSubject) => {
    setEditMode(true);
    setForm({
      id: row.id,
      curriculumId: row.curriculumId,
      subjectId: row.subjectId,
      pathwayId: row.pathwayId,
      organizationId: row.organizationId,
      type: row.type || "core",
      credits: row.credits,
      contactHours: row.contactHours,
      minimumPassScore: row.minimumPassScore,
      orderIndex: row.orderIndex,
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
    if (!form.subjectId) return "Select subject";
    if (form.credits !== undefined && Number(form.credits) < 0) return "Credits cannot be negative";
    if (form.contactHours !== undefined && Number(form.contactHours) < 0) return "Contact hours cannot be negative";
    if (form.minimumPassScore !== undefined && Number(form.minimumPassScore) < 0) return "Minimum pass score cannot be negative";
    if (form.orderIndex !== undefined && Number(form.orderIndex) < 0) return "Order index cannot be negative";

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      const sameCurriculum = row.curriculumId === Number(form.curriculumId);
      const sameSubject = row.subjectId === Number(form.subjectId);
      const samePathway = Number(row.pathwayId || 0) === Number(form.pathwayId || 0);

      return sameCurriculum && sameSubject && samePathway && !row.isDeleted;
    });

    if (duplicate) return "This subject is already attached to this curriculum/pathway";

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
        subjectId: Number(form.subjectId),
        pathwayId: form.pathwayId ? Number(form.pathwayId) : undefined,
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        type: form.type || "core",
        credits: form.credits == null ? undefined : Number(form.credits),
        contactHours: form.contactHours == null ? undefined : Number(form.contactHours),
        minimumPassScore: form.minimumPassScore == null ? undefined : Number(form.minimumPassScore),
        orderIndex: form.orderIndex == null ? undefined : Number(form.orderIndex),
        active: form.active !== false,
      }) as CurriculumSubject;

      if (editMode && form.id) {
        await db.curriculumSubjects.update(form.id, {
          ...payload,
          id: form.id,
          isDeleted: false,
        });
      } else {
        await db.curriculumSubjects.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save curriculum subject:", error);
      alert("Failed to save curriculum subject");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: CurriculumSubjectView) => {
    if (!item.row.id) return;

    const totalUsage = item.classSubjectCount + item.prerequisiteCount;

    if (totalUsage) {
      const proceed = confirm(
        `This curriculum subject is used by ${item.classSubjectCount} class subject(s) and ${item.prerequisiteCount} prerequisite rule(s). Delete anyway?`
      );
      if (!proceed) return;
    } else if (!confirm("Delete this curriculum subject?")) {
      return;
    }

    await db.curriculumSubjects.update(item.row.id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: CurriculumSubject) => {
    if (!row.id) return;

    await db.curriculumSubjects.update(row.id, {
      active: row.active === false,
      updatedAt: Date.now(),
    });

    await load();
  };

  const typeTone = (type?: CurriculumSubjectType): "green" | "orange" | "purple" => {
    if (type === "elective") return "orange";
    if (type === "optional") return "purple";
    return "green";
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="cs-page" style={{ "--cs-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cs-state-card">
          <div className="cs-spinner" />
          <h2>Opening curriculum subjects...</h2>
          <p>Checking account, branch, curriculums, subjects, pathways, organizations, and usage links.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="cs-page" style={{ "--cs-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cs-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing curriculum subjects.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="cs-page" style={{ "--cs-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cs-state-card">
          <h2>Select a branch first</h2>
          <p>Curriculum subjects belong to one active school branch.</p>
          <button type="button" className="cs-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="cs-page" style={{ "--cs-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="cs-hero">
        <div className="cs-hero-left">
          <div className="cs-hero-icon">📖</div>
          <div className="cs-title-wrap">
            <p>Curriculum Rules</p>
            <h2>Curriculum Subjects</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="cs-primary-btn" onClick={openCreate}>
          + Add Subject Rule
        </button>
      </section>

      <section className="cs-summary-grid" aria-label="Curriculum subject summary">
        <SummaryCard label="Total" value={summary.total} icon="📖" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Core" value={summary.core} icon="🎯" />
        <SummaryCard label="Elective" value={summary.elective} icon="🧭" />
        <SummaryCard label="Class Links" value={summary.classSubjects} icon="🔗" />
      </section>

      <section className="cs-filter-card">
        <input
          placeholder="Search subject, curriculum, pathway, type..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filterCurriculumId || ""} onChange={(event) => setFilterCurriculumId(Number(event.target.value) || undefined)}>
          <option value="">All Curriculums</option>
          {curriculums.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterPathwayId || ""} onChange={(event) => setFilterPathwayId(Number(event.target.value) || undefined)}>
          <option value="">All Pathways</option>
          {pathways.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterOrganizationId || ""} onChange={(event) => setFilterOrganizationId(Number(event.target.value) || undefined)}>
          <option value="">All Organizations</option>
          {organizations.map((row) => <option key={row.id} value={row.id}>{row.name} • {row.type}</option>)}
        </select>

        <select value={filterType} onChange={(event) => setFilterType(event.target.value as any)}>
          <option value="all">All Types</option>
          <option value="core">Core</option>
          <option value="elective">Elective</option>
          <option value="optional">Optional</option>
        </select>

        <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as any)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </section>

      <section className="cs-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="cs-entity-card">
              <div className="cs-card-body">
                <div className="cs-card-top">
                  <div className="cs-avatar" style={{ background: `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))` }}>
                    {item.subjectName.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="cs-card-main">
                    <h3>{item.subjectName}</h3>
                    <p>{item.curriculumName} · {item.pathwayName} · {item.organizationName}</p>

                    <div className="cs-chip-row">
                      {item.subjectCode && <Chip tone="gray">{item.subjectCode}</Chip>}
                      <Chip tone={typeTone(row.type)}>{row.type || "core"}</Chip>
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                    </div>
                  </div>
                </div>

                <div className="cs-stat-grid">
                  <MiniStat label="Credits" value={row.credits ?? "-"} />
                  <MiniStat label="Hours" value={row.contactHours ?? "-"} />
                  <MiniStat label="Pass" value={row.minimumPassScore ?? "-"} />
                  <MiniStat label="Order" value={row.orderIndex ?? "-"} />
                  <MiniStat label="Class Links" value={item.classSubjectCount} />
                  <MiniStat label="Prerequisites" value={item.prerequisiteCount} />
                </div>

                <div className="cs-action-row">
                  <button type="button" onClick={() => toggleActive(row)}>{row.active === false ? "Activate" : "Deactivate"}</button>
                  <button type="button" onClick={() => openEdit(row)}>Edit</button>
                  <button type="button" className="danger" onClick={() => remove(item)}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No curriculum subjects found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="cs-drawer-layer">
          <button type="button" className="cs-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="cs-drawer">
            <div className="cs-drawer-head">
              <div>
                <p>Subject Rule Setup</p>
                <h2>{editMode ? "Edit Curriculum Subject" : "Add Curriculum Subject"}</h2>
                <span>
                  Define global curriculum rules before assigning subjects to classes.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="cs-form-grid">
              <Field label="Curriculum">
                <select value={form.curriculumId || ""} onChange={(event) => updateForm({ curriculumId: Number(event.target.value) || undefined, pathwayId: undefined })}>
                  <option value="">Select Curriculum</option>
                  {curriculums.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </Field>

              <Field label="Subject">
                <select value={form.subjectId || ""} onChange={(event) => updateForm({ subjectId: Number(event.target.value) || undefined })}>
                  <option value="">Select Subject</option>
                  {subjects.map((row) => <option key={row.id} value={row.id}>{row.name} {row.code ? `• ${row.code}` : ""}</option>)}
                </select>
              </Field>

              <Field label="Pathway">
                <select value={form.pathwayId || ""} onChange={(event) => updateForm({ pathwayId: Number(event.target.value) || undefined })}>
                  <option value="">No pathway</option>
                  {filteredPathwaysForForm.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </Field>

              <Field label="Organization / Department">
                <select value={form.organizationId || ""} onChange={(event) => updateForm({ organizationId: Number(event.target.value) || undefined })}>
                  <option value="">No organization</option>
                  {organizations.map((row) => <option key={row.id} value={row.id}>{row.name} • {row.type}</option>)}
                </select>
              </Field>

              <Field label="Subject Type">
                <select value={form.type || "core"} onChange={(event) => updateForm({ type: event.target.value as CurriculumSubjectType })}>
                  <option value="core">Core</option>
                  <option value="elective">Elective</option>
                  <option value="optional">Optional</option>
                </select>
              </Field>

              <div className="cs-form-two">
                <Field label="Credits">
                  <input type="number" value={form.credits ?? ""} onChange={(event) => updateForm({ credits: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Credits" />
                </Field>

                <Field label="Contact Hours">
                  <input type="number" value={form.contactHours ?? ""} onChange={(event) => updateForm({ contactHours: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Hours" />
                </Field>
              </div>

              <div className="cs-form-two">
                <Field label="Minimum Pass Score">
                  <input type="number" value={form.minimumPassScore ?? ""} onChange={(event) => updateForm({ minimumPassScore: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Pass score" />
                </Field>

                <Field label="Order Index">
                  <input type="number" value={form.orderIndex ?? ""} onChange={(event) => updateForm({ orderIndex: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Order" />
                </Field>
              </div>

              <div className="cs-check-grid">
                <Check label="Active" checked={form.active !== false} onChange={(checked) => updateForm({ active: checked })} />
              </div>

              <button type="button" onClick={save} disabled={saving} className="cs-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Add Curriculum Subject"}
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
    <article className="cs-summary-card">
      <div className="cs-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`cs-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cs-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="cs-empty-card">
      <div className="cs-empty-icon">📖</div>
      <h3>No subject rules found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="cs-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="cs-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes csSpin { to { transform: rotate(360deg); } }

.cs-page {
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

.cs-page *, .cs-page *::before, .cs-page *::after { box-sizing: border-box; }
.cs-page button, .cs-page input, .cs-page select, .cs-page textarea { font: inherit; max-width: 100%; }

.cs-page input,
.cs-page select,
.cs-page textarea {
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

.cs-state-card {
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
.cs-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.cs-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.cs-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--cs-primary) 18%, transparent); border-top-color: var(--cs-primary); animation: csSpin .8s linear infinite; }

.cs-primary-btn,
.cs-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--cs-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.cs-primary-btn:disabled,
.cs-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.cs-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--cs-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.cs-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.cs-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--cs-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--cs-primary) 28%, transparent); font-size: 22px; }
.cs-title-wrap { min-width: 0; }
.cs-title-wrap p, .cs-title-wrap h2, .cs-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-title-wrap p { margin: 0 0 2px; color: var(--cs-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.cs-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.cs-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.cs-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.cs-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .04); overflow: hidden; }
.cs-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--cs-primary) 12%, #fff); }
.cs-summary-card div:last-child { min-width: 0; }
.cs-summary-card strong, .cs-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-summary-card strong { font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.cs-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.cs-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; padding: 10px; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 16px 40px rgba(15, 23, 42, .055); }
.cs-list { display: grid; gap: 10px; margin-top: 10px; }
.cs-entity-card,
.cs-empty-card { min-width: 0; border-radius: 24px; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .045); overflow: hidden; }
.cs-card-body { padding: 13px; }
.cs-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.cs-avatar { width: 58px; height: 58px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.cs-card-main { min-width: 0; flex: 1; }
.cs-card-main h3, .cs-card-main p { display: block; overflow: hidden; text-overflow: ellipsis; }
.cs-card-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.cs-card-main p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.cs-chip-row, .cs-action-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.cs-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cs-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.cs-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.cs-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.cs-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.cs-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.cs-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.cs-stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
.cs-mini-stat { min-width: 0; padding: 9px; border-radius: 17px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .13); overflow: hidden; }
.cs-mini-stat strong, .cs-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-mini-stat strong { font-size: 17px; font-weight: 1000; }
.cs-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.cs-action-row button { min-height: 40px; border: 1px solid rgba(148, 163, 184, .24); border-radius: 999px; padding: 0 13px; background: var(--surface, #fff); color: var(--text, #0f172a); font-size: 12px; font-weight: 950; cursor: pointer; }
.cs-action-row button.danger { color: #dc2626; background: rgba(239, 68, 68, .08); border-color: rgba(239, 68, 68, .12); }
.cs-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; padding: 22px; text-align: center; border-style: dashed; }
.cs-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--cs-primary) 12%, #fff); font-size: 28px; }
.cs-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.cs-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.cs-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.cs-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.cs-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 620px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.cs-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.cs-drawer-head div { min-width: 0; }
.cs-drawer-head p { margin: 0; color: var(--cs-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.cs-drawer-head h2, .cs-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.cs-drawer-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.cs-drawer-head span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.cs-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid rgba(148, 163, 184, .24); border-radius: 15px; background: #fff; font-weight: 1000; cursor: pointer; }
.cs-form-grid { display: grid; gap: 12px; }
.cs-form-two, .cs-check-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.cs-field { display: grid; gap: 6px; min-width: 0; }
.cs-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.cs-check { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .14); font-weight: 850; }
.cs-check input { width: 18px; min-height: 18px; flex: 0 0 auto; }
.cs-save-btn { width: 100%; }

@media (min-width: 680px) {
  .cs-page { padding: 12px; }
  .cs-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .cs-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cs-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .cs-page { padding: 16px; }
  .cs-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .cs-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .cs-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .cs-page { padding: 6px; }
  .cs-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .cs-primary-btn { width: 100%; }
  .cs-summary-grid { gap: 6px; }
  .cs-summary-card { padding: 10px; border-radius: 19px; }
  .cs-entity-card, .cs-empty-card { border-radius: 20px; }
  .cs-card-body { padding: 11px; }
  .cs-card-top { align-items: flex-start; }
  .cs-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .cs-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cs-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cs-action-row button { width: 100%; padding: 0 8px; }
  .cs-action-row button.danger { grid-column: 1 / -1; }
  .cs-drawer { width: min(96vw, 620px); padding: 12px; }
}
`;
