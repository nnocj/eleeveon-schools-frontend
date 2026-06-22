"use client";

/**
 * app/branch-admin/modules/ReportRemarks.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH ADMIN REPORT REMARKS
 * ---------------------------------------------------------
 *
 * Compact golden-standard report remarks center.
 *
 * Purpose:
 * - Branch admins manage class-teacher remarks, head-teacher remarks and published status.
 * - Branch admins can access all active classes in the selected branch.
 *
 * Source rules:
 * - Workspace-session aligned: eleeveon_open_workspace first.
 * - Falls back to ActiveMembershipProvider, ActiveBranchContext, settings and storage.
 * - Uses listActiveLocal/createLocal/updateLocal from syncUtils.
 * - Does not write directly with db.add/db.update.
 *
 * UI:
 * - Matches compact golden standard from StudentReports.tsx.
 * - Search + save + filter + more top strip.
 * - Filter chips only when active.
 * - Bottom sheet filters and More menu.
 * - Compact student rows with inline remark editor.
 */

import React, { useEffect, useMemo, useState } from "react";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import type {
  AcademicPeriod,
  AcademicStructure,
  Class,

  ReportCard,
  Student,
  StudentEnrollment,
} from "../../lib/db";

import {
  createLocal,
  updateLocal,
  listActiveLocal,
} from "../../lib/sync/syncUtils";

type ViewMode = "single" | "group" | "analytics";
type RemarkFilter = "all" | "missing" | "complete" | "published" | "unpublished";

