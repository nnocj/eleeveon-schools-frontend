"use client";

/**
 * app/branch-admin/modules/Academicperiods.tsx
 * Eleeveon Academic Periods V2.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this branch-admin academic module from accidentally using stale
 *   school/branch context left behind by another role or portal
 * - all reads and writes now use the resolved workspace schoolId and branchId
 *
 * Upgraded to the Students.tsx golden standard:
 * - no duplicate module hero/header block
 * - compact search + inline add + slider filter + more menu
 * - filters and advanced views moved into sheets
 * - compact card/list rows by default, with multi-column layout on wider screens
 * - table header carries the count instead of a separate summary strip
 * - createLocal/updateLocal/softDeleteLocal/listActiveLocal used where appropriate
 * - theme-safe ba-* CSS with dark-mode friendly variables
 * - fixed card/list header colors to match Students.tsx golden card title/subtitle rules
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
  type AcademicPeriod,
  type AcademicStructure,
  type AssessmentEntry,
  type ClassSubject,
  type TermType,
} from "../../lib/db";

import { createLocal, updateLocal, softDeleteLocal, listActiveLocal } from "../../lib/sync/syncUtils";

type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type StatusFilter = "all" | "active" | "inactive" | "current" | "running" | "upcoming" | "ended";

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type PeriodForm = {
  id?: number;
  academicStructureId: string;
  name: string;
  type: TermType | "";
  startDate: string;
  endDate: string;
  order: string;
  active: boolean;
  makeCurrent: boolean;
};

type PeriodViewRow = {
  row: AcademicPeriod;
  id: number;
  name: string;
  type: string;
  structureName: string;
  academicStructureId: number;
  startDate: string;
  endDate: string;
  order: number;
  active: boolean;
  current: boolean;
  classSubjectCount: number;
  entryCount: number;
};

const TERM_OPTIONS: TermType[] = [
  "Term 1",
  "Term 2",
  "Term 3",
  "Semester 1",
  "Semester 2",
  "Quarter 1",
  "Quarter 2",
  "Quarter 3",
  "Quarter 4",
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const endOfYearISO = () => `${new Date().getFullYear()}-12-31`;

const emptyForm = (): PeriodForm => ({
  academicStructureId: "",
  name: "",
  type: "Term 1",
  startDate: todayISO(),
  endDate: endOfYearISO(),
  order: "1",
  active: true,
  makeCurrent: false,
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

const toISODate = (value?: string | number | null) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  return new Date(time).toISOString().slice(0, 10);
};

const friendlyDate = (value?: string | number | null) => {
  const iso = toISODate(value);
  if (!iso) return "Not set";
  try {
    return new Intl.DateTimeFormat("en-GH", { month: "short", day: "2-digit", year: "numeric" }).format(
      new Date(`${iso}T00:00:00`)
    );
  } catch {
    return iso;
  }
};

const isActiveRow = (row: any) => {
  const status = safeLower(row?.status);
  if (!row || row.isDeleted) return false;
  if (row.active === false) return false;
  return !["inactive", "deleted", "archived", "suspended"].includes(status);
};

const countBy = <T,>(rows: T[], getter: (row: T) => any) => {
  const map = new Map<number, number>();
  rows.forEach((row) => {
    const id = idOf(getter(row));
    if (!id) return;
    map.set(id, (map.get(id) || 0) + 1);
  });
  return map;
};

const periodDurationDays = (startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
};

const getPeriodStatus = (row: PeriodViewRow) => {
  const today = todayISO();
  if (!row.active) return "inactive";
  if (row.current) return "current";
  if (row.startDate && row.endDate && today >= row.startDate && today <= row.endDate) return "running";
  if (row.startDate && today < row.startDate) return "upcoming";
  if (row.endDate && today > row.endDate) return "ended";
  return "active";
};

function statusTone(status: string): "green" | "red" | "blue" | "gray" | "orange" | "purple" {
  if (status === "current") return "purple";
  if (status === "running" || status === "active") return "green";
  if (status === "upcoming") return "blue";
  if (status === "ended") return "gray";
  if (status === "inactive") return "red";
  return "gray";
}

const statusLabel = (status: string) => {
  if (!status) return "Active";
  return status.charAt(0).toUpperCase() + status.slice(1);
};

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
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

export default function Academicperiods() {
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [structures, setStructures] = useState<AcademicStructure[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [assessmentEntries, setAssessmentEntries] = useState<AssessmentEntry[]>([]);
  const [branchSetting, setBranchSetting] = useState<any>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [structureFilter, setStructureFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PeriodViewRow | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PeriodForm>(emptyForm());
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
    setPeriods([]);
    setStructures([]);
    setClassSubjects([]);
    setAssessmentEntries([]);
    setBranchSetting(null);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [periodRows, structureRows, classSubjectRows, entryRows, branchSettingRows] = await Promise.all([
        tableSafe("academicPeriods")?.toArray?.() || [],
        listActiveLocal("academicStructures", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        tableSafe("classSubjects")?.toArray?.() || [],
        tableSafe("assessmentEntries")?.toArray?.() || [],
        tableSafe("schoolBranchSettings")?.toArray?.() || [],
      ]);

      const setting =
        (branchSettingRows as any[]).find((row) => sameTenant(row as TenantRow)) ||
        (branchSettingRows as any[]).find((row) => sameId(row.schoolId, schoolId) && sameId(row.branchId, branchId)) ||
        null;

      setBranchSetting(setting);

      setStructures(
        (structureRows as AcademicStructure[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        )
      );

      setPeriods(
        (periodRows as AcademicPeriod[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort(
            (a: any, b: any) =>
              idOf(a.academicStructureId) - idOf(b.academicStructureId) ||
              Number(a.order || 0) - Number(b.order || 0) ||
              String(a.name || "").localeCompare(String(b.name || ""))
          )
      );

      setClassSubjects((classSubjectRows as ClassSubject[]).filter((row) => sameTenant(row as TenantRow)));
      setAssessmentEntries((entryRows as AssessmentEntry[]).filter((row) => sameTenant(row as TenantRow)));
    } catch (error) {
      console.error("Failed to load academic periods:", error);
      clearData();
      showToast("error", "Failed to load academic periods.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, accountLoading, settingsLoading, contextLoading]);

  const structureMap = useMemo(() => new Map(structures.map((row: any) => [idOf(row.id), row])), [structures]);
  const classSubjectCountByPeriod = useMemo(() => countBy(classSubjects as any[], (row) => row.academicPeriodId), [classSubjects]);
  const entryCountByPeriod = useMemo(() => countBy(assessmentEntries as any[], (row) => row.academicPeriodId), [assessmentEntries]);

  const currentPeriodId = idOf(branchSetting?.currentAcademicPeriodId || settings?.currentAcademicPeriodId);
  const currentStructureId = idOf(branchSetting?.currentAcademicStructureId || settings?.currentAcademicStructureId);

  const periodRows = useMemo<PeriodViewRow[]>(() => {
    return periods.map((period: any) => {
      const id = idOf(period.id);
      const structure = structureMap.get(idOf(period.academicStructureId)) as any;

      return {
        row: period,
        id,
        name: period.name || "Unnamed Period",
        type: String(period.type || ""),
        structureName: structure?.name || "Unknown Academic Structure",
        academicStructureId: idOf(period.academicStructureId),
        startDate: toISODate(period.startDate),
        endDate: toISODate(period.endDate),
        order: Number(period.order || 0),
        active: isActiveRow(period),
        current: currentPeriodId > 0 && sameId(currentPeriodId, id),
        classSubjectCount: classSubjectCountByPeriod.get(id) || 0,
        entryCount: entryCountByPeriod.get(id) || 0,
      };
    });
  }, [periods, structureMap, currentPeriodId, classSubjectCountByPeriod, entryCountByPeriod]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return periodRows.filter((period) => {
      const status = getPeriodStatus(period);
      const haystack = [period.name, period.type, period.structureName, period.startDate, period.endDate, period.order]
        .join(" ")
        .toLowerCase();

      const searchOk = !term || haystack.includes(term);
      const structureOk = structureFilter === "all" || sameId(period.academicStructureId, structureFilter);
      const statusOk =
        statusFilter === "all" ||
        (statusFilter === "active" && period.active) ||
        (statusFilter === "inactive" && !period.active) ||
        (statusFilter === "current" && period.current) ||
        statusFilter === status;

      return searchOk && structureOk && statusOk;
    });
  }, [periodRows, search, structureFilter, statusFilter]);

  const currentPeriod = useMemo(() => periodRows.find((row) => row.current), [periodRows]);
  const upcomingCount = useMemo(() => periodRows.filter((row) => getPeriodStatus(row) === "upcoming").length, [periodRows]);
  const runningCount = useMemo(
    () => periodRows.filter((row) => ["current", "running"].includes(getPeriodStatus(row))).length,
    [periodRows]
  );
  const readyStructuresCount = useMemo(
    () => new Set(periodRows.map((row) => row.academicStructureId).filter(Boolean)).size,
    [periodRows]
  );
  const totalEntryRecords = useMemo(() => periodRows.reduce((sum, row) => sum + row.entryCount, 0), [periodRows]);

  const countsByStructure = useMemo(() => groupedCounts(periodRows, (row) => row.structureName), [periodRows]);
  const countsByStatus = useMemo(() => groupedCounts(periodRows, (row) => statusLabel(getPeriodStatus(row))), [periodRows]);
  const countsByType = useMemo(() => groupedCounts(periodRows, (row) => row.type || "Not set"), [periodRows]);

  const activeFilterCount = useMemo(
    () => [structureFilter, statusFilter].filter((value) => value !== "all").length,
    [structureFilter, statusFilter]
  );

  const nextOrderForStructure = (academicStructureId: number) => {
    const orders = periods
      .filter((row: any) => sameId(row.academicStructureId, academicStructureId))
      .map((row: any) => Number(row.order || 0));
    return orders.length ? Math.max(...orders) + 1 : 1;
  };

  const updateForm = (patch: Partial<PeriodForm>) => setForm((current) => ({ ...current, ...patch }));

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const openCreate = () => {
    if (!requireTenant()) return;

    const defaultStructureId =
      structureFilter !== "all" ? idOf(structureFilter) : currentStructureId || idOf((structures[0] as any)?.id);

    setSelectedItem(null);
    setForm({
      ...emptyForm(),
      academicStructureId: defaultStructureId ? String(defaultStructureId) : "",
      order: String(defaultStructureId ? nextOrderForStructure(defaultStructureId) : 1),
      makeCurrent: !currentPeriodId,
    });
    setModalOpen(true);
  };

  const openEdit = (period: PeriodViewRow) => {
    setSelectedItem(null);
    setForm({
      id: period.id,
      academicStructureId: String(period.academicStructureId || ""),
      name: period.name,
      type: ((period.row as any).type || "") as TermType | "",
      startDate: period.startDate || todayISO(),
      endDate: period.endDate || endOfYearISO(),
      order: String(period.order || 1),
      active: period.active,
      makeCurrent: period.current,
    });
    setModalOpen(true);
  };

  const validateForm = () => {
    if (!form.academicStructureId) return "Select an academic structure.";
    if (!form.name.trim()) return "Enter academic period name.";
    if (!form.startDate) return "Select start date.";
    if (!form.endDate) return "Select end date.";
    if (form.endDate < form.startDate) return "End date cannot be before start date.";
    if (Number(form.order || 1) < 1) return "Order must be at least 1.";

    const duplicate = periods.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      return (
        sameId(row.academicStructureId, form.academicStructureId) &&
        safeLower(row.name) === safeLower(form.name) &&
        !row.isDeleted
      );
    });

    if (duplicate) return "An academic period with this name already exists under the selected academic structure.";
    return "";
  };

  const ensureBranchSetting = async (academicStructureId?: number) => {
    if (branchSetting?.id) return branchSetting;
    if (!tableSafe("schoolBranchSettings")?.add) return null;

    const payload: any = {
      accountId,
      schoolId: Number(schoolId),
      branchId: Number(branchId),
      currentAcademicStructureId: academicStructureId || idOf(form.academicStructureId) || undefined,
      currentAcademicPeriodId: undefined,
      active: true,
      isDeleted: false,
    };

    try {
      const saved = await createLocal("schoolBranchSettings" as any, payload);
      const savedId = typeof saved === "number" ? saved : (saved as any)?.id;
      return { ...payload, id: savedId };
    } catch {
      const id = await tableSafe("schoolBranchSettings").add({
        ...payload,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        synced: "pending",
      });
      return { ...payload, id };
    }
  };

  const updateCurrentPeriod = async (period: PeriodViewRow | { id: number; academicStructureId: number }) => {
    const setting = await ensureBranchSetting(period.academicStructureId);
    if (!setting?.id || !tableSafe("schoolBranchSettings")?.update) {
      showToast("error", "Branch settings table is not ready. Create branch settings first.");
      return false;
    }

    try {
      await updateLocal("schoolBranchSettings" as any, Number(setting.id), {
        currentAcademicStructureId: period.academicStructureId,
        currentAcademicPeriodId: period.id,
        active: true,
        isDeleted: false,
      } as any);
    } catch {
      await tableSafe("schoolBranchSettings").update(setting.id, {
        currentAcademicStructureId: period.academicStructureId,
        currentAcademicPeriodId: period.id,
        updatedAt: Date.now(),
        synced: "pending",
      });
    }

    return true;
  };

  const setAsCurrentPeriod = async (period: PeriodViewRow) => {
    if (!period.id) return;
    const ok = await updateCurrentPeriod(period);
    if (!ok) return;
    setSelectedItem(null);
    showToast("success", `${period.name} is now the current academic period.`);
    await load();
  };

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const error = validateForm();
    if (error) {
      showToast("error", error);
      return;
    }

    if (!requireTenant()) return;

    try {
      setSaving(true);
      const existing = form.id ? periods.find((row: any) => sameId(row.id, form.id)) : undefined;

      const payload: Partial<AcademicPeriod> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        academicStructureId: idOf(form.academicStructureId),
        name: form.name.trim(),
        type: form.type || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        order: Number(form.order || 1),
        active: form.active,
        isDeleted: false,
      } as Partial<AcademicPeriod>;

      const saved = form.id && existing
        ? await updateLocal("academicPeriods", Number(form.id), payload)
        : await createLocal("academicPeriods", payload as AcademicPeriod);

      const savedId = Number(typeof saved === "number" ? saved : (saved as any)?.id || form.id || 0);

      if (form.makeCurrent && savedId) {
        await updateCurrentPeriod({ id: savedId, academicStructureId: idOf(form.academicStructureId) });
      }

      setModalOpen(false);
      showToast("success", form.id ? "Academic period updated." : "Academic period created.");
      await load();
    } catch (error) {
      console.error("Failed to save academic period:", error);
      showToast("error", "Could not save academic period.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (period: PeriodViewRow) => {
    await updateLocal("academicPeriods", period.id, {
      active: !period.active,
      isDeleted: false,
    } as Partial<AcademicPeriod>);
    setSelectedItem(null);
    showToast("success", period.active ? "Academic period deactivated." : "Academic period activated.");
    await load();
  };

  const archivePeriod = async (period: PeriodViewRow) => {
    const hasRecords = period.classSubjectCount > 0 || period.entryCount > 0;
    const confirmed = window.confirm(
      hasRecords
        ? `"${period.name}" has linked records. Archive it instead of deleting permanently?`
        : `Archive "${period.name}"?`
    );

    if (!confirmed) return;

    await softDeleteLocal("academicPeriods", period.id);

    if (period.current && branchSetting?.id && tableSafe("schoolBranchSettings")?.update) {
      try {
        await updateLocal("schoolBranchSettings" as any, Number(branchSetting.id), {
          currentAcademicPeriodId: undefined,
        } as any);
      } catch {
        await tableSafe("schoolBranchSettings").update(branchSetting.id, {
          currentAcademicPeriodId: undefined,
          updatedAt: Date.now(),
          synced: "pending",
        });
      }
    }

    setSelectedItem(null);
    showToast("success", "Academic period archived.");
    await load();
  };

  const clearFilters = () => {
    setStructureFilter("all");
    setStatusFilter("all");
  };

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return <State primary={primary} title="Opening Academic Periods..." text="Checking branch structures, terms, class links and assessment records." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing academic periods." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>Academic periods belong to one active school branch.</p>
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

      <section className="ba-search-card" aria-label="Academic period search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search periods..."
            aria-label="Search academic periods"
          />
        </label>

        <button type="button" className="ba-add-inline" onClick={openCreate} aria-label="Add academic period">
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

      {!structures.length && (
        <section className="ba-warning">
          Create an academic structure first. Academic periods must belong to a structure such as Primary, JHS, SHS, Montessori, Cambridge, or any custom grouping.
        </section>
      )}

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {structureFilter !== "all" && (
            <button type="button" onClick={() => setStructureFilter("all")}>
              Structure: {(structureMap.get(idOf(structureFilter)) as any)?.name || structureFilter} ×
            </button>
          )}
          {statusFilter !== "all" && (
            <button type="button" onClick={() => setStatusFilter("all")}>
              Status: {statusLabel(statusFilter)} ×
            </button>
          )}
        </section>
      )}

      {currentPeriod && viewMode === "cards" && !search && activeFilterCount === 0 && (
        <section className="ba-current-card">
          <div>
            <span>Current period</span>
            <strong>{currentPeriod.name}</strong>
            <p>
              {currentPeriod.structureName} · {friendlyDate(currentPeriod.startDate)} to {friendlyDate(currentPeriod.endDate)}
            </p>
          </div>
          <Chip tone="purple">Current</Chip>
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard title="Periods by Structure" rows={countsByStructure} total={periodRows.length} />
          <AnalysisCard title="Periods by Status" rows={countsByStatus} total={periodRows.length} />
          <AnalysisCard title="Periods by Type" rows={countsByType} total={periodRows.length} />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{filteredRows.length}</strong>
            <p>{runningCount} running/current · {upcomingCount} upcoming · {readyStructuresCount} structure(s) ready · {totalEntryRecords} score entries.</p>
          </article>
        </section>
      )}

      {viewMode === "table" && <TableView rows={filteredRows} openEdit={openEdit} toggleActive={toggleActive} setCurrent={setAsCurrentPeriod} remove={archivePeriod} />}

      {viewMode === "cards" && (
        <section className="ba-list period-list">
          {filteredRows.map((period) => (
            <PeriodListItem key={String(period.id)} period={period} onOpen={() => setSelectedItem(period)} />
          ))}

          {!filteredRows.length && (
            <Empty icon="🗓️" title="No academic periods found" text="Create terms, semesters, or custom sessions for this branch." />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          structures={structures}
          structureFilter={structureFilter}
          statusFilter={statusFilter}
          setStructureFilter={setStructureFilter}
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
        <ActionSheet
          period={selectedItem}
          openEdit={openEdit}
          toggleActive={toggleActive}
          setCurrent={setAsCurrentPeriod}
          remove={archivePeriod}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {modalOpen && (
        <PeriodModal
          form={form}
          saving={saving}
          structures={structures}
          termOptions={TERM_OPTIONS}
          updateForm={updateForm}
          nextOrderForStructure={nextOrderForStructure}
          setModalOpen={setModalOpen}
          save={save}
        />
      )}
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

function PeriodListItem({ period, onOpen }: { period: PeriodViewRow; onOpen: () => void }) {
  const status = getPeriodStatus(period);

  return (
    <button type="button" className="student-row period-row" onClick={onOpen}>
      <span className="period-icon">📅</span>

      <span className="student-main">
        <strong>{period.name}</strong>
        <small>
          {period.structureName}
          {period.type ? ` · ${period.type}` : ""}
        </small>
        <em>
          {friendlyDate(period.startDate)} to {friendlyDate(period.endDate)} · {periodDurationDays(period.startDate, period.endDate)} days
        </em>
      </span>

      <span className="student-side">
        <span className={`status-dot-mini ${statusTone(status)}`} title={statusLabel(status)} aria-label={statusLabel(status)} />
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
  structures,
  structureFilter,
  statusFilter,
  setStructureFilter,
  setStatusFilter,
  clearFilters,
  onClose,
}: {
  structures: AcademicStructure[];
  structureFilter: string;
  statusFilter: StatusFilter;
  setStructureFilter: (value: string) => void;
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
            <p>Filter academic periods by structure and status.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Academic Structure</span>
            <select value={structureFilter} onChange={(event) => setStructureFilter(event.target.value)}>
              <option value="all">All structures</option>
              {structures.map((structure: any) => (
                <option key={String(structure.id)} value={String(structure.id)}>
                  {structure.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">All periods</option>
              <option value="active">Active only</option>
              <option value="current">Current period</option>
              <option value="running">Running</option>
              <option value="upcoming">Upcoming</option>
              <option value="ended">Ended</option>
              <option value="inactive">Inactive only</option>
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={clearFilters}>
            Clear
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Apply
          </button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  viewMode,
  setViewMode,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views are here so the main page stays simple.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="ba-menu-list">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            <span>☰</span>
            <b>List view</b>
            <small>Compact academic period cards</small>
          </button>

          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            <span>☷</span>
            <b>Table view</b>
            <small>Dense records for laptop work</small>
          </button>

          <button type="button" className={viewMode === "summary" ? "active" : ""} onClick={() => setViewMode("summary")}>
            <span>◔</span>
            <b>Analytics</b>
            <small>Structure, type and status summaries</small>
          </button>

          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch records</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function ActionSheet({
  period,
  openEdit,
  toggleActive,
  setCurrent,
  remove,
  onClose,
}: {
  period: PeriodViewRow;
  openEdit: (period: PeriodViewRow) => void;
  toggleActive: (period: PeriodViewRow) => void | Promise<void>;
  setCurrent: (period: PeriodViewRow) => void | Promise<void>;
  remove: (period: PeriodViewRow) => void | Promise<void>;
  onClose: () => void;
}) {
  const status = getPeriodStatus(period);

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{period.name}</h2>
            <p>
              {period.structureName} · {statusLabel(status)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close period actions">
            ✕
          </button>
        </div>

        <div className="student-detail-strip">
          <span>
            <b>Dates</b>
            {friendlyDate(period.startDate)} - {friendlyDate(period.endDate)}
          </span>
          <span>
            <b>Class Subjects</b>
            {period.classSubjectCount}
          </span>
          <span>
            <b>Entries</b>
            {period.entryCount}
          </span>
        </div>

        <div className="ba-menu-list">
          {!period.current && period.active && (
            <button type="button" onClick={() => setCurrent(period)}>
              <span>⭐</span>
              <b>Set current</b>
              <small>Use this period as the default for attendance and assessment</small>
            </button>
          )}

          <button type="button" onClick={() => openEdit(period)}>
            <span>✎</span>
            <b>Edit period</b>
            <small>Update dates, order, status and current-period setting</small>
          </button>

          <button type="button" onClick={() => toggleActive(period)}>
            <span>{period.active ? "⏸" : "✓"}</span>
            <b>{period.active ? "Deactivate" : "Activate"}</b>
            <small>{period.active ? "Hide from active workflows" : "Return to active workflows"}</small>
          </button>

          <button type="button" className="danger" onClick={() => remove(period)}>
            <span>⌫</span>
            <b>Archive</b>
            <small>Soft delete this academic period locally</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function TableView({
  rows,
  openEdit,
  toggleActive,
  setCurrent,
  remove,
}: {
  rows: PeriodViewRow[];
  openEdit: (period: PeriodViewRow) => void;
  toggleActive: (period: PeriodViewRow) => void | Promise<void>;
  setCurrent: (period: PeriodViewRow) => void | Promise<void>;
  remove: (period: PeriodViewRow) => void | Promise<void>;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Periods ({rows.length})</th>
              <th>Structure</th>
              <th>Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Class Subjects</th>
              <th>Entries</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((period) => {
              const status = getPeriodStatus(period);
              return (
                <tr key={String(period.id)}>
                  <td>
                    <strong>{period.name}</strong>
                    <span>Order {period.order}</span>
                  </td>
                  <td>{period.structureName}</td>
                  <td>{period.type || "—"}</td>
                  <td>
                    {friendlyDate(period.startDate)}
                    <span>to {friendlyDate(period.endDate)}</span>
                  </td>
                  <td>{periodDurationDays(period.startDate, period.endDate)}</td>
                  <td>{period.classSubjectCount}</td>
                  <td>{period.entryCount}</td>
                  <td>
                    <Chip tone={statusTone(status)}>{statusLabel(status)}</Chip>
                  </td>
                  <td>
                    <div className="ba-table-actions">
                      {!period.current && period.active && (
                        <button type="button" onClick={() => setCurrent(period)}>
                          Set Current
                        </button>
                      )}
                      <button type="button" onClick={() => openEdit(period)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => toggleActive(period)}>
                        {period.active ? "Deactivate" : "Activate"}
                      </button>
                      <button type="button" className="ba-delete" onClick={() => remove(period)}>
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!rows.length && <div className="ba-empty-table">No academic period matches your filters.</div>}
      </div>
    </section>
  );
}

function PeriodModal({
  form,
  saving,
  structures,
  termOptions,
  updateForm,
  nextOrderForStructure,
  setModalOpen,
  save,
}: {
  form: PeriodForm;
  saving: boolean;
  structures: AcademicStructure[];
  termOptions: TermType[];
  updateForm: (patch: Partial<PeriodForm>) => void;
  nextOrderForStructure: (academicStructureId: number) => number;
  setModalOpen: (open: boolean) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Academic Period" : "New Academic Period"}</h2>
            <p>Academic periods control attendance, assessment entry, reports, promotion, and other branch academic records.</p>
          </div>
          <button type="button" onClick={() => setModalOpen(false)} aria-label="Close period form">
            ✕
          </button>
        </div>

        <section className="ba-form-section">
          <h3>Period Details</h3>
          <div className="ba-form">
            <label>
              <span>Academic Structure</span>
              <select
                value={form.academicStructureId}
                onChange={(event) => {
                  const structureId = idOf(event.target.value);
                  updateForm({
                    academicStructureId: event.target.value,
                    order: form.id ? form.order : String(nextOrderForStructure(structureId)),
                  });
                }}
              >
                <option value="">Select academic structure</option>
                {structures.map((structure: any) => (
                  <option key={String(structure.id)} value={String(structure.id)}>
                    {structure.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Period Name</span>
              <input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="Example: 2026 Term 1" />
            </label>

            <label>
              <span>Type</span>
              <select value={form.type} onChange={(event) => updateForm({ type: event.target.value as TermType })}>
                <option value="">Custom / Not set</option>
                {termOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Start Date</span>
              <input type="date" value={form.startDate} onChange={(event) => updateForm({ startDate: event.target.value })} />
            </label>

            <label>
              <span>End Date</span>
              <input type="date" value={form.endDate} onChange={(event) => updateForm({ endDate: event.target.value })} />
            </label>

            <label>
              <span>Order</span>
              <input type="number" min={1} value={form.order} onChange={(event) => updateForm({ order: event.target.value })} />
            </label>

            <label>
              <span>Status</span>
              <select value={form.active ? "active" : "inactive"} onChange={(event) => updateForm({ active: event.target.value === "active" })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <label>
              <span>Current Period</span>
              <select value={form.makeCurrent ? "yes" : "no"} onChange={(event) => updateForm({ makeCurrent: event.target.value === "yes" })}>
                <option value="no">No</option>
                <option value="yes">Set as current</option>
              </select>
            </label>
          </div>
        </section>

        <section className="ba-note">
          <strong>Tip:</strong> The current period becomes the default for attendance, assessment entry, reports, and promotion workflows.
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Create Period"}
          </button>
        </div>
      </form>
    </div>
  );
}

function groupedCounts(rows: PeriodViewRow[], keyFn: (item: PeriodViewRow) => string) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyFn(row) || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
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
              <div>
                <b>{row.label}</b>
                <small>
                  {row.value} · {share}%
                </small>
              </div>
              <div className="ba-progress">
                <i style={{ width: `${Math.max(4, share)}%` }} />
              </div>
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
.ba-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}.ba-page button{-webkit-tap-highlight-color:transparent}.ba-page input,.ba-page select,.ba-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ba-page input:focus,.ba-page select:focus,.ba-page textarea:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}.ba-state,.ba-search-card,.ba-current-card,.ba-card,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet,.ba-modal,.student-row,.ba-warning,.ba-note{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer}.ba-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.ba-toast.success{background:rgba(34,197,94,.14);color:#166534}.ba-toast.error{background:rgba(239,68,68,.12);color:#991b1b}.ba-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}.ba-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ba-add-inline{flex:0 0 42px;border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:25px;line-height:1;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none;-ms-overflow-style:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ba-warning{margin-top:8px;padding:11px 12px;border-radius:20px;color:#92400e;background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.22);font-size:12px;font-weight:850;line-height:1.5}.ba-current-card{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-top:10px;padding:12px;border-radius:22px}.ba-current-card span{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-current-card strong{display:block;margin-top:4px;font-size:16px;font-weight:1000;letter-spacing:-.04em}.ba-current-card p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.45}.ba-list{display:grid;gap:7px;margin-top:10px}.period-list{grid-template-columns:minmax(0,1fr)}.student-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;color:var(--text,#111827);cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}.student-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 28%,var(--border,rgba(0,0,0,.10)));box-shadow:0 16px 32px rgba(15,23,42,.075)}.period-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 11%,var(--card-bg,#fff));color:var(--ba-primary);font-size:18px}.student-main{display:grid;gap:2px;min-width:0}.student-main strong,.student-main small,.student-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.student-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.025em}.student-main small{color:var(--muted,#64748b);font-size:12px;font-weight:850}.student-main em{color:var(--muted,#64748b);font-size:11px;font-style:normal;font-weight:700}.student-side{display:inline-flex;align-items:center;gap:10px;color:var(--muted,#64748b)}.student-side i{font-style:normal;font-weight:1000}.status-dot-mini{width:10px;height:10px;display:inline-block;border-radius:999px;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 14%,transparent)}.status-dot-mini.green{background:#22c55e;color:#22c55e}.status-dot-mini.red{background:#ef4444;color:#ef4444}.status-dot-mini.blue{background:#3b82f6;color:#3b82f6}.status-dot-mini.gray{background:#94a3b8;color:#94a3b8}.status-dot-mini.orange{background:#f59e0b;color:#f59e0b}.status-dot-mini.purple{background:#8b5cf6;color:#8b5cf6}.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:rgba(107,114,128,.12);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ba-table-card{margin-top:10px;border-radius:24px;overflow:hidden}.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.10))}.ba-table-scroll table{width:100%;min-width:1040px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}.ba-table-scroll th,.ba-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.ba-table-scroll th{background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ba-table-scroll td strong,.ba-table-scroll td span{display:block}.ba-table-scroll td strong{font-weight:1000}.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ba-table-actions{display:flex;flex-wrap:nowrap;gap:7px;align-items:center}.ba-table-actions button,.ba-modal-actions button{min-height:34px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 10%,var(--card-bg,#fff));color:var(--ba-primary);font-size:11px;font-weight:950;cursor:pointer;white-space:nowrap}.ba-table-actions button:first-child,.ba-modal-actions button:last-child{background:var(--ba-primary);color:#fff}.ba-table-actions .ba-delete{color:var(--muted,#64748b);background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff))}.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ba-analysis{padding:13px;border-radius:22px}.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-analysis-list{display:grid;gap:10px;margin-top:12px}.ba-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ba-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ba-analysis-list b,.ba-analysis-list small{font-size:12px}.ba-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ba-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed;border-radius:22px;padding:13px}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,transparent);font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-sheet-backdrop,.ba-modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.58);backdrop-filter:blur(12px)}.ba-sheet{width:min(620px,100%);max-height:min(88dvh,760px);overflow-y:auto;border-radius:28px;padding:14px;box-shadow:0 30px 90px rgba(15,23,42,.32)}.ba-sheet.small{width:min(460px,100%)}.ba-sheet-head,.ba-sheet-profile,.ba-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:4px 2px 14px}.ba-sheet-head h2,.ba-sheet-profile h2,.ba-modal-head h2{margin:0;font-size:20px;font-weight:1000;letter-spacing:-.05em}.ba-sheet-head p,.ba-sheet-profile p,.ba-modal-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-sheet-head button,.ba-sheet-profile button,.ba-modal-head button{width:38px;height:38px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827);font-weight:1000;cursor:pointer}.ba-form{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-form.compact{grid-template-columns:minmax(0,1fr)}.ba-form label{display:grid;gap:6px}.ba-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ba-sheet-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.ba-sheet-actions button{min-height:38px;border:0;border-radius:999px;padding:0 14px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ba-sheet-actions button.primary{background:var(--ba-primary);color:#fff}.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"icon title" "icon text";gap:2px 10px;align-items:center;text-align:left;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:11px;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);cursor:pointer}.ba-menu-list button span{grid-area:icon;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list button b{grid-area:title;font-size:13px;font-weight:1000}.ba-menu-list button small{grid-area:text;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ba-menu-list button.active{border-color:color-mix(in srgb,var(--ba-primary) 32%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ba-primary) 7%,var(--card-bg,#fff))}.ba-menu-list button.danger span{background:rgba(239,68,68,.10);color:#dc2626}.student-detail-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:10px}.student-detail-strip span{display:grid;gap:3px;padding:9px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--muted,#64748b);font-size:11px;font-weight:800}.student-detail-strip b{color:var(--text,#111827);font-size:11px;font-weight:1000}.ba-modal{width:min(860px,100%);max-height:min(92dvh,900px);overflow-y:auto;padding:14px;border-radius:28px;box-shadow:0 30px 90px rgba(15,23,42,.35)}.ba-form-section{display:grid;gap:10px;margin-top:4px}.ba-form-section h3{margin:0;font-size:13px;font-weight:1000;color:var(--text,#111827)}.ba-note{margin-top:12px;padding:12px;border-radius:18px;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary);font-size:12px;line-height:1.5}.ba-modal-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,#fff) 70%,transparent)}.ba-modal-actions button:first-child{background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827)}.ba-modal-actions button:disabled{opacity:.55;cursor:not-allowed}@media(min-width:680px){.ba-page{padding:12px}.period-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-sheet-backdrop,.ba-modal-backdrop{place-items:center;padding:18px}.ba-modal{padding:18px}}@media(min-width:1040px){.ba-page{padding:16px}.period-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ba-form{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(min-width:1320px){.period-list{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:520px){.ba-page{padding:6px}.ba-search-card{gap:6px;padding:7px;border-radius:22px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:39px;height:39px}.student-row{border-radius:20px;padding:9px}.period-icon{width:38px;height:38px}.student-detail-strip{grid-template-columns:minmax(0,1fr)}.ba-modal,.ba-sheet,.ba-empty,.ba-analysis,.ba-current-card{border-radius:20px;padding:11px}.ba-sheet-actions,.ba-modal-actions{display:grid;grid-template-columns:1fr}.ba-sheet-actions button,.ba-modal-actions button{width:100%}}


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
