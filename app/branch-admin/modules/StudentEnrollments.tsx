"use client";

/**
 * app/branch-admin/modules/StudentEnrollment.tsx
 * Eleeveon Student Enrollments V2.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this branch-admin module from accidentally using stale school/branch
 *   context left behind by another role or portal
 * - all create/update/media/query operations now use the resolved workspace
 *   schoolId and branchId
 *
 * Golden-standard upgrade:
 * - removed the large hero/header block from inside the module.
 * - removed the always-visible summary cards from the main screen.
 * - uses the compact Students.tsx pattern: search + inline add + slider filter + More.
 * - filters, table view, analytics, refresh, and row actions live in sheets.
 * - card view uses compact row cards instead of large full cards.
 * - table header shows the filtered count, for example Enrollments (12).
 * - styling stays tied to ba-* theme variables for dark mode and local density support.
 *
 * Data behavior intentionally preserved and upgraded:
 * - createLocal(...) for enrollment creation.
 * - updateLocal(...) for edits, status changes, and student currentClassId sync.
 * - softDeleteLocal(...) for local soft delete.
 * - listActiveLocal(...) for active student/class/structure/period lookups.
 * - reads and writes stay scoped by accountId + schoolId + branchId.
 *
 * Important model rules:
 * - StudentEnrollment has NO active field.
 * - Status uses promoted, NOT transferred.
 * - academicStructureId, academicPeriodId, and startDate are required.
 * - Duplicate enrollment is blocked for the same student/class/structure/period.
 * - More than one active enrollment in the same academic period is blocked.
 * - Student currentClassId can be synced when an enrollment is active.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  db,
  type AcademicPeriod,
  type AcademicStructure,
  type Class,
  type Student,
  type StudentEnrollment,
} from "../../lib/db";

import { createLocal, updateLocal, softDeleteLocal, listActiveLocal } from "../../lib/sync/syncUtils";

type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type EnrollmentStatus = "active" | "completed" | "promoted" | "withdrawn";

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  teacherLocalId?: number | string | null;
  studentLocalId?: number | string | null;
  parentLocalId?: number | string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

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

function readStoredActiveMembership() {
  return safeJsonRead<Record<string, any>>("activeMembership");
}

function firstLocalId(...values: unknown[]) {
  for (const value of values) {
    const parsed = idOf(value);
    if (parsed > 0) return parsed;
  }

  return 0;
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership = args.openWorkspace?.membership || args.activeMembership || storedMembership || null;

  return firstLocalId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId")
  );
}

function selectedWorkspaceBranchId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeBranchId?: unknown;
  activeBranch?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership = args.openWorkspace?.membership || args.activeMembership || storedMembership || null;

  return firstLocalId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId")
  );
}


type FormState = {
  id?: number;
  studentId: string;
  classId: string;
  academicStructureId: string;
  academicPeriodId: string;
  startDate: string;
  endDate: string;
  status: EnrollmentStatus;
  updateStudentCurrentClass: boolean;
};

type EnrollmentView = {
  id: number;
  row: StudentEnrollment;
  student?: Student;
  studentName: string;
  admissionNumber: string;
  className: string;
  academicStructureName: string;
  academicPeriodName: string;
  studentCurrentClassName: string;
  currentClassMatches: boolean;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyForm: FormState = {
  studentId: "",
  classId: "",
  academicStructureId: "",
  academicPeriodId: "",
  startDate: todayISO(),
  endDate: "",
  status: "active",
  updateStudentCurrentClass: true,
};

const idOf = (value: any) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (value: any) => String(value || "").toLowerCase().trim();
const tableSafe = (name: string) => (db as any)[name];
const isActiveTenantRow = (row: any) =>
  !row?.isDeleted && row?.active !== false && !["withdrawn", "deleted", "archived", "inactive"].includes(safeLower(row?.status));

const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "");
  if (!media) return undefined;
  if (media.startsWith("blob:")) return undefined;
  if (media.startsWith("data:image/")) return undefined;
  return media;
};

function statusTone(status?: EnrollmentStatus): "green" | "blue" | "orange" | "red" | "gray" {
  if (status === "completed") return "blue";
  if (status === "promoted") return "orange";
  if (status === "withdrawn") return "red";
  if (status === "active" || !status) return "green";
  return "gray";
}

function statusLabel(status?: EnrollmentStatus) {
  if (!status) return "Active";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const timeText = (value?: string | number | null) => {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";
  try {
    return new Intl.DateTimeFormat("en-GH", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(time));
  } catch {
    return "Not set";
  }
};

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function Avatar({ name, photo, primary }: { name: string; photo?: string; primary: string }) {
  return (
    <div
      className="ba-avatar"
      style={{
        background: photo ? `url(${photo}) center/cover` : `linear-gradient(135deg, ${primary}, rgba(15,23,42,.9))`,
      }}
    >
      {!photo && String(name || "S").slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function StudentEnrollments() {
  const router = useRouter();

  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchool, activeSchoolId, activeBranch, activeBranchId, loading: contextLoading } = useActiveBranch();
  const { activeMembership } = useActiveMembership();

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const schoolId = selectedWorkspaceSchoolId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeSchoolId,
    activeSchool: activeSchool as any,
    settings: settings as any,
  });

  const branchId = selectedWorkspaceBranchId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeBranchId,
    activeBranch: activeBranch as any,
    settings: settings as any,
  });

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<StudentEnrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filterClassId, setFilterClassId] = useState("all");
  const [filterStructureId, setFilterStructureId] = useState("all");
  const [filterPeriodId, setFilterPeriodId] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | EnrollmentStatus>("all");
  const [filterSync, setFilterSync] = useState<"all" | "synced" | "mismatch">("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EnrollmentView | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
    else if (!schoolId || !branchId) router.replace("/account");
  }, [accountLoading, contextLoading, authenticated, accountId, schoolId, branchId, router]);

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast((current) => (current?.message === message ? null : current)), 4200);
  };

  const clearData = () => {
    setRows([]);
    setStudents([]);
    setClasses([]);
    setAcademicStructures([]);
    setPeriods([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [enrollmentRows, studentRows, classRows, structureRows, periodRows] = await Promise.all([
        tableSafe("studentEnrollments")?.toArray?.() || [],
        listActiveLocal("students", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        listActiveLocal("classes", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        listActiveLocal("academicStructures", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        listActiveLocal("academicPeriods", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
      ]);

      setRows((enrollmentRows as StudentEnrollment[]).filter((row) => sameTenant(row as TenantRow)));
      setStudents(
        (studentRows as Student[])
          .filter((row: any) => sameTenant(row as TenantRow) && row.status !== "withdrawn" && row.status !== "graduated")
          .sort((a: any, b: any) => String(a.fullName || "").localeCompare(String(b.fullName || "")))
      );
      setClasses(
        (classRows as Class[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveTenantRow(row))
          .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
      );
      setAcademicStructures(
        (structureRows as AcademicStructure[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveTenantRow(row))
          .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
      );
      setPeriods(
        (periodRows as AcademicPeriod[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveTenantRow(row))
          .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0))
      );
    } catch (error) {
      console.error("Failed to load student enrollments:", error);
      clearData();
      showToast("error", "Failed to load student enrollments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, accountLoading, settingsLoading, contextLoading]);

  const studentMap = useMemo(() => new Map(students.map((row: any) => [idOf(row.id), row])), [students]);
  const classMap = useMemo(() => new Map(classes.map((row: any) => [idOf(row.id), row])), [classes]);
  const structureMap = useMemo(() => new Map(academicStructures.map((row: any) => [idOf(row.id), row])), [academicStructures]);
  const periodMap = useMemo(() => new Map(periods.map((row: any) => [idOf(row.id), row])), [periods]);

  const filteredPeriodsForForm = useMemo(() => {
    if (!form.academicStructureId) return periods;
    return periods.filter((row: any) => sameId(row.academicStructureId, form.academicStructureId));
  }, [form.academicStructureId, periods]);

  const filteredPeriodsForFilter = useMemo(() => {
    if (filterStructureId === "all") return periods;
    return periods.filter((row: any) => sameId(row.academicStructureId, filterStructureId));
  }, [filterStructureId, periods]);

  const viewRows = useMemo<EnrollmentView[]>(() => {
    return rows.map((row: any) => {
      const student: any = studentMap.get(idOf(row.studentId));
      const classRow: any = classMap.get(idOf(row.classId));
      const structure: any = structureMap.get(idOf(row.academicStructureId));
      const period: any = periodMap.get(idOf(row.academicPeriodId));
      const currentClass: any = student?.currentClassId ? classMap.get(idOf(student.currentClassId)) : undefined;
      const className = classRow?.name || `Class #${row.classId}`;
      const studentCurrentClassName = currentClass?.name || "No current class";

      return {
        id: idOf(row.id),
        row,
        student,
        studentName: student?.fullName || `Student #${row.studentId}`,
        admissionNumber: student?.admissionNumber || "",
        className,
        academicStructureName: structure?.name || `Structure #${row.academicStructureId}`,
        academicPeriodName: period?.name || `Period #${row.academicPeriodId}`,
        studentCurrentClassName,
        currentClassMatches: sameId(student?.currentClassId, row.classId),
      };
    });
  }, [classMap, periodMap, rows, studentMap, structureMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return viewRows
      .filter((item) => {
        const row: any = item.row;
        if (filterClassId !== "all" && !sameId(row.classId, filterClassId)) return false;
        if (filterStructureId !== "all" && !sameId(row.academicStructureId, filterStructureId)) return false;
        if (filterPeriodId !== "all" && !sameId(row.academicPeriodId, filterPeriodId)) return false;
        if (filterStatus !== "all" && row.status !== filterStatus) return false;
        if (filterSync === "synced" && !item.currentClassMatches) return false;
        if (filterSync === "mismatch" && item.currentClassMatches) return false;
        if (!query) return true;
        return `${item.studentName} ${item.admissionNumber || ""} ${item.className} ${item.academicStructureName} ${item.academicPeriodName} ${item.studentCurrentClassName} ${row.status || ""} ${row.startDate || ""} ${row.endDate || ""}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const classCompare = a.className.localeCompare(b.className);
        if (classCompare !== 0) return classCompare;
        return a.studentName.localeCompare(b.studentName);
      });
  }, [filterClassId, filterPeriodId, filterStatus, filterStructureId, filterSync, search, viewRows]);

  const summary = useMemo(() => {
    const active = rows.filter((row: any) => row.status === "active");
    const activeStudents = new Set(active.map((row: any) => row.studentId)).size;
    const classCoverage = classes.length ? Math.round((new Set(active.map((row: any) => row.classId)).size / classes.length) * 100) : 0;

    return {
      total: rows.length,
      active: active.length,
      completed: rows.filter((row: any) => row.status === "completed").length,
      promoted: rows.filter((row: any) => row.status === "promoted").length,
      withdrawn: rows.filter((row: any) => row.status === "withdrawn").length,
      enrolledStudents: activeStudents,
      classCoverage,
      mismatches: viewRows.filter((item) => item.row.status === "active" && !item.currentClassMatches).length,
      showing: filteredRows.length,
    };
  }, [classes.length, filteredRows.length, rows, viewRows]);

  const countsByClass = useMemo(() => groupedCounts(viewRows, (item) => item.className), [viewRows]);
  const countsByStatus = useMemo(() => groupedCounts(viewRows, (item) => statusLabel((item.row as any).status)), [viewRows]);
  const countsByPeriod = useMemo(() => groupedCounts(viewRows, (item) => item.academicPeriodName), [viewRows]);
  const countsBySync = useMemo(
    () => [
      { label: "Current Class Synced", value: viewRows.filter((item) => item.currentClassMatches).length },
      { label: "Needs Current-Class Sync", value: viewRows.filter((item) => !item.currentClassMatches).length },
    ],
    [viewRows]
  );

  const activeFilterCount = useMemo(() => {
    return [filterClassId, filterStructureId, filterPeriodId, filterStatus, filterSync].filter((value) => value !== "all").length;
  }, [filterClassId, filterPeriodId, filterStatus, filterStructureId, filterSync]);

  const updateForm = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const clearFilters = () => {
    setFilterClassId("all");
    setFilterStructureId("all");
    setFilterPeriodId("all");
    setFilterStatus("all");
    setFilterSync("all");
  };

  const openCreate = () => {
    if (!requireTenant()) return;
    setSelectedItem(null);
    const currentPeriodId = idOf(settings?.currentAcademicPeriodId);
    const selectedPeriod: any = currentPeriodId ? periodMap.get(currentPeriodId) : undefined;

    setForm({
      ...emptyForm,
      classId: filterClassId !== "all" ? filterClassId : "",
      academicStructureId:
        filterStructureId !== "all"
          ? filterStructureId
          : selectedPeriod?.academicStructureId
          ? String(selectedPeriod.academicStructureId)
          : settings?.currentAcademicStructureId
          ? String(settings.currentAcademicStructureId)
          : "",
      academicPeriodId:
        filterPeriodId !== "all"
          ? filterPeriodId
          : selectedPeriod?.id
          ? String(selectedPeriod.id)
          : settings?.currentAcademicPeriodId
          ? String(settings.currentAcademicPeriodId)
          : "",
      startDate: selectedPeriod?.startDate || todayISO(),
      endDate: "",
      status: "active",
      updateStudentCurrentClass: true,
    });

    setModalOpen(true);
  };

  const openEdit = (row: StudentEnrollment) => {
    const item: any = row;
    setSelectedItem(null);
    setForm({
      id: idOf(item.id),
      studentId: item.studentId ? String(item.studentId) : "",
      classId: item.classId ? String(item.classId) : "",
      academicStructureId: item.academicStructureId ? String(item.academicStructureId) : "",
      academicPeriodId: item.academicPeriodId ? String(item.academicPeriodId) : "",
      startDate: item.startDate || todayISO(),
      endDate: item.endDate || "",
      status: item.status || "active",
      updateStudentCurrentClass: false,
    });
    setModalOpen(true);
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId) return "Select a school first.";
    if (!branchId) return "Select a branch first.";
    if (!form.studentId) return "Select student.";
    if (!form.classId) return "Select class.";
    if (!form.academicStructureId) return "Select academic structure.";
    if (!form.academicPeriodId) return "Select academic period.";
    if (!form.startDate) return "Select start date.";

    const selectedStudent = studentMap.get(idOf(form.studentId));
    if (!selectedStudent) return "Selected student is not in this branch.";
    const selectedClass = classMap.get(idOf(form.classId));
    if (!selectedClass) return "Selected class is not in this branch.";
    const selectedStructure = structureMap.get(idOf(form.academicStructureId));
    if (!selectedStructure) return "Selected academic structure is not in this branch.";
    const selectedPeriod: any = periodMap.get(idOf(form.academicPeriodId));
    if (!selectedPeriod) return "Selected academic period is not in this branch.";
    if (!sameId(selectedPeriod.academicStructureId, form.academicStructureId)) return "Selected academic period does not belong to the selected academic structure.";
    if (form.endDate && form.endDate < form.startDate) return "End date cannot be before start date.";

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      return sameId(row.studentId, form.studentId) && sameId(row.classId, form.classId) && sameId(row.academicStructureId, form.academicStructureId) && sameId(row.academicPeriodId, form.academicPeriodId) && !row.isDeleted;
    });
    if (duplicate) return "This student is already enrolled in this class for this academic period.";

    const activeClassInSamePeriod = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      return sameId(row.studentId, form.studentId) && sameId(row.academicStructureId, form.academicStructureId) && sameId(row.academicPeriodId, form.academicPeriodId) && row.status === "active" && !row.isDeleted;
    });
    if (activeClassInSamePeriod && form.status === "active") return "This student already has an active class enrollment for this academic period.";
    return "";
  };

  const syncStudentCurrentClass = async (studentId: number, classId: number) => {
    await updateLocal("students", studentId, { currentClassId: classId } as unknown as Partial<Student>);
  };

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const error = validate();
    if (error) {
      showToast("error", error);
      return;
    }
    if (!authenticated || !accountId || !schoolId || !branchId) return;

    try {
      setSaving(true);
      const existing = form.id ? rows.find((row: any) => sameId(row.id, form.id)) : undefined;
      const payload: Partial<StudentEnrollment> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        studentId: Number(form.studentId),
        classId: Number(form.classId),
        academicStructureId: Number(form.academicStructureId),
        academicPeriodId: Number(form.academicPeriodId),
        startDate: form.startDate,
        endDate: form.endDate.trim() || undefined,
        status: form.status,
        isDeleted: false,
      } as Partial<StudentEnrollment>;

      if (form.id && existing) await updateLocal("studentEnrollments", Number(form.id), payload);
      else await createLocal("studentEnrollments", payload as unknown as StudentEnrollment);

      if (form.updateStudentCurrentClass && form.studentId && form.classId && form.status === "active") {
        await syncStudentCurrentClass(Number(form.studentId), Number(form.classId));
      }

      setModalOpen(false);
      showToast("success", "Student enrollment saved.");
      await load();
    } catch (error) {
      console.error("Failed to save student enrollment:", error);
      showToast("error", "Failed to save student enrollment.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: StudentEnrollment) => {
    const item: any = row;
    if (!item.id) return;
    if (!window.confirm("Delete this student enrollment record?")) return;
    await softDeleteLocal("studentEnrollments", Number(item.id));
    setSelectedItem(null);
    showToast("success", "Student enrollment deleted.");
    await load();
  };

  const setStatus = async (row: StudentEnrollment, status: EnrollmentStatus) => {
    const item: any = row;
    if (!item.id) return;
    const patch: Partial<StudentEnrollment> = { status } as Partial<StudentEnrollment>;
    if ((status === "completed" || status === "promoted" || status === "withdrawn") && !item.endDate) patch.endDate = todayISO();
    if (status === "active") patch.endDate = undefined;
    await updateLocal("studentEnrollments", Number(item.id), patch);
    if (status === "active") await syncStudentCurrentClass(Number(item.studentId), Number(item.classId));
    setSelectedItem(null);
    showToast("success", `Enrollment marked as ${statusLabel(status)}.`);
    await load();
  };

  const syncCurrentClass = async (row: StudentEnrollment) => {
    const item: any = row;
    await syncStudentCurrentClass(Number(item.studentId), Number(item.classId));
    setSelectedItem(null);
    showToast("success", "Student current class synced.");
    await load();
  };

  if (accountLoading || contextLoading || settingsLoading || loading) return <State primary={primary} title="Opening Student Enrollments..." text="Checking account, branch, students, classes, academic structures, and periods." />;
  if (!authenticated || !accountId) return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing student enrollments." />;
  if (!schoolId || !branchId) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>No branch workspace selected</h2>
          <p>Student enrollments belong to the selected branch-admin workspace. Use Select Role again if the wrong branch is active.</p>
          <button type="button" className="ba-state-button" onClick={() => router.push("/account")}>Go to Account Setup</button>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      {toast && (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">
            ✕
          </button>
        </section>
      )}

      <section className="ba-search-card" aria-label="Student enrollment search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            placeholder="Search enrollments..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search student enrollments"
          />
        </label>

        <button type="button" className="ba-add-inline" onClick={openCreate} aria-label="Enroll student">
          +
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
        <section className="ba-filter-chips" aria-label="Active filters">
          {filterClassId !== "all" && (
            <button type="button" onClick={() => setFilterClassId("all")}>
              Class: {(classMap.get(idOf(filterClassId)) as any)?.name || filterClassId} ×
            </button>
          )}
          {filterStructureId !== "all" && (
            <button type="button" onClick={() => { setFilterStructureId("all"); setFilterPeriodId("all"); }}>
              Structure: {(structureMap.get(idOf(filterStructureId)) as any)?.name || filterStructureId} ×
            </button>
          )}
          {filterPeriodId !== "all" && (
            <button type="button" onClick={() => setFilterPeriodId("all")}>
              Period: {(periodMap.get(idOf(filterPeriodId)) as any)?.name || filterPeriodId} ×
            </button>
          )}
          {filterStatus !== "all" && (
            <button type="button" onClick={() => setFilterStatus("all")}>
              Status: {statusLabel(filterStatus)} ×
            </button>
          )}
          {filterSync !== "all" && (
            <button type="button" onClick={() => setFilterSync("all")}>
              Sync: {filterSync === "synced" ? "Current class synced" : "Needs sync"} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard title="Enrollments by Class" rows={countsByClass} total={summary.total} />
          <AnalysisCard title="Enrollments by Status" rows={countsByStatus} total={summary.total} />
          <AnalysisCard title="Enrollments by Period" rows={countsByPeriod} total={summary.total} />
          <AnalysisCard title="Current-Class Sync" rows={countsBySync} total={summary.total} />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{summary.showing}</strong>
            <p>Enrollment record(s) currently match your search and filter conditions.</p>
          </article>
        </section>
      )}

      {viewMode === "table" && <TableView rows={filteredRows} openEdit={openEdit} remove={remove} setStatus={setStatus} syncCurrentClass={syncCurrentClass} />}

      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredRows.map((item) => (
            <EnrollmentListItem key={String(item.id)} item={item} primary={primary} onOpen={() => setSelectedItem(item)} />
          ))}

          {!filteredRows.length && (
            <Empty icon="📋" title="No enrollments found" text="Enroll students into classes for the selected academic structure and period." />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          classes={classes}
          academicStructures={academicStructures}
          filteredPeriodsForFilter={filteredPeriodsForFilter}
          filterClassId={filterClassId}
          filterStructureId={filterStructureId}
          filterPeriodId={filterPeriodId}
          filterStatus={filterStatus}
          filterSync={filterSync}
          setFilterClassId={setFilterClassId}
          setFilterStructureId={(value) => {
            setFilterStructureId(value);
            setFilterPeriodId("all");
          }}
          setFilterPeriodId={setFilterPeriodId}
          setFilterStatus={setFilterStatus}
          setFilterSync={setFilterSync}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          summary={summary}
          setViewMode={(mode) => {
            setViewMode(mode);
            setMoreOpen(false);
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {selectedItem && (
        <ActionSheet
          item={selectedItem}
          openEdit={openEdit}
          remove={remove}
          setStatus={setStatus}
          syncCurrentClass={syncCurrentClass}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {modalOpen && <EnrollmentModal form={form} saving={saving} students={students} classes={classes} academicStructures={academicStructures} filteredPeriodsForForm={filteredPeriodsForForm} periodMap={periodMap} setModalOpen={setModalOpen} updateForm={updateForm} save={save} />}
    </main>
  );
}


function EnrollmentListItem({ item, primary, onOpen }: { item: EnrollmentView; primary: string; onOpen: () => void }) {
  const row: any = item.row;

  return (
    <button type="button" className="enrollment-row" onClick={onOpen}>
      <Avatar name={item.studentName} photo={safeRecordMediaValue((item.student as any)?.photo)} primary={primary} />

      <span className="enrollment-main">
        <strong>{item.studentName}</strong>
        <small>
          {item.className}
          {item.admissionNumber ? ` · ${item.admissionNumber}` : ""}
        </small>
        <em>
          {item.academicPeriodName} · {statusLabel(row.status)}
        </em>
      </span>

      <span className="enrollment-side">
        <span
          className={`status-dot-mini ${row.status === "active" && !item.currentClassMatches ? "orange" : statusTone(row.status)}`}
          title={item.currentClassMatches ? statusLabel(row.status) : "Needs current-class sync"}
          aria-label={item.currentClassMatches ? statusLabel(row.status) : "Needs current-class sync"}
        />
        <i>⋯</i>
      </span>
    </button>
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

function FilterSheet({
  classes,
  academicStructures,
  filteredPeriodsForFilter,
  filterClassId,
  filterStructureId,
  filterPeriodId,
  filterStatus,
  filterSync,
  setFilterClassId,
  setFilterStructureId,
  setFilterPeriodId,
  setFilterStatus,
  setFilterSync,
  clearFilters,
  onClose,
}: {
  classes: Class[];
  academicStructures: AcademicStructure[];
  filteredPeriodsForFilter: AcademicPeriod[];
  filterClassId: string;
  filterStructureId: string;
  filterPeriodId: string;
  filterStatus: "all" | EnrollmentStatus;
  filterSync: "all" | "synced" | "mismatch";
  setFilterClassId: (value: string) => void;
  setFilterStructureId: (value: string) => void;
  setFilterPeriodId: (value: string) => void;
  setFilterStatus: (value: "all" | EnrollmentStatus) => void;
  setFilterSync: (value: "all" | "synced" | "mismatch") => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose only what you need. The enrollment list updates after applying.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="ba-form compact">
          <label><span>Class</span><select value={filterClassId} onChange={(event) => setFilterClassId(event.target.value)}><option value="all">All classes</option>{classes.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label>
          <label><span>Academic Structure</span><select value={filterStructureId} onChange={(event) => setFilterStructureId(event.target.value)}><option value="all">All structures</option>{academicStructures.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}{row.level ? ` · ${row.level}` : ""}</option>)}</select></label>
          <label><span>Academic Period</span><select value={filterPeriodId} onChange={(event) => setFilterPeriodId(event.target.value)}><option value="all">All periods</option>{filteredPeriodsForFilter.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label>
          <label><span>Status</span><select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as "all" | EnrollmentStatus)}><option value="all">All status</option><option value="active">Active</option><option value="completed">Completed</option><option value="promoted">Promoted</option><option value="withdrawn">Withdrawn</option></select></label>
          <label><span>Current Class Sync</span><select value={filterSync} onChange={(event) => setFilterSync(event.target.value as "all" | "synced" | "mismatch")}><option value="all">All sync status</option><option value="synced">Current class synced</option><option value="mismatch">Needs current-class sync</option></select></label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={clearFilters}>Clear</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  viewMode,
  summary,
  setViewMode,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  summary: { total: number; active: number; enrolledStudents: number; classCoverage: number; mismatches: number; showing: number };
  setViewMode: (mode: ViewMode) => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div><h2>More</h2><p>{summary.showing} of {summary.total} enrollment record(s) shown.</p></div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="enrollment-insights">
          <span><b>{summary.active}</b>Active</span>
          <span><b>{summary.enrolledStudents}</b>Students</span>
          <span><b>{summary.classCoverage}%</b>Coverage</span>
          <span><b>{summary.mismatches}</b>Sync issues</span>
        </div>

        <div className="ba-menu-list">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}><span>☰</span><b>List view</b><small>Compact enrollment records</small></button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}><span>☷</span><b>Table view</b><small>Dense records for laptop work</small></button>
          <button type="button" className={viewMode === "summary" ? "active" : ""} onClick={() => setViewMode("summary")}><span>◔</span><b>Analytics</b><small>Class, status, period and sync summaries</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local branch records</small></button>
        </div>
      </section>
    </div>
  );
}

function ActionSheet({ item, openEdit, remove, setStatus, syncCurrentClass, onClose }: { item: EnrollmentView; openEdit: (row: StudentEnrollment) => void; remove: (row: StudentEnrollment) => void; setStatus: (row: StudentEnrollment, status: EnrollmentStatus) => void; syncCurrentClass: (row: StudentEnrollment) => void; onClose: () => void }) {
  const row: any = item.row;

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile"><div><h2>{item.studentName}</h2><p>{item.className} · {statusLabel(row.status)}</p></div><button type="button" onClick={onClose} aria-label="Close enrollment actions">✕</button></div>
        <div className="enrollment-detail-strip"><span><b>Period</b>{item.academicPeriodName}</span><span><b>Start</b>{row.startDate || "—"}</span><span><b>Current</b>{item.currentClassMatches ? "Synced" : "Needs sync"}</span></div>
        <div className="ba-menu-list">
          {!item.currentClassMatches && row.status === "active" && <button type="button" onClick={() => syncCurrentClass(item.row)}><span>↔</span><b>Sync current class</b><small>Update student profile currentClassId</small></button>}
          <button type="button" onClick={() => openEdit(item.row)}><span>✎</span><b>Edit enrollment</b><small>Update class, period, dates and status</small></button>
          {row.status !== "active" && <button type="button" onClick={() => setStatus(item.row, "active")}><span>✓</span><b>Mark active</b><small>Reopen enrollment and sync current class</small></button>}
          {row.status !== "completed" && <button type="button" onClick={() => setStatus(item.row, "completed")}><span>🎯</span><b>Complete</b><small>Close this enrollment as completed</small></button>}
          {row.status !== "promoted" && <button type="button" onClick={() => setStatus(item.row, "promoted")}><span>🚀</span><b>Promote</b><small>Mark this enrollment as promoted</small></button>}
          {row.status !== "withdrawn" && <button type="button" onClick={() => setStatus(item.row, "withdrawn")}><span>⏸</span><b>Withdraw</b><small>Close this enrollment as withdrawn</small></button>}
          <button type="button" className="danger" onClick={() => remove(item.row)}><span>⌫</span><b>Delete</b><small>Soft delete this enrollment locally</small></button>
        </div>
      </section>
    </div>
  );
}

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}><style>{css}</style><section className="ba-state"><div className="ba-spinner" /><h2>{title}</h2><p>{text}</p></section></main>;
}

function TableView({ rows, openEdit, remove, setStatus, syncCurrentClass }: { rows: EnrollmentView[]; openEdit: (row: StudentEnrollment) => void; remove: (row: StudentEnrollment) => void; setStatus: (row: StudentEnrollment, status: EnrollmentStatus) => void; syncCurrentClass: (row: StudentEnrollment) => void }) {
  return (
    <section className="ba-table-card"><div className="ba-table-scroll"><table><thead><tr><th>Enrollments ({rows.length})</th><th>Class</th><th>Structure</th><th>Period</th><th>Current Class</th><th>Start Date</th><th>End Date</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{rows.map((item) => { const row: any = item.row; return <tr key={String(item.id)}><td><strong>{item.studentName}</strong><span>{item.admissionNumber || "No admission number"}</span></td><td>{item.className}</td><td>{item.academicStructureName}</td><td>{item.academicPeriodName}</td><td><Chip tone={item.currentClassMatches ? "green" : "orange"}>{item.studentCurrentClassName}</Chip></td><td>{row.startDate || "—"}</td><td>{row.endDate || "Open"}</td><td><Chip tone={statusTone(row.status)}>{statusLabel(row.status)}</Chip></td><td>{timeText(row.updatedAt || row.createdAt)}</td><td><div className="ba-table-actions">{!item.currentClassMatches && row.status === "active" && <button type="button" onClick={() => syncCurrentClass(row)}>Sync Class</button>}<button type="button" onClick={() => openEdit(row)}>Edit</button>{row.status !== "active" && <button type="button" onClick={() => setStatus(row, "active")}>Active</button>}{row.status !== "promoted" && <button type="button" onClick={() => setStatus(row, "promoted")}>Promote</button>}<button type="button" className="danger" onClick={() => remove(row)}>Delete</button></div></td></tr>; })}</tbody></table>{!rows.length && <div className="ba-empty-table">No enrollment matches your filters.</div>}</div></section>
  );
}

function EnrollmentModal({ form, saving, students, classes, academicStructures, filteredPeriodsForForm, periodMap, setModalOpen, updateForm, save }: { form: FormState; saving: boolean; students: Student[]; classes: Class[]; academicStructures: AcademicStructure[]; filteredPeriodsForForm: AcademicPeriod[]; periodMap: Map<number, AcademicPeriod>; setModalOpen: (open: boolean) => void; updateForm: (patch: Partial<FormState>) => void; save: (event?: React.FormEvent) => void }) {
  return (
    <div className="ba-modal-backdrop"><form className="ba-modal" onSubmit={save}><div className="ba-modal-head"><div><h2>{form.id ? "Edit Enrollment" : "Enroll Student"}</h2><p>Enrollment will be saved under the selected school branch.</p></div><button type="button" onClick={() => setModalOpen(false)}>✕</button></div><div className="ba-form"><label><span>Student</span><select value={form.studentId} onChange={(event) => updateForm({ studentId: event.target.value })}><option value="">Select student</option>{students.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.fullName}{row.admissionNumber ? ` · ${row.admissionNumber}` : ""}</option>)}</select></label><label><span>Class</span><select value={form.classId} onChange={(event) => updateForm({ classId: event.target.value })}><option value="">Select class</option>{classes.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label><label><span>Academic Structure</span><select value={form.academicStructureId} onChange={(event) => updateForm({ academicStructureId: event.target.value, academicPeriodId: "" })}><option value="">Select academic structure</option>{academicStructures.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}{row.level ? ` · ${row.level}` : ""}</option>)}</select></label><label><span>Academic Period</span><select value={form.academicPeriodId} onChange={(event) => { const periodId = event.target.value; const period: any = periodId ? periodMap.get(idOf(periodId)) : undefined; updateForm({ academicPeriodId: periodId, academicStructureId: period?.academicStructureId ? String(period.academicStructureId) : form.academicStructureId, startDate: period?.startDate || form.startDate, endDate: form.endDate || period?.endDate || "" }); }}><option value="">Select academic period</option>{filteredPeriodsForForm.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label><label><span>Start Date</span><input type="date" value={form.startDate} onChange={(event) => updateForm({ startDate: event.target.value })} /></label><label><span>End Date</span><input type="date" value={form.endDate} onChange={(event) => updateForm({ endDate: event.target.value })} /></label><label><span>Status</span><select value={form.status} onChange={(event) => updateForm({ status: event.target.value as EnrollmentStatus })}><option value="active">Active</option><option value="completed">Completed</option><option value="promoted">Promoted</option><option value="withdrawn">Withdrawn</option></select></label><label className="ba-check wide"><input type="checkbox" checked={form.updateStudentCurrentClass} onChange={(event) => updateForm({ updateStudentCurrentClass: event.target.checked })} /><span>Also update student&apos;s current class when status is active</span></label></div><div className="ba-modal-actions"><button type="button" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving..." : form.id ? "Save Changes" : "Enroll Student"}</button></div></form></div>
  );
}

function groupedCounts(rows: EnrollmentView[], keyFn: (item: EnrollmentView) => string) {
  const map = new Map<string, number>();
  rows.forEach((row) => { const key = keyFn(row) || "Unknown"; map.set(key, (map.get(key) || 0) + 1); });
  return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function AnalysisCard({ title, rows, total }: { title: string; rows: { label: string; value: number }[]; total: number }) {
  return <article className="ba-analysis"><span>{title}</span><strong>{rows.reduce((sum, row) => sum + row.value, 0)}</strong><div className="ba-analysis-list">{rows.slice(0, 8).map((row) => { const share = total ? Math.round((row.value / total) * 100) : 0; return <section key={row.label}><div><b>{row.label}</b><small>{row.value} · {share}%</small></div><div className="ba-progress"><i style={{ width: `${Math.max(4, share)}%` }} /></div></section>; })}{!rows.length && <p>No data available.</p>}</div></article>;
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }
.ba-page { min-height:100dvh; width:100%; max-width:100%; min-width:0; padding:calc(8px * var(--local-density-scale,1)); padding-bottom:max(28px, env(safe-area-inset-bottom)); background:radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 10%, transparent), transparent 34rem), var(--bg,#f7f8fb); color:var(--text,#111827); font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif); font-size:var(--font-size,14px); overflow-x:hidden; }
.ba-page *, .ba-page *::before, .ba-page *::after { box-sizing:border-box; min-width:0; }
.ba-page button,.ba-page input,.ba-page select,.ba-page textarea { font:inherit; max-width:100%; }
.ba-page input,.ba-page select,.ba-page textarea { width:100%; min-height:44px; border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10))); border-radius:16px; padding:0 12px; background:var(--input-bg,var(--surface,#fff)); color:var(--input-text,var(--text,#111827)); outline:none; font-weight:750; }
.ba-state,.ba-context,.ba-filter,.ba-summary,.ba-card,.ba-table-card,.ba-analysis,.ba-empty,.ba-action-card { background:var(--card-bg,var(--surface,#fff)); border:1px solid var(--border,rgba(0,0,0,.10)); box-shadow:0 12px 28px rgba(15,23,42,.045); overflow:hidden; }
.ba-state { min-height:min(420px,calc(100dvh - 32px)); width:min(520px,100%); margin:0 auto; display:grid; place-items:center; align-content:center; gap:10px; padding:22px; border-radius:28px; text-align:center; }
.ba-spinner { width:38px; height:38px; border-radius:999px; border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent); border-top-color:var(--ba-primary); animation:spin .8s linear infinite; }
.ba-state h2 { margin:0; font-size:22px; font-weight:1000; letter-spacing:-.04em; }
.ba-state p { max-width:34rem; margin:0; color:var(--muted,#64748b); font-size:13px; line-height:1.6; }
.ba-state-button { min-height:42px; border:0; border-radius:999px; padding:0 16px; background:var(--ba-primary); color:#fff; font-weight:950; cursor:pointer; }
.ba-toast { position:sticky; top:8px; z-index:20; display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; padding:12px 14px; border-radius:18px; font-size:13px; font-weight:850; box-shadow:0 18px 40px rgba(15,23,42,.12); }
.ba-toast.success { background:rgba(34,197,94,.14); color:#166534; } .ba-toast.error { background:rgba(239,68,68,.12); color:#991b1b; } .ba-toast.info { background:rgba(59,130,246,.13); color:#1d4ed8; }
.ba-toast button { border:0; background:transparent; color:currentColor; font-weight:1000; cursor:pointer; }
.ba-hero { display:flex; align-items:stretch; justify-content:space-between; gap:10px; padding:12px; border-radius:28px; background:radial-gradient(circle at 18% 8%, color-mix(in srgb,var(--ba-primary) 16%,transparent), transparent 20rem), linear-gradient(135deg,var(--card-bg,var(--surface,#fff)), color-mix(in srgb,var(--ba-primary) 7%,var(--card-bg,#fff)) 72%); border:1px solid var(--border,rgba(0,0,0,.10)); box-shadow:0 18px 46px rgba(15,23,42,.07); overflow:hidden; }
.ba-hero-left { display:flex; align-items:center; gap:10px; flex:1 1 auto; }
.ba-hero-icon { width:48px; height:48px; flex:0 0 auto; display:grid; place-items:center; border-radius:18px; background:var(--ba-primary); color:#fff; font-size:22px; box-shadow:0 12px 26px color-mix(in srgb,var(--ba-primary) 28%,transparent); }
.ba-title p,.ba-title h2,.ba-title span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ba-title p { margin:0 0 2px; color:var(--ba-primary); font-size:10px; font-weight:950; letter-spacing:.08em; text-transform:uppercase; }
.ba-title h2 { margin:0; color:var(--text,#111827); font-size:clamp(20px,5vw,30px); font-weight:1000; letter-spacing:-.06em; line-height:1; }
.ba-title span { margin-top:3px; color:var(--muted,#64748b); font-size:12px; font-weight:750; }
.ba-hero-actions { display:flex; align-items:center; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
.ba-switch { display:inline-flex; gap:4px; padding:4px; border-radius:999px; background:color-mix(in srgb,var(--ba-primary) 7%,var(--surface,#fff)); border:1px solid var(--border,rgba(0,0,0,.08)); }
.ba-switch button { min-height:34px; border:0; border-radius:999px; padding:0 10px; background:transparent; color:var(--muted,#64748b); font-size:12px; font-weight:950; cursor:pointer; }
.ba-switch button.active { background:var(--ba-primary); color:#fff; }
.ba-primary,.ba-ghost { min-height:42px; border-radius:999px; padding:0 14px; font-size:12px; font-weight:950; cursor:pointer; }
.ba-primary { border:0; background:var(--ba-primary); color:#fff; box-shadow:0 14px 32px color-mix(in srgb,var(--ba-primary) 25%,transparent); }
.ba-primary:disabled { opacity:.6; cursor:not-allowed; }
.ba-ghost { border:1px solid var(--border,rgba(0,0,0,.10)); background:var(--surface,#fff); color:var(--text,#111827); }
.ba-context { margin-top:10px; padding:13px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; border-radius:24px; background:linear-gradient(135deg,color-mix(in srgb,var(--ba-primary) 10%,var(--surface,#fff)),var(--surface,#fff) 68%); }
.ba-context p { margin:0; color:var(--ba-primary); font-size:10px; font-weight:950; letter-spacing:.08em; text-transform:uppercase; }
.ba-context h3 { margin:4px 0 0; font-size:clamp(18px,5vw,24px); font-weight:1000; letter-spacing:-.05em; }
.ba-context span { display:block; margin-top:3px; color:var(--muted,#64748b); font-size:12px; font-weight:750; }
.ba-filter { display:grid; grid-template-columns:minmax(0,1fr); gap:8px; margin-top:10px; padding:10px; border-radius:24px; }
.ba-filter label,.ba-form label { display:grid; gap:6px; min-width:0; }
.ba-filter span,.ba-form span { color:var(--muted,#64748b); font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.06em; }
.ba-summary-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:10px; }
.ba-summary { display:flex; align-items:center; gap:10px; padding:12px; border-radius:22px; }
.ba-summary-icon { width:36px; height:36px; flex:0 0 auto; display:grid; place-items:center; border-radius:15px; background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff)); }
.ba-summary strong,.ba-summary span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ba-summary strong { font-size:20px; font-weight:1000; letter-spacing:-.05em; }
.ba-summary span { margin-top:2px; color:var(--muted,#64748b); font-size:11px; font-weight:850; }
.ba-grid,.ba-analysis-grid { display:grid; grid-template-columns:minmax(0,1fr); gap:10px; margin-top:10px; }
.ba-card,.ba-analysis,.ba-table-card,.ba-empty { padding:13px; border-radius:24px; }
.ba-card-head { display:flex; align-items:flex-start; gap:10px; }
.ba-avatar { width:54px; height:54px; flex:0 0 auto; display:grid; place-items:center; border-radius:19px; color:#fff; font-size:18px; font-weight:1000; box-shadow:0 12px 24px rgba(15,23,42,.12); }
.ba-card-head > div:nth-child(2) { flex:1; }
.ba-card h3 { margin:0; font-size:17px; font-weight:1000; letter-spacing:-.035em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ba-card p { margin:4px 0 0; color:var(--muted,#64748b); font-size:12px; font-weight:750; line-height:1.4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ba-mini-chips { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
.ba-chip { max-width:100%; display:inline-flex; align-items:center; min-height:25px; padding:4px 9px; border-radius:999px; font-size:11px; font-weight:950; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-transform:capitalize; }
.ba-chip.green { background:rgba(34,197,94,.12); color:#16a34a; } .ba-chip.red { background:rgba(239,68,68,.12); color:#dc2626; } .ba-chip.blue { background:rgba(59,130,246,.12); color:#2563eb; } .ba-chip.gray { background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color:var(--muted,#64748b); } .ba-chip.orange { background:rgba(245,158,11,.14); color:#b45309; } .ba-chip.purple { background:rgba(147,51,234,.12); color:#7e22ce; }
.ba-stats { display:grid; grid-template-columns:minmax(0,1fr); gap:8px; margin-top:12px; }
.ba-stats span { padding:10px; border-radius:16px; background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent); color:var(--muted,#64748b); font-size:11px; font-weight:850; overflow:hidden; }
.ba-stats b { display:block; color:var(--text,#111827); font-size:13px; line-height:1.2; font-weight:1000; margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ba-meta { display:flex; flex-wrap:wrap; gap:7px; margin-top:12px; }
.ba-meta span { display:inline-flex; align-items:center; min-height:26px; padding:0 8px; border-radius:999px; background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent); color:var(--muted,#64748b); font-size:11px; font-weight:900; }
.ba-actions,.ba-table-actions { display:flex; flex-wrap:wrap; gap:7px; }
.ba-actions { margin-top:12px; }
.ba-actions button,.ba-table-actions button,.ba-modal-actions button { min-height:34px; border:1px solid var(--border,rgba(0,0,0,.10)); border-radius:999px; padding:0 10px; background:var(--surface,#fff); color:var(--text,#111827); font-size:11px; font-weight:950; cursor:pointer; }
.ba-actions button:first-child,.ba-table-actions button:first-child,.ba-modal-actions button:last-child { background:var(--ba-primary); color:#fff; border-color:var(--ba-primary); }
.ba-actions button.danger,.ba-table-actions button.danger { color:var(--muted,#64748b); background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff)); border-color:color-mix(in srgb,var(--muted,#64748b) 24%,var(--border,rgba(0,0,0,.10))); }
.ba-table-card { margin-top:10px; }
.ba-table-scroll { width:100%; max-width:100%; overflow-x:auto; border-radius:18px; border:1px solid var(--border,rgba(0,0,0,.08)); }
.ba-table-scroll table { width:100%; min-width:1180px; border-collapse:collapse; background:var(--card-bg,var(--surface,#fff)); }
.ba-table-scroll th,.ba-table-scroll td { padding:10px; border-bottom:1px solid var(--border,rgba(0,0,0,.08)); vertical-align:top; text-align:left; font-size:13px; }
.ba-table-scroll th { background:color-mix(in srgb,var(--ba-primary) 6%,var(--card-bg,#fff)); color:var(--muted,#64748b); font-size:11px; font-weight:1000; text-transform:uppercase; letter-spacing:.07em; }
.ba-table-scroll td strong,.ba-table-scroll td span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ba-table-scroll td span { margin-top:3px; color:var(--muted,#64748b); font-size:11px; }
.ba-empty-table { padding:22px; text-align:center; color:var(--muted,#64748b); font-weight:850; }
.ba-analysis span { color:var(--muted,#64748b); font-size:11px; font-weight:950; text-transform:uppercase; letter-spacing:.08em; }
.ba-analysis strong { display:block; margin-top:8px; font-size:clamp(22px,7vw,30px); line-height:1; font-weight:1000; letter-spacing:-.06em; overflow-wrap:anywhere; }
.ba-analysis p { margin:8px 0 0; color:var(--muted,#64748b); font-size:12px; line-height:1.5; }
.ba-analysis-list { display:grid; gap:10px; margin-top:12px; }
.ba-analysis-list section { display:grid; gap:6px; padding:10px; border-radius:16px; background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent); }
.ba-analysis-list section > div:first-child { display:flex; justify-content:space-between; gap:10px; }
.ba-analysis-list b,.ba-analysis-list small { font-size:12px; }
.ba-analysis-list small { color:var(--muted,#64748b); font-weight:850; }
.ba-progress { height:8px; border-radius:999px; background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent); overflow:hidden; }
.ba-progress i { display:block; height:100%; border-radius:inherit; background:var(--ba-primary); }
.ba-empty { display:grid; place-items:center; align-content:center; gap:8px; min-height:220px; text-align:center; border-style:dashed; }
.ba-empty-icon { width:56px; height:56px; display:grid; place-items:center; border-radius:22px; background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff)); font-size:28px; }
.ba-empty h3 { margin:0; font-size:18px; font-weight:1000; }
.ba-empty p { margin:0; color:var(--muted,#64748b); font-size:13px; line-height:1.6; }
.ba-modal-backdrop { position:fixed; inset:0; z-index:80; display:grid; place-items:end center; padding:10px; background:rgba(15,23,42,.58); backdrop-filter:blur(12px); }
.ba-modal { width:min(980px,100%); max-height:min(92dvh,900px); overflow-y:auto; padding:14px; border-radius:28px; background:var(--card-bg,var(--surface,#fff)); border:1px solid var(--border,rgba(0,0,0,.10)); box-shadow:0 30px 90px rgba(15,23,42,.35); }
.ba-modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:4px 2px 14px; }
.ba-modal-head h2 { margin:0; font-size:20px; font-weight:1000; letter-spacing:-.05em; color:var(--text,#111827); }
.ba-modal-head p { margin:5px 0 0; color:var(--muted,#64748b); font-size:12px; line-height:1.5; }
.ba-modal-head button { width:38px; height:38px; border:1px solid var(--border,rgba(0,0,0,.10)); border-radius:999px; background:var(--surface,#fff); color:var(--text,#111827); font-weight:1000; cursor:pointer; }
.ba-form { display:grid; grid-template-columns:minmax(0,1fr); gap:10px; }
.ba-form .wide { grid-column:1 / -1; }
.ba-check { min-height:43px; display:flex!important; align-items:center; gap:10px; padding:10px 12px; border-radius:15px; background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent); border:1px solid var(--border,rgba(0,0,0,.10)); color:var(--text,#111827); font-size:13px; font-weight:850; }
.ba-check input { width:18px; min-height:18px; }
.ba-check span { color:var(--text,#111827); font-size:13px; letter-spacing:0; text-transform:none; }
.ba-modal-actions { position:sticky; bottom:-14px; display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; margin-top:14px; padding:12px 0 2px; background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent); }
.ba-modal-actions button:first-child { background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff)); color:var(--text,#111827); }
.enrollment-line { min-width:0; padding:11px; border-radius:18px; background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent); border:1px solid var(--border,rgba(0,0,0,.10)); margin-top:12px; }
.enrollment-line strong,.enrollment-line span { display:block; overflow:hidden; text-overflow:ellipsis; }
.enrollment-line strong { font-size:14px; font-weight:1000; }
.enrollment-line span { margin-top:3px; color:var(--muted,#64748b); font-size:12px; font-weight:750; }
@media (min-width:680px) { .ba-page{padding:calc(12px * var(--local-density-scale,1));} .enrollment-filter{grid-template-columns:repeat(2,minmax(0,1fr));} .ba-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr));} .ba-grid,.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr));} .ba-stats{grid-template-columns:repeat(3,minmax(0,1fr));} .ba-form{grid-template-columns:repeat(3,minmax(0,1fr));} .ba-modal-backdrop{place-items:center; padding:18px;} .ba-modal{padding:18px;} }
@media (min-width:1040px) { .ba-page{padding:calc(16px * var(--local-density-scale,1));} .enrollment-filter{grid-template-columns:minmax(260px,1.35fr) repeat(5,minmax(150px,1fr));} .enrollment-summary-grid{grid-template-columns:repeat(6,minmax(0,1fr));} .enrollment-analysis-grid{grid-template-columns:repeat(5,minmax(0,1fr));} }
@media (max-width:520px) { .ba-page{padding:calc(6px * var(--local-density-scale,1));} .ba-hero{flex-direction:column; border-radius:22px; padding:10px;} .ba-hero-actions{display:grid; grid-template-columns:minmax(0,1fr);} .ba-switch,.ba-ghost,.ba-primary{width:100%;} .ba-switch{display:grid; grid-template-columns:repeat(3,minmax(0,1fr));} .ba-summary-grid{gap:6px;} .ba-summary{padding:10px; border-radius:19px;} .ba-summary strong{font-size:16px;} .ba-card,.ba-analysis,.ba-table-card,.ba-empty,.ba-modal{border-radius:20px; padding:11px;} .ba-avatar{width:50px; height:50px; flex-basis:50px;} .ba-modal-actions{display:grid; grid-template-columns:minmax(0,1fr);} }


/* Golden Students.tsx compact shell overrides for StudentEnrollment. */
.ba-hero,
.ba-context,
.ba-filter,
.ba-summary-grid,
.ba-toolbar,
.ba-tabs,
.ba-toolbar-count { display: none !important; }