type TenantRow = {
  accountId?: string;
  schoolId?: number | null;
  branchId?: number | null;
  active?: boolean;
  isDeleted?: boolean;
};

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  teacherLocalId?: number | string | null;
  openedAt?: number;
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

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeJsonRead<T>(key: string): T | null {
  const raw = safeStorageRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession() {
  return safeJsonRead<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function idOf(value: unknown) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function sameId(a: unknown, b: unknown) {
  const left = idOf(a);
  const right = idOf(b);
  return left > 0 && right > 0 && left === right;
}

function accountMatches(rowAccountId: unknown, selectedAccountId?: string | null) {
  if (!selectedAccountId) return true;
  if (!rowAccountId) return true;
  return String(rowAccountId) === String(selectedAccountId);
}

function rowIsUsable(row: TenantRow) {
  return !!row && row.isDeleted !== true && row.active !== false;
}

function defaultDraft(): RemarkDraft {
  return {
    classTeacherRemark: "",
    headTeacherRemark: "",
    published: false,
  };
}

function countWords(text: string) {
  return cleanText(text) ? cleanText(text).split(/\s+/).length : 0;
}

function reportCardKey(
  studentId: number,
  classId: number,
  academicStructureId: number,
  academicPeriodId: number
) {
  return `${studentId}:${classId}:${academicStructureId}:${academicPeriodId}`;
}

async function activeRows<T>(tableName: string): Promise<T[]> {
  return ((await listActiveLocal(tableName as any)) || []) as T[];
}

function labelOf<T extends { id?: number; name?: string; fullName?: string }>(rows: T[], id?: number) {
  if (!id) return "Not selected";
  const row = rows.find((item) => item.id === id);
  return row?.name || row?.fullName || "Not found";
}

export default function ReportRemarks() {
  const { accountId, authenticated, loading: accountLoading } = useAccount() as any;
  const { settings, loading: settingsLoading } = useSettings() as any;
  const { activeMembership } = useActiveMembership() as any;

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch() as any;

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const selectedAccountId = useMemo(
    () =>
      cleanText(accountId) ||
      cleanText(openWorkspace?.membership?.accountId) ||
      cleanText(activeMembership?.accountId) ||
      cleanText(settings?.accountId),
    [accountId, activeMembership?.accountId, openWorkspace?.membership?.accountId, settings?.accountId]
  );

  const schoolId = useMemo(
    () =>
      idOf(openWorkspace?.schoolId) ||
      idOf(openWorkspace?.membership?.schoolId) ||
      idOf(openWorkspace?.membership?.school?.id) ||
      idOf(activeMembership?.schoolId) ||
      idOf(activeMembership?.school?.id) ||
      idOf(activeSchoolId) ||
      idOf(activeSchool?.id) ||
      idOf(settings?.schoolId) ||
      idOf(safeStorageRead("activeSchoolId")),
    [
      activeMembership?.school?.id,
      activeMembership?.schoolId,
      activeSchool?.id,
      activeSchoolId,
      openWorkspace?.membership?.school?.id,
      openWorkspace?.membership?.schoolId,
      openWorkspace?.schoolId,
      settings?.schoolId,
    ]
  );

  const branchId = useMemo(
    () =>
      idOf(openWorkspace?.branchId) ||
      idOf(openWorkspace?.membership?.branchId) ||
      idOf(openWorkspace?.membership?.schoolBranchId) ||
      idOf(openWorkspace?.membership?.branch?.id) ||
      idOf(activeMembership?.branchId) ||
      idOf(activeMembership?.schoolBranchId) ||
      idOf(activeMembership?.branch?.id) ||
      idOf(activeBranchId) ||
      idOf(activeBranch?.id) ||
      idOf(settings?.branchId) ||
      idOf(safeStorageRead("activeBranchId")),
    [
      activeBranch?.id,
      activeBranchId,
      activeMembership?.branch?.id,
      activeMembership?.branchId,
      activeMembership?.schoolBranchId,
      openWorkspace?.branchId,
      openWorkspace?.membership?.branch?.id,
      openWorkspace?.membership?.branchId,
      openWorkspace?.membership?.schoolBranchId,
      settings?.branchId,
    ]
  );


  const primary = cleanText(settings?.primaryColor) || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);

  const [academicStructureId, setAcademicStructureId] = useState<number | undefined>(
    idOf(settings?.currentAcademicStructureId) || undefined
  );
  const [academicPeriodId, setAcademicPeriodId] = useState<number | undefined>(
    idOf(settings?.currentAcademicPeriodId) || undefined
  );
  const [classId, setClassId] = useState<number | undefined>();
  const [studentId, setStudentId] = useState<number | undefined>();

  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [remarkFilter, setRemarkFilter] = useState<RemarkFilter>("all");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const [drafts, setDrafts] = useState<DraftMap>({});
  const [bulkClassRemark, setBulkClassRemark] = useState("");
  const [bulkHeadRemark, setBulkHeadRemark] = useState("");
  const [bulkOverwrite, setBulkOverwrite] = useState(false);

  const sameTenant = (row: TenantRow) =>
    accountMatches(row.accountId, selectedAccountId) &&
    sameId(row.schoolId, schoolId) &&
    sameId(row.branchId, branchId) &&
    rowIsUsable(row);

  const clearData = () => {
    setStudents([]);
    setClasses([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setEnrollments([]);
    setReportCards([]);
  };

  const load = async () => {
    if (!authenticated || !selectedAccountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const loadResult = await Promise.all([
        activeRows<Student>("students"),
        activeRows<Class>("classes"),
        activeRows<AcademicStructure>("academicStructures"),
        activeRows<AcademicPeriod>("academicPeriods"),
        activeRows<StudentEnrollment>("studentEnrollments"),
        activeRows<ReportCard>("reportCards"),

      ]);

      const studentRows = loadResult[0] as Student[];
      const classRows = loadResult[1] as Class[];
      const structureRows = loadResult[2] as AcademicStructure[];
      const periodRows = loadResult[3] as AcademicPeriod[];
      const enrollmentRows = loadResult[4] as StudentEnrollment[];
      const reportRows = loadResult[5] as ReportCard[];

      setStudents(
        studentRows
          .filter((row: any) => sameTenant(row) && row.status !== "withdrawn")
          .sort((a, b) => cleanText(a.fullName).localeCompare(cleanText(b.fullName)))
      );

      setClasses(
        classRows
          .filter((row: any) => sameTenant(row))
          .sort((a, b) => cleanText(a.name).localeCompare(cleanText(b.name)))
      );


      setAcademicStructures(
        structureRows
          .filter((row: any) => sameTenant(row))
          .sort((a, b) => cleanText(a.name).localeCompare(cleanText(b.name)))
      );

      setAcademicPeriods(
        periodRows
          .filter((row: any) => sameTenant(row))
          .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0))
      );

      setEnrollments(enrollmentRows.filter((row: any) => sameTenant(row)));
      setReportCards(reportRows.filter((row: any) => sameTenant(row)));
    } catch (error) {
      console.error("Failed to load report remarks:", error);
      clearData();
      alert("Failed to load report remarks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, selectedAccountId, schoolId, branchId]);

  const studentMap = useMemo(() => new Map(students.map((row) => [row.id, row])), [students]);
  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);

  const teacherClassIds = useMemo(() => undefined as Set<number> | undefined, []);

  const filteredPeriods = useMemo(() => {
    if (!academicStructureId) return academicPeriods;
    return academicPeriods.filter((row) => sameId(row.academicStructureId, academicStructureId));
  }, [academicPeriods, academicStructureId]);

  const availableClassIds = useMemo(() => {
    const ids = new Set<number>();

    enrollments.forEach((row) => {
      if (row.status === "withdrawn") return;
      if (academicStructureId && !sameId(row.academicStructureId, academicStructureId)) return;
      if (academicPeriodId && !sameId(row.academicPeriodId, academicPeriodId)) return;
      if (row.classId) ids.add(row.classId);
    });

    reportCards.forEach((row) => {
      if (academicStructureId && !sameId(row.academicStructureId, academicStructureId)) return;
      if (academicPeriodId && !sameId(row.academicPeriodId, academicPeriodId)) return;
      if (row.classId) ids.add(row.classId);
    });

    return ids;
  }, [academicPeriodId, academicStructureId, enrollments, reportCards, teacherClassIds]);

  const availableClasses = useMemo(() => {
    if (!academicStructureId && !academicPeriodId) {
      return teacherClassIds ? classes.filter((row) => row.id && teacherClassIds.has(row.id)) : classes;
    }

    return classes.filter((row) => row.id && availableClassIds.has(row.id));
  }, [academicPeriodId, academicStructureId, availableClassIds, classes, teacherClassIds]);

  const reportCardMap = useMemo(() => {
    const map = new Map<string, ReportCard>();

    reportCards.forEach((row) => {
      if (!row.studentId || !row.classId || !row.academicStructureId || !row.academicPeriodId) return;
      map.set(reportCardKey(row.studentId, row.classId, row.academicStructureId, row.academicPeriodId), row);
    });

    return map;
  }, [reportCards]);

  const studentRows = useMemo<StudentRemarkRow[]>(() => {
    if (!academicStructureId || !academicPeriodId || !classId) return [];

    return enrollments
      .filter((row) => {
        return (
          row.status !== "withdrawn" &&
          sameId(row.academicStructureId, academicStructureId) &&
          sameId(row.academicPeriodId, academicPeriodId) &&
          sameId(row.classId, classId)
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
        const draft =
          drafts[student.id] || {
            reportCardId: reportCard?.id,
            classTeacherRemark: reportCard?.classTeacherRemark || "",
            headTeacherRemark: reportCard?.headTeacherRemark || "",
            published: !!reportCard?.published,
          };

        return { student, enrollment, reportCard, draft };
      })
      .filter(Boolean) as StudentRemarkRow[];
  }, [academicPeriodId, academicStructureId, classId, drafts, enrollments, reportCardMap, studentMap, teacherClassIds]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return studentRows
      .filter((row) => {
        const draft = row.draft;
        const complete = !!row.draft.classTeacherRemark.trim() && !!row.draft.headTeacherRemark.trim();

        if (viewMode === "single" && studentId && row.student.id !== studentId) return false;
        if (remarkFilter === "missing" && complete) return false;
        if (remarkFilter === "complete" && !complete) return false;
        if (remarkFilter === "published" && !draft.published) return false;
        if (remarkFilter === "unpublished" && draft.published) return false;

        if (!query) return true;

        return `${row.student.fullName || ""} ${row.student.admissionNumber || ""}`.toLowerCase().includes(query);
      })
      .sort((a, b) => cleanText(a.student.fullName).localeCompare(cleanText(b.student.fullName)));
  }, [remarkFilter, search, studentId, studentRows, viewMode]);

  const selectedRow = useMemo(() => {
    if (!studentId) return visibleRows[0];
    return studentRows.find((row) => row.student.id === studentId);
  }, [studentId, studentRows, visibleRows]);

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

  const summary = useMemo(() => {
    const total = studentRows.length;
    const classRemarked = studentRows.filter((row) => !!row.draft.classTeacherRemark.trim()).length;
    const headRemarked = studentRows.filter((row) => !!row.draft.headTeacherRemark.trim()).length;
    const complete = studentRows.filter((row) => !!row.draft.classTeacherRemark.trim() && !!row.draft.headTeacherRemark.trim()).length;
    const published = studentRows.filter((row) => row.draft.published).length;
    const missing = Math.max(0, total - complete);
    const completion = total ? Math.round((complete / total) * 100) : 0;

    return { total, classRemarked, headRemarked, complete, published, missing, completion };
  }, [studentRows]);

  const activeFilterCount = useMemo(() => {
    return [
      academicStructureId,
      academicPeriodId,
      classId,
      studentId,
      remarkFilter !== "all" ? remarkFilter : undefined,
      viewMode !== "single" ? viewMode : undefined,
    ].filter(Boolean).length;
  }, [academicPeriodId, academicStructureId, classId, remarkFilter, studentId, viewMode]);

  const selectedStructureName = labelOf(academicStructures, academicStructureId);
  const selectedPeriodName = labelOf(academicPeriods, academicPeriodId);
  const selectedClassName = labelOf(classes, classId);
  const selectedStudentName = labelOf(students, studentId);
  const contextName = `${activeSchool?.name || "Selected School"} · ${activeBranch?.name || "Assigned Branch"}`;

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
    if (!visibleRows.length) return alert("No students match the current filters.");
    if (!bulkClassRemark.trim() && !bulkHeadRemark.trim()) return alert("Enter at least one remark first.");

    const next: DraftMap = { ...drafts };

    visibleRows.forEach((row) => {
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

    visibleRows.forEach((row) => {
      const sid = row.student.id || 0;
      next[sid] = {
        ...(next[sid] || row.draft || defaultDraft()),
        published,
      };
    });

    setDrafts(next);
  };

  const saveRows = async (rows: StudentRemarkRow[]) => {
    if (!authenticated || !selectedAccountId) return alert("Sign in first.");
    if (!schoolId) return alert("Select school first.");
    if (!branchId) return alert("Select branch first.");
    if (!academicStructureId) return alert("Select academic structure.");
    if (!academicPeriodId) return alert("Select academic period.");
    if (!classId) return alert("Select class.");
    if (!rows.length) return alert("No students to save.");

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
          await updateLocal("reportCards" as any, Number(existing.id), {
            accountId: selectedAccountId,
            schoolId: Number(schoolId),
            branchId: Number(branchId),
            classTeacherRemark: draft.classTeacherRemark.trim() || undefined,
            headTeacherRemark: draft.headTeacherRemark.trim() || undefined,
            published: draft.published,
          } as Partial<ReportCard>);
        } else {
          await createLocal("reportCards" as any, {
            accountId: selectedAccountId,
            schoolId: Number(schoolId),
            branchId: Number(branchId),
            studentId: sid,
            classId: Number(classId),
            academicStructureId: Number(academicStructureId),
            academicPeriodId: Number(academicPeriodId),
            total: 0,
            average: 0,
            classTeacherRemark: draft.classTeacherRemark.trim() || undefined,
            headTeacherRemark: draft.headTeacherRemark.trim() || undefined,
            published: draft.published,
          } as Partial<ReportCard>);
        }
      }

      await load();
      alert("Report remarks saved.");
    } catch (error) {
      console.error("Failed to save report remarks:", error);
      alert("Failed to save report remarks.");
    } finally {
      setSaving(false);
    }
  };

  const saveCurrent = async () => {
    if (viewMode === "single") {
      if (!selectedRow) return alert("Select a student first.");
      await saveRows([selectedRow]);
      return;
    }

    await saveRows(visibleRows);
  };

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return <State primary={primary} title="Opening report remarks..." text="Checking workspace, classes, students and report cards." />;
  }

  if (!authenticated || !selectedAccountId) {
    return <State primary={primary} title="Sign in required" text="You must sign in before managing report remarks." />;
  }

  if (!schoolId || !branchId) {
    return <State primary={primary} title="Branch workspace required" text="Report remarks belong to one active school branch." />;
  }


  return (
    <main className="ba-page report-remarks-page" style={{ "--ba-primary": primary, "--primary-color": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ba-search-card" aria-label="Report remarks search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search remarks..."
            aria-label="Search report remarks"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={saveCurrent}
          disabled={saving}
          aria-label="Save report remarks"
          title="Save"
        >
          ✓
        </button>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">
          ⋯
        </button>
      </section>

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active remark filters">
          {academicStructureId && <button type="button" onClick={() => { setAcademicStructureId(undefined); setAcademicPeriodId(undefined); setClassId(undefined); setStudentId(undefined); }}>Structure: {selectedStructureName} ×</button>}
          {academicPeriodId && <button type="button" onClick={() => { setAcademicPeriodId(undefined); setClassId(undefined); setStudentId(undefined); }}>Period: {selectedPeriodName} ×</button>}
          {classId && <button type="button" onClick={() => { setClassId(undefined); setStudentId(undefined); }}>Class: {selectedClassName} ×</button>}
          {studentId && <button type="button" onClick={() => setStudentId(undefined)}>Student: {selectedStudentName} ×</button>}
          {remarkFilter !== "all" && <button type="button" onClick={() => setRemarkFilter("all")}>Filter: {remarkFilter} ×</button>}
          {viewMode !== "single" && <button type="button" onClick={() => setViewMode("single")}>Mode: {viewMode} ×</button>}
        </section>
      )}

      <section className="ba-summary-line">
        <div>
          <strong>{viewMode === "single" ? (selectedRow ? 1 : 0) : visibleRows.length}</strong>
          <span>{viewMode === "single" ? "student selected" : "students shown"}</span>
        </div>
        <p>{contextName} · {selectedStructureName} · {selectedPeriodName}</p>
      </section>

      {viewMode === "analytics" && (
        <section className="ba-filter-chips">
          <SummaryChip label="Students" value={summary.total} />
          <SummaryChip label="Class remarks" value={summary.classRemarked} />
          <SummaryChip label="Head remarks" value={summary.headRemarked} />
          <SummaryChip label="Complete" value={summary.complete} />
          <SummaryChip label="Missing" value={summary.missing} />
          <SummaryChip label="Published" value={summary.published} />
          <SummaryChip label="Done" value={`${summary.completion}%`} />
        </section>
      )}

      {viewMode === "group" && (
        <section className="ba-remark-card">
          <div className="ba-remark-head">
            <div>
              <h3>Group tools</h3>
              <p>Apply remarks to the students currently shown.</p>
            </div>
            <label className="ba-publish-line">
              <input type="checkbox" checked={bulkOverwrite} onChange={(event) => setBulkOverwrite(event.target.checked)} />
              Overwrite
            </label>
          </div>

          <div className="ba-remark-grid two">
            <label className="ba-remark-field">
              <span><b>Class Teacher Remark</b><em>{countWords(bulkClassRemark)} words</em></span>
              <textarea value={bulkClassRemark} onChange={(event) => setBulkClassRemark(event.target.value)} placeholder="Class teacher remark..." />
            </label>

<label className="ba-remark-field">
              <span><b>Head Teacher Remark</b><em>{countWords(bulkHeadRemark)} words</em></span>
              <textarea value={bulkHeadRemark} onChange={(event) => setBulkHeadRemark(event.target.value)} placeholder="Head teacher / principal remark..." />
            </label>
          </div>

          <div className="ba-sheet-actions">
            <button type="button" onClick={applyBulkRemarks}>Apply to shown</button>
<button type="button" onClick={() => togglePublishShown(true)}>Publish shown</button>
            <button type="button" onClick={() => togglePublishShown(false)}>Unpublish shown</button>
            <button type="button" className="primary" onClick={() => saveRows(visibleRows)} disabled={saving}>
              {saving ? "Saving..." : "Save shown"}
            </button>
          </div>
        </section>
      )}

      {viewMode === "single" && selectedRow && (
        <RemarkEditor
          row={selectedRow}
          className={classMap.get(classId)?.name}
          draft={drafts[selectedRow.student.id || 0] || selectedRow.draft}
          updateDraft={updateDraft}
          canEditHeadRemark
          canPublish
        />
      )}

      {viewMode === "group" && (
        <section className="ba-list">
          {visibleRows.map((row) => (
            <button
              key={row.student.id}
              type="button"
              className={`ba-student-row ${studentId === row.student.id ? "active" : ""}`}
              onClick={() => { setStudentId(row.student.id || undefined); setViewMode("single"); }}
            >
              <span className="ba-avatar">{cleanText(row.student.fullName).slice(0, 1).toUpperCase() || "S"}</span>
              <span className="ba-student-main">
                <strong>{row.student.fullName}</strong>
                <small>{row.student.admissionNumber || "No admission no."} · {classMap.get(row.enrollment.classId)?.name || "Class"}</small>
                <em>{row.draft.classTeacherRemark ? "Class remark entered" : "Class remark missing"}</em>
              </span>
              <span className="ba-student-side">
                <Chip tone={row.draft.classTeacherRemark ? "green" : "orange"}>{row.draft.classTeacherRemark ? "Ready" : "Missing"}</Chip>
                <i>›</i>
              </span>
            </button>
          ))}
        </section>
      )}

      {!studentRows.length && viewMode !== "analytics" && <Empty text="Choose academic structure, academic period and class to load students for report remarks." />}
      {studentRows.length > 0 && !visibleRows.length && viewMode === "group" && <Empty text="No students match the current filters." />}

      {filterOpen && (
        <FilterSheet
          viewMode={viewMode}
          setViewMode={setViewMode}
          remarkFilter={remarkFilter}
          setRemarkFilter={setRemarkFilter}
          academicStructureId={academicStructureId}
          setAcademicStructureId={setAcademicStructureId}
          academicPeriodId={academicPeriodId}
          setAcademicPeriodId={setAcademicPeriodId}
          classId={classId}
          setClassId={setClassId}
          studentId={studentId}
          setStudentId={setStudentId}
          academicStructures={academicStructures}
          academicPeriods={filteredPeriods}
          classes={availableClasses}
          students={studentRows.map((row) => row.student)}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          onRefresh={async () => { setMoreOpen(false); await load(); }}
          onSingle={() => { setViewMode("single"); setMoreOpen(false); }}
          onGroup={() => { setViewMode("group"); setMoreOpen(false); }}
          onAnalytics={() => { setViewMode("analytics"); setMoreOpen(false); }}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </main>
  );
}

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ba-page" style={{ "--ba-primary": primary, "--primary-color": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function RemarkEditor({
  row,
  className,
  draft,
  updateDraft,
  canEditHeadRemark,
  canPublish,
}: {
  row: StudentRemarkRow;
  className?: string;
  draft: RemarkDraft;
  updateDraft: (studentIdValue: number, patch: Partial<RemarkDraft>) => void;
  canEditHeadRemark: boolean;
  canPublish: boolean;
}) {
  const sid = row.student.id || 0;
  const complete = !!draft.classTeacherRemark.trim() && (!canEditHeadRemark || !!draft.headTeacherRemark.trim());

  return (
    <section className="ba-remark-card">
      <div className="ba-remark-head">
        <div>
          <h3>{row.student.fullName}</h3>
          <p>{row.student.admissionNumber || "No admission no."}{className ? ` · ${className}` : ""}</p>
        </div>
        <Chip tone={complete ? "green" : "orange"}>{complete ? "Complete" : "Needs remarks"}</Chip>
      </div>

      <div className={canEditHeadRemark ? "ba-remark-grid two" : "ba-remark-grid"}>
        <label className="ba-remark-field">
          <span><b>Class Teacher Remark</b><em>{countWords(draft.classTeacherRemark)} words</em></span>
          <textarea value={draft.classTeacherRemark || ""} onChange={(event) => updateDraft(sid, { classTeacherRemark: event.target.value })} placeholder="Enter class teacher remark..." />
        </label>

        {canEditHeadRemark && (
          <label className="ba-remark-field">
            <span><b>Head Teacher Remark</b><em>{countWords(draft.headTeacherRemark)} words</em></span>
            <textarea value={draft.headTeacherRemark || ""} onChange={(event) => updateDraft(sid, { headTeacherRemark: event.target.value })} placeholder="Enter head teacher / principal remark..." />
          </label>
        )}
      </div>

      {canPublish && (
        <label className="ba-publish-line">
          <input type="checkbox" checked={!!draft.published} onChange={(event) => updateDraft(sid, { published: event.target.checked })} />
          Publish this report card
        </label>
      )}
    </section>
  );
}

