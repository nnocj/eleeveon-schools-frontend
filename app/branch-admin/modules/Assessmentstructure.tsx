"use client";

/**
 * app/branch-admin/modules/Assessmentsetup.tsx
 * Eleeveon Assessment Setup V2.
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
 * - create assessmentStructures
 * - create assessmentStructureItems under each structure
 * - check total weight and item readiness
 * - do NOT decide where assessments apply; use Assessmentapplicability.tsx for classSubject activation
 *
 * Golden close/action fix:
 * - card/sheet/modal close buttons now reuse the same theme-safe pattern as the More modal
 * - assessment item rows inside the structure action sheet now use golden card styling
 * - the inline edit pencil inside Class Test / Project / Exams rows now uses golden action styling
 * - no input, modal layout, CRUD, sync or data behavior was changed
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useSettings } from "../../context/settings-context";
import {
  db,
  type AcademicStructure,
  type AssessmentEntry,
  type AssessmentStructure,
  type AssessmentStructureItem,
  type Organization,
} from "../../lib/db/db";

import { createLocal, updateLocal, softDeleteLocal, listActiveLocal } from "../../lib/sync/syncUtils";

import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
import {
  softDeleteOwnerFieldAssets,
  MediaOwners,
  commitMediaAssetsToOwner,
  createMediaSessionKey,
  saveImageAsset,



} from "../../lib/media/mediaAssetUtils";
import { useEntityMediaUrls } from "../../hooks/useEntityMediaUrls";

type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type StatusFilter = "all" | "active" | "inactive";
type ModalMode = "structure" | "item";

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type StructureForm = {
  id?: number;
  organizationId: string;
  academicStructureId: string;
  name: string;
  description: string;
  photo: string;
  photoMediaId?: number;
  bannerImage: string;
  bannerImageMediaId?: number;
  totalScore: string;
  active: boolean;
  locked: boolean;
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

type AssessmentStructureView = {
  id: number;
  row: AssessmentStructure;
  academicStructureName: string;
  organizationName: string;
  itemCount: number;
  activeItemCount: number;
  weight: number;
  totalScore: number;
  entryCount: number;
  active: boolean;
  locked: boolean;
  ready: boolean;
  items: AssessmentStructureItem[];
};

const ASSESSMENT_STRUCTURE_MEDIA_OWNER_TABLE = MediaOwners.ASSESSMENT_STRUCTURES;

const emptyStructureForm = (): StructureForm => ({
  organizationId: "",
  academicStructureId: "",
  name: "",
  description: "",
  photo: "",
  photoMediaId: undefined,
  bannerImage: "",
  bannerImageMediaId: undefined,
  totalScore: "100",
  active: true,
  locked: false,
});

const emptyItemForm = (): ItemForm => ({
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
    return new Intl.DateTimeFormat("en-GH", { month: "short", day: "2-digit", year: "numeric" }).format(
      new Date(time)
    );
  } catch {
    return String(value);
  }
};

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

export default function Assessmentstructure() {
  const dataRevision = useBranchTableRevision(["assessmentStructures", "assessmentStructureItems", "academicStructures", "organizations", "mediaAssets", "mediaBlobs"]);
  const mediaSessionKeyRef = useRef(createMediaSessionKey(ASSESSMENT_STRUCTURE_MEDIA_OWNER_TABLE));
  const router = useRouter();
  const { settings, loading: settingsLoading } = useSettings();
  const workspace = useBranchWorkspaceScope();
  const {
    accountId,
    schoolId,
    branchId,
    membership: activeMembership,
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [structureFilter, setStructureFilter] = useState("all");

  const [structures, setStructures] = useState<AssessmentStructure[]>([]);
  const mediaById = useEntityMediaUrls({
    accountId,
    ownerTable: ASSESSMENT_STRUCTURE_MEDIA_OWNER_TABLE,
    rows: structures,
    fields: [
      { fieldKey: "photo", mediaIdKey: "photoMediaId" },
      { fieldKey: "bannerImage", mediaIdKey: "bannerImageMediaId" },
    ],
  });
  const [items, setItems] = useState<AssessmentStructureItem[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AssessmentStructureView | null>(null);

  const [modalMode, setModalMode] = useState<ModalMode>("structure");
  const [modalOpen, setModalOpen] = useState(false);
  const [structureForm, setStructureForm] = useState<StructureForm>(emptyStructureForm());
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm());
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
    setItems([]);
    setAcademicStructures([]);
    setOrganizations([]);
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

      const [structureRows, itemRows, academicStructureRows, organizationRows, entryRows] = await Promise.all([
        tableSafe("assessmentStructures")?.toArray?.() || [],
        tableSafe("assessmentStructureItems")?.toArray?.() || [],
        listActiveLocal("academicStructures", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        listActiveLocal("organizations", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        tableSafe("assessmentEntries")?.toArray?.() || [],
      ]);

      setStructures(
        (structureRows as AssessmentStructure[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
      );

      setItems(
        (itemRows as AssessmentStructureItem[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0))
      );

      setAcademicStructures(
        (academicStructureRows as AcademicStructure[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        )
      );

      setOrganizations(
        (organizationRows as Organization[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        )
      );

      setEntries((entryRows as AssessmentEntry[]).filter((row) => sameTenant(row as TenantRow)));
    } catch (error) {
      console.error("Failed to load assessment setup:", error);
      clearData();
      showToast("error", "Failed to load assessment setup.");
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

  const academicStructureMap = useMemo(
    () => new Map(academicStructures.map((row: any) => [idOf(row.id), row])),
    [academicStructures]
  );

  const organizationMap = useMemo(
    () => new Map(organizations.map((row: any) => [idOf(row.id), row])),
    [organizations]
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

  const entryCountByStructure = useMemo(() => {
    const map = new Map<number, number>();
    entries.forEach((entry: any) => {
      const id = idOf(entry.assessmentStructureId);
      if (!id) return;
      map.set(id, (map.get(id) || 0) + 1);
    });
    return map;
  }, [entries]);

  const weightByStructure = useMemo(() => {
    const map = new Map<number, number>();
    items.forEach((item: any) => {
      if (!isActiveRow(item)) return;
      const id = idOf(item.assessmentStructureId);
      if (!id) return;
      map.set(id, (map.get(id) || 0) + Number(item.weight || 0));
    });
    return map;
  }, [items]);

  const viewRows = useMemo<AssessmentStructureView[]>(() => {
    return structures.map((row: any) => {
      const id = idOf(row.id);
      const structureItems = itemsByStructure.get(id) || [];
      const activeItems = structureItems.filter(isActiveRow);
      const academicStructure = academicStructureMap.get(idOf(row.academicStructureId)) as any;
      const organization = organizationMap.get(idOf(row.organizationId)) as any;
      const weight = weightByStructure.get(id) || 0;

      return {
        id,
        row,
        academicStructureName: academicStructure?.name || "No academic structure",
        organizationName: organization?.name || "No organization",
        itemCount: structureItems.length,
        activeItemCount: activeItems.length,
        weight,
        totalScore: Number(row.totalScore || 100),
        entryCount: entryCountByStructure.get(id) || 0,
        active: isActiveRow(row),
        locked: !!row.locked,
        ready: weight === 100,
        items: structureItems,
      };
    });
  }, [academicStructureMap, entryCountByStructure, itemsByStructure, organizationMap, structures, weightByStructure]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return viewRows.filter((item) => {
      const row: any = item.row;
      const haystack = `${row.name || ""} ${row.description || ""} ${item.academicStructureName} ${item.organizationName}`
        .toLowerCase();

      const searchOk = !term || haystack.includes(term);
      const statusOk =
        statusFilter === "all" ||
        (statusFilter === "active" ? item.active : !item.active);
      const structureOk = structureFilter === "all" || sameId(row.academicStructureId, structureFilter);

      return searchOk && statusOk && structureOk;
    });
  }, [search, statusFilter, structureFilter, viewRows]);

  const completeStructures = viewRows.filter((row) => row.ready).length;
  const incompleteStructures = viewRows.length - completeStructures;
  const activeFilterCount = useMemo(
    () => [structureFilter, statusFilter].filter((value) => value !== "all").length,
    [structureFilter, statusFilter]
  );

  const countsByAcademicStructure = useMemo(
    () => groupedCounts(viewRows, (row) => row.academicStructureName),
    [viewRows]
  );

  const countsByStatus = useMemo(
    () => groupedCounts(viewRows, (row) => (row.active ? "Active" : "Inactive")),
    [viewRows]
  );

  const countsByReadiness = useMemo(
    () => groupedCounts(viewRows, (row) => (row.ready ? "Ready" : "Needs weights")),
    [viewRows]
  );

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const clearFilters = () => {
    setStructureFilter("all");
    setStatusFilter("all");
  };

  const openCreateStructure = () => {
    mediaSessionKeyRef.current = createMediaSessionKey(ASSESSMENT_STRUCTURE_MEDIA_OWNER_TABLE);
    if (!requireTenant()) return;

    setSelectedItem(null);
    setModalMode("structure");
    setStructureForm({
      ...emptyStructureForm(),
      academicStructureId: structureFilter !== "all" ? structureFilter : "",
    });
    setModalOpen(true);
  };

  const openEditStructure = (row: AssessmentStructure) => {
    const structure: any = row;

    setSelectedItem(null);
    setModalMode("structure");
    setStructureForm({
      id: idOf(structure.id),
      organizationId: structure.organizationId ? String(structure.organizationId) : "",
      academicStructureId: structure.academicStructureId ? String(structure.academicStructureId) : "",
      name: structure.name || "",
      description: structure.description || "",
      photo: mediaById[idOf(structure.id)]?.photo || structure.photo || "",
      photoMediaId: structure.photoMediaId ? Number(structure.photoMediaId) : undefined,
      bannerImage: mediaById[idOf(structure.id)]?.bannerImage || structure.bannerImage || "",
      bannerImageMediaId: structure.bannerImageMediaId ? Number(structure.bannerImageMediaId) : undefined,
      totalScore: String(structure.totalScore || 100),
      active: isActiveRow(structure),
      locked: !!structure.locked,
    });
    setModalOpen(true);
  };

  const openCreateItem = (structureId?: number) => {
    if (!requireTenant()) return;

    const targetStructureId = structureId || (selectedItem ? selectedItem.id : 0);

    setSelectedItem(null);
    setModalMode("item");
    setItemForm({
      ...emptyItemForm(),
      assessmentStructureId: targetStructureId ? String(targetStructureId) : "",
      order: String(nextOrderForStructure(targetStructureId)),
    });
    setModalOpen(true);
  };

  const openEditItem = (row: AssessmentStructureItem) => {
    const item: any = row;

    setSelectedItem(null);
    setModalMode("item");
    setItemForm({
      id: idOf(item.id),
      assessmentStructureId: item.assessmentStructureId ? String(item.assessmentStructureId) : "",
      name: item.name || "",
      weight: String(item.weight || 0),
      maxScore: String(item.maxScore || 100),
      order: String(item.order || 1),
      compulsory: item.compulsory !== false,
      active: isActiveRow(item),
    });
    setModalOpen(true);
  };

  const nextOrderForStructure = (structureId: number) => {
    const orders = items
      .filter((row: any) => sameId(row.assessmentStructureId, structureId))
      .map((row: any) => Number(row.order || 0));
    return orders.length ? Math.max(...orders) + 1 : 1;
  };

  const validateStructure = () => {
    if (!structureForm.name.trim()) return "Assessment structure name is required.";
    if (!structureForm.academicStructureId) return "Select academic structure.";
    if (Number(structureForm.totalScore || 0) <= 0) return "Total score must be greater than 0.";

    const duplicate = structures.find((row: any) => {
      if (structureForm.id && sameId(row.id, structureForm.id)) return false;
      return (
        !row.isDeleted &&
        sameId(row.academicStructureId, structureForm.academicStructureId) &&
        safeLower(row.name) === safeLower(structureForm.name)
      );
    });

    if (duplicate) return "This assessment structure already exists under the selected academic structure.";
    return "";
  };

  const validateItem = () => {
    if (!itemForm.assessmentStructureId) return "Select assessment structure.";
    if (!itemForm.name.trim()) return "Item name is required.";

    const weight = Number(itemForm.weight || 0);
    const maxScore = Number(itemForm.maxScore || 0);

    if (!Number.isFinite(weight) || weight < 0 || weight > 100) return "Weight must be between 0 and 100.";
    if (!Number.isFinite(maxScore) || maxScore <= 0) return "Max score must be greater than 0.";
    if (Number(itemForm.order || 1) < 1) return "Order must be at least 1.";

    const structureId = idOf(itemForm.assessmentStructureId);
    const otherWeight = items
      .filter((row: any) => sameId(row.assessmentStructureId, structureId))
      .filter((row: any) => !itemForm.id || !sameId(row.id, itemForm.id))
      .filter(isActiveRow)
      .reduce((sum: number, row: any) => sum + Number(row.weight || 0), 0);

    if (otherWeight + weight > 100) {
      return `Total active item weight will become ${otherWeight + weight}%. It cannot exceed 100%.`;
    }

    const duplicate = items.find((row: any) => {
      if (itemForm.id && sameId(row.id, itemForm.id)) return false;
      return (
        !row.isDeleted &&
        sameId(row.assessmentStructureId, itemForm.assessmentStructureId) &&
        safeLower(row.name) === safeLower(itemForm.name)
      );
    });

    if (duplicate) return "This assessment item already exists under the selected structure.";
    return "";
  };

  const saveStructure = async () => {
    const error = validateStructure();
    if (error) {
      showToast("error", error);
      return;
    }

    if (!requireTenant()) return;

    try {
      setSaving(true);

      const existing = structureForm.id
        ? structures.find((row: any) => sameId(row.id, structureForm.id))
        : undefined;

      const payload: Partial<AssessmentStructure> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        organizationId: structureForm.organizationId ? idOf(structureForm.organizationId) : undefined,
        academicStructureId: idOf(structureForm.academicStructureId),
        name: structureForm.name.trim(),
        description: structureForm.description.trim() || undefined,
        photo: safeRecordMediaValue(structureForm.photo),
        photoMediaId: structureForm.photoMediaId || undefined,
        bannerImage: safeRecordMediaValue(structureForm.bannerImage),
        bannerImageMediaId: structureForm.bannerImageMediaId || undefined,
        totalScore: Number(structureForm.totalScore || 100),
        active: structureForm.active,
        locked: structureForm.locked,
        isDeleted: false,
      } as Partial<AssessmentStructure>;

      const savedStructure =
        structureForm.id && existing
          ? await updateLocal("assessmentStructures", Number(structureForm.id), payload)
          : await createLocal("assessmentStructures", payload as AssessmentStructure);

      const savedStructureId = Number((savedStructure as any)?.id || structureForm.id || 0);

      if (savedStructureId) {
        await commitMediaAssetsToOwner({
          accountId: String(accountId),
          ownerTable: ASSESSMENT_STRUCTURE_MEDIA_OWNER_TABLE,
          ownerLocalId: savedStructureId,
          ownerCloudId: (savedStructure as any)?.cloudId || (existing as any)?.cloudId,
          ownerTempKey: mediaSessionKeyRef.current,
          assets: [
            { assetId: structureForm.photoMediaId, fieldKey: "photo" },
            { assetId: structureForm.bannerImageMediaId, fieldKey: "bannerImage" },
          ],
        });
      }

      mediaSessionKeyRef.current = createMediaSessionKey(ASSESSMENT_STRUCTURE_MEDIA_OWNER_TABLE);
      setModalOpen(false);
      showToast("success", "Assessment structure saved.");
      await load();
    } catch (error) {
      console.error("Failed to save assessment structure:", error);
      showToast("error", "Could not save assessment structure.");
    } finally {
      setSaving(false);
    }
  };

  const saveItem = async () => {
    const error = validateItem();
    if (error) {
      showToast("error", error);
      return;
    }

    if (!requireTenant()) return;

    try {
      setSaving(true);

      const existing = itemForm.id ? items.find((row: any) => sameId(row.id, itemForm.id)) : undefined;

      const payload: Partial<AssessmentStructureItem> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        assessmentStructureId: idOf(itemForm.assessmentStructureId),
        name: itemForm.name.trim(),
        weight: Number(itemForm.weight || 0),
        maxScore: Number(itemForm.maxScore || 100),
        order: Number(itemForm.order || 1),
        compulsory: itemForm.compulsory,
        active: itemForm.active,
        isDeleted: false,
      } as Partial<AssessmentStructureItem>;

      if (itemForm.id && existing) {
        await updateLocal("assessmentStructureItems", Number(itemForm.id), payload);
      } else {
        await createLocal("assessmentStructureItems", payload as AssessmentStructureItem);
      }

      setModalOpen(false);
      showToast("success", "Assessment item saved.");
      await load();
    } catch (error) {
      console.error("Failed to save assessment item:", error);
      showToast("error", "Could not save assessment item.");
    } finally {
      setSaving(false);
    }
  };

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (modalMode === "structure") await saveStructure();
    else await saveItem();
  };

  const archiveStructure = async (item: AssessmentStructureView) => {
    const row: any = item.row;
    const entryCount = item.entryCount;

    const confirmed = window.confirm(
      entryCount
        ? `"${row.name}" has ${entryCount} score record(s). Archive anyway?`
        : `Archive "${row.name}"?`
    );

    if (!confirmed) return;


    await Promise.all(


      ["photo", "bannerImage"].map((fieldKey) =>


        softDeleteOwnerFieldAssets({


          accountId: String(accountId),


          ownerTable: "assessmentStructures",


          ownerLocalId: Number(item.id),


          fieldKey,


        }),


      ),


    );


    await softDeleteLocal("assessmentStructures", item.id);
    setSelectedItem(null);
    showToast("success", "Assessment structure archived.");
    await load();
  };

  const archiveItem = async (row: AssessmentStructureItem) => {
    if (!window.confirm(`Archive item "${(row as any).name}"?`)) return;

    await softDeleteLocal("assessmentStructureItems", idOf((row as any).id));
    setSelectedItem(null);
    showToast("success", "Assessment item archived.");
    await load();
  };

  const uploadStructureImage = async (target: "photo" | "bannerImage", file?: File) => {
    if (!file || !accountId || !schoolId || !branchId) return;

    try {
      const result = await saveImageAsset(file, {
        accountId: String(accountId),
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        ownerTable: ASSESSMENT_STRUCTURE_MEDIA_OWNER_TABLE,
        ownerLocalId: structureForm.id || undefined,
        ownerTempKey: structureForm.id ? undefined : mediaSessionKeyRef.current,
        fieldKey: target,
        variant: target === "photo" ? "avatar" : "cover",
        replaceExisting: true,
      });

      setStructureForm((current) => ({
        ...current,
        [target]: result.previewUrl,
        [target === "photo" ? "photoMediaId" : "bannerImageMediaId"]: result.assetId,
      }));

      showToast("info", `${target === "photo" ? "Photo" : "Banner"} prepared. Save to attach and upload it.`);
    } catch (error: any) {
      showToast("error", error?.message || "Failed to process image.");
    }
  };

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return (
      <State
        primary={primary}
        title="Opening Assessment Setup..."
        text="Checking structures, items, weights and score usage."
      />
    );
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing assessment setup." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>Assessment setup belongs to one active school branch.</p>
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

      <section className="ba-search-card" aria-label="Assessment setup search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search assessment setup..."
            aria-label="Search assessment setup"
          />
        </label>

        <button type="button" className="ba-add-inline" onClick={openCreateStructure} aria-label="Add assessment structure">
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

      {!academicStructures.length && (
        <section className="ba-warning">
          Create an academic structure first. Assessment structures must belong to an academic structure such as Primary, JHS, SHS, or a custom academic grouping.
        </section>
      )}

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {structureFilter !== "all" && (
            <button type="button" onClick={() => setStructureFilter("all")}>
              Academic: {(academicStructureMap.get(idOf(structureFilter)) as any)?.name || structureFilter} ×
            </button>
          )}
          {statusFilter !== "all" && (
            <button type="button" onClick={() => setStatusFilter("all")}>
              Status: {statusFilter === "active" ? "Active" : "Inactive"} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard title="By Academic Structure" rows={countsByAcademicStructure} total={viewRows.length} />
          <AnalysisCard title="By Status" rows={countsByStatus} total={viewRows.length} />
          <AnalysisCard title="By Readiness" rows={countsByReadiness} total={viewRows.length} />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{filteredRows.length}</strong>
            <p>
              {completeStructures} complete · {incompleteStructures} incomplete · {items.length} item(s) · {entries.length} score record(s).
            </p>
          </article>
        </section>
      )}

      {viewMode === "table" && (
        <TableView
          rows={filteredRows}
          openEditStructure={openEditStructure}
          openCreateItem={openCreateItem}
          archiveStructure={archiveStructure}
        />
      )}

      {viewMode === "cards" && (
        <section className="ba-list assessment-list">
          {filteredRows.map((item) => (
            <AssessmentListItem key={String(item.id)} item={item} photo={mediaById[item.id]?.photo || safeRecordMediaValue((item.row as any).photo)} onOpen={() => setSelectedItem(item)} />
          ))}

          {!filteredRows.length && (
            <Empty
              icon="🎯"
              title="No assessment structures"
              text="Create structures such as Class Score + Exam, or Project + Practical + Exam."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          academicStructures={academicStructures}
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
          onCreateItem={() => {
            setMoreOpen(false);
            openCreateItem();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {selectedItem && (
        <ActionSheet
          item={selectedItem}
          openEditStructure={openEditStructure}
          openCreateItem={openCreateItem}
          openEditItem={openEditItem}
          archiveItem={archiveItem}
          archiveStructure={archiveStructure}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {modalOpen && (
        <AssessmentModal
          modalMode={modalMode}
          saving={saving}
          structureForm={structureForm}
          itemForm={itemForm}
          academicStructures={academicStructures}
          organizations={organizations}
          structures={structures}
          setStructureForm={setStructureForm}
          setItemForm={setItemForm}
          uploadStructureImage={uploadStructureImage}
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

function AssessmentListItem({ item, photo, onOpen }: { item: AssessmentStructureView; photo?: string; onOpen: () => void }) {
  const row: any = item.row;

  return (
    <button type="button" className="student-row assessment-row" onClick={onOpen}>
      <span
        className="assessment-icon"
        style={{
          backgroundImage: photo ? `url(${photo})` : undefined,
        }}
      >
        {!photo ? "🎯" : ""}
      </span>

      <span className="student-main">
        <strong>{row.name || "Unnamed assessment structure"}</strong>
        <small>
          {item.academicStructureName}
          {item.organizationName !== "No organization" ? ` · ${item.organizationName}` : ""}
        </small>
        <em>
          {item.activeItemCount} active item(s) · {item.weight}% weight · {item.entryCount} entries
        </em>
      </span>

      <span className="student-side">
        <span
          className={`status-dot-mini ${item.ready ? "green" : item.weight > 100 ? "red" : "orange"}`}
          title={item.ready ? "Ready" : "Needs weights"}
          aria-label={item.ready ? "Ready" : "Needs weights"}
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
  academicStructures,
  structureFilter,
  statusFilter,
  setStructureFilter,
  setStatusFilter,
  clearFilters,
  onClose,
}: {
  academicStructures: AcademicStructure[];
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
            <p>Filter assessment structures by academic structure and status.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Academic Structure</span>
            <select value={structureFilter} onChange={(event) => setStructureFilter(event.target.value)}>
              <option value="all">All academic structures</option>
              {academicStructures.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
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
  onCreateItem,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onRefresh: () => void | Promise<void>;
  onCreateItem: () => void;
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
            <small>Compact assessment setup cards</small>
          </button>

          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            <span>☷</span>
            <b>Table view</b>
            <small>Dense records for laptop work</small>
          </button>

          <button type="button" className={viewMode === "summary" ? "active" : ""} onClick={() => setViewMode("summary")}>
            <span>◔</span>
            <b>Analytics</b>
            <small>Structure, status and readiness summaries</small>
          </button>

          <button type="button" onClick={onCreateItem}>
            <span>＋</span>
            <b>Add assessment item</b>
            <small>Create an item under an existing structure</small>
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
  openEditStructure,
  openCreateItem,
  openEditItem,
  archiveItem,
  archiveStructure,
  onClose,
}: {
  item: AssessmentStructureView;
  openEditStructure: (row: AssessmentStructure) => void;
  openCreateItem: (structureId?: number) => void;
  openEditItem: (row: AssessmentStructureItem) => void;
  archiveItem: (row: AssessmentStructureItem) => void | Promise<void>;
  archiveStructure: (item: AssessmentStructureView) => void | Promise<void>;
  onClose: () => void;
}) {
  const row: any = item.row;

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-profile">
          <div>
            <h2>{row.name || "Assessment structure"}</h2>
            <p>
              {item.academicStructureName} · {item.ready ? "Ready" : "Needs weights"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close assessment actions">
            ✕
          </button>
        </div>

        <div className="student-detail-strip">
          <span>
            <b>Weight</b>
            {item.weight}%
          </span>
          <span>
            <b>Items</b>
            {item.itemCount}
          </span>
          <span>
            <b>Entries</b>
            {item.entryCount}
          </span>
        </div>

        {!!item.items.length && (
          <div className="assessment-items-list">
            {item.items.map((structureItem: any) => (
              <button key={String(structureItem.id)} type="button" onClick={() => openEditItem(structureItem)}>
                <span>
                  <b>{structureItem.name}</b>
                  <small>
                    {structureItem.weight}% · max {structureItem.maxScore} · order {structureItem.order || 1}
                  </small>
                </span>
                <i>✎</i>
              </button>
            ))}
          </div>
        )}

        <div className="ba-menu-list">
          <button type="button" onClick={() => openEditStructure(item.row)}>
            <span>✎</span>
            <b>Edit structure</b>
            <small>Update name, academic structure, score, lock and photos</small>
          </button>

          <button type="button" onClick={() => openCreateItem(item.id)}>
            <span>＋</span>
            <b>Add item</b>
            <small>Add class score, exam, project, practical or another component</small>
          </button>

          {item.items.map((structureItem: any) => (
            <button key={`archive-${structureItem.id}`} type="button" className="danger" onClick={() => archiveItem(structureItem)}>
              <span>⌫</span>
              <b>Archive {structureItem.name}</b>
              <small>Soft delete this item locally</small>
            </button>
          ))}

          <button type="button" className="danger" onClick={() => archiveStructure(item)}>
            <span>⌫</span>
            <b>Archive structure</b>
            <small>Soft delete this assessment structure locally</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function TableView({
  rows,
  openEditStructure,
  openCreateItem,
  archiveStructure,
}: {
  rows: AssessmentStructureView[];
  openEditStructure: (row: AssessmentStructure) => void;
  openCreateItem: (structureId?: number) => void;
  archiveStructure: (item: AssessmentStructureView) => void | Promise<void>;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Assessment Structures ({rows.length})</th>
              <th>Academic Level</th>
              <th>Organization</th>
              <th>Items</th>
              <th>Weight</th>
              <th>Total Score</th>
              <th>Entries</th>
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
                    <strong>{row.name}</strong>
                    <span>{row.description || "No description"}</span>
                  </td>
                  <td>{item.academicStructureName}</td>
                  <td>{item.organizationName}</td>
                  <td>{item.itemCount}</td>
                  <td>
                    <Chip tone={weightTone(item.weight)}>{item.weight}%</Chip>
                  </td>
                  <td>{item.totalScore}</td>
                  <td>{item.entryCount}</td>
                  <td>
                    <div className="ba-chip-row">
                      <Chip tone={item.active ? "green" : "gray"}>{item.active ? "Active" : "Inactive"}</Chip>
                      {item.locked && <Chip tone="purple">Locked</Chip>}
                    </div>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEditStructure(item.row)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => openCreateItem(item.id)}>
                        Add Item
                      </button>
                      <button type="button" className="ba-delete" onClick={() => archiveStructure(item)}>
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!rows.length && <div className="ba-empty-table">No assessment structure matches your filters.</div>}
      </div>
    </section>
  );
}

function AssessmentModal({
  modalMode,
  saving,
  structureForm,
  itemForm,
  academicStructures,
  organizations,
  structures,
  setStructureForm,
  setItemForm,
  uploadStructureImage,
  setModalOpen,
  save,
}: {
  modalMode: ModalMode;
  saving: boolean;
  structureForm: StructureForm;
  itemForm: ItemForm;
  academicStructures: AcademicStructure[];
  organizations: Organization[];
  structures: AssessmentStructure[];
  setStructureForm: React.Dispatch<React.SetStateAction<StructureForm>>;
  setItemForm: React.Dispatch<React.SetStateAction<ItemForm>>;
  uploadStructureImage: (target: "photo" | "bannerImage", file?: File) => void | Promise<void>;
  setModalOpen: (open: boolean) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>
              {modalMode === "structure"
                ? structureForm.id
                  ? "Edit Assessment Structure"
                  : "New Assessment Structure"
                : itemForm.id
                  ? "Edit Assessment Item"
                  : "New Assessment Item"}
            </h2>
            <p>
              {modalMode === "structure"
                ? "Define the overall assessment model."
                : "Define a weighted component under a structure."}
            </p>
          </div>
          <button type="button" onClick={() => setModalOpen(false)} aria-label="Close assessment form">
            ✕
          </button>
        </div>

        {modalMode === "structure" ? (
          <>
            <section className="ba-form-section">
              <h3>Structure</h3>
              <div className="ba-form">
                <label>
                  <span>Name</span>
                  <input
                    value={structureForm.name}
                    onChange={(event) => setStructureForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Class Score + Exam"
                  />
                </label>

                <label>
                  <span>Academic Structure</span>
                  <select
                    value={structureForm.academicStructureId}
                    onChange={(event) =>
                      setStructureForm((current) => ({ ...current, academicStructureId: event.target.value }))
                    }
                  >
                    <option value="">Select academic structure</option>
                    {academicStructures.map((row: any) => (
                      <option key={String(row.id)} value={String(row.id)}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Organization</span>
                  <select
                    value={structureForm.organizationId}
                    onChange={(event) => setStructureForm((current) => ({ ...current, organizationId: event.target.value }))}
                  >
                    <option value="">No organization</option>
                    {organizations.map((row: any) => (
                      <option key={String(row.id)} value={String(row.id)}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Total Score</span>
                  <input
                    type="number"
                    min={1}
                    value={structureForm.totalScore}
                    onChange={(event) => setStructureForm((current) => ({ ...current, totalScore: event.target.value }))}
                  />
                </label>

                <label>
                  <span>Status</span>
                  <select
                    value={structureForm.active ? "active" : "inactive"}
                    onChange={(event) =>
                      setStructureForm((current) => ({ ...current, active: event.target.value === "active" }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>

                <label>
                  <span>Lock</span>
                  <select
                    value={structureForm.locked ? "locked" : "open"}
                    onChange={(event) =>
                      setStructureForm((current) => ({ ...current, locked: event.target.value === "locked" }))
                    }
                  >
                    <option value="open">Open</option>
                    <option value="locked">Locked</option>
                  </select>
                </label>

                <label className="wide">
                  <span>Description</span>
                  <textarea
                    value={structureForm.description}
                    onChange={(event) => setStructureForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Describe this assessment model."
                  />
                </label>
              </div>
            </section>

            <section className="ba-form-section">
              <h3>Media</h3>
              <div className="ba-form two">
                <label>
                  <span>Photo</span>
                  <label className="ba-media-button compact">
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => uploadStructureImage("photo", event.target.files?.[0])}
                      hidden
                    />
                  </label>
                  {structureForm.photo && <img src={structureForm.photo} alt="Assessment structure preview" className="ba-preview-photo" />}
                </label>

                <label>
                  <span>Banner</span>
                  <label className="ba-media-button compact">
                    Upload Banner
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => uploadStructureImage("bannerImage", event.target.files?.[0])}
                      hidden
                    />
                  </label>
                  {structureForm.bannerImage && (
                    <img src={structureForm.bannerImage} alt="Assessment structure banner preview" className="ba-preview-banner" />
                  )}
                </label>
              </div>
            </section>
          </>
        ) : (
          <section className="ba-form-section">
            <h3>Assessment Item</h3>
            <div className="ba-form">
              <label>
                <span>Assessment Structure</span>
                <select
                  value={itemForm.assessmentStructureId}
                  onChange={(event) => setItemForm((current) => ({ ...current, assessmentStructureId: event.target.value }))}
                >
                  <option value="">Select structure</option>
                  {structures.map((row: any) => (
                    <option key={String(row.id)} value={String(row.id)}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Item Name</span>
                <input
                  value={itemForm.name}
                  onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Classwork, Homework, Exam..."
                />
              </label>

              <label>
                <span>Weight %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={itemForm.weight}
                  onChange={(event) => setItemForm((current) => ({ ...current, weight: event.target.value }))}
                />
              </label>

              <label>
                <span>Max Score</span>
                <input
                  type="number"
                  min={1}
                  value={itemForm.maxScore}
                  onChange={(event) => setItemForm((current) => ({ ...current, maxScore: event.target.value }))}
                />
              </label>

              <label>
                <span>Order</span>
                <input
                  type="number"
                  min={1}
                  value={itemForm.order}
                  onChange={(event) => setItemForm((current) => ({ ...current, order: event.target.value }))}
                />
              </label>

              <label>
                <span>Compulsory</span>
                <select
                  value={itemForm.compulsory ? "yes" : "no"}
                  onChange={(event) => setItemForm((current) => ({ ...current, compulsory: event.target.value === "yes" }))}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>

              <label>
                <span>Status</span>
                <select
                  value={itemForm.active ? "active" : "inactive"}
                  onChange={(event) => setItemForm((current) => ({ ...current, active: event.target.value === "active" }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
          </section>
        )}

        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : modalMode === "structure" ? "Save Structure" : "Save Item"}
          </button>
        </div>
      </form>
    </div>
  );
}

function groupedCounts(rows: AssessmentStructureView[], keyFn: (item: AssessmentStructureView) => string) {
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
.ba-page textarea{min-height:94px;padding-top:10px;resize:vertical}
.ba-page input:focus,.ba-page select:focus,.ba-page textarea:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}

.ba-state,.ba-search-card,.ba-card,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet,.ba-modal,.student-row,.ba-warning,.ba-note{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}
.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}
.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}
.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}
.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer}

.ba-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}
.ba-toast.success{background:rgba(34,197,94,.14);color:#166534}
.ba-toast.error{background:rgba(239,68,68,.12);color:#991b1b}
.ba-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}
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

.ba-list{display:grid;gap:7px;margin-top:10px}
.assessment-list{grid-template-columns:minmax(0,1fr)}
.student-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}
.student-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 28%,var(--border,rgba(0,0,0,.10)));box-shadow:0 16px 32px rgba(15,23,42,.075)}
.assessment-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);background-size:cover;background-position:center;font-size:18px;color:var(--ba-primary)}
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
.ba-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere;color:var(--text,#111827)}
.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}
.ba-analysis-list{display:grid;gap:10px;margin-top:12px}
.ba-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}
.ba-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}
.ba-analysis-list b,.ba-analysis-list small{font-size:12px}
.ba-analysis-list small{color:var(--muted,#64748b);font-weight:850}
.ba-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}
.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}

.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed;border-radius:22px;padding:13px}
.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,transparent);font-size:28px}
.ba-empty h3{margin:0;font-size:18px;font-weight:1000;color:var(--text,#111827)}
.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}

.ba-sheet-backdrop,.ba-modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.58);backdrop-filter:blur(12px)}
.ba-sheet{width:min(620px,100%);max-height:min(88dvh,760px);overflow-y:auto;border-radius:28px;padding:14px;box-shadow:0 30px 90px rgba(15,23,42,.32)}
.ba-sheet.small{width:min(460px,100%)}
.ba-sheet-head,.ba-sheet-profile,.ba-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:4px 2px 14px}
.ba-sheet-head h2,.ba-sheet-profile h2,.ba-modal-head h2{margin:0;font-size:20px;font-weight:1000;letter-spacing:-.05em;color:var(--text,#111827)}
.ba-sheet-head p,.ba-sheet-profile p,.ba-modal-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}
.ba-sheet-head button,.ba-sheet-profile button,.ba-modal-head button{width:38px;height:38px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827);font-weight:1000;cursor:pointer}
.ba-form{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.ba-form.two{grid-template-columns:minmax(0,1fr)}
.ba-form.compact{grid-template-columns:minmax(0,1fr)}
.ba-form label{display:grid;gap:6px}
.ba-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}

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
.assessment-items-list{display:grid;gap:8px;margin-bottom:10px}
.assessment-items-list button{
  width:100%;
  display:grid;
  grid-template-columns:minmax(0,1fr) 34px;
  align-items:center;
  gap:10px;
  border:1px solid color-mix(in srgb,var(--ba-primary) 18%,var(--border,rgba(0,0,0,.10)));
  border-radius:18px;
  padding:10px;
  background:
    linear-gradient(180deg,
      color-mix(in srgb,var(--ba-primary) 6%,var(--card-bg,var(--surface,#fff))),
      var(--card-bg,var(--surface,#fff))
    );
  color:var(--text,#111827);
  text-align:left;
  cursor:pointer;
  box-shadow:0 10px 22px rgba(15,23,42,.045);
  transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease),background .16s var(--ease);
}
.assessment-items-list button:hover{
  transform:translateY(-1px);
  border-color:color-mix(in srgb,var(--ba-primary) 36%,var(--border,rgba(0,0,0,.10)));
  background:color-mix(in srgb,var(--ba-primary) 9%,var(--card-bg,var(--surface,#fff)));
  box-shadow:0 14px 30px rgba(15,23,42,.075);
}
.assessment-items-list span{min-width:0}
.assessment-items-list b,.assessment-items-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.assessment-items-list b{color:var(--text,#111827);font-size:12px;font-weight:1000}
.assessment-items-list small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}
.assessment-items-list i{
  width:34px;
  height:34px;
  min-width:34px;
  display:grid;
  place-items:center;
  border-radius:999px;
  border:1px solid color-mix(in srgb,var(--ba-primary) 24%,var(--border,rgba(0,0,0,.12)));
  background:color-mix(in srgb,var(--ba-primary) 10%,var(--card-bg,var(--surface,#fff)));
  color:var(--ba-primary);
  font-style:normal;
  font-weight:1000;
  box-shadow:0 8px 18px rgba(15,23,42,.06);
}
.assessment-items-list button:hover i{
  color:#ffffff;
  background:var(--ba-primary);
  border-color:var(--ba-primary);
}

.ba-modal{width:min(980px,100%);max-height:min(92dvh,900px);overflow-y:auto;padding:14px;border-radius:28px;box-shadow:0 30px 90px rgba(15,23,42,.35)}
.ba-form-section{display:grid;gap:10px;margin-top:4px}
.ba-form-section h3{margin:0;font-size:13px;font-weight:1000;color:var(--text,#111827)}
.ba-media-button{min-height:34px;width:max-content;max-width:100%;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:0 12px;background:var(--ba-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}
.ba-media-button.compact{min-height:32px;padding:0 11px}
.ba-preview-photo{width:82px;height:82px;object-fit:cover;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.10))}
.ba-preview-banner{width:100%;height:110px;object-fit:cover;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.10))}
.ba-modal-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,#fff) 70%,transparent)}
.ba-modal-actions button:first-child{background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--card-bg,#fff));color:var(--text,#111827)}
.ba-modal-actions button:disabled{opacity:.55;cursor:not-allowed}

@media(min-width:680px){
  .ba-page{padding:12px}
  .assessment-list{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ba-form{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ba-form.two{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ba-form .wide{grid-column:1/-1}
  .ba-sheet-backdrop,.ba-modal-backdrop{place-items:center;padding:18px}
  .ba-modal{padding:18px}
}
@media(min-width:1040px){
  .ba-page{padding:16px}
  .assessment-list{grid-template-columns:repeat(3,minmax(0,1fr))}
  .ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .ba-form{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(min-width:1320px){
  .assessment-list{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@media(max-width:520px){
  .ba-page{padding:6px}
  .ba-search-card{gap:6px;padding:7px;border-radius:22px}
  .ba-icon-button,.ba-filter-button,.ba-add-inline{width:39px;height:39px}
  .student-row{border-radius:20px;padding:9px}
  .assessment-icon{width:38px;height:38px}
  .student-detail-strip{grid-template-columns:minmax(0,1fr)}
  .ba-modal,.ba-sheet,.ba-empty,.ba-analysis{border-radius:20px;padding:11px}
  .ba-sheet-actions,.ba-modal-actions{display:grid;grid-template-columns:1fr}
  .ba-sheet-actions button,.ba-modal-actions button{width:100%}
}


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



`;const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "").trim();
  if (!media || media.startsWith("blob:") || media.startsWith("data:")) return undefined;
  return media;
};


