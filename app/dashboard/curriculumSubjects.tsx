"use client";

/**
 * CurriculumSubjects.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL CURRICULUM SUBJECT RULES PAGE
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
 * ARCHITECTURE
 * ---------------------------------------------------------
 * CurriculumSubject is the global curriculum rule layer.
 * It says: "This subject belongs to this curriculum under these rules."
 *
 * ClassSubject later becomes the real academic delivery context:
 * class + subject + curriculumSubject + academic period + teacher.
 *
 * Active School -> Active Branch -> Curriculum -> CurriculumSubject -> ClassSubject
 */

import React, { useEffect, useMemo, useState } from "react";

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
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

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

// ======================================================
// COMPONENT
// ======================================================

export default function CurriculumSubjectsPage() {
  const { settings } = useSettings();
  const {
    activeSchool,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const branchId = activeBranchId || settings?.branchId || 1;
  const primary = settings?.primaryColor || "var(--primary-color)";

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

  const [form, setForm] = useState<FormState>({
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
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
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

      setRows(curriculumSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setCurriculums(
        curriculumRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setSubjects(
        subjectRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setPathways(
        pathwayRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setOrganizations(
        organizationRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setClassSubjects(
        classSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setPrerequisites(
        prerequisiteRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
    } catch (error) {
      console.error("Failed to load curriculum subjects:", error);
      alert("Failed to load curriculum subjects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const curriculumMap = useMemo(
    () => new Map(curriculums.map(row => [row.id, row])),
    [curriculums]
  );

  const subjectMap = useMemo(
    () => new Map(subjects.map(row => [row.id, row])),
    [subjects]
  );

  const pathwayMap = useMemo(
    () => new Map(pathways.map(row => [row.id, row])),
    [pathways]
  );

  const organizationMap = useMemo(
    () => new Map(organizations.map(row => [row.id, row])),
    [organizations]
  );

  const usageMaps = useMemo(() => {
    const classSubjectMap = new Map<number, number>();
    const prerequisiteMap = new Map<number, number>();

    classSubjects.forEach(row => {
      classSubjectMap.set(
        row.curriculumSubjectId,
        (classSubjectMap.get(row.curriculumSubjectId) || 0) + 1
      );
    });

    prerequisites.forEach(row => {
      prerequisiteMap.set(
        row.curriculumSubjectId,
        (prerequisiteMap.get(row.curriculumSubjectId) || 0) + 1
      );
    });

    return { classSubjectMap, prerequisiteMap };
  }, [classSubjects, prerequisites]);

  const filteredPathwaysForForm = useMemo(() => {
    if (!form.curriculumId) return pathways;
    return pathways.filter(row => row.curriculumId === form.curriculumId);
  }, [pathways, form.curriculumId]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<CurriculumSubjectView[]>(() => {
    return rows.map(row => {
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
      .filter(item => {
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
      active: rows.filter(row => row.active !== false).length,
      core: rows.filter(row => row.type === "core").length,
      elective: rows.filter(row => row.type === "elective").length,
      optional: rows.filter(row => row.type === "optional").length,
      classSubjects: classSubjects.length,
    };
  }, [rows, classSubjects]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const openCreate = () => {
    if (!activeBranchId) {
      alert("Select a branch first before creating curriculum subjects.");
      return;
    }

    setEditMode(false);
    setForm({
      curriculumId: filterCurriculumId,
      subjectId: undefined,
      pathwayId: undefined,
      organizationId: undefined,
      type: "core",
      credits: undefined,
      contactHours: undefined,
      minimumPassScore: undefined,
      orderIndex: undefined,
      active: true,
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
    if (!branchId) return "Select a branch first";
    if (!form.curriculumId) return "Select curriculum";
    if (!form.subjectId) return "Select subject";

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      const sameCurriculum = row.curriculumId === Number(form.curriculumId);
      const sameSubject = row.subjectId === Number(form.subjectId);
      const samePathway = Number(row.pathwayId || 0) === Number(form.pathwayId || 0);

      return sameCurriculum && sameSubject && samePathway && !row.isDeleted;
    });

    if (duplicate) {
      return "This subject is already attached to this curriculum/pathway";
    }

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
        branchId,
        curriculumId: Number(form.curriculumId),
        subjectId: Number(form.subjectId),
        pathwayId: form.pathwayId ? Number(form.pathwayId) : undefined,
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        type: form.type || "core",
        credits: form.credits == null ? undefined : Number(form.credits),
        contactHours: form.contactHours == null ? undefined : Number(form.contactHours),
        minimumPassScore:
          form.minimumPassScore == null ? undefined : Number(form.minimumPassScore),
        orderIndex: form.orderIndex == null ? undefined : Number(form.orderIndex),
        active: form.active !== false,
      }) as CurriculumSubject;

      if (editMode && form.id) {
        await db.curriculumSubjects.update(form.id, {
          curriculumId: payload.curriculumId,
          subjectId: payload.subjectId,
          pathwayId: payload.pathwayId,
          organizationId: payload.organizationId,
          type: payload.type,
          credits: payload.credits,
          contactHours: payload.contactHours,
          minimumPassScore: payload.minimumPassScore,
          orderIndex: payload.orderIndex,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
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
    } else {
      if (!confirm("Delete this curriculum subject?")) return;
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

  // ======================================================
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 650,
  };

  const label: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 12,
    opacity: 0.72,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  const button: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
  };

  const ghostButton: React.CSSProperties = {
    padding: "10px 13px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 750,
    cursor: "pointer",
  };

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange" | "purple"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
      purple: { bg: "rgba(147,51,234,0.12)", color: "#7e22ce" },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 9px",
      borderRadius: 999,
      background: tones.bg,
      color: tones.color,
      fontSize: 11,
      fontWeight: 850,
    };
  };

  const typeTone = (type?: CurriculumSubjectType): "green" | "orange" | "purple" => {
    if (type === "elective") return "orange";
    if (type === "optional") return "purple";
    return "green";
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading curriculum subjects...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Curriculum subjects belong to a branch. Select a school and branch first.
          </p>
        </div>
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Curriculum Subjects</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing global curriculum subject rules in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Add Curriculum Subject
        </button>
      </div>

      {/* ANALYTICS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Total</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.active}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Core</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.core}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Elective</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.elective}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>ClassSubject Links</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.classSubjects}</div>
        </div>
      </div>

      {/* FILTERS */}
      <div
        style={{
          ...card,
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 12,
        }}
      >
        <input
          placeholder="Search subject, curriculum, pathway, type..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterCurriculumId || ""}
          onChange={e => setFilterCurriculumId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Curriculums</option>
          {curriculums.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterPathwayId || ""}
          onChange={e => setFilterPathwayId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Pathways</option>
          {pathways.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterOrganizationId || ""}
          onChange={e => setFilterOrganizationId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Organizations</option>
          {organizations.map(row => (
            <option key={row.id} value={row.id}>
              {row.name} • {row.type}
            </option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as any)}
          style={input}
        >
          <option value="all">All Types</option>
          <option value="core">Core</option>
          <option value="elective">Elective</option>
          <option value="optional">Optional</option>
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as any)}
          style={input}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* LIST */}
      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {filteredRows.map(item => {
          const row = item.row;

          return (
            <div key={row.id} style={card}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{item.subjectName}</div>
                    {item.subjectCode && <span style={badge("gray")}>{item.subjectCode}</span>}
                    <span style={badge(typeTone(row.type))}>{row.type || "core"}</span>
                    <span style={badge(row.active === false ? "red" : "green")}>
                      {row.active === false ? "Inactive" : "Active"}
                    </span>
                  </div>

                  <div style={{ marginTop: 7, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                    {item.curriculumName} • {item.pathwayName} • {item.organizationName}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge("blue")}>Credits: {row.credits ?? "-"}</span>
                    <span style={badge("blue")}>Contact Hours: {row.contactHours ?? "-"}</span>
                    <span style={badge("orange")}>Pass Score: {row.minimumPassScore ?? "-"}</span>
                    <span style={badge("gray")}>Order: {row.orderIndex ?? "-"}</span>
                    <span style={badge("purple")}>{item.classSubjectCount} class subject link(s)</span>
                    <span style={badge("gray")}>{item.prerequisiteCount} prerequisite(s)</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button style={ghostButton} onClick={() => toggleActive(row)}>
                    {row.active === false ? "Activate" : "Deactivate"}
                  </button>
                  <button style={ghostButton} onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => remove(item)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!filteredRows.length && (
          <div style={{ ...card, textAlign: "center", padding: 30 }}>
            No curriculum subjects found in this branch.
          </div>
        )}
      </div>

      {/* DRAWER */}
      {drawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            justifyContent: "flex-end",
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            style={{
              width: "min(620px, 100vw)",
              height: "100vh",
              background: "var(--surface)",
              color: "var(--text)",
              boxShadow: "-20px 0 50px rgba(0,0,0,0.25)",
              padding: 22,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                  {editMode ? "Edit Curriculum Subject" : "Add Curriculum Subject"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Define global rules before assigning subjects to classes.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Curriculum</label>
                <select
                  value={form.curriculumId || ""}
                  onChange={e => updateForm({ curriculumId: Number(e.target.value) || undefined, pathwayId: undefined })}
                  style={input}
                >
                  <option value="">Select Curriculum</option>
                  {curriculums.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Subject</label>
                <select
                  value={form.subjectId || ""}
                  onChange={e => updateForm({ subjectId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Subject</option>
                  {subjects.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name} {row.code ? `• ${row.code}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Pathway</label>
                <select
                  value={form.pathwayId || ""}
                  onChange={e => updateForm({ pathwayId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">No pathway</option>
                  {filteredPathwaysForForm.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Organization / Department</label>
                <select
                  value={form.organizationId || ""}
                  onChange={e => updateForm({ organizationId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">No organization</option>
                  {organizations.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name} • {row.type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Subject Type</label>
                <select
                  value={form.type || "core"}
                  onChange={e => updateForm({ type: e.target.value as CurriculumSubjectType })}
                  style={input}
                >
                  <option value="core">Core</option>
                  <option value="elective">Elective</option>
                  <option value="optional">Optional</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
                <div>
                  <label style={label}>Credits</label>
                  <input
                    type="number"
                    value={form.credits ?? ""}
                    onChange={e => updateForm({ credits: e.target.value === "" ? undefined : Number(e.target.value) })}
                    placeholder="Credits"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Contact Hours</label>
                  <input
                    type="number"
                    value={form.contactHours ?? ""}
                    onChange={e => updateForm({ contactHours: e.target.value === "" ? undefined : Number(e.target.value) })}
                    placeholder="Hours"
                    style={input}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
                <div>
                  <label style={label}>Minimum Pass Score</label>
                  <input
                    type="number"
                    value={form.minimumPassScore ?? ""}
                    onChange={e => updateForm({ minimumPassScore: e.target.value === "" ? undefined : Number(e.target.value) })}
                    placeholder="Pass score"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Order Index</label>
                  <input
                    type="number"
                    value={form.orderIndex ?? ""}
                    onChange={e => updateForm({ orderIndex: e.target.value === "" ? undefined : Number(e.target.value) })}
                    placeholder="Order"
                    style={input}
                  />
                </div>
              </div>

              <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                <input
                  type="checkbox"
                  checked={form.active !== false}
                  onChange={e => updateForm({ active: e.target.checked })}
                />
                Active
              </label>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Add Curriculum Subject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
