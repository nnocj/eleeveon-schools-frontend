"use client";

/**
 * courseOutline.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE COURSE OUTLINE / DELIVERY MAP PAGE
 * ---------------------------------------------------------
 *
 * DB NOTE:
 * Current db.ts does NOT have a dedicated courseOutlines table.
 * This page is a safe projection page over existing tables.
 *
 * It generates a course outline from:
 * - ClassSubject                 = real academic delivery context
 * - CurriculumSubject            = global curriculum subject rules
 * - Curriculum                   = academic programme plan
 * - CurriculumPathway            = optional stream / track
 * - Subject                      = subject identity
 * - Class                        = learner group
 * - AcademicStructure            = academic level / system
 * - AcademicPeriod               = term / semester context
 * - Teacher                      = delivery owner
 * - AssessmentApplicability      = assessment activation readiness
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads are scoped by accountId + schoolId + branchId.
 * - Mobile-first cards and detail panel.
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
  AssessmentApplicability,
  Class,
  ClassSubject,
  Curriculum,
  CurriculumPathway,
  CurriculumSubject,
  Subject,
  Teacher,
} from "../lib/db";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type ReadinessFilter = "all" | "ready" | "incomplete" | "locked" | "inactive" | "unassigned";

type CourseOutlineView = {
  classSubject: ClassSubject;
  className: string;
  subjectName: string;
  subjectCode?: string;
  teacherName: string;
  teacherPhoto?: string;
  curriculumName: string;
  pathwayName: string;
  academicStructureName: string;
  academicPeriodName: string;
  type: string;
  credits?: number;
  contactHours?: number;
  minimumPassScore?: number;
  assessmentConfigured: boolean;
  activeApplicability?: AssessmentApplicability;
  applicabilityCount: number;
  statusLabel: "Ready" | "Needs Assessment Setup" | "Locked" | "Inactive";
};

// ======================================================
// COMPONENT
// ======================================================

export default function CourseOutline() {
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
  const [filterReadiness, setFilterReadiness] = useState<ReadinessFilter>("all");
  const [selectedClassSubjectId, setSelectedClassSubjectId] = useState<number | undefined>();

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
    setClassSubjects([]);
    setCurriculumSubjects([]);
    setCurriculums([]);
    setPathways([]);
    setSubjects([]);
    setClasses([]);
    setTeachers([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setAssessmentApplicabilities([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

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

      setClassSubjects(classSubjectRows.filter(sameTenant));
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
      setPathways(
        pathwayRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setSubjects(
        subjectRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setClasses(
        classRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setTeachers(
        teacherRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
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
      setAssessmentApplicabilities(applicabilityRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load course outline:", error);
      clearData();
      alert("Failed to load course outline data");
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

  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((row) => [row.id, row])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((row) => [row.id, row])), [teachers]);

  const structureMap = useMemo(
    () => new Map(academicStructures.map((row) => [row.id, row])),
    [academicStructures]
  );

  const periodMap = useMemo(
    () => new Map(academicPeriods.map((row) => [row.id, row])),
    [academicPeriods]
  );

  const curriculumSubjectMap = useMemo(
    () => new Map(curriculumSubjects.map((row) => [row.id, row])),
    [curriculumSubjects]
  );

  const curriculumMap = useMemo(
    () => new Map(curriculums.map((row) => [row.id, row])),
    [curriculums]
  );

  const pathwayMap = useMemo(
    () => new Map(pathways.map((row) => [row.id, row])),
    [pathways]
  );

  const applicabilityByClassSubject = useMemo(() => {
    const map = new Map<number, AssessmentApplicability[]>();

    assessmentApplicabilities.forEach((row) => {
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
    return classSubjects.map((classSubject) => {
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

      const activeApplicability = applicability.find((row) => row.active !== false);
      const assessmentConfigured = !!activeApplicability;

      const credits = classSubject.credits ?? curriculumSubject?.credits;
      const contactHours = classSubject.contactHours ?? curriculumSubject?.contactHours;
      const type = classSubject.type || curriculumSubject?.type || "core";

      const statusLabel: CourseOutlineView["statusLabel"] = classSubject.locked
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
        teacherPhoto: teacher?.photo,
        curriculumName: curriculum?.name || "Unknown curriculum",
        pathwayName: pathway?.name || "No pathway",
        academicStructureName: structure?.name || "Unknown academic structure",
        academicPeriodName: period?.name || "All / No period selected",
        type,
        credits,
        contactHours,
        minimumPassScore: curriculumSubject?.minimumPassScore,
        assessmentConfigured,
        activeApplicability,
        applicabilityCount: applicability.length,
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
      .filter((item) => {
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
        if (filterReadiness === "locked" && !row.locked) return false;
        if (filterReadiness === "inactive" && row.active !== false) return false;
        if (filterReadiness === "unassigned" && !!row.teacherId) return false;

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
    return (
      outlineRows.find((row) => row.classSubject.id === selectedClassSubjectId) ||
      filteredRows[0]
    );
  }, [outlineRows, filteredRows, selectedClassSubjectId]);

  const summary = useMemo(() => {
    return {
      total: outlineRows.length,
      ready: outlineRows.filter((row) => row.assessmentConfigured).length,
      incomplete: outlineRows.filter((row) => !row.assessmentConfigured).length,
      withTeachers: outlineRows.filter((row) => !!row.classSubject.teacherId).length,
      locked: outlineRows.filter((row) => row.classSubject.locked).length,
    };
  }, [outlineRows]);

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
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="co-page" style={{ "--co-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="co-state-card">
          <div className="co-spinner" />
          <h2>Opening course outlines...</h2>
          <p>Checking account, branch, class subjects, curriculum, teachers, and assessment readiness.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="co-page" style={{ "--co-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="co-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing course outlines.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="co-page" style={{ "--co-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="co-state-card">
          <h2>Select a branch first</h2>
          <p>Course outlines are generated from class subjects inside one active branch.</p>
          <button type="button" className="co-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="co-page" style={{ "--co-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="co-hero">
        <div className="co-hero-left">
          <div className="co-hero-icon">📖</div>
          <div className="co-title-wrap">
            <p>Delivery Map</p>
            <h2>Course Outline</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="co-ghost-btn" onClick={load}>
          Refresh
        </button>
      </section>

      <section className="co-summary-grid" aria-label="Course outline summary">
        <SummaryCard label="Outlines" value={summary.total} icon="📚" />
        <SummaryCard label="Assessment Ready" value={summary.ready} icon="✅" />
        <SummaryCard label="Needs Setup" value={summary.incomplete} icon="⚠️" />
        <SummaryCard label="With Teachers" value={summary.withTeachers} icon="👨‍🏫" />
        <SummaryCard label="Locked" value={summary.locked} icon="🔒" />
      </section>

      <section className="co-filter-card">
        <input
          placeholder="Search class, subject, teacher, curriculum..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filterClassId || ""} onChange={(event) => setFilterClassId(Number(event.target.value) || undefined)}>
          <option value="">All Classes</option>
          {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterSubjectId || ""} onChange={(event) => setFilterSubjectId(Number(event.target.value) || undefined)}>
          <option value="">All Subjects</option>
          {subjects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterTeacherId || ""} onChange={(event) => setFilterTeacherId(Number(event.target.value) || undefined)}>
          <option value="">All Teachers</option>
          {teachers.map((row) => <option key={row.id} value={row.id}>{row.fullName}</option>)}
        </select>

        <select value={filterCurriculumId || ""} onChange={(event) => setFilterCurriculumId(Number(event.target.value) || undefined)}>
          <option value="">All Curriculums</option>
          {curriculums.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterPeriodId || ""} onChange={(event) => setFilterPeriodId(Number(event.target.value) || undefined)}>
          <option value="">All Periods</option>
          {academicPeriods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterReadiness} onChange={(event) => setFilterReadiness(event.target.value as ReadinessFilter)}>
          <option value="all">All Readiness</option>
          <option value="ready">Assessment Ready</option>
          <option value="incomplete">Needs Assessment Setup</option>
          <option value="locked">Locked</option>
          <option value="inactive">Inactive</option>
          <option value="unassigned">No Teacher</option>
        </select>
      </section>

      <section className="co-layout">
        <div className="co-outline-list">
          {filteredRows.map((item) => {
            const active = selectedOutline?.classSubject.id === item.classSubject.id;

            return (
              <button
                key={item.classSubject.id}
                type="button"
                onClick={() => setSelectedClassSubjectId(item.classSubject.id)}
                className={`co-outline-card ${active ? "active" : ""}`}
              >
                <div className="co-card-topline">
                  <strong>{item.subjectName}</strong>
                  <Chip tone={statusTone(item.statusLabel)}>{item.statusLabel}</Chip>
                </div>

                <p>{item.className} · {item.academicPeriodName}</p>

                <div className="co-chip-row">
                  <Chip tone={typeTone(item.type)}>{item.type}</Chip>
                  <Chip tone="gray">{item.teacherName}</Chip>
                  {item.subjectCode && <Chip tone="blue">{item.subjectCode}</Chip>}
                </div>
              </button>
            );
          })}

          {!filteredRows.length && <EmptyCard text="No course outlines found. Create Class Subjects first." />}
        </div>

        <aside className="co-detail-card">
          {selectedOutline ? (
            <>
              <div className="co-detail-head">
                <div>
                  <h3>{selectedOutline.subjectName}</h3>
                  <p>{selectedOutline.className} · {selectedOutline.academicPeriodName}</p>
                </div>
                <Chip tone={statusTone(selectedOutline.statusLabel)}>{selectedOutline.statusLabel}</Chip>
              </div>

              <section className="co-detail-section">
                <h4>Course Identity</h4>
                <div className="co-chip-row">
                  {selectedOutline.subjectCode && <Chip tone="gray">Code: {selectedOutline.subjectCode}</Chip>}
                  <Chip tone={typeTone(selectedOutline.type)}>Type: {selectedOutline.type}</Chip>
                  <Chip tone="blue">Credits: {selectedOutline.credits ?? "-"}</Chip>
                  <Chip tone="blue">Contact Hours: {selectedOutline.contactHours ?? "-"}</Chip>
                  <Chip tone="orange">Minimum Pass: {selectedOutline.minimumPassScore ?? "-"}</Chip>
                </div>
              </section>

              <section className="co-detail-section">
                <h4>Academic Context</h4>
                <InfoGrid
                  items={[
                    ["Curriculum", selectedOutline.curriculumName],
                    ["Pathway", selectedOutline.pathwayName],
                    ["Academic Structure", selectedOutline.academicStructureName],
                    ["Academic Period", selectedOutline.academicPeriodName],
                  ]}
                />
              </section>

              <section className="co-detail-section">
                <h4>Delivery Ownership</h4>
                <InfoGrid
                  items={[
                    ["Teacher", selectedOutline.teacherName],
                    ["Locked", selectedOutline.classSubject.locked ? "Yes" : "No"],
                    ["Active", selectedOutline.classSubject.active === false ? "No" : "Yes"],
                    ["Applicability Records", `${selectedOutline.applicabilityCount}`],
                  ]}
                />
              </section>

              <section className="co-detail-section readiness">
                <h4>Assessment Readiness</h4>
                <div className="co-chip-row">
                  <Chip tone={selectedOutline.assessmentConfigured ? "green" : "orange"}>
                    {selectedOutline.assessmentConfigured
                      ? "Assessment applicability configured"
                      : "Assessment applicability not configured"}
                  </Chip>
                </div>
                <p>
                  This outline is generated from the academic delivery setup. To make this course fully report-ready,
                  ensure Assessment Applicability is configured for this ClassSubject.
                </p>
              </section>
            </>
          ) : (
            <EmptyCard text="Select a course outline to view details." />
          )}
        </aside>
      </section>
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="co-summary-card">
      <div className="co-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`co-chip ${tone}`}>{children}</span>;
}

function InfoGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="co-info-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="co-empty-card">
      <div className="co-empty-icon">📖</div>
      <h3>No outline selected</h3>
      <p>{text}</p>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes coSpin { to { transform: rotate(360deg); } }

.co-page {
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

.co-page *,
.co-page *::before,
.co-page *::after { box-sizing: border-box; }
.co-page button,
.co-page input,
.co-page select,
.co-page textarea { font: inherit; max-width: 100%; }

.co-page input,
.co-page select {
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

.co-state-card {
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
.co-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.co-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.co-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--co-primary) 18%, transparent); border-top-color: var(--co-primary); animation: coSpin .8s linear infinite; }

.co-primary-btn,
.co-ghost-btn {
  min-height: 46px;
  border-radius: 999px;
  padding: 0 18px;
  font-weight: 950;
  cursor: pointer;
}
.co-primary-btn { border: 0; background: var(--co-primary); color: #fff; }
.co-ghost-btn { border: 1px solid rgba(148, 163, 184, .24); background: var(--surface, #fff); color: var(--text, #0f172a); }

.co-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--co-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.co-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.co-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--co-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--co-primary) 28%, transparent); font-size: 22px; }
.co-title-wrap { min-width: 0; }
.co-title-wrap p,
.co-title-wrap h2,
.co-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.co-title-wrap p { margin: 0 0 2px; color: var(--co-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.co-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.co-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.co-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.co-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .04); overflow: hidden; }
.co-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--co-primary) 12%, #fff); }
.co-summary-card div:last-child { min-width: 0; }
.co-summary-card strong,
.co-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.co-summary-card strong { font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.co-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.co-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; padding: 10px; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 16px 40px rgba(15, 23, 42, .055); }

.co-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; margin-top: 10px; align-items: start; }
.co-outline-list { display: grid; gap: 10px; min-width: 0; }
.co-outline-card { width: 100%; min-width: 0; padding: 13px; border-radius: 23px; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .045); color: var(--text, #0f172a); text-align: left; cursor: pointer; overflow: hidden; }
.co-outline-card.active { border-color: var(--co-primary); box-shadow: 0 14px 34px color-mix(in srgb, var(--co-primary) 14%, transparent); }
.co-card-topline { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; min-width: 0; }
.co-card-topline strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 15px; font-weight: 1000; letter-spacing: -.03em; }
.co-outline-card p { margin: 6px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; }
.co-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.co-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.co-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.co-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.co-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.co-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.co-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.co-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.co-detail-card,
.co-empty-card { min-width: 0; border-radius: 24px; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .045); overflow: hidden; }
.co-detail-card { padding: 13px; }
.co-detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; min-width: 0; }
.co-detail-head div { min-width: 0; }
.co-detail-head h3,
.co-detail-head p { display: block; overflow: hidden; text-overflow: ellipsis; }
.co-detail-head h3 { margin: 0; font-size: 21px; font-weight: 1000; letter-spacing: -.05em; }
.co-detail-head p { margin: 5px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.co-detail-section { margin-top: 11px; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .13); overflow: hidden; }
.co-detail-section h4 { margin: 0; color: #334155; font-size: 11px; font-weight: 1000; letter-spacing: .08em; text-transform: uppercase; }
.co-detail-section.readiness p { margin: 10px 0 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.55; font-weight: 720; }
.co-info-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; }
.co-info-grid div { min-width: 0; padding: 9px; border-radius: 15px; background: #fff; border: 1px solid rgba(148, 163, 184, .14); overflow: hidden; }
.co-info-grid span,
.co-info-grid strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.co-info-grid span { color: var(--muted, #64748b); font-size: 10px; font-weight: 950; text-transform: uppercase; letter-spacing: .06em; }
.co-info-grid strong { margin-top: 3px; font-size: 13px; font-weight: 900; }
.co-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; padding: 22px; text-align: center; border-style: dashed; }
.co-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--co-primary) 12%, #fff); font-size: 28px; }
.co-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.co-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

@media (min-width: 680px) {
  .co-page { padding: 12px; }
  .co-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .co-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .co-info-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .co-page { padding: 16px; }
  .co-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .co-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .co-layout { grid-template-columns: minmax(280px, .9fr) minmax(320px, 1.4fr); gap: 14px; }
  .co-detail-card { position: sticky; top: 62px; }
}

@media (max-width: 520px) {
  .co-page { padding: 6px; }
  .co-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .co-ghost-btn { width: 100%; }
  .co-summary-grid { gap: 6px; }
  .co-summary-card { padding: 10px; border-radius: 19px; }
  .co-detail-card,
  .co-empty-card,
  .co-outline-card { border-radius: 20px; }
  .co-detail-head { flex-direction: column; }
}
`;
