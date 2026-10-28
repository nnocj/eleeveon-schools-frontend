"use client";

/**
 * app/branch-admin/modules/GradingSystems.tsx
 * --------------------------------------------------------------------------
 * Unified single-file grading structures and grade rules workspace.
 *
 * This file replaces the former standalone GradingSystems.tsx and
 * GradeRules.tsx modules. The persisted contracts use:
 * - gradingStructures
 * - gradingStructureId
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useSettings } from "../../context/settings-context";

import {
  db,
  type AssessmentApplicability,
  type GradeRule,
  type GradingStructure,
} from "../../lib/db/db";

import {
  createLocal,
  updateLocal,
  softDeleteLocal,
  listActiveLocal,
} from "../../lib/sync/syncUtils";

import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
import { useRegisterBranchWorkspaceToolbar } from "../../components/role-portals/shell/BranchWorkspaceToolbar";
import { printBranchTable } from "../../components/role-portals/shell/BranchTablePrint";

type GradingSystemsMode = "structures" | "rules";
const GRADING_SYSTEMS_MODE_KEY = "eleeveon_grading_systems_mode";

function readGradingSystemsMode(): GradingSystemsMode {
  if (typeof window === "undefined") return "structures";
  try {
    return window.localStorage.getItem(GRADING_SYSTEMS_MODE_KEY) === "rules"
      ? "rules"
      : "structures";
  } catch {
    return "structures";
  }
}

const GradingStructuresModule = (() => {
type ViewMode = "cards" | "table" | "summary";
type StatusFilter = "all" | "active" | "inactive";
type ToastTone = "success" | "error" | "info";

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type SystemForm = {
  id?: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
};

type SystemViewRow = {
  id: string;
  row: GradingStructure;
  name: string;
  code: string;
  description: string;
  active: boolean;
  ruleCount: number;
  activeRuleCount: number;
  usageCount: number;
  ready: boolean;
};

const emptyForm = (): SystemForm => ({
  name: "",
  code: "",
  description: "",
  active: true,
});

const idOf = (value: any): string => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (value: any) =>
  String(value || "")
    .toLowerCase()
    .trim();
const tableSafe = (name: string) => (db as any)[name];

const isActiveRow = (row: any) => {
  const status = safeLower(row?.status);
  if (!row || row.isDeleted) return false;
  if (row.active === false) return false;
  return !["inactive", "deleted", "archived", "suspended"].includes(status);
};

const timeText = (value?: string | number | null) => {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return String(value);

  try {
    return new Intl.DateTimeFormat("en-GH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(time));
  } catch {
    return String(value);
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

function GradingStructuresWorkspace() {
  const dataRevision = useBranchTableRevision([
    "gradingStructures",
    "gradeRules",
    "assessmentApplicabilities",
  ]);

  const router = useRouter();
  const { settings, loading: settingsLoading } = useSettings();
  const workspace = useBranchWorkspaceScope();
  const {
    accountId,
    schoolId,
    branchId,
    authenticated,
    restoring: accountLoading,
    branchLoading: contextLoading,
    ready: workspaceReady,
    error: workspaceError,
  } = workspace;

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setViewMode(window.matchMedia("(min-width: 900px)").matches ? "table" : "cards");
    }
  }, []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const [systems, setSystems] = useState<GradingStructure[]>([]);
  const [rules, setRules] = useState<GradeRule[]>([]);
  const [applicabilities, setApplicabilities] = useState<
    AssessmentApplicability[]
  >([]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SystemViewRow | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SystemForm>(emptyForm());

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
    setSystems([]);
    setRules([]);
    setApplicabilities([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [systemRows, ruleRows, applicabilityRows] = await Promise.all([
        tableSafe("gradingStructures")?.toArray?.() || [],
        tableSafe("gradeRules")?.toArray?.() || [],
        tableSafe("assessmentApplicabilities")?.toArray?.() || [],
      ]);

      setSystems(
        (systemRows as GradingStructure[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );

      setRules(
        (ruleRows as GradeRule[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort(
            (a: any, b: any) =>
              Number(b.minScore || 0) - Number(a.minScore || 0),
          ),
      );

      setApplicabilities(
        (applicabilityRows as AssessmentApplicability[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
    } catch (error) {
      console.error("Failed to load grading systems:", error);
      clearData();
      showToast("error", "Failed to load grading systems.");
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

  const ruleCountBySystem = useMemo(() => {
    const map = new Map<string, number>();

    rules.forEach((rule: any) => {
      const id = idOf(rule.gradingStructureId);
      if (!id) return;
      map.set(id, (map.get(id) || 0) + 1);
    });

    return map;
  }, [rules]);

  const activeRuleCountBySystem = useMemo(() => {
    const map = new Map<string, number>();

    rules.filter(isActiveRow).forEach((rule: any) => {
      const id = idOf(rule.gradingStructureId);
      if (!id) return;
      map.set(id, (map.get(id) || 0) + 1);
    });

    return map;
  }, [rules]);

  const usageCountBySystem = useMemo(() => {
    const map = new Map<string, number>();

    applicabilities.forEach((row: any) => {
      const id = idOf(row.gradingStructureId);
      if (!id) return;
      map.set(id, (map.get(id) || 0) + 1);
    });

    return map;
  }, [applicabilities]);

  const viewRows = useMemo<SystemViewRow[]>(() => {
    return systems.map((system: any) => {
      const id = idOf(system.id);
      const activeRuleCount = activeRuleCountBySystem.get(id) || 0;
      return {
        id,
        row: system,
        name: system.name || "Unnamed grading system",
        code: system.code || "",
        description: system.description || "",
        active: isActiveRow(system),
        ruleCount: ruleCountBySystem.get(id) || 0,
        activeRuleCount,
        usageCount: usageCountBySystem.get(id) || 0,
        ready: activeRuleCount >= 2,
      };
    });
  }, [activeRuleCountBySystem, ruleCountBySystem, systems, usageCountBySystem]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return viewRows.filter((system) => {
      const haystack = [system.name, system.code, system.description]
        .join(" ")
        .toLowerCase();
      const searchOk = !term || haystack.includes(term);
      const statusOk =
        statusFilter === "all" ||
        (statusFilter === "active" ? system.active : !system.active);

      return searchOk && statusOk;
    });
  }, [search, statusFilter, viewRows]);

  const activeCount = viewRows.filter((row) => row.active).length;
  const archivedCount = viewRows.length - activeCount;
  const readySystems = viewRows.filter((row) => row.ready).length;
  const usedSystems = viewRows.filter((row) => row.usageCount > 0).length;

  const activeFilterCount = useMemo(
    () => [statusFilter].filter((value) => value !== "all").length,
    [statusFilter],
  );

  const countsByStatus = useMemo(
    () =>
      groupedCounts(viewRows, (row) => (row.active ? "Active" : "Inactive")),
    [viewRows],
  );
  const countsByReadiness = useMemo(
    () =>
      groupedCounts(viewRows, (row) => (row.ready ? "Ready" : "Needs rules")),
    [viewRows],
  );
  const countsByUsage = useMemo(
    () =>
      groupedCounts(viewRows, (row) =>
        row.usageCount > 0 ? "Used" : "Unused",
      ),
    [viewRows],
  );

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const clearFilters = () => {
    setStatusFilter("all");
  };

  const updateForm = (patch: Partial<SystemForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const openCreate = () => {
    if (!requireTenant()) return;

    setSelectedItem(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (row: SystemViewRow | GradingStructure) => {
    const system: any = "row" in row ? row.row : row;

    setSelectedItem(null);
    setForm({
      id: idOf(system.id),
      name: system.name || "",
      code: system.code || "",
      description: system.description || "",
      active: isActiveRow(system),
    });
    setModalOpen(true);
  };

  const validate = () => {
    if (!form.name.trim()) return "Enter grading system name.";

    const duplicate = systems.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      return !row.isDeleted && safeLower(row.name) === safeLower(form.name);
    });

    if (duplicate) return "A grading system with this name already exists.";
    return "";
  };

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();

    if (!requireTenant()) return;

    const error = validate();
    if (error) {
      showToast("error", error);
      return;
    }

    try {
      setSaving(true);

      const existing = form.id
        ? systems.find((row: any) => sameId(row.id, form.id))
        : undefined;

      const payload: Partial<GradingStructure> = {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        description: form.description.trim() || undefined,
        active: form.active,
        isDeleted: false,
      } as Partial<GradingStructure>;

      if (form.id && existing) {
        await updateLocal("gradingStructures", String(form.id), payload);
      } else {
        await createLocal(
          "gradingStructures",
          payload as unknown as GradingStructure,
        );
      }

      setModalOpen(false);
      showToast(
        "success",
        form.id ? "Grading system updated." : "Grading system created.",
      );
      await load();
    } catch (error) {
      console.error("Failed to save grading system:", error);
      showToast("error", "Failed to save grading system.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (row: SystemViewRow) => {
    const confirmed = window.confirm(
      row.usageCount
        ? `"${row.name}" is used by ${row.usageCount} assessment applicability record(s). Archive anyway?`
        : `Archive "${row.name}"?`,
    );

    if (!confirmed) return;

    await softDeleteLocal("gradingStructures", row.id);
    setSelectedItem(null);
    showToast("success", "Grading system archived.");
    await load();
  };

  const duplicate = async (row: SystemViewRow) => {
    if (!requireTenant()) return;

    try {
      const newId = await createLocal("gradingStructures", {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        name: `${row.name || "Grading System"} Copy`,
        code: row.code || "COPY",
        description: row.description || undefined,
        active: true,
        isDeleted: false,
      } as unknown as GradingStructure);

      const savedId = idOf(
        typeof newId === "string" || typeof newId === "number"
          ? newId
          : (newId as any)?.id,
      );

      if (savedId) {
        const relatedRules = rules.filter(
          (rule: any) =>
            sameId(rule.gradingStructureId, row.id) && !rule.isDeleted,
        );
        for (const rule of relatedRules as any[]) {
          const { id, createdAt, updatedAt, version, synced, ...clone } = rule;
          await createLocal(
            "gradeRules" as any,
            {
              ...clone,
              accountId,
              schoolId: schoolId,
              branchId: branchId,
              gradingStructureId: savedId,
              active: true,
              isDeleted: false,
            } as any,
          );
        }
      }

      setSelectedItem(null);
      showToast("success", "Grading system duplicated with its rules.");
      await load();
    } catch (error) {
      console.error("Failed to duplicate grading system:", error);
      showToast("error", "Failed to duplicate grading system.");
    }
  };

  // Same toolbar as Students / Assessment Entries, including nested Setup.
  const gradingActions = {
    add: () => openCreate(),
    search: (value: string) => setSearch(value),
    filter: () => setFilterOpen(true),
    more: () => setMoreOpen(true),
    print: () => printBranchTable({
      title: "Grading structures",
      subtitle: `${filteredRows.length} matching structures`,
      columns: [
        { key: "name", label: "Structure" },
        { key: "code", label: "Code" },
        { key: "rules", label: "Active rules" },
        { key: "usage", label: "In use" },
        { key: "status", label: "Status" },
      ],
      rows: filteredRows.map(row => ({
        name: row.name, code: row.code || "—", rules: row.activeRuleCount,
        usage: row.usageCount, status: row.active ? "Active" : "Inactive",
      })),
    }),
  };
  useRegisterBranchWorkspaceToolbar("gradingSystems", gradingActions);
  useRegisterBranchWorkspaceToolbar("setupWorkspace", gradingActions);

  if (loading || accountLoading || settingsLoading || contextLoading || (!workspaceReady && !workspaceError)) {
    return (
      <State
        primary={primary}
        title="Opening Grading Systems..."
        text="Preparing branch grading systems and rule coverage."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing grading systems."
      />
    );
  }

  if (!schoolId || !branchId || workspaceError) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>{workspaceError || "Grading systems are managed under the active school branch."}</p>
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
        aria-label="Grading systems search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search grading systems..."
            aria-label="Search grading systems"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={openCreate}
          aria-label="Add grading system"
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

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {statusFilter !== "all" && (
            <button type="button" onClick={() => setStatusFilter("all")}>
              Status: {statusFilter === "active" ? "Active" : "Inactive"} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard
            title="By Status"
            rows={countsByStatus}
            total={viewRows.length}
          />
          <AnalysisCard
            title="By Readiness"
            rows={countsByReadiness}
            total={viewRows.length}
          />
          <AnalysisCard
            title="By Usage"
            rows={countsByUsage}
            total={viewRows.length}
          />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{filteredRows.length}</strong>
            <p>
              {activeCount} active · {archivedCount} archived · {readySystems}{" "}
              ready · {usedSystems} used · {rules.length} rules.
            </p>
          </article>
        </section>
      )}

      {viewMode === "table" && (
        <TableView
          rows={filteredRows}
          openEdit={openEdit}
          duplicate={duplicate}
          archive={archive}
        />
      )}

      {viewMode === "cards" && (
        <section className="ba-list grading-list">
          {filteredRows.map((row) => (
            <SystemListRow
              key={String(row.id)}
              item={row}
              onOpen={() => setSelectedItem(row)}
            />
          ))}

          {!filteredRows.length && (
            <Empty
              icon="🧮"
              title="No grading systems found"
              text="Create a grading system, then add its grade rules in the Grade Rules page."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          statusFilter={statusFilter}
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
          duplicate={duplicate}
          archive={archive}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {modalOpen && (
        <SystemModal
          form={form}
          saving={saving}
          updateForm={updateForm}
          setModalOpen={setModalOpen}
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

function SystemListRow({
  item,
  onOpen,
}: {
  item: SystemViewRow;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="subject-row grading-row" onClick={onOpen}>
      <span className="grading-icon">🧮</span>

      <span className="subject-main">
        <strong>{item.name}</strong>
        <small>
          {item.code || "No code"} · {item.activeRuleCount} active rule(s)
        </small>
        <em>
          {item.ruleCount} total rules · {item.usageCount} usage ·{" "}
          {item.ready ? "Ready" : "Needs rules"}
        </em>
      </span>

      <span className="subject-side">
        <span
          className={`status-dot-mini ${item.ready ? "green" : "orange"}`}
          title={item.ready ? "Rules ready" : "Needs rules"}
          aria-label={item.ready ? "Rules ready" : "Needs rules"}
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
  statusFilter,
  setStatusFilter,
  clearFilters,
  onClose,
}: {
  statusFilter: StatusFilter;
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
            <p>Filter grading systems by status.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive / Archived</option>
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
            <small>Compact grading system cards</small>
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
            <small>Status, readiness and usage summaries</small>
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
  duplicate,
  archive,
  onClose,
}: {
  item: SystemViewRow;
  openEdit: (row: SystemViewRow | GradingStructure) => void;
  duplicate: (row: SystemViewRow) => void | Promise<void>;
  archive: (row: SystemViewRow) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{item.name}</h2>
            <p>
              {item.code || "No code"} ·{" "}
              {item.ready ? "Rules ready" : "Needs rules"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close grading system actions"
          >
            ✕
          </button>
        </div>

        <div className="student-detail-strip">
          <span>
            <b>Rules</b>
            {item.ruleCount}
          </span>
          <span>
            <b>Active Rules</b>
            {item.activeRuleCount}
          </span>
          <span>
            <b>Usage</b>
            {item.usageCount}
          </span>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(item)}>
            <span>✎</span>
            <b>Edit system</b>
            <small>Update name, code, description and status</small>
          </button>

          <button type="button" onClick={() => duplicate(item)}>
            <span>⧉</span>
            <b>Duplicate with rules</b>
            <small>Create a copy and clone existing grade rules</small>
          </button>

          <button
            type="button"
            className="danger"
            onClick={() => archive(item)}
          >
            <span>⌫</span>
            <b>Archive</b>
            <small>Soft delete this grading system locally</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function TableView({
  rows,
  openEdit,
  duplicate,
  archive,
}: {
  rows: SystemViewRow[];
  openEdit: (row: SystemViewRow | GradingStructure) => void;
  duplicate: (row: SystemViewRow) => void | Promise<void>;
  archive: (row: SystemViewRow) => void | Promise<void>;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Grading Systems ({rows.length})</th>
              <th>Code</th>
              <th>Rules</th>
              <th>Active Rules</th>
              <th>Usage</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((system) => {
              const row: any = system.row;

              return (
                <tr key={String(system.id)}>
                  <td>
                    <strong>{system.name}</strong>
                    <span>{system.description || "No description"}</span>
                  </td>
                  <td>{system.code || "—"}</td>
                  <td>{system.ruleCount}</td>
                  <td>{system.activeRuleCount}</td>
                  <td>{system.usageCount}</td>
                  <td>
                    <div className="ba-chip-row">
                      <Chip tone={system.active ? "green" : "gray"}>
                        {system.active ? "Active" : "Inactive"}
                      </Chip>
                      {system.ready ? (
                        <Chip tone="blue">Rules ready</Chip>
                      ) : (
                        <Chip tone="orange">Needs rules</Chip>
                      )}
                    </div>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEdit(system)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => duplicate(system)}>
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="ba-delete"
                        onClick={() => archive(system)}
                      >
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!rows.length && (
          <div className="ba-empty-table">
            No grading system matches your filters.
          </div>
        )}
      </div>
    </section>
  );
}

function SystemModal({
  form,
  saving,
  updateForm,
  setModalOpen,
  save,
}: {
  form: SystemForm;
  saving: boolean;
  updateForm: (patch: Partial<SystemForm>) => void;
  setModalOpen: (open: boolean) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Grading System" : "New Grading System"}</h2>
            <p>
              A grading system groups grade rules such as A1, B2, Pass, Fail or
              custom remarks.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            aria-label="Close grading system form"
          >
            ✕
          </button>
        </div>

        <section className="ba-form-section">
          <h3>System Details</h3>
          <div className="ba-form">
            <label>
              <span>Name</span>
              <input
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                placeholder="Example: Ghana Basic School Grading"
              />
            </label>

            <label>
              <span>Code</span>
              <input
                value={form.code}
                onChange={(event) => updateForm({ code: event.target.value })}
                placeholder="Example: GES-BASIC"
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
                placeholder="Describe where this grading system should be used."
              />
            </label>
          </div>
        </section>

        <section className="ba-note">
          <strong>Next:</strong> After creating a grading system, add grade
          rules in the Grade Rules page.
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Create System"}
          </button>
        </div>
      </form>
    </div>
  );
}

function groupedCounts(
  rows: SystemViewRow[],
  keyFn: (item: SystemViewRow) => string,
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
@keyframes spin{to{transform:rotate(360deg)}}
.ba-page{min-height:100dvh;width:100%;max-width:100%;padding:8px;padding-bottom:max(28px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 10%,transparent),transparent 34rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}.ba-page input,.ba-page select,.ba-page textarea{width:100%;border:1px solid var(--border,rgba(148,163,184,.28));border-radius:15px;padding:0 12px;background:var(--surface,#fff);color:var(--text,#111827);outline:none;font-weight:750}.ba-page input,.ba-page select{min-height:43px}.ba-page textarea{min-height:92px;padding-top:10px;resize:vertical}.ba-state{min-height:min(420px,calc(100dvh - 32px));display:grid;place-items:center;align-content:center;gap:10px;width:min(520px,100%);margin:0 auto;padding:22px;border-radius:28px;background:var(--surface,#fff);border:1px solid var(--border,rgba(148,163,184,.22));box-shadow:0 24px 60px rgba(15,23,42,.08);text-align:center}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer}.ba-toast{position:sticky;top:8px;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.ba-toast.success{background:#dcfce7;color:#166534}.ba-toast.error{background:#fee2e2;color:#991b1b}.ba-toast.info{background:#dbeafe;color:#1d4ed8}.ba-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}

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
  flex: 0 0 42px;
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  font-size: 25px;
  line-height: 1;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent);
}
.ba-search-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
  margin-top: 2px;
  padding: 8px;
  border-radius: 24px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
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
.ba-search input {
  min-height: 42px;
  border: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 14px;
}
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
.ba-filter-button.active {
  background: var(--ba-primary);
  color: #fff;
  border-color: var(--ba-primary);
}
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
.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none;-ms-overflow-style:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}
.ba-list{display:grid;gap:7px;margin-top:10px}.subject-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:22px;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);box-shadow:0 12px 28px rgba(15,23,42,.045);text-align:left;cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}.subject-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 24%,var(--border,rgba(0,0,0,.10)));box-shadow:0 16px 34px rgba(15,23,42,.07)}.ba-avatar{width:48px;height:48px;flex:0 0 auto;display:grid;place-items:center;border-radius:18px;color:#fff;font-size:13px;font-weight:1000;box-shadow:0 12px 24px rgba(15,23,42,.12)}.subject-main,.subject-main strong,.subject-main small,.subject-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.subject-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.subject-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850;font-style:normal}.subject-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.subject-side{display:grid;justify-items:end;gap:6px;flex:0 0 auto}.subject-side i{color:var(--muted,#64748b);font-style:normal;font-size:18px;font-weight:1000;line-height:1}.status-dot-mini{width:10px;height:10px;display:inline-block;border-radius:999px;background:var(--muted,#64748b);box-shadow:0 0 0 4px color-mix(in srgb,currentColor 10%,transparent)}.status-dot-mini.green{background:#22c55e;color:#22c55e}.status-dot-mini.gray{background:#94a3b8;color:#94a3b8}.ba-inline-status{display:inline-flex;align-items:center;gap:8px;font-weight:850;color:var(--muted,#64748b)}
.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:rgba(107,114,128,.12);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}
.ba-empty,.ba-table-card,.ba-analysis,.ba-modal,.ba-sheet{min-width:0;border-radius:24px;background:var(--surface,#fff);border:1px solid var(--border,rgba(148,163,184,.2));box-shadow:0 16px 40px rgba(15,23,42,.055);overflow:hidden}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;padding:18px;text-align:center;border-style:dashed}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,#fff);font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-table-card{padding:11px}.ba-table-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.ba-table-head h3{margin:0;font-size:15px;font-weight:1000}.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(148,163,184,.18))}.ba-table-scroll table{width:100%;min-width:980px;border-collapse:collapse;background:var(--surface,#fff)}.ba-table-scroll th,.ba-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(148,163,184,.16));vertical-align:top;text-align:left;font-size:13px}.ba-table-scroll th{background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ba-table-scroll td strong,.ba-table-scroll td span{display:block}.ba-table-scroll td strong{font-weight:1000}.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ba-table-actions{display:flex;align-items:center;gap:6px;flex-wrap:nowrap}.ba-table-actions button,.ba-sheet-actions button,.ba-modal-actions button{min-height:34px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 10%,var(--surface,#fff));color:var(--ba-primary);font-size:11px;font-weight:950;cursor:pointer;white-space:nowrap}.ba-table-actions button:first-child,.ba-sheet-actions button:last-child,.ba-modal-actions button:last-child{background:var(--ba-primary);color:#fff}.ba-table-actions button.danger,.ba-more-list button.danger{color:var(--muted,#64748b);background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff))}.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}
.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-analysis{padding:13px}.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-analysis-list{display:grid;gap:10px;margin-top:12px}.ba-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ba-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ba-analysis-list b,.ba-analysis-list small{font-size:12px}.ba-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ba-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}
.ba-sheet-backdrop{position:fixed;inset:0;z-index:70;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.48);backdrop-filter:blur(10px)}.ba-sheet{width:min(560px,100%);max-height:86dvh;padding:14px;border-radius:28px;overflow-y:auto}.ba-sheet.compact{width:min(420px,100%)}.ba-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.ba-sheet-head h3{margin:0;font-size:18px;font-weight:1000;letter-spacing:-.04em}.ba-sheet-head p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px}.ba-sheet-head button,.ba-modal-head button{width:38px;height:38px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-weight:1000;cursor:pointer}.ba-sheet-form{display:grid;gap:10px}.ba-sheet-form label,.ba-form label{display:grid;gap:6px}.ba-sheet-form span,.ba-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ba-sheet-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.ba-more-list{display:grid;gap:8px}.ba-more-list button{min-height:44px;border:1px solid var(--border,rgba(148,163,184,.18));border-radius:18px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:950;cursor:pointer;text-align:left;padding:0 12px}.ba-more-list button.active{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff}
.ba-modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.58);backdrop-filter:blur(12px)}.ba-modal{width:min(900px,100%);max-height:min(92dvh,900px);overflow-y:auto;padding:14px;border-radius:28px;box-shadow:0 30px 90px rgba(15,23,42,.35)}.ba-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:4px 2px 14px}.ba-modal-head h2{margin:0;font-size:20px;font-weight:1000;letter-spacing:-.05em}.ba-modal-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-form{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-form .wide{grid-column:1/-1}.ba-preview-photo{width:96px;height:96px;object-fit:cover;border-radius:22px;border:1px solid var(--border,rgba(148,163,184,.22))}.ba-preview-banner{width:100%;height:130px;object-fit:cover;border-radius:22px;border:1px solid var(--border,rgba(148,163,184,.22))}.ba-modal-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--surface,#fff) 70%,transparent)}.ba-modal-actions button:first-child{background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827)}
@media (min-width: 680px){.ba-page{padding:12px;padding-bottom:44px}.ba-search-card{grid-template-columns:minmax(0,1fr) 48px 48px 48px}.ba-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.subject-row{border-radius:24px;padding:12px}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-modal-backdrop,.ba-sheet-backdrop{place-items:center;padding:18px}.ba-modal{padding:18px}}
@media (min-width: 1040px){.ba-page{padding:16px;padding-bottom:48px}.ba-search-card,.ba-list,.ba-analysis-grid,.ba-table-card,.ba-filter-chips{max-width:1180px;margin-left:auto;margin-right:auto}.ba-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ba-current-filter{grid-column:span 2}.ba-form{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width: 520px){.ba-page{padding:6px}.ba-search-card{grid-template-columns:minmax(0,1fr) 42px 42px 42px;gap:6px;padding:7px;border-radius:22px}.ba-add-inline,.ba-filter-button,.ba-icon-button{width:42px;height:42px}.subject-row{border-radius:19px;padding:9px}.ba-avatar{width:42px;height:42px;border-radius:16px}.ba-table-actions{gap:4px}.ba-table-actions button{padding:0 8px;font-size:10px}.ba-analysis,.ba-table-card,.ba-empty,.ba-modal,.ba-sheet{border-radius:20px;padding:11px}}
@media (min-width:980px){
  .ba-modal-backdrop,
  .ba-sheet-backdrop{
    top:var(--eds-shell-top-offset,0px);
    right:0;
    bottom:0;
    left:var(--portal-content-left,0px);
    width:auto;
    max-width:calc(100vw - var(--portal-content-left,0px));
    min-width:0;
    overflow-x:hidden;
  }
  .ba-modal,
  .ba-sheet{
    min-width:0;
    max-width:calc(100vw - var(--portal-content-left,0px) - 20px);
  }
}

/* Grading adapters built on the SubjectSetup primitives. */
.grading-list,.grade-rule-list{margin-top:8px}
.grading-row,.grade-rule-row,.seed-row{width:100%}
.grading-icon,.rule-icon{width:48px;height:48px;flex:0 0 auto;display:grid;place-items:center;border-radius:18px;background:linear-gradient(135deg,var(--ba-primary),color-mix(in srgb,var(--ba-primary) 62%,#0f172a));color:#fff;font-size:19px;font-weight:1000;box-shadow:0 12px 24px rgba(15,23,42,.12)}
.rule-icon.seed{background:color-mix(in srgb,var(--ba-primary) 14%,var(--surface,#fff));color:var(--ba-primary);border:1px solid color-mix(in srgb,var(--ba-primary) 20%,var(--border,transparent));box-shadow:none}
.status-dot-mini.red{background:#ef4444;color:#ef4444}.status-dot-mini.orange{background:#f59e0b;color:#f59e0b}.status-dot-mini.purple{background:#8b5cf6;color:#8b5cf6}
.ba-warning{margin-top:8px;padding:11px 12px;border-radius:20px;color:#92400e;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.22);box-shadow:0 12px 28px rgba(15,23,42,.035);font-size:12px;font-weight:850;line-height:1.5}
.ba-current-card{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-top:10px;padding:13px;border-radius:24px;background:var(--surface,#fff);border:1px solid var(--border,rgba(148,163,184,.2));box-shadow:0 16px 40px rgba(15,23,42,.055)}
.ba-current-card span{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-current-card strong{display:block;margin-top:4px;color:var(--text,#111827);font-size:16px;font-weight:1000;letter-spacing:-.04em}.ba-current-card p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.45}
.ba-sheet.small{width:min(420px,100%)}
.ba-sheet-profile{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.ba-sheet-profile h2{margin:0;font-size:18px;font-weight:1000;letter-spacing:-.04em}.ba-sheet-profile p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px}.ba-sheet-profile button{width:38px;height:38px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-weight:1000;cursor:pointer}
.student-detail-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0 12px}.student-detail-strip span{display:grid;gap:3px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);font-size:12px;font-weight:900}.student-detail-strip b{color:var(--muted,#64748b);font-size:9px;text-transform:uppercase;letter-spacing:.08em}
.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{min-height:54px;display:grid;grid-template-columns:30px minmax(0,1fr);column-gap:8px;align-items:center;border:1px solid var(--border,rgba(148,163,184,.18));border-radius:18px;background:var(--surface,#fff);color:var(--text,#111827);cursor:pointer;text-align:left;padding:8px 12px}.ba-menu-list button>span{grid-row:1/3;width:30px;height:30px;display:grid;place-items:center;border-radius:10px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list button>b,.ba-menu-list button>small{grid-column:2;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-menu-list button>b{font-size:12px;font-weight:950}.ba-menu-list button>small{color:var(--muted,#64748b);font-size:10px;font-weight:750}.ba-menu-list button.active{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff}.ba-menu-list button.active>span{background:rgba(255,255,255,.16);color:#fff}.ba-menu-list button.active>small{color:rgba(255,255,255,.8)}.ba-menu-list button.danger{color:#b91c1c}
.ba-form.compact{grid-template-columns:minmax(0,1fr)}
.ba-form-section{padding:12px;border-radius:20px;background:color-mix(in srgb,var(--muted,#64748b) 5%,transparent);border:1px solid var(--border,rgba(148,163,184,.16))}.ba-form-section h3{margin:0 0 10px;font-size:13px;font-weight:1000}.ba-note{margin-top:10px;padding:11px 12px;border-radius:18px;background:color-mix(in srgb,var(--ba-primary) 7%,transparent);border:1px solid color-mix(in srgb,var(--ba-primary) 14%,var(--border,transparent));color:var(--muted,#64748b);font-size:11px;line-height:1.5}.ba-note strong{color:var(--text,#111827)}
@media(max-width:520px){.grading-icon,.rule-icon{width:42px;height:42px;border-radius:16px}.student-detail-strip{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.student-detail-strip span{padding:8px}.ba-current-card{border-radius:20px;padding:11px}}

`;

return GradingStructuresWorkspace;
})();

const GradeRulesModule = (() => {
type ViewMode = "cards" | "table" | "summary";
type StatusFilter = "all" | "active" | "inactive";
type ToastTone = "success" | "error" | "info";

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type RuleForm = {
  id?: string;
  gradingStructureId: string;
  grade: string;
  minScore: string;
  maxScore: string;
  remark: string;
  order: string;
  active: boolean;
};

type RuleViewRow = {
  id: string;
  row: GradeRule;
  gradingStructureId: string;
  gradingSystemName: string;
  grade: string;
  minScore: number;
  maxScore: number;
  remark: string;
  order: number;
  active: boolean;
  systemUsage: number;
  systemOverlapCount: number;
  systemComplete: boolean;
};

type SystemCoverage = {
  rules: number;
  activeRules: number;
  hasLow: boolean;
  hasHigh: boolean;
  overlaps: number;
};

const emptyForm = (): RuleForm => ({
  gradingStructureId: "",
  grade: "",
  minScore: "0",
  maxScore: "100",
  remark: "",
  order: "1",
  active: true,
});

const idOf = (value: any): string => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (value: any) =>
  String(value || "")
    .toLowerCase()
    .trim();
const tableSafe = (name: string) => (db as any)[name];

const isActiveRow = (row: any) => {
  const status = safeLower(row?.status);
  if (!row || row.isDeleted) return false;
  if (row.active === false) return false;
  return !["inactive", "deleted", "archived", "suspended"].includes(status);
};

const timeText = (value?: string | number | null) => {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return String(value);

  try {
    return new Intl.DateTimeFormat("en-GH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(time));
  } catch {
    return String(value);
  }
};

const numberText = (value: any) =>
  new Intl.NumberFormat("en-GH", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const rangesOverlap = (
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
) => aMin <= bMax && bMin <= aMax;

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

function GradeRulesWorkspace() {
  const dataRevision = useBranchTableRevision([
    "gradingStructures",
    "gradeRules",
    "assessmentApplicabilities",
  ]);

  const router = useRouter();
  const { settings, loading: settingsLoading } = useSettings();
  const workspace = useBranchWorkspaceScope();
  const {
    accountId,
    schoolId,
    branchId,
    authenticated,
    restoring: accountLoading,
    branchLoading: contextLoading,
    ready: workspaceReady,
    error: workspaceError,
  } = workspace;

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setViewMode(window.matchMedia("(min-width: 900px)").matches ? "table" : "cards");
    }
  }, []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [systemFilter, setSystemFilter] = useState("all");

  const [systems, setSystems] = useState<GradingStructure[]>([]);
  const [rules, setRules] = useState<GradeRule[]>([]);
  const [applicabilities, setApplicabilities] = useState<
    AssessmentApplicability[]
  >([]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RuleViewRow | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<RuleForm>(emptyForm());

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
    setSystems([]);
    setRules([]);
    setApplicabilities([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [systemRows, ruleRows, applicabilityRows] = await Promise.all([
        listActiveLocal("gradingStructures", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        tableSafe("gradeRules")?.toArray?.() || [],
        tableSafe("assessmentApplicabilities")?.toArray?.() || [],
      ]);

      setSystems(
        (systemRows as GradingStructure[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );

      setRules(
        (ruleRows as GradeRule[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort(
            (a: any, b: any) =>
              Number(a.gradingStructureId || 0) - Number(b.gradingStructureId || 0) ||
              Number(a.order || 0) - Number(b.order || 0) ||
              Number(b.minScore || 0) - Number(a.minScore || 0),
          ),
      );

      setApplicabilities(
        (applicabilityRows as AssessmentApplicability[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
    } catch (error) {
      console.error("Failed to load grade rules:", error);
      clearData();
      showToast("error", "Failed to load grade rules.");
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

  const systemMap = useMemo(
    () => new Map(systems.map((row: any) => [idOf(row.id), row])),
    [systems],
  );

  const rulesBySystem = useMemo(() => {
    const map = new Map<string, GradeRule[]>();

    rules.forEach((rule: any) => {
      const id = idOf(rule.gradingStructureId);
      if (!id) return;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(rule);
    });

    return map;
  }, [rules]);

  const activeRulesBySystem = useMemo(() => {
    const map = new Map<string, GradeRule[]>();

    rules.filter(isActiveRow).forEach((rule: any) => {
      const id = idOf(rule.gradingStructureId);
      if (!id) return;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(rule);
    });

    return map;
  }, [rules]);

  const usageCountBySystem = useMemo(() => {
    const map = new Map<string, number>();

    applicabilities.forEach((row: any) => {
      const id = idOf(row.gradingStructureId);
      if (!id) return;
      map.set(id, (map.get(id) || 0) + 1);
    });

    return map;
  }, [applicabilities]);

  const systemCoverage = useMemo(() => {
    const map = new Map<string, SystemCoverage>();

    systems.forEach((system: any) => {
      const systemId = idOf(system.id);
      const all = rulesBySystem.get(systemId) || [];
      const active = activeRulesBySystem.get(systemId) || [];

      let overlaps = 0;
      active.forEach((a: any, index) => {
        active.slice(index + 1).forEach((b: any) => {
          if (
            rangesOverlap(
              Number(a.minScore || 0),
              Number(a.maxScore || 0),
              Number(b.minScore || 0),
              Number(b.maxScore || 0),
            )
          ) {
            overlaps += 1;
          }
        });
      });

      map.set(systemId, {
        rules: all.length,
        activeRules: active.length,
        hasLow: active.some((rule: any) => Number(rule.minScore || 0) <= 0),
        hasHigh: active.some((rule: any) => Number(rule.maxScore || 0) >= 100),
        overlaps,
      });
    });

    return map;
  }, [activeRulesBySystem, rulesBySystem, systems]);

  const viewRows = useMemo<RuleViewRow[]>(() => {
    return rules.map((rule: any) => {
      const id = idOf(rule.id);
      const gradingStructureId = idOf(rule.gradingStructureId);
      const system = systemMap.get(gradingStructureId) as any;
      const coverage = systemCoverage.get(gradingStructureId);
      const systemComplete =
        !!coverage &&
        coverage.activeRules >= 2 &&
        coverage.hasLow &&
        coverage.hasHigh &&
        coverage.overlaps === 0;

      return {
        id,
        row: rule,
        gradingStructureId,
        gradingSystemName: system?.name || "Unknown grading system",
        grade: rule.grade || "Unnamed grade",
        minScore: Number(rule.minScore || 0),
        maxScore: Number(rule.maxScore || 100),
        remark: rule.remark || "",
        order: Number(rule.order || 1),
        active: isActiveRow(rule),
        systemUsage: usageCountBySystem.get(gradingStructureId) || 0,
        systemOverlapCount: coverage?.overlaps || 0,
        systemComplete,
      };
    });
  }, [rules, systemCoverage, systemMap, usageCountBySystem]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return viewRows.filter((rule) => {
      const haystack = [
        rule.grade,
        rule.remark,
        rule.minScore,
        rule.maxScore,
        rule.gradingSystemName,
        rule.order,
      ]
        .join(" ")
        .toLowerCase();

      const searchOk = !term || haystack.includes(term);
      const statusOk =
        statusFilter === "all" ||
        (statusFilter === "active" ? rule.active : !rule.active);
      const systemOk =
        systemFilter === "all" || sameId(rule.gradingStructureId, systemFilter);

      return searchOk && statusOk && systemOk;
    });
  }, [search, statusFilter, systemFilter, viewRows]);

  const selectedSystem =
    systemFilter !== "all"
      ? (systemMap.get(idOf(systemFilter)) as any)
      : undefined;
  const selectedCoverage = selectedSystem
    ? systemCoverage.get(idOf(selectedSystem.id))
    : undefined;

  const completeSystems = Array.from(systemCoverage.values()).filter(
    (coverage) =>
      coverage.activeRules >= 2 &&
      coverage.hasLow &&
      coverage.hasHigh &&
      coverage.overlaps === 0,
  ).length;

  const systemsWithOverlaps = Array.from(systemCoverage.values()).filter(
    (coverage) => coverage.overlaps > 0,
  ).length;
  const activeCount = viewRows.filter((row) => row.active).length;
  const archivedCount = viewRows.length - activeCount;

  const activeFilterCount = useMemo(
    () =>
      [systemFilter, statusFilter].filter((value) => value !== "all").length,
    [statusFilter, systemFilter],
  );

  const countsBySystem = useMemo(
    () => groupedCounts(viewRows, (row) => row.gradingSystemName),
    [viewRows],
  );
  const countsByStatus = useMemo(
    () =>
      groupedCounts(viewRows, (row) => (row.active ? "Active" : "Inactive")),
    [viewRows],
  );
  const countsByCoverage = useMemo(
    () =>
      groupedCounts(viewRows, (row) =>
        row.systemComplete ? "Complete system" : "Needs review",
      ),
    [viewRows],
  );

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const clearFilters = () => {
    setSystemFilter("all");
    setStatusFilter("all");
  };

  const updateForm = (patch: Partial<RuleForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const nextOrderForSystem = (gradingStructureId: string) =>
    (rulesBySystem.get(gradingStructureId)?.length || 0) + 1;

  const openCreate = (gradingStructureId?: string) => {
    if (!requireTenant()) return;

    const targetSystemId =
      gradingStructureId ||
      (systemFilter !== "all"
        ? idOf(systemFilter)
        : idOf((systems[0] as any)?.id));

    setSelectedItem(null);
    setForm({
      ...emptyForm(),
      gradingStructureId: targetSystemId ? String(targetSystemId) : "",
      order: String(targetSystemId ? nextOrderForSystem(targetSystemId) : 1),
    });
    setModalOpen(true);
  };

  const openEdit = (row: RuleViewRow | GradeRule) => {
    const rule: any = "row" in row ? row.row : row;

    setSelectedItem(null);
    setForm({
      id: idOf(rule.id),
      gradingStructureId: String(rule.gradingStructureId || ""),
      grade: rule.grade || "",
      minScore: String(rule.minScore ?? 0),
      maxScore: String(rule.maxScore ?? 100),
      remark: rule.remark || "",
      order: String(rule.order || 1),
      active: isActiveRow(rule),
    });
    setModalOpen(true);
  };

  const validate = () => {
    if (!form.gradingStructureId) return "Select grading system.";
    if (!form.grade.trim()) return "Enter grade.";
    if (!form.remark.trim()) return "Enter remark.";

    const min = Number(form.minScore);
    const max = Number(form.maxScore);
    const order = Number(form.order || 0);

    if (!Number.isFinite(min) || min < 0 || min > 100)
      return "Minimum score must be between 0 and 100.";
    if (!Number.isFinite(max) || max < 0 || max > 100)
      return "Maximum score must be between 0 and 100.";
    if (min > max) return "Minimum score cannot be greater than maximum score.";
    if (!Number.isFinite(order) || order <= 0)
      return "Order must be greater than 0.";

    const duplicate = rules.find((rule: any) => {
      if (form.id && sameId(rule.id, form.id)) return false;
      return (
        sameId(rule.gradingStructureId, form.gradingStructureId) &&
        safeLower(rule.grade) === safeLower(form.grade) &&
        !rule.isDeleted
      );
    });

    if (duplicate)
      return "This grade already exists under the selected grading system.";

    if (form.active) {
      const overlap = rules
        .filter((rule: any) =>
          sameId(rule.gradingStructureId, form.gradingStructureId),
        )
        .filter((rule: any) => !form.id || !sameId(rule.id, form.id))
        .filter(isActiveRow)
        .find((rule: any) =>
          rangesOverlap(
            min,
            max,
            Number(rule.minScore || 0),
            Number(rule.maxScore || 0),
          ),
        );

      if (overlap)
        return `This score range overlaps with ${overlap.grade} (${overlap.minScore}-${overlap.maxScore}).`;
    }

    return "";
  };

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();

    if (!requireTenant()) return;

    const error = validate();
    if (error) {
      showToast("error", error);
      return;
    }

    try {
      setSaving(true);

      const existing = form.id
        ? rules.find((rule: any) => sameId(rule.id, form.id))
        : undefined;

      const payload: Partial<GradeRule> = {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        gradingStructureId: idOf(form.gradingStructureId),
        grade: form.grade.trim(),
        minScore: Number(form.minScore || 0),
        maxScore: Number(form.maxScore || 100),
        remark: form.remark.trim(),
        order: Number(form.order || 1),
        active: form.active,
        isDeleted: false,
      } as Partial<GradeRule>;

      if (form.id && existing) {
        await updateLocal("gradeRules", String(form.id), payload);
      } else {
        await createLocal("gradeRules", payload as unknown as GradeRule);
      }

      setModalOpen(false);
      showToast(
        "success",
        form.id ? "Grade rule updated." : "Grade rule created.",
      );
      await load();
    } catch (error) {
      console.error("Failed to save grade rule:", error);
      showToast("error", "Failed to save grade rule.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (row: RuleViewRow) => {
    const confirmed = window.confirm(
      row.systemUsage
        ? `This grading system is used by ${row.systemUsage} applicability record(s). Archive this rule anyway?`
        : `Archive grade rule "${row.grade}"?`,
    );

    if (!confirmed) return;

    await softDeleteLocal("gradeRules", row.id);
    setSelectedItem(null);
    showToast("success", "Grade rule archived.");
    await load();
  };

  const seedBasicRules = async (system: GradingStructure) => {
    if (!requireTenant()) return;

    const systemName = (system as any).name || "this grading system";
    if (!window.confirm(`Create a common 5-rule set under "${systemName}"?`))
      return;

    const seed = [
      {
        grade: "A",
        minScore: 80,
        maxScore: 100,
        remark: "Excellent",
        order: 1,
      },
      { grade: "B", minScore: 70, maxScore: 79, remark: "Very Good", order: 2 },
      { grade: "C", minScore: 60, maxScore: 69, remark: "Good", order: 3 },
      { grade: "D", minScore: 50, maxScore: 59, remark: "Pass", order: 4 },
      { grade: "F", minScore: 0, maxScore: 49, remark: "Fail", order: 5 },
    ];

    try {
      for (const rule of seed) {
        const exists = rules.find(
          (existing: any) =>
            sameId(existing.gradingStructureId, (system as any).id) &&
            safeLower(existing.grade) === safeLower(rule.grade),
        );

        if (exists) continue;

        await createLocal("gradeRules", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
          gradingStructureId: idOf((system as any).id),
          ...rule,
          active: true,
          isDeleted: false,
        } as unknown as GradeRule);
      }

      setSelectedItem(null);
      showToast("success", "Common grade rules created.");
      await load();
    } catch (error) {
      console.error("Failed to seed grade rules:", error);
      showToast("error", "Failed to seed grade rules.");
    }
  };

  // Keep the Grade Rules editor's toolbar in sync when its subtab is active.
  const gradeRuleActions = {
    add: () => openCreate(systemFilter !== "all" ? idOf(systemFilter) : undefined),
    search: (value: string) => setSearch(value),
    filter: () => setFilterOpen(true),
    more: () => setMoreOpen(true),
    print: () => printBranchTable({
      title: "Grade rules",
      subtitle: `${filteredRows.length} matching rules`,
      columns: [
        { key: "system", label: "Grading system" },
        { key: "grade", label: "Grade" },
        { key: "minimum", label: "Min" },
        { key: "maximum", label: "Max" },
        { key: "remark", label: "Remark" },
        { key: "status", label: "Status" },
      ],
      rows: filteredRows.map(row => ({
        system: row.gradingSystemName, grade: row.grade,
        minimum: row.minScore, maximum: row.maxScore,
        remark: row.remark || "—", status: row.active ? "Active" : "Inactive",
      })),
    }),
  };
  useRegisterBranchWorkspaceToolbar("gradingSystems", gradeRuleActions);
  useRegisterBranchWorkspaceToolbar("setupWorkspace", gradeRuleActions);

  if (loading || accountLoading || settingsLoading || contextLoading || (!workspaceReady && !workspaceError)) {
    return (
      <State
        primary={primary}
        title="Opening Grade Rules..."
        text="Preparing score ranges and grade remarks."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing grade rules."
      />
    );
  }

  if (!schoolId || !branchId || workspaceError) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>{workspaceError || "Grade rules are managed under the active school branch."}</p>
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
        aria-label="Grade rules search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search grade rules..."
            aria-label="Search grade rules"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={() =>
            openCreate(systemFilter !== "all" ? idOf(systemFilter) : undefined)
          }
          aria-label="Add grade rule"
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

      {!systems.length && (
        <section className="ba-warning">
          Create a grading system first before adding grade rules.
        </section>
      )}

      {systemsWithOverlaps > 0 && (
        <section className="ba-warning">
          Some grading systems have overlapping active score ranges. Edit the
          rules to prevent wrong grading.
        </section>
      )}

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {systemFilter !== "all" && (
            <button type="button" onClick={() => setSystemFilter("all")}>
              System:{" "}
              {(systemMap.get(idOf(systemFilter)) as any)?.name || systemFilter}{" "}
              ×
            </button>
          )}
          {statusFilter !== "all" && (
            <button type="button" onClick={() => setStatusFilter("all")}>
              Status: {statusFilter === "active" ? "Active" : "Inactive"} ×
            </button>
          )}
        </section>
      )}

      {selectedSystem && viewMode === "cards" && !search && (
        <section className="ba-current-card">
          <div>
            <span>Selected grading system</span>
            <strong>{selectedSystem.name}</strong>
            <p>
              {selectedCoverage?.activeRules || 0} active rule(s) ·{" "}
              {usageCountBySystem.get(idOf(selectedSystem.id)) || 0}{" "}
              applicability usage
            </p>
          </div>
          <Chip tone={(selectedCoverage?.overlaps || 0) > 0 ? "red" : "green"}>
            {(selectedCoverage?.overlaps || 0) > 0 ? "Overlaps" : "Clean"}
          </Chip>
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard
            title="Rules by System"
            rows={countsBySystem}
            total={viewRows.length}
          />
          <AnalysisCard
            title="Rules by Status"
            rows={countsByStatus}
            total={viewRows.length}
          />
          <AnalysisCard
            title="System Coverage"
            rows={countsByCoverage}
            total={viewRows.length}
          />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{filteredRows.length}</strong>
            <p>
              {activeCount} active · {archivedCount} archived ·{" "}
              {completeSystems} complete systems · {systemsWithOverlaps} with
              overlaps.
            </p>
          </article>
        </section>
      )}

      {viewMode === "table" && (
        <TableView rows={filteredRows} openEdit={openEdit} archive={archive} />
      )}

      {viewMode === "cards" && (
        <section className="ba-list grade-rule-list">
          {filteredRows.map((rule) => (
            <RuleListRow
              key={String(rule.id)}
              item={rule}
              onOpen={() => setSelectedItem(rule)}
            />
          ))}

          {!!systems.length && (
            <button
              type="button"
              className="subject-row seed-row"
              onClick={() => seedBasicRules(systems[0] as any)}
            >
              <span className="rule-icon seed">⚡</span>
              <span className="subject-main">
                <strong>Quick seed rules</strong>
                <small>
                  Create a basic A-F rule set under a grading system.
                </small>
                <em>
                  Tap to seed{" "}
                  {String(
                    (systems[0] as any)?.name || "the first grading system",
                  )}
                  .
                </em>
              </span>
              <span className="subject-side">
                <span className="status-dot-mini purple" />
                <i>⋯</i>
              </span>
            </button>
          )}

          {!filteredRows.length && (
            <Empty
              icon="📏"
              title="No grade rules found"
              text="Create rules such as A: 80-100, B: 70-79, or custom grade bands."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          systems={systems}
          systemCoverage={systemCoverage}
          systemFilter={systemFilter}
          statusFilter={statusFilter}
          setSystemFilter={setSystemFilter}
          setStatusFilter={setStatusFilter}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          systems={systems}
          setViewMode={(mode) => {
            setViewMode(mode);
            setMoreOpen(false);
          }}
          seedBasicRules={async (system) => {
            setMoreOpen(false);
            await seedBasicRules(system);
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
          archive={archive}
          seedBasicRules={(system) => seedBasicRules(system)}
          systemMap={systemMap}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {modalOpen && (
        <RuleModal
          form={form}
          saving={saving}
          systems={systems}
          rulesBySystem={rulesBySystem}
          updateForm={updateForm}
          setModalOpen={setModalOpen}
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

function RuleListRow({
  item,
  onOpen,
}: {
  item: RuleViewRow;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="subject-row grade-rule-row"
      onClick={onOpen}
    >
      <span className="rule-icon">📏</span>

      <span className="subject-main">
        <strong>{item.grade}</strong>
        <small>
          {item.gradingSystemName} · {numberText(item.minScore)}-
          {numberText(item.maxScore)}
        </small>
        <em>
          {item.remark || "No remark"} · order {item.order} ·{" "}
          {item.systemComplete ? "system complete" : "needs review"}
        </em>
      </span>

      <span className="subject-side">
        <span
          className={`status-dot-mini ${item.systemOverlapCount > 0 ? "red" : item.systemComplete ? "green" : "orange"}`}
          title={
            item.systemOverlapCount > 0
              ? "Overlap detected"
              : item.systemComplete
                ? "System complete"
                : "Needs review"
          }
          aria-label={
            item.systemOverlapCount > 0
              ? "Overlap detected"
              : item.systemComplete
                ? "System complete"
                : "Needs review"
          }
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
  systems,
  systemCoverage,
  systemFilter,
  statusFilter,
  setSystemFilter,
  setStatusFilter,
  clearFilters,
  onClose,
}: {
  systems: GradingStructure[];
  systemCoverage: Map<string, SystemCoverage>;
  systemFilter: string;
  statusFilter: StatusFilter;
  setSystemFilter: (value: string) => void;
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
            <p>Filter grade rules by grading system and status.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Grading System</span>
            <select
              value={systemFilter}
              onChange={(event) => setSystemFilter(event.target.value)}
            >
              <option value="all">All grading systems</option>
              {systems.map((system: any) => (
                <option key={String(system.id)} value={String(system.id)}>
                  {system.name} (
                  {systemCoverage.get(idOf(system.id))?.activeRules || 0} rules)
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive / Archived</option>
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
  systems,
  setViewMode,
  seedBasicRules,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  systems: GradingStructure[];
  setViewMode: (mode: ViewMode) => void;
  seedBasicRules: (system: GradingStructure) => void | Promise<void>;
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
            <small>Compact grade rule cards</small>
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
            <small>Coverage and overlap summaries</small>
          </button>

          {!!systems[0] && (
            <button type="button" onClick={() => seedBasicRules(systems[0])}>
              <span>⚡</span>
              <b>Seed first system</b>
              <small>Create common A-F grade rules</small>
            </button>
          )}

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
  archive,
  seedBasicRules,
  systemMap,
  onClose,
}: {
  item: RuleViewRow;
  openEdit: (row: RuleViewRow | GradeRule) => void;
  archive: (row: RuleViewRow) => void | Promise<void>;
  seedBasicRules: (system: GradingStructure) => void | Promise<void>;
  systemMap: Map<string, GradingStructure>;
  onClose: () => void;
}) {
  const system = systemMap.get(item.gradingStructureId);

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{item.grade}</h2>
            <p>
              {item.gradingSystemName} · {numberText(item.minScore)}-
              {numberText(item.maxScore)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close grade rule actions"
          >
            ✕
          </button>
        </div>

        <div className="student-detail-strip">
          <span>
            <b>Min</b>
            {numberText(item.minScore)}
          </span>
          <span>
            <b>Max</b>
            {numberText(item.maxScore)}
          </span>
          <span>
            <b>Usage</b>
            {item.systemUsage}
          </span>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(item)}>
            <span>✎</span>
            <b>Edit rule</b>
            <small>Update score range, grade, remark and status</small>
          </button>

          {system && (
            <button type="button" onClick={() => seedBasicRules(system)}>
              <span>⚡</span>
              <b>Seed system</b>
              <small>Add common A-F rules to this grading system</small>
            </button>
          )}

          <button
            type="button"
            className="danger"
            onClick={() => archive(item)}
          >
            <span>⌫</span>
            <b>Archive</b>
            <small>Soft delete this grade rule locally</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function TableView({
  rows,
  openEdit,
  archive,
}: {
  rows: RuleViewRow[];
  openEdit: (row: RuleViewRow | GradeRule) => void;
  archive: (row: RuleViewRow) => void | Promise<void>;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Grade Rules ({rows.length})</th>
              <th>System</th>
              <th>Range</th>
              <th>Remark</th>
              <th>Order</th>
              <th>System Status</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((rule) => {
              const row: any = rule.row;

              return (
                <tr key={String(rule.id)}>
                  <td>
                    <strong>{rule.grade}</strong>
                    <span>Grade rule</span>
                  </td>
                  <td>{rule.gradingSystemName}</td>
                  <td>
                    {numberText(rule.minScore)} - {numberText(rule.maxScore)}
                  </td>
                  <td>{rule.remark || "—"}</td>
                  <td>{rule.order || "—"}</td>
                  <td>
                    <Chip
                      tone={
                        rule.systemOverlapCount > 0
                          ? "red"
                          : rule.systemComplete
                            ? "green"
                            : "orange"
                      }
                    >
                      {rule.systemOverlapCount > 0
                        ? "Overlaps"
                        : rule.systemComplete
                          ? "Complete"
                          : "Needs review"}
                    </Chip>
                  </td>
                  <td>
                    <Chip tone={rule.active ? "green" : "gray"}>
                      {rule.active ? "Active" : "Inactive"}
                    </Chip>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEdit(rule)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ba-delete"
                        onClick={() => archive(rule)}
                      >
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!rows.length && (
          <div className="ba-empty-table">
            No grade rule matches your filters.
          </div>
        )}
      </div>
    </section>
  );
}

function RuleModal({
  form,
  saving,
  systems,
  rulesBySystem,
  updateForm,
  setModalOpen,
  save,
}: {
  form: RuleForm;
  saving: boolean;
  systems: GradingStructure[];
  rulesBySystem: Map<string, GradeRule[]>;
  updateForm: (patch: Partial<RuleForm>) => void;
  setModalOpen: (open: boolean) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Grade Rule" : "New Grade Rule"}</h2>
            <p>
              Define score range, grade and remark under one grading system.
              Ranges must not overlap.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            aria-label="Close grade rule form"
          >
            ✕
          </button>
        </div>

        <section className="ba-form-section">
          <h3>Rule Details</h3>
          <div className="ba-form">
            <label className="wide">
              <span>Grading System</span>
              <select
                value={form.gradingStructureId}
                onChange={(event) => {
                  const id = idOf(event.target.value);
                  updateForm({
                    gradingStructureId: event.target.value,
                    order: form.id
                      ? form.order
                      : String((rulesBySystem.get(id)?.length || 0) + 1),
                  });
                }}
              >
                <option value="">Select grading system</option>
                {systems.map((system: any) => (
                  <option key={String(system.id)} value={String(system.id)}>
                    {system.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Grade</span>
              <input
                value={form.grade}
                onChange={(event) => updateForm({ grade: event.target.value })}
                placeholder="A, B, C, Pass, Fail..."
              />
            </label>

            <label>
              <span>Minimum Score</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.minScore}
                onChange={(event) =>
                  updateForm({ minScore: event.target.value })
                }
              />
            </label>

            <label>
              <span>Maximum Score</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.maxScore}
                onChange={(event) =>
                  updateForm({ maxScore: event.target.value })
                }
              />
            </label>

            <label>
              <span>Order</span>
              <input
                type="number"
                min="1"
                value={form.order}
                onChange={(event) => updateForm({ order: event.target.value })}
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
              <span>Remark</span>
              <textarea
                value={form.remark}
                onChange={(event) => updateForm({ remark: event.target.value })}
                placeholder="Excellent, Good, Pass, Needs improvement..."
              />
            </label>
          </div>
        </section>

        <section className="ba-note">
          <strong>Rule:</strong> Active score ranges inside the same grading
          system must not overlap.
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Create Rule"}
          </button>
        </div>
      </form>
    </div>
  );
}

function groupedCounts(
  rows: RuleViewRow[],
  keyFn: (item: RuleViewRow) => string,
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
@keyframes spin{to{transform:rotate(360deg)}}
.ba-page{min-height:100dvh;width:100%;max-width:100%;padding:8px;padding-bottom:max(28px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 10%,transparent),transparent 34rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}.ba-page input,.ba-page select,.ba-page textarea{width:100%;border:1px solid var(--border,rgba(148,163,184,.28));border-radius:15px;padding:0 12px;background:var(--surface,#fff);color:var(--text,#111827);outline:none;font-weight:750}.ba-page input,.ba-page select{min-height:43px}.ba-page textarea{min-height:92px;padding-top:10px;resize:vertical}.ba-state{min-height:min(420px,calc(100dvh - 32px));display:grid;place-items:center;align-content:center;gap:10px;width:min(520px,100%);margin:0 auto;padding:22px;border-radius:28px;background:var(--surface,#fff);border:1px solid var(--border,rgba(148,163,184,.22));box-shadow:0 24px 60px rgba(15,23,42,.08);text-align:center}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer}.ba-toast{position:sticky;top:8px;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.ba-toast.success{background:#dcfce7;color:#166534}.ba-toast.error{background:#fee2e2;color:#991b1b}.ba-toast.info{background:#dbeafe;color:#1d4ed8}.ba-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}

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
  flex: 0 0 42px;
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  font-size: 25px;
  line-height: 1;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent);
}
.ba-search-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
  margin-top: 2px;
  padding: 8px;
  border-radius: 24px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
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
.ba-search input {
  min-height: 42px;
  border: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 14px;
}
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
.ba-filter-button.active {
  background: var(--ba-primary);
  color: #fff;
  border-color: var(--ba-primary);
}
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
.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none;-ms-overflow-style:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}
.ba-list{display:grid;gap:7px;margin-top:10px}.subject-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:22px;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);box-shadow:0 12px 28px rgba(15,23,42,.045);text-align:left;cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}.subject-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 24%,var(--border,rgba(0,0,0,.10)));box-shadow:0 16px 34px rgba(15,23,42,.07)}.ba-avatar{width:48px;height:48px;flex:0 0 auto;display:grid;place-items:center;border-radius:18px;color:#fff;font-size:13px;font-weight:1000;box-shadow:0 12px 24px rgba(15,23,42,.12)}.subject-main,.subject-main strong,.subject-main small,.subject-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.subject-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.subject-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850;font-style:normal}.subject-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.subject-side{display:grid;justify-items:end;gap:6px;flex:0 0 auto}.subject-side i{color:var(--muted,#64748b);font-style:normal;font-size:18px;font-weight:1000;line-height:1}.status-dot-mini{width:10px;height:10px;display:inline-block;border-radius:999px;background:var(--muted,#64748b);box-shadow:0 0 0 4px color-mix(in srgb,currentColor 10%,transparent)}.status-dot-mini.green{background:#22c55e;color:#22c55e}.status-dot-mini.gray{background:#94a3b8;color:#94a3b8}.ba-inline-status{display:inline-flex;align-items:center;gap:8px;font-weight:850;color:var(--muted,#64748b)}
.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:rgba(107,114,128,.12);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}
.ba-empty,.ba-table-card,.ba-analysis,.ba-modal,.ba-sheet{min-width:0;border-radius:24px;background:var(--surface,#fff);border:1px solid var(--border,rgba(148,163,184,.2));box-shadow:0 16px 40px rgba(15,23,42,.055);overflow:hidden}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;padding:18px;text-align:center;border-style:dashed}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,#fff);font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-table-card{padding:11px}.ba-table-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.ba-table-head h3{margin:0;font-size:15px;font-weight:1000}.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(148,163,184,.18))}.ba-table-scroll table{width:100%;min-width:980px;border-collapse:collapse;background:var(--surface,#fff)}.ba-table-scroll th,.ba-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(148,163,184,.16));vertical-align:top;text-align:left;font-size:13px}.ba-table-scroll th{background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ba-table-scroll td strong,.ba-table-scroll td span{display:block}.ba-table-scroll td strong{font-weight:1000}.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ba-table-actions{display:flex;align-items:center;gap:6px;flex-wrap:nowrap}.ba-table-actions button,.ba-sheet-actions button,.ba-modal-actions button{min-height:34px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 10%,var(--surface,#fff));color:var(--ba-primary);font-size:11px;font-weight:950;cursor:pointer;white-space:nowrap}.ba-table-actions button:first-child,.ba-sheet-actions button:last-child,.ba-modal-actions button:last-child{background:var(--ba-primary);color:#fff}.ba-table-actions button.danger,.ba-more-list button.danger{color:var(--muted,#64748b);background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff))}.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}
.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-analysis{padding:13px}.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-analysis-list{display:grid;gap:10px;margin-top:12px}.ba-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ba-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ba-analysis-list b,.ba-analysis-list small{font-size:12px}.ba-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ba-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}
.ba-sheet-backdrop{position:fixed;inset:0;z-index:70;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.48);backdrop-filter:blur(10px)}.ba-sheet{width:min(560px,100%);max-height:86dvh;padding:14px;border-radius:28px;overflow-y:auto}.ba-sheet.compact{width:min(420px,100%)}.ba-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.ba-sheet-head h3{margin:0;font-size:18px;font-weight:1000;letter-spacing:-.04em}.ba-sheet-head p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px}.ba-sheet-head button,.ba-modal-head button{width:38px;height:38px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-weight:1000;cursor:pointer}.ba-sheet-form{display:grid;gap:10px}.ba-sheet-form label,.ba-form label{display:grid;gap:6px}.ba-sheet-form span,.ba-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ba-sheet-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.ba-more-list{display:grid;gap:8px}.ba-more-list button{min-height:44px;border:1px solid var(--border,rgba(148,163,184,.18));border-radius:18px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:950;cursor:pointer;text-align:left;padding:0 12px}.ba-more-list button.active{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff}
.ba-modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.58);backdrop-filter:blur(12px)}.ba-modal{width:min(900px,100%);max-height:min(92dvh,900px);overflow-y:auto;padding:14px;border-radius:28px;box-shadow:0 30px 90px rgba(15,23,42,.35)}.ba-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:4px 2px 14px}.ba-modal-head h2{margin:0;font-size:20px;font-weight:1000;letter-spacing:-.05em}.ba-modal-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-form{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-form .wide{grid-column:1/-1}.ba-preview-photo{width:96px;height:96px;object-fit:cover;border-radius:22px;border:1px solid var(--border,rgba(148,163,184,.22))}.ba-preview-banner{width:100%;height:130px;object-fit:cover;border-radius:22px;border:1px solid var(--border,rgba(148,163,184,.22))}.ba-modal-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--surface,#fff) 70%,transparent)}.ba-modal-actions button:first-child{background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827)}
@media (min-width: 680px){.ba-page{padding:12px;padding-bottom:44px}.ba-search-card{grid-template-columns:minmax(0,1fr) 48px 48px 48px}.ba-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.subject-row{border-radius:24px;padding:12px}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-modal-backdrop,.ba-sheet-backdrop{place-items:center;padding:18px}.ba-modal{padding:18px}}
@media (min-width: 1040px){.ba-page{padding:16px;padding-bottom:48px}.ba-search-card,.ba-list,.ba-analysis-grid,.ba-table-card,.ba-filter-chips{max-width:1180px;margin-left:auto;margin-right:auto}.ba-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ba-current-filter{grid-column:span 2}.ba-form{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width: 520px){.ba-page{padding:6px}.ba-search-card{grid-template-columns:minmax(0,1fr) 42px 42px 42px;gap:6px;padding:7px;border-radius:22px}.ba-add-inline,.ba-filter-button,.ba-icon-button{width:42px;height:42px}.subject-row{border-radius:19px;padding:9px}.ba-avatar{width:42px;height:42px;border-radius:16px}.ba-table-actions{gap:4px}.ba-table-actions button{padding:0 8px;font-size:10px}.ba-analysis,.ba-table-card,.ba-empty,.ba-modal,.ba-sheet{border-radius:20px;padding:11px}}
@media (min-width:980px){
  .ba-modal-backdrop,
  .ba-sheet-backdrop{
    top:var(--eds-shell-top-offset,0px);
    right:0;
    bottom:0;
    left:var(--portal-content-left,0px);
    width:auto;
    max-width:calc(100vw - var(--portal-content-left,0px));
    min-width:0;
    overflow-x:hidden;
  }
  .ba-modal,
  .ba-sheet{
    min-width:0;
    max-width:calc(100vw - var(--portal-content-left,0px) - 20px);
  }
}

/* Grading adapters built on the SubjectSetup primitives. */
.grading-list,.grade-rule-list{margin-top:8px}
.grading-row,.grade-rule-row,.seed-row{width:100%}
.grading-icon,.rule-icon{width:48px;height:48px;flex:0 0 auto;display:grid;place-items:center;border-radius:18px;background:linear-gradient(135deg,var(--ba-primary),color-mix(in srgb,var(--ba-primary) 62%,#0f172a));color:#fff;font-size:19px;font-weight:1000;box-shadow:0 12px 24px rgba(15,23,42,.12)}
.rule-icon.seed{background:color-mix(in srgb,var(--ba-primary) 14%,var(--surface,#fff));color:var(--ba-primary);border:1px solid color-mix(in srgb,var(--ba-primary) 20%,var(--border,transparent));box-shadow:none}
.status-dot-mini.red{background:#ef4444;color:#ef4444}.status-dot-mini.orange{background:#f59e0b;color:#f59e0b}.status-dot-mini.purple{background:#8b5cf6;color:#8b5cf6}
.ba-warning{margin-top:8px;padding:11px 12px;border-radius:20px;color:#92400e;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.22);box-shadow:0 12px 28px rgba(15,23,42,.035);font-size:12px;font-weight:850;line-height:1.5}
.ba-current-card{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-top:10px;padding:13px;border-radius:24px;background:var(--surface,#fff);border:1px solid var(--border,rgba(148,163,184,.2));box-shadow:0 16px 40px rgba(15,23,42,.055)}
.ba-current-card span{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-current-card strong{display:block;margin-top:4px;color:var(--text,#111827);font-size:16px;font-weight:1000;letter-spacing:-.04em}.ba-current-card p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.45}
.ba-sheet.small{width:min(420px,100%)}
.ba-sheet-profile{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.ba-sheet-profile h2{margin:0;font-size:18px;font-weight:1000;letter-spacing:-.04em}.ba-sheet-profile p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px}.ba-sheet-profile button{width:38px;height:38px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-weight:1000;cursor:pointer}
.student-detail-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0 12px}.student-detail-strip span{display:grid;gap:3px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);font-size:12px;font-weight:900}.student-detail-strip b{color:var(--muted,#64748b);font-size:9px;text-transform:uppercase;letter-spacing:.08em}
.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{min-height:54px;display:grid;grid-template-columns:30px minmax(0,1fr);column-gap:8px;align-items:center;border:1px solid var(--border,rgba(148,163,184,.18));border-radius:18px;background:var(--surface,#fff);color:var(--text,#111827);cursor:pointer;text-align:left;padding:8px 12px}.ba-menu-list button>span{grid-row:1/3;width:30px;height:30px;display:grid;place-items:center;border-radius:10px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list button>b,.ba-menu-list button>small{grid-column:2;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-menu-list button>b{font-size:12px;font-weight:950}.ba-menu-list button>small{color:var(--muted,#64748b);font-size:10px;font-weight:750}.ba-menu-list button.active{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff}.ba-menu-list button.active>span{background:rgba(255,255,255,.16);color:#fff}.ba-menu-list button.active>small{color:rgba(255,255,255,.8)}.ba-menu-list button.danger{color:#b91c1c}
.ba-form.compact{grid-template-columns:minmax(0,1fr)}
.ba-form-section{padding:12px;border-radius:20px;background:color-mix(in srgb,var(--muted,#64748b) 5%,transparent);border:1px solid var(--border,rgba(148,163,184,.16))}.ba-form-section h3{margin:0 0 10px;font-size:13px;font-weight:1000}.ba-note{margin-top:10px;padding:11px 12px;border-radius:18px;background:color-mix(in srgb,var(--ba-primary) 7%,transparent);border:1px solid color-mix(in srgb,var(--ba-primary) 14%,var(--border,transparent));color:var(--muted,#64748b);font-size:11px;line-height:1.5}.ba-note strong{color:var(--text,#111827)}
@media(max-width:520px){.grading-icon,.rule-icon{width:42px;height:42px;border-radius:16px}.student-detail-strip{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.student-detail-strip span{padding:8px}.ba-current-card{border-radius:20px;padding:11px}}

`;

return GradeRulesWorkspace;
})();

export default function GradingSystems() {
  const [mode, setMode] = useState<GradingSystemsMode>("structures");
  const [modeReady, setModeReady] = useState(false);

  useEffect(() => {
    setMode(readGradingSystemsMode());
    setModeReady(true);
  }, []);

  const changeMode = (next: GradingSystemsMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(GRADING_SYSTEMS_MODE_KEY, next);
    } catch {}
  };

  const ActiveWorkspace =
    mode === "rules" ? GradeRulesModule : GradingStructuresModule;

  return (
    <main className="subject-setup-root grading-systems-root" data-mode={mode}>
      <style>{gradingSystemsShellCss}</style>

      <section
        className="subject-setup-command grading-subtabs"
        aria-label="Grading systems workspace"
      >
        <div className="subject-setup-mode-switch grading-mode-switch" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "structures"}
            className={mode === "structures" ? "active" : ""}
            onClick={() => changeMode("structures")}
          >
            <span className="subject-setup-tab-icon">GS</span>
            <span>
              <strong>Structures</strong>
              <small>Definitions and usage</small>
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mode === "rules"}
            className={mode === "rules" ? "active" : ""}
            onClick={() => changeMode("rules")}
          >
            <span className="subject-setup-tab-icon">GR</span>
            <span>
              <strong>Grade Rules</strong>
              <small>Ranges and remarks</small>
            </span>
          </button>
        </div>
      </section>

      <section className="subject-setup-workspace">
        {modeReady ? (
          <ActiveWorkspace />
        ) : (
          <div className="subject-setup-boot">Opening grading workspace…</div>
        )}
      </section>
    </main>
  );
}

const gradingSystemsShellCss = `
.subject-setup-root {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  display: grid;
  gap: 10px;
  overflow-x: clip;
  overflow-y: visible;
  color:
    var(
      --eds-text,
      var(--text, #111827)
    );
}

.subject-setup-command {
  position: relative;
  z-index: 5;
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border:
    1px solid
    var(
      --eds-border,
      var(--border, rgba(15,23,42,.09))
    );
  border-radius:
    var(--eds-radius-card, 16px);
  background:
    color-mix(
      in srgb,
      var(
        --eds-header-bg,
        var(--surface, #ffffff)
      ) 96%,
      transparent
    );
  box-shadow:
    var(
      --eds-shadow-soft,
      0 8px 22px rgba(15,23,42,.06)
    );
  backdrop-filter:
    blur(14px)
    saturate(1.06);
  -webkit-backdrop-filter:
    blur(14px)
    saturate(1.06);
}

.subject-setup-command-copy {
  min-width: 0;
  flex: 1;
}

.subject-setup-command-copy strong,
.subject-setup-command-copy small {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.subject-setup-command-copy strong {
  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );
  font-size: 13px;
  font-weight: 900;
}

.subject-setup-command-copy small {
  margin-top: 3px;
  color:
    var(
      --eds-text-muted,
      var(--muted, #667085)
    );
  font-size: 9px;
  font-weight: 650;
}

.subject-setup-mode-switch {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns:
    repeat(4, minmax(0, 1fr));
  gap: 4px;
  padding: 3px;
  border:
    1px solid
    var(
      --eds-divider,
      var(--border, rgba(15,23,42,.08))
    );
  border-radius:
    var(--eds-radius-control, 13px);
  background:
    var(
      --eds-surface-sunken,
      color-mix(
        in srgb,
        var(--surface, #ffffff) 82%,
        var(--bg, #f4f7fb)
      )
    );
}

.subject-setup-mode-switch button {
  min-width: 105px;
  min-height: 40px;
  display: grid;
  grid-template-columns:
    27px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  padding: 4px 7px;
  border: 1px solid transparent;
  border-radius:
    calc(
      var(--eds-radius-control, 13px)
      - 3px
    );
  background: transparent;
  color:
    var(
      --eds-text,
      var(--text, #111827)
    );
  text-align: left;
  cursor: pointer;
}

.subject-setup-mode-switch button:hover {
  background:
    var(
      --eds-primary-softer,
      color-mix(
        in srgb,
        var(--primary-color, #2563eb) 7%,
        transparent
      )
    );
}

.subject-setup-mode-switch button.active {
  background:
    var(
      --eds-surface-raised,
      var(--surface, #ffffff)
    );
  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
  border-color:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
      ) 25%,
      var(--eds-border, transparent)
    );
  box-shadow:
    var(
      --eds-shadow-soft,
      0 4px 12px rgba(15,23,42,.07)
    );
}

.subject-setup-tab-icon {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background:
    var(
      --eds-primary-soft,
      color-mix(
        in srgb,
        var(--primary-color, #2563eb) 13%,
        transparent
      )
    );
  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
  font-size: 10px;
  font-weight: 950;
}

.subject-setup-mode-switch
button > span:last-child {
  min-width: 0;
}

.subject-setup-mode-switch strong,
.subject-setup-mode-switch small {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.subject-setup-mode-switch strong {
  color: inherit;
  font-size: 9.5px;
  font-weight: 850;
}

.subject-setup-mode-switch small {
  margin-top: 2px;
  color:
    var(
      --eds-text-muted,
      var(--muted, #667085)
    );
  font-size: 7.5px;
  font-weight: 650;
}

.subject-setup-workspace {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  height: auto;
  max-height: none;
  overflow-x: clip;
  overflow-y: visible;
}

.subject-setup-workspace > * {
  min-width: 0;
  max-width: 100%;
}

.subject-setup-boot {
  min-height: 180px;
  display: grid;
  place-items: center;
  border:
    1px solid
    var(--eds-border, rgba(15,23,42,.09));
  border-radius:
    var(--eds-radius-card, 16px);
  background:
    var(--eds-surface, #ffffff);
  color:
    var(--eds-text-muted, #667085);
  font-size: 11px;
  font-weight: 800;
}

@media (max-width: 1100px) {
  .subject-setup-command {
    align-items: stretch;
    flex-direction: column;
    gap: 7px;
  }

  .subject-setup-mode-switch {
    width: 100%;
  }

  .subject-setup-mode-switch button {
    min-width: 0;
  }
}

@media (max-width: 620px) {
  .subject-setup-mode-switch {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 430px) {
  .subject-setup-command {
    padding: 8px;
  }

  .subject-setup-command-copy small {
    white-space: normal;
    line-height: 1.35;
  }

  .subject-setup-mode-switch button {
    grid-template-columns:
      24px minmax(0, 1fr);
    gap: 5px;
  }

  .subject-setup-tab-icon {
    width: 24px;
    height: 24px;
    border-radius: 8px;
  }

  .subject-setup-mode-switch small {
    display: none;
  }
}

.grading-mode-switch{grid-template-columns:repeat(2,minmax(0,1fr))}


/* V34 compact shared-portal navigation — matches Students/Assessment Entries. */
.grading-systems-root { gap: 4px; background: transparent; }
.grading-systems-root .grading-subtabs {
  padding: 4px 0 7px; border: 0; border-bottom: 1px solid var(--border,rgba(148,163,184,.19));
  border-radius: 0; box-shadow: none; background: transparent; backdrop-filter: none;
  justify-content: flex-start;
}
.grading-systems-root .grading-mode-switch {
  width: max-content; max-width: 100%; grid-template-columns: repeat(2, minmax(0,1fr));
  background: var(--surface-2,var(--card-bg,var(--surface,#fff)));
  border-radius: 10px; border-color: var(--border,rgba(148,163,184,.2));
}
.grading-systems-root .grading-mode-switch button { min-height: 34px; min-width: 124px; padding: 4px 9px; border-radius: 8px; }
.grading-systems-root .grading-mode-switch button small { display: none; }
.grading-systems-root .grading-mode-switch button strong { font-size: 11px; }
.grading-systems-root .subject-setup-tab-icon { width: 24px; height: 24px; border-radius: 7px; font-size: 10px; }
.grading-systems-root .subject-setup-workspace { width:100%; min-width:0; }
.grading-systems-root .subject-setup-workspace > .ba-page {
  min-height: 0; background: transparent; padding: 2px 0 12px; overflow: visible;
}
.role-shell.branch-workspace-layout .grading-systems-root .ba-page > .ba-search-card { display:none; }
.grading-systems-root .ba-table-card { border-radius: 12px; overflow-x: auto; }
.grading-systems-root .ba-table-card table { font-size: 12px; width:100%; }
.grading-systems-root .student-row { border-radius: 12px; }
.grading-systems-root .ba-sheet, .grading-systems-root .ba-modal { border-radius: 16px; }
@media (max-width: 899px) {
  .grading-systems-root .grading-mode-switch { width:100%; }
  .grading-systems-root .grading-mode-switch button { min-width:0; }
}

`;