.ba-search-card { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 8px; align-items: center; margin-top: 2px; padding: 8px; border-radius: 24px; background: var(--card-bg, var(--surface,#fff)); border: 1px solid var(--border,rgba(0,0,0,.10)); box-shadow: 0 12px 28px rgba(15,23,42,.045); }
.ba-search { min-width: 0; display: grid; grid-template-columns: auto minmax(0,1fr); align-items: center; gap: 8px; min-height: 44px; padding: 0 11px; border-radius: 18px; background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent); }
.ba-search span { color: var(--muted,#64748b); font-size: 17px; font-weight: 1000; }
.ba-search input { min-height: 42px; border: 0; padding: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: 14px; }
.ba-icon-button,.ba-filter-button,.ba-add-inline { width: 42px; height: 42px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; display: grid; place-items: center; background: var(--card-bg,var(--surface,#fff)); color: var(--text,#111827); font-size: 18px; font-weight: 1000; cursor: pointer; box-shadow: 0 10px 22px rgba(15,23,42,.045); }
.ba-add-inline { flex: 0 0 42px; border-color: var(--ba-primary); background: var(--ba-primary); color: #fff; font-size: 25px; line-height: 1; box-shadow: 0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent); }
.ba-filter-button { position: relative; background: color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff)); color: var(--ba-primary); }
.ba-filter-button.active { background: var(--ba-primary); color: #fff; border-color: var(--ba-primary); }
.ba-filter-button b { position: absolute; top: -4px; right: -4px; min-width: 19px; height: 19px; display: grid; place-items: center; border-radius: 999px; background: #ef4444; color: #fff; font-size: 10px; border: 2px solid var(--card-bg,#fff); }
.ba-slider-icon { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.ba-filter-chips { display: flex; gap: 7px; overflow-x: auto; padding: 8px 1px 0; scrollbar-width: none; -ms-overflow-style: none; }
.ba-filter-chips::-webkit-scrollbar { display: none; }
.ba-filter-chips button { flex: 0 0 auto; min-height: 31px; border: 0; border-radius: 999px; padding: 0 10px; background: color-mix(in srgb,var(--ba-primary) 11%,transparent); color: var(--ba-primary); font-size: 11px; font-weight: 950; white-space: nowrap; cursor: pointer; }
.ba-list { display: grid; gap: 7px; margin-top: 10px; }
.enrollment-row { width: 100%; display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 10px; border-radius: 22px; text-align: left; cursor: pointer; background: var(--card-bg,var(--surface,#fff)); border: 1px solid var(--border,rgba(0,0,0,.10)); box-shadow: 0 12px 28px rgba(15,23,42,.045); transition: transform .16s cubic-bezier(.2,.8,.2,1), box-shadow .16s cubic-bezier(.2,.8,.2,1), border-color .16s cubic-bezier(.2,.8,.2,1); }
.enrollment-row:hover { transform: translateY(-1px); border-color: color-mix(in srgb,var(--ba-primary) 24%,var(--border,rgba(0,0,0,.10))); box-shadow: 0 16px 34px rgba(15,23,42,.07); }
.enrollment-main,.enrollment-main strong,.enrollment-main small,.enrollment-main em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.enrollment-main strong { color: var(--text,#111827); font-size: 14px; font-weight: 1000; letter-spacing: -.02em; }
.enrollment-main small { margin-top: 3px; color: var(--muted,#64748b); font-size: 12px; font-weight: 850; font-style: normal; }
.enrollment-main em { margin-top: 3px; color: color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827)); font-size: 11px; font-weight: 750; font-style: normal; }
.enrollment-side { display: grid; justify-items: end; gap: 6px; flex: 0 0 auto; }
.enrollment-side i { color: var(--muted,#64748b); font-style: normal; font-size: 18px; font-weight: 1000; line-height: 1; }
.status-dot-mini { width: 10px; height: 10px; display: inline-block; border-radius: 999px; background: var(--muted,#64748b); box-shadow: 0 0 0 4px color-mix(in srgb,currentColor 10%,transparent); }
.status-dot-mini.green { background: #22c55e; } .status-dot-mini.blue { background: #3b82f6; } .status-dot-mini.orange { background: #f59e0b; } .status-dot-mini.red { background: #ef4444; } .status-dot-mini.gray { background: #64748b; }
.ba-sheet-backdrop,.ba-modal-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: end center; padding: 10px; background: rgba(15,23,42,.58); backdrop-filter: blur(12px); }
.ba-sheet { width: min(560px,100%); max-height: min(88dvh,760px); overflow-y: auto; padding: 14px; border-radius: 28px; background: var(--card-bg,var(--surface,#fff)); border: 1px solid var(--border,rgba(0,0,0,.10)); box-shadow: 0 30px 90px rgba(15,23,42,.35); }
.ba-sheet.small { width: min(460px,100%); }
.ba-sheet-head,.ba-sheet-profile { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 2px 2px 14px; }
.ba-sheet-head h2,.ba-sheet-profile h2 { margin: 0; font-size: 20px; font-weight: 1000; letter-spacing: -.05em; color: var(--text,#111827); }
.ba-sheet-head p,.ba-sheet-profile p { margin: 5px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.5; }
.ba-sheet-head button,.ba-sheet-profile button { width: 38px; height: 38px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; background: var(--surface,#fff); color: var(--text,#111827); font-weight: 1000; cursor: pointer; }
.ba-form.compact { gap: 9px; }
.ba-sheet-actions { position: sticky; bottom: -14px; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 14px; padding: 12px 0 2px; background: linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent); }
.ba-sheet-actions button { min-height: 38px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; padding: 0 13px; background: var(--surface,#fff); color: var(--text,#111827); font-size: 12px; font-weight: 950; cursor: pointer; }
.ba-sheet-actions .primary { background: var(--ba-primary); color: #fff; border-color: var(--ba-primary); }
.ba-menu-list { display: grid; gap: 8px; }
.ba-menu-list button { width: 100%; min-height: 58px; display: grid; grid-template-columns: 34px minmax(0,1fr); align-items: center; column-gap: 10px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 18px; padding: 10px; background: var(--surface,#fff); color: var(--text,#111827); text-align: left; cursor: pointer; }
.ba-menu-list button > span { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 14px; background: color-mix(in srgb,var(--ba-primary) 10%,transparent); color: var(--ba-primary); font-weight: 1000; }
.ba-menu-list button b,.ba-menu-list button small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-menu-list button b { font-size: 13px; font-weight: 1000; }
.ba-menu-list button small { margin-top: 2px; color: var(--muted,#64748b); font-size: 11px; font-weight: 750; }
.ba-menu-list button.active { border-color: color-mix(in srgb,var(--ba-primary) 36%,var(--border,rgba(0,0,0,.10))); background: color-mix(in srgb,var(--ba-primary) 9%,var(--surface,#fff)); }
.ba-menu-list button.danger { color: #991b1b; }
.ba-menu-list button.danger > span { background: rgba(239,68,68,.10); color: #dc2626; }
.enrollment-detail-strip,.enrollment-insights { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 7px; margin-bottom: 10px; }
.enrollment-insights { grid-template-columns: repeat(2,minmax(0,1fr)); }
.enrollment-detail-strip span,.enrollment-insights span { min-height: 50px; display: grid; align-content: center; gap: 3px; padding: 9px; border-radius: 16px; background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent); color: var(--muted,#64748b); font-size: 11px; font-weight: 850; overflow: hidden; }
.enrollment-detail-strip b,.enrollment-insights b { display: block; color: var(--text,#111827); font-size: 13px; font-weight: 1000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-table-scroll th:first-child::after { content: ""; }
.ba-table-actions { flex-wrap: nowrap; overflow-x: auto; }
.ba-table-actions .ba-delete { color: var(--muted,#64748b); background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff)); border-color: color-mix(in srgb,var(--muted,#64748b) 24%,var(--border,rgba(0,0,0,.10))); }
@media (min-width:680px) { .ba-list { grid-template-columns: repeat(2,minmax(0,1fr)); max-width: 1180px; margin-left: auto; margin-right: auto; } .ba-modal-backdrop,.ba-sheet-backdrop { place-items: center; padding: 18px; } }
@media (min-width:1040px) { .ba-search-card,.ba-filter-chips,.ba-list,.ba-analysis-grid,.ba-table-card { max-width: 1180px; margin-left: auto; margin-right: auto; } .ba-list { grid-template-columns: repeat(3,minmax(0,1fr)); } }
@media (max-width:520px) { .ba-search-card { gap: 6px; padding: 7px; border-radius: 22px; } .ba-icon-button,.ba-filter-button,.ba-add-inline { width: 40px; height: 40px; } .enrollment-row { padding: 9px; border-radius: 20px; } .ba-avatar { width: 46px; height: 46px; border-radius: 17px; } .ba-sheet { border-radius: 20px; padding: 11px; } .ba-sheet-actions { display: grid; grid-template-columns: minmax(0,1fr); } }
`;
