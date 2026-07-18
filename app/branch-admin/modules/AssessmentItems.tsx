"use client";

/**
 * app/branch-admin/modules/AssessmentItems.tsx
 * Eleeveon Assessment Items V2.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this branch-admin assessment/grading module from accidentally using stale
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
 *
 * Responsibility:
 * - create/edit/archive assessmentStructureItems only
 * - validate item weight totals per assessment structure
 * - manage order, max score, compulsory flag and active state
 * - does NOT create assessment structures
 * - does NOT decide applicability
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
  type AcademicStructure,
  type AssessmentEntry,
  type AssessmentStructure,
  type AssessmentStructureItem,
} from "../../lib/db/db";

import { createLocal, updateLocal, softDeleteLocal, listActiveLocal } from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
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

type ItemForm = {
  id?: number;
  assessmentStructureId: string;
  name: string;
  weight: string;
  maxScore: string;
  order: string;
  compulsory: boolean;
  active: boolean;
};

type ItemViewRow = {
  id: number;
  row: AssessmentStructureItem;
  name: string;
  structureName: string;
  academicStructureName: string;
  assessmentStructureId: number;
  weight: number;
  maxScore: number;
  order: number;
  compulsory: boolean;
  active: boolean;
  usageCount: number;
  structureWeight: number;
  structureReady: boolean;
  structureLocked: boolean;
};

const emptyForm = (): ItemForm => ({
  assessmentStructureId: "",
  name: "",
  weight: "0",
  maxScore: "100",
  order: "1",
  compulsory: true,
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

function weightTone(weight: number): "green" | "red" | "orange" {
  if (weight === 100) return "green";
  if (weight > 100) return "red";
  return "orange";
}

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

export default function AssessmentItems() {
  const dataRevision = useDataRevision();

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

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [structureFilter, setStructureFilter] = useState("all");

  const [assessmentStructures, setAssessmentStructures] = useState<AssessmentStructure[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [items, setItems] = useState<AssessmentStructureItem[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemViewRow | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ItemForm>(emptyForm());

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
    setAssessmentStructures([]);
    setAcademicStructures([]);
    setItems([]);
    setEntries([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [structureRows, academicStructureRows, itemRows, entryRows] = await Promise.all([
        listActiveLocal("assessmentStructures", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        listActiveLocal("academicStructures", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        tableSafe("assessmentStructureItems")?.toArray?.() || [],
        tableSafe("assessmentEntries")?.toArray?.() || [],
      ]);

      setAssessmentStructures(
        (structureRows as AssessmentStructure[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        )
      );

      setAcademicStructures(
        (academicStructureRows as AcademicStructure[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        )
      );

      setItems(
        (itemRows as AssessmentStructureItem[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort((a: any, b: any) => {
            const aStructure = Number(a.assessmentStructureId || 0);
            const bStructure = Number(b.assessmentStructureId || 0);
            return aStructure - bStructure || Number(a.order || 0) - Number(b.order || 0);
          })
      );

      setEntries((entryRows as AssessmentEntry[]).filter((row) => sameTenant(row as TenantRow)));
    } catch (error) {
      console.error("Failed to load assessment items:", error);
      clearData();
      showToast("error", "Failed to load assessment items.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, accountLoading, settingsLoading, contextLoading,
    dataRevision,
  ]);

  const assessmentStructureMap = useMemo(
    () => new Map(assessmentStructures.map((row: any) => [idOf(row.id), row])),
    [assessmentStructures]
  );

  const academicStructureMap = useMemo(
    () => new Map(academicStructures.map((row: any) => [idOf(row.id), row])),
    [academicStructures]
  );

  const itemsByStructure = useMemo(() => {
    const map = new Map<number, AssessmentStructureItem[]>();

    items.forEach((item: any) => {
      const id = idOf(item.assessmentStructureId);
      if (!id) return;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(item);
    });

    return map;
  }, [items]);

  const activeWeightByStructure = useMemo(() => {
    const map = new Map<number, number>();

    items.forEach((item: any) => {
      if (!isActiveRow(item)) return;
      const id = idOf(item.assessmentStructureId);
      if (!id) return;
      map.set(id, (map.get(id) || 0) + Number(item.weight || 0));
    });

    return map;
  }, [items]);

  const entryCountByItem = useMemo(() => {
    const map = new Map<number, number>();

    entries.forEach((entry: any) => {
      const id = idOf(entry.assessmentStructureItemId);
      if (!id) return;
      map.set(id, (map.get(id) || 0) + 1);
    });

    return map;
  }, [entries]);

  const viewRows = useMemo<ItemViewRow[]>(() => {
    return items.map((item: any) => {
      const id = idOf(item.id);
      const structure = assessmentStructureMap.get(idOf(item.assessmentStructureId)) as any;
      const academic = academicStructureMap.get(idOf(structure?.academicStructureId)) as any;
      const structureWeight = activeWeightByStructure.get(idOf(item.assessmentStructureId)) || 0;

      return {
        id,
        row: item,
        name: item.name || "Unnamed item",
        structureName: structure?.name || "Unknown assessment structure",
        academicStructureName: academic?.name || "No academic structure",
        assessmentStructureId: idOf(item.assessmentStructureId),
        weight: Number(item.weight || 0),
        maxScore: Number(item.maxScore || 100),
        order: Number(item.order || 1),
        compulsory: item.compulsory !== false,
        active: isActiveRow(item),
        usageCount: entryCountByItem.get(id) || 0,
        structureWeight,
        structureReady: structureWeight === 100,
        structureLocked: !!structure?.locked,
      };
    });
  }, [academicStructureMap, activeWeightByStructure, assessmentStructureMap, entryCountByItem, items]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return viewRows.filter((item) => {
      const haystack = [
        item.name,
        item.weight,
        item.maxScore,
        item.order,
        item.structureName,
        item.academicStructureName,
      ]
        .join(" ")
        .toLowerCase();

      const searchOk = !term || haystack.includes(term);
      const statusOk =
        statusFilter === "all" ||
        (statusFilter === "active" ? item.active : !item.active);
      const structureOk =
        structureFilter === "all" || sameId(item.assessmentStructureId, structureFilter);

      return searchOk && statusOk && structureOk;
    });
  }, [search, statusFilter, structureFilter, viewRows]);

  const activeItems = viewRows.filter((item) => item.active);
  const archivedItems = viewRows.length - activeItems.length;
  const completeStructures = assessmentStructures.filter(
    (row: any) => (activeWeightByStructure.get(idOf(row.id)) || 0) === 100
  ).length;
  const incompleteStructures = assessmentStructures.length - completeStructures;

  const selectedStructure =
    structureFilter !== "all" ? assessmentStructureMap.get(idOf(structureFilter)) : undefined;

  const activeFilterCount = useMemo(
    () => [structureFilter, statusFilter].filter((value) => value !== "all").length,
    [structureFilter, statusFilter]
  );

  const countsByStructure = useMemo(() => groupedCounts(viewRows, (row) => row.structureName), [viewRows]);
  const countsByStatus = useMemo(() => groupedCounts(viewRows, (row) => (row.active ? "Active" : "Inactive")), [viewRows]);
  const countsByCompulsory = useMemo(() => groupedCounts(viewRows, (row) => (row.compulsory ? "Compulsory" : "Optional")), [viewRows]);

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const nextOrderForStructure = (assessmentStructureId: number) =>
    (itemsByStructure.get(assessmentStructureId)?.length || 0) + 1;

  const clearFilters = () => {
    setStructureFilter("all");
    setStatusFilter("all");
  };

  const updateForm = (patch: Partial<ItemForm>) => setForm((current) => ({ ...current, ...patch }));

  const openCreate = (assessmentStructureId?: number) => {
    if (!requireTenant()) return;

    const targetStructureId =
      assessmentStructureId ||
      (structureFilter !== "all" ? idOf(structureFilter) : idOf((assessmentStructures[0] as any)?.id));

    setSelectedItem(null);
    setForm({
      ...emptyForm(),
      assessmentStructureId: targetStructureId ? String(targetStructureId) : "",
      order: String(targetStructureId ? nextOrderForStructure(targetStructureId) : 1),
    });
    setModalOpen(true);
  };

  const openEdit = (row: ItemViewRow | AssessmentStructureItem) => {
    const item: any = "row" in row ? row.row : row;

    setSelectedItem(null);
    setForm({
      id: idOf(item.id),
      assessmentStructureId: String(item.assessmentStructureId || ""),
      name: item.name || "",
      weight: String(item.weight || 0),
      maxScore: String(item.maxScore || 100),
      order: String(item.order || 1),
      compulsory: item.compulsory !== false,
      active: isActiveRow(item),
    });
    setModalOpen(true);
  };

  const validate = () => {
    if (!form.assessmentStructureId) return "Select assessment structure.";
    if (!form.name.trim()) return "Enter item name.";

    const weight = Number(form.weight || 0);
    const maxScore = Number(form.maxScore || 0);
    const order = Number(form.order || 0);

    if (!Number.isFinite(weight) || weight < 0 || weight > 100) return "Weight must be between 0 and 100.";
    if (!Number.isFinite(maxScore) || maxScore <= 0) return "Max score must be greater than 0.";
    if (!Number.isFinite(order) || order <= 0) return "Order must be greater than 0.";

    const duplicate = items.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;

      return (
        sameId(row.assessmentStructureId, form.assessmentStructureId) &&
        safeLower(row.name) === safeLower(form.name) &&
        !row.isDeleted
      );
    });

    if (duplicate) return "An item with this name already exists under the selected assessment structure.";

    const structureId = idOf(form.assessmentStructureId);
    const otherActiveWeight = items
      .filter((row: any) => sameId(row.assessmentStructureId, structureId))
      .filter((row: any) => !form.id || !sameId(row.id, form.id))
      .filter(isActiveRow)
      .reduce((sum: number, row: any) => sum + Number(row.weight || 0), 0);

    if (form.active && otherActiveWeight + weight > 100) {
      return `Total active item weight will become ${otherActiveWeight + weight}%. It cannot exceed 100%.`;
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

      const existing = form.id ? items.find((row: any) => sameId(row.id, form.id)) : undefined;
      const payload: Partial<AssessmentStructureItem> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        assessmentStructureId: idOf(form.assessmentStructureId),
        name: form.name.trim(),
        weight: Number(form.weight || 0),
        maxScore: Number(form.maxScore || 100),
        order: Number(form.order || 1),
        compulsory: form.compulsory,
        active: form.active,
        isDeleted: false,
      } as Partial<AssessmentStructureItem>;

      if (form.id && existing) {
        await updateLocal("assessmentStructureItems", Number(form.id), payload);
      } else {
        await createLocal("assessmentStructureItems", payload as AssessmentStructureItem);
      }

      setModalOpen(false);
      showToast("success", form.id ? "Assessment item updated." : "Assessment item created.");
      await load();
    } catch (error) {
      console.error("Failed to save assessment item:", error);
      showToast("error", "Failed to save assessment item.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (row: ItemViewRow) => {
    const entryCount = row.usageCount;

    const confirmed = window.confirm(
      entryCount
        ? `"${row.name}" has ${entryCount} score record(s). Archive anyway?`
        : `Archive "${row.name}"?`
    );

    if (!confirmed) return;

    await softDeleteLocal("assessmentStructureItems", row.id);
    setSelectedItem(null);
    showToast("success", "Assessment item archived.");
    await load();
  };

  const duplicateItem = async (row: ItemViewRow) => {
    if (!requireTenant()) return;

    try {
      await createLocal("assessmentStructureItems", {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        assessmentStructureId: row.assessmentStructureId,
        name: `${row.name || "Item"} Copy`,
        weight: 0,
        maxScore: row.maxScore || 100,
        order: nextOrderForStructure(row.assessmentStructureId),
        compulsory: row.compulsory,
        active: true,
        isDeleted: false,
      } as AssessmentStructureItem);

      setSelectedItem(null);
      showToast("success", "Assessment item duplicated with 0% weight.");
      await load();
    } catch (error) {
      console.error("Failed to duplicate assessment item:", error);
      showToast("error", "Failed to duplicate assessment item.");
    }
  };

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return (
      <State
        primary={primary}
        title="Opening Assessment Items..."
        text="Checking assessment structures, weights, scores and score usage."
      />
    );
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing assessment items." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>Assessment items belong to one active school branch.</p>
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

      <section className="ba-search-card" aria-label="Assessment item search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search assessment items..."
            aria-label="Search assessment items"
          />
        </label>

        <button type="button" className="ba-add-inline" onClick={() => openCreate()} aria-label="Add assessment item">
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

      {!assessmentStructures.length && (
        <section className="ba-warning">
          Create at least one assessment structure first. Items must belong to a structure.
        </section>
      )}

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {structureFilter !== "all" && (
            <button type="button" onClick={() => setStructureFilter("all")}>
              Structure: {(assessmentStructureMap.get(idOf(structureFilter)) as any)?.name || structureFilter} ×
            </button>
          )}
          {statusFilter !== "all" && (
            <button type="button" onClick={() => setStatusFilter("all")}>
              Status: {statusFilter === "active" ? "Active" : "Inactive"} ×
            </button>
          )}
        </section>
      )}

      {selectedStructure && viewMode === "cards" && !search && (
        <section className="ba-current-card">
          <div>
            <span>Selected assessment structure</span>
            <strong>{(selectedStructure as any).name}</strong>
            <p>
              Total active weight: {activeWeightByStructure.get(idOf((selectedStructure as any).id)) || 0}% ·{" "}
              {itemsByStructure.get(idOf((selectedStructure as any).id))?.length || 0} item(s)
            </p>
          </div>
          <Chip tone={(activeWeightByStructure.get(idOf((selectedStructure as any).id)) || 0) === 100 ? "green" : "orange"}>
            {(activeWeightByStructure.get(idOf((selectedStructure as any).id)) || 0) === 100 ? "Ready" : "Incomplete"}
          </Chip>
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard title="Items by Structure" rows={countsByStructure} total={viewRows.length} />
          <AnalysisCard title="Items by Status" rows={countsByStatus} total={viewRows.length} />
          <AnalysisCard title="Items by Rule" rows={countsByCompulsory} total={viewRows.length} />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{filteredRows.length}</strong>
            <p>
              {activeItems.length} active · {archivedItems} archived · {completeStructures} complete structures · {incompleteStructures} incomplete.
            </p>
          </article>
        </section>
      )}

      {viewMode === "table" && (
        <TableView rows={filteredRows} openEdit={openEdit} duplicateItem={duplicateItem} archive={archive} />
      )}

      {viewMode === "cards" && (
        <section className="ba-list item-list">
          {filteredRows.map((item) => (
            <ItemListRow key={String(item.id)} item={item} onOpen={() => setSelectedItem(item)} />
          ))}

          {!filteredRows.length && (
            <Empty
              icon="🧩"
              title="No assessment items found"
              text="Create items like Classwork, Homework, Project, Practical or Exam under an assessment structure."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          assessmentStructures={assessmentStructures}
          activeWeightByStructure={activeWeightByStructure}
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
          item={selectedItem}
          openEdit={openEdit}
          duplicateItem={duplicateItem}
          archive={archive}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {modalOpen && (
        <ItemModal
          form={form}
          saving={saving}
          assessmentStructures={assessmentStructures}
          activeWeightByStructure={activeWeightByStructure}
          itemsByStructure={itemsByStructure}
          updateForm={updateForm}
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

function ItemListRow({ item, onOpen }: { item: ItemViewRow; onOpen: () => void }) {
  return (
    <button type="button" className="student-row item-row" onClick={onOpen}>
      <span className="item-icon">🧩</span>

      <span className="student-main">
        <strong>{item.name}</strong>
        <small>
          {item.structureName} · {item.weight}% / {item.maxScore}
        </small>
        <em>
          Order {item.order} · {item.compulsory ? "Compulsory" : "Optional"} · {item.usageCount} records
        </em>
      </span>

      <span className="student-side">
        <span
          className={`status-dot-mini ${item.structureReady ? "green" : weightTone(item.structureWeight)}`}
          title={`Structure weight ${item.structureWeight}%`}
          aria-label={`Structure weight ${item.structureWeight}%`}
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
  assessmentStructures,
  activeWeightByStructure,
  structureFilter,
  statusFilter,
  setStructureFilter,
  setStatusFilter,
  clearFilters,
  onClose,
}: {
  assessmentStructures: AssessmentStructure[];
  activeWeightByStructure: Map<number, number>;
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
            <p>Filter assessment items by structure and status.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Assessment Structure</span>
            <select value={structureFilter} onChange={(event) => setStructureFilter(event.target.value)}>
              <option value="all">All assessment structures</option>
              {assessmentStructures.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name} ({activeWeightByStructure.get(idOf(row.id)) || 0}%)
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
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
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            <span>☰</span>
            <b>List view</b>
            <small>Compact assessment item cards</small>
          </button>

          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            <span>☷</span>
            <b>Table view</b>
            <small>Dense records for laptop work</small>
          </button>

          <button type="button" className={viewMode === "summary" ? "active" : ""} onClick={() => setViewMode("summary")}>
            <span>◔</span>
            <b>Analytics</b>
            <small>Structure, status and compulsory summaries</small>
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
  duplicateItem,
  archive,
  onClose,
}: {
  item: ItemViewRow;
  openEdit: (row: ItemViewRow | AssessmentStructureItem) => void;
  duplicateItem: (row: ItemViewRow) => void | Promise<void>;
  archive: (row: ItemViewRow) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{item.name}</h2>
            <p>
              {item.structureName} · {item.weight}% weight
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close item actions">
            ✕
          </button>
        </div>

        <div className="student-detail-strip">
          <span>
            <b>Max Score</b>
            {numberText(item.maxScore)}
          </span>
          <span>
            <b>Order</b>
            {item.order}
          </span>
          <span>
            <b>Records</b>
            {item.usageCount}
          </span>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(item)}>
            <span>✎</span>
            <b>Edit item</b>
            <small>Update weight, max score, order and status</small>
          </button>

          <button type="button" onClick={() => duplicateItem(item)}>
            <span>⧉</span>
            <b>Duplicate item</b>
            <small>Create a copy with 0% weight</small>
          </button>

          <button type="button" className="danger" onClick={() => archive(item)}>
            <span>⌫</span>
            <b>Archive</b>
            <small>Soft delete this assessment item locally</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function TableView({
  rows,
  openEdit,
  duplicateItem,
  archive,
}: {
  rows: ItemViewRow[];
  openEdit: (row: ItemViewRow | AssessmentStructureItem) => void;
  duplicateItem: (row: ItemViewRow) => void | Promise<void>;
  archive: (row: ItemViewRow) => void | Promise<void>;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Items ({rows.length})</th>
              <th>Structure</th>
              <th>Academic Structure</th>
              <th>Weight</th>
              <th>Max Score</th>
              <th>Order</th>
              <th>Usage</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((item) => {
              const row: any = item.row;

              return (
                <tr key={String(item.id)}>
                  <td>
                    <strong>{item.name}</strong>
                    <span>{item.compulsory ? "Compulsory item" : "Optional item"}</span>
                  </td>
                  <td>
                    {item.structureName}
                    <span>Total active weight: {item.structureWeight}%</span>
                  </td>
                  <td>{item.academicStructureName}</td>
                  <td>
                    <Chip tone={item.weight > 0 ? "blue" : "orange"}>{numberText(item.weight)}%</Chip>
                  </td>
                  <td>{numberText(item.maxScore)}</td>
                  <td>{item.order || "—"}</td>
                  <td>{item.usageCount}</td>
                  <td>
                    <div className="ba-chip-row">
                      <Chip tone={item.active ? "green" : "gray"}>{item.active ? "Active" : "Inactive"}</Chip>
                      {item.compulsory && <Chip tone="purple">Compulsory</Chip>}
                    </div>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEdit(item)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => duplicateItem(item)}>
                        Duplicate
                      </button>
                      <button type="button" className="ba-delete" onClick={() => archive(item)}>
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!rows.length && <div className="ba-empty-table">No assessment item matches your filters.</div>}
      </div>
    </section>
  );
}

function ItemModal({
  form,
  saving,
  assessmentStructures,
  activeWeightByStructure,
  itemsByStructure,
  updateForm,
  setModalOpen,
  save,
}: {
  form: ItemForm;
  saving: boolean;
  assessmentStructures: AssessmentStructure[];
  activeWeightByStructure: Map<number, number>;
  itemsByStructure: Map<number, AssessmentStructureItem[]>;
  updateForm: (patch: Partial<ItemForm>) => void;
  setModalOpen: (open: boolean) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Assessment Item" : "New Assessment Item"}</h2>
            <p>
              Assessment items are the weighted parts of an assessment structure. Active item weights under one structure should total 100%.
            </p>
          </div>
          <button type="button" onClick={() => setModalOpen(false)} aria-label="Close item form">
            ✕
          </button>
        </div>

        <section className="ba-form-section">
          <h3>Item Details</h3>
          <div className="ba-form">
            <label className="wide">
              <span>Assessment Structure</span>
              <select
                value={form.assessmentStructureId}
                onChange={(event) => {
                  const structureId = idOf(event.target.value);
                  updateForm({
                    assessmentStructureId: event.target.value,
                    order: form.id ? form.order : String((itemsByStructure.get(structureId)?.length || 0) + 1),
                  });
                }}
              >
                <option value="">Select assessment structure</option>
                {assessmentStructures.map((row: any) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {row.name} · active weight {activeWeightByStructure.get(idOf(row.id)) || 0}%
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Item Name</span>
              <input
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                placeholder="e.g. Classwork, Homework, Exam"
              />
            </label>

            <label>
              <span>Weight %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.weight}
                onChange={(event) => updateForm({ weight: event.target.value })}
              />
            </label>

            <label>
              <span>Max Score</span>
              <input
                type="number"
                min="1"
                step="0.01"
                value={form.maxScore}
                onChange={(event) => updateForm({ maxScore: event.target.value })}
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
              <span>Compulsory</span>
              <select
                value={form.compulsory ? "yes" : "no"}
                onChange={(event) => updateForm({ compulsory: event.target.value === "yes" })}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>

            <label>
              <span>Status</span>
              <select
                value={form.active ? "active" : "inactive"}
                onChange={(event) => updateForm({ active: event.target.value === "active" })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        </section>

        <section className="ba-note">
          <strong>Tip:</strong> Keep active item weights under each assessment structure at exactly 100% for clean report computation.
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Create Item"}
          </button>
        </div>
      </form>
    </div>
  );
}

function groupedCounts(rows: ItemViewRow[], keyFn: (item: ItemViewRow) => string) {
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
.ba-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}
.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}
.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}
.ba-page button{-webkit-tap-highlight-color:transparent}
.ba-page input,.ba-page select,.ba-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}
.ba-page input:focus,.ba-page select:focus,.ba-page textarea:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}

.ba-state,.ba-search-card,.ba-current-card,.ba-card,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet,.ba-modal,.student-row,.ba-warning,.ba-note{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}
.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}
.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em;color:var(--text,#111827)}
.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}
.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer}

.ba-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}
.ba-toast.success{background:rgba(34,197,94,.14);color:#166534}.ba-toast.error{background:rgba(239,68,68,.12);color:#991b1b}.ba-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}
.ba-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}

.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}
.ba-add-inline{flex:0 0 42px;border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:25px;line-height:1;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}
.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}
.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}
.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}
.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}
.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}
.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}
.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}
.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none;-ms-overflow-style:none}
.ba-filter-chips::-webkit-scrollbar{display:none}
.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}
.ba-warning{margin-top:8px;padding:11px 12px;border-radius:20px;color:#92400e;background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.22);font-size:12px;font-weight:850;line-height:1.5}

.ba-current-card{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-top:10px;padding:12px;border-radius:22px}
.ba-current-card span{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}
.ba-current-card strong{display:block;margin-top:4px;color:var(--text,#111827);font-size:16px;font-weight:1000;letter-spacing:-.04em}
.ba-current-card p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.45}

.ba-list{display:grid;gap:7px;margin-top:10px}
.item-list{grid-template-columns:minmax(0,1fr)}
.student-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}
.student-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 28%,var(--border,rgba(0,0,0,.10)));box-shadow:0 16px 32px rgba(15,23,42,.075)}
.item-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);font-size:18px;color:var(--ba-primary)}
.student-main{display:grid;gap:2px;min-width:0}
.student-main strong,.student-main small,.student-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.student-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.025em}
.student-main small{color:var(--muted,#64748b);font-size:12px;font-weight:850}
.student-main em{color:var(--muted,#64748b);font-size:11px;font-style:normal;font-weight:700}
.student-side{display:inline-flex;align-items:center;gap:10px;color:var(--muted,#64748b)}
.student-side i{font-style:normal;font-weight:1000}
.status-dot-mini{width:10px;height:10px;display:inline-block;border-radius:999px;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 14%,transparent)}
.status-dot-mini.green{background:#22c55e;color:#22c55e}.status-dot-mini.red{background:#ef4444;color:#ef4444}.status-dot-mini.blue{background:#3b82f6;color:#3b82f6}.status-dot-mini.gray{background:#94a3b8;color:#94a3b8}.status-dot-mini.orange{background:#f59e0b;color:#f59e0b}.status-dot-mini.purple{background:#8b5cf6;color:#8b5cf6}

.ba-chip-row{display:flex;flex-wrap:wrap;gap:7px}
.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:rgba(107,114,128,.12);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}

.ba-table-card{margin-top:10px;border-radius:24px;overflow:hidden}
.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.10))}
.ba-table-scroll table{width:100%;min-width:1120px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}
.ba-table-scroll th,.ba-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}
.ba-table-scroll th{background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}
.ba-table-scroll td strong,.ba-table-scroll td span{display:block}
.ba-table-scroll td strong{font-weight:1000;color:var(--text,#111827)}
.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}
.ba-table-actions{display:flex;flex-wrap:nowrap;gap:7px;align-items:center}
.ba-table-actions button,.ba-modal-actions button{min-height:34px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 10%,var(--card-bg,#fff));color:var(--ba-primary);font-size:11px;font-weight:950;cursor:pointer;white-space:nowrap}
.ba-table-actions button:first-child,.ba-modal-actions button:last-child{background:var(--ba-primary);color:#fff}
.ba-table-actions .ba-delete{color:var(--muted,#64748b);background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff))}
.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}

.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}
.ba-analysis{padding:13px;border-radius:22px}
.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}
.ba-analysis strong{display:block;margin-top:8px;color:var(--text,#111827);font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}
.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}
.ba-analysis-list{display:grid;gap:10px;margin-top:12px}
.ba-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}
.ba-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}
.ba-analysis-list b,.ba-analysis-list small{font-size:12px}
.ba-analysis-list b{color:var(--text,#111827)}
.ba-analysis-list small{color:var(--muted,#64748b);font-weight:850}
.ba-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}
.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}
.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed;border-radius:22px;padding:13px}
.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,transparent);font-size:28px}
.ba-empty h3{margin:0;color:var(--text,#111827);font-size:18px;font-weight:1000}
.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}

.ba-sheet-backdrop,.ba-modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.58);backdrop-filter:blur(12px)}
.ba-sheet{width:min(620px,100%);max-height:min(88dvh,760px);overflow-y:auto;border-radius:28px;padding:14px;box-shadow:0 30px 90px rgba(15,23,42,.32)}
.ba-sheet.small{width:min(460px,100%)}
.ba-sheet-head,.ba-sheet-profile,.ba-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:4px 2px 14px}
.ba-sheet-head h2,.ba-sheet-profile h2,.ba-modal-head h2{margin:0;color:var(--text,#111827);font-size:20px;font-weight:1000;letter-spacing:-.05em}
.ba-sheet-head p,.ba-sheet-profile p,.ba-modal-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}
.ba-sheet-head button,.ba-sheet-profile button,.ba-modal-head button{width:38px;height:38px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827);font-weight:1000;cursor:pointer}
.ba-form{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.ba-form.compact{grid-template-columns:minmax(0,1fr)}
.ba-form label{display:grid;gap:6px}
.ba-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
.ba-form .wide{grid-column:1/-1}
.ba-sheet-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.ba-sheet-actions button{min-height:38px;border:0;border-radius:999px;padding:0 14px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}
.ba-sheet-actions button.primary{background:var(--ba-primary);color:#fff}
.ba-menu-list{display:grid;gap:8px}
.ba-menu-list button{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"icon title" "icon text";gap:2px 10px;align-items:center;text-align:left;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:11px;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);cursor:pointer}
.ba-menu-list button span{grid-area:icon;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}
.ba-menu-list button b{grid-area:title;font-size:13px;font-weight:1000}
.ba-menu-list button small{grid-area:text;color:var(--muted,#64748b);font-size:11px;font-weight:750}
.ba-menu-list button.active{border-color:color-mix(in srgb,var(--ba-primary) 32%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ba-primary) 7%,var(--card-bg,#fff))}
.ba-menu-list button.danger span{background:rgba(239,68,68,.10);color:#dc2626}

.student-detail-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:10px}
.student-detail-strip span{display:grid;gap:3px;padding:9px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--muted,#64748b);font-size:11px;font-weight:800}
.student-detail-strip b{color:var(--text,#111827);font-size:11px;font-weight:1000}
.ba-note{margin-top:12px;padding:12px;border-radius:18px;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary);font-size:12px;line-height:1.5}
.ba-modal{width:min(860px,100%);max-height:min(92dvh,900px);overflow-y:auto;padding:14px;border-radius:28px;box-shadow:0 30px 90px rgba(15,23,42,.35)}
.ba-form-section{display:grid;gap:10px;margin-top:4px}
.ba-form-section h3{margin:0;color:var(--text,#111827);font-size:13px;font-weight:1000}
.ba-modal-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,#fff) 70%,transparent)}
.ba-modal-actions button:first-child{background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827)}
.ba-modal-actions button:disabled{opacity:.55;cursor:not-allowed}

@media(min-width:680px){.ba-page{padding:12px}.item-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-sheet-backdrop,.ba-modal-backdrop{place-items:center;padding:18px}.ba-modal{padding:18px}}
@media(min-width:1040px){.ba-page{padding:16px}.item-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ba-form{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:1320px){.item-list{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:520px){.ba-page{padding:6px}.ba-search-card{gap:6px;padding:7px;border-radius:22px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:39px;height:39px}.student-row{border-radius:20px;padding:9px}.item-icon{width:38px;height:38px}.student-detail-strip{grid-template-columns:minmax(0,1fr)}.ba-modal,.ba-sheet,.ba-empty,.ba-analysis,.ba-current-card{border-radius:20px;padding:11px}.ba-sheet-actions,.ba-modal-actions{display:grid;grid-template-columns:1fr}.ba-sheet-actions button,.ba-modal-actions button{width:100%}}


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
