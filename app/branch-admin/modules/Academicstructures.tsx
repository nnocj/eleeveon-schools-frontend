"use client";

/**
 * app/branch-admin/modules/Academicstructures.tsx
 * Eleeveon Academic Structures V2.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this branch-admin academic module from accidentally using stale
 *   school/branch context left behind by another role or portal
 * - all reads and writes now use the resolved workspace schoolId and branchId
 *
 * Golden standard upgrade:
 * - no duplicate hero/header block inside the module
 * - compact search + inline add + slider filter + more menu
 * - filters and advanced views moved into sheets
 * - compact list-row card design copied from Students.tsx golden standard
 * - table and analytics use ba-* theme-safe styles
 * - createLocal/updateLocal/softDeleteLocal/listActiveLocal used instead of manual sync payloads
 *
 * Golden close/action fix:
 * - card/sheet/modal close buttons now reuse the same theme-safe pattern as the More modal
 * - no input, modal layout, CRUD, sync or data behavior was changed
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  db,
  type AcademicLevel,
  type AcademicPeriod,
  type AcademicStructure,
  type AssessmentStructure,
  type Class,
  type ClassSubject,
} from "../../lib/db";

import { createLocal, updateLocal, softDeleteLocal, listActiveLocal } from "../../lib/sync/syncUtils";

type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type StatusFilter = "all" | "active" | "inactive";

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type AcademicStructureForm = {
  id?: number;
  name: string;
  level: AcademicLevel | string;
  startDate: string;
  endDate: string;
  photo: string;
  bannerImage: string;
  active: boolean;
};

type StructureStats = {
  periodCount: number;
  classCount: number;
  classSubjectCount: number;
  assessmentStructureCount: number;
};

type StructureView = {
  id: number;
  row: AcademicStructure;
  levelName: string;
  stats: StructureStats;
  active: boolean;
  current: boolean;
};

const ACADEMIC_LEVELS: { label: string; value: AcademicLevel | string }[] = [
  { label: "Creche / Nursery", value: "nursery" },
  { label: "Kindergarten", value: "kindergarten" },
  { label: "Primary", value: "primary" },
  { label: "Junior High", value: "jhs" },
  { label: "Senior High", value: "shs" },
  { label: "Tertiary", value: "tertiary" },
  { label: "Vocational / Technical", value: "vocational" },
  { label: "Custom", value: "custom" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const endOfYearISO = () => `${new Date().getFullYear()}-12-31`;

const emptyForm = (): AcademicStructureForm => ({
  name: "",
  level: "primary",
  startDate: todayISO(),
  endDate: endOfYearISO(),
  photo: "",
  bannerImage: "",
  active: true,
});

const idOf = (value: any) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
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


const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (value: any) => String(value || "").toLowerCase().trim();
const tableSafe = (name: string) => (db as any)[name];

const isActiveRow = (row: any) => {
  if (!row || row.isDeleted) return false;
  if (row.active === false) return false;
  const status = safeLower(row.status);
  return !["inactive", "deleted", "archived", "suspended"].includes(status);
};

const timeText = (value?: string | number | null) => {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return String(value);
  try {
    return new Intl.DateTimeFormat("en-GH", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(time));
  } catch {
    return String(value);
  }
};

const levelLabel = (value?: string | null) => {
  const found = ACADEMIC_LEVELS.find((row) => sameId(row.value, value));
  return found?.label || value || "Not set";
};

const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "");
  if (!media) return undefined;
  if (media.startsWith("blob:")) return undefined;
  return media;
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });

function countByStructure<T extends any[]>(rows: T, getStructureId: (row: T[number]) => any) {
  const map = new Map<number, number>();
  rows.forEach((row) => {
    const id = idOf(getStructureId(row));
    if (!id) return;
    map.set(id, (map.get(id) || 0) + 1);
  });
  return map;
}

function statusTone(item: StructureView): "green" | "purple" | "gray" {
  if (item.current) return "purple";
  return item.active ? "green" : "gray";
}

function statusLabel(item: StructureView) {
  if (item.current) return "Current";
  return item.active ? "Active" : "Inactive";
}

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
        background: photo
          ? `url(${photo}) center/cover`
          : `linear-gradient(135deg, ${primary}, rgba(15,23,42,.9))`,
      }}
    >
      {!photo && String(name || "AS").slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function Academicstructures() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount() as any;
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
  const currentStructureId = idOf(settings?.currentAcademicStructureId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [levelFilter, setLevelFilter] = useState("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StructureView | null>(null);

  const [structures, setStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [assessmentStructures, setAssessmentStructures] = useState<AssessmentStructure[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<AcademicStructureForm>(emptyForm());
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
    // Missing branch workspace is handled locally so the selected-role flow is not broken.
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
    setStructures([]);
    setPeriods([]);
    setClasses([]);
    setClassSubjects([]);
    setAssessmentStructures([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [structureRows, periodRows, classRows, classSubjectRows, assessmentStructureRows] = await Promise.all([
        tableSafe("academicStructures")?.toArray?.() || [],
        tableSafe("academicPeriods")?.toArray?.() || [],
        listActiveLocal("classes", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        tableSafe("classSubjects")?.toArray?.() || [],
        tableSafe("assessmentStructures")?.toArray?.() || [],
      ]);

      setStructures(
        (structureRows as AcademicStructure[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort((a: any, b: any) => {
            const aCurrent = sameId(a.id, currentStructureId) ? 1 : 0;
            const bCurrent = sameId(b.id, currentStructureId) ? 1 : 0;
            return bCurrent - aCurrent || String(a.name || "").localeCompare(String(b.name || ""));
          })
      );
      setPeriods((periodRows as AcademicPeriod[]).filter((row) => sameTenant(row as TenantRow)));
      setClasses((classRows as Class[]).sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || ""))));
      setClassSubjects((classSubjectRows as ClassSubject[]).filter((row) => sameTenant(row as TenantRow)));
      setAssessmentStructures((assessmentStructureRows as AssessmentStructure[]).filter((row) => sameTenant(row as TenantRow)));
    } catch (error) {
      console.error("Failed to load academic structures:", error);
      clearData();
      showToast("error", "Failed to load academic structures.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, currentStructureId, accountLoading, settingsLoading, contextLoading]);

  const periodCountByStructure = useMemo(() => countByStructure(periods, (row: any) => row.academicStructureId), [periods]);
  const classCountByStructure = useMemo(() => countByStructure(classes, (row: any) => row.academicStructureId), [classes]);
  const classSubjectCountByStructure = useMemo(() => countByStructure(classSubjects, (row: any) => row.academicStructureId), [classSubjects]);
  const assessmentCountByStructure = useMemo(() => countByStructure(assessmentStructures, (row: any) => row.academicStructureId), [assessmentStructures]);

  const getStats = (structureId?: number): StructureStats => {
    const id = idOf(structureId);
    return {
      periodCount: periodCountByStructure.get(id) || 0,
      classCount: classCountByStructure.get(id) || 0,
      classSubjectCount: classSubjectCountByStructure.get(id) || 0,
      assessmentStructureCount: assessmentCountByStructure.get(id) || 0,
    };
  };

  const viewRows = useMemo<StructureView[]>(
    () =>
      structures.map((row: any) => ({
        id: idOf(row.id),
        row,
        levelName: levelLabel(row.level),
        stats: getStats(row.id),
        active: isActiveRow(row),
        current: sameId(row.id, currentStructureId),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structures, currentStructureId, periodCountByStructure, classCountByStructure, classSubjectCountByStructure, assessmentCountByStructure]
  );

  const levelOptions = useMemo(() => {
    const levels = Array.from(new Set(structures.map((row: any) => String(row.level || "").trim()).filter(Boolean)));
    return levels.sort((a, b) => levelLabel(a).localeCompare(levelLabel(b)));
  }, [structures]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return viewRows
      .filter((item) => {
        const row: any = item.row;
        const searchOk =
          !term ||
          `${row.name || ""} ${row.level || ""} ${item.levelName} ${row.startDate || ""} ${row.endDate || ""}`
            .toLowerCase()
            .includes(term);
        const statusOk = statusFilter === "all" || (statusFilter === "active" ? item.active : !item.active);
        const levelOk = levelFilter === "all" || sameId(row.level, levelFilter);
        return searchOk && statusOk && levelOk;
      })
      .sort((a, b) => Number(b.current) - Number(a.current) || String((a.row as any).name || "").localeCompare(String((b.row as any).name || "")));
  }, [levelFilter, search, statusFilter, viewRows]);

  const summary = useMemo(() => {
    const configured = viewRows.filter((row) => row.stats.periodCount > 0).length;
    return {
      total: viewRows.length,
      active: viewRows.filter((row) => row.active).length,
      inactive: viewRows.filter((row) => !row.active).length,
      configured,
      classes: classes.length,
      assessments: assessmentStructures.length,
      showing: filteredRows.length,
    };
  }, [assessmentStructures.length, classes.length, filteredRows.length, viewRows]);

  const activeFilterCount = useMemo(() => [statusFilter, levelFilter].filter((value) => value !== "all" && value !== "active").length + (statusFilter !== "active" ? 1 : 0), [levelFilter, statusFilter]);

  const countsByLevel = useMemo(() => groupedCounts(viewRows, (item) => item.levelName), [viewRows]);
  const countsByStatus = useMemo(() => groupedCounts(viewRows, (item) => (item.active ? "Active" : "Inactive")), [viewRows]);
  const countsBySetup = useMemo(() => groupedCounts(viewRows, (item) => (item.stats.periodCount ? "Configured" : "Needs periods")), [viewRows]);

  const updateForm = (patch: Partial<AcademicStructureForm>) => setForm((current) => ({ ...current, ...patch }));

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const openCreate = () => {
    if (!requireTenant()) return;
    setSelectedItem(null);
    setForm({ ...emptyForm(), level: levelFilter !== "all" ? levelFilter : "primary", active: statusFilter !== "inactive" });
    setModalOpen(true);
  };

  const openEdit = (row: AcademicStructure) => {
    const item: any = row;
    setSelectedItem(null);
    setForm({
      id: idOf(item.id),
      name: item.name || "",
      level: item.level || "primary",
      startDate: item.startDate || todayISO(),
      endDate: item.endDate || endOfYearISO(),
      photo: safeRecordMediaValue(item.photo) || "",
      bannerImage: safeRecordMediaValue(item.bannerImage) || "",
      active: isActiveRow(item),
    });
    setModalOpen(true);
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId || !branchId) return "Select a school branch first.";
    if (!form.name.trim()) return "Enter academic structure name.";
    if (!form.level) return "Select academic level.";
    if (!form.startDate) return "Select start date.";
    if (!form.endDate) return "Select end date.";
    if (form.endDate < form.startDate) return "End date cannot be before start date.";

    const duplicate = structures.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      if (row.isDeleted) return false;
      return safeLower(row.name) === safeLower(form.name);
    });

    if (duplicate) return "Academic structure with this name already exists in this branch.";
    return "";
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
      const existing = form.id ? structures.find((row: any) => sameId(row.id, form.id)) : undefined;
      const payload: Partial<AcademicStructure> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        name: form.name.trim(),
        level: form.level as AcademicLevel,
        startDate: form.startDate,
        endDate: form.endDate,
        photo: safeRecordMediaValue(form.photo),
        bannerImage: safeRecordMediaValue(form.bannerImage),
        active: form.active,
        status: form.active ? "active" : "inactive",
        isDeleted: false,
      } as unknown as Partial<AcademicStructure>;

      if (form.id && existing) await updateLocal("academicStructures", Number(form.id), payload);
      else await createLocal("academicStructures", payload as AcademicStructure);

      setModalOpen(false);
      showToast("success", form.id ? "Academic structure updated." : "Academic structure created.");
      await load();
    } catch (error) {
      console.error("Failed to save academic structure:", error);
      showToast("error", "Failed to save academic structure.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (item: StructureView) => {
    const row: any = item.row;
    const stats = item.stats;
    const linked = stats.periodCount || stats.classCount || stats.assessmentStructureCount;
    const warning = linked
      ? `"${row.name}" has linked records. Delete anyway? Existing child records will remain, but this structure will be soft deleted locally.`
      : `Delete "${row.name}"?`;

    if (!window.confirm(warning)) return;
    await softDeleteLocal("academicStructures", Number(row.id));
    setSelectedItem(null);
    showToast("success", "Academic structure deleted.");
    await load();
  };

  const toggleActive = async (item: StructureView) => {
    const row: any = item.row;
    if (!row.id) return;
    await updateLocal("academicStructures", Number(row.id), {
      active: !item.active,
      status: !item.active ? "active" : "inactive",
      isDeleted: false,
    } as unknown as Partial<AcademicStructure>);
    setSelectedItem(null);
    showToast("success", item.active ? "Academic structure deactivated." : "Academic structure activated.");
    await load();
  };

  const setAsCurrent = async (item: StructureView) => {
    try {
      const settingsRows = await tableSafe("schoolBranchSettings")?.toArray?.();
      const branchSetting = (settingsRows || []).find((row: any) => sameTenant(row));

      if (!branchSetting?.id) {
        showToast("error", "Create branch settings first before setting current academic structure.");
        return;
      }

      await updateLocal("schoolBranchSettings", Number(branchSetting.id), {
        currentAcademicStructureId: item.id,
      } as any);

      setSelectedItem(null);
      showToast("success", `"${(item.row as any).name}" is now the current academic structure.`);
      await load();
    } catch (error) {
      console.error("Failed to set current academic structure:", error);
      showToast("error", "Failed to set current academic structure.");
    }
  };

  const uploadImage = async (target: "photo" | "bannerImage", file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [target]: value } as Partial<AcademicStructureForm>);
  };

  const clearFilters = () => {
    setStatusFilter("active");
    setLevelFilter("all");
  };

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return <State primary={primary} title="Opening Academic Structures..." text="Checking account, branch, periods, classes and assessment links." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing academic structures." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>Academic structures belong to one active school branch.</p>
          <button type="button" className="ba-state-button" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
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

      <section className="ba-search-card" aria-label="Academic structure search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search structures..." aria-label="Search academic structures" />
        </label>

        <button type="button" className="ba-add-inline" onClick={openCreate} aria-label="Add academic structure">
          +
        </button>

        <button type="button" className={`ba-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">
          ⋯
        </button>
      </section>

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {levelFilter !== "all" && (
            <button type="button" onClick={() => setLevelFilter("all")}>
              Level: {levelLabel(levelFilter)} ×
            </button>
          )}
          {statusFilter !== "active" && (
            <button type="button" onClick={() => setStatusFilter("active")}>
              Status: {statusFilter === "all" ? "All" : "Inactive"} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard title="Structures by Level" rows={countsByLevel} total={summary.total} />
          <AnalysisCard title="Structures by Status" rows={countsByStatus} total={summary.total} />
          <AnalysisCard title="Setup Health" rows={countsBySetup} total={summary.total} />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{summary.showing}</strong>
            <p>Academic structure record(s) currently match your search and filter conditions.</p>
          </article>
        </section>
      )}

      {viewMode === "table" && <TableView rows={filteredRows} openEdit={openEdit} archive={archive} toggleActive={toggleActive} setAsCurrent={setAsCurrent} />}

      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredRows.map((item) => (
            <StructureListItem key={String(item.id)} item={item} primary={primary} onOpen={() => setSelectedItem(item)} />
          ))}

          {!filteredRows.length && (
            <Empty icon="🧱" title="No academic structures found" text="Create structures such as Primary, JHS, SHS, Montessori, vocational, or custom levels for this branch." />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          levelOptions={levelOptions}
          levelFilter={levelFilter}
          statusFilter={statusFilter}
          setLevelFilter={setLevelFilter}
          setStatusFilter={setStatusFilter}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
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
        <ActionSheet item={selectedItem} openEdit={openEdit} archive={archive} toggleActive={toggleActive} setAsCurrent={setAsCurrent} onClose={() => setSelectedItem(null)} />
      )}

      {modalOpen && <StructureModal form={form} saving={saving} updateForm={updateForm} uploadImage={uploadImage} setModalOpen={setModalOpen} save={save} />}
    </main>
  );
}

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function StructureListItem({ item, primary, onOpen }: { item: StructureView; primary: string; onOpen: () => void }) {
  const row: any = item.row;
  return (
    <button type="button" className="student-row" onClick={onOpen}>
      <Avatar name={row.name} photo={safeRecordMediaValue(row.photo)} primary={primary} />
      <span className="student-main">
        <strong>{row.name || "Unnamed structure"}</strong>
        <small>
          {item.levelName} · {timeText(row.startDate)} - {timeText(row.endDate)}
        </small>
        <em>
          {item.stats.periodCount} periods · {item.stats.classCount} classes · {item.stats.assessmentStructureCount} assessments
        </em>
      </span>
      <span className="student-side">
        <span className={`status-dot-mini ${statusTone(item)}`} title={statusLabel(item)} aria-label={statusLabel(item)} />
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
  levelOptions,
  levelFilter,
  statusFilter,
  setLevelFilter,
  setStatusFilter,
  clearFilters,
  onClose,
}: {
  levelOptions: string[];
  levelFilter: string;
  statusFilter: StatusFilter;
  setLevelFilter: (value: string) => void;
  setStatusFilter: (value: StatusFilter) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Filter academic structures by level and active state.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Level</span>
            <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
              <option value="all">All levels</option>
              {levelOptions.map((level) => (
                <option key={level} value={level}>
                  {levelLabel(level)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive / archived</option>
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={clearFilters}>Clear</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({ viewMode, setViewMode, onRefresh, onClose }: { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views are here so the main page stays simple.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="ba-menu-list">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            <span>☰</span><b>List view</b><small>Compact academic structures</small>
          </button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            <span>☷</span><b>Table view</b><small>Dense structure records</small>
          </button>
          <button type="button" className={viewMode === "summary" ? "active" : ""} onClick={() => setViewMode("summary")}>
            <span>◔</span><b>Analytics</b><small>Level, status and setup summaries</small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span><b>Refresh</b><small>Reload local branch records</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function ActionSheet({
  item,
  openEdit,
  archive,
  toggleActive,
  setAsCurrent,
  onClose,
}: {
  item: StructureView;
  openEdit: (row: AcademicStructure) => void;
  archive: (item: StructureView) => void;
  toggleActive: (item: StructureView) => void;
  setAsCurrent: (item: StructureView) => void;
  onClose: () => void;
}) {
  const row: any = item.row;
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{row.name || "Academic Structure"}</h2>
            <p>{item.levelName} · {statusLabel(item)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close structure actions">✕</button>
        </div>

        <div className="student-detail-strip">
          <span><b>Periods</b>{item.stats.periodCount}</span>
          <span><b>Classes</b>{item.stats.classCount}</span>
          <span><b>Assessments</b>{item.stats.assessmentStructureCount}</span>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(item.row)}><span>✎</span><b>Edit structure</b><small>Update name, dates, level and media</small></button>
          {!item.current && <button type="button" onClick={() => setAsCurrent(item)}><span>★</span><b>Set current</b><small>Use this for active academic work</small></button>}
          <button type="button" onClick={() => toggleActive(item)}><span>{item.active ? "⏸" : "✓"}</span><b>{item.active ? "Deactivate" : "Activate"}</b><small>Change active visibility without deleting</small></button>
          <button type="button" className="danger" onClick={() => archive(item)}><span>⌫</span><b>Delete</b><small>Soft delete this structure locally</small></button>
        </div>
      </section>
    </div>
  );
}

function TableView({ rows, openEdit, archive, toggleActive, setAsCurrent }: { rows: StructureView[]; openEdit: (row: AcademicStructure) => void; archive: (item: StructureView) => void; toggleActive: (item: StructureView) => void; setAsCurrent: (item: StructureView) => void }) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Structures ({rows.length})</th><th>Level</th><th>Dates</th><th>Periods</th><th>Classes</th><th>Class Subjects</th><th>Assessments</th><th>Status</th><th>Updated</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const row: any = item.row;
              return (
                <tr key={String(item.id)}>
                  <td><strong>{row.name}</strong><span>{item.current ? "Current academic structure" : "Branch academic structure"}</span></td>
                  <td>{item.levelName}</td>
                  <td>{timeText(row.startDate)} - {timeText(row.endDate)}</td>
                  <td>{item.stats.periodCount}</td>
                  <td>{item.stats.classCount}</td>
                  <td>{item.stats.classSubjectCount}</td>
                  <td>{item.stats.assessmentStructureCount}</td>
                  <td><Chip tone={statusTone(item)}>{statusLabel(item)}</Chip></td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEdit(item.row)}>Edit</button>
                      {!item.current && <button type="button" onClick={() => setAsCurrent(item)}>Set Current</button>}
                      <button type="button" onClick={() => toggleActive(item)}>{item.active ? "Deactivate" : "Activate"}</button>
                      <button type="button" className="ba-delete" onClick={() => archive(item)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="ba-empty-table">No academic structure matches your filters.</div>}
      </div>
    </section>
  );
}

function StructureModal({
  form,
  saving,
  updateForm,
  uploadImage,
  setModalOpen,
  save,
}: {
  form: AcademicStructureForm;
  saving: boolean;
  updateForm: (patch: Partial<AcademicStructureForm>) => void;
  uploadImage: (target: "photo" | "bannerImage", file?: File) => void | Promise<void>;
  setModalOpen: (open: boolean) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Academic Structure" : "Add Academic Structure"}</h2>
            <p>Define the academic level used by periods, classes, assessments and reports.</p>
          </div>
          <button type="button" onClick={() => setModalOpen(false)} aria-label="Close form">✕</button>
        </div>

        <section className="ba-form-section">
          <h3>Structure</h3>
          <div className="ba-form">
            <label><span>Name</span><input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="e.g. Primary, JHS, SHS" /></label>
            <label><span>Academic Level</span><select value={form.level} onChange={(event) => updateForm({ level: event.target.value })}>{ACADEMIC_LEVELS.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}</select></label>
            <label><span>Status</span><select value={form.active ? "active" : "inactive"} onChange={(event) => updateForm({ active: event.target.value === "active" })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            <label><span>Start Date</span><input type="date" value={form.startDate} onChange={(event) => updateForm({ startDate: event.target.value })} /></label>
            <label><span>End Date</span><input type="date" value={form.endDate} onChange={(event) => updateForm({ endDate: event.target.value })} /></label>
          </div>
        </section>

        <section className="ba-form-section">
          <h3>Media</h3>
          <div className="ba-form two">
            <label>
              <span>Photo</span>
              <label className="ba-media-button">Upload Photo<input type="file" accept="image/*" onChange={(event) => uploadImage("photo", event.target.files?.[0])} hidden /></label>
              {form.photo && <img src={form.photo} alt="Academic structure preview" className="ba-preview-photo" />}
            </label>
            <label>
              <span>Banner Image</span>
              <label className="ba-media-button">Upload Banner<input type="file" accept="image/*" onChange={(event) => uploadImage("bannerImage", event.target.files?.[0])} hidden /></label>
              {form.bannerImage && <img src={form.bannerImage} alt="Academic structure banner preview" className="ba-preview-banner" />}
            </label>
          </div>
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? "Saving..." : form.id ? "Save Changes" : "Add Structure"}</button>
        </div>
      </form>
    </div>
  );
}

function groupedCounts(rows: StructureView[], keyFn: (item: StructureView) => string) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyFn(row) || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function AnalysisCard({ title, rows, total }: { title: string; rows: { label: string; value: number }[]; total: number }) {
  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{rows.reduce((sum, row) => sum + row.value, 0)}</strong>
      <div className="ba-analysis-list">
        {rows.slice(0, 8).map((row) => {
          const share = total ? Math.round((row.value / total) * 100) : 0;
          return (
            <section key={row.label}>
              <div><b>{row.label}</b><small>{row.value} · {share}%</small></div>
              <div className="ba-progress"><i style={{ width: `${Math.max(4, share)}%` }} /></div>
            </section>
          );
        })}
        {!rows.length && <p>No data available.</p>}
      </div>
    </article>
  );
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }
.ba-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}.ba-page button{-webkit-tap-highlight-color:transparent}.ba-page input,.ba-page select,.ba-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ba-page textarea{min-height:92px;padding-top:10px;resize:vertical}.ba-page input:focus,.ba-page select:focus,.ba-page textarea:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}.ba-state,.ba-search-card,.ba-card,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet,.ba-modal,.student-row{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer}.ba-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.ba-toast.success{background:rgba(34,197,94,.14);color:#166534}.ba-toast.error{background:rgba(239,68,68,.12);color:#991b1b}.ba-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}.ba-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ba-add-inline{flex:0 0 42px;border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:25px;line-height:1;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ba-list{display:grid;grid-template-columns:minmax(0,1fr);gap:7px;margin-top:10px}.student-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}.student-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 24%,var(--border,rgba(0,0,0,.10)));box-shadow:0 16px 34px rgba(15,23,42,.07)}.ba-avatar{width:44px;height:44px;flex:0 0 auto;display:grid;place-items:center;border-radius:17px;color:#fff;font-size:12px;font-weight:1000;box-shadow:0 10px 20px rgba(15,23,42,.12);overflow:hidden}.student-main{display:grid;gap:2px;min-width:0}.student-main strong,.student-main small,.student-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.student-main strong{font-size:14px;font-weight:1000;letter-spacing:-.025em;color:var(--text,#111827)}.student-main small{color:var(--muted,#64748b);font-size:12px;font-weight:800}.student-main em{color:color-mix(in srgb,var(--muted,#64748b) 82%,var(--text,#111827));font-style:normal;font-size:11px;font-weight:760}.student-side{display:flex;align-items:center;gap:10px;color:var(--muted,#64748b)}.student-side i{font-style:normal;font-size:18px;font-weight:1000}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-block;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 14%,transparent)}.status-dot-mini.green{background:#22c55e;color:#22c55e}.status-dot-mini.purple{background:#9333ea;color:#9333ea}.status-dot-mini.gray{background:#94a3b8;color:#94a3b8}.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:rgba(107,114,128,.12);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ba-table-card{margin-top:10px;border-radius:22px;overflow:hidden}.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto}.ba-table-scroll table{width:100%;min-width:1040px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}.ba-table-scroll th,.ba-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.10));vertical-align:top;text-align:left;font-size:13px}.ba-table-scroll th{background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ba-table-scroll td strong,.ba-table-scroll td span{display:block}.ba-table-scroll td strong{font-weight:1000}.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ba-table-actions{display:flex;gap:7px;flex-wrap:nowrap;white-space:nowrap}.ba-table-actions button{min-height:32px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 10%,var(--card-bg,#fff));color:var(--ba-primary);font-size:11px;font-weight:950;cursor:pointer}.ba-table-actions button:first-child{background:var(--ba-primary);color:#fff}.ba-table-actions .ba-delete{color:var(--muted,#64748b);background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff))}.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ba-analysis,.ba-empty{border-radius:22px;padding:13px}.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-analysis-list{display:grid;gap:10px;margin-top:12px}.ba-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ba-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ba-analysis-list b,.ba-analysis-list small{font-size:12px}.ba-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ba-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--card-bg,#fff));font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-sheet-backdrop,.ba-modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.58);backdrop-filter:blur(12px)}.ba-sheet{width:min(680px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px}.ba-sheet.small{width:min(520px,100%)}.ba-sheet-head,.ba-sheet-profile,.ba-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:4px 2px 14px}.ba-sheet-head h2,.ba-sheet-profile h2,.ba-modal-head h2{margin:0;font-size:20px;font-weight:1000;letter-spacing:-.05em}.ba-sheet-head p,.ba-sheet-profile p,.ba-modal-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-sheet-head button,.ba-sheet-profile button,.ba-modal-head button{width:38px;height:38px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827);font-weight:1000;cursor:pointer}.ba-form{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-form.two{grid-template-columns:minmax(0,1fr)}.ba-form.compact{gap:10px}.ba-form label{display:grid;gap:6px;min-width:0}.ba-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ba-form-section{display:grid;gap:10px;margin-top:12px}.ba-form-section h3{margin:0;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted,#64748b);font-weight:1000}.ba-sheet-actions,.ba-modal-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px}.ba-sheet-actions button,.ba-modal-actions button{min-height:40px;border:0;border-radius:999px;padding:0 14px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ba-sheet-actions .primary,.ba-modal-actions button:last-child{background:var(--ba-primary);color:#fff}.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:10px;row-gap:2px;align-items:center;width:100%;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:11px;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);text-align:left;cursor:pointer}.ba-menu-list button span{grid-row:1/3;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list button b{font-size:13px;font-weight:1000}.ba-menu-list button small{color:var(--muted,#64748b);font-size:11px;font-weight:760}.ba-menu-list button.active{border-color:color-mix(in srgb,var(--ba-primary) 40%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff))}.ba-menu-list button.danger span{background:rgba(239,68,68,.10);color:#dc2626}.student-detail-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:10px}.student-detail-strip span{padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--muted,#64748b);font-size:11px;font-weight:850;overflow:hidden}.student-detail-strip b{display:block;color:var(--text,#111827);font-size:15px;font-weight:1000;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-modal{width:min(900px,100%);max-height:min(92dvh,900px);overflow-y:auto;padding:14px;border-radius:28px;box-shadow:0 30px 90px rgba(15,23,42,.35)}.ba-modal-actions{position:sticky;bottom:-14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.ba-media-button{width:max-content!important;max-width:100%;min-height:32px!important;display:inline-flex!important;align-items:center;justify-content:center;border-radius:999px;padding:0 10px!important;background:var(--ba-primary);color:#fff!important;font-size:11px!important;font-weight:950!important;line-height:1!important;cursor:pointer;box-shadow:0 8px 18px color-mix(in srgb,var(--ba-primary) 16%,transparent)}.ba-preview-photo{width:96px;height:96px;object-fit:cover;border-radius:22px;border:1px solid var(--border,rgba(0,0,0,.10))}.ba-preview-banner{width:100%;height:130px;object-fit:cover;border-radius:22px;border:1px solid var(--border,rgba(0,0,0,.10))}@media(min-width:680px){.ba-page{padding:12px}.ba-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-form.two{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-modal-backdrop,.ba-sheet-backdrop{place-items:center;padding:18px}.ba-modal,.ba-sheet{padding:18px}}@media(min-width:1040px){.ba-page{padding:16px}.ba-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(min-width:1380px){.ba-list{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:520px){.ba-page{padding:6px}.ba-search-card{gap:6px;padding:7px;border-radius:22px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:40px;height:40px}.ba-list{gap:6px}.student-row{padding:9px;border-radius:20px}.ba-modal,.ba-sheet{border-radius:22px}.student-detail-strip{grid-template-columns:minmax(0,1fr)}}


/* ======================================================
   GOLDEN THEME MODAL VISIBILITY FIX
   ------------------------------------------------------
   Keeps the More/List/Table/Summary modal readable in
   dark mode, light mode, and custom branch themes.
====================================================== */

