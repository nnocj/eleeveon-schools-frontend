"use client";

/**
 * app/teacher/modules/Assessmententry.tsx
 * ---------------------------------------------------------
 * TEACHER ASSESSMENT ENTRY
 * ---------------------------------------------------------
 * Teacher-only score entry engine.
 *
 * This file is tailored for app/teacher/modules.
 * It does NOT import the old dashboard assessment page.
 * It does NOT use DexieCrudPage because teachers should not type raw IDs.
 *
 * Flow:
 * - Signed-in teacher opens assigned class subjects only.
 * - Teacher selects class/subject.
 * - App loads active students from enrollments.
 * - App loads assessment applicability + assessment structure items.
 * - Teacher enters scores in a mobile-first score sheet.
 * - App computes totals, weighted percentage, grade and remark.
 * - App saves to assessmentEntries with account/school/branch/teacher/class/subject context.
 */

import React, { useEffect, useMemo, useState } from "react";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  AssessmentApplicability,
  AssessmentEntry,
  AssessmentStructure,
  AssessmentStructureItem,
  Class,
  ClassSubject,
  Curriculum,
  CurriculumPathway,
  CurriculumSubject,
  GradeRule,
  GradingSystem,
  Organization,
  Student,
  StudentEnrollment,
  Subject,
  Teacher,
} from "../../lib/db";



// Local helper avoids prepareSyncData's generic SyncableRecord typing mismatch.
// It preserves your offline-sync fields while allowing AssessmentEntry's real type.
const makeAssessmentEntryPayload = (
  payload: Partial<AssessmentEntry>,
  existing?: Partial<AssessmentEntry>
): AssessmentEntry => {
  const now = Date.now();

  return {
    ...(existing || {}),
    ...payload,
    accountId: payload.accountId ?? existing?.accountId,
    schoolId: payload.schoolId ?? existing?.schoolId,
    branchId: payload.branchId ?? existing?.branchId,
    academicPeriodId: payload.academicPeriodId ?? existing?.academicPeriodId,
    assessmentStructureItemId:
      payload.assessmentStructureItemId ?? existing?.assessmentStructureItemId,
    studentId: payload.studentId ?? existing?.studentId,
    classId: payload.classId ?? existing?.classId,
    subjectId: payload.subjectId ?? existing?.subjectId,
    score: Number(payload.score ?? existing?.score ?? 0),
    createdAt: existing?.createdAt || payload.createdAt || now,
    updatedAt: now,
    version: Number(existing?.version || 0) + 1,
    cloudId: payload.cloudId ?? existing?.cloudId,
    synced: "pending" as unknown as AssessmentEntry["synced"],
    isDeleted: payload.isDeleted ?? existing?.isDeleted ?? false,
  } as unknown as AssessmentEntry;
};


// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number | string;
  branchId?: number | string;
  isDeleted?: boolean;
};

type ScoreMap = Record<string, number | "">;

type ViewMode = "sheet" | "cards" | "summary";

type ClassSubjectOption = {
  id: number;
  row: ClassSubject;
  className: string;
  subjectName: string;
  subjectCode?: string;
  teacherName: string;
  academicStructureName: string;
  academicPeriodName: string;
  curriculumName: string;
  pathwayName: string;
  organizationId?: number;
  display: string;
};

type StudentRow = {
  student: Student;
  enrollment?: StudentEnrollment;
};

type ResultRow = {
  rawTotal: number;
  weightedTotal: number;
  percentage: number;
  grade?: string;
  remark?: string;
  gpa?: number;
};

type ResultMap = Record<string, ResultRow>;

type ToastTone = "success" | "error" | "info";

// ======================================================
// HELPERS
// ======================================================

const scoreKey = (studentId?: number, itemId?: number) => `${studentId || 0}-${itemId || 0}`;

const idOf = (value: any) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");

const fullNameOf = (row: any) =>
  row?.fullName ||
  row?.name ||
  [row?.firstName, row?.middleName, row?.lastName].filter(Boolean).join(" ") ||
  "Unnamed";

const safeLower = (value: any) => String(value || "").toLowerCase().trim();

const formatNumber = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(digits)).toString();
};

const toPercent = (value: number) => `${formatNumber(value)}%`;

const getActiveStatus = (row: any) => {
  const status = safeLower(row?.status);
  if (!status) return true;
  return !["inactive", "withdrawn", "deleted", "archived", "suspended"].includes(status);
};

const isActiveRow = (row: any) => row?.active !== false && !row?.isDeleted && getActiveStatus(row);

