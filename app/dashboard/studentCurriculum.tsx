"use client";

/**
 * StudentCurriculum.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL STUDENT CURRICULUM PLACEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: studentCurriculums
 * Supporting tables:
 * - students
 * - curriculums
 * - curriculumPathways
 * - academicPeriods
 *
 * ARCHITECTURE
 * ---------------------------------------------------------
 * StudentCurriculum says:
 * "This student is following this curriculum/pathway from this period."
 *
 * Active School -> Active Branch -> Student -> Curriculum -> Pathway
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicPeriod,
  Curriculum,
  CurriculumPathway,
  Student,
  StudentCurriculum,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type PlacementStatus = "active" | "completed" | "withdrawn";

type FormState = {
  id?: number;
  studentId?: number;
  curriculumId?: number;
  pathwayId?: number;
  startAcademicPeriodId?: number;
  endAcademicPeriodId?: number;
  status?: PlacementStatus;
  active?: boolean;
};

type StudentCurriculumView = {
  row: StudentCurriculum;
  studentName: string;
  admissionNumber?: string;
  curriculumName: string;
  pathwayName: string;
  startPeriodName: string;
  endPeriodName: string;
};

// ======================================================
// COMPONENT
// ======================================================

export default function StudentCurriculumPage() {
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

  const [rows, setRows] = useState<StudentCurriculum[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);

  const [search, setSearch] = useState("");
  const [filterCurriculumId, setFilterCurriculumId] = useState<number | undefined>();
  const [filterPathwayId, setFilterPathwayId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | PlacementStatus>("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
    studentId: undefined,
    curriculumId: undefined,
    pathwayId: undefined,
    startAcademicPeriodId: undefined,
    endAcademicPeriodId: undefined,
    status: "active",
    active: true,
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [placementRows, studentRows, curriculumRows, pathwayRows, periodRows] =
        await Promise.all([
          db.studentCurriculums.toArray(),
          db.students.toArray(),
          db.curriculums.toArray(),
          db.curriculumPathways.toArray(),
          db.academicPeriods.toArray(),
        ]);

      setRows(placementRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setStudents(
        studentRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.status !== "withdrawn"
        )
      );
      setCurriculums(
        curriculumRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setPathways(
        pathwayRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setPeriods(
        periodRows
          .filter(row => row.branchId === branchId && !row.isDeleted)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
    } catch (error) {
      console.error("Failed to load student curriculum placements:", error);
      alert("Failed to load student curriculum placements");
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

  const studentMap = useMemo(
    () => new Map(students.map(row => [row.id, row])),
    [students]
  );

  const curriculumMap = useMemo(
    () => new Map(curriculums.map(row => [row.id, row])),
    [curriculums]
  );

  const pathwayMap = useMemo(
    () => new Map(pathways.map(row => [row.id, row])),
    [pathways]
  );

  const periodMap = useMemo(
    () => new Map(periods.map(row => [row.id, row])),
    [periods]
  );

  const filteredPathwaysForForm = useMemo(() => {
    if (!form.curriculumId) return pathways;
    return pathways.filter(row => row.curriculumId === form.curriculumId);
  }, [pathways, form.curriculumId]);

  const filteredPathwaysForFilter = useMemo(() => {
    if (!filterCurriculumId) return pathways;
    return pathways.filter(row => row.curriculumId === filterCurriculumId);
  }, [pathways, filterCurriculumId]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<StudentCurriculumView[]>(() => {
    return rows.map(row => {
      const student = studentMap.get(row.studentId);
      const curriculum = curriculumMap.get(row.curriculumId);
      const pathway = row.pathwayId ? pathwayMap.get(row.pathwayId) : undefined;
      const startPeriod = row.startAcademicPeriodId
        ? periodMap.get(row.startAcademicPeriodId)
        : undefined;
      const endPeriod = row.endAcademicPeriodId
        ? periodMap.get(row.endAcademicPeriodId)
        : undefined;

      return {
        row,
        studentName: student?.fullName || `Student #${row.studentId}`,
        admissionNumber: student?.admissionNumber,
        curriculumName: curriculum?.name || "Unknown curriculum",
        pathwayName: pathway?.name || "No pathway",
        startPeriodName: startPeriod?.name || "No start period",
        endPeriodName: endPeriod?.name || "No end period",
      };
    });
  }, [rows, studentMap, curriculumMap, pathwayMap, periodMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter(item => {
        const row = item.row;

        if (filterCurriculumId && row.curriculumId !== filterCurriculumId) return false;
        if (filterPathwayId && row.pathwayId !== filterPathwayId) return false;
        if (filterStatus !== "all" && row.status !== filterStatus) return false;
        if (filterActive === "active" && row.active === false) return false;
        if (filterActive === "inactive" && row.active !== false) return false;

        if (!query) return true;

        return `
          ${item.studentName}
          ${item.admissionNumber || ""}
          ${item.curriculumName}
          ${item.pathwayName}
          ${item.startPeriodName}
          ${item.endPeriodName}
          ${row.status || ""}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [viewRows, search, filterCurriculumId, filterPathwayId, filterStatus, filterActive]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      activePlacements: rows.filter(row => row.status === "active" && row.active !== false).length,
      completed: rows.filter(row => row.status === "completed").length,
      withdrawn: rows.filter(row => row.status === "withdrawn").length,
      studentsPlaced: new Set(rows.map(row => row.studentId)).size,
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
      alert("Select a branch first before assigning curriculum.");
      return;
    }

    setEditMode(false);
    setForm({
      studentId: undefined,
      curriculumId: filterCurriculumId,
      pathwayId: filterPathwayId,
      startAcademicPeriodId: settings?.currentAcademicPeriodId,
      endAcademicPeriodId: undefined,
      status: "active",
      active: true,
    });
    setDrawerOpen(true);
  };

  const openEdit = (row: StudentCurriculum) => {
    setEditMode(true);
    setForm({
      id: row.id,
      studentId: row.studentId,
      curriculumId: row.curriculumId,
      pathwayId: row.pathwayId,
      startAcademicPeriodId: row.startAcademicPeriodId,
      endAcademicPeriodId: row.endAcademicPeriodId,
      status: row.status || "active",
      active: row.active ?? true,
    });
    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!branchId) return "Select a branch first";
    if (!form.studentId) return "Select student";
    if (!form.curriculumId) return "Select curriculum";

    const selectedPathway = form.pathwayId ? pathwayMap.get(form.pathwayId) : undefined;
    if (selectedPathway && selectedPathway.curriculumId !== form.curriculumId) {
      return "Selected pathway does not belong to the selected curriculum";
    }

    const duplicateActive = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      return (
        row.studentId === Number(form.studentId) &&
        row.curriculumId === Number(form.curriculumId) &&
        Number(row.pathwayId || 0) === Number(form.pathwayId || 0) &&
        row.status === "active" &&
        row.active !== false &&
        !row.isDeleted
      );
    });

    if (duplicateActive && form.status === "active" && form.active !== false) {
      return "This student already has an active placement for this curriculum/pathway";
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
        studentId: Number(form.studentId),
        curriculumId: Number(form.curriculumId),
        pathwayId: form.pathwayId ? Number(form.pathwayId) : undefined,
        startAcademicPeriodId: form.startAcademicPeriodId
          ? Number(form.startAcademicPeriodId)
          : undefined,
        endAcademicPeriodId: form.endAcademicPeriodId
          ? Number(form.endAcademicPeriodId)
          : undefined,
        status: form.status || "active",
        active: form.active !== false,
      }) as StudentCurriculum;

      if (editMode && form.id) {
        await db.studentCurriculums.update(form.id, {
          studentId: payload.studentId,
          curriculumId: payload.curriculumId,
          pathwayId: payload.pathwayId,
          startAcademicPeriodId: payload.startAcademicPeriodId,
          endAcademicPeriodId: payload.endAcademicPeriodId,
          status: payload.status,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        await db.studentCurriculums.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save student curriculum placement:", error);
      alert("Failed to save student curriculum placement");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: StudentCurriculum) => {
    if (!row.id) return;
    if (!confirm("Delete this student curriculum placement?")) return;

    await db.studentCurriculums.update(row.id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const setStatus = async (row: StudentCurriculum, status: PlacementStatus) => {
    if (!row.id) return;

    await db.studentCurriculums.update(row.id, {
      status,
      active: status === "active",
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: StudentCurriculum) => {
    if (!row.id) return;

    await db.studentCurriculums.update(row.id, {
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

  const statusTone = (status?: PlacementStatus): "green" | "blue" | "red" | "gray" => {
    if (status === "completed") return "blue";
    if (status === "withdrawn") return "red";
    if (status === "active" || !status) return "green";
    return "gray";
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading student curriculum placements...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Student curriculum placements belong to a branch. Select a school and branch first.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Student Curriculum</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Assigning students to curriculums in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Assign Curriculum
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
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Placements</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.activePlacements}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Completed</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.completed}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Withdrawn</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.withdrawn}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Students Placed</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.studentsPlaced}</div>
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
          placeholder="Search student, admission number, curriculum, pathway..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterCurriculumId || ""}
          onChange={e => {
            setFilterCurriculumId(Number(e.target.value) || undefined);
            setFilterPathwayId(undefined);
          }}
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
          {filteredPathwaysForFilter.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
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
          <option value="completed">Completed</option>
          <option value="withdrawn">Withdrawn</option>
        </select>

        <select
          value={filterActive}
          onChange={e => setFilterActive(e.target.value as any)}
          style={input}
        >
          <option value="all">All Activity</option>
          <option value="active">Active Records</option>
          <option value="inactive">Inactive Records</option>
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
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{item.studentName}</div>
                    {item.admissionNumber && <span style={badge("gray")}>{item.admissionNumber}</span>}
                    <span style={badge(statusTone(row.status))}>{row.status || "active"}</span>
                    <span style={badge(row.active === false ? "red" : "green")}>
                      {row.active === false ? "Inactive Record" : "Active Record"}
                    </span>
                  </div>

                  <div style={{ marginTop: 7, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                    {item.curriculumName} • {item.pathwayName}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge("blue")}>Start: {item.startPeriodName}</span>
                    <span style={badge("orange")}>End: {item.endPeriodName}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {row.status !== "active" && (
                    <button style={ghostButton} onClick={() => setStatus(row, "active")}>
                      Mark Active
                    </button>
                  )}
                  {row.status !== "completed" && (
                    <button style={ghostButton} onClick={() => setStatus(row, "completed")}>
                      Complete
                    </button>
                  )}
                  <button style={ghostButton} onClick={() => toggleActive(row)}>
                    {row.active === false ? "Reactivate" : "Deactivate"}
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
            No student curriculum placements found in this branch.
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
                  {editMode ? "Edit Student Curriculum" : "Assign Student Curriculum"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Place a student into a curriculum and optional pathway.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Student</label>
                <select
                  value={form.studentId || ""}
                  onChange={e => updateForm({ studentId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Student</option>
                  {students.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.fullName} {row.admissionNumber ? `• ${row.admissionNumber}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Curriculum</label>
                <select
                  value={form.curriculumId || ""}
                  onChange={e =>
                    updateForm({
                      curriculumId: Number(e.target.value) || undefined,
                      pathwayId: undefined,
                    })
                  }
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                <div>
                  <label style={label}>Start Academic Period</label>
                  <select
                    value={form.startAcademicPeriodId || ""}
                    onChange={e =>
                      updateForm({ startAcademicPeriodId: Number(e.target.value) || undefined })
                    }
                    style={input}
                  >
                    <option value="">No start period</option>
                    {periods.map(row => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={label}>End Academic Period</label>
                  <select
                    value={form.endAcademicPeriodId || ""}
                    onChange={e =>
                      updateForm({ endAcademicPeriodId: Number(e.target.value) || undefined })
                    }
                    style={input}
                  >
                    <option value="">No end period</option>
                    {periods.map(row => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={label}>Status</label>
                <select
                  value={form.status || "active"}
                  onChange={e => updateForm({ status: e.target.value as PlacementStatus })}
                  style={input}
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </div>

              <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                <input
                  type="checkbox"
                  checked={form.active !== false}
                  onChange={e => updateForm({ active: e.target.checked })}
                />
                Active Record
              </label>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Assign Curriculum"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
