"use client";

/**
 * SubjectPrerequisites.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE SUBJECT PREREQUISITE RULES PAGE
 * ---------------------------------------------------------
 *
 * DB table: subjectPrerequisites
 * Supporting tables:
 * - curriculumSubjects
 * - curriculums
 * - subjects
 * - curriculumPathways
 *
 * Architecture:
 * Active Account -> Active School -> Active Branch
 * -> CurriculumSubject -> SubjectPrerequisite
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Soft delete only.
 * - Mobile-first rule cards and responsive drawer.
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
  Curriculum,
  CurriculumPathway,
  CurriculumSubject,
  Subject,
  SubjectPrerequisite,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type RuleType = "prerequisite" | "corequisite" | "recommended";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type FormState = {
  id?: number;
  curriculumSubjectId?: number;
  prerequisiteSubjectId?: number;
  minimumGrade?: string;
  minimumScore?: number;
  type?: RuleType;
  groupCode?: string;
  active?: boolean;
};

type CurriculumSubjectOption = {
  id: number;
  curriculumId: number;
  subjectId: number;
  pathwayId?: number;
  label: string;
  curriculumName: string;
  subjectName: string;
  subjectCode?: string;
  pathwayName: string;
};

type PrerequisiteView = {
  row: SubjectPrerequisite;
  ownerLabel: string;
  prerequisiteLabel: string;
  curriculumName: string;
  pathwayName: string;
};

const emptyForm: FormState = {
  curriculumSubjectId: undefined,
  prerequisiteSubjectId: undefined,
  minimumGrade: "",
  minimumScore: undefined,
  type: "prerequisite",
  groupCode: "",
  active: true,
};

function typeTone(type?: RuleType): "green" | "orange" | "purple" {
  if (type === "corequisite") return "purple";
  if (type === "recommended") return "orange";
  return "green";
}

function typeLabel(type?: RuleType) {
  if (type === "corequisite") return "Corequisite";
  if (type === "recommended") return "Recommended";
  return "Prerequisite";
}

// ======================================================
// COMPONENT
// ======================================================

export default function SubjectPrerequisitesPage() {
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

  const [rows, setRows] = useState<SubjectPrerequisite[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);

  const [search, setSearch] = useState("");
  const [filterCurriculumId, setFilterCurriculumId] = useState<number | undefined>();
  const [filterType, setFilterType] = useState<"all" | RuleType>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterGroupCode, setFilterGroupCode] = useState<string>("");

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
    setCurriculumSubjects([]);
    setCurriculums([]);
    setSubjects([]);
    setPathways([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [ruleRows, curriculumSubjectRows, curriculumRows, subjectRows, pathwayRows] =
        await Promise.all([
          db.subjectPrerequisites.toArray(),
          db.curriculumSubjects.toArray(),
          db.curriculums.toArray(),
          db.subjects.toArray(),
          db.curriculumPathways.toArray(),
        ]);

      setRows(ruleRows.filter(sameTenant));

      setCurriculumSubjects(
        curriculumSubjectRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0))
      );

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
    } catch (error) {
      console.error("Failed to load subject prerequisites:", error);
      clearData();
      alert("Failed to load subject prerequisites");
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

  const curriculumSubjectOptions = useMemo<CurriculumSubjectOption[]>(() => {
    return curriculumSubjects
      .map((row) => {
        const curriculum = curriculumMap.get(row.curriculumId);
        const subject = subjectMap.get(row.subjectId);
        const pathway = row.pathwayId ? pathwayMap.get(row.pathwayId) : undefined;

        if (!row.id) return undefined;

        const curriculumName = curriculum?.name || "Unknown curriculum";
        const subjectName = subject?.name || "Unknown subject";
        const subjectCode = subject?.code;
        const pathwayName = pathway?.name || "No pathway";

        return {
          id: row.id,
          curriculumId: row.curriculumId,
          subjectId: row.subjectId,
          pathwayId: row.pathwayId,
          curriculumName,
          subjectName,
          subjectCode,
          pathwayName,
          label: `${curriculumName} · ${subjectName}${subjectCode ? ` (${subjectCode})` : ""} · ${pathwayName}`,
        };
      })
      .filter(Boolean) as CurriculumSubjectOption[];
  }, [curriculumSubjects, curriculumMap, subjectMap, pathwayMap]);

  const curriculumSubjectOptionMap = useMemo(
    () => new Map(curriculumSubjectOptions.map((row) => [row.id, row])),
    [curriculumSubjectOptions]
  );

  const selectedOwner = useMemo(() => {
    if (!form.curriculumSubjectId) return undefined;
    return curriculumSubjectOptionMap.get(form.curriculumSubjectId);
  }, [form.curriculumSubjectId, curriculumSubjectOptionMap]);

  const prerequisiteOptions = useMemo(() => {
    if (!selectedOwner) return curriculumSubjectOptions;

    return curriculumSubjectOptions.filter((option) => {
      if (option.id === selectedOwner.id) return false;
      return option.curriculumId === selectedOwner.curriculumId;
    });
  }, [curriculumSubjectOptions, selectedOwner]);

  const groupCodes = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.groupCode).filter(Boolean) as string[])).sort();
  }, [rows]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<PrerequisiteView[]>(() => {
    return rows.map((row) => {
      const owner = curriculumSubjectOptionMap.get(row.curriculumSubjectId);
      const prerequisite = curriculumSubjectOptionMap.get(row.prerequisiteSubjectId);

      return {
        row,
        ownerLabel: owner?.subjectName || `Curriculum Subject #${row.curriculumSubjectId}`,
        prerequisiteLabel: prerequisite?.subjectName || `Curriculum Subject #${row.prerequisiteSubjectId}`,
        curriculumName: owner?.curriculumName || "Unknown curriculum",
        pathwayName: owner?.pathwayName || "No pathway",
      };
    });
  }, [rows, curriculumSubjectOptionMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;
        const owner = curriculumSubjectOptionMap.get(row.curriculumSubjectId);

        if (filterCurriculumId && owner?.curriculumId !== filterCurriculumId) return false;
        if (filterType !== "all" && row.type !== filterType) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (filterGroupCode && row.groupCode !== filterGroupCode) return false;

        if (!query) return true;

        return `
          ${item.ownerLabel}
          ${item.prerequisiteLabel}
          ${item.curriculumName}
          ${item.pathwayName}
          ${row.type || ""}
          ${row.minimumGrade || ""}
          ${row.minimumScore || ""}
          ${row.groupCode || ""}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const byCurriculum = a.curriculumName.localeCompare(b.curriculumName);
        if (byCurriculum !== 0) return byCurriculum;
        return a.ownerLabel.localeCompare(b.ownerLabel);
      });
  }, [
    viewRows,
    search,
    filterCurriculumId,
    filterType,
    filterStatus,
    filterGroupCode,
    curriculumSubjectOptionMap,
  ]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((row) => row.active !== false).length,
      inactive: rows.filter((row) => row.active === false).length,
      prerequisite: rows.filter((row) => row.type === "prerequisite" || !row.type).length,
      corequisite: rows.filter((row) => row.type === "corequisite").length,
      recommended: rows.filter((row) => row.type === "recommended").length,
      grouped: rows.filter((row) => !!row.groupCode).length,
    };
  }, [rows]);

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
    setForm(emptyForm);
    setDrawerOpen(true);
  };

  const openEdit = (row: SubjectPrerequisite) => {
    setEditMode(true);
    setForm({
      id: row.id,
      curriculumSubjectId: row.curriculumSubjectId,
      prerequisiteSubjectId: row.prerequisiteSubjectId,
      minimumGrade: row.minimumGrade || "",
      minimumScore: row.minimumScore,
      type: row.type || "prerequisite",
      groupCode: row.groupCode || "",
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
    if (!form.curriculumSubjectId) return "Select subject rule owner";
    if (!form.prerequisiteSubjectId) return "Select required/related subject";

    if (form.curriculumSubjectId === form.prerequisiteSubjectId) {
      return "A subject cannot require itself";
    }

    const owner = curriculumSubjectOptionMap.get(Number(form.curriculumSubjectId));
    const required = curriculumSubjectOptionMap.get(Number(form.prerequisiteSubjectId));

    if (!owner) return "Selected subject rule owner is not in this branch";
    if (!required) return "Selected required subject is not in this branch";

    if (owner.curriculumId !== required.curriculumId) {
      return "Prerequisite relationship must stay within the same curriculum";
    }

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      return (
        row.curriculumSubjectId === Number(form.curriculumSubjectId) &&
        row.prerequisiteSubjectId === Number(form.prerequisiteSubjectId) &&
        row.type === form.type &&
        !row.isDeleted
      );
    });

    if (duplicate) return "This subject relationship already exists";

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
          curriculumSubjectId: Number(form.curriculumSubjectId),
          prerequisiteSubjectId: Number(form.prerequisiteSubjectId),
          minimumGrade: form.minimumGrade?.trim() || undefined,
          minimumScore: form.minimumScore == null ? undefined : Number(form.minimumScore),
          type: form.type || "prerequisite",
          groupCode: form.groupCode?.trim() || undefined,
          active: form.active !== false,
        },
        existing
      ) as SubjectPrerequisite;

      if (editMode && form.id) {
        await db.subjectPrerequisites.update(form.id, {
          accountId: payload.accountId,
          schoolId: payload.schoolId,
          branchId: payload.branchId,
          cloudId: payload.cloudId,
          createdAt: payload.createdAt,
          curriculumSubjectId: payload.curriculumSubjectId,
          prerequisiteSubjectId: payload.prerequisiteSubjectId,
          minimumGrade: payload.minimumGrade,
          minimumScore: payload.minimumScore,
          type: payload.type,
          groupCode: payload.groupCode,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        } as Partial<SubjectPrerequisite>);
      } else {
        await db.subjectPrerequisites.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save prerequisite rule:", error);
      alert("Failed to save prerequisite rule");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: SubjectPrerequisite) => {
    if (!row.id) return;
    if (!confirm("Delete this subject prerequisite rule?")) return;

    await db.subjectPrerequisites.update(row.id, {
      isDeleted: true,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<SubjectPrerequisite>);

    await load();
  };

  const toggleActive = async (row: SubjectPrerequisite) => {
    if (!row.id) return;

    await db.subjectPrerequisites.update(row.id, {
      active: row.active === false,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<SubjectPrerequisite>);

    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="spr-page" style={{ "--spr-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="spr-state-card">
          <div className="spr-spinner" />
          <h2>Opening subject prerequisites...</h2>
          <p>Checking account, branch, curriculum subjects, subjects, pathways, and prerequisite rules.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="spr-page" style={{ "--spr-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="spr-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing subject prerequisite rules.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="spr-page" style={{ "--spr-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="spr-state-card">
          <h2>Select a branch first</h2>
          <p>Subject prerequisite rules belong to one active school branch.</p>
          <button type="button" className="spr-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="spr-page" style={{ "--spr-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="spr-hero">
        <div className="spr-hero-left">
          <div className="spr-hero-icon">🔗</div>
          <div className="spr-title-wrap">
            <p>Curriculum Rules</p>
            <h2>Subject Prerequisites</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="spr-primary-btn" onClick={openCreate}>
          + Add Rule
        </button>
      </section>

      <section className="spr-context-card">
        <div>
          <p>Rule Scope</p>
          <h3>{summary.active} active rule(s)</h3>
          <span>{summary.total} subject relationship rule(s) in this branch</span>
        </div>
        <div className="spr-pill-row">
          <Chip tone="blue">Same Tenant</Chip>
          <Chip tone="green">Branch Scoped</Chip>
          <Chip tone="purple">Curriculum Linked</Chip>
        </div>
      </section>

      <section className="spr-summary-grid" aria-label="Subject prerequisite summary">
        <SummaryCard label="Rules" value={summary.total} icon="📌" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Inactive" value={summary.inactive} icon="⏸️" />
        <SummaryCard label="Prerequisite" value={summary.prerequisite} icon="🔐" />
        <SummaryCard label="Corequisite" value={summary.corequisite} icon="🔄" />
        <SummaryCard label="Grouped" value={summary.grouped} icon="🧩" />
      </section>

      <section className="spr-filter-card">
        <input
          placeholder="Search subject, required subject, grade, group..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={filterCurriculumId || ""}
          onChange={(event) => setFilterCurriculumId(Number(event.target.value) || undefined)}
        >
          <option value="">All Curriculums</option>
          {curriculums.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={(event) => setFilterType(event.target.value as "all" | RuleType)}
        >
          <option value="all">All Rule Types</option>
          <option value="prerequisite">Prerequisite</option>
          <option value="corequisite">Corequisite</option>
          <option value="recommended">Recommended</option>
        </select>

        <select value={filterGroupCode} onChange={(event) => setFilterGroupCode(event.target.value)}>
          <option value="">All Groups</option>
          {groupCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
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

      <section className="spr-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="spr-rule-card">
              <div className="spr-rule-main">
                <div className="spr-rule-icon">{row.type === "corequisite" ? "🔄" : row.type === "recommended" ? "💡" : "🔐"}</div>

                <div className="spr-rule-content">
                  <h3>{item.ownerLabel}</h3>
                  <p>{item.curriculumName} · {item.pathwayName}</p>

                  <div className="spr-chip-row">
                    <Chip tone={typeTone(row.type)}>{typeLabel(row.type)}</Chip>
                    <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                    {row.groupCode && <Chip tone="purple">Group: {row.groupCode}</Chip>}
                  </div>
                </div>
              </div>

              <div className="spr-requirement-box">
                <strong>Requires: {item.prerequisiteLabel}</strong>
                <span>Minimum Grade: {row.minimumGrade || "-"} · Minimum Score: {row.minimumScore ?? "-"}</span>
              </div>

              <div className="spr-action-row">
                <button type="button" onClick={() => toggleActive(row)}>
                  {row.active === false ? "Activate" : "Deactivate"}
                </button>
                <button type="button" onClick={() => openEdit(row)}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => remove(row)}>
                  Delete
                </button>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No subject prerequisite rules found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="spr-drawer-layer">
          <button type="button" aria-label="Close drawer" className="spr-drawer-overlay" onClick={() => setDrawerOpen(false)} />

          <aside className="spr-drawer">
            <div className="spr-drawer-head">
              <div>
                <p>Subject Rule</p>
                <h2>{editMode ? "Edit Subject Rule" : "Add Subject Rule"}</h2>
                <span>
                  Define prerequisite, corequisite, or recommended subject relationships under {activeBranch?.name || "the selected branch"}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="spr-form-grid">
              <Field label="Subject Being Controlled">
                <select
                  value={form.curriculumSubjectId || ""}
                  onChange={(event) =>
                    updateForm({
                      curriculumSubjectId: Number(event.target.value) || undefined,
                      prerequisiteSubjectId: undefined,
                    })
                  }
                >
                  <option value="">Select Curriculum Subject</option>
                  {curriculumSubjectOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Required / Related Subject">
                <select
                  value={form.prerequisiteSubjectId || ""}
                  onChange={(event) => updateForm({ prerequisiteSubjectId: Number(event.target.value) || undefined })}
                >
                  <option value="">Select Required Subject</option>
                  {prerequisiteOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Rule Type">
                <select
                  value={form.type || "prerequisite"}
                  onChange={(event) => updateForm({ type: event.target.value as RuleType })}
                >
                  <option value="prerequisite">Prerequisite</option>
                  <option value="corequisite">Corequisite</option>
                  <option value="recommended">Recommended</option>
                </select>
              </Field>

              <div className="spr-form-two">
                <Field label="Minimum Grade">
                  <input
                    value={form.minimumGrade || ""}
                    onChange={(event) => updateForm({ minimumGrade: event.target.value })}
                    placeholder="e.g. C6, B3, Pass"
                  />
                </Field>

                <Field label="Minimum Score">
                  <input
                    type="number"
                    value={form.minimumScore ?? ""}
                    onChange={(event) =>
                      updateForm({
                        minimumScore: event.target.value === "" ? undefined : Number(event.target.value),
                      })
                    }
                    placeholder="e.g. 50"
                  />
                </Field>
              </div>

              <Field label="Group Code">
                <input
                  value={form.groupCode || ""}
                  onChange={(event) => updateForm({ groupCode: event.target.value })}
                  placeholder="Optional group code for alternative prerequisite groups"
                />
              </Field>

              <label className="spr-check">
                <input
                  type="checkbox"
                  checked={form.active !== false}
                  onChange={(event) => updateForm({ active: event.target.checked })}
                />
                <span>Active</span>
              </label>

              <button type="button" onClick={save} disabled={saving} className="spr-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Save Rule"}
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
    <article className="spr-summary-card">
      <div className="spr-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`spr-chip ${tone}`}>{children}</span>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="spr-empty-card">
      <div className="spr-empty-icon">🔗</div>
      <h3>No rules found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="spr-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes sprSpin { to { transform: rotate(360deg); } }

.spr-page {
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
.spr-page *, .spr-page *::before, .spr-page *::after { box-sizing: border-box; }
.spr-page button, .spr-page input, .spr-page select, .spr-page textarea { font: inherit; max-width: 100%; }
.spr-page input,
.spr-page select,
.spr-page textarea {
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

.spr-state-card {
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
.spr-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.spr-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.spr-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--spr-primary) 18%, transparent); border-top-color: var(--spr-primary); animation: sprSpin .8s linear infinite; }

.spr-primary-btn,
.spr-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--spr-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.spr-save-btn { width: 100%; }
.spr-primary-btn:disabled,
.spr-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.spr-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--spr-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.spr-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.spr-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--spr-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--spr-primary) 28%, transparent); font-size: 22px; }
.spr-title-wrap { min-width: 0; }
.spr-title-wrap p, .spr-title-wrap h2, .spr-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spr-title-wrap p { margin: 0 0 2px; color: var(--spr-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.spr-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.spr-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.spr-context-card,
.spr-filter-card,
.spr-rule-card,
.spr-empty-card {
  min-width: 0;
  margin-top: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
  padding: 13px;
}
.spr-context-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, color-mix(in srgb, var(--spr-primary) 10%, #fff), #fff 68%);
}
.spr-context-card p { margin: 0; color: var(--spr-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.spr-context-card h3 { margin: 4px 0 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.05em; }
.spr-context-card span { display: block; margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.spr-pill-row { display: flex; flex-wrap: wrap; gap: 7px; }

.spr-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.spr-summary-card {
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
.spr-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--spr-primary) 12%, #fff); }
.spr-summary-card div:last-child { min-width: 0; }
.spr-summary-card strong, .spr-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spr-summary-card strong { font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.spr-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.spr-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.spr-list { display: grid; gap: 10px; margin-top: 10px; }
.spr-rule-card { background: linear-gradient(135deg, #fff, #f8fafc); }
.spr-rule-main { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.spr-rule-icon { width: 50px; height: 50px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: color-mix(in srgb, var(--spr-primary) 12%, #fff); font-size: 23px; }
.spr-rule-content { min-width: 0; flex: 1; }
.spr-rule-content h3, .spr-rule-content p { display: block; overflow: hidden; text-overflow: ellipsis; }
.spr-rule-content h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.spr-rule-content p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.spr-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.spr-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spr-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.spr-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.spr-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.spr-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.spr-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.spr-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.spr-requirement-box { min-width: 0; margin-top: 12px; padding: 11px; border-radius: 18px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .12); }
.spr-requirement-box strong, .spr-requirement-box span { display: block; overflow: hidden; text-overflow: ellipsis; }
.spr-requirement-box strong { font-size: 14px; font-weight: 1000; }
.spr-requirement-box span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.spr-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.spr-action-row button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.spr-action-row button.danger { color: #dc2626; background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.13); }
.spr-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; text-align: center; border-style: dashed; }
.spr-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--spr-primary) 12%, #fff); font-size: 28px; }
.spr-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.spr-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.spr-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.spr-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.spr-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 650px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.spr-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.spr-drawer-head div { min-width: 0; }
.spr-drawer-head p { margin: 0; color: var(--spr-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.spr-drawer-head h2, .spr-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.spr-drawer-head h2 { margin: 2px 0 0; font-size: 24px; font-weight: 1000; letter-spacing: -.05em; }
.spr-drawer-head span { margin-top: 5px; color: var(--muted, #64748b); font-size: 12px; line-height: 1.4; font-weight: 700; }
.spr-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border-radius: 999px; border: 1px solid rgba(148, 163, 184, .24); background: var(--surface, #fff); color: var(--text, #0f172a); font-weight: 1000; cursor: pointer; }
.spr-form-grid { display: grid; gap: 12px; }
.spr-form-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.spr-field { display: grid; gap: 6px; min-width: 0; }
.spr-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.spr-check { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .14); font-size: 13px; font-weight: 850; }
.spr-check input { width: 18px; min-height: 18px; flex: 0 0 auto; }

@media (max-width: 390px) {
  .spr-page { padding: 6px; }
  .spr-hero { padding: 10px; border-radius: 24px; flex-wrap: wrap; }
  .spr-hero-icon { width: 42px; height: 42px; border-radius: 16px; }
  .spr-hero .spr-primary-btn { width: 100%; }
  .spr-summary-grid { grid-template-columns: minmax(0, 1fr); }
  .spr-rule-main { flex-direction: column; }
  .spr-action-row { grid-template-columns: minmax(0, 1fr); }
}

@media (min-width: 560px) {
  .spr-page { padding: 14px; }
  .spr-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .spr-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .spr-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .spr-action-row { display: flex; flex-wrap: wrap; justify-content: flex-end; }
  .spr-action-row button { padding: 0 14px; }
}

@media (min-width: 980px) {
  .spr-page { padding: 18px; }
  .spr-summary-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .spr-filter-card { grid-template-columns: minmax(260px, 1.4fr) repeat(4, minmax(150px, 1fr)); }
  .spr-rule-card { padding: 16px; }
}
`;