const dateText = (value?: number | string | null) => {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();

  if (!Number.isFinite(time)) return "Not set";

  return new Intl.DateTimeFormat("en-GH", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
};

const makeEntryIdentity = (entry: AssessmentEntry) =>
  [
    entry.studentId,
    entry.classSubjectId,
    entry.assessmentStructureItemId,
    entry.academicPeriodId,
    entry.assessmentStructureId,
  ].join(":");

// ======================================================
// COMPONENT
// ======================================================

export default function Assessmententry() {
  const accountContext = useAccount() as any;

  const {
    accountId,
    loading: accountLoading,
    authenticated,
    user,
  } = accountContext;

  const accountEmail = safeLower(accountContext?.email || user?.email);

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = idOf(activeSchoolId || activeSchool?.id || settings?.schoolId);
  const branchId = idOf(activeBranchId || activeBranch?.id || settings?.branchId);
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("sheet");
  const [sessionStarted, setSessionStarted] = useState(false);

  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);

  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [applicabilities, setApplicabilities] = useState<AssessmentApplicability[]>([]);
  const [structures, setStructures] = useState<AssessmentStructure[]>([]);
  const [items, setItems] = useState<AssessmentStructureItem[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);
  const [gradings, setGradings] = useState<GradingSystem[]>([]);
  const [rules, setRules] = useState<GradeRule[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);

  const [teacherId, setTeacherId] = useState<number>(0);
  const [classSubjectId, setClassSubjectId] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [scores, setScores] = useState<ScoreMap>({});

  // ======================================================
  // TENANT / TEACHER FILTERS
  // ======================================================

  const sameTenant = (row: TenantRow) => {
    const rowAccountOk = !row.accountId || row.accountId === accountId;
    const rowSchoolOk = !row.schoolId || sameId(row.schoolId, schoolId);
    const rowBranchOk = !row.branchId || sameId(row.branchId, branchId);

    return Boolean(rowAccountOk && rowSchoolOk && rowBranchOk && !row.isDeleted);
  };

  const matchSignedInTeacher = (teacher: Teacher) => {
    const anyTeacher = teacher as any;
    const currentUserId =
      user?.id ||
      user?.localId ||
      user?.userId ||
      user?.teacherId ||
      user?.teacherLocalId ||
      accountContext?.userId ||
      accountContext?.localId;

    const currentTeacherId =
      user?.teacherId ||
      user?.teacherLocalId ||
      accountContext?.teacherId ||
      accountContext?.teacherLocalId;

    if (currentTeacherId && sameId(anyTeacher.id, currentTeacherId)) return true;

    if (currentUserId && sameId(anyTeacher.userId, currentUserId)) return true;
    if (currentUserId && sameId(anyTeacher.accountUserId, currentUserId)) return true;
    if (currentUserId && sameId(anyTeacher.userLocalId, currentUserId)) return true;
    if (currentUserId && sameId(anyTeacher.localUserId, currentUserId)) return true;

    if (accountEmail && safeLower(anyTeacher.email) === accountEmail) return true;
    if (accountEmail && safeLower(anyTeacher.workEmail) === accountEmail) return true;
    if (accountEmail && safeLower(anyTeacher.phone) === accountEmail) return true;

    return false;
  };

  const clearData = () => {
    setStudents([]);
    setClasses([]);
    setSubjects([]);
    setTeachers([]);
    setAcademicStructures([]);
    setPeriods([]);
    setOrganizations([]);
    setCurriculums([]);
    setPathways([]);
    setCurriculumSubjects([]);
    setClassSubjects([]);
    setApplicabilities([]);
    setStructures([]);
    setItems([]);
    setEntries([]);
    setGradings([]);
    setRules([]);
    setEnrollments([]);
    setScores({});
    setTeacherId(0);
    setClassSubjectId(0);
    setSessionStarted(false);
  };

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 4500);
  };

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        studentRows,
        classRows,
        subjectRows,
        teacherRows,
        academicStructureRows,
        periodRows,
        organizationRows,
        curriculumRows,
        pathwayRows,
        curriculumSubjectRows,
        classSubjectRows,
        applicabilityRows,
        structureRows,
        itemRows,
        entryRows,
        gradingRows,
        ruleRows,
        enrollmentRows,
      ] = await Promise.all([
        db.students.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.teachers.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.organizations.toArray(),
        db.curriculums.toArray(),
        db.curriculumPathways.toArray(),
        db.curriculumSubjects.toArray(),
        db.classSubjects.toArray(),
        db.assessmentApplicabilities.toArray(),
        db.assessmentStructures.toArray(),
        db.assessmentStructureItems.toArray(),
        db.assessmentEntries.toArray(),
        db.gradingSystems.toArray(),
        db.gradeRules.toArray(),
        db.studentEnrollments.toArray(),
      ]);

      const tenantTeachers = teacherRows.filter((row) => sameTenant(row as TenantRow));
      const signedTeacher =
        tenantTeachers.find(matchSignedInTeacher) ||
        tenantTeachers.find((row: any) => sameId(row.id, user?.teacherId || user?.teacherLocalId)) ||
        tenantTeachers[0];

      const signedTeacherId = idOf((signedTeacher as any)?.id);

      setTeacherId(signedTeacherId);

      const teacherClassSubjects = classSubjectRows
        .filter((row) => sameTenant(row as TenantRow))
        .filter(isActiveRow)
        .filter((row: any) => {
          if (!signedTeacherId) return false;
          return (
            sameId(row.teacherId, signedTeacherId) ||
            sameId(row.primaryTeacherId, signedTeacherId) ||
            sameId(row.assignedTeacherId, signedTeacherId)
          );
        });

      const classSubjectClassIds = new Set(teacherClassSubjects.map((row: any) => idOf(row.classId)));
      const classSubjectSubjectIds = new Set(teacherClassSubjects.map((row: any) => idOf(row.subjectId)));

      setTeachers(tenantTeachers);
      setStudents(
        studentRows
          .filter((row) => sameTenant(row as TenantRow))
          .filter(isActiveRow)
          .sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b)))
      );
      setClasses(
        classRows
          .filter((row) => sameTenant(row as TenantRow))
          .filter((row: any) => !classSubjectClassIds.size || classSubjectClassIds.has(idOf(row.id)))
      );
      setSubjects(
        subjectRows
          .filter((row) => sameTenant(row as TenantRow))
          .filter((row: any) => !classSubjectSubjectIds.size || classSubjectSubjectIds.has(idOf(row.id)))
      );
      setAcademicStructures(academicStructureRows.filter((row) => sameTenant(row as TenantRow)));
      setPeriods(periodRows.filter((row) => sameTenant(row as TenantRow)));
      setOrganizations(organizationRows.filter((row) => sameTenant(row as TenantRow)));
      setCurriculums(curriculumRows.filter((row) => sameTenant(row as TenantRow)));
      setPathways(pathwayRows.filter((row) => sameTenant(row as TenantRow)));
      setCurriculumSubjects(curriculumSubjectRows.filter((row) => sameTenant(row as TenantRow)));

      setClassSubjects(teacherClassSubjects);

      setApplicabilities(
        applicabilityRows
          .filter((row) => sameTenant(row as TenantRow))
          .filter(isActiveRow)
      );
      setStructures(
        structureRows
          .filter((row) => sameTenant(row as TenantRow))
          .filter(isActiveRow)
      );
      setItems(
        itemRows
          .filter((row) => sameTenant(row as TenantRow))
          .filter(isActiveRow)
      );
      setEntries(entryRows.filter((row) => sameTenant(row as TenantRow)));
      setGradings(
        gradingRows
          .filter((row) => sameTenant(row as TenantRow))
          .filter(isActiveRow)
      );
      setRules(
        ruleRows
          .filter((row) => sameTenant(row as TenantRow))
          .filter(isActiveRow)
      );
      setEnrollments(enrollmentRows.filter((row) => sameTenant(row as TenantRow)));
    } catch (error) {
      console.error("Failed to load teacher assessment entries:", error);
      clearData();
      showToast("error", "Failed to load assessment data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || contextLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    contextLoading,
    settingsLoading,
  ]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const classMap = useMemo(() => new Map(classes.map((row: any) => [idOf(row.id), row])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((row: any) => [idOf(row.id), row])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((row: any) => [idOf(row.id), row])), [teachers]);
  const structureMap = useMemo(
    () => new Map(academicStructures.map((row: any) => [idOf(row.id), row])),
    [academicStructures]
  );
  const periodMap = useMemo(() => new Map(periods.map((row: any) => [idOf(row.id), row])), [periods]);
  const orgMap = useMemo(() => new Map(organizations.map((row: any) => [idOf(row.id), row])), [organizations]);
  const curriculumSubjectMap = useMemo(
    () => new Map(curriculumSubjects.map((row: any) => [idOf(row.id), row])),
    [curriculumSubjects]
  );
  const curriculumMap = useMemo(() => new Map(curriculums.map((row: any) => [idOf(row.id), row])), [curriculums]);
  const pathwayMap = useMemo(() => new Map(pathways.map((row: any) => [idOf(row.id), row])), [pathways]);

  // ======================================================
  // CLASS SUBJECT OPTIONS
  // ======================================================

  const classSubjectOptions = useMemo<ClassSubjectOption[]>(() => {
    return classSubjects
      .map((row: any) => {
        const id = idOf(row.id);
        const classRow = classMap.get(idOf(row.classId));
        const subject = subjectMap.get(idOf(row.subjectId));
        const teacher = row.teacherId ? teacherMap.get(idOf(row.teacherId)) : teacherMap.get(teacherId);
        const academicStructure = structureMap.get(idOf(row.academicStructureId));
        const period = row.academicPeriodId ? periodMap.get(idOf(row.academicPeriodId)) : undefined;
        const curriculumSubject = curriculumSubjectMap.get(idOf(row.curriculumSubjectId));
        const curriculum = curriculumSubject ? curriculumMap.get(idOf((curriculumSubject as any).curriculumId)) : undefined;
        const pathway = (curriculumSubject as any)?.pathwayId
          ? pathwayMap.get(idOf((curriculumSubject as any).pathwayId))
          : undefined;

        const subjectName = row.name || (subject as any)?.name || "Unknown Subject";
        const subjectCode = row.code || (subject as any)?.code;
        const className = (classRow as any)?.name || "Unknown Class";
        const academicPeriodName = (period as any)?.name || "All Periods";
        const teacherName = fullNameOf(teacher);

        return {
          id,
          row,
          className,
          subjectName,
          subjectCode,
          teacherName,
          academicStructureName: (academicStructure as any)?.name || "Unknown academic structure",
          academicPeriodName,
          curriculumName: (curriculum as any)?.name || "No curriculum",
          pathwayName: (pathway as any)?.name || "No pathway",
          organizationId: idOf((curriculumSubject as any)?.organizationId) || undefined,
          display: `${className} • ${subjectName}${subjectCode ? ` (${subjectCode})` : ""} • ${academicPeriodName}`,
        };
      })
      .filter((option) => option.id > 0)
      .sort((a, b) => a.display.localeCompare(b.display));
  }, [
    classSubjects,
    classMap,
    subjectMap,
    teacherMap,
    teacherId,
    structureMap,
    periodMap,
    curriculumSubjectMap,
    curriculumMap,
    pathwayMap,
  ]);

  const selectedOption = useMemo(() => {
    return classSubjectOptions.find((option) => option.id === classSubjectId);
  }, [classSubjectOptions, classSubjectId]);

  const currentClassSubject = selectedOption?.row;

  // ======================================================
  // APPLICABILITY / STRUCTURE / GRADING
  // ======================================================

  const applicability = useMemo(() => {
    if (!classSubjectId) return undefined;

    const current: any = currentClassSubject;

    return applicabilities.find((row: any) => {
      if (row.classSubjectId && sameId(row.classSubjectId, classSubjectId)) return true;

      const classOk = !row.classId || sameId(row.classId, current?.classId);
      const subjectOk = !row.subjectId || sameId(row.subjectId, current?.subjectId);
      const periodOk = !row.academicPeriodId || sameId(row.academicPeriodId, current?.academicPeriodId);
      const structureOk =
        !row.academicStructureId || sameId(row.academicStructureId, current?.academicStructureId);

      return classOk && subjectOk && periodOk && structureOk;
    });
  }, [applicabilities, classSubjectId, currentClassSubject]);

  const assessmentStructure = useMemo(() => {
    if (!applicability?.assessmentStructureId) return undefined;
    return structures.find((row: any) => sameId(row.id, applicability.assessmentStructureId));
  }, [structures, applicability]);

  const structureItems = useMemo(() => {
    if (!applicability?.assessmentStructureId) return [];

    return items
      .filter((row: any) => sameId(row.assessmentStructureId, applicability.assessmentStructureId))
      .filter(isActiveRow)
      .sort((a: any, b: any) => Number(a.order || a.position || 0) - Number(b.order || b.position || 0));
  }, [items, applicability]);

  const gradingSystem = useMemo(() => {
    if (!applicability?.gradingSystemId) return undefined;
    return gradings.find((row: any) => sameId(row.id, applicability.gradingSystemId));
  }, [gradings, applicability]);

  const gradeRules = useMemo(() => {
    if (!gradingSystem?.id) return [];

    return rules
      .filter((row: any) => sameId(row.gradingSystemId, gradingSystem.id))
      .filter(isActiveRow)
      .sort((a: any, b: any) => Number(b.minScore || 0) - Number(a.minScore || 0));
  }, [rules, gradingSystem]);

  const organizationName = useMemo(() => {
    const orgId = idOf((applicability as any)?.organizationId || selectedOption?.organizationId);
    if (!orgId) return "No organization";
    return (orgMap.get(orgId) as any)?.name || "Unknown organization";
  }, [applicability, selectedOption, orgMap]);

  // ======================================================
  // STUDENTS FOR SELECTED CLASS SUBJECT
  // ======================================================

  const studentRows = useMemo<StudentRow[]>(() => {
    if (!currentClassSubject) return [];

    const current: any = currentClassSubject;
    const periodId = idOf(current.academicPeriodId);

    return students
      .map((student: any) => {
        const enrollment = enrollments.find((row: any) => {
          if (!sameId(row.studentId, student.id)) return false;
          if (!sameId(row.classId, current.classId)) return false;

          if (current.academicStructureId && row.academicStructureId) {
            if (!sameId(row.academicStructureId, current.academicStructureId)) return false;
          }

          if (periodId && row.academicPeriodId) {
            if (!sameId(row.academicPeriodId, periodId)) return false;
          }

          return isActiveRow(row) || safeLower(row.status) === "active";
        });

        return enrollment ? { student, enrollment } : undefined;
      })
      .filter(Boolean) as StudentRow[];
  }, [students, enrollments, currentClassSubject]);

  const filteredStudentRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return studentRows;

    return studentRows.filter(({ student }: any) => {
      return `${fullNameOf(student)} ${student.admissionNumber || ""} ${student.indexNumber || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [studentRows, search]);

  // ======================================================
  // SCORE HYDRATION
  // ======================================================

  useEffect(() => {
    if (!currentClassSubject || !applicability) {
      setScores({});
      setSessionStarted(false);
      return;
    }

    const current: any = currentClassSubject;
    const academicPeriodId = idOf(current.academicPeriodId);
    const assessmentStructureId = idOf(applicability.assessmentStructureId);

    const nextScores: ScoreMap = {};

    entries
      .filter((entry: any) => {
        if (!sameId(entry.classSubjectId, current.id)) return false;
        if (!sameId(entry.classId, current.classId)) return false;
        if (!sameId(entry.subjectId, current.subjectId)) return false;

        if (current.academicStructureId && entry.academicStructureId) {
          if (!sameId(entry.academicStructureId, current.academicStructureId)) return false;
        }

        if (academicPeriodId && entry.academicPeriodId) {
          if (!sameId(entry.academicPeriodId, academicPeriodId)) return false;
        }

        if (assessmentStructureId && entry.assessmentStructureId) {
          if (!sameId(entry.assessmentStructureId, assessmentStructureId)) return false;
        }

        if (applicability.gradingSystemId && entry.gradingSystemId) {
          if (!sameId(entry.gradingSystemId, applicability.gradingSystemId)) return false;
        }

        return true;
      })
      .forEach((entry: any) => {
        nextScores[scoreKey(idOf(entry.studentId), idOf(entry.assessmentStructureItemId))] = Number(entry.score);
      });

    setScores(nextScores);
    setSessionStarted(false);
  }, [entries, currentClassSubject, applicability]);

  // ======================================================
  // COMPUTED RESULTS
  // ======================================================

  const computedResults = useMemo<ResultMap>(() => {
    const result: ResultMap = {};

    for (const { student } of filteredStudentRows as any[]) {
      let rawTotal = 0;
      let weightedTotal = 0;
      let maxTotal = 0;
      let totalWeight = 0;

      for (const item of structureItems as any[]) {
        const value = scores[scoreKey(idOf(student.id), idOf(item.id))];
        const score = value === "" || value == null ? 0 : Number(value);
        const maxScore = Math.max(1, Number(item.maxScore || 100));
        const weight = Number(item.weight || 0);

        rawTotal += score;
        maxTotal += maxScore;

        if (weight > 0) {
          totalWeight += weight;
          weightedTotal += (score / maxScore) * weight;
        }
      }

      const percentage = structureItems.length
        ? totalWeight > 0
          ? Number(weightedTotal.toFixed(2))
          : maxTotal
            ? Number(((rawTotal / maxTotal) * 100).toFixed(2))
            : 0
        : 0;

      const matchedRule = (gradeRules as any[]).find((rule) => {
        return percentage >= Number(rule.minScore) && percentage <= Number(rule.maxScore);
      });

      result[String(student.id)] = {
        rawTotal: Number(rawTotal.toFixed(2)),
        weightedTotal: Number(weightedTotal.toFixed(2)),
        percentage,
        grade: matchedRule?.grade,
        remark: matchedRule?.remark,
        gpa: matchedRule?.gpa,
      };
    }

    return result;
  }, [filteredStudentRows, structureItems, scores, gradeRules]);

  const completionStats = useMemo(() => {
    const visibleStudentIds = new Set(filteredStudentRows.map(({ student }: any) => String(student.id)));
    const visibleItemIds = new Set((structureItems as any[]).map((item) => String(item.id)));

    const expected = filteredStudentRows.length * structureItems.length;

    const entered = Object.entries(scores).filter(([key, value]) => {
      const [studentId, itemId] = key.split("-");
      return (
        visibleStudentIds.has(studentId) &&
        visibleItemIds.has(itemId) &&
        value !== "" &&
        value !== undefined &&
        value !== null
      );
    }).length;

    const completion = expected ? Math.round((entered / expected) * 100) : 0;

    return { expected, entered, completion };
  }, [filteredStudentRows, structureItems, scores]);

  const classAverage = useMemo(() => {
    const values = Object.values(computedResults).map((row) => row.percentage);
    if (!values.length) return 0;
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  }, [computedResults]);

  const topStudent = useMemo(() => {
    return filteredStudentRows
      .map(({ student }: any) => ({
        student,
        result: computedResults[String(student.id)],
      }))
      .sort((a, b) => Number(b.result?.percentage || 0) - Number(a.result?.percentage || 0))[0];
  }, [filteredStudentRows, computedResults]);

  // ======================================================
  // ACTIONS
  // ======================================================

  const updateScore = (studentId: number, item: AssessmentStructureItem, value: string) => {
    const itemAny: any = item;

    if (value === "") {
      setScores((prev) => ({ ...prev, [scoreKey(studentId, idOf(itemAny.id))]: "" }));
      return;
    }

    const num = Number(value);
    if (Number.isNaN(num)) return;

    const maxScore = Number(itemAny.maxScore || 100);
    const sanitized = Math.max(0, Math.min(num, maxScore));

    setScores((prev) => ({ ...prev, [scoreKey(studentId, idOf(itemAny.id))]: sanitized }));
  };

  const fillEmptyWithZero = () => {
    if (!sessionStarted) {
      showToast("info", "Start the session first.");
      return;
    }

    setScores((prev) => {
      const next = { ...prev };

      for (const { student } of filteredStudentRows as any[]) {
        for (const item of structureItems as any[]) {
          const key = scoreKey(idOf(student.id), idOf(item.id));
          if (next[key] === "" || next[key] === undefined || next[key] === null) {
            next[key] = 0;
          }
        }
      }

      return next;
    });

    showToast("success", "Empty visible scores filled with zero.");
  };

  const startSession = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a branch first.");
      return;
    }

    if (!teacherId) {
      showToast("error", "Could not identify the signed-in teacher in this branch.");
      return;
    }

    if (!currentClassSubject) {
      showToast("error", "Select one of your class subjects first.");
      return;
    }

    if (!applicability) {
      showToast("error", "No assessment applicability configured for this class subject.");
      return;
    }

    if (!structureItems.length) {
      showToast("error", "The selected assessment structure has no active assessment items.");
      return;
    }

    if (!filteredStudentRows.length) {
      showToast("error", "No active student enrollment found for this class subject and period.");
      return;
    }

    setSessionStarted(true);
    showToast("success", "Score entry session started.");
  };

  const saveEntries = async () => {
    if (!sessionStarted) {
      showToast("info", "Start the session first.");
      return;
    }

    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a branch first.");
      return;
    }

    if (!teacherId) {
      showToast("error", "Could not identify the signed-in teacher.");
      return;
    }

    if (!currentClassSubject || !applicability) {
      showToast("error", "Select a valid class subject with assessment applicability.");
      return;
    }

    try {
      setSaving(true);

      const current: any = currentClassSubject;
      const academicPeriodId = idOf(current.academicPeriodId);
      const assessmentStructureId = idOf(applicability.assessmentStructureId);
      const gradingSystemId = idOf(applicability.gradingSystemId);
      const organizationId = idOf((applicability as any).organizationId || selectedOption?.organizationId);

      const visibleStudentIds = new Set(filteredStudentRows.map(({ student }: any) => idOf(student.id)));

      const existingForScope = entries.filter((entry: any) => {
        if (!visibleStudentIds.has(idOf(entry.studentId))) return false;
        if (!sameId(entry.classSubjectId, current.id)) return false;
        if (!sameId(entry.classId, current.classId)) return false;
        if (!sameId(entry.subjectId, current.subjectId)) return false;

        if (current.academicStructureId && entry.academicStructureId) {
          if (!sameId(entry.academicStructureId, current.academicStructureId)) return false;
        }

        if (academicPeriodId && entry.academicPeriodId) {
          if (!sameId(entry.academicPeriodId, academicPeriodId)) return false;
        }

        if (assessmentStructureId && entry.assessmentStructureId) {
          if (!sameId(entry.assessmentStructureId, assessmentStructureId)) return false;
        }

        return true;
      });

      const existingByIdentity = new Map(existingForScope.map((entry) => [makeEntryIdentity(entry), entry]));

      const upserts: AssessmentEntry[] = [];

      for (const { student } of filteredStudentRows as any[]) {
        const result = computedResults[String(student.id)];

        for (const item of structureItems as any[]) {
          const key = scoreKey(idOf(student.id), idOf(item.id));
          const score = scores[key];

          if (score === "" || score == null) continue;

          const identitySource = {
            studentId: idOf(student.id),
            classSubjectId: idOf(current.id),
            assessmentStructureItemId: idOf(item.id),
            academicPeriodId,
            assessmentStructureId,
          } as AssessmentEntry;

          const existing = existingByIdentity.get(makeEntryIdentity(identitySource));

          const payload = makeAssessmentEntryPayload(
            {
              id: (existing as any)?.id,
              accountId,
              schoolId,
              branchId,
              teacherId,
              classSubjectId: idOf(current.id),
              organizationId,
              academicStructureId: idOf(current.academicStructureId),
              academicPeriodId,
              gradingSystemId,
              assessmentStructureId,
              assessmentStructureItemId: idOf(item.id),
              studentId: idOf(student.id),
              classId: idOf(current.classId),
              subjectId: idOf(current.subjectId),
              score: Number(score),
              grade: result?.grade,
              remark: result?.remark,
              published: (existing as any)?.published ?? false,
              locked: (existing as any)?.locked ?? false,
              active: true,
            } as Partial<AssessmentEntry>,
            existing as Partial<AssessmentEntry> | undefined
          );

          upserts.push(payload);
        }
      }

      if (!upserts.length) {
        showToast("info", "No scores entered yet.");
        return;
      }

      await db.transaction("rw", db.assessmentEntries, async () => {
        for (const entry of upserts as any[]) {
          if (entry.id) {
            await db.assessmentEntries.put(entry);
          } else {
            const { id, ...withoutId } = entry;
            await db.assessmentEntries.add(withoutId as AssessmentEntry);
          }
        }
      });

      await load();
      setSessionStarted(true);
      showToast("success", `${upserts.length} score record(s) saved successfully.`);
    } catch (error) {
      console.error("Failed to save teacher assessment entries:", error);
      showToast("error", "Failed to save scores.");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="tae-page" style={{ "--tae-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="tae-state-card">
          <div className="tae-spinner" />
          <h2>Opening teacher assessment entry...</h2>
          <p>Checking your account, branch, assigned class subjects and assessment records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="tae-page" style={{ "--tae-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="tae-state-card">
          <h2>Sign in required</h2>
          <p>You must sign in before entering assessment scores.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="tae-page" style={{ "--tae-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="tae-state-card">
          <h2>Select a branch first</h2>
          <p>Teacher assessment entries belong to one active school branch.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="tae-page" style={{ "--tae-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`tae-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">
            ✕
          </button>
        </section>
      )}

      <section className="tae-hero">
        <div className="tae-hero-left">
          <div className="tae-hero-icon">📝</div>
          <div className="tae-title-wrap">
            <p>Teacher Score Entry</p>
            <h2>Assessment Entry</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <div className="tae-hero-actions">
          <div className="tae-view-switch">
            <button
              type="button"
              className={viewMode === "sheet" ? "active" : ""}
              onClick={() => setViewMode("sheet")}
            >
              Sheet
            </button>
            <button
              type="button"
              className={viewMode === "cards" ? "active" : ""}
              onClick={() => setViewMode("cards")}
            >
              Cards
            </button>
            <button
              type="button"
              className={viewMode === "summary" ? "active" : ""}
              onClick={() => setViewMode("summary")}
            >
              Summary
            </button>
          </div>

          <button type="button" className="tae-ghost-btn" onClick={load}>
            Refresh
          </button>
          <button type="button" className="tae-primary-btn" onClick={startSession}>
            {sessionStarted ? "Session Active" : "Start Session"}
          </button>
          <button type="button" className="tae-primary-btn" onClick={saveEntries} disabled={!sessionStarted || saving}>
            {saving ? "Saving..." : "Save Scores"}
          </button>
        </div>
      </section>

      <section className="tae-filter-card">
        <label>
          <span>Your class subject</span>
          <select
            value={classSubjectId}
            onChange={(event) => {
              setClassSubjectId(Number(event.target.value));
              setSessionStarted(false);
            }}
          >
            <option value={0}>Select one of your assigned class subjects</option>
            {classSubjectOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.display}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Search learner</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search student or admission number..."
          />
        </label>
      </section>

      {selectedOption && (
        <section className="tae-context-card">
          <div className="tae-card-top">
            <div className="tae-context-main">
              <div className="tae-context-icon">📖</div>
              <div>
                <h3>{selectedOption.subjectName}</h3>
                <p>
                  {selectedOption.className} · {selectedOption.academicStructureName} · {selectedOption.academicPeriodName}
                </p>
                <span>
                  {selectedOption.curriculumName} · {selectedOption.pathwayName} · Teacher: {selectedOption.teacherName}
                </span>
              </div>
            </div>
          </div>

          <div className="tae-chip-row">
            {teacherId ? <Chip tone="green">Teacher Identified</Chip> : <Chip tone="red">Teacher Not Found</Chip>}
            {applicability ? <Chip tone="green">Applicability Ready</Chip> : <Chip tone="red">No Applicability</Chip>}
            {assessmentStructure && <Chip tone="blue">{(assessmentStructure as any).name}</Chip>}
            {gradingSystem && <Chip tone="purple">{(gradingSystem as any).name}</Chip>}
            <Chip tone="gray">{organizationName}</Chip>
          </div>
        </section>
      )}

      {classSubjectId > 0 && !applicability && (
        <section className="tae-warning-card red">
          No active assessment applicability is configured for this class subject. Ask the school admin to configure assessment applicability first.
        </section>
      )}

      {applicability && !structureItems.length && (
        <section className="tae-warning-card orange">
          The selected assessment structure has no active assessment items.
        </section>
      )}

      {!teacherId && (
        <section className="tae-warning-card red">
          Your signed-in user could not be matched to a teacher record in this branch. Make sure the teacher record has the correct user ID or email.
        </section>
      )}

      <section className="tae-summary-grid" aria-label="Score entry summary">
        <SummaryCard label="My Class Subjects" value={classSubjectOptions.length} icon="📚" />
        <SummaryCard label="Learners" value={filteredStudentRows.length} icon="🧑‍🎓" />
        <SummaryCard label="Assessment Items" value={structureItems.length} icon="🧩" />
        <SummaryCard label="Entered" value={completionStats.entered} icon="✍️" />
        <SummaryCard label="Completion" value={`${completionStats.completion}%`} icon="✅" />
        <SummaryCard label="Class Average" value={toPercent(classAverage)} icon="📊" />
      </section>

      {!classSubjectOptions.length && (
        <section className="tae-empty-card">
          <div className="tae-empty-icon">📖</div>
          <h3>No assigned class subjects found</h3>
          <p>
            This teacher account has no class subjects assigned in this branch yet. Ask the admin to assign classes and subjects to this teacher.
          </p>
        </section>
      )}

      {!sessionStarted && classSubjectOptions.length > 0 && (
        <section className="tae-empty-card compact">
          <div className="tae-empty-icon">▶️</div>
          <h3>Start a teacher score entry session</h3>
          <p>Select one of your assigned class subjects, confirm applicability, then start the session to enter scores.</p>
        </section>
      )}

      {sessionStarted && viewMode === "summary" && (
        <section className="tae-analysis-grid">
          <article className="tae-analysis-card">
            <span>Class Average</span>
            <strong>{toPercent(classAverage)}</strong>
            <p>Average computed from visible learners and current score entries.</p>
          </article>

          <article className="tae-analysis-card">
            <span>Top Learner</span>
            <strong>{topStudent ? fullNameOf(topStudent.student) : "None"}</strong>
            <p>{topStudent?.result ? `${toPercent(topStudent.result.percentage)} · ${topStudent.result.grade || "No grade"}` : "No scores yet."}</p>
          </article>

          <article className="tae-analysis-card">
            <span>Completion</span>
            <strong>{completionStats.completion}%</strong>
            <p>{completionStats.entered} of {completionStats.expected} expected score cells completed.</p>
          </article>

          <article className="tae-analysis-card">
            <span>Last Saved Context</span>
            <strong>{dateText(Date.now())}</strong>
            <p>Scores save offline first and sync when your app sync engine runs.</p>
          </article>
        </section>
      )}

      {sessionStarted && viewMode === "cards" && (
        <section className="tae-student-card-grid">
          {filteredStudentRows.map(({ student }: any) => {
            const result = computedResults[String(student.id)];

            return (
              <article key={student.id} className="tae-student-card">
                <div className="tae-student-card-head">
                  <div>
                    <h3>{fullNameOf(student)}</h3>
                    <p>{student.admissionNumber || student.indexNumber || "No admission number"}</p>
                  </div>
                  <Chip tone={result?.grade ? "green" : "gray"}>{result?.grade || "No Grade"}</Chip>
                </div>

                <div className="tae-card-score-grid">
                  {(structureItems as any[]).map((item) => (
                    <label key={item.id}>
                      <span>{item.name}</span>
                      <input
                        type="number"
                        min={0}
                        max={item.maxScore || 100}
                        value={scores[scoreKey(idOf(student.id), idOf(item.id))] ?? ""}
                        onChange={(event) => updateScore(idOf(student.id), item, event.target.value)}
                      />
                      <small>Max {item.maxScore || 100} · Weight {item.weight || 0}%</small>
                    </label>
                  ))}
                </div>

                <div className="tae-student-result">
                  <span>Total: {formatNumber(result?.rawTotal || 0)}</span>
                  <span>Weighted: {toPercent(result?.percentage || 0)}</span>
                  <span>{result?.remark || "No remark yet"}</span>
                </div>
              </article>
            );
          })}

          {!filteredStudentRows.length && <Empty text="No active learners found for this class subject and period." />}
        </section>
      )}

      {sessionStarted && viewMode === "sheet" && (
        <section className="tae-score-shell">
          <div className="tae-score-head">
            <div>
              <h3>Teacher Score Sheet</h3>
              <p>
                Scores are saved against your teacher ID, class subject, assessment item, student, class, subject and academic period.
              </p>
            </div>
            <div className="tae-score-actions">
              <Chip tone={completionStats.completion === 100 ? "green" : "orange"}>{completionStats.completion}% complete</Chip>
              <button type="button" onClick={fillEmptyWithZero}>
                Fill blanks with 0
              </button>
            </div>
          </div>

          <div className="tae-table-scroll" aria-label="Scrollable teacher score entry table">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  {(structureItems as any[]).map((item) => (
                    <th key={item.id}>
                      {item.name}
                      <span>Max {item.maxScore || 100} · {item.weight || 0}%</span>
                    </th>
                  ))}
                  <th>Raw Total</th>
                  <th>% / Weighted</th>
                  <th>Grade</th>
                </tr>
              </thead>

              <tbody>
                {filteredStudentRows.map(({ student }: any) => {
                  const result = computedResults[String(student.id)];

                  return (
                    <tr key={student.id}>
                      <td className="tae-student-cell">
                        <strong>{fullNameOf(student)}</strong>
                        <span>{student.admissionNumber || student.indexNumber || "No admission number"}</span>
                      </td>

                      {(structureItems as any[]).map((item) => (
                        <td key={item.id}>
                          <input
                            className="tae-score-input"
                            type="number"
                            min={0}
                            max={item.maxScore || 100}
                            value={scores[scoreKey(idOf(student.id), idOf(item.id))] ?? ""}
                            onChange={(event) => updateScore(idOf(student.id), item, event.target.value)}
                          />
                        </td>
                      ))}

                      <td className="tae-center strong">{formatNumber(result?.rawTotal || 0)}</td>
                      <td className="tae-center strong">{toPercent(result?.percentage || 0)}</td>
                      <td className="tae-center">
                        <Chip tone={result?.grade ? "green" : "gray"}>{result?.grade || "-"}</Chip>
                        {result?.remark && <span className="tae-remark">{result.remark}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!filteredStudentRows.length && (
              <div className="tae-empty-table">No active learners found for this class subject and period.</div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="tae-summary-card">
      <div className="tae-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`tae-chip ${tone}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="tae-empty-inline">{text}</div>;
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes taeSpin {
  to { transform: rotate(360deg); }
}

.tae-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--tae-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}

.tae-page *,
.tae-page *::before,
.tae-page *::after {
  box-sizing: border-box;
}

.tae-page button,
.tae-page input,
.tae-page select,
.tae-page textarea {
  font: inherit;
  max-width: 100%;
}

.tae-page input,
.tae-page select {
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

.tae-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(520px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}

.tae-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.tae-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.tae-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--tae-primary) 18%, transparent);
  border-top-color: var(--tae-primary);
  animation: taeSpin .8s linear infinite;
}

.tae-toast {
  position: sticky;
  top: 8px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 850;
  box-shadow: 0 18px 40px rgba(15, 23, 42, .12);
}

.tae-toast.success {
  background: #dcfce7;
  color: #166534;
}

.tae-toast.error {
  background: #fee2e2;
  color: #991b1b;
}

.tae-toast.info {
  background: #dbeafe;
  color: #1d4ed8;
}

.tae-toast button {
  border: 0;
  background: transparent;
  color: currentColor;
  font-weight: 1000;
  cursor: pointer;
}

.tae-primary-btn {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 16px;
  background: var(--tae-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.tae-primary-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.tae-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  color: #fff;
  background:
    radial-gradient(circle at 20% 10%, rgba(255, 255, 255, .18), transparent 20rem),
    linear-gradient(135deg, var(--tae-primary), #0f172a 76%);
  box-shadow: 0 22px 55px rgba(15, 23, 42, .16);
  overflow: hidden;
}

.tae-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.tae-hero-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: rgba(255, 255, 255, .16);
  border: 1px solid rgba(255, 255, 255, .2);
  color: #fff;
  font-size: 22px;
}

.tae-title-wrap {
  min-width: 0;
}

.tae-title-wrap p,
.tae-title-wrap h2,
.tae-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tae-title-wrap p {
  margin: 0 0 2px;
  color: rgba(255, 255, 255, .82);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.tae-title-wrap h2 {
  margin: 0;
  font-size: clamp(22px, 6vw, 34px);
  font-weight: 1000;
  letter-spacing: -.07em;
  line-height: 1;
}

.tae-title-wrap span {
  margin-top: 4px;
  color: rgba(255, 255, 255, .82);
  font-size: 12px;
  font-weight: 750;
}

.tae-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.tae-view-switch {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .12);
  border: 1px solid rgba(255, 255, 255, .2);
}

.tae-view-switch button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: transparent;
  color: rgba(255, 255, 255, .72);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.tae-view-switch button.active {
  background: #fff;
  color: #0f172a;
}

.tae-ghost-btn {
  min-height: 40px;
  border: 1px solid rgba(255, 255, 255, .24);
  border-radius: 999px;
  padding: 0 13px;
  background: rgba(255, 255, 255, .13);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.tae-filter-card,
.tae-context-card,
.tae-warning-card,
.tae-score-shell,
.tae-empty-card,
.tae-analysis-card,
.tae-student-card {
  min-width: 0;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, .055);
  overflow: hidden;
}

.tae-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
}

.tae-filter-card label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.tae-filter-card label span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.tae-context-card,
.tae-warning-card,
.tae-score-shell,
.tae-empty-card {
  margin-top: 10px;
  padding: 13px;
}

.tae-warning-card {
  color: #7f1d1d;
  font-size: 13px;
  font-weight: 850;
  line-height: 1.55;
}

.tae-warning-card.red {
  border-color: rgba(239, 68, 68, .18);
  background: rgba(239, 68, 68, .06);
}

.tae-warning-card.orange {
  color: #92400e;
  border-color: rgba(245, 158, 11, .18);
  background: rgba(245, 158, 11, .07);
}

.tae-card-top,
.tae-context-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.tae-context-main {
  flex: 1 1 auto;
}

.tae-context-main > div:last-child {
  min-width: 0;
}

.tae-context-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 17px;
  background: color-mix(in srgb, var(--tae-primary) 12%, #fff);
}

.tae-context-main h3,
.tae-context-main p,
.tae-context-main span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tae-context-main h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.035em;
}

.tae-context-main p,
.tae-context-main span {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.tae-chip-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.tae-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tae-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.tae-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.tae-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.tae-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.tae-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.tae-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.tae-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.tae-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .04);
  overflow: hidden;
}

.tae-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--tae-primary) 12%, #fff);
}

.tae-summary-card div:last-child {
  min-width: 0;
}

.tae-summary-card strong,
.tae-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tae-summary-card strong {
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.tae-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.tae-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 210px;
  text-align: center;
  border-style: dashed;
}

.tae-empty-card.compact {
  min-height: 170px;
}

.tae-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--tae-primary) 12%, #fff);
  font-size: 28px;
}