function FilterSheet(props: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  remarkFilter: RemarkFilter;
  setRemarkFilter: (filter: RemarkFilter) => void;
  academicStructureId?: number;
  setAcademicStructureId: (id?: number) => void;
  academicPeriodId?: number;
  setAcademicPeriodId: (id?: number) => void;
  classId?: number;
  setClassId: (id?: number) => void;
  studentId?: number;
  setStudentId: (id?: number) => void;
  academicStructures: AcademicStructure[];
  academicPeriods: AcademicPeriod[];
  classes: Class[];
  students: Student[];
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose the report remarks scope. School and branch stay locked.</p>
          </div>
          <button type="button" onClick={props.onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="ba-form">
          <label>
            <span>View Mode</span>
            <select value={props.viewMode} onChange={(event) => props.setViewMode(event.target.value as ViewMode)}>
              <option value="single">Single student</option>
              <option value="group">Group remarks</option>
              <option value="analytics">Analytics</option>
            </select>
          </label>

          <label>
            <span>Academic Structure</span>
            <select value={props.academicStructureId || ""} onChange={(event) => { props.setAcademicStructureId(idOf(event.target.value) || undefined); props.setAcademicPeriodId(undefined); props.setClassId(undefined); props.setStudentId(undefined); }}>
              <option value="">Select structure</option>
              {props.academicStructures.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>

          <label>
            <span>Academic Period</span>
            <select value={props.academicPeriodId || ""} onChange={(event) => { props.setAcademicPeriodId(idOf(event.target.value) || undefined); props.setClassId(undefined); props.setStudentId(undefined); }}>
              <option value="">Select period</option>
              {props.academicPeriods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>

          <label>
            <span>Class</span>
            <select value={props.classId || ""} onChange={(event) => { props.setClassId(idOf(event.target.value) || undefined); props.setStudentId(undefined); }}>
              <option value="">Select class</option>
              {props.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>

          {props.viewMode === "single" && (
            <label>
              <span>Student</span>
              <select value={props.studentId || ""} onChange={(event) => props.setStudentId(idOf(event.target.value) || undefined)}>
                <option value="">Auto select</option>
                {props.students.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
              </select>
            </label>
          )}

          <label>
            <span>Remark Filter</span>
            <select value={props.remarkFilter} onChange={(event) => props.setRemarkFilter(event.target.value as RemarkFilter)}>
              <option value="all">All remarks</option>
              <option value="missing">Missing remarks</option>
              <option value="complete">Complete remarks</option>
              <option value="published">Published</option>
              <option value="unpublished">Unpublished</option>
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={() => { props.setAcademicStructureId(undefined); props.setAcademicPeriodId(undefined); props.setClassId(undefined); props.setStudentId(undefined); props.setRemarkFilter("all"); }}>Clear</button>
          <button type="button" className="primary" onClick={props.onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  onRefresh,
  onSingle,
  onGroup,
  onAnalytics,
  onClose,
}: {
  onRefresh: () => void | Promise<void>;
  onSingle: () => void;
  onGroup: () => void;
  onAnalytics: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Quick report remarks actions.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local report remark records</small></button>
          <button type="button" onClick={onSingle}><span>👤</span><b>Single student</b><small>Edit one selected student</small></button>
          <button type="button" onClick={onGroup}><span>👥</span><b>Group remarks</b><small>Apply or save remarks in batches</small></button>
          <button type="button" onClick={onAnalytics}><span>📊</span><b>Analytics</b><small>View completion and publishing status</small></button>
        </div>
      </section>
    </div>
  );
}

function SliderIcon() {
  return (
    <svg className="ba-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function SummaryChip({ label, value }: { label: string; value: string | number }) {
  return <button type="button">{label}: {value}</button>;
}

function Empty({ text }: { text: string }) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">💬</div>
      <h3>No remarks loaded</h3>
      <p>{text}</p>
    </section>
  );
}


const css = `
@keyframes spin { to { transform: rotate(360deg); } }

.ba-page {
  --ease: cubic-bezier(.2,.8,.2,1);
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(40px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 9%, transparent), transparent 30rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111827);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.ba-page *, .ba-page *::before, .ba-page *::after { box-sizing: border-box; min-width: 0; }
.ba-page button, .ba-page input, .ba-page select, .ba-page textarea { font: inherit; max-width: 100%; }
.ba-page button { -webkit-tap-highlight-color: transparent; }

.ba-page input,
.ba-page select,
.ba-page textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111827));
  outline: none;
  font-weight: 750;
}

.ba-page textarea {
  min-height: 96px;
  padding: 12px;
  resize: vertical;
  line-height: 1.55;
}

.ba-page input:focus,
.ba-page select:focus,
.ba-page textarea:focus {
  border-color: color-mix(in srgb, var(--ba-primary) 52%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ba-primary) 12%, transparent);
}

.ba-state,
.ba-search-card,
.ba-summary-line,
.ba-empty,
.ba-sheet,
.ba-remark-card,
.ba-student-row {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.ba-state {
  min-height: min(420px, calc(100dvh - 32px));
  width: min(520px, 100%);
  margin: 0 auto;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 22px;
  border-radius: 28px;
  text-align: center;
}

.ba-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent);
  border-top-color: var(--ba-primary);
  animation: spin .8s linear infinite;
}

.ba-state h2 { margin: 0; font-size: 22px; font-weight: 1000; letter-spacing: -.04em; }
.ba-state p { max-width: 34rem; margin: 0; color: var(--muted,#64748b); font-size: 13px; line-height: 1.6; }

.ba-search-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, 42px);
  gap: 8px;
  align-items: center;
  margin-top: 2px;
  padding: 8px;
  border-radius: 24px;
}

.ba-search {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 11px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent);
}

.ba-search span { color: var(--muted,#64748b); font-size: 17px; font-weight: 1000; }
.ba-search input { min-height: 42px; border: 0; padding: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: 14px; }

.ba-icon-button,
.ba-filter-button,
.ba-add-inline {
  width: 42px;
  height: 42px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 18px;
  font-weight: 1000;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(15,23,42,.045);
}

.ba-add-inline {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  font-size: 20px;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent);
}

.ba-add-inline:disabled { opacity: .65; cursor: not-allowed; }

.ba-slider-icon {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ba-filter-button {
  position: relative;
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff));
  color: var(--ba-primary);
}

.ba-filter-button.active { background: var(--ba-primary); color: #fff; border-color: var(--ba-primary); }

.ba-filter-button b {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 19px;
  height: 19px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  border: 2px solid var(--card-bg,#fff);
}

.ba-filter-chips {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding: 8px 1px 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.ba-filter-chips::-webkit-scrollbar { display: none; }
.ba-filter-chips button {
  flex: 0 0 auto;
  min-height: 31px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ba-primary) 11%, transparent);
  color: var(--ba-primary);
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  cursor: pointer;
}

.ba-summary-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 20px;
}
.ba-summary-line div { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.ba-summary-line strong { font-size: 21px; font-weight: 1000; letter-spacing: -.05em; }
.ba-summary-line span, .ba-summary-line p { color: var(--muted,#64748b); font-size: 12px; font-weight: 850; }
.ba-summary-line p { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ba-list { display: grid; gap: 7px; margin-top: 10px; }

.ba-student-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 22px;
  text-align: left;
  cursor: pointer;
  transition: transform .16s var(--ease), box-shadow .16s var(--ease), border-color .16s var(--ease);
}
.ba-student-row:hover, .ba-student-row.active {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--ba-primary) 24%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 16px 34px rgba(15,23,42,.07);
}
.ba-avatar {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  color: #fff;
  background: var(--ba-primary);
  font-size: 17px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
}
.ba-student-main, .ba-student-main strong, .ba-student-main small, .ba-student-main em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ba-student-main strong { color: var(--text,#111827); font-size: 14px; font-weight: 1000; letter-spacing: -.02em; }
.ba-student-main small { margin-top: 3px; color: var(--muted,#64748b); font-size: 12px; font-weight: 850; font-style: normal; }
.ba-student-main em { margin-top: 3px; color: color-mix(in srgb, var(--muted,#64748b) 86%, var(--text,#111827)); font-size: 11px; font-weight: 750; font-style: normal; }
.ba-student-side { display: grid; justify-items: end; gap: 6px; flex: 0 0 auto; }
.ba-student-side i { color: var(--muted,#64748b); font-style: normal; font-size: 18px; font-weight: 1000; line-height: 1; }

.ba-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}
.ba-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.ba-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.ba-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.ba-chip.gray { background: color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color: var(--muted,#64748b); }
.ba-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.ba-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.ba-remark-card {
  display: grid;
  gap: 10px;
  margin-top: 10px;
  padding: 12px;
  border-radius: 24px;
}
.ba-remark-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.ba-remark-head h3 { margin: 0; color: var(--text,#111827); font-size: 16px; font-weight: 1000; letter-spacing: -.04em; }
.ba-remark-head p { margin: 3px 0 0; color: var(--muted,#64748b); font-size: 12px; font-weight: 800; }
.ba-remark-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 9px; }
.ba-remark-field { display: grid; gap: 6px; }
.ba-remark-field span { display: flex; justify-content: space-between; gap: 8px; color: var(--muted,#64748b); font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: .06em; }
.ba-publish-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 9px 11px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted,#64748b) 8%, transparent);
  border: 1px solid var(--border,rgba(0,0,0,.08));
  color: var(--text,#111827);
  font-size: 12px;
  font-weight: 900;
}
.ba-publish-line input { width: 16px; min-height: 16px; }

.ba-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 210px;
  margin-top: 10px;
  padding: 22px;
  border-radius: 24px;
  border-style: dashed;
  text-align: center;
}
.ba-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--ba-primary) 12%, var(--surface,#fff));
  font-size: 28px;
}
.ba-empty h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.ba-empty p { margin: 0; color: var(--muted,#64748b); font-size: 13px; line-height: 1.6; }

.ba-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15,23,42,.50);
  backdrop-filter: blur(12px);
}
.ba-sheet {
  width: min(760px, 100%);
  max-height: min(88dvh, 760px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px 28px 22px 22px;
  box-shadow: 0 30px 90px rgba(15,23,42,.32);
  animation: sheetIn .18s var(--ease);
}
.ba-sheet.small { width: min(520px, 100%); }
@keyframes sheetIn { from { transform: translateY(16px); opacity: .7; } to { transform: translateY(0); opacity: 1; } }
.ba-sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 12px; }
.ba-sheet-head h2 { margin: 0; color: var(--text,#111827); font-size: 21px; font-weight: 1000; letter-spacing: -.05em; }
.ba-sheet-head p { margin: 5px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.5; font-weight: 750; }
.ba-sheet-head button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-weight: 1000;
  cursor: pointer;
  flex: 0 0 auto;
}
.ba-sheet-actions {
  position: sticky;
  bottom: -14px;
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding: 12px 0 2px;
  background: linear-gradient(to top, var(--card-bg,var(--surface,#fff)) 70%, transparent);
}
.ba-sheet-actions button {
  min-height: 42px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.ba-sheet-actions button.primary {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent);
}
.ba-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 9px; }
.ba-form label { display: grid; gap: 6px; min-width: 0; }
.ba-form span { color: var(--muted,#64748b); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
.ba-menu-list { display: grid; gap: 8px; }
.ba-menu-list button {
  width: 100%;
  display: grid;
  grid-template-columns: 42px minmax(0,1fr);
  column-gap: 10px;
  align-items: center;
  min-height: 58px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 18px;
  padding: 9px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  text-align: left;
  cursor: pointer;
}
.ba-menu-list button span {
  grid-row: span 2;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ba-primary) 10%, transparent);
  color: var(--ba-primary);
  font-weight: 1000;
}
.ba-menu-list button b,
.ba-menu-list button small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-menu-list button b { font-size: 13px; font-weight: 1000; }
.ba-menu-list button small { margin-top: 2px; color: var(--muted,#64748b); font-size: 11px; font-weight: 750; }

@media (min-width: 720px) {
  .ba-page { padding: 10px; }
  .ba-remark-grid.two { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .ba-list { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (min-width: 1100px) {
  .ba-page { padding: 12px; }
  .ba-list { grid-template-columns: repeat(3, minmax(0,1fr)); }
}
@media (max-width: 520px) {
  .ba-search-card { grid-template-columns: minmax(0, 1fr) repeat(3, 40px); gap: 6px; padding: 6px; border-radius: 22px; }
  .ba-icon-button, .ba-filter-button, .ba-add-inline { width: 40px; height: 40px; }
  .ba-summary-line { display: grid; }
}
`;

