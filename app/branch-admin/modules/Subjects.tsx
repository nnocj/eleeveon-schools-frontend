"use client";

/**
 * app/branch-admin/modules/Subjects.tsx
 * Eleeveon Subjects V2.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this branch-admin academic setup page from accidentally using stale
 *   school/branch context left behind by another role or portal
 * - all reads and writes now use the resolved workspace schoolId and branchId
 *
 * Upgraded to match the Students.tsx golden standard:
 * - no duplicate module hero/header block
 * - compact search + inline add + slider filter + more menu
 * - filters and advanced views moved into sheets
 * - compact cards, table and analytics follow the same ba-* pattern
 * - createLocal/updateLocal/softDeleteLocal/listActiveLocal used where needed
 * - delete is a local soft delete, not a hard delete
 * - active/inactive status is preserved without removing the subject from history
 * - table colors use theme variables for dark mode support
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useSettings } from "../../context/settings-context";
import { db, type ClassSubject, type CurriculumSubject, type Organization, type Subject } from "../../lib/db/db";
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
type SubjectCategory = "academic" | "technical" | "vocational" | "elective" | "core";
type SubjectStatusFilter = "all" | "active" | "inactive";

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type FormState = {
  id?: number;
  organizationId: string;
  name: string;
  code: string;
  description: string;
  photo: string;
  photoMediaId?: number;
  bannerImage: string;
  bannerImageMediaId?: number;
  credits: string;
  category: SubjectCategory;
  active: boolean;
};

type SubjectView = {
  id: number;
  row: Subject;
  organizationName: string;
  curriculumUseCount: number;
  classSubjectUseCount: number;
  totalUsage: number;
  active: boolean;
};

const SUBJECT_MEDIA_OWNER_TABLE = MediaOwners.SUBJECTS;

const categories: SubjectCategory[] = ["academic", "core", "elective", "technical", "vocational"];

const emptyForm: FormState = {
  organizationId: "",
  name: "",
  code: "",
  description: "",
  photo: "",
  photoMediaId: undefined,
  bannerImage: "",
  bannerImageMediaId: undefined,
  credits: "",
  category: "academic",
  active: true,
};

const safeRecordMediaValue = (value?: string) => {
  const media = String(value || "").trim();
  if (!media || media.startsWith("blob:") || media.startsWith("data:")) return undefined;
  return media;
};

const idOf = (v: any) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
const safeLower = (v: any) => String(v || "").toLowerCase().trim();
const tableSafe = (name: string) => (db as any)[name];

const isActiveRow = (row: any) => {
  const status = safeLower(row?.status);
  if (row?.isDeleted) return false;
  if (row?.active === false) return false;
  if (["inactive", "deleted", "archived", "suspended"].includes(status)) return false;
  return true;
};

const categoryLabel = (category?: string) => {
  if (!category) return "Academic";
  return category.charAt(0).toUpperCase() + category.slice(1);
};

function categoryTone(category?: SubjectCategory): "green" | "blue" | "gray" | "orange" | "purple" {
  if (category === "core") return "green";
  if (category === "elective") return "orange";
  if (category === "technical") return "purple";
  if (category === "vocational") return "blue";
  return "gray";
}

const timeText = (v?: string | number | null) => {
  if (!v) return "Not set";
  const t = typeof v === "number" ? v : new Date(v).getTime();
  if (!Number.isFinite(t)) return "Not set";
  try {
    return new Intl.DateTimeFormat("en-GH", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(t));
  } catch {
    return "Not set";
  }
};

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function StatusDot({ active }: { active: boolean }) {
  return <span className={`status-dot-mini ${active ? "green" : "gray"}`} title={active ? "Active" : "Inactive"} aria-label={active ? "Active" : "Inactive"} />;
}

function Avatar({ name, photo, primary }: { name: string; photo?: string; primary: string }) {
  return (
    <div className="ba-avatar" style={{ background: photo ? `url(${photo}) center/cover` : `linear-gradient(135deg, ${primary}, rgba(15,23,42,.9))` }}>
      {!photo && String(name || "SB").slice(0, 2).toUpperCase()}
    </div>
  );
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

export default function Subjects() {
  const dataRevision = useBranchTableRevision(["subjects", "organizations", "curriculumSubjects", "classSubjects", "mediaAssets", "mediaBlobs"]);
  const mediaSessionKeyRef = useRef(createMediaSessionKey(SUBJECT_MEDIA_OWNER_TABLE));
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
  const [rows, setRows] = useState<Subject[]>([]);
  const mediaById = useEntityMediaUrls({
    accountId,
    ownerTable: SUBJECT_MEDIA_OWNER_TABLE,
    rows,
    fields: [
      { fieldKey: "photo", mediaIdKey: "photoMediaId" },
      { fieldKey: "bannerImage", mediaIdKey: "bannerImageMediaId" },
    ],
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filterOrganizationId, setFilterOrganizationId] = useState("all");
  const [filterCategory, setFilterCategory] = useState<"all" | SubjectCategory>("all");
  const [filterStatus, setFilterStatus] = useState<SubjectStatusFilter>("active");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SubjectView | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
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
    window.setTimeout(() => setToast((c) => (c?.message === message ? null : c)), 4200);
  };

  const clearData = () => {
    setRows([]);
    setOrganizations([]);
    setCurriculumSubjects([]);
    setClassSubjects([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [subjectRows, organizationRows, curriculumSubjectRows, classSubjectRows] = await Promise.all([
        tableSafe("subjects")?.toArray?.() || [],
        listActiveLocal("organizations", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        tableSafe("curriculumSubjects")?.toArray?.() || [],
        tableSafe("classSubjects")?.toArray?.() || [],
      ]);

      setRows(
        (subjectRows as Subject[])
          .filter((r) => sameTenant(r as TenantRow))
          .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
      );
      setOrganizations((organizationRows as Organization[]).sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || ""))));
      setCurriculumSubjects((curriculumSubjectRows as CurriculumSubject[]).filter((r) => sameTenant(r as TenantRow)));
      setClassSubjects((classSubjectRows as ClassSubject[]).filter((r) => sameTenant(r as TenantRow)));
    } catch (error) {
      console.error("Failed to load subjects:", error);
      clearData();
      showToast("error", "Failed to load subjects.");
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

  const organizationMap = useMemo(() => new Map(organizations.map((r: any) => [idOf(r.id), r])), [organizations]);

  const curriculumSubjectCountMap = useMemo(() => {
    const map = new Map<number, number>();
    curriculumSubjects.forEach((r: any) => {
      const id = idOf(r.subjectId);
      if (id) map.set(id, (map.get(id) || 0) + 1);
    });
    return map;
  }, [curriculumSubjects]);

  const classSubjectCountMap = useMemo(() => {
    const map = new Map<number, number>();
    classSubjects.forEach((r: any) => {
      const id = idOf(r.subjectId);
      if (id) map.set(id, (map.get(id) || 0) + 1);
    });
    return map;
  }, [classSubjects]);

  const viewRows = useMemo<SubjectView[]>(() => {
    return rows.map((row: any) => {
      const id = idOf(row.id);
      const organization = row.organizationId ? (organizationMap.get(idOf(row.organizationId)) as any) : undefined;
      const curriculumUseCount = curriculumSubjectCountMap.get(id) || 0;
      const classSubjectUseCount = classSubjectCountMap.get(id) || 0;
      return {
        id,
        row,
        organizationName: organization?.name || "No organization",
        curriculumUseCount,
        classSubjectUseCount,
        totalUsage: curriculumUseCount + classSubjectUseCount,
        active: isActiveRow(row),
      };
    });
  }, [classSubjectCountMap, curriculumSubjectCountMap, organizationMap, rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return viewRows
      .filter((item) => {
        const row: any = item.row;
        if (filterOrganizationId !== "all" && !sameId(row.organizationId, filterOrganizationId)) return false;
        if (filterCategory !== "all" && row.category !== filterCategory) return false;
        if (filterStatus === "active" && !item.active) return false;
        if (filterStatus === "inactive" && item.active) return false;
        if (!q) return true;
        return `${row.name} ${row.code || ""} ${row.description || ""} ${row.category || ""} ${row.credits || ""} ${item.organizationName}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => String((a.row as any).name || "").localeCompare(String((b.row as any).name || "")));
  }, [filterCategory, filterOrganizationId, filterStatus, search, viewRows]);

  const summary = useMemo(
    () => ({
      total: viewRows.length,
      active: viewRows.filter((i) => i.active).length,
      inactive: viewRows.filter((i) => !i.active).length,
      curriculumUsage: curriculumSubjects.length,
      classUsage: classSubjects.length,
      core: viewRows.filter((i) => (i.row as any).category === "core").length,
      showing: filteredRows.length,
    }),
    [classSubjects.length, curriculumSubjects.length, filteredRows.length, viewRows]
  );

  const countsByCategory = useMemo(() => groupedCounts(viewRows, (i) => categoryLabel((i.row as any).category)), [viewRows]);
  const countsByOrganization = useMemo(() => groupedCounts(viewRows, (i) => i.organizationName), [viewRows]);
  const countsByUsage = useMemo(
    () => viewRows.map((i) => ({ label: (i.row as any).name || "Subject", value: i.totalUsage })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)),
    [viewRows]
  );

  const activeFilterCount = useMemo(() => {
    return [filterOrganizationId, filterCategory, filterStatus].filter((v) => v !== "all" && v !== "active").length;
  }, [filterCategory, filterOrganizationId, filterStatus]);

  const updateForm = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  const handleImageUpload = async (field: "photo" | "bannerImage", file?: File) => {
    if (!file || !accountId || !schoolId || !branchId) return;

    try {
      const result = await saveImageAsset(file, {
        accountId: String(accountId),
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        ownerTable: SUBJECT_MEDIA_OWNER_TABLE,
        ownerLocalId: form.id || undefined,
        ownerTempKey: form.id ? undefined : mediaSessionKeyRef.current,
        fieldKey: field,
        variant: field === "photo" ? "avatar" : "cover",
        replaceExisting: true,
      });

      updateForm({
        [field]: result.previewUrl,
        [field === "photo" ? "photoMediaId" : "bannerImageMediaId"]: result.assetId,
      } as Partial<FormState>);

      showToast("info", `${field === "photo" ? "Photo" : "Banner"} prepared. Save to attach and upload it.`);
    } catch (error: any) {
      showToast("error", error?.message || "Failed to process image.");
    }
  };

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const openCreate = () => {
    if (!requireTenant()) return;
    mediaSessionKeyRef.current = createMediaSessionKey(SUBJECT_MEDIA_OWNER_TABLE);
    setForm({ ...emptyForm, organizationId: filterOrganizationId !== "all" ? filterOrganizationId : "", category: filterCategory === "all" ? "academic" : filterCategory, active: filterStatus !== "inactive" });
    setModalOpen(true);
  };

  const openEdit = (row: Subject) => {
    const subject: any = row;
    setSelectedItem(null);
    setForm({
      id: idOf(subject.id),
      organizationId: subject.organizationId ? String(subject.organizationId) : "",
      name: subject.name || "",
      code: subject.code || "",
      description: subject.description || "",
      photo: mediaById[idOf(subject.id)]?.photo || safeRecordMediaValue(subject.photo) || "",
      photoMediaId: subject.photoMediaId ? Number(subject.photoMediaId) : undefined,
      bannerImage: mediaById[idOf(subject.id)]?.bannerImage || safeRecordMediaValue(subject.bannerImage) || "",
      bannerImageMediaId: subject.bannerImageMediaId ? Number(subject.bannerImageMediaId) : undefined,
      credits: subject.credits == null ? "" : String(subject.credits),
      category: subject.category || "academic",
      active: isActiveRow(subject),
    });
    setModalOpen(true);
  };

  const clearFilters = () => {
    setFilterOrganizationId("all");
    setFilterCategory("all");
    setFilterStatus("active");
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId) return "Select a school first.";
    if (!branchId) return "Select a branch first.";
    if (!form.name.trim()) return "Enter subject name.";
    if (form.organizationId && !organizationMap.get(idOf(form.organizationId))) return "Selected organization is not in this branch.";
    if (form.credits && Number(form.credits) < 0) return "Credits cannot be negative.";

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      if (row.isDeleted) return false;
      const sameName = safeLower(row.name) === safeLower(form.name);
      const sameCode = !!form.code.trim() && safeLower(row.code) === safeLower(form.code);
      return sameName || sameCode;
    });
    if (duplicate) return "A subject with this name or code already exists.";
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
      const existing = form.id ? rows.find((row: any) => sameId(row.id, form.id)) : undefined;
      const payload = {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        description: form.description.trim() || undefined,
        photo: safeRecordMediaValue(form.photo),
        photoMediaId: form.photoMediaId || undefined,
        bannerImage: safeRecordMediaValue(form.bannerImage),
        bannerImageMediaId: form.bannerImageMediaId || undefined,
        credits: form.credits === "" ? undefined : Number(form.credits),
        category: form.category || "academic",
        active: form.active,
        status: form.active ? "active" : "inactive",
        isDeleted: false,
      } as unknown as Partial<Subject>;

      const savedSubject =
        form.id && existing
          ? await updateLocal("subjects", Number(form.id), payload)
          : await createLocal("subjects", payload as Subject);

      const savedSubjectId = Number((savedSubject as any)?.id || form.id || 0);

      if (savedSubjectId) {
        await commitMediaAssetsToOwner({
          accountId: String(accountId),
          ownerTable: SUBJECT_MEDIA_OWNER_TABLE,
          ownerLocalId: savedSubjectId,
          ownerCloudId: (savedSubject as any)?.cloudId || (existing as any)?.cloudId,
          ownerTempKey: mediaSessionKeyRef.current,
          assets: [
            { assetId: form.photoMediaId, fieldKey: "photo" },
            { assetId: form.bannerImageMediaId, fieldKey: "bannerImage" },
          ],
        });
      }

      mediaSessionKeyRef.current = createMediaSessionKey(SUBJECT_MEDIA_OWNER_TABLE);
      setModalOpen(false);
      showToast("success", "Subject saved.");
      await load();
    } catch (error) {
      console.error("Failed to save subject:", error);
      showToast("error", "Failed to save subject.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: SubjectView) => {
    const row: any = item.row;
    const id = idOf(row.id);
    if (!id) return;
    const warning = item.totalUsage
      ? `"${row.name}" is used in ${item.curriculumUseCount} curriculum subject(s) and ${item.classSubjectUseCount} class subject(s). Delete anyway?`
      : `Delete "${row.name}"?`;
    if (!window.confirm(warning)) return;

    await Promise.all(

      ["photo", "bannerImage"].map((fieldKey) =>

        softDeleteOwnerFieldAssets({

          accountId: String(accountId),

          ownerTable: "subjects",

          ownerLocalId: Number(id),

          fieldKey,

        }),

      ),

    );

    await softDeleteLocal("subjects", Number(id));
    setSelectedItem(null);
    showToast("success", "Subject deleted.");
    await load();
  };

  const toggleActive = async (item: SubjectView) => {
    const id = idOf((item.row as any).id);
    if (!id) return;
    await updateLocal("subjects", Number(id), {
      active: !item.active,
      status: !item.active ? "active" : "inactive",
      isDeleted: false,
    } as unknown as Partial<Subject>);
    setSelectedItem(null);
    showToast("success", item.active ? "Subject deactivated." : "Subject activated.");
    await load();
  };

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return <State primary={primary} title="Opening Subjects..." text="Checking account, branch, subjects, organizations, curriculum links, and class delivery links." />;
  }

  if (!authenticated || !accountId) return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing subjects." />;

  if (!schoolId || !branchId) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>Subjects belong to one active school branch.</p>
          <button type="button" className="ba-state-button" onClick={() => router.push("/account")}>Go to Account Setup</button>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && <section className={`ba-toast ${toast.tone}`}>{toast.message}<button type="button" onClick={() => setToast(null)} aria-label="Close notification">✕</button></section>}

      <section className="ba-search-card" aria-label="Subject search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subjects..." aria-label="Search subjects" />
        </label>
        <button type="button" className="ba-add-inline" onClick={openCreate} aria-label="Add subject">+</button>
        <button type="button" className={`ba-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />{activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>
        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      {(activeFilterCount > 0 || search.trim()) && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {search.trim() && <button type="button" onClick={() => setSearch("")}>Search: {search} ×</button>}
          {filterOrganizationId !== "all" && <button type="button" onClick={() => setFilterOrganizationId("all")}>Organization: {(organizationMap.get(idOf(filterOrganizationId)) as any)?.name || filterOrganizationId} ×</button>}
          {filterCategory !== "all" && <button type="button" onClick={() => setFilterCategory("all")}>Category: {categoryLabel(filterCategory)} ×</button>}
          {filterStatus !== "active" && <button type="button" onClick={() => setFilterStatus("active")}>Status: {filterStatus === "all" ? "All" : "Inactive"} ×</button>}
        </section>
      )}

      {viewMode === "summary" && <SummaryView summary={summary} countsByCategory={countsByCategory} countsByOrganization={countsByOrganization} countsByUsage={countsByUsage} />}
      {viewMode === "table" && <TableView rows={filteredRows} openEdit={openEdit} remove={remove} toggleActive={toggleActive} />}
      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredRows.map((item) => <SubjectListItem key={String(item.id)} item={item} photo={mediaById[item.id]?.photo || safeRecordMediaValue((item.row as any).photo)} primary={primary} onOpen={() => setSelectedItem(item)} />)}
          {!filteredRows.length && <Empty icon="📘" title="No subjects found" text="Create reusable subject identities such as Mathematics, English Language, Creative Arts, Computing, or Science." />}
        </section>
      )}

      {filterOpen && <FilterSheet organizations={organizations} filterOrganizationId={filterOrganizationId} filterCategory={filterCategory} filterStatus={filterStatus} setFilterOrganizationId={setFilterOrganizationId} setFilterCategory={setFilterCategory} setFilterStatus={setFilterStatus} clearFilters={clearFilters} onClose={() => setFilterOpen(false)} />}
      {moreOpen && <MoreSheet viewMode={viewMode} setViewMode={(mode) => { setViewMode(mode); setMoreOpen(false); }} onRefresh={async () => { setMoreOpen(false); await load(); }} onClose={() => setMoreOpen(false)} />}
      {selectedItem && <ActionSheet item={selectedItem} openEdit={openEdit} remove={remove} toggleActive={toggleActive} onClose={() => setSelectedItem(null)} />}
      {modalOpen && <SubjectModal form={form} saving={saving} organizations={organizations} setModalOpen={setModalOpen} updateForm={updateForm} handleImageUpload={handleImageUpload} save={save} />}
    </main>
  );
}

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ba-state"><div className="ba-spinner" /><h2>{title}</h2><p>{text}</p></section>
    </main>
  );
}

function SubjectListItem({ item, photo, primary, onOpen }: { item: SubjectView; photo?: string; primary: string; onOpen: () => void }) {
  const row: any = item.row;
  return (
    <button type="button" className="subject-row" onClick={onOpen}>
      <Avatar name={row.name} photo={photo} primary={primary} />
      <span className="subject-main">
        <strong>{row.name || "Unnamed subject"}</strong>
        <small>{item.organizationName}{row.code ? ` · ${row.code}` : ""}</small>
        <em>{categoryLabel(row.category)} · {row.credits ?? "—"} credits · {item.totalUsage} linked</em>
      </span>
      <span className="subject-side"><StatusDot active={item.active} /><i>⋯</i></span>
    </button>
  );
}

function TableView({ rows, openEdit, remove, toggleActive }: { rows: SubjectView[]; openEdit: (row: Subject) => void; remove: (item: SubjectView) => void; toggleActive: (item: SubjectView) => void }) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-head"><h3>Subjects ({rows.length})</h3></div>
      <div className="ba-table-scroll">
        <table>
          <thead><tr><th>Subject</th><th>Organization</th><th>Category</th><th>Credits</th><th>Links</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((item) => {
              const row: any = item.row;
              return (
                <tr key={String(item.id)}>
                  <td><strong>{row.name}</strong><span>{row.code || row.description || "No code"}</span></td>
                  <td>{item.organizationName}</td>
                  <td><Chip tone={categoryTone(row.category)}>{categoryLabel(row.category)}</Chip></td>
                  <td>{row.credits ?? "—"}</td>
                  <td>{item.curriculumUseCount} curriculum · {item.classSubjectUseCount} class</td>
                  <td><span className="ba-inline-status"><StatusDot active={item.active} />{item.active ? "Active" : "Inactive"}</span></td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td><div className="ba-table-actions"><button type="button" onClick={() => openEdit(item.row)}>Edit</button><button type="button" onClick={() => toggleActive(item)}>{item.active ? "Deactivate" : "Activate"}</button><button type="button" className="danger" onClick={() => remove(item)}>Delete</button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="ba-empty-table">No subject matches your filters.</div>}
      </div>
    </section>
  );
}

function SummaryView({ summary, countsByCategory, countsByOrganization, countsByUsage }: { summary: any; countsByCategory: { label: string; value: number }[]; countsByOrganization: { label: string; value: number }[]; countsByUsage: { label: string; value: number }[] }) {
  return (
    <section className="ba-analysis-grid">
      <article className="ba-analysis ba-current-filter"><span>Current Filter</span><strong>{summary.showing}</strong><p>Subject record(s) currently match your search and filter conditions.</p></article>
      <article className="ba-analysis"><span>Active Subjects</span><strong>{summary.active}</strong><p>{summary.inactive} inactive · {summary.core} core · {summary.total} total.</p></article>
      <article className="ba-analysis"><span>Usage Links</span><strong>{summary.curriculumUsage + summary.classUsage}</strong><p>{summary.curriculumUsage} curriculum links · {summary.classUsage} class delivery links.</p></article>
      <AnalysisCard title="Subjects by Category" rows={countsByCategory} total={summary.total} />
      <AnalysisCard title="Subjects by Organization" rows={countsByOrganization} total={summary.total} />
      <AnalysisCard title="Most Used Subjects" rows={countsByUsage} total={Math.max(summary.curriculumUsage + summary.classUsage, 1)} />
    </section>
  );
}

function FilterSheet(props: { organizations: Organization[]; filterOrganizationId: string; filterCategory: "all" | SubjectCategory; filterStatus: SubjectStatusFilter; setFilterOrganizationId: (v: string) => void; setFilterCategory: (v: "all" | SubjectCategory) => void; setFilterStatus: (v: SubjectStatusFilter) => void; clearFilters: () => void; onClose: () => void }) {
  return (
    <section className="ba-sheet-backdrop" onClick={props.onClose}>
      <div className="ba-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ba-sheet-head"><div><h3>Filter Subjects</h3><p>Keep the page clean while narrowing records.</p></div><button type="button" onClick={props.onClose}>✕</button></div>
        <div className="ba-sheet-form">
          <label><span>Organization</span><select value={props.filterOrganizationId} onChange={(e) => props.setFilterOrganizationId(e.target.value)}><option value="all">All organizations</option>{props.organizations.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}{row.type ? ` · ${row.type}` : ""}</option>)}</select></label>
          <label><span>Category</span><select value={props.filterCategory} onChange={(e) => props.setFilterCategory(e.target.value as any)}><option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}</select></label>
          <label><span>Status</span><select value={props.filterStatus} onChange={(e) => props.setFilterStatus(e.target.value as SubjectStatusFilter)}><option value="active">Active only</option><option value="all">All status</option><option value="inactive">Inactive only</option></select></label>
        </div>
        <div className="ba-sheet-actions"><button type="button" onClick={props.clearFilters}>Reset</button><button type="button" onClick={props.onClose}>Apply</button></div>
      </div>
    </section>
  );
}

function MoreSheet({ viewMode, setViewMode, onRefresh, onClose }: { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void; onRefresh: () => void; onClose: () => void }) {
  return (
    <section className="ba-sheet-backdrop" onClick={onClose}>
      <div className="ba-sheet compact" onClick={(e) => e.stopPropagation()}>
        <div className="ba-sheet-head"><div><h3>More</h3><p>Views and quick actions.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="ba-more-list">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>▦ Cards</button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>☷ Table</button>
          <button type="button" className={viewMode === "summary" ? "active" : ""} onClick={() => setViewMode("summary")}>📊 Analytics</button>
          <button type="button" onClick={onRefresh}>↻ Refresh</button>
        </div>
      </div>
    </section>
  );
}

function ActionSheet({ item, openEdit, remove, toggleActive, onClose }: { item: SubjectView; openEdit: (row: Subject) => void; remove: (item: SubjectView) => void; toggleActive: (item: SubjectView) => void; onClose: () => void }) {
  const row: any = item.row;
  return (
    <section className="ba-sheet-backdrop" onClick={onClose}>
      <div className="ba-sheet compact" onClick={(e) => e.stopPropagation()}>
        <div className="ba-sheet-head"><div><h3>{row.name || "Subject"}</h3><p>{item.organizationName} · {categoryLabel(row.category)} · {item.totalUsage} linked</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="ba-more-list"><button type="button" onClick={() => openEdit(item.row)}>Edit subject</button><button type="button" onClick={() => toggleActive(item)}>{item.active ? "Deactivate" : "Activate"}</button><button type="button" className="danger" onClick={() => remove(item)}>Delete subject</button></div>
      </div>
    </section>
  );
}

function SubjectModal({ form, saving, organizations, setModalOpen, updateForm, handleImageUpload, save }: { form: FormState; saving: boolean; organizations: Organization[]; setModalOpen: (v: boolean) => void; updateForm: (patch: Partial<FormState>) => void; handleImageUpload: (field: "photo" | "bannerImage", file?: File) => void; save: (event?: React.FormEvent) => void }) {
  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head"><div><h2>{form.id ? "Edit Subject" : "New Subject"}</h2><p>Subjects are reusable academic identities attached later to curriculum rules and class delivery.</p></div><button type="button" onClick={() => setModalOpen(false)}>✕</button></div>
        <div className="ba-form">
          <label><span>Subject Name</span><input value={form.name} onChange={(e) => updateForm({ name: e.target.value })} placeholder="e.g. Mathematics" /></label>
          <label><span>Subject Code</span><input value={form.code} onChange={(e) => updateForm({ code: e.target.value })} placeholder="e.g. MATH" /></label>
          <label><span>Credits</span><input type="number" value={form.credits} onChange={(e) => updateForm({ credits: e.target.value })} placeholder="Optional" /></label>
          <label><span>Category</span><select value={form.category} onChange={(e) => updateForm({ category: e.target.value as SubjectCategory })}>{categories.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}</select></label>
          <label><span>Organization / Department</span><select value={form.organizationId} onChange={(e) => updateForm({ organizationId: e.target.value })}><option value="">No organization</option>{organizations.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}{row.type ? ` · ${row.type}` : ""}</option>)}</select></label>
          <label><span>Status</span><select value={form.active ? "active" : "inactive"} onChange={(e) => updateForm({ active: e.target.value === "active" })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <label className="wide"><span>Description</span><textarea value={form.description} onChange={(e) => updateForm({ description: e.target.value })} placeholder="Brief subject description" /></label>
          <label><span>Subject Photo</span><input type="file" accept="image/*" onChange={(e) => handleImageUpload("photo", e.target.files?.[0])} />{form.photo ? <img src={form.photo} alt="Subject preview" className="ba-preview-photo" /> : null}</label>
          <label className="wide"><span>Subject Banner</span><input type="file" accept="image/*" onChange={(e) => handleImageUpload("bannerImage", e.target.files?.[0])} />{form.bannerImage ? <img src={form.bannerImage} alt="Subject banner preview" className="ba-preview-banner" /> : null}</label>
        </div>
        <div className="ba-modal-actions"><button type="button" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving..." : form.id ? "Save Changes" : "Create Subject"}</button></div>
      </form>
    </div>
  );
}

function groupedCounts(rows: SubjectView[], keyFn: (item: SubjectView) => string) {
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
      <span>{title}</span><strong>{rows.reduce((sum, row) => sum + row.value, 0)}</strong>
      <div className="ba-analysis-list">
        {rows.slice(0, 8).map((row) => {
          const share = total ? Math.round((row.value / total) * 100) : 0;
          return <section key={row.label}><div><b>{row.label}</b><small>{row.value} · {share}%</small></div><div className="ba-progress"><i style={{ width: `${Math.max(4, share)}%` }} /></div></section>;
        })}
        {!rows.length ? <p>No data available.</p> : null}
      </div>
    </article>
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
`;