.tae-empty-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.tae-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.tae-score-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.tae-score-head div {
  min-width: 0;
}

.tae-score-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.tae-score-head p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.tae-score-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  flex-wrap: wrap;
}

.tae-score-actions button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--tae-primary) 10%, #fff);
  color: var(--tae-primary);
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
}

.tae-table-scroll {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, .18);
}

.tae-table-scroll table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  background: #fff;
}

.tae-table-scroll th,
.tae-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .16);
  vertical-align: middle;
}

.tae-table-scroll th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  color: #334155;
  text-align: center;
  font-size: 12px;
  font-weight: 1000;
  white-space: nowrap;
}

.tae-table-scroll th:first-child,
.tae-table-scroll td:first-child {
  position: sticky;
  left: 0;
  z-index: 2;
  background: #fff;
  text-align: left;
  min-width: 220px;
  max-width: 260px;
}

.tae-table-scroll th:first-child {
  z-index: 3;
  background: #f8fafc;
}

.tae-table-scroll th span,
.tae-student-cell span,
.tae-remark {
  display: block;
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.tae-student-cell strong {
  display: block;
  font-size: 13px;
  font-weight: 950;
}

.tae-score-input {
  width: 84px !important;
  min-height: 38px !important;
  border-radius: 12px !important;
  padding: 0 8px !important;
  text-align: center;
  font-weight: 900 !important;
}

.tae-center {
  text-align: center;
}

.tae-center.strong {
  font-weight: 950;
}

.tae-empty-table,
.tae-empty-inline {
  padding: 22px;
  text-align: center;
  color: var(--muted, #64748b);
  font-weight: 850;
}

.tae-student-card-grid,
.tae-analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.tae-student-card {
  padding: 13px;
}

.tae-student-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.tae-student-card-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 1000;
}

.tae-student-card-head p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
}

