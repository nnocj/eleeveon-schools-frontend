"use client";

/**
 * ClassSubject.tsx
 * ---------------------------------------------------------
 * CLASS SUBJECT DELIVERY CONTEXT ENGINE
 * ---------------------------------------------------------
 *
 * PURPOSE
 * ---------------------------------------------------------
 * This page manages the operational academic delivery layer.
 *
 * CurriculumSubject defines the global subject rule.
 * ClassSubject turns that rule into a real class + period + teacher context.
 *
 * This is the source of truth used by:
 * - Assessment Applicability
 * - Assessment Entries
 * - Reports
 * - Broadsheets
 * - Computed Results
 *
 * DB FLOW
 * ---------------------------------------------------------
 * CurriculumSubject
 *   -> ClassSubject
 *      -> AssessmentApplicability
 *         -> AssessmentStructure + GradingSystem
 *            -> AssessmentEntry
 *               -> Reports
 *
 * Context-aware:
 * Active School -> Active Branch -> Class Subject Delivery Context
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  Class,
  ClassSubject,
  CurriculumSubject,
  Subject,
  Teacher,
  CurriculumSubjectType,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type FormState = {
  id?: number;

  classId?: number;
  subjectId?: number;
  curriculumSubjectId?: number;

  academicStructureId?: number;
  academicPeriodId?: number;

  teacherId?: number;

  name?: string;
  code?: string;

  credits?: number;
  contactHours?: number;
  type?: CurriculumSubjectType;

  compulsory?: boolean;
  elective?: boolean;

  photo?: string;
  bannerImage?: string;

  active?: boolean;
  locked?: boolean;
};

type ClassSubjectView = {
  row: ClassSubject;
  className: string;
  subjectName: string;
  subjectCode?: string;
  teacherName: string;
  structureName: string;
  periodName: string;
  curriculumLabel: string;
};

// ======================================================
// COMPONENT
// ======================================================

export default function ClassSubjectPage() {
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

  const [rows, setRows] = useState<ClassSubject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);

  const [search, setSearch] = useState("");
  const [filterClassId, setFilterClassId] = useState<number | undefined>();
  const [filterPeriodId, setFilterPeriodId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "locked">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
    classId: undefined,
    subjectId: undefined,
    curriculumSubjectId: undefined,
    academicStructureId: settings?.currentAcademicStructureId,
    academicPeriodId: settings?.currentAcademicPeriodId,
    teacherId: undefined,
    name: "",
    code: "",
    credits: undefined,
    contactHours: undefined,
    type: "core",
    compulsory: true,
    elective: false,
    photo: "",
    bannerImage: "",
    active: true,
    locked: false,
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [
        classRows,
        subjectRows,
        teacherRows,
        structureRows,
        periodRows,
        curriculumSubjectRows,
        classSubjectRows,
      ] = await Promise.all([
        db.classes.toArray(),
        db.subjects.toArray(),
        db.teachers.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.curriculumSubjects.toArray(),
        db.classSubjects.toArray(),
      ]);

      setClasses(
        classRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setSubjects(
        subjectRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setTeachers(
        teacherRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setAcademicStructures(
        structureRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setAcademicPeriods(
        periodRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setCurriculumSubjects(
        curriculumSubjectRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setRows(
        classSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
    } catch (error) {
      console.error("Failed to load class subjects:", error);
      alert("Failed to load class subjects");
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

  const classMap = useMemo(() => new Map(classes.map(row => [row.id, row])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map(row => [row.id, row])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map(row => [row.id, row])), [teachers]);

  const academicStructureMap = useMemo(
    () => new Map(academicStructures.map(row => [row.id, row])),
    [academicStructures]
  );

  const academicPeriodMap = useMemo(
    () => new Map(academicPeriods.map(row => [row.id, row])),
    [academicPeriods]
  );

  const curriculumSubjectMap = useMemo(
    () => new Map(curriculumSubjects.map(row => [row.id, row])),
    [curriculumSubjects]
  );

  const availablePeriods = useMemo(() => {
    return academicPeriods
      .filter(period => {
        if (!form.academicStructureId) return true;
        return period.academicStructureId === Number(form.academicStructureId);
      })
      .sort((a, b) => a.order - b.order);
  }, [academicPeriods, form.academicStructureId]);

  const availableCurriculumSubjects = useMemo(() => {
    return curriculumSubjects
      .filter(row => {
        if (form.subjectId && row.subjectId !== Number(form.subjectId)) return false;
        return true;
      })
      .sort((a, b) => {
        const subjectA = subjectMap.get(a.subjectId)?.name || "";
        const subjectB = subjectMap.get(b.subjectId)?.name || "";
        return subjectA.localeCompare(subjectB);
      });
  }, [curriculumSubjects, form.subjectId, subjectMap]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<ClassSubjectView[]>(() => {
    return rows.map(row => {
      const classData = classMap.get(row.classId);
      const subject = subjectMap.get(row.subjectId);
      const teacher = row.teacherId ? teacherMap.get(row.teacherId) : undefined;
      const structure = academicStructureMap.get(row.academicStructureId);
      const period = row.academicPeriodId ? academicPeriodMap.get(row.academicPeriodId) : undefined;
      const curriculumSubject = curriculumSubjectMap.get(row.curriculumSubjectId);
      const curriculumSubjectName = curriculumSubject
        ? subjectMap.get(curriculumSubject.subjectId)?.name || `Curriculum Subject #${curriculumSubject.id}`
        : "No curriculum link";

      return {
        row,
        className: classData?.name || "Unknown Class",
        subjectName: row.name || subject?.name || "Unknown Subject",
        subjectCode: row.code || subject?.code,
        teacherName: teacher?.fullName || "Unassigned",
        structureName: structure?.name || "Unknown Structure",
        periodName: period?.name || "All Periods",
        curriculumLabel: curriculumSubjectName,
      };
    });
  }, [
    rows,
    classMap,
    subjectMap,
    teacherMap,
    academicStructureMap,
    academicPeriodMap,
    curriculumSubjectMap,
  ]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows.filter(item => {
      const row = item.row;

      if (filterClassId && row.classId !== filterClassId) return false;
      if (filterPeriodId && row.academicPeriodId !== filterPeriodId) return false;

      if (filterStatus === "active" && row.active === false) return false;
      if (filterStatus === "inactive" && row.active !== false) return false;
      if (filterStatus === "locked" && !row.locked) return false;

      if (!query) return true;

      return `
        ${item.className}
        ${item.subjectName}
        ${item.subjectCode || ""}
        ${item.teacherName}
        ${item.structureName}
        ${item.periodName}
        ${item.curriculumLabel}
        ${row.type || ""}
      `
        .toLowerCase()
        .includes(query);
    });
  }, [viewRows, search, filterClassId, filterPeriodId, filterStatus]);

  // ======================================================
  // SMART DEFAULTS
  // ======================================================

  useEffect(() => {
    if (!form.curriculumSubjectId) return;

    const curriculumSubject = curriculumSubjectMap.get(form.curriculumSubjectId);
    if (!curriculumSubject) return;

    setForm(prev => ({
      ...prev,
      subjectId: curriculumSubject.subjectId,
      credits: prev.credits ?? curriculumSubject.credits,
      contactHours: prev.contactHours ?? curriculumSubject.contactHours,
      type: prev.type || curriculumSubject.type || "core",
    }));
  }, [form.curriculumSubjectId, curriculumSubjectMap]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>(resolve => {
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

  const openCreate = () => {
    if (!activeBranchId) {
      alert("Select a branch first before creating a class subject.");
      return;
    }

    setEditMode(false);

    setForm({
      classId: undefined,
      subjectId: undefined,
      curriculumSubjectId: undefined,
      academicStructureId: settings?.currentAcademicStructureId,
      academicPeriodId: settings?.currentAcademicPeriodId,
      teacherId: undefined,
      name: "",
      code: "",
      credits: undefined,
      contactHours: undefined,
      type: "core",
      compulsory: true,
      elective: false,
      photo: "",
      bannerImage: "",
      active: true,
      locked: false,
    });

    setDrawerOpen(true);
  };

  const openEdit = (row: ClassSubject) => {
    setEditMode(true);

    setForm({
      id: row.id,
      classId: row.classId,
      subjectId: row.subjectId,
      curriculumSubjectId: row.curriculumSubjectId,
      academicStructureId: row.academicStructureId,
      academicPeriodId: row.academicPeriodId,
      teacherId: row.teacherId,
      name: row.name || "",
      code: row.code || "",
      credits: row.credits,
      contactHours: row.contactHours,
      type: row.type || "core",
      compulsory: row.compulsory ?? true,
      elective: row.elective ?? false,
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      active: row.active ?? true,
      locked: row.locked ?? false,
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!activeBranchId) return "Select a branch first";
    if (!form.classId) return "Select a class";
    if (!form.subjectId) return "Select a subject";
    if (!form.curriculumSubjectId) return "Select a curriculum subject";
    if (!form.academicStructureId) return "Select an academic structure";

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      return (
        row.classId === Number(form.classId) &&
        row.subjectId === Number(form.subjectId) &&
        row.academicStructureId === Number(form.academicStructureId) &&
        (row.academicPeriodId || 0) === Number(form.academicPeriodId || 0) &&
        !row.isDeleted
      );
    });

    if (duplicate) {
      return "This class subject already exists for the selected class, structure and period";
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

        classId: Number(form.classId),
        subjectId: Number(form.subjectId),
        curriculumSubjectId: Number(form.curriculumSubjectId),

        academicStructureId: Number(form.academicStructureId),
        academicPeriodId: form.academicPeriodId ? Number(form.academicPeriodId) : undefined,

        teacherId: form.teacherId ? Number(form.teacherId) : undefined,

        name: form.name?.trim() || undefined,
        code: form.code?.trim() || undefined,

        credits: form.credits == null ? undefined : Number(form.credits),
        contactHours: form.contactHours == null ? undefined : Number(form.contactHours),
        type: form.type,

        compulsory: !!form.compulsory,
        elective: !!form.elective,

        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,

        active: form.active !== false,
        locked: !!form.locked,
      }) as ClassSubject;

      if (editMode && form.id) {
        await db.classSubjects.update(form.id, payload);
      } else {
        await db.classSubjects.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save class subject:", error);
      alert("Failed to save class subject");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;
    if (!confirm("Delete this class subject?")) return;

    await db.classSubjects.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: ClassSubject) => {
    if (!row.id) return;

    await db.classSubjects.update(row.id, {
      active: row.active === false,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleLocked = async (row: ClassSubject) => {
    if (!row.id) return;

    await db.classSubjects.update(row.id, {
      locked: !row.locked,
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

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
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

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading class subjects...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Class subjects belong to a branch. Select a school and branch from the sidebar before managing class delivery.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>
            Class Subjects
          </h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing class subject delivery in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Create Class Subject
        </button>
      </div>

      {/* ANALYTICS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Total</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{rows.length}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>
            {rows.filter(row => row.active !== false).length}
          </div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Locked</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>
            {rows.filter(row => row.locked).length}
          </div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Teachers Assigned</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>
            {rows.filter(row => !!row.teacherId).length}
          </div>
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
          placeholder="Search class, subject, teacher, period..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterClassId || ""}
          onChange={e => setFilterClassId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Classes</option>
          {classes.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterPeriodId || ""}
          onChange={e => setFilterPeriodId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Periods</option>
          {academicPeriods.map(row => (
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
          <option value="inactive">Inactive</option>
          <option value="locked">Locked</option>
        </select>
      </div>

      {/* LIST */}
      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {filteredRows.map(item => {
          const row = item.row;

          return (
            <div
              key={row.id}
              style={{
                ...card,
                padding: 0,
                overflow: "hidden",
              }}
            >
              {row.bannerImage && (
                <div
                  style={{
                    height: 74,
                    backgroundImage: `url(${row.bannerImage})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              )}

              <div
                style={{
                  padding: 16,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 18,
                      background: row.photo
                        ? `url(${row.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 950,
                      flex: "0 0 54px",
                    }}
                  >
                    {!row.photo && item.subjectName.slice(0, 2).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>
                      {item.subjectName}
                    </div>
                    <div style={{ marginTop: 4, opacity: 0.7, fontSize: 13, fontWeight: 650 }}>
                      {item.className} • {item.periodName} • {item.structureName}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge(row.active === false ? "red" : "green")}>
                        {row.active === false ? "Inactive" : "Active"}
                      </span>
                      <span style={badge(row.locked ? "orange" : "gray")}>
                        {row.locked ? "Locked" : "Unlocked"}
                      </span>
                      <span style={badge(row.type === "elective" ? "blue" : "gray")}>
                        {row.type || "core"}
                      </span>
                      <span style={badge(row.elective ? "blue" : "green")}>
                        {row.elective ? "Elective" : "Compulsory"}
                      </span>
                      <span style={badge("gray")}>{item.teacherName}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button style={ghostButton} onClick={() => toggleActive(row)}>
                    {row.active === false ? "Activate" : "Deactivate"}
                  </button>
                  <button style={ghostButton} onClick={() => toggleLocked(row)}>
                    {row.locked ? "Unlock" : "Lock"}
                  </button>
                  <button style={ghostButton} onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button
                    style={{ ...ghostButton, color: "#dc2626" }}
                    onClick={() => remove(row.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!filteredRows.length && (
          <div style={{ ...card, textAlign: "center", padding: 30 }}>
            No class subjects found in this branch.
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
              width: "min(560px, 100vw)",
              height: "100vh",
              background: "var(--surface)",
              color: "var(--text)",
              boxShadow: "-20px 0 50px rgba(0,0,0,0.25)",
              padding: 22,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                  {editMode ? "Edit Class Subject" : "Create Class Subject"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  This class subject will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Class</label>
                <select
                  value={form.classId || ""}
                  onChange={e => updateForm({ classId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Class</option>
                  {classes.map(row => (
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
                  onChange={e =>
                    updateForm({
                      subjectId: Number(e.target.value) || undefined,
                      curriculumSubjectId: undefined,
                    })
                  }
                  style={input}
                >
                  <option value="">Select Subject</option>
                  {subjects.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name} {row.code ? `(${row.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Curriculum Subject</label>
                <select
                  value={form.curriculumSubjectId || ""}
                  onChange={e =>
                    updateForm({ curriculumSubjectId: Number(e.target.value) || undefined })
                  }
                  style={input}
                >
                  <option value="">Select Curriculum Subject</option>
                  {availableCurriculumSubjects.map(row => {
                    const subject = subjectMap.get(row.subjectId);
                    return (
                      <option key={row.id} value={row.id}>
                        {subject?.name || "Subject"} • {row.type || "core"}
                        {row.credits ? ` • ${row.credits} credits` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label style={label}>Academic Structure</label>
                  <select
                    value={form.academicStructureId || ""}
                    onChange={e =>
                      updateForm({
                        academicStructureId: Number(e.target.value) || undefined,
                        academicPeriodId: undefined,
                      })
                    }
                    style={input}
                  >
                    <option value="">Select Structure</option>
                    {academicStructures.map(row => (
                      <option key={row.id} value={row.id}>
                        {row.name} ({row.level})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={label}>Academic Period</label>
                  <select
                    value={form.academicPeriodId || ""}
                    onChange={e =>
                      updateForm({ academicPeriodId: Number(e.target.value) || undefined })
                    }
                    style={input}
                  >
                    <option value="">All Periods / Not Specific</option>
                    {availablePeriods.map(row => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={label}>Teacher</label>
                <select
                  value={form.teacherId || ""}
                  onChange={e => updateForm({ teacherId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Unassigned</option>
                  {teachers.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.fullName} • {row.role}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label style={label}>Display Name Override</label>
                  <input
                    value={form.name || ""}
                    onChange={e => updateForm({ name: e.target.value })}
                    placeholder="Optional subject name override"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Code Override</label>
                  <input
                    value={form.code || ""}
                    onChange={e => updateForm({ code: e.target.value })}
                    placeholder="Optional code"
                    style={input}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label style={label}>Credits</label>
                  <input
                    type="number"
                    value={form.credits ?? ""}
                    onChange={e =>
                      updateForm({ credits: e.target.value === "" ? undefined : Number(e.target.value) })
                    }
                    placeholder="Credits"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Contact Hours</label>
                  <input
                    type="number"
                    value={form.contactHours ?? ""}
                    onChange={e =>
                      updateForm({
                        contactHours: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="Contact hours"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Type</label>
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
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                  gap: 12,
                }}
              >
                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!form.compulsory}
                    onChange={e => updateForm({ compulsory: e.target.checked })}
                  />
                  Compulsory
                </label>

                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!form.elective}
                    onChange={e => updateForm({ elective: e.target.checked })}
                  />
                  Elective
                </label>

                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={form.active !== false}
                    onChange={e => updateForm({ active: e.target.checked })}
                  />
                  Active
                </label>

                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!form.locked}
                    onChange={e => updateForm({ locked: e.target.checked })}
                  />
                  Locked
                </label>
              </div>

              <div>
                <label style={label}>Subject Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("photo", e.target.files?.[0])}
                  style={input}
                />
                {form.photo && (
                  <img
                    src={form.photo}
                    alt="Subject"
                    style={{ height: 80, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <div>
                <label style={label}>Banner Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("bannerImage", e.target.files?.[0])}
                  style={input}
                />
                {form.bannerImage && (
                  <img
                    src={form.bannerImage}
                    alt="Banner"
                    style={{ width: "100%", height: 110, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Class Subject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
