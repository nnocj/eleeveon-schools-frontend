"use client";

/**
 * reportRemarks.tsx
 * ---------------------------------------------------------
 * STUDENT REPORT CARD REMARKS CENTER
 * ---------------------------------------------------------
 *
 * Purpose:
 * Active School -> Active Branch -> Academic Structure -> Academic Period -> Class -> Student Report Remarks
 *
 * This page does NOT replace reports/Report.tsx.
 * reports/Report.tsx remains the preview/print/export engine.
 *
 * This page only manages remarks stored in the existing ReportCard table:
 * - classTeacherRemark
 * - headTeacherRemark
 * - published
 *
 * Report engine should later inject these fields into StudentReportCard.
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  Class,
  ReportCard,
  Student,
  StudentEnrollment,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { SyncStatus } from "../lib/constants/syncStatus";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type ViewMode = "single" | "group";
type RemarkFilter = "all" | "missing" | "complete" | "published" | "unpublished";

type RemarkDraft = {
  reportCardId?: number;
  classTeacherRemark: string;
  headTeacherRemark: string;
  published: boolean;
};

type DraftMap = Record<number, RemarkDraft>;

type StudentRemarkRow = {
  student: Student;
  enrollment: StudentEnrollment;
  reportCard?: ReportCard;
  draft: RemarkDraft;
};

// ======================================================
// HELPERS
// ======================================================

const todayTime = () => Date.now();

const defaultDraft = (): RemarkDraft => ({
  classTeacherRemark: "",
  headTeacherRemark: "",
  published: false,
});

const countWords = (text: string) => {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
};

// ======================================================
// COMPONENT
// ======================================================

export default function ReportRemarks() {
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

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);

  const [academicStructureId, setAcademicStructureId] = useState<number | undefined>(
    settings?.currentAcademicStructureId
  );
  const [academicPeriodId, setAcademicPeriodId] = useState<number | undefined>(
    settings?.currentAcademicPeriodId
  );
  const [classId, setClassId] = useState<number | undefined>();
  const [studentId, setStudentId] = useState<number | undefined>();

  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [remarkFilter, setRemarkFilter] = useState<RemarkFilter>("all");
  const [search, setSearch] = useState("");

  const [drafts, setDrafts] = useState<DraftMap>({});
  const [bulkClassRemark, setBulkClassRemark] = useState("");
  const [bulkHeadRemark, setBulkHeadRemark] = useState("");
  const [bulkOverwrite, setBulkOverwrite] = useState(false);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [studentRows, classRows, structureRows, periodRows, enrollmentRows, reportRows] =
        await Promise.all([
          db.students.toArray(),
          db.classes.toArray(),
          db.academicStructures.toArray(),
          db.academicPeriods.toArray(),
          db.studentEnrollments.toArray(),
          db.reportCards.toArray(),
        ]);

      setStudents(
        studentRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.status !== "withdrawn"
        )
      );

      setClasses(
        classRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );

      setAcademicStructures(
        structureRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );

      setAcademicPeriods(
        periodRows
          .filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );

      setEnrollments(enrollmentRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setReportCards(reportRows.filter(row => row.branchId === branchId && !row.isDeleted));
    } catch (error) {
      console.error("Failed to load report remarks:", error);
      alert("Failed to load report remarks");
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

  const studentMap = useMemo(() => new Map(students.map(row => [row.id, row])), [students]);
  const classMap = useMemo(() => new Map(classes.map(row => [row.id, row])), [classes]);

  const filteredPeriods = useMemo(() => {
    if (!academicStructureId) return academicPeriods;
    return academicPeriods.filter(row => row.academicStructureId === academicStructureId);
  }, [academicPeriods, academicStructureId]);

  const availableClassIds = useMemo(() => {
    const ids = new Set<number>();

    enrollments.forEach(row => {
      if (row.status !== "active") return;
      if (academicStructureId && row.academicStructureId !== academicStructureId) return;
      if (academicPeriodId && row.academicPeriodId !== academicPeriodId) return;
      ids.add(row.classId);
    });

    reportCards.forEach(row => {
      if (academicStructureId && row.academicStructureId !== academicStructureId) return;
      if (academicPeriodId && row.academicPeriodId !== academicPeriodId) return;
      ids.add(row.classId);
    });

    return ids;
  }, [enrollments, reportCards, academicStructureId, academicPeriodId]);

  const availableClasses = useMemo(() => {
    if (!academicStructureId && !academicPeriodId) return classes;
    return classes.filter(row => row.id && availableClassIds.has(row.id));
  }, [classes, availableClassIds, academicStructureId, academicPeriodId]);

  const reportCardKey = (
    studentIdValue: number,
    classIdValue: number,
    structureIdValue: number,
    periodIdValue: number
  ) => `${studentIdValue}:${classIdValue}:${structureIdValue}:${periodIdValue}`;

  const reportCardMap = useMemo(() => {
    const map = new Map<string, ReportCard>();

    reportCards.forEach(row => {
      map.set(
        reportCardKey(
          row.studentId,
          row.classId,
          row.academicStructureId,
          row.academicPeriodId
        ),
        row
      );
    });

    return map;
  }, [reportCards]);

  // ======================================================
  // STUDENT ROWS
  // ======================================================

  const studentRows = useMemo<StudentRemarkRow[]>(() => {
    if (!academicStructureId || !academicPeriodId || !classId) return [];

    return enrollments
      .filter(row => {
        return (
          row.status === "active" &&
          row.academicStructureId === academicStructureId &&
          row.academicPeriodId === academicPeriodId &&
          row.classId === classId &&
          !row.isDeleted
        );
      })
      .map(enrollment => {
        const student = studentMap.get(enrollment.studentId);
        if (!student?.id) return undefined;

        const key = reportCardKey(
          student.id,
          enrollment.classId,
          enrollment.academicStructureId,
          enrollment.academicPeriodId
        );

        const reportCard = reportCardMap.get(key);
        const draft = drafts[student.id] || {
          reportCardId: reportCard?.id,
          classTeacherRemark: reportCard?.classTeacherRemark || "",
          headTeacherRemark: reportCard?.headTeacherRemark || "",
          published: !!reportCard?.published,
        };

        return {
          student,
          enrollment,
          reportCard,
          draft,
        };
      })
      .filter(Boolean) as StudentRemarkRow[];
  }, [
    enrollments,
    studentMap,
    reportCardMap,
    drafts,
    academicStructureId,
    academicPeriodId,
    classId,
  ]);

  const filteredStudentRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return studentRows
      .filter(row => {
        const draft = row.draft;
        const hasClassRemark = !!draft.classTeacherRemark.trim();
        const hasHeadRemark = !!draft.headTeacherRemark.trim();
        const complete = hasClassRemark && hasHeadRemark;

        if (viewMode === "single" && studentId && row.student.id !== studentId) return false;
        if (remarkFilter === "missing" && complete) return false;
        if (remarkFilter === "complete" && !complete) return false;
        if (remarkFilter === "published" && !draft.published) return false;
        if (remarkFilter === "unpublished" && draft.published) return false;

        if (!query) return true;

        return `${row.student.fullName} ${row.student.admissionNumber || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));
  }, [studentRows, search, viewMode, studentId, remarkFilter]);

  const selectedStudentRow = useMemo(() => {
    if (!studentId) return filteredStudentRows[0];
    return studentRows.find(row => row.student.id === studentId);
  }, [studentRows, filteredStudentRows, studentId]);

  // ======================================================
  // HYDRATE DRAFTS FROM REPORTCARDS
  // ======================================================

  useEffect(() => {
    if (!academicStructureId || !academicPeriodId || !classId) {
      setDrafts({});
      return;
    }

    const next: DraftMap = {};

    studentRows.forEach(row => {
      if (!row.student.id) return;

      next[row.student.id] = {
        reportCardId: row.reportCard?.id,
        classTeacherRemark: row.reportCard?.classTeacherRemark || "",
        headTeacherRemark: row.reportCard?.headTeacherRemark || "",
        published: !!row.reportCard?.published,
      };
    });

    setDrafts(next);
  }, [academicStructureId, academicPeriodId, classId, reportCards.length]);

  // ======================================================
  // SUMMARY
  // ======================================================

  const summary = useMemo(() => {
    const total = studentRows.length;
    const classRemarked = studentRows.filter(row => !!row.draft.classTeacherRemark.trim()).length;
    const headRemarked = studentRows.filter(row => !!row.draft.headTeacherRemark.trim()).length;
    const complete = studentRows.filter(
      row => !!row.draft.classTeacherRemark.trim() && !!row.draft.headTeacherRemark.trim()
    ).length;
    const published = studentRows.filter(row => row.draft.published).length;
    const missing = Math.max(0, total - complete);
    const completion = total ? Math.round((complete / total) * 100) : 0;

    return { total, classRemarked, headRemarked, complete, published, missing, completion };
  }, [studentRows]);

  // ======================================================
  // DRAFT ACTIONS
  // ======================================================

  const updateDraft = (studentIdValue: number, patch: Partial<RemarkDraft>) => {
    setDrafts(prev => ({
      ...prev,
      [studentIdValue]: {
        ...(prev[studentIdValue] || defaultDraft()),
        ...patch,
      },
    }));
  };

  const applyBulkRemarks = () => {
    if (!filteredStudentRows.length) return alert("No students match the current filter");
    if (!bulkClassRemark.trim() && !bulkHeadRemark.trim()) {
      return alert("Enter a class teacher remark or head teacher remark first");
    }

    const next: DraftMap = { ...drafts };

    filteredStudentRows.forEach(row => {
      const sid = row.student.id || 0;
      const current = next[sid] || row.draft || defaultDraft();

      next[sid] = {
        ...current,
        classTeacherRemark:
          bulkClassRemark.trim() && (bulkOverwrite || !current.classTeacherRemark.trim())
            ? bulkClassRemark.trim()
            : current.classTeacherRemark,
        headTeacherRemark:
          bulkHeadRemark.trim() && (bulkOverwrite || !current.headTeacherRemark.trim())
            ? bulkHeadRemark.trim()
            : current.headTeacherRemark,
      };
    });

    setDrafts(next);
  };

  const togglePublishShown = (published: boolean) => {
    const next: DraftMap = { ...drafts };

    filteredStudentRows.forEach(row => {
      const sid = row.student.id || 0;
      next[sid] = {
        ...(next[sid] || row.draft || defaultDraft()),
        published,
      };
    });

    setDrafts(next);
  };

  // ======================================================
  // SAVE
  // ======================================================

  const saveRows = async (rows: StudentRemarkRow[]) => {
    if (!branchId) return alert("Select branch first");
    if (!academicStructureId) return alert("Select academic structure");
    if (!academicPeriodId) return alert("Select academic period");
    if (!classId) return alert("Select class");
    if (!rows.length) return alert("No students to save");

    try {
      setSaving(true);

      for (const row of rows) {
        const sid = row.student.id;
        if (!sid) continue;

        const draft = drafts[sid] || row.draft || defaultDraft();

        const existing = row.reportCard || reportCardMap.get(
          reportCardKey(sid, classId, academicStructureId, academicPeriodId)
        );

        if (existing?.id) {
          await db.reportCards.update(existing.id, {
            classTeacherRemark: draft.classTeacherRemark.trim() || undefined,
            headTeacherRemark: draft.headTeacherRemark.trim() || undefined,
            published: draft.published,
            updatedAt: todayTime(),
            synced: SyncStatus.PENDING,
          });
        } else {
          const payload = prepareSyncData({
            branchId,
            studentId: sid,
            classId,
            academicStructureId,
            academicPeriodId,
            total: 0,
            average: 0,
            position: undefined,
            attendancePercent: undefined,
            classTeacherRemark: draft.classTeacherRemark.trim() || undefined,
            headTeacherRemark: draft.headTeacherRemark.trim() || undefined,
            published: draft.published,
          }) as ReportCard;

          await db.reportCards.add(payload);
        }
      }

      await load();
      alert("Report remarks saved successfully");
    } catch (error) {
      console.error("Failed to save report remarks:", error);
      alert("Failed to save report remarks");
    } finally {
      setSaving(false);
    }
  };

  const saveSingle = async () => {
    if (!selectedStudentRow) return alert("Select a student first");
    await saveRows([selectedStudentRow]);
  };

  const saveShown = async () => {
    await saveRows(filteredStudentRows);
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
    boxSizing: "border-box",
  };

  const textarea: React.CSSProperties = {
    ...input,
    minHeight: 96,
    resize: "vertical",
    lineHeight: 1.45,
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

  const tabButton = (active: boolean): React.CSSProperties => ({
    padding: "11px 14px",
    borderRadius: 14,
    border: active ? `2px solid ${primary}` : "1px solid rgba(0,0,0,0.10)",
    background: active ? "rgba(47,111,237,0.10)" : "var(--surface)",
    color: active ? primary : "var(--text)",
    fontWeight: 900,
    cursor: "pointer",
  });

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

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading report remarks...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Report remarks belong to a branch. Select a school and branch first.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Report Remarks</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Adding student report card remarks in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {viewMode === "single" ? (
            <button onClick={saveSingle} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving..." : "Save Student Remark"}
            </button>
          ) : (
            <button onClick={saveShown} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving..." : "Save Shown Remarks"}
            </button>
          )}
        </div>
      </div>

      {/* MODE */}
      <div style={{ ...card, marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={tabButton(viewMode === "single")} onClick={() => setViewMode("single")}>
          Single Student
        </button>
        <button type="button" style={tabButton(viewMode === "group")} onClick={() => setViewMode("group")}>
          Group Remarks
        </button>
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
        <select
          value={academicStructureId || ""}
          onChange={e => {
            setAcademicStructureId(Number(e.target.value) || undefined);
            setAcademicPeriodId(undefined);
            setClassId(undefined);
            setStudentId(undefined);
          }}
          style={input}
        >
          <option value="">Select Academic Structure</option>
          {academicStructures.map(row => (
            <option key={row.id} value={row.id}>
              {row.name} • {row.level}
            </option>
          ))}
        </select>

        <select
          value={academicPeriodId || ""}
          onChange={e => {
            setAcademicPeriodId(Number(e.target.value) || undefined);
            setClassId(undefined);
            setStudentId(undefined);
          }}
          style={input}
        >
          <option value="">Select Academic Period</option>
          {filteredPeriods.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={classId || ""}
          onChange={e => {
            setClassId(Number(e.target.value) || undefined);
            setStudentId(undefined);
          }}
          style={input}
        >
          <option value="">Select Class</option>
          {availableClasses.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        {viewMode === "single" && (
          <select
            value={studentId || ""}
            onChange={e => setStudentId(Number(e.target.value) || undefined)}
            style={input}
          >
            <option value="">Select Student</option>
            {studentRows.map(row => (
              <option key={row.student.id} value={row.student.id}>
                {row.student.fullName} {row.student.admissionNumber ? `• ${row.student.admissionNumber}` : ""}
              </option>
            ))}
          </select>
        )}

        <select
          value={remarkFilter}
          onChange={e => setRemarkFilter(e.target.value as RemarkFilter)}
          style={input}
        >
          <option value="all">All Remarks</option>
          <option value="missing">Missing Remarks</option>
          <option value="complete">Complete Remarks</option>
          <option value="published">Published</option>
          <option value="unpublished">Unpublished</option>
        </select>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search student or admission number..."
          style={input}
        />
      </div>

      {/* SUMMARY */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Students</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Complete</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.complete}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Missing</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.missing}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Published</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.published}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Completion</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.completion}%</div>
        </div>
      </div>

      {/* BULK */}
      {viewMode === "group" && (
        <div style={{ ...card, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Group Remark Tools</h3>
              <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13 }}>
                Apply remarks to all students currently shown by the filters.
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
              <input
                type="checkbox"
                checked={bulkOverwrite}
                onChange={e => setBulkOverwrite(e.target.checked)}
              />
              Overwrite existing remarks
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginTop: 14 }}>
            <textarea
              value={bulkClassRemark}
              onChange={e => setBulkClassRemark(e.target.value)}
              placeholder="Class teacher remark to apply..."
              style={textarea}
            />
            <textarea
              value={bulkHeadRemark}
              onChange={e => setBulkHeadRemark(e.target.value)}
              placeholder="Head teacher / principal remark to apply..."
              style={textarea}
            />
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={ghostButton} onClick={applyBulkRemarks}>
              Apply to Shown Students
            </button>
            <button type="button" style={ghostButton} onClick={() => togglePublishShown(true)}>
              Mark Shown as Published
            </button>
            <button type="button" style={ghostButton} onClick={() => togglePublishShown(false)}>
              Mark Shown as Unpublished
            </button>
          </div>
        </div>
      )}

      {/* SINGLE STUDENT EDITOR */}
      {viewMode === "single" && selectedStudentRow && (
        <div style={{ ...card, marginTop: 18 }}>
          <StudentHeader row={selectedStudentRow} primary={primary} badge={badge} className={classMap.get(classId)?.name} />

          <RemarkEditor
            row={selectedStudentRow}
            draft={drafts[selectedStudentRow.student.id || 0] || selectedStudentRow.draft}
            updateDraft={updateDraft}
            textarea={textarea}
            badge={badge}
          />
        </div>
      )}

      {/* GROUP LIST */}
      {viewMode === "group" && (
        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          {filteredStudentRows.map(row => (
            <div key={row.student.id} style={card}>
              <StudentHeader row={row} primary={primary} badge={badge} className={classMap.get(classId)?.name} />
              <div style={{ marginTop: 14 }}>
                <RemarkEditor
                  row={row}
                  draft={drafts[row.student.id || 0] || row.draft}
                  updateDraft={updateDraft}
                  textarea={textarea}
                  badge={badge}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {!studentRows.length && (
        <div style={{ ...card, textAlign: "center", padding: 30, marginTop: 18 }}>
          Select academic structure, period, and class to load students for report remarks.
        </div>
      )}

      {studentRows.length > 0 && !filteredStudentRows.length && viewMode === "group" && (
        <div style={{ ...card, textAlign: "center", padding: 30, marginTop: 18 }}>
          No students match the current remark filters.
        </div>
      )}
    </div>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function StudentHeader({
  row,
  primary,
  badge,
  className,
}: {
  row: StudentRemarkRow;
  primary: string;
  className?: string;
  badge: (tone: "green" | "red" | "blue" | "gray" | "orange" | "purple") => React.CSSProperties;
}) {
  const draft = row.draft;
  const complete = !!draft.classTeacherRemark.trim() && !!draft.headTeacherRemark.trim();

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 16,
            background: row.student.photo
              ? `url(${row.student.photo}) center/cover`
              : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 950,
            flex: "0 0 48px",
          }}
        >
          {!row.student.photo && row.student.fullName.slice(0, 1).toUpperCase()}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{row.student.fullName}</div>
          <div style={{ marginTop: 5, display: "flex", gap: 7, flexWrap: "wrap" }}>
            <span style={badge("gray")}>{row.student.admissionNumber || "No admission no."}</span>
            {className && <span style={badge("blue")}>{className}</span>}
            <span style={badge(complete ? "green" : "orange")}>{complete ? "Complete" : "Needs remarks"}</span>
            <span style={badge(draft.published ? "green" : "gray")}>{draft.published ? "Published" : "Unpublished"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RemarkEditor({
  row,
  draft,
  updateDraft,
  textarea,
  badge,
}: {
  row: StudentRemarkRow;
  draft: RemarkDraft;
  updateDraft: (studentIdValue: number, patch: Partial<RemarkDraft>) => void;
  textarea: React.CSSProperties;
  badge: (tone: "green" | "red" | "blue" | "gray" | "orange" | "purple") => React.CSSProperties;
}) {
  const sid = row.student.id || 0;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
        <div>
          <div style={{ marginBottom: 7, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <strong>Class Teacher Remark</strong>
            <span style={badge("gray")}>{countWords(draft.classTeacherRemark)} word(s)</span>
          </div>
          <textarea
            value={draft.classTeacherRemark || ""}
            onChange={e => updateDraft(sid, { classTeacherRemark: e.target.value })}
            placeholder="Enter class teacher remark..."
            style={textarea}
          />
        </div>

        <div>
          <div style={{ marginBottom: 7, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <strong>Head Teacher / Principal Remark</strong>
            <span style={badge("gray")}>{countWords(draft.headTeacherRemark)} word(s)</span>
          </div>
          <textarea
            value={draft.headTeacherRemark || ""}
            onChange={e => updateDraft(sid, { headTeacherRemark: e.target.value })}
            placeholder="Enter head teacher / principal remark..."
            style={textarea}
          />
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 850 }}>
        <input
          type="checkbox"
          checked={!!draft.published}
          onChange={e => updateDraft(sid, { published: e.target.checked })}
        />
        Publish this report card remark
      </label>
    </div>
  );
}