.ba-sheet,
.ba-modal,
.ba-drawer,
.ba-panel {
  color: var(--text, #111827);
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--primary-color, #2563eb) 8%, transparent), transparent 20rem),
    var(--card-bg, var(--surface, #ffffff));
  border-color: var(--border, rgba(0,0,0,.12));
}

.ba-sheet-head,
.ba-modal-head,
.ba-drawer-head,
.ba-panel-head {
  color: var(--text, #111827);
}

.ba-sheet-head h2,
.ba-modal-head h2,
.ba-drawer-head h2,
.ba-panel-head h2 {
  color: var(--text, #111827);
}

.ba-sheet-head p,
.ba-modal-head p,
.ba-drawer-head p,
.ba-panel-head p {
  color: var(--muted, #64748b);
}

.ba-sheet-head button,
.ba-modal-head button,
.ba-drawer-head button,
.ba-panel-head button,
.ba-close,
.ba-close-button {
  color: var(--text, #111827) !important;
  background: color-mix(in srgb, var(--card-bg, var(--surface, #ffffff)) 92%, var(--primary-color, #2563eb) 8%) !important;
  border: 1px solid var(--border, rgba(0,0,0,.14)) !important;
  box-shadow: 0 10px 24px rgba(15,23,42,.08);
}

.ba-sheet-head button:hover,
.ba-modal-head button:hover,
.ba-drawer-head button:hover,
.ba-panel-head button:hover,
.ba-close:hover,
.ba-close-button:hover {
  color: #ffffff !important;
  background: var(--primary-color, #2563eb) !important;
  border-color: var(--primary-color, #2563eb) !important;
}

.ba-menu-list,
.ba-view-list,
.ba-more-list {
  color: var(--text, #111827);
}

.ba-menu-list button,
.ba-view-list button,
.ba-more-list button {
  color: var(--text, #111827) !important;
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--card-bg, var(--surface, #ffffff)) 96%, var(--primary-color, #2563eb) 4%),
      var(--card-bg, var(--surface, #ffffff))
    ) !important;
  border: 1px solid var(--border, rgba(0,0,0,.12)) !important;
  box-shadow: 0 10px 24px rgba(15,23,42,.05);
}

.ba-menu-list button:hover,
.ba-view-list button:hover,
.ba-more-list button:hover {
  background: color-mix(in srgb, var(--primary-color, #2563eb) 9%, var(--card-bg, var(--surface, #ffffff))) !important;
  border-color: color-mix(in srgb, var(--primary-color, #2563eb) 32%, var(--border, rgba(0,0,0,.12))) !important;
}

.ba-menu-list button.active,
.ba-view-list button.active,
.ba-more-list button.active,
.ba-menu-list button[aria-pressed="true"],
.ba-view-list button[aria-pressed="true"],
.ba-more-list button[aria-pressed="true"] {
  color: var(--text, #111827) !important;
  background: color-mix(in srgb, var(--primary-color, #2563eb) 13%, var(--card-bg, var(--surface, #ffffff))) !important;
  border-color: color-mix(in srgb, var(--primary-color, #2563eb) 42%, var(--border, rgba(0,0,0,.12))) !important;
}

.ba-menu-list button span,
.ba-view-list button span,
.ba-more-list button span {
  color: var(--primary-color, #2563eb) !important;
  background: color-mix(in srgb, var(--primary-color, #2563eb) 12%, transparent) !important;
}

.ba-menu-list button b,
.ba-view-list button b,
.ba-more-list button b,
.ba-menu-list button strong,
.ba-view-list button strong,
.ba-more-list button strong {
  color: var(--text, #111827) !important;
}

.ba-menu-list button small,
.ba-view-list button small,
.ba-more-list button small,
.ba-menu-list button em,
.ba-view-list button em,
.ba-more-list button em {
  color: var(--muted, #64748b) !important;
}

.ba-sheet-actions button,
.ba-modal-actions button,
.ba-drawer-actions button {
  color: var(--text, #111827);
  background: color-mix(in srgb, var(--muted, #64748b) 8%, var(--card-bg, var(--surface, #ffffff)));
  border-color: var(--border, rgba(0,0,0,.12));
}

.ba-sheet-actions button.primary,
.ba-modal-actions button.primary,
.ba-drawer-actions button.primary {
  color: #ffffff;
  background: var(--primary-color, #2563eb);
  border-color: var(--primary-color, #2563eb);
}



/* ======================================================
   GOLDEN THEME CLOSE + INLINE ACTION FIX
   ------------------------------------------------------
   Narrow visual fix only:
   - assessment structure/card close buttons now match the More modal close button
   - assessment item inline edit buttons now follow the same golden theme
   - no form, modal, CRUD, sync, table or layout logic was changed
====================================================== */

.ba-sheet-head button,
.ba-sheet-profile button,
.ba-modal-head button,
.ba-structure-card button[aria-label*="Close"],
.ba-structure-card button[title*="Close"],
.ba-assessment-card button[aria-label*="Close"],
.ba-assessment-card button[title*="Close"],
.ba-item-card button[aria-label*="Close"],
.ba-item-card button[title*="Close"],
.ba-close,
.ba-close-button,
.ba-card-close,
.ba-modal-close,
.ba-sheet-close {
  width: 38px;
  height: 38px;
  min-width: 38px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 999px;
  cursor: pointer;
  color: var(--text, #111827);
  background: color-mix(
    in srgb,
    var(--card-bg, var(--surface, #ffffff)) 92%,
    var(--primary-color, #2563eb) 8%
  );
  border: 1px solid var(--border, rgba(0,0,0,.14));
  box-shadow: 0 10px 24px rgba(15,23,42,.08);
  font-weight: 1000;
  transition:
    background .18s ease,
    color .18s ease,
    border-color .18s ease,
    transform .18s ease;
}

.ba-sheet-head button:hover,
.ba-sheet-profile button:hover,
.ba-modal-head button:hover,
.ba-structure-card button[aria-label*="Close"]:hover,
.ba-structure-card button[title*="Close"]:hover,
.ba-assessment-card button[aria-label*="Close"]:hover,
.ba-assessment-card button[title*="Close"]:hover,
.ba-item-card button[aria-label*="Close"]:hover,
.ba-item-card button[title*="Close"]:hover,
.ba-close:hover,
.ba-close-button:hover,
.ba-card-close:hover,
.ba-modal-close:hover,
.ba-sheet-close:hover {
  color: #ffffff;
  background: var(--primary-color, #2563eb);
  border-color: var(--primary-color, #2563eb);
  transform: translateY(-1px);
}

.ba-sheet-head button:focus-visible,
.ba-sheet-profile button:focus-visible,
.ba-modal-head button:focus-visible,
.ba-structure-card button[aria-label*="Close"]:focus-visible,
.ba-structure-card button[title*="Close"]:focus-visible,
.ba-assessment-card button[aria-label*="Close"]:focus-visible,
.ba-assessment-card button[title*="Close"]:focus-visible,
.ba-item-card button[aria-label*="Close"]:focus-visible,
.ba-item-card button[title*="Close"]:focus-visible,
.ba-close:focus-visible,
.ba-close-button:focus-visible,
.ba-card-close:focus-visible,
.ba-modal-close:focus-visible,
.ba-sheet-close:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 4px color-mix(
      in srgb,
      var(--primary-color, #2563eb) 20%,
      transparent
    ),
    0 10px 24px rgba(15,23,42,.08);
}

`;
