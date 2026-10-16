"use client";

/**
 * app/teacher/modules/ReportRemarks.tsx
 * ---------------------------------------------------------
 * TEACHER REPORT REMARKS
 * ---------------------------------------------------------
 * Drop-in replacement.
 *
 * Purpose:
 * - Manage report-card remarks stored on the existing reportCards table.
 * - Uses the selected workspace source order used across the golden system:
 *   eleeveon_open_workspace -> active membership -> active school/branch -> settings.
 * - Reads through listActiveLocal(...) and writes through createLocal/updateLocal.
 * - Mobile-first golden UI: compact toolbar, filter sheet, cards, analytics.
 *
 * Permission shape:
 * - Teachers can edit classTeacherRemark only.
 * - Teachers are limited to classes where classTeachers.teacherId matches teacherLocalId.
 * - Teachers cannot edit headTeacherRemark or published.
 */

import React, { useEffect, useMemo, useState } from "react";
import {verifyTeacherClassAssignment} from "../hooks/useTeacherWorkspaceAccess";
import { useRegisterBranchWorkspaceToolbar } from "../../components/role-portals/shell/BranchWorkspaceToolbar";
import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import type { AcademicPeriod, AcademicStructure, Class, ClassTeacher, ReportCard, Student, StudentEnrollment } from "../../lib/db";
import { createLocal, updateLocal, listActiveLocal } from "../../lib/sync/syncUtils";

type ViewMode = "single" | "group" | "analytics";
type RemarkFilter = "all" | "missing" | "complete" | "published" | "unpublished";
type TenantRow = { accountId?: string; schoolId?: number | null; branchId?: number | null; active?: boolean; isDeleted?: boolean };
type OpenWorkspaceSession = { membership?: Record<string, any> | null; role?: string | null; schoolId?: number | string | null; branchId?: number | string | null };
type RemarkDraft = { reportCardId?: number; classTeacherRemark: string; headTeacherRemark: string; published: boolean };
type DraftMap = Record<number, RemarkDraft>;
type StudentRemarkRow = { student: Student; enrollment: StudentEnrollment; reportCard?: ReportCard; draft: RemarkDraft };

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";
const FILTER_LABELS: Record<RemarkFilter, string> = { all: "All", missing: "Missing", complete: "Complete", published: "Published", unpublished: "Unpublished" };
const TEACHER_MODE = true;

function safeRead(key: string) { if (typeof window === "undefined") return null; try { return window.localStorage.getItem(key) || window.sessionStorage.getItem(key); } catch { return null; } }
function safeJson<T>(key: string): T | null { const raw = safeRead(key); if (!raw) return null; try { return JSON.parse(raw) as T; } catch { return null; } }
function idOf(value: unknown) { if (value === undefined || value === null || value === "") return 0; const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; }
function clean(value: unknown) { return String(value || "").trim(); }
function sameId(a: unknown, b: unknown) { const x = idOf(a); const y = idOf(b); return x > 0 && y > 0 && x === y; }
function accountMatches(rowAccountId: unknown, accountId?: string | null) { if (!accountId || !rowAccountId) return true; return String(rowAccountId) === String(accountId); }
function rowOk(row: TenantRow) { return !!row && row.isDeleted !== true && row.active !== false; }
function defaultDraft(): RemarkDraft { return { classTeacherRemark: "", headTeacherRemark: "", published: false }; }
function words(value: string) { const t = clean(value); return t ? t.split(/\s+/).length : 0; }
function reportKey(studentId: number, classId: number, structureId: number, periodId: number) { return `${studentId}:${classId}:${structureId}:${periodId}`; }
async function rows<T>(table: string): Promise<T[]> { return ((await listActiveLocal(table as any)) || []) as T[]; }

