"use client";

/**
 * reportRemarks.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE STUDENT REPORT CARD REMARKS CENTER
 * ---------------------------------------------------------
 *
 * Purpose:
 * Active Account -> Active School -> Active Branch -> Academic Structure
 * -> Academic Period -> Class -> Student Report Remarks
 *
 * This page does NOT replace reports/Report.tsx.
 * reports/Report.tsx remains the preview/print/export engine.
 *
 * This page only manages remarks stored in the existing ReportCard table:
 * - classTeacherRemark
 * - headTeacherRemark
 * - published
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Mobile-first single/group editors.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

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

// ======================================================
// TYPES
// ======================================================

type ViewMode = "single" | "group";
type RemarkFilter = "all" | "missing" | "complete" | "published" | "unpublished";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

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

const reportCardKey = (
  studentIdValue: number,
  classIdValue: number,
  structureIdValue: number,
  periodIdValue: number
) => `${studentIdValue}:${classIdValue}:${structureIdValue}:${periodIdValue}`;

// ======================================================
// COMPONENT
// ======================================================

export default function ReportRemarks() {
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
    setStudents([]);
    setClasses([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setEnrollments([]);
    setReportCards([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

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
        studentRows
          .filter((row) => sameTenant(row) && row.status !== "withdrawn")
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );

      setClasses(
        classRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setAcademicStructures(
        structureRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setAcademicPeriods(
        periodRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );

      setEnrollments(enrollmentRows.filter(sameTenant));
      setReportCards(reportRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load report remarks:", error);
      clearData();
      alert("Failed to load report remarks");
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

  const studentMap = useMemo(() => new Map(students.map((row) => [row.id, row])), [students]);
  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);

  const filteredPeriods = useMemo(() => {
    if (!academicStructureId) return academicPeriods;
    return academicPeriods.filter((row) => row.academicStructureId === academicStructureId);
  }, [academicPeriods, academicStructureId]);

  const availableClassIds = useMemo(() => {
    const ids = new Set<number>();

    enrollments.forEach((row) => {
      if (row.status !== "active") return;
      if (academicStructureId && row.academicStructureId !== academicStructureId) return;
      if (academicPeriodId && row.academicPeriodId !== academicPeriodId) return;
      ids.add(row.classId);
    });

    reportCards.forEach((row) => {
      if (academicStructureId && row.academicStructureId !== academicStructureId) return;
      if (academicPeriodId && row.academicPeriodId !== academicPeriodId) return;
      ids.add(row.classId);
    });

    return ids;
  }, [enrollments, reportCards, academicStructureId, academicPeriodId]);

  const availableClasses = useMemo(() => {
    if (!academicStructureId && !academicPeriodId) return classes;
    return classes.filter((row) => row.id && availableClassIds.has(row.id));
  }, [classes, availableClassIds, academicStructureId, academicPeriodId]);

  const reportCardMap = useMemo(() => {
    const map = new Map<string, ReportCard>();

    reportCards.forEach((row) => {
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
      .filter((row) => {
        return (
          row.status === "active" &&
          row.academicStructureId === academicStructureId &&
          row.academicPeriodId === academicPeriodId &&
          row.classId === classId &&
          !row.isDeleted
        );
      })
      .map((enrollment) => {
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

        return { student, enrollment, reportCard, draft };
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
      .filter((row) => {
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
    return studentRows.find((row) => row.student.id === studentId);
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

    studentRows.forEach((row) => {
      if (!row.student.id) return;

      next[row.student.id] = {
        reportCardId: row.reportCard?.id,
        classTeacherRemark: row.reportCard?.classTeacherRemark || "",
        headTeacherRemark: row.reportCard?.headTeacherRemark || "",
        published: !!row.reportCard?.published,
      };
    });

    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicStructureId, academicPeriodId, classId, reportCards.length]);

  // ======================================================
  // SUMMARY
  // ======================================================

  const summary = useMemo(() => {
    const total = studentRows.length;
    const classRemarked = studentRows.filter((row) => !!row.draft.classTeacherRemark.trim()).length;
    const headRemarked = studentRows.filter((row) => !!row.draft.headTeacherRemark.trim()).length;
    const complete = studentRows.filter(
      (row) => !!row.draft.classTeacherRemark.trim() && !!row.draft.headTeacherRemark.trim()
    ).length;
    const published = studentRows.filter((row) => row.draft.published).length;
    const missing = Math.max(0, total - complete);
    const completion = total ? Math.round((complete / total) * 100) : 0;

    return { total, classRemarked, headRemarked, complete, published, missing, completion };
  }, [studentRows]);

  // ======================================================
  // DRAFT ACTIONS
  // ======================================================

  const updateDraft = (studentIdValue: number, patch: Partial<RemarkDraft>) => {
    setDrafts((prev) => ({
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

    filteredStudentRows.forEach((row) => {
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

    filteredStudentRows.forEach((row) => {
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
    if (!authenticated || !accountId) return alert("Sign in first");
    if (!schoolId) return alert("Select school first");
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

        const existing =
          row.reportCard ||
          reportCardMap.get(reportCardKey(sid, classId, academicStructureId, academicPeriodId));

        if (existing?.id) {
          await db.reportCards.update(existing.id, {
            accountId,
            schoolId: Number(schoolId),
            branchId: Number(branchId),
            classTeacherRemark: draft.classTeacherRemark.trim() || undefined,
            headTeacherRemark: draft.headTeacherRemark.trim() || undefined,
            published: draft.published,
            updatedAt: todayTime(),
            synced: SyncStatus.PENDING,
          } as Partial<ReportCard>);
        } else {
          const payload = prepareSyncData({
            accountId,
            schoolId: Number(schoolId),
            branchId: Number(branchId),
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
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="rr-page" style={{ "--rr-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="rr-state-card">
          <div className="rr-spinner" />
          <h2>Opening report remarks...</h2>
          <p>Checking account, branch, students, enrollments, and report cards.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="rr-page" style={{ "--rr-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="rr-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing report remarks.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="rr-page" style={{ "--rr-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="rr-state-card">
          <h2>Select a branch first</h2>
          <p>Report remarks belong to one active school branch.</p>
          <button type="button" className="rr-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="rr-page" style={{ "--rr-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="rr-hero">
        <div className="rr-hero-left">
          <div className="rr-hero-icon">💬</div>
          <div className="rr-title-wrap">
            <p>Report Publishing</p>
            <h2>Report Remarks</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={viewMode === "single" ? saveSingle : saveShown}
          disabled={saving}
          className="rr-primary-btn"
        >
          {saving ? "Saving..." : viewMode === "single" ? "Save Student" : "Save Shown"}
        </button>
      </section>

      <section className="rr-mode-card">
        <button type="button" className={viewMode === "single" ? "active" : ""} onClick={() => setViewMode("single")}>
          Single Student
        </button>
        <button type="button" className={viewMode === "group" ? "active" : ""} onClick={() => setViewMode("group")}>
          Group Remarks
        </button>
      </section>

      <section className="rr-filter-card">
        <select
          value={academicStructureId || ""}
          onChange={(event) => {
            setAcademicStructureId(Number(event.target.value) || undefined);
            setAcademicPeriodId(undefined);
            setClassId(undefined);
            setStudentId(undefined);
          }}
        >
          <option value="">Select Academic Structure</option>
          {academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.level}</option>)}
        </select>

        <select
          value={academicPeriodId || ""}
          onChange={(event) => {
            setAcademicPeriodId(Number(event.target.value) || undefined);
            setClassId(undefined);
            setStudentId(undefined);
          }}
        >
          <option value="">Select Academic Period</option>
          {filteredPeriods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select
          value={classId || ""}
          onChange={(event) => {
            setClassId(Number(event.target.value) || undefined);
            setStudentId(undefined);
          }}
        >
          <option value="">Select Class</option>
          {availableClasses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        {viewMode === "single" && (
          <select value={studentId || ""} onChange={(event) => setStudentId(Number(event.target.value) || undefined)}>
            <option value="">Select Student</option>
            {studentRows.map((row) => (
              <option key={row.student.id} value={row.student.id}>
                {row.student.fullName} {row.student.admissionNumber ? `· ${row.student.admissionNumber}` : ""}
              </option>
            ))}
          </select>
        )}

        <select value={remarkFilter} onChange={(event) => setRemarkFilter(event.target.value as RemarkFilter)}>
          <option value="all">All Remarks</option>
          <option value="missing">Missing Remarks</option>
          <option value="complete">Complete Remarks</option>
          <option value="published">Published</option>
          <option value="unpublished">Unpublished</option>
        </select>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search student or admission number..."
        />
      </section>

      <section className="rr-summary-grid" aria-label="Report remarks summary">
        <SummaryCard label="Students" value={summary.total} icon="🎓" />
        <SummaryCard label="Complete" value={summary.complete} icon="✅" />
        <SummaryCard label="Missing" value={summary.missing} icon="⚠️" />
        <SummaryCard label="Published" value={summary.published} icon="📢" />
        <SummaryCard label="Completion" value={`${summary.completion}%`} icon="📊" />
      </section>

      {viewMode === "group" && (
        <section className="rr-bulk-card">
          <div className="rr-section-head">
            <div>
              <h3>Group Remark Tools</h3>
              <p>Apply remarks to all students currently shown by the filters.</p>
            </div>
            <label className="rr-check-inline">
              <input type="checkbox" checked={bulkOverwrite} onChange={(event) => setBulkOverwrite(event.target.checked)} />
              <span>Overwrite existing remarks</span>
            </label>
          </div>

          <div className="rr-bulk-grid">
            <textarea
              value={bulkClassRemark}
              onChange={(event) => setBulkClassRemark(event.target.value)}
              placeholder="Class teacher remark to apply..."
            />
            <textarea
              value={bulkHeadRemark}
              onChange={(event) => setBulkHeadRemark(event.target.value)}
              placeholder="Head teacher / principal remark to apply..."
            />
          </div>

          <div className="rr-action-bar">
            <button type="button" onClick={applyBulkRemarks}>Apply to Shown</button>
            <button type="button" onClick={() => togglePublishShown(true)}>Publish Shown</button>
            <button type="button" onClick={() => togglePublishShown(false)}>Unpublish Shown</button>
          </div>
        </section>
      )}

      {viewMode === "single" && selectedStudentRow && (
        <section className="rr-list">
          <StudentRemarkCard
            row={selectedStudentRow}
            primary={primary}
            className={classMap.get(classId)?.name}
            draft={drafts[selectedStudentRow.student.id || 0] || selectedStudentRow.draft}
            updateDraft={updateDraft}
          />
        </section>
      )}

      {viewMode === "group" && (
        <section className="rr-list">
          {filteredStudentRows.map((row) => (
            <StudentRemarkCard
              key={row.student.id}
              row={row}
              primary={primary}
              className={classMap.get(classId)?.name}
              draft={drafts[row.student.id || 0] || row.draft}
              updateDraft={updateDraft}
            />
          ))}
        </section>
      )}

      {!studentRows.length && (
        <EmptyCard text="Select academic structure, period, and class to load students for report remarks." />
      )}

      {studentRows.length > 0 && !filteredStudentRows.length && viewMode === "group" && (
        <EmptyCard text="No students match the current remark filters." />
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="rr-summary-card">
      <div className="rr-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function StudentRemarkCard({
  row,
  primary,
  className,
  draft,
  updateDraft,
}: {
  row: StudentRemarkRow;
  primary: string;
  className?: string;
  draft: RemarkDraft;
  updateDraft: (studentIdValue: number, patch: Partial<RemarkDraft>) => void;
}) {
  const sid = row.student.id || 0;
  const complete = !!draft.classTeacherRemark.trim() && !!draft.headTeacherRemark.trim();

  return (
    <article className="rr-student-card">
      <div className="rr-student-head">
        <div
          className="rr-avatar"
          style={{
            background: row.student.photo
              ? `url(${row.student.photo}) center/cover`
              : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
          }}
        >
          {!row.student.photo && row.student.fullName.slice(0, 1).toUpperCase()}
        </div>

        <div className="rr-student-title">
          <h3>{row.student.fullName}</h3>
          <p>{row.student.admissionNumber || "No admission no."}{className ? ` · ${className}` : ""}</p>
          <div className="rr-chip-row">
            <Chip tone={complete ? "green" : "orange"}>{complete ? "Complete" : "Needs remarks"}</Chip>
            <Chip tone={draft.published ? "green" : "gray"}>{draft.published ? "Published" : "Unpublished"}</Chip>
            {row.reportCard?.id ? <Chip tone="blue">Report card exists</Chip> : <Chip tone="gray">New remark card</Chip>}
          </div>
        </div>
      </div>

      <div className="rr-editor-grid">
        <label className="rr-editor-field">
          <span>
            <strong>Class Teacher Remark</strong>
            <Chip tone="gray">{countWords(draft.classTeacherRemark)} word(s)</Chip>
          </span>
          <textarea
            value={draft.classTeacherRemark || ""}
            onChange={(event) => updateDraft(sid, { classTeacherRemark: event.target.value })}
            placeholder="Enter class teacher remark..."
          />
        </label>

        <label className="rr-editor-field">
          <span>
            <strong>Head Teacher / Principal Remark</strong>
            <Chip tone="gray">{countWords(draft.headTeacherRemark)} word(s)</Chip>
          </span>
          <textarea
            value={draft.headTeacherRemark || ""}
            onChange={(event) => updateDraft(sid, { headTeacherRemark: event.target.value })}
            placeholder="Enter head teacher / principal remark..."
          />
        </label>
      </div>

      <label className="rr-check-inline publish">
        <input
          type="checkbox"
          checked={!!draft.published}
          onChange={(event) => updateDraft(sid, { published: event.target.checked })}
        />
        <span>Publish this report card remark</span>
      </label>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`rr-chip ${tone}`}>{children}</span>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="rr-empty-card">
      <div className="rr-empty-icon">💬</div>
      <h3>No remarks loaded</h3>
      <p>{text}</p>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes rrSpin { to { transform: rotate(360deg); } }

.rr-page {
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
.rr-page *, .rr-page *::before, .rr-page *::after { box-sizing: border-box; }
.rr-page button, .rr-page input, .rr-page select, .rr-page textarea { font: inherit; max-width: 100%; }
.rr-page input, .rr-page select, .rr-page textarea {
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
.rr-page textarea { min-height: 104px; padding-top: 10px; resize: vertical; line-height: 1.5; }

.rr-state-card {
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
.rr-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.rr-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.rr-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--rr-primary) 18%, transparent); border-top-color: var(--rr-primary); animation: rrSpin .8s linear infinite; }

.rr-primary-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--rr-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.rr-primary-btn:disabled { opacity: .55; cursor: not-allowed; }

.rr-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--rr-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.rr-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.rr-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--rr-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--rr-primary) 28%, transparent); font-size: 22px; }
.rr-title-wrap { min-width: 0; }
.rr-title-wrap p, .rr-title-wrap h2, .rr-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rr-title-wrap p { margin: 0 0 2px; color: var(--rr-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.rr-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.rr-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.rr-mode-card,
.rr-filter-card,
.rr-bulk-card,
.rr-student-card,
.rr-empty-card {
  min-width: 0;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}
.rr-mode-card { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; padding: 8px; }
.rr-mode-card button {
  min-height: 43px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, .24);
  background: #fff;
  color: var(--text, #0f172a);
  font-weight: 950;
  cursor: pointer;
}
.rr-mode-card button.active { border-color: var(--rr-primary); background: color-mix(in srgb, var(--rr-primary) 10%, #fff); color: var(--rr-primary); }
.rr-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; padding: 10px; }

.rr-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.rr-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148,163,184,.2); box-shadow: 0 12px 28px rgba(15,23,42,.04); overflow: hidden; }
.rr-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--rr-primary) 12%, #fff); }
.rr-summary-card div:last-child { min-width: 0; }
.rr-summary-card strong, .rr-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rr-summary-card strong { font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.rr-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.rr-bulk-card { margin-top: 10px; padding: 13px; }
.rr-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.rr-section-head h3 { margin: 0; font-size: 18px; font-weight: 1000; letter-spacing: -.04em; }
.rr-section-head p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.rr-bulk-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 12px; }
.rr-action-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.rr-action-bar button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  padding: 0 13px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.rr-check-inline { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 900; color: var(--text, #0f172a); }
.rr-check-inline input { width: 17px; min-height: 17px; }

.rr-list { display: grid; gap: 10px; margin-top: 10px; }
.rr-student-card { padding: 13px; background: linear-gradient(135deg, #fff, #f8fafc); }
.rr-student-head { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.rr-avatar { width: 56px; height: 56px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15,23,42,.12); }
.rr-student-title { min-width: 0; flex: 1; }
.rr-student-title h3, .rr-student-title p { display: block; overflow: hidden; text-overflow: ellipsis; }
.rr-student-title h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.rr-student-title p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.rr-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.rr-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rr-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.rr-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.rr-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.rr-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.rr-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.rr-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.rr-editor-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; margin-top: 12px; }
.rr-editor-field { min-width: 0; display: grid; gap: 7px; }
.rr-editor-field > span { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.rr-editor-field strong { font-size: 13px; font-weight: 1000; }
.rr-check-inline.publish { margin-top: 12px; padding: 10px; border-radius: 16px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .13); }

.rr-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; padding: 22px; margin-top: 10px; text-align: center; border-style: dashed; }
.rr-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--rr-primary) 12%, #fff); font-size: 28px; }
.rr-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.rr-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

@media (min-width: 680px) {
  .rr-page { padding: 12px; }
  .rr-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .rr-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rr-bulk-grid, .rr-editor-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .rr-page { padding: 16px; }
  .rr-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .rr-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .rr-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .rr-page { padding: 6px; }
  .rr-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .rr-primary-btn { width: 100%; }
  .rr-mode-card, .rr-filter-card, .rr-bulk-card, .rr-student-card, .rr-empty-card { border-radius: 20px; }
  .rr-summary-grid { gap: 6px; }
  .rr-summary-card { padding: 10px; border-radius: 19px; }
  .rr-summary-card strong { font-size: 16px; }
  .rr-action-bar { display: grid; grid-template-columns: 1fr; }
  .rr-action-bar button { width: 100%; }
  .rr-avatar { width: 52px; height: 52px; flex-basis: 52px; }
}
`;
