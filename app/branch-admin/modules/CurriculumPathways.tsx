"use client";

/**
 * app/branch-admin/modules/CurriculumPathways.tsx
 * Eleeveon Curriculum Pathways V2.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Golden standard upgrade:
 * - createLocal(...) for pathway creation
 * - updateLocal(...) for edits and activation changes
 * - softDeleteLocal(...) for local soft delete
 * - listActiveLocal(...) for active curriculum lookup
 * - removed the large duplicate hero/header block
 * - compact search + inline add + slider filter + More menu
 * - filters moved into a sheet
 * - table and analytics moved under More
 * - theme-safe table header colors for dark mode
 * - horizontal no-wrap table actions
 * - compact multi-column desktop card density
 * - calm golden delete styling instead of loud danger UI
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this branch-admin academic setup page from accidentally using stale
 *   school/branch context left behind by another role or portal
 * - all reads and writes now use the resolved workspace schoolId and branchId
 *
 * Data focus:
 * - curriculumPathways
 * - curriculums
 * - curriculumSubjects
 * - studentCurriculums
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import {
  db,
  type Curriculum,
  type CurriculumPathway,
  type CurriculumSubject,
  type StudentCurriculum,
} from "../../lib/db/db";
import {
  createLocal,
  updateLocal,
  softDeleteLocal,
  listActiveLocal,
} from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type AnyRow = Record<string, any>;

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type PathwayView = {
  id: string;
  row: CurriculumPathway;
  name: string;
  code: string;
  description: string;
  curriculumId: string;
  curriculumName: string;
  subjectCount: number;
  studentCount: number;
  active: boolean;
};

type FormState = {
  id?: string;
  curriculumId: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
};

const emptyForm: FormState = {
  curriculumId: "",
  name: "",
  code: "",
  description: "",
  active: true,
};

const idOf = (value: any): string => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return (
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    );
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

function firstLocalId(...values: unknown[]): string {
  for (const value of values) {
    const parsed = idOf(value);
    if (parsed) return parsed;
  }

  return "";
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId"),
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
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId"),
  );
}

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (value: any) =>
  String(value || "")
    .toLowerCase()
    .trim();
const tableSafe = (name: string) => (db as any)[name];

const isActiveRow = (row: any) => {
  const status = safeLower(row?.status);
  if (row?.isDeleted) return false;
  if (row?.active === false) return false;
  if (["inactive", "deleted", "archived", "suspended"].includes(status))
    return false;
  return true;
};

const timeText = (value?: string | number | null) => {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";

  try {
    return new Intl.DateTimeFormat("en-GH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(time));
  } catch {
    return "Not set";
  }
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

function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <b>{value}</b>
      {label}
    </span>
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

export default function CurriculumPathways() {
  const dataRevision = useDataRevision();

  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();
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

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<
    CurriculumSubject[]
  >([]);
  const [studentCurriculums, setStudentCurriculums] = useState<
    StudentCurriculum[]
  >([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [curriculumFilter, setCurriculumFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PathwayView | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
    // Missing branch workspace is handled locally so the selected-role flow is not broken.
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    schoolId,
    branchId,
    router,
  ]);

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(
      () =>
        setToast((current) => (current?.message === message ? null : current)),
      4200,
    );
  };

  const clearData = () => {
    setPathways([]);
    setCurriculums([]);
    setCurriculumSubjects([]);
    setStudentCurriculums([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [pathwayRows, curriculumRows, subjectRows, studentRows] =
        await Promise.all([
          tableSafe("curriculumPathways")?.toArray?.() || [],
          listActiveLocal("curriculums", {
            accountId,
            schoolId: schoolId,
            branchId: branchId,
          } as any),
          tableSafe("curriculumSubjects")?.toArray?.() || [],
          tableSafe("studentCurriculums")?.toArray?.() || [],
        ]);

      setPathways(
        (pathwayRows as CurriculumPathway[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setCurriculums(
        (curriculumRows as Curriculum[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
      setCurriculumSubjects(
        (subjectRows as CurriculumSubject[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setStudentCurriculums(
        (studentRows as StudentCurriculum[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
    } catch (error) {
      console.error(error);
      clearData();
      showToast("error", "Failed to load curriculum pathways.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    settingsLoading,
    contextLoading,
    dataRevision,
  ]);

  const curriculumMap = useMemo(() => {
    const map = new Map<string, Curriculum>();
    curriculums.forEach((row: any) => map.set(idOf(row.id), row));
    return map;
  }, [curriculums]);

  const usage = useMemo(() => {
    const subjectMap = new Map<string, number>();
    const studentMap = new Map<string, number>();

    curriculumSubjects.forEach((row: any) => {
      const pathwayId = idOf(row.pathwayId);
      if (pathwayId)
        subjectMap.set(pathwayId, (subjectMap.get(pathwayId) || 0) + 1);
    });

    studentCurriculums.forEach((row: any) => {
      const pathwayId = idOf(row.pathwayId);
      if (pathwayId)
        studentMap.set(pathwayId, (studentMap.get(pathwayId) || 0) + 1);
    });

    return { subjectMap, studentMap };
  }, [curriculumSubjects, studentCurriculums]);

  const viewRows = useMemo<PathwayView[]>(() => {
    return pathways.map((row: any) => {
      const id = idOf(row.id);
      const curriculumId = idOf(row.curriculumId);
      const curriculum: any = curriculumMap.get(curriculumId);

      return {
        id,
        row,
        name: row.name || row.title || `Pathway ${id || ""}`,
        code: row.code || row.shortCode || "",
        description: row.description || row.remark || "",
        curriculumId,
        curriculumName:
          curriculum?.name || curriculum?.title || "Unknown curriculum",
        subjectCount: usage.subjectMap.get(id) || 0,
        studentCount: usage.studentMap.get(id) || 0,
        active: isActiveRow(row),
      };
    });
  }, [curriculumMap, pathways, usage]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return viewRows
      .filter((row) => {
        const haystack =
          `${row.name} ${row.code} ${row.description} ${row.curriculumName}`.toLowerCase();
        const searchOk = !term || haystack.includes(term);
        const curriculumOk =
          curriculumFilter === "all" ||
          sameId(row.curriculumId, curriculumFilter);
        const statusOk =
          statusFilter === "all" ||
          (statusFilter === "active" ? row.active : !row.active);
        return searchOk && curriculumOk && statusOk;
      })
      .sort(
        (a, b) =>
          a.curriculumName.localeCompare(b.curriculumName) ||
          a.name.localeCompare(b.name),
      );
  }, [curriculumFilter, search, statusFilter, viewRows]);

  const summary = useMemo(
    () => ({
      total: viewRows.length,
      active: viewRows.filter((row) => row.active).length,
      inactive: viewRows.filter((row) => !row.active).length,
      curriculums: curriculums.length,
      subjectLinks: curriculumSubjects.filter((row: any) => idOf(row.pathwayId))
        .length,
      studentLinks: studentCurriculums.filter((row: any) => idOf(row.pathwayId))
        .length,
      showing: filteredRows.length,
    }),
    [
      curriculumSubjects,
      curriculums.length,
      filteredRows.length,
      studentCurriculums,
      viewRows,
    ],
  );

  const activeFilterCount = useMemo(() => {
    return (
      [curriculumFilter, statusFilter].filter(
        (value) => value !== "all" && value !== "active",
      ).length + (statusFilter !== "active" ? 1 : 0)
    );
  }, [curriculumFilter, statusFilter]);

  const countsByCurriculum = useMemo(
    () => groupedCounts(viewRows, (row) => row.curriculumName),
    [viewRows],
  );
  const countsByStatus = useMemo(
    () =>
      groupedCounts(viewRows, (row) => (row.active ? "Active" : "Inactive")),
    [viewRows],
  );
  const countsBySubjects = useMemo(
    () =>
      viewRows
        .map((row) => ({ label: row.name, value: row.subjectCount }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value),
    [viewRows],
  );
  const countsByStudents = useMemo(
    () =>
      viewRows
        .map((row) => ({ label: row.name, value: row.studentCount }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value),
    [viewRows],
  );

  const updateForm = (patch: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...patch }));

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
    setForm({
      ...emptyForm,
      curriculumId: curriculumFilter !== "all" ? String(curriculumFilter) : "",
    });
    setModalOpen(true);
  };

  const openEdit = (item: PathwayView) => {
    setSelectedItem(null);
    setForm({
      id: item.id,
      curriculumId: item.curriculumId ? String(item.curriculumId) : "",
      name: item.name,
      code: item.code,
      description: item.description,
      active: item.active,
    });
    setModalOpen(true);
  };

  const clearFilters = () => {
    setCurriculumFilter("all");
    setStatusFilter("active");
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId || !branchId) return "Select a school branch first.";
    if (!form.curriculumId) return "Select a curriculum.";
    if (!form.name.trim()) return "Enter pathway name.";

    const duplicate = pathways.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      if (idOf(row.curriculumId) !== idOf(form.curriculumId)) return false;
      if (row.isDeleted) return false;
      const sameName = safeLower(row.name) === safeLower(form.name);
      const sameCode =
        !!form.code.trim() && safeLower(row.code) === safeLower(form.code);
      return sameName || sameCode;
    });

    if (duplicate)
      return "A pathway with this name or code already exists under the selected curriculum.";
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

      const existing = form.id
        ? pathways.find((row: any) => sameId(row.id, form.id))
        : undefined;
      const payload: Partial<CurriculumPathway> = {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        curriculumId: idOf(form.curriculumId),
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        description: form.description.trim() || undefined,
        active: form.active,
        isDeleted: false,
      } as Partial<CurriculumPathway>;

      if (form.id && existing)
        await updateLocal("curriculumPathways", String(form.id), payload);
      else
        await createLocal("curriculumPathways", payload as CurriculumPathway);

      setModalOpen(false);
      showToast("success", "Curriculum pathway saved.");
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not save curriculum pathway.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: PathwayView) => {
    if (!item.id) return;

    await updateLocal("curriculumPathways", String(item.id), {
      active: !item.active,
      isDeleted: false,
    } as Partial<CurriculumPathway>);

    setSelectedItem(null);
    showToast(
      "success",
      item.active ? "Pathway deactivated." : "Pathway activated.",
    );
    await load();
  };

  const remove = async (item: PathwayView) => {
    const totalUsage = item.subjectCount + item.studentCount;
    const ok = window.confirm(
      totalUsage
        ? `"${item.name}" is linked to ${item.subjectCount} subject record(s) and ${item.studentCount} student curriculum record(s). Delete anyway?`
        : `Delete "${item.name}"?`,
    );

    if (!ok) return;

    await softDeleteLocal("curriculumPathways", String(item.id));
    setSelectedItem(null);
    showToast("success", "Pathway deleted.");
    await load();
  };

  if (accountLoading || settingsLoading || contextLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Curriculum Pathways..."
        text="Checking curriculums, pathways, subject links and student links."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing curriculum pathways."
      />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>Curriculum pathways belong to one active school branch.</p>
          <button
            type="button"
            className="ba-state-button"
            onClick={() => router.push("/account")}
          >
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      className="ba-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      {toast && (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ✕
          </button>
        </section>
      )}

      <section
        className="ba-search-card"
        aria-label="Curriculum pathway search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search pathways..."
            aria-label="Search pathways"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={openCreate}
          aria-label="Add pathway"
        >
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

        <button
          type="button"
          className="ba-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
        >
          ⋯
        </button>
      </section>

      {(curriculumFilter !== "all" || statusFilter !== "active") && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {curriculumFilter !== "all" && (
            <button type="button" onClick={() => setCurriculumFilter("all")}>
              Curriculum:{" "}
              {(curriculumMap.get(idOf(curriculumFilter)) as AnyRow)?.name ||
                curriculumFilter}{" "}
              ×
            </button>
          )}
          {statusFilter !== "active" && (
            <button type="button" onClick={() => setStatusFilter("active")}>
              Status: {statusFilter} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard
            title="Pathways by Curriculum"
            rows={countsByCurriculum}
            total={summary.total}
          />
          <AnalysisCard
            title="Pathways by Status"
            rows={countsByStatus}
            total={summary.total}
          />
          <AnalysisCard
            title="Subject Links by Pathway"
            rows={countsBySubjects}
            total={Math.max(summary.subjectLinks, 1)}
          />
          <AnalysisCard
            title="Student Links by Pathway"
            rows={countsByStudents}
            total={Math.max(summary.studentLinks, 1)}
          />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{summary.showing}</strong>
            <p>
              Pathway record(s) currently match your search and filter
              conditions.
            </p>
          </article>
        </section>
      )}

      {viewMode === "table" && (
        <TableView
          rows={filteredRows}
          openEdit={openEdit}
          toggleActive={toggleActive}
          remove={remove}
        />
      )}

      {viewMode === "cards" && (
        <section className="ba-list pathway-grid">
          {filteredRows.map((item) => (
            <PathwayCard
              key={String(item.id)}
              item={item}
              onOpen={() => setSelectedItem(item)}
            />
          ))}
          {!filteredRows.length && (
            <Empty
              icon="🗺️"
              title="No pathways found"
              text="Create streams such as General, Science, Business, Arts, Technical, or Vocational under a curriculum."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          curriculums={curriculums}
          curriculumFilter={curriculumFilter}
          statusFilter={statusFilter}
          setCurriculumFilter={setCurriculumFilter}
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
          item={selectedItem}
          openEdit={openEdit}
          toggleActive={toggleActive}
          remove={remove}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {modalOpen && (
        <PathwayModal
          form={form}
          saving={saving}
          curriculums={curriculums}
          setModalOpen={setModalOpen}
          updateForm={updateForm}
          save={save}
        />
      )}
    </main>
  );
}

function State({
  primary,
  title,
  text,
}: {
  primary: string;
  title: string;
  text: string;
}) {
  return (
    <main
      className="ba-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function PathwayCard({
  item,
  onOpen,
}: {
  item: PathwayView;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="pathway-row" onClick={onOpen}>
      <span className="pathway-avatar">🗺️</span>
      <span className="pathway-main">
        <strong>{item.name || "Unnamed pathway"}</strong>
        <small>
          {item.curriculumName}
          {item.code ? ` · ${item.code}` : ""}
        </small>
        <em>
          {item.subjectCount} subject link(s) · {item.studentCount} student
          link(s)
        </em>
      </span>
      <span className="pathway-side">
        <span
          className={`status-dot-mini ${item.active ? "green" : "gray"}`}
          title={item.active ? "Active" : "Inactive"}
          aria-label={item.active ? "Active" : "Inactive"}
        />
        <i>⋯</i>
      </span>
    </button>
  );
}

function FilterSheet({
  curriculums,
  curriculumFilter,
  statusFilter,
  setCurriculumFilter,
  setStatusFilter,
  clearFilters,
  onClose,
}: {
  curriculums: Curriculum[];
  curriculumFilter: string;
  statusFilter: string;
  setCurriculumFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose only what you need. The list updates after applying.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Curriculum</span>
            <select
              value={curriculumFilter}
              onChange={(event) => setCurriculumFilter(event.target.value)}
            >
              <option value="all">All curriculums</option>
              {curriculums.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name || row.title || `Curriculum ${row.id}`}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="active">Active</option>
              <option value="all">All</option>
              <option value="inactive">Inactive/Deleted</option>
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
          <button
            type="button"
            className={viewMode === "cards" ? "active" : ""}
            onClick={() => setViewMode("cards")}
          >
            <span>☰</span>
            <b>List view</b>
            <small>Simple pathway records</small>
          </button>
          <button
            type="button"
            className={viewMode === "table" ? "active" : ""}
            onClick={() => setViewMode("table")}
          >
            <span>☷</span>
            <b>Table view</b>
            <small>Dense records for laptop work</small>
          </button>
          <button
            type="button"
            className={viewMode === "summary" ? "active" : ""}
            onClick={() => setViewMode("summary")}
          >
            <span>◔</span>
            <b>Analytics</b>
            <small>Curriculum, status and usage summaries</small>
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
  item,
  openEdit,
  toggleActive,
  remove,
  onClose,
}: {
  item: PathwayView;
  openEdit: (item: PathwayView) => void;
  toggleActive: (item: PathwayView) => void;
  remove: (item: PathwayView) => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{item.name || "Pathway"}</h2>
            <p>
              {item.curriculumName} · {item.active ? "Active" : "Inactive"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pathway actions"
          >
            ✕
          </button>
        </div>

        <div className="pathway-detail-strip">
          <span>
            <b>Code</b>
            {item.code || "Not set"}
          </span>
          <span>
            <b>Subjects</b>
            {item.subjectCount}
          </span>
          <span>
            <b>Students</b>
            {item.studentCount}
          </span>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(item)}>
            <span>✎</span>
            <b>Edit pathway</b>
            <small>Update curriculum, name, code and description</small>
          </button>
          <button type="button" onClick={() => toggleActive(item)}>
            <span>{item.active ? "⏸" : "✓"}</span>
            <b>{item.active ? "Deactivate" : "Activate"}</b>
            <small>
              {item.active
                ? "Hide this pathway from active use"
                : "Restore this pathway for active use"}
            </small>
          </button>
          <button type="button" className="danger" onClick={() => remove(item)}>
            <span>⌫</span>
            <b>Delete</b>
            <small>Soft delete this pathway locally</small>
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
  remove,
}: {
  rows: PathwayView[];
  openEdit: (item: PathwayView) => void;
  toggleActive: (item: PathwayView) => void;
  remove: (item: PathwayView) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Pathways ({rows.length})</th>
              <th>Curriculum</th>
              <th>Code</th>
              <th>Subjects</th>
              <th>Students</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={String(item.id)}>
                <td>
                  <strong>{item.name}</strong>
                  <span>{item.description || "No description"}</span>
                </td>
                <td>{item.curriculumName}</td>
                <td>{item.code || "—"}</td>
                <td>{item.subjectCount}</td>
                <td>{item.studentCount}</td>
                <td>
                  <Chip tone={item.active ? "green" : "gray"}>
                    {item.active ? "Active" : "Inactive"}
                  </Chip>
                </td>
                <td>
                  {timeText(
                    (item.row as AnyRow).updatedAt ||
                      (item.row as AnyRow).createdAt,
                  )}
                </td>
                <td>
                  <div className="ba-table-actions">
                    <button type="button" onClick={() => openEdit(item)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => toggleActive(item)}>
                      {item.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      className="ba-delete"
                      onClick={() => remove(item)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="ba-empty-table">No pathway matches your filters.</div>
        )}
      </div>
    </section>
  );
}

function PathwayModal({
  form,
  saving,
  curriculums,
  setModalOpen,
  updateForm,
  save,
}: {
  form: FormState;
  saving: boolean;
  curriculums: Curriculum[];
  setModalOpen: (open: boolean) => void;
  updateForm: (patch: Partial<FormState>) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Pathway" : "Add Pathway"}</h2>
            <p>
              Pathway will be saved under the selected school branch and
              curriculum.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            aria-label="Close pathway form"
          >
            ✕
          </button>
        </div>

        <section className="ba-form-section">
          <h3>Pathway Details</h3>
          <div className="ba-form two">
            <label>
              <span>Curriculum</span>
              <select
                value={form.curriculumId}
                onChange={(event) =>
                  updateForm({ curriculumId: event.target.value })
                }
              >
                <option value="">Select curriculum</option>
                {curriculums.map((row: any) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {row.name || row.title || `Curriculum ${row.id}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Pathway Name</span>
              <input
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                placeholder="e.g. Science Track"
              />
            </label>
            <label>
              <span>Code</span>
              <input
                value={form.code}
                onChange={(event) => updateForm({ code: event.target.value })}
                placeholder="e.g. SCI, GEN, BUS"
              />
            </label>
            <label>
              <span>Status</span>
              <select
                value={form.active ? "active" : "inactive"}
                onChange={(event) =>
                  updateForm({ active: event.target.value === "active" })
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="wide">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  updateForm({ description: event.target.value })
                }
                placeholder="Describe this stream, track, or specialization."
              />
            </label>
          </div>
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Add Pathway"}
          </button>
        </div>
      </form>
    </div>
  );
}

function groupedCounts(
  rows: PathwayView[],
  keyFn: (item: PathwayView) => string,
) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyFn(row) || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function AnalysisCard({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; value: number }[];
  total: number;
}) {
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

.ba-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}.ba-page button{-webkit-tap-highlight-color:transparent}.ba-page input,.ba-page select,.ba-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ba-page textarea{min-height:104px;padding-top:10px;resize:vertical}.ba-page input:focus,.ba-page select:focus,.ba-page textarea:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}.ba-state,.ba-search-card,.pathway-row,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet,.ba-modal{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer}.ba-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.ba-toast.success{background:rgba(34,197,94,.14);color:#166534}.ba-toast.error{background:rgba(239,68,68,.12);color:#991b1b}.ba-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}.ba-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ba-add-inline{flex:0 0 42px;border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:25px;line-height:1;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ba-list{display:grid;gap:7px;margin-top:10px}.pathway-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}.pathway-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 28%,var(--border,rgba(0,0,0,.10)));box-shadow:0 16px 34px rgba(15,23,42,.07)}.pathway-avatar{width:42px;height:42px;border-radius:16px;display:grid;place-items:center;flex:0 0 auto;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));color:var(--ba-primary);font-weight:1000}.pathway-main{display:grid;gap:2px;min-width:0}.pathway-main strong,.pathway-main small,.pathway-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pathway-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.pathway-main small{color:var(--muted,#64748b);font-size:12px;font-weight:800}.pathway-main em{color:var(--muted,#64748b);font-size:11px;font-style:normal;font-weight:750}.pathway-side{display:flex;align-items:center;gap:8px;color:var(--muted,#64748b)}.pathway-side i{font-style:normal;font-size:18px;line-height:1}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-block;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 15%,transparent)}.status-dot-mini.green{background:#22c55e;color:#22c55e}.status-dot-mini.gray{background:#94a3b8;color:#94a3b8}.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:rgba(107,114,128,.12);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ba-table-card{margin-top:10px;border-radius:22px;overflow:hidden}.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto}.ba-table-scroll table{width:100%;min-width:980px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}.ba-table-scroll th,.ba-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.10));vertical-align:top;text-align:left;font-size:13px;color:var(--text,#111827)}.ba-table-scroll th{background:color-mix(in srgb,var(--ba-primary) 7%,var(--card-bg,var(--surface,#fff)));color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ba-table-scroll td strong,.ba-table-scroll td span{display:block}.ba-table-scroll td strong{font-weight:1000}.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ba-table-actions{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;white-space:nowrap}.ba-table-actions button{flex:0 0 auto;min-height:32px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 10%,var(--surface,#fff));color:var(--ba-primary);font-size:11px;font-weight:950;cursor:pointer}.ba-table-actions button:first-child{background:var(--ba-primary);color:#fff}.ba-table-actions .ba-delete{background:color-mix(in srgb,#ef4444 9%,var(--surface,#fff));color:#dc2626;border:1px solid color-mix(in srgb,#ef4444 24%,transparent)}.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ba-analysis{border-radius:22px;padding:13px}.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-analysis-list{display:grid;gap:10px;margin-top:12px}.ba-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ba-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ba-analysis-list b,.ba-analysis-list small{font-size:12px}.ba-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ba-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed;border-radius:22px;padding:18px}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-sheet-backdrop,.ba-modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.58);backdrop-filter:blur(12px)}.ba-sheet,.ba-modal{width:min(720px,100%);max-height:min(92dvh,900px);overflow-y:auto;border-radius:28px;padding:14px}.ba-sheet.small{width:min(480px,100%)}.ba-sheet-head,.ba-modal-head,.ba-sheet-profile{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:4px 2px 14px}.ba-sheet-head h2,.ba-modal-head h2,.ba-sheet-profile h2{margin:0;font-size:20px;font-weight:1000;letter-spacing:-.05em;color:var(--text,#111827)}.ba-sheet-head p,.ba-modal-head p,.ba-sheet-profile p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-sheet-head button,.ba-modal-head button,.ba-sheet-profile button{width:40px;height:40px;flex:0 0 auto;display:grid;place-items:center;border-radius:999px;background:var(--surface,#fff);color:var(--muted,#64748b);border:1px solid var(--border,rgba(0,0,0,.10));font-weight:1000;cursor:pointer}.ba-form{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-form.two{grid-template-columns:minmax(0,1fr)}.ba-form.compact{gap:10px}.ba-form label{display:grid;gap:6px}.ba-form span,.ba-form-section h3{color:var(--muted,#64748b);font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}.ba-form .wide{grid-column:1/-1}.ba-form-section{margin-top:8px}.ba-form-section h3{margin:0 0 10px}.ba-sheet-actions,.ba-modal-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px}.ba-sheet-actions button,.ba-modal-actions button{min-height:40px;border:0;border-radius:999px;padding:0 14px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ba-sheet-actions .primary,.ba-modal-actions button:last-child{background:var(--ba-primary);color:#fff}.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"icon title" "icon text";align-items:center;column-gap:10px;text-align:left;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:11px;background:var(--surface,#fff);color:var(--text,#111827);cursor:pointer}.ba-menu-list button span{grid-area:icon;width:36px;height:36px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list button b{grid-area:title;font-size:13px;font-weight:1000}.ba-menu-list button small{grid-area:text;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ba-menu-list button.active{border-color:var(--ba-primary);background:color-mix(in srgb,var(--ba-primary) 10%,var(--surface,#fff))}.ba-menu-list button.active span{background:var(--ba-primary);color:#fff}.ba-menu-list button.danger{border-color:color-mix(in srgb,#ef4444 24%,transparent);background:color-mix(in srgb,#ef4444 8%,var(--surface,#fff))}.ba-menu-list button.danger span{background:color-mix(in srgb,#ef4444 14%,transparent);color:#dc2626}.pathway-detail-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:10px}.pathway-detail-strip span{padding:9px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--muted,#64748b);font-size:11px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pathway-detail-strip b{display:block;color:var(--text,#111827);font-size:12px;font-weight:1000;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media (min-width:680px){.ba-page{padding:12px}.ba-form.two,.ba-form{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-sheet-backdrop,.ba-modal-backdrop{place-items:center;padding:18px}.ba-sheet,.ba-modal{padding:18px}.pathway-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.ba-page{padding:16px}.pathway-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (min-width:1400px){.pathway-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.ba-page{padding:6px}.ba-sheet,.ba-modal,.ba-empty{border-radius:20px;padding:11px}.ba-sheet-actions,.ba-modal-actions{display:grid;grid-template-columns:1fr}.ba-sheet-actions button,.ba-modal-actions button{width:100%}.pathway-detail-strip{grid-template-columns:minmax(0,1fr)}}
`;