export default function ReportRemarks() {
  const { accountId, authenticated, loading: accountLoading } = useAccount() as any;
  const { settings, loading: settingsLoading } = useSettings() as any;
  const { activeMembership } = useActiveMembership() as any;
  const { activeSchool, activeSchoolId, activeBranch, activeBranchId, loading: contextLoading } = useActiveBranch() as any;
  const openWorkspace = useMemo(() => safeJson<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY), []);

  const selectedAccountId = useMemo(() => clean(accountId) || clean(openWorkspace?.membership?.accountId) || clean(activeMembership?.accountId) || clean(settings?.accountId), [accountId, activeMembership?.accountId, openWorkspace?.membership?.accountId, settings?.accountId]);
  const selectedSchoolId = useMemo(() => idOf(openWorkspace?.schoolId) || idOf(openWorkspace?.membership?.schoolId) || idOf(openWorkspace?.membership?.school?.id) || idOf(activeMembership?.schoolId) || idOf(activeMembership?.school?.id) || idOf(activeSchoolId) || idOf(activeSchool?.id) || idOf(settings?.schoolId) || idOf(safeRead("activeSchoolId")), [activeMembership?.school?.id, activeMembership?.schoolId, activeSchool?.id, activeSchoolId, openWorkspace?.membership?.school?.id, openWorkspace?.membership?.schoolId, openWorkspace?.schoolId, settings?.schoolId]);
  const selectedBranchId = useMemo(() => idOf(openWorkspace?.branchId) || idOf(openWorkspace?.membership?.branchId) || idOf(openWorkspace?.membership?.schoolBranchId) || idOf(openWorkspace?.membership?.branch?.id) || idOf(activeMembership?.branchId) || idOf(activeMembership?.schoolBranchId) || idOf(activeMembership?.branch?.id) || idOf(activeBranchId) || idOf(activeBranch?.id) || idOf(settings?.branchId) || idOf(safeRead("activeBranchId")), [activeBranch?.id, activeBranchId, activeMembership?.branch?.id, activeMembership?.branchId, activeMembership?.schoolBranchId, openWorkspace?.branchId, openWorkspace?.membership?.branch?.id, openWorkspace?.membership?.branchId, openWorkspace?.membership?.schoolBranchId, settings?.branchId]);
  const selectedTeacherId = useMemo(() => idOf(openWorkspace?.membership?.teacherLocalId) || idOf(openWorkspace?.membership?.teacherId) || idOf(activeMembership?.teacherLocalId) || idOf(activeMembership?.teacherId) || idOf(safeRead("activeTeacherId")), [activeMembership?.teacherId, activeMembership?.teacherLocalId, openWorkspace?.membership?.teacherId, openWorkspace?.membership?.teacherLocalId]);
  const primary = clean(settings?.primaryColor) || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacher[]>([]);
  const [structures, setStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [academicStructureId, setAcademicStructureId] = useState<number | undefined>(idOf(settings?.currentAcademicStructureId) || undefined);
  const [academicPeriodId, setAcademicPeriodId] = useState<number | undefined>(idOf(settings?.currentAcademicPeriodId) || undefined);
  const [classId, setClassId] = useState<number | undefined>();
  const [studentId, setStudentId] = useState<number | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [remarkFilter, setRemarkFilter] = useState<RemarkFilter>("all");
  const [search, setSearch] = useState("");
  useRegisterBranchWorkspaceToolbar("reportsWorkspace", {search:setSearch, filter:()=>setFiltersOpen(true),more:()=>setMoreOpen(true)});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [bulkClassRemark, setBulkClassRemark] = useState("");
  const [bulkHeadRemark, setBulkHeadRemark] = useState("");
  const [bulkOverwrite, setBulkOverwrite] = useState(false);

  const sameTenant = (row: TenantRow) => accountMatches(row.accountId, selectedAccountId) && sameId(row.schoolId, selectedSchoolId) && sameId(row.branchId, selectedBranchId) && rowOk(row);
  const clear = () => { setStudents([]); setClasses([]); setClassTeachers([]); setStructures([]); setPeriods([]); setEnrollments([]); setReportCards([]); };

  const load = async () => {
    if (!authenticated || !selectedAccountId || !selectedSchoolId || !selectedBranchId || (TEACHER_MODE && !selectedTeacherId)) { clear(); setLoading(false); return; }
    try {
      setLoading(true);
      const [studentRows, classRows, classTeacherRows, structureRows, periodRows, enrollmentRows, reportRows] = await Promise.all([
        rows<Student>("students"), rows<Class>("classes"), rows<ClassTeacher>("classTeachers"), rows<AcademicStructure>("academicStructures"), rows<AcademicPeriod>("academicPeriods"), rows<StudentEnrollment>("studentEnrollments"), rows<ReportCard>("reportCards"),
      ]);
      const teacherLinks = classTeacherRows.filter((r: any) => sameTenant(r) && (!TEACHER_MODE || sameId(r.teacherId, selectedTeacherId)));
      const teacherClassIds = new Set(teacherLinks.map((r) => r.classId).filter(Boolean));
      setClassTeachers(teacherLinks);
      setStudents(studentRows.filter((r: any) => sameTenant(r) && r.status !== "withdrawn").sort((a, b) => clean(a.fullName).localeCompare(clean(b.fullName))));
      setClasses(classRows.filter((r: any) => sameTenant(r) && (!TEACHER_MODE || teacherClassIds.has(r.id || 0))).sort((a, b) => clean(a.name).localeCompare(clean(b.name))));
      setStructures(structureRows.filter((r: any) => sameTenant(r)).sort((a, b) => clean(a.name).localeCompare(clean(b.name))));
      setPeriods(periodRows.filter((r: any) => sameTenant(r)).sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0)));
      setEnrollments(enrollmentRows.filter((r: any) => sameTenant(r)));
      setReportCards(reportRows.filter((r: any) => sameTenant(r)));
    } catch (error) { console.error("Failed to load report remarks:", error); clear(); alert("Failed to load report remarks."); } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [authenticated, selectedAccountId, selectedSchoolId, selectedBranchId, selectedTeacherId]);

  const studentMap = useMemo(() => new Map(students.map((r) => [r.id, r])), [students]);
  const classMap = useMemo(() => new Map(classes.map((r) => [r.id, r])), [classes]);
  const teacherClassIds = useMemo(() => new Set(classTeachers.map((r) => r.classId).filter(Boolean)), [classTeachers]);
  const filteredPeriods = useMemo(() => academicStructureId ? periods.filter((r) => sameId(r.academicStructureId, academicStructureId)) : periods, [academicStructureId, periods]);

  const availableClassIds = useMemo(() => {
    const ids = new Set<number>();
    enrollments.forEach((r) => { if (r.status === "withdrawn") return; if (TEACHER_MODE && !teacherClassIds.has(r.classId)) return; if (academicStructureId && !sameId(r.academicStructureId, academicStructureId)) return; if (academicPeriodId && !sameId(r.academicPeriodId, academicPeriodId)) return; if (r.classId) ids.add(r.classId); });
    reportCards.forEach((r) => { if (TEACHER_MODE && !teacherClassIds.has(r.classId)) return; if (academicStructureId && !sameId(r.academicStructureId, academicStructureId)) return; if (academicPeriodId && !sameId(r.academicPeriodId, academicPeriodId)) return; if (r.classId) ids.add(r.classId); });
    return ids;
  }, [academicPeriodId, academicStructureId, enrollments, reportCards, teacherClassIds]);

  const availableClasses = useMemo(() => (!academicStructureId && !academicPeriodId ? classes : classes.filter((r) => r.id && availableClassIds.has(r.id))), [academicPeriodId, academicStructureId, availableClassIds, classes]);
  const reportMap = useMemo(() => { const map = new Map<string, ReportCard>(); reportCards.forEach((r) => { if (r.studentId && r.classId && r.academicStructureId && r.academicPeriodId) map.set(reportKey(r.studentId, r.classId, r.academicStructureId, r.academicPeriodId), r); }); return map; }, [reportCards]);

  const studentRows = useMemo<StudentRemarkRow[]>(() => {
    if (!academicStructureId || !academicPeriodId || !classId) return [];
    return enrollments.filter((e) => e.status !== "withdrawn" && (!TEACHER_MODE || teacherClassIds.has(e.classId)) && sameId(e.academicStructureId, academicStructureId) && sameId(e.academicPeriodId, academicPeriodId) && sameId(e.classId, classId)).map((enrollment) => {
      const student = studentMap.get(enrollment.studentId); if (!student?.id) return undefined;
      const reportCard = reportMap.get(reportKey(student.id, enrollment.classId, enrollment.academicStructureId, enrollment.academicPeriodId));
      const draft = drafts[student.id] || { reportCardId: reportCard?.id, classTeacherRemark: reportCard?.classTeacherRemark || "", headTeacherRemark: reportCard?.headTeacherRemark || "", published: !!reportCard?.published };
      return { student, enrollment, reportCard, draft };
    }).filter(Boolean) as StudentRemarkRow[];
  }, [academicPeriodId, academicStructureId, classId, drafts, enrollments, reportMap, studentMap, teacherClassIds]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return studentRows.filter((r) => {
      const hasClass = !!r.draft.classTeacherRemark.trim(); const hasHead = !!r.draft.headTeacherRemark.trim(); const complete = TEACHER_MODE ? hasClass : hasClass && hasHead;
      if (viewMode === "single" && studentId && r.student.id !== studentId) return false;
      if (remarkFilter === "missing" && complete) return false; if (remarkFilter === "complete" && !complete) return false; if (remarkFilter === "published" && !r.draft.published) return false; if (remarkFilter === "unpublished" && r.draft.published) return false;
      return !q || `${r.student.fullName || ""} ${r.student.admissionNumber || ""}`.toLowerCase().includes(q);
    }).sort((a, b) => clean(a.student.fullName).localeCompare(clean(b.student.fullName)));
  }, [remarkFilter, search, studentId, studentRows, viewMode]);

  const selectedRow = useMemo(() => studentId ? studentRows.find((r) => r.student.id === studentId) : filteredRows[0], [filteredRows, studentId, studentRows]);
  useEffect(() => { if (!academicStructureId || !academicPeriodId || !classId) { setDrafts({}); return; } const next: DraftMap = {}; studentRows.forEach((r) => { if (r.student.id) next[r.student.id] = { reportCardId: r.reportCard?.id, classTeacherRemark: r.reportCard?.classTeacherRemark || "", headTeacherRemark: r.reportCard?.headTeacherRemark || "", published: !!r.reportCard?.published }; }); setDrafts(next); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [academicStructureId, academicPeriodId, classId, reportCards.length]);

  const summary = useMemo(() => { const total = studentRows.length; const classRemarked = studentRows.filter((r) => !!r.draft.classTeacherRemark.trim()).length; const headRemarked = studentRows.filter((r) => !!r.draft.headTeacherRemark.trim()).length; const complete = studentRows.filter((r) => TEACHER_MODE ? !!r.draft.classTeacherRemark.trim() : !!r.draft.classTeacherRemark.trim() && !!r.draft.headTeacherRemark.trim()).length; const published = studentRows.filter((r) => r.draft.published).length; const missing = Math.max(0, total - complete); const completion = total ? Math.round((complete / total) * 100) : 0; return { total, classRemarked, headRemarked, complete, published, missing, completion }; }, [studentRows]);
  const activeFilters = Boolean(academicStructureId || academicPeriodId || classId || studentId || remarkFilter !== "all" || search.trim());
  const updateDraft = (sid: number, patch: Partial<RemarkDraft>) => setDrafts((prev) => ({ ...prev, [sid]: { ...(prev[sid] || defaultDraft()), ...patch } }));

  const applyBulk = () => {
    if (!filteredRows.length) return alert("No students match the current filter.");
    if (!bulkClassRemark.trim() && (!bulkHeadRemark.trim() || TEACHER_MODE)) return alert("Enter a class teacher remark first.");
    const next: DraftMap = { ...drafts };
    filteredRows.forEach((r) => { const sid = r.student.id || 0; const current = next[sid] || r.draft || defaultDraft(); next[sid] = { ...current, classTeacherRemark: bulkClassRemark.trim() && (bulkOverwrite || !current.classTeacherRemark.trim()) ? bulkClassRemark.trim() : current.classTeacherRemark, headTeacherRemark: !TEACHER_MODE && bulkHeadRemark.trim() && (bulkOverwrite || !current.headTeacherRemark.trim()) ? bulkHeadRemark.trim() : current.headTeacherRemark }; });
    setDrafts(next);
  };
  const setPublishedShown = (published: boolean) => { if (TEACHER_MODE) return; const next: DraftMap = { ...drafts }; filteredRows.forEach((r) => { const sid = r.student.id || 0; next[sid] = { ...(next[sid] || r.draft || defaultDraft()), published }; }); setDrafts(next); };

  const saveRows = async (targetRows: StudentRemarkRow[]) => {
    if (!authenticated || !selectedAccountId) return alert("Sign in first."); if (!selectedSchoolId) return alert("Select school first."); if (!selectedBranchId) return alert("Select branch first."); if (TEACHER_MODE && !selectedTeacherId) return alert("Teacher profile required."); if (!academicStructureId) return alert("Select academic structure."); if (!academicPeriodId) return alert("Select academic period."); if (!classId) return alert("Select class."); if (!targetRows.length) return alert("No students to save.");
    if (TEACHER_MODE && !await verifyTeacherClassAssignment({accountId:selectedAccountId,schoolId:String(selectedSchoolId),branchId:String(selectedBranchId),teacherId:String(selectedTeacherId)},String(classId))) {
      return alert("This class is no longer assigned to you as class teacher.");
    }
    try {
      setSaving(true);
      for (const r of targetRows) {
        const sid = r.student.id; if (!sid) continue; const draft = drafts[sid] || r.draft || defaultDraft(); const existing = r.reportCard || reportMap.get(reportKey(sid, classId, academicStructureId, academicPeriodId));
        if (existing?.id) {
          await updateLocal("reportCards" as any, Number(existing.id), { accountId: selectedAccountId, schoolId: selectedSchoolId, branchId: selectedBranchId, classTeacherRemark: draft.classTeacherRemark.trim() || undefined, ...(!TEACHER_MODE ? { headTeacherRemark: draft.headTeacherRemark.trim() || undefined, published: draft.published } : {}) } as Partial<ReportCard>);
        } else {
          await createLocal("reportCards" as any, { accountId: selectedAccountId, schoolId: selectedSchoolId, branchId: selectedBranchId, studentId: sid, classId, academicStructureId, academicPeriodId, total: 0, average: 0, classTeacherRemark: draft.classTeacherRemark.trim() || undefined, headTeacherRemark: TEACHER_MODE ? undefined : draft.headTeacherRemark.trim() || undefined, published: TEACHER_MODE ? false : draft.published } as Partial<ReportCard>);
        }
      }
      await load(); alert("Report remarks saved.");
    } catch (error) { console.error("Failed to save report remarks:", error); alert("Failed to save report remarks."); } finally { setSaving(false); }
  };

  if (accountLoading || contextLoading || settingsLoading || loading) return <State primary={primary} title="Opening report remarks..." text="Checking workspace, students, enrollments and report cards." spin />;
  if (!authenticated || !selectedAccountId) return <State primary={primary} title="Sign in required" text="You must sign in before managing report remarks." />;
  if (!selectedSchoolId || !selectedBranchId) return <State primary={primary} title="Branch context required" text="Report remarks belong to one selected school branch." />;
  if (TEACHER_MODE && !selectedTeacherId) return <State primary={primary} title="Teacher profile required" text="This page needs your selected teacher membership to include teacherLocalId." />;

  return (
    <main className="rr-page" style={{ "--rr-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="rr-toolbar"><span className="rr-dot" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students..." /><button type="button" onClick={() => setFiltersOpen(true)}>☷</button><button type="button" onClick={() => setMoreOpen(true)}>⋯</button></section>
      {activeFilters && <section className="rr-mini"><strong>{TEACHER_MODE ? "Teacher Remarks" : "Report Remarks"} ({filteredRows.length})</strong><span>{activeBranch?.name || "Branch"} · {FILTER_LABELS[remarkFilter]} · {viewMode}</span></section>}
      <section className="rr-modes"><button className={viewMode === "single" ? "active" : ""} onClick={() => setViewMode("single")}>Single</button><button className={viewMode === "group" ? "active" : ""} onClick={() => setViewMode("group")}>Group</button><button className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>Analytics</button></section>
      {viewMode === "analytics" && <section className="rr-grid"><Summary label="Students" value={summary.total} icon="🎓" /><Summary label="Class remarks" value={summary.classRemarked} icon="✍️" />{!TEACHER_MODE && <Summary label="Head remarks" value={summary.headRemarked} icon="🏫" />}<Summary label="Complete" value={summary.complete} icon="✅" />{!TEACHER_MODE && <Summary label="Published" value={summary.published} icon="📢" />}<Summary label="Completion" value={`${summary.completion}%`} icon="📊" /></section>}
      {viewMode === "group" && <section className="rr-card"><div className="rr-head"><div><h3>Group tools</h3><p>{TEACHER_MODE ? "Apply class-teacher remarks to shown students." : "Apply remarks to shown students."}</p></div><label><input type="checkbox" checked={bulkOverwrite} onChange={(e) => setBulkOverwrite(e.target.checked)} /> Overwrite</label></div><div className={TEACHER_MODE ? "rr-edit one" : "rr-edit"}><textarea value={bulkClassRemark} onChange={(e) => setBulkClassRemark(e.target.value)} placeholder="Class teacher remark..." />{!TEACHER_MODE && <textarea value={bulkHeadRemark} onChange={(e) => setBulkHeadRemark(e.target.value)} placeholder="Head teacher / principal remark..." />}</div><div className="rr-actions"><button onClick={applyBulk}>Apply</button>{!TEACHER_MODE && <button onClick={() => setPublishedShown(true)}>Publish</button>}{!TEACHER_MODE && <button onClick={() => setPublishedShown(false)}>Unpublish</button>}<button onClick={() => saveRows(filteredRows)} disabled={saving}>{saving ? "Saving..." : "Save shown"}</button></div></section>}
      {viewMode === "single" && selectedRow && <section className="rr-list"><RemarkCard row={selectedRow} className={classMap.get(classId)?.name} draft={drafts[selectedRow.student.id || 0] || selectedRow.draft} updateDraft={updateDraft} admin={!TEACHER_MODE} /><button className="rr-primary" disabled={saving} onClick={() => saveRows([selectedRow])}>{saving ? "Saving..." : "Save student"}</button></section>}
      {viewMode === "group" && <section className="rr-list">{filteredRows.map((r) => <RemarkCard key={r.student.id} row={r} className={classMap.get(classId)?.name} draft={drafts[r.student.id || 0] || r.draft} updateDraft={updateDraft} admin={!TEACHER_MODE} />)}</section>}
      {!studentRows.length && viewMode !== "analytics" && <Empty text={TEACHER_MODE ? "Choose academic structure, period and one of your assigned classes." : "Choose academic structure, period and class to load students."} />}
      {filtersOpen && <Sheet title="Filters" onClose={() => setFiltersOpen(false)}><FilterGrid structures={structures} periods={filteredPeriods} classes={availableClasses} studentRows={studentRows} viewMode={viewMode} academicStructureId={academicStructureId} setAcademicStructureId={setAcademicStructureId} academicPeriodId={academicPeriodId} setAcademicPeriodId={setAcademicPeriodId} classId={classId} setClassId={setClassId} studentId={studentId} setStudentId={setStudentId} remarkFilter={remarkFilter} setRemarkFilter={setRemarkFilter} /></Sheet>}
      {moreOpen && <Sheet title="More" onClose={() => setMoreOpen(false)}><div className="rr-menu"><button onClick={() => (load(), setMoreOpen(false))}>Refresh</button><button onClick={() => (setViewMode("single"), setMoreOpen(false))}>Single mode</button><button onClick={() => (setViewMode("group"), setMoreOpen(false))}>Group mode</button><button onClick={() => (setViewMode("analytics"), setMoreOpen(false))}>Analytics</button></div></Sheet>}
    </main>
  );
}

function FilterGrid(props: any) { return <div className="rr-filter"><label><span>Academic Structure</span><select value={props.academicStructureId || ""} onChange={(e) => { props.setAcademicStructureId(idOf(e.target.value) || undefined); props.setAcademicPeriodId(undefined); props.setClassId(undefined); props.setStudentId(undefined); }}><option value="">All structures</option>{props.structures.map((r: AcademicStructure) => <option key={r.id} value={r.id}>{r.name} · {r.level}</option>)}</select></label><label><span>Academic Period</span><select value={props.academicPeriodId || ""} onChange={(e) => { props.setAcademicPeriodId(idOf(e.target.value) || undefined); props.setClassId(undefined); props.setStudentId(undefined); }}><option value="">All periods</option>{props.periods.map((r: AcademicPeriod) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label><span>Class</span><select value={props.classId || ""} onChange={(e) => { props.setClassId(idOf(e.target.value) || undefined); props.setStudentId(undefined); }}><option value="">All classes</option>{props.classes.map((r: Class) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{props.viewMode === "single" && <label><span>Student</span><select value={props.studentId || ""} onChange={(e) => props.setStudentId(idOf(e.target.value) || undefined)}><option value="">Auto select</option>{props.studentRows.map((r: StudentRemarkRow) => <option key={r.student.id} value={r.student.id}>{r.student.fullName} {r.student.admissionNumber ? `· ${r.student.admissionNumber}` : ""}</option>)}</select></label>}<label><span>Remark Filter</span><select value={props.remarkFilter} onChange={(e) => props.setRemarkFilter(e.target.value)}><option value="all">All</option><option value="missing">Missing</option><option value="complete">Complete</option><option value="published">Published</option><option value="unpublished">Unpublished</option></select></label></div>; }
function Summary({ label, value, icon }: { label: string; value: string | number; icon: string }) { return <article className="rr-summary"><b>{icon}</b><strong>{value}</strong><span>{label}</span></article>; }
function RemarkCard({ row, className, draft, updateDraft, admin }: { row: StudentRemarkRow; className?: string; draft: RemarkDraft; updateDraft: (sid: number, patch: Partial<RemarkDraft>) => void; admin: boolean }) { const sid = row.student.id || 0; const complete = !!draft.classTeacherRemark.trim() && (!admin || !!draft.headTeacherRemark.trim()); return <article className="rr-student"><div className="rr-student-head"><span className="rr-avatar">{clean(row.student.fullName).slice(0,1).toUpperCase() || "S"}</span><div><h3>{row.student.fullName}</h3><p>{row.student.admissionNumber || "No admission no."}{className ? ` · ${className}` : ""}</p><div className="rr-chips"><Chip tone={complete ? "green" : "orange"}>{complete ? "Complete" : "Needs remarks"}</Chip><Chip>{draft.published ? "Published" : "Unpublished"}</Chip>{row.reportCard?.id ? <Chip tone="blue">Report exists</Chip> : <Chip>New card</Chip>}</div></div></div><div className={admin ? "rr-edit" : "rr-edit one"}><label><span>Class Teacher Remark <Chip>{words(draft.classTeacherRemark)} word(s)</Chip></span><textarea value={draft.classTeacherRemark} onChange={(e) => updateDraft(sid, { classTeacherRemark: e.target.value })} placeholder="Enter class teacher remark..." /></label>{admin && <label><span>Head Teacher / Principal Remark <Chip>{words(draft.headTeacherRemark)} word(s)</Chip></span><textarea value={draft.headTeacherRemark} onChange={(e) => updateDraft(sid, { headTeacherRemark: e.target.value })} placeholder="Enter head teacher / principal remark..." /></label>}</div>{admin && <label className="rr-publish"><input type="checkbox" checked={draft.published} onChange={(e) => updateDraft(sid, { published: e.target.checked })} /> Publish report card</label>}</article>; }
function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "blue" | "orange" | "gray" }) { return <span className={`rr-chip ${tone}`}>{children}</span>; }
function Empty({ text }: { text: string }) { return <section className="rr-empty"><div>💬</div><h3>No remarks loaded</h3><p>{text}</p></section>; }
function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <><button className="rr-overlay" onClick={onClose} aria-label="Close" /><aside className="rr-sheet"><header><h3>{title}</h3><button onClick={onClose}>✕</button></header>{children}</aside></>; }
function State({ primary, title, text, spin }: { primary: string; title: string; text: string; spin?: boolean }) { return <main className="rr-page" style={{ "--rr-primary": primary } as React.CSSProperties}><style>{css}</style><section className="rr-state">{spin && <div className="rr-spinner" />}<h2>{title}</h2><p>{text}</p></section></main>; }

const css = `
@keyframes rrSpin{to{transform:rotate(360deg)}
.rr-page{min-height:100dvh;width:100%;max-width:100%;padding:6px 6px max(28px,env(safe-area-inset-bottom));background:var(--bg,#f8fafc);color:var(--text,#0f172a);font-family:var(--font-family,system-ui);overflow-x:hidden}.rr-page *{box-sizing:border-box;min-width:0}.rr-page button,.rr-page input,.rr-page select,.rr-page textarea{font:inherit}.rr-page input,.rr-page select,.rr-page textarea{width:100%;min-height:40px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.1)));border-radius:14px;padding:0 11px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#0f172a));outline:0;font-weight:750}.rr-page textarea{min-height:96px;padding-top:10px;resize:vertical;line-height:1.5}.rr-toolbar{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:7px;align-items:center;padding:6px;border-radius:22px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.1));box-shadow:0 12px 28px rgba(15,23,42,.045)}.rr-dot{width:12px;height:12px;border-radius:99px;background:var(--rr-primary);box-shadow:0 0 0 5px color-mix(in srgb,var(--rr-primary) 14%,transparent)}.rr-toolbar button,.rr-sheet header button{width:40px;height:40px;border:1px solid var(--border,rgba(0,0,0,.1));border-radius:15px;background:var(--surface,#fff);color:var(--text,#0f172a);font-weight:1000}.rr-mini{margin-top:7px;padding:8px 10px;border-radius:18px;background:color-mix(in srgb,var(--rr-primary) 8%,var(--surface,#fff));border:1px solid color-mix(in srgb,var(--rr-primary) 14%,var(--border,rgba(0,0,0,.1)));display:flex;justify-content:space-between;gap:8px}.rr-mini strong,.rr-mini span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rr-mini strong{font-size:12px;font-weight:1000}.rr-mini span{color:var(--muted,#64748b);font-size:11px;font-weight:800}.rr-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px;padding:6px;border-radius:20px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.1))}.rr-modes button{min-height:38px;border-radius:14px;border:1px solid var(--border,rgba(0,0,0,.1));background:var(--surface,#fff);color:var(--text,#0f172a);font-size:12px;font-weight:950}.rr-modes button.active{background:color-mix(in srgb,var(--rr-primary) 10%,var(--surface,#fff));border-color:var(--rr-primary);color:var(--rr-primary)}.rr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}.rr-summary,.rr-card,.rr-student,.rr-empty,.rr-state{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.1));box-shadow:0 12px 28px rgba(15,23,42,.045);border-radius:22px}.rr-summary{display:grid;gap:2px;padding:10px}.rr-summary b{width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--rr-primary) 12%,var(--surface,#fff))}.rr-summary strong{font-size:18px;font-weight:1000}.rr-summary span{font-size:11px;color:var(--muted,#64748b);font-weight:850}.rr-card{margin-top:8px;padding:11px}.rr-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.rr-head h3{margin:0;font-size:16px;font-weight:1000}.rr-head p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:750}.rr-head label,.rr-publish{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:900}.rr-head input,.rr-publish input{width:16px;min-height:16px}.rr-edit{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-top:10px}.rr-edit label{display:grid;gap:7px}.rr-edit label>span{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;font-weight:1000}.rr-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.rr-actions button,.rr-primary{min-height:38px;border:1px solid var(--border,rgba(0,0,0,.1));border-radius:999px;padding:0 12px;background:var(--surface,#fff);color:var(--text,#0f172a);font-size:12px;font-weight:950}.rr-primary{width:100%;background:var(--rr-primary);border:0;color:#fff}.rr-list{display:grid;gap:8px;margin-top:8px}.rr-student{padding:11px}.rr-student-head{display:flex;gap:9px}.rr-avatar{width:48px;height:48px;flex:0 0 auto;display:grid;place-items:center;border-radius:17px;background:var(--rr-primary);color:#fff;font-weight:1000}.rr-student h3{margin:0;font-size:15px;font-weight:1000}.rr-student p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:750}.rr-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.rr-chip{display:inline-flex;align-items:center;min-height:23px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.rr-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.rr-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.rr-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.rr-publish{margin-top:10px;padding:9px;border-radius:15px;background:color-mix(in srgb,var(--muted,#64748b) 9%,transparent);border:1px solid var(--border,rgba(0,0,0,.1))}.rr-empty,.rr-state{display:grid;place-items:center;align-content:center;gap:8px;min-height:190px;padding:20px;text-align:center;border-style:dashed}.rr-empty div{width:54px;height:54px;display:grid;place-items:center;border-radius:21px;background:color-mix(in srgb,var(--rr-primary) 12%,var(--surface,#fff));font-size:26px}.rr-empty h3,.rr-state h2{margin:0;font-weight:1000}.rr-empty p,.rr-state p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.rr-state{width:min(460px,100%);margin:0 auto;min-height:min(420px,calc(100dvh - 32px));border-style:solid}.rr-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--rr-primary) 18%,transparent);border-top-color:var(--rr-primary);animation:rrSpin .8s linear infinite}.rr-overlay{position:fixed;inset:0;z-index:80;border:0;background:rgba(15,23,42,.45)}.rr-sheet{position:fixed;right:0;top:0;bottom:0;z-index:90;width:min(420px,94vw);padding:12px;background:var(--surface,#fff);color:var(--text,#0f172a);box-shadow:0 24px 80px rgba(15,23,42,.24);overflow:auto}.rr-sheet header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.rr-sheet h3{margin:0;font-size:20px;font-weight:1000}.rr-filter,.rr-menu{display:grid;gap:9px}.rr-filter label span{display:block;margin-bottom:5px;color:var(--muted,#64748b);font-size:11px;font-weight:950}.rr-menu button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.1));border-radius:15px;background:var(--surface,#fff);color:var(--text,#0f172a);text-align:left;padding:0 12px;font-weight:900}@media(min-width:680px){.rr-page{padding:10px}.rr-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.rr-edit{grid-template-columns:repeat(2,minmax(0,1fr))}.rr-edit.one{grid-template-columns:minmax(0,1fr)}@media(min-width:1040px){.rr-page{padding:12px}.rr-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.rr-list{grid-template-columns:repeat(2,minmax(0,1fr)}@media(max-width:520px){.rr-actions{display:grid}.rr-actions button{width:100%}.rr-mini{display:grid}
`;
