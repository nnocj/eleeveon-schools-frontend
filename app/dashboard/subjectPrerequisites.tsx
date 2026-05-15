"use client";

/**
 * SubjectPrerequisites.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL SUBJECT PREREQUISITE RULES PAGE
 * ---------------------------------------------------------
 *
 * DB table: subjectPrerequisites
 * Supporting tables:
 * - curriculumSubjects
 * - curriculums
 * - subjects
 * - curriculumPathways
 *
 * ARCHITECTURE
 * ---------------------------------------------------------
 * SubjectPrerequisite belongs to a CurriculumSubject.
 * It defines academic relationship rules such as:
 * - prerequisite
 * - corequisite
 * - recommended
 *
 * Active School -> Active Branch -> CurriculumSubject -> SubjectPrerequisite
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Curriculum,
  CurriculumPathway,
  CurriculumSubject,
  Subject,
  SubjectPrerequisite,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type RuleType = "prerequisite" | "corequisite" | "recommended";

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

// ======================================================
// COMPONENT
// ======================================================

export default function SubjectPrerequisitesPage() {
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

  const [form, setForm] = useState<FormState>({
    curriculumSubjectId: undefined,
    prerequisiteSubjectId: undefined,
    minimumGrade: "",
    minimumScore: undefined,
    type: "prerequisite",
    groupCode: "",
    active: true,
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
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

      setRows(ruleRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setCurriculumSubjects(
        curriculumSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setCurriculums(
        curriculumRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setSubjects(
        subjectRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setPathways(
        pathwayRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
    } catch (error) {
      console.error("Failed to load subject prerequisites:", error);
      alert("Failed to load subject prerequisites");
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

  const curriculumSubjectOptions = useMemo<CurriculumSubjectOption[]>(() => {
    return curriculumSubjects
      .map(row => {
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
          label: `${curriculumName} • ${subjectName}${subjectCode ? ` (${subjectCode})` : ""} • ${pathwayName}`,
        };
      })
      .filter(Boolean) as CurriculumSubjectOption[];
  }, [curriculumSubjects, curriculumMap, subjectMap, pathwayMap]);

  const curriculumSubjectOptionMap = useMemo(
    () => new Map(curriculumSubjectOptions.map(row => [row.id, row])),
    [curriculumSubjectOptions]
  );

  const selectedOwner = useMemo(() => {
    if (!form.curriculumSubjectId) return undefined;
    return curriculumSubjectOptionMap.get(form.curriculumSubjectId);
  }, [form.curriculumSubjectId, curriculumSubjectOptionMap]);

  const prerequisiteOptions = useMemo(() => {
    if (!selectedOwner) return curriculumSubjectOptions;

    return curriculumSubjectOptions.filter(option => {
      if (option.id === selectedOwner.id) return false;
      return option.curriculumId === selectedOwner.curriculumId;
    });
  }, [curriculumSubjectOptions, selectedOwner]);

  const groupCodes = useMemo(() => {
    return Array.from(
      new Set(rows.map(row => row.groupCode).filter(Boolean) as string[])
    ).sort();
  }, [rows]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<PrerequisiteView[]>(() => {
    return rows.map(row => {
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
      .filter(item => {
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
      active: rows.filter(row => row.active !== false).length,
      prerequisite: rows.filter(row => row.type === "prerequisite" || !row.type).length,
      corequisite: rows.filter(row => row.type === "corequisite").length,
      recommended: rows.filter(row => row.type === "recommended").length,
      grouped: rows.filter(row => !!row.groupCode).length,
    };
  }, [rows]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const openCreate = () => {
    if (!activeBranchId) {
      alert("Select a branch first before creating prerequisite rules.");
      return;
    }

    setEditMode(false);
    setForm({
      curriculumSubjectId: undefined,
      prerequisiteSubjectId: undefined,
      minimumGrade: "",
      minimumScore: undefined,
      type: "prerequisite",
      groupCode: "",
      active: true,
    });
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
    if (!branchId) return "Select a branch first";
    if (!form.curriculumSubjectId) return "Select subject rule owner";
    if (!form.prerequisiteSubjectId) return "Select required/related subject";
    if (form.curriculumSubjectId === form.prerequisiteSubjectId) {
      return "A subject cannot require itself";
    }

    const owner = curriculumSubjectOptionMap.get(Number(form.curriculumSubjectId));
    const required = curriculumSubjectOptionMap.get(Number(form.prerequisiteSubjectId));

    if (owner && required && owner.curriculumId !== required.curriculumId) {
      return "Prerequisite relationship must stay within the same curriculum";
    }

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      return (
        row.curriculumSubjectId === Number(form.curriculumSubjectId) &&
        row.prerequisiteSubjectId === Number(form.prerequisiteSubjectId) &&
        row.type === form.type &&
        !row.isDeleted
      );
    });

    if (duplicate) {
      return "This subject relationship already exists";
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
        curriculumSubjectId: Number(form.curriculumSubjectId),
        prerequisiteSubjectId: Number(form.prerequisiteSubjectId),
        minimumGrade: form.minimumGrade?.trim() || undefined,
        minimumScore: form.minimumScore == null ? undefined : Number(form.minimumScore),
        type: form.type || "prerequisite",
        groupCode: form.groupCode?.trim() || undefined,
        active: form.active !== false,
      }) as SubjectPrerequisite;

      if (editMode && form.id) {
        await db.subjectPrerequisites.update(form.id, {
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
        });
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
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: SubjectPrerequisite) => {
    if (!row.id) return;

    await db.subjectPrerequisites.update(row.id, {
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

  const typeTone = (type?: RuleType): "green" | "orange" | "purple" => {
    if (type === "corequisite") return "purple";
    if (type === "recommended") return "orange";
    return "green";
  };

  const typeLabel = (type?: RuleType) => {
    if (type === "corequisite") return "Corequisite";
    if (type === "recommended") return "Recommended";
    return "Prerequisite";
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading subject prerequisites...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Subject prerequisite rules belong to a branch. Select a school and branch first.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Subject Prerequisites</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing curriculum subject relationship rules in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Add Rule
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
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Rules</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.active}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Prerequisite</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.prerequisite}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Corequisite</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.corequisite}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Grouped Rules</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.grouped}</div>
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
          placeholder="Search subject, required subject, grade, group..."
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
          value={filterType}
          onChange={e => setFilterType(e.target.value as any)}
          style={input}
        >
          <option value="all">All Rule Types</option>
          <option value="prerequisite">Prerequisite</option>
          <option value="corequisite">Corequisite</option>
          <option value="recommended">Recommended</option>
        </select>

        <select
          value={filterGroupCode}
          onChange={e => setFilterGroupCode(e.target.value)}
          style={input}
        >
          <option value="">All Groups</option>
          {groupCodes.map(code => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
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
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{item.ownerLabel}</div>
                    <span style={badge(typeTone(row.type))}>{typeLabel(row.type)}</span>
                    <span style={badge(row.active === false ? "red" : "green")}>
                      {row.active === false ? "Inactive" : "Active"}
                    </span>
                    {row.groupCode && <span style={badge("purple")}>Group: {row.groupCode}</span>}
                  </div>

                  <div style={{ marginTop: 7, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                    {item.curriculumName} • {item.pathwayName}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge("blue")}>Requires: {item.prerequisiteLabel}</span>
                    <span style={badge("gray")}>Minimum Grade: {row.minimumGrade || "-"}</span>
                    <span style={badge("gray")}>Minimum Score: {row.minimumScore ?? "-"}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button style={ghostButton} onClick={() => toggleActive(row)}>
                    {row.active === false ? "Activate" : "Deactivate"}
                  </button>
                  <button style={ghostButton} onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => remove(row)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!filteredRows.length && (
          <div style={{ ...card, textAlign: "center", padding: 30 }}>
            No subject prerequisite rules found in this branch.
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
              width: "min(650px, 100vw)",
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
                  {editMode ? "Edit Subject Rule" : "Add Subject Rule"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Define prerequisite, corequisite or recommended subject relationships.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Subject Being Controlled</label>
                <select
                  value={form.curriculumSubjectId || ""}
                  onChange={e =>
                    updateForm({
                      curriculumSubjectId: Number(e.target.value) || undefined,
                      prerequisiteSubjectId: undefined,
                    })
                  }
                  style={input}
                >
                  <option value="">Select Curriculum Subject</option>
                  {curriculumSubjectOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Required / Related Subject</label>
                <select
                  value={form.prerequisiteSubjectId || ""}
                  onChange={e => updateForm({ prerequisiteSubjectId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Required Subject</option>
                  {prerequisiteOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Rule Type</label>
                <select
                  value={form.type || "prerequisite"}
                  onChange={e => updateForm({ type: e.target.value as RuleType })}
                  style={input}
                >
                  <option value="prerequisite">Prerequisite</option>
                  <option value="corequisite">Corequisite</option>
                  <option value="recommended">Recommended</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                <div>
                  <label style={label}>Minimum Grade</label>
                  <input
                    value={form.minimumGrade || ""}
                    onChange={e => updateForm({ minimumGrade: e.target.value })}
                    placeholder="e.g. C6, B3, Pass"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Minimum Score</label>
                  <input
                    type="number"
                    value={form.minimumScore ?? ""}
                    onChange={e =>
                      updateForm({
                        minimumScore: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="e.g. 50"
                    style={input}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Group Code</label>
                <input
                  value={form.groupCode || ""}
                  onChange={e => updateForm({ groupCode: e.target.value })}
                  placeholder="Optional group code for alternative prerequisite groups"
                  style={input}
                />
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
                {saving ? "Saving..." : editMode ? "Save Changes" : "Save Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