.tae-card-score-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.tae-card-score-grid label {
  display: grid;
  gap: 5px;
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
}

.tae-card-score-grid label span {
  font-size: 12px;
  font-weight: 950;
}

.tae-card-score-grid label small {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 800;
}

.tae-student-result {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}

.tae-student-result span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border-radius: 999px;
  padding: 0 9px;
  background: #f8fafc;
  color: #475569;
  font-size: 11px;
  font-weight: 900;
}

.tae-analysis-card {
  padding: 14px;
}

.tae-analysis-card span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.tae-analysis-card strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(22px, 7vw, 32px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
}

.tae-analysis-card p {
  margin: 8px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

@media (min-width: 680px) {
  .tae-page {
    padding: 12px;
  }

  .tae-filter-card {
    grid-template-columns: minmax(0, 1.3fr) minmax(0, .7fr);
  }

  .tae-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tae-student-card-grid,
  .tae-analysis-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tae-card-score-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .tae-page {
    padding: 16px;
  }

  .tae-summary-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .tae-student-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tae-analysis-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .tae-page {
    padding: 6px;
  }

  .tae-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .tae-hero-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .tae-view-switch,
  .tae-ghost-btn,
  .tae-primary-btn {
    width: 100%;
  }

  .tae-view-switch {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tae-summary-grid {
    gap: 6px;
  }

  .tae-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .tae-context-card,
  .tae-warning-card,
  .tae-score-shell,
  .tae-empty-card,
  .tae-student-card,
  .tae-analysis-card {
    border-radius: 20px;
    padding: 11px;
  }

  .tae-score-head {
    flex-direction: column;
  }

  .tae-score-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .tae-table-scroll th:first-child,
  .tae-table-scroll td:first-child {
    min-width: 180px;
    max-width: 200px;
  }

  .tae-score-input {
    width: 74px !important;
  }
}
`;
