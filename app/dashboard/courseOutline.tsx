"use client";

/**
 * CourseOutline.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL COURSE OUTLINE / DELIVERY MAP PAGE
 * ---------------------------------------------------------
 *
 * IMPORTANT DB NOTE
 * ---------------------------------------------------------
 * Current db.ts does NOT have a dedicated courseOutlines table.
 * Therefore this page is a safe projection page over existing tables.
 *
 * It generates a course outline from:
 * - ClassSubject        = real academic delivery context
 * - CurriculumSubject   = global curriculum subject rules
 * - Curriculum          = academic programme plan
 * - CurriculumPathway   = optional stream/track
 * - Subject             = subject identity
 * - Class               = learner group
 * - AcademicStructure   = academic level/system
 * - AcademicPeriod      = term/semester context
 * - Teacher             = delivery owner
 * - AssessmentApplicability = assessment activation readiness
 *
 * Active School -> Active Branch -> ClassSubject -> Course Outline
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  AssessmentApplicability,
  Class,
  ClassSubject,
  Curriculum,
  CurriculumPathway,
  CurriculumSubject,
  Subject,
  Teacher,
} from "../lib/db";

import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type CourseOutlineView = {
  classSubject: ClassSubject;
  className: string;
  subjectName: string;
  subjectCode?: string;
  teacherName: string;
  curriculumName: string;
  pathwayName: string;
  academicStructureName: string;
  academicPeriodName: string;
  type: string;
  credits?: number;
  contactHours?: number;
  minimumPassScore?: number;
  assessmentConfigured: boolean;
  statusLabel: string;
};

// ======================================================
// COMPONENT
// ======================================================

export default function CourseOutline() {
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

  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [assessmentApplicabilities, setAssessmentApplicabilities] = useState<AssessmentApplicability[]>([]);

  const [search, setSearch] = useState("");
  const [filterClassId, setFilterClassId] = useState<number | undefined>();
  const [filterSubjectId, setFilterSubjectId] = useState<number | undefined>();
  const [filterTeacherId, setFilterTeacherId] = useState<number | undefined>();
  const [filterCurriculumId, setFilterCurriculumId] = useState<number | undefined>();
  const [filterPeriodId, setFilterPeriodId] = useState<number | undefined>();
  const [filterReadiness, setFilterReadiness] = useState<"all" | "ready" | "incomplete">("all");
  const [selectedClassSubjectId, setSelectedClassSubjectId] = useState<number | undefined>();

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [
        classSubjectRows,
        curriculumSubjectRows,
        curriculumRows,
        pathwayRows,
        subjectRows,
        classRows,
        teacherRows,
        structureRows,
        periodRows,
        applicabilityRows,
      ] = await Promise.all([
        db.classSubjects.toArray(),
        db.curriculumSubjects.toArray(),
        db.curriculums.toArray(),
        db.curriculumPathways.toArray(),
        db.subjects.toArray(),
        db.classes.toArray(),
        db.teachers.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.assessmentApplicabilities.toArray(),
      ]);

      setClassSubjects(
        classSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setCurriculumSubjects(
        curriculumSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setCurriculums(
        curriculumRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setPathways(
        pathwayRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setSubjects(
        subjectRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setClasses(
        classRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setTeachers(
        teacherRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setAcademicStructures(
        structureRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setAcademicPeriods(
        periodRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setAssessmentApplicabilities(
        applicabilityRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
    } catch (error) {
      console.error("Failed to load course outline:", error);
      alert("Failed to load course outline data");
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
  const structureMap = useMemo(
    () => new Map(academicStructures.map(row => [row.id, row])),
    [academicStructures]
  );
  const periodMap = useMemo(
    () => new Map(academicPeriods.map(row => [row.id, row])),
    [academicPeriods]
  );
  const curriculumSubjectMap = useMemo(
    () => new Map(curriculumSubjects.map(row => [row.id, row])),
    [curriculumSubjects]
  );
  const curriculumMap = useMemo(
    () => new Map(curriculums.map(row => [row.id, row])),
    [curriculums]
  );
  const pathwayMap = useMemo(
    () => new Map(pathways.map(row => [row.id, row])),
    [pathways]
  );

  const applicabilityByClassSubject = useMemo(() => {
    const map = new Map<number, AssessmentApplicability[]>();

    assessmentApplicabilities.forEach(row => {
      const list = map.get(row.classSubjectId) || [];
      list.push(row);
      map.set(row.classSubjectId, list);
    });

    return map;
  }, [assessmentApplicabilities]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const outlineRows = useMemo<CourseOutlineView[]>(() => {
    return classSubjects.map(classSubject => {
      const classRow = classMap.get(classSubject.classId);
      const subject = subjectMap.get(classSubject.subjectId);
      const teacher = classSubject.teacherId ? teacherMap.get(classSubject.teacherId) : undefined;
      const structure = structureMap.get(classSubject.academicStructureId);
      const period = classSubject.academicPeriodId
        ? periodMap.get(classSubject.academicPeriodId)
        : undefined;
      const curriculumSubject = curriculumSubjectMap.get(classSubject.curriculumSubjectId);
      const curriculum = curriculumSubject
        ? curriculumMap.get(curriculumSubject.curriculumId)
        : undefined;
      const pathway = curriculumSubject?.pathwayId
        ? pathwayMap.get(curriculumSubject.pathwayId)
        : undefined;

      const applicability = classSubject.id
        ? applicabilityByClassSubject.get(classSubject.id) || []
        : [];

      const activeApplicability = applicability.find(row => row.active !== false);
      const assessmentConfigured = !!activeApplicability;

      const credits = classSubject.credits ?? curriculumSubject?.credits;
      const contactHours = classSubject.contactHours ?? curriculumSubject?.contactHours;
      const type = classSubject.type || curriculumSubject?.type || "core";

      const statusLabel = classSubject.locked
        ? "Locked"
        : classSubject.active === false
        ? "Inactive"
        : assessmentConfigured
        ? "Ready"
        : "Needs Assessment Setup";

      return {
        classSubject,
        className: classRow?.name || `Class #${classSubject.classId}`,
        subjectName: classSubject.name || subject?.name || `Subject #${classSubject.subjectId}`,
        subjectCode: classSubject.code || subject?.code,
        teacherName: teacher?.fullName || "No teacher assigned",
        curriculumName: curriculum?.name || "Unknown curriculum",
        pathwayName: pathway?.name || "No pathway",
        academicStructureName: structure?.name || "Unknown academic structure",
        academicPeriodName: period?.name || "All / No period selected",
        type,
        credits,
        contactHours,
        minimumPassScore: curriculumSubject?.minimumPassScore,
        assessmentConfigured,
        statusLabel,
      };
    });
  }, [
    classSubjects,
    classMap,
    subjectMap,
    teacherMap,
    structureMap,
    periodMap,
    curriculumSubjectMap,
    curriculumMap,
    pathwayMap,
    applicabilityByClassSubject,
  ]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return outlineRows
      .filter(item => {
        const row = item.classSubject;

        if (filterClassId && row.classId !== filterClassId) return false;
        if (filterSubjectId && row.subjectId !== filterSubjectId) return false;
        if (filterTeacherId && row.teacherId !== filterTeacherId) return false;
        if (filterPeriodId && row.academicPeriodId !== filterPeriodId) return false;

        if (filterCurriculumId) {
          const curriculumSubject = curriculumSubjectMap.get(row.curriculumSubjectId);
          if (curriculumSubject?.curriculumId !== filterCurriculumId) return false;
        }

        if (filterReadiness === "ready" && !item.assessmentConfigured) return false;
        if (filterReadiness === "incomplete" && item.assessmentConfigured) return false;

        if (!query) return true;

        return `
          ${item.className}
          ${item.subjectName}
          ${item.subjectCode || ""}
          ${item.teacherName}
          ${item.curriculumName}
          ${item.pathwayName}
          ${item.academicStructureName}
          ${item.academicPeriodName}
          ${item.type}
          ${item.statusLabel}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const classCompare = a.className.localeCompare(b.className);
        if (classCompare !== 0) return classCompare;
        return a.subjectName.localeCompare(b.subjectName);
      });
  }, [
    outlineRows,
    search,
    filterClassId,
    filterSubjectId,
    filterTeacherId,
    filterCurriculumId,
    filterPeriodId,
    filterReadiness,
    curriculumSubjectMap,
  ]);

  const selectedOutline = useMemo(() => {
    return outlineRows.find(row => row.classSubject.id === selectedClassSubjectId) || filteredRows[0];
  }, [outlineRows, filteredRows, selectedClassSubjectId]);

  const summary = useMemo(() => {
    return {
      total: outlineRows.length,
      ready: outlineRows.filter(row => row.assessmentConfigured).length,
      incomplete: outlineRows.filter(row => !row.assessmentConfigured).length,
      withTeachers: outlineRows.filter(row => !!row.classSubject.teacherId).length,
      locked: outlineRows.filter(row => row.classSubject.locked).length,
    };
  }, [outlineRows]);

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

  const statusTone = (status: string): "green" | "red" | "orange" | "gray" => {
    if (status === "Ready") return "green";
    if (status === "Locked") return "orange";
    if (status === "Inactive") return "red";
    return "gray";
  };

  const typeTone = (type: string): "green" | "orange" | "purple" => {
    if (type === "elective") return "orange";
    if (type === "optional") return "purple";
    return "green";
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading course outlines...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Course outlines are generated from class subjects inside a branch. Select a school and branch first.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Course Outline</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Generated delivery outlines for <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button type="button" onClick={load} style={ghostButton}>
          Refresh
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
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Course Outlines</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Assessment Ready</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.ready}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Needs Setup</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.incomplete}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>With Teachers</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.withTeachers}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Locked</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.locked}</div>
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
          placeholder="Search class, subject, teacher, curriculum..."
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
          value={filterSubjectId || ""}
          onChange={e => setFilterSubjectId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Subjects</option>
          {subjects.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterTeacherId || ""}
          onChange={e => setFilterTeacherId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Teachers</option>
          {teachers.map(row => (
            <option key={row.id} value={row.id}>
              {row.fullName}
            </option>
          ))}
        </select>

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
          value={filterReadiness}
          onChange={e => setFilterReadiness(e.target.value as any)}
          style={input}
        >
          <option value="all">All Readiness</option>
          <option value="ready">Assessment Ready</option>
          <option value="incomplete">Needs Assessment Setup</option>
        </select>
      </div>

      {/* MAIN OUTLINE AREA */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "minmax(280px, 0.9fr) minmax(320px, 1.4fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* LEFT LIST */}
        <div style={{ display: "grid", gap: 10 }}>
          {filteredRows.map(item => {
            const active = selectedOutline?.classSubject.id === item.classSubject.id;

            return (
              <button
                key={item.classSubject.id}
                type="button"
                onClick={() => setSelectedClassSubjectId(item.classSubject.id)}
                style={{
                  ...card,
                  textAlign: "left",
                  cursor: "pointer",
                  border: active ? `2px solid ${primary}` : "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong>{item.subjectName}</strong>
                  <span style={badge(statusTone(item.statusLabel))}>{item.statusLabel}</span>
                </div>
                <div style={{ marginTop: 6, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                  {item.className} • {item.academicPeriodName}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={badge(typeTone(item.type))}>{item.type}</span>
                  <span style={badge("gray")}>{item.teacherName}</span>
                </div>
              </button>
            );
          })}

          {!filteredRows.length && (
            <div style={{ ...card, textAlign: "center", padding: 30 }}>
              No course outlines found. Create Class Subjects first.
            </div>
          )}
        </div>

        {/* RIGHT DETAIL */}
        <div style={card}>
          {selectedOutline ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>
                    {selectedOutline.subjectName}
                  </h3>
                  <div style={{ marginTop: 5, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
                    {selectedOutline.className} • {selectedOutline.academicPeriodName}
                  </div>
                </div>

                <span style={badge(statusTone(selectedOutline.statusLabel))}>
                  {selectedOutline.statusLabel}
                </span>
              </div>

              <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
                <section style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <div style={{ fontSize: 12, opacity: 0.62, fontWeight: 900, textTransform: "uppercase" }}>
                    Course Identity
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {selectedOutline.subjectCode && (
                      <span style={badge("gray")}>Code: {selectedOutline.subjectCode}</span>
                    )}
                    <span style={badge(typeTone(selectedOutline.type))}>Type: {selectedOutline.type}</span>
                    <span style={badge("blue")}>Credits: {selectedOutline.credits ?? "-"}</span>
                    <span style={badge("blue")}>Contact Hours: {selectedOutline.contactHours ?? "-"}</span>
                    <span style={badge("orange")}>
                      Minimum Pass: {selectedOutline.minimumPassScore ?? "-"}
                    </span>
                  </div>
                </section>

                <section style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <div style={{ fontSize: 12, opacity: 0.62, fontWeight: 900, textTransform: "uppercase" }}>
                    Academic Context
                  </div>
                  <div style={{ marginTop: 10, display: "grid", gap: 8, fontSize: 14 }}>
                    <div><b>Curriculum:</b> {selectedOutline.curriculumName}</div>
                    <div><b>Pathway:</b> {selectedOutline.pathwayName}</div>
                    <div><b>Academic Structure:</b> {selectedOutline.academicStructureName}</div>
                    <div><b>Academic Period:</b> {selectedOutline.academicPeriodName}</div>
                  </div>
                </section>

                <section style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <div style={{ fontSize: 12, opacity: 0.62, fontWeight: 900, textTransform: "uppercase" }}>
                    Delivery Ownership
                  </div>
                  <div style={{ marginTop: 10, display: "grid", gap: 8, fontSize: 14 }}>
                    <div><b>Teacher:</b> {selectedOutline.teacherName}</div>
                    <div><b>Locked:</b> {selectedOutline.classSubject.locked ? "Yes" : "No"}</div>
                    <div><b>Active:</b> {selectedOutline.classSubject.active === false ? "No" : "Yes"}</div>
                  </div>
                </section>

                <section style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <div style={{ fontSize: 12, opacity: 0.62, fontWeight: 900, textTransform: "uppercase" }}>
                    Assessment Readiness
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge(selectedOutline.assessmentConfigured ? "green" : "orange")}>
                      {selectedOutline.assessmentConfigured
                        ? "Assessment applicability configured"
                        : "Assessment applicability not configured"}
                    </span>
                  </div>
                  <p style={{ margin: "10px 0 0", opacity: 0.68, fontSize: 13, lineHeight: 1.5 }}>
                    This outline is generated from your academic delivery setup. To make this course fully report-ready,
                    ensure Assessment Applicability is configured for this ClassSubject.
                  </p>
                </section>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: 30 }}>
              Select a course outline to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
