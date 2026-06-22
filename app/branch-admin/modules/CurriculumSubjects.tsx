"use client";

/**
 * app/branch-admin/modules/CurriculumSubjects.tsx
 * Eleeveon Curriculum Subjects V2.
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
 * - compact list/card-row view instead of oversized cards
 * - table shows count in the first header only
 * - createLocal/updateLocal/softDeleteLocal/listActiveLocal used where appropriate
 * - theme variables preserved for dark mode and branch branding
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  db,
  type ClassSubject,
  type Curriculum,
  type CurriculumPathway,
  type CurriculumSubject,
  type CurriculumSubjectType,
  type Organization,
  type Subject,
  type SubjectPrerequisite,
} from "../../lib/db";

import { createLocal, updateLocal, softDeleteLocal, listActiveLocal } from "../../lib/sync/syncUtils";

type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";

type TenantRow = {
  id?: number;
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type FormState = {
  id?: number;
  curriculumId: string;
  subjectId: string;
  pathwayId: string;
  organizationId: string;
  type: CurriculumSubjectType;
  credits: string;
  contactHours: string;
  minimumPassScore: string;
  orderIndex: string;
  active: boolean;
};

type CurriculumSubjectView = {
  id: number;
  row: CurriculumSubject;
  curriculumName: string;
  subjectName: string;
  subjectCode: string;
  pathwayName: string;
  organizationName: string;
  classSubjectCount: number;
  prerequisiteCount: number;
  totalUsage: number;
  active: boolean;
};

const emptyForm: FormState = {
  curriculumId: "",
  subjectId: "",
  pathwayId: "",
  organizationId: "",
  type: "core",
  credits: "",
  contactHours: "",
  minimumPassScore: "",
  orderIndex: "",
  active: true,
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

const isActiveRow = (row: any) =>
  !row?.isDeleted && row?.active !== false && !["inactive", "deleted", "archived", "suspended"].includes(safeLower(row?.status));

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

const toOptionalNumber = (value: string) => {
  if (value === "" || value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const typeLabel = (type?: CurriculumSubjectType) =>
  String(type || "core").charAt(0).toUpperCase() + String(type || "core").slice(1);

function typeTone(type?: CurriculumSubjectType): "green" | "orange" | "purple" {
  if (type === "elective") return "orange";
  if (type === "optional") return "purple";
  return "green";
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

function Avatar({ name, primary }: { name: string; primary: string }) {
  return (
    <div
      className="ba-avatar"
      style={{
        background: `linear-gradient(135deg, ${primary}, rgba(15,23,42,.9))`,
      }}
    >
      {String(name || "CS").slice(0, 2).toUpperCase()}
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

export default function CurriculumSubjects() {
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

  const [rows, setRows] = useState<CurriculumSubject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [prerequisites, setPrerequisites] = useState<SubjectPrerequisite[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filterCurriculumId, setFilterCurriculumId] = useState("all");
  const [filterPathwayId, setFilterPathwayId] = useState("all");
  const [filterOrganizationId, setFilterOrganizationId] = useState("all");
  const [filterType, setFilterType] = useState<"all" | CurriculumSubjectType>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("active");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CurriculumSubjectView | null>(null);

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
    setCurriculums([]);
    setSubjects([]);
    setPathways([]);
    setOrganizations([]);
    setClassSubjects([]);
    setPrerequisites([]);
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
        curriculumSubjectRows,
        curriculumRows,
        subjectRows,
        pathwayRows,
        organizationRows,
        classSubjectRows,
        prerequisiteRows,
      ] = await Promise.all([
        tableSafe("curriculumSubjects")?.toArray?.() || [],
        listActiveLocal("curriculums", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        listActiveLocal("subjects", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        listActiveLocal("curriculumPathways", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        listActiveLocal("organizations", { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any),
        tableSafe("classSubjects")?.toArray?.() || [],
        tableSafe("subjectPrerequisites")?.toArray?.() || [],
      ]);

      setRows(
        (curriculumSubjectRows as CurriculumSubject[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort((a: any, b: any) => Number(a.orderIndex || 9999) - Number(b.orderIndex || 9999))
      );

      setCurriculums(
        (curriculumRows as Curriculum[]).sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
      );
      setSubjects(
        (subjectRows as Subject[]).sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
      );
      setPathways(
        (pathwayRows as CurriculumPathway[]).sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
      );
      setOrganizations(
        (organizationRows as Organization[]).sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
      );
      setClassSubjects((classSubjectRows as ClassSubject[]).filter((row) => sameTenant(row as TenantRow)));
      setPrerequisites((prerequisiteRows as SubjectPrerequisite[]).filter((row) => sameTenant(row as TenantRow)));
    } catch (error) {
      console.error(error);
      clearData();
      showToast("error", "Failed to load curriculum subjects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, accountLoading, settingsLoading, contextLoading]);

  const curriculumMap = useMemo(() => new Map(curriculums.map((row: any) => [idOf(row.id), row])), [curriculums]);
  const subjectMap = useMemo(() => new Map(subjects.map((row: any) => [idOf(row.id), row])), [subjects]);
  const pathwayMap = useMemo(() => new Map(pathways.map((row: any) => [idOf(row.id), row])), [pathways]);
  const organizationMap = useMemo(() => new Map(organizations.map((row: any) => [idOf(row.id), row])), [organizations]);

  const usageMaps = useMemo(() => {
    const classSubjectMap = new Map<number, number>();
    const prerequisiteMap = new Map<number, number>();

    classSubjects.forEach((row: any) => {
      const id = idOf(row.curriculumSubjectId);
      if (id) classSubjectMap.set(id, (classSubjectMap.get(id) || 0) + 1);
    });

    prerequisites.forEach((row: any) => {
      const id = idOf(row.curriculumSubjectId);
      if (id) prerequisiteMap.set(id, (prerequisiteMap.get(id) || 0) + 1);
    });

    return { classSubjectMap, prerequisiteMap };
  }, [classSubjects, prerequisites]);

  const filteredPathwaysForForm = useMemo(() => {
    if (!form.curriculumId) return pathways;
    return pathways.filter((row: any) => sameId(row.curriculumId, form.curriculumId));
  }, [pathways, form.curriculumId]);

  const viewRows = useMemo<CurriculumSubjectView[]>(() => {
    return rows.map((row: any) => {
      const id = idOf(row.id);
      const curriculum: any = curriculumMap.get(idOf(row.curriculumId));
      const subject: any = subjectMap.get(idOf(row.subjectId));
      const pathway: any = row.pathwayId ? pathwayMap.get(idOf(row.pathwayId)) : undefined;
      const organization: any = row.organizationId ? organizationMap.get(idOf(row.organizationId)) : undefined;
      const classSubjectCount = usageMaps.classSubjectMap.get(id) || 0;
      const prerequisiteCount = usageMaps.prerequisiteMap.get(id) || 0;

      return {
        id,
        row,
        curriculumName: curriculum?.name || curriculum?.title || "Unknown curriculum",
        subjectName: subject?.name || subject?.title || "Unknown subject",
        subjectCode: subject?.code || subject?.shortCode || "",
        pathwayName: pathway?.name || "No pathway",
        organizationName: organization?.name || "No organization",
        classSubjectCount,
        prerequisiteCount,
        totalUsage: classSubjectCount + prerequisiteCount,
        active: isActiveRow(row),
      };
    });
  }, [curriculumMap, organizationMap, pathwayMap, rows, subjectMap, usageMaps]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row: any = item.row;

        if (filterCurriculumId !== "all" && !sameId(row.curriculumId, filterCurriculumId)) return false;
        if (filterPathwayId !== "all" && !sameId(row.pathwayId, filterPathwayId)) return false;
        if (filterOrganizationId !== "all" && !sameId(row.organizationId, filterOrganizationId)) return false;
        if (filterType !== "all" && row.type !== filterType) return false;
        if (filterStatus === "active" && !item.active) return false;
        if (filterStatus === "inactive" && item.active) return false;

        if (!query) return true;

        return `${item.curriculumName} ${item.subjectName} ${item.subjectCode} ${item.pathwayName} ${item.organizationName} ${
          row.type || ""
        } ${row.credits || ""} ${row.contactHours || ""} ${row.minimumPassScore || ""} ${row.orderIndex || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const byCurriculum = a.curriculumName.localeCompare(b.curriculumName);
        if (byCurriculum) return byCurriculum;
        const byOrder = Number((a.row as any).orderIndex || 9999) - Number((b.row as any).orderIndex || 9999);
        if (byOrder) return byOrder;
        return a.subjectName.localeCompare(b.subjectName);
      });
  }, [filterCurriculumId, filterOrganizationId, filterPathwayId, filterStatus, filterType, search, viewRows]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      active: viewRows.filter((row) => row.active).length,
      inactive: viewRows.filter((row) => !row.active).length,
      core: viewRows.filter((row) => (row.row as any).type === "core").length,
      elective: viewRows.filter((row) => (row.row as any).type === "elective").length,
      optional: viewRows.filter((row) => (row.row as any).type === "optional").length,
      classLinks: classSubjects.length,
      prerequisiteLinks: prerequisites.length,
      showing: filteredRows.length,
    }),
    [classSubjects.length, filteredRows.length, prerequisites.length, rows.length, viewRows]
  );

  const activeFilterCount = useMemo(() => {
    return [filterCurriculumId, filterPathwayId, filterOrganizationId, filterType, filterStatus].filter((v) => v !== "all").length;
  }, [filterCurriculumId, filterOrganizationId, filterPathwayId, filterStatus, filterType]);

  const countsByCurriculum = useMemo(() => groupedCounts(viewRows, (item) => item.curriculumName), [viewRows]);
  const countsByType = useMemo(() => groupedCounts(viewRows, (item) => typeLabel((item.row as any).type)), [viewRows]);
  const countsByPathway = useMemo(() => groupedCounts(viewRows, (item) => item.pathwayName), [viewRows]);
  const countsByOrganization = useMemo(() => groupedCounts(viewRows, (item) => item.organizationName), [viewRows]);

  const updateForm = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      showToast("error", "Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const openCreate = () => {
    if (!requireTenant()) return;

    setForm({
      ...emptyForm,
      curriculumId: filterCurriculumId !== "all" ? String(filterCurriculumId) : "",
      pathwayId: filterPathwayId !== "all" ? String(filterPathwayId) : "",
      organizationId: filterOrganizationId !== "all" ? String(filterOrganizationId) : "",
      type: filterType === "all" ? "core" : filterType,
      active: filterStatus === "inactive" ? false : true,
    });
    setModalOpen(true);
  };

  const openEdit = (item: CurriculumSubjectView) => {
    const row: any = item.row;
    setSelectedItem(null);

    setForm({
      id: idOf(row.id),
      curriculumId: row.curriculumId ? String(row.curriculumId) : "",
      subjectId: row.subjectId ? String(row.subjectId) : "",
      pathwayId: row.pathwayId ? String(row.pathwayId) : "",
      organizationId: row.organizationId ? String(row.organizationId) : "",
      type: row.type || "core",
      credits: row.credits == null ? "" : String(row.credits),
      contactHours: row.contactHours == null ? "" : String(row.contactHours),
      minimumPassScore: row.minimumPassScore == null ? "" : String(row.minimumPassScore),
      orderIndex: row.orderIndex == null ? "" : String(row.orderIndex),
      active: item.active,
    });

    setModalOpen(true);
  };

  const clearFilters = () => {
    setFilterCurriculumId("all");
    setFilterPathwayId("all");
    setFilterOrganizationId("all");
    setFilterType("all");
    setFilterStatus("all");
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId || !branchId) return "Select a school branch first.";
    if (!form.curriculumId) return "Select a curriculum.";
    if (!form.subjectId) return "Select a subject.";

    const numericFields: [keyof FormState, string][] = [
      ["credits", "Credits"],
      ["contactHours", "Contact hours"],
      ["minimumPassScore", "Minimum pass score"],
      ["orderIndex", "Order index"],
    ];

    for (const [key, label] of numericFields) {
      const value = form[key] as string;
      if (value !== "" && Number(value) < 0) return `${label} cannot be negative.`;
    }

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      if (row.isDeleted) return false;

      const sameCurriculum = sameId(row.curriculumId, form.curriculumId);
      const sameSubject = sameId(row.subjectId, form.subjectId);
      const samePathway = sameId(row.pathwayId || 0, form.pathwayId || 0);

      return sameCurriculum && sameSubject && samePathway;
    });

    if (duplicate) return "This subject is already attached to this curriculum/pathway.";

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

      const payload: Partial<CurriculumSubject> = {
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
        curriculumId: idOf(form.curriculumId),
        subjectId: idOf(form.subjectId),
        pathwayId: form.pathwayId ? idOf(form.pathwayId) : undefined,
        organizationId: form.organizationId ? idOf(form.organizationId) : undefined,
        type: form.type || "core",
        credits: toOptionalNumber(form.credits),
        contactHours: toOptionalNumber(form.contactHours),
        minimumPassScore: toOptionalNumber(form.minimumPassScore),
        orderIndex: toOptionalNumber(form.orderIndex),
        active: form.active,
        status: form.active ? "active" : "inactive",
        isDeleted: false,
      } as any;

      if (form.id && existing) {
        await updateLocal("curriculumSubjects", Number(form.id), payload);
      } else {
        await createLocal("curriculumSubjects", payload as CurriculumSubject);
      }

      setModalOpen(false);
      showToast("success", "Curriculum subject rule saved.");
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not save curriculum subject rule.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: CurriculumSubjectView) => {
    const id = idOf((item.row as any).id);
    if (!id) return;

    await updateLocal("curriculumSubjects", id, {
      active: !item.active,
      status: !item.active ? "active" : "inactive",
      isDeleted: false,
    } as unknown as Partial<CurriculumSubject>);

    setSelectedItem(null);
    showToast("success", item.active ? "Subject rule deactivated." : "Subject rule activated.");
    await load();
  };

  const remove = async (item: CurriculumSubjectView) => {
    const id = idOf((item.row as any).id);
    if (!id) return;

    const warning = item.totalUsage
      ? `"${item.subjectName}" is used by ${item.classSubjectCount} class subject(s) and ${item.prerequisiteCount} prerequisite rule(s). Delete anyway?`
      : `Delete "${item.subjectName}" from ${item.curriculumName}?`;

    if (!window.confirm(warning)) return;

    await softDeleteLocal("curriculumSubjects", Number(id));
    setSelectedItem(null);
    showToast("success", "Curriculum subject rule deleted.");
    await load();
  };

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return (
      <State
        primary={primary}
        title="Opening Curriculum Subjects..."
        text="Checking curriculum rules, curriculums, pathways, subjects, organizations, class links, and prerequisites."
      />
    );
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing curriculum subject rules." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>Curriculum subject rules belong to one active school branch.</p>
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

      <section className="ba-search-card" aria-label="Curriculum subject search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search curriculum subjects..."
            aria-label="Search curriculum subjects"
          />
        </label>

        <button type="button" className="ba-add-inline" onClick={openCreate} aria-label="Add curriculum subject rule">
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
          {filterCurriculumId !== "all" && (
            <button type="button" onClick={() => setFilterCurriculumId("all")}>
              Curriculum: {(curriculumMap.get(idOf(filterCurriculumId)) as any)?.name || filterCurriculumId} ×
            </button>
          )}
          {filterPathwayId !== "all" && (
            <button type="button" onClick={() => setFilterPathwayId("all")}>
              Pathway: {(pathwayMap.get(idOf(filterPathwayId)) as any)?.name || filterPathwayId} ×
            </button>
          )}
          {filterOrganizationId !== "all" && (
            <button type="button" onClick={() => setFilterOrganizationId("all")}>
              Organization: {(organizationMap.get(idOf(filterOrganizationId)) as any)?.name || filterOrganizationId} ×
            </button>
          )}
          {filterType !== "all" && (
            <button type="button" onClick={() => setFilterType("all")}>
              Type: {typeLabel(filterType)} ×
            </button>
          )}
          {filterStatus !== "all" && (
            <button type="button" onClick={() => setFilterStatus("all")}>
              Status: {filterStatus} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard title="Rules by Curriculum" rows={countsByCurriculum} total={summary.total} />
          <AnalysisCard title="Rules by Type" rows={countsByType} total={summary.total} />
          <AnalysisCard title="Rules by Pathway" rows={countsByPathway} total={summary.total} />
          <AnalysisCard title="Rules by Organization" rows={countsByOrganization} total={summary.total} />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{summary.showing}</strong>
            <p>Curriculum subject rule(s) currently match your search and filter conditions.</p>
          </article>
        </section>
      )}

      {viewMode === "table" && (
        <TableView rows={filteredRows} openEdit={openEdit} toggleActive={toggleActive} remove={remove} />
      )}

      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredRows.map((item) => (
            <CurriculumSubjectListItem
              key={String(item.id)}
              item={item}
              primary={primary}
              onOpen={() => setSelectedItem(item)}
            />
          ))}

          {!filteredRows.length && (
            <Empty
              icon="📖"
              title="No curriculum subject rules found"
              text="Attach subjects to curriculums and pathways before assigning them to real class delivery."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          curriculums={curriculums}
          pathways={pathways}
          organizations={organizations}
          filterCurriculumId={filterCurriculumId}
          filterPathwayId={filterPathwayId}
          filterOrganizationId={filterOrganizationId}
          filterType={filterType}
          filterStatus={filterStatus}
          setFilterCurriculumId={setFilterCurriculumId}
          setFilterPathwayId={setFilterPathwayId}
          setFilterOrganizationId={setFilterOrganizationId}
          setFilterType={setFilterType}
          setFilterStatus={setFilterStatus}
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
        <CurriculumSubjectModal
          form={form}
          saving={saving}
          curriculums={curriculums}
          subjects={subjects}
          pathways={filteredPathwaysForForm}
          organizations={organizations}
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

function CurriculumSubjectListItem({
  item,
  primary,
  onOpen,
}: {
  item: CurriculumSubjectView;
  primary: string;
  onOpen: () => void;
}) {
  const row: any = item.row;

  return (
    <button type="button" className="student-row curriculum-row" onClick={onOpen}>
      <Avatar name={item.subjectName} primary={primary} />

      <span className="curriculum-main">
        <strong>{item.subjectName}</strong>
        <small>
          {item.curriculumName}
          {item.subjectCode ? ` · ${item.subjectCode}` : ""}
        </small>
        <em>
          {typeLabel(row.type)} · {item.pathwayName} · {item.totalUsage} linked
        </em>
      </span>

      <span className="curriculum-side">
        <span className={`status-dot-mini ${item.active ? "green" : "gray"}`} title={item.active ? "Active" : "Inactive"} />
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
  curriculums,
  pathways,
  organizations,
  filterCurriculumId,
  filterPathwayId,
  filterOrganizationId,
  filterType,
  filterStatus,
  setFilterCurriculumId,
  setFilterPathwayId,
  setFilterOrganizationId,
  setFilterType,
  setFilterStatus,
  clearFilters,
  onClose,
}: {
  curriculums: Curriculum[];
  pathways: CurriculumPathway[];
  organizations: Organization[];
  filterCurriculumId: string;
  filterPathwayId: string;
  filterOrganizationId: string;
  filterType: "all" | CurriculumSubjectType;
  filterStatus: "all" | "active" | "inactive";
  setFilterCurriculumId: (value: string) => void;
  setFilterPathwayId: (value: string) => void;
  setFilterOrganizationId: (value: string) => void;
  setFilterType: (value: "all" | CurriculumSubjectType) => void;
  setFilterStatus: (value: "all" | "active" | "inactive") => void;
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
            <select value={filterCurriculumId} onChange={(e) => setFilterCurriculumId(e.target.value)}>
              <option value="all">All curriculums</option>
              {curriculums.map((r: any) => (
                <option key={String(r.id)} value={String(r.id)}>
                  {r.name || r.title || `Curriculum ${r.id}`}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Pathway</span>
            <select value={filterPathwayId} onChange={(e) => setFilterPathwayId(e.target.value)}>
              <option value="all">All pathways</option>
              {pathways.map((r: any) => (
                <option key={String(r.id)} value={String(r.id)}>
                  {r.name || `Pathway ${r.id}`}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Organization</span>
            <select value={filterOrganizationId} onChange={(e) => setFilterOrganizationId(e.target.value)}>
              <option value="all">All organizations</option>
              {organizations.map((r: any) => (
                <option key={String(r.id)} value={String(r.id)}>
                  {r.name || `Organization ${r.id}`}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Type</span>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as "all" | CurriculumSubjectType)}>
              <option value="all">All types</option>
              <option value="core">Core</option>
              <option value="elective">Elective</option>
              <option value="optional">Optional</option>
            </select>
          </label>

          <label>
            <span>Status</span>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "all" | "active" | "inactive")}>
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive/Archived</option>
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
            <small>Compact curriculum subject rules</small>
          </button>

          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            <span>☷</span>
            <b>Table view</b>
            <small>Dense records for laptop work</small>
          </button>

          <button type="button" className={viewMode === "summary" ? "active" : ""} onClick={() => setViewMode("summary")}>
            <span>◔</span>
            <b>Analytics</b>
            <small>Curriculum, pathway, type and organization summaries</small>
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
  item: CurriculumSubjectView;
  openEdit: (item: CurriculumSubjectView) => void;
  toggleActive: (item: CurriculumSubjectView) => void;
  remove: (item: CurriculumSubjectView) => void;
  onClose: () => void;
}) {
  const row: any = item.row;

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{item.subjectName}</h2>
            <p>
              {item.curriculumName} · {typeLabel(row.type)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close curriculum subject actions">
            ✕
          </button>
        </div>

        <div className="student-detail-strip">
          <span>
            <b>Pathway</b>
            {item.pathwayName}
          </span>
          <span>
            <b>Class Links</b>
            {item.classSubjectCount}
          </span>
          <span>
            <b>Prereq</b>
            {item.prerequisiteCount}
          </span>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(item)}>
            <span>✎</span>
            <b>Edit rule</b>
            <small>Update curriculum, subject, credits, hours and order</small>
          </button>

          <button type="button" onClick={() => toggleActive(item)}>
            <span>{item.active ? "⏸" : "✓"}</span>
            <b>{item.active ? "Deactivate" : "Activate"}</b>
            <small>{item.active ? "Pause this curriculum subject rule" : "Mark this rule as active"}</small>
          </button>

          <button type="button" className="danger" onClick={() => remove(item)}>
            <span>⌫</span>
            <b>Delete</b>
            <small>Soft delete this curriculum subject rule locally</small>
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
  rows: CurriculumSubjectView[];
  openEdit: (item: CurriculumSubjectView) => void;
  toggleActive: (item: CurriculumSubjectView) => void;
  remove: (item: CurriculumSubjectView) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rules ({rows.length})</th>
              <th>Curriculum</th>
              <th>Pathway</th>
              <th>Organization</th>
              <th>Type</th>
              <th>Credits</th>
              <th>Hours</th>
              <th>Pass</th>
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
                    <strong>{item.subjectName}</strong>
                    <span>{item.subjectCode || "No code"}</span>
                  </td>
                  <td>{item.curriculumName}</td>
                  <td>{item.pathwayName}</td>
                  <td>{item.organizationName}</td>
                  <td>
                    <Chip tone={typeTone(row.type)}>{typeLabel(row.type)}</Chip>
                  </td>
                  <td>{row.credits ?? "—"}</td>
                  <td>{row.contactHours ?? "—"}</td>
                  <td>{row.minimumPassScore ?? "—"}</td>
                  <td>
                    {item.classSubjectCount} class · {item.prerequisiteCount} prereq
                  </td>
                  <td>
                    <Chip tone={item.active ? "green" : "gray"}>{item.active ? "Active" : "Inactive"}</Chip>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                  <td>
                    <div className="ba-table-actions">
                      <button type="button" onClick={() => openEdit(item)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => toggleActive(item)}>
                        {item.active ? "Deactivate" : "Activate"}
                      </button>
                      <button type="button" className="ba-delete" onClick={() => remove(item)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!rows.length && <div className="ba-empty-table">No curriculum subject rule matches your filters.</div>}
      </div>
    </section>
  );
}

function CurriculumSubjectModal({
  form,
  saving,
  curriculums,
  subjects,
  pathways,
  organizations,
  updateForm,
  setModalOpen,
  save,
}: {
  form: FormState;
  saving: boolean;
  curriculums: Curriculum[];
  subjects: Subject[];
  pathways: CurriculumPathway[];
  organizations: Organization[];
  updateForm: (patch: Partial<FormState>) => void;
  setModalOpen: (open: boolean) => void;
  save: (event?: React.FormEvent) => void;
}) {
  return (
    <div className="ba-modal-backdrop">
      <form className="ba-modal" onSubmit={save}>
        <div className="ba-modal-head">
          <div>
            <h2>{form.id ? "Edit Subject Rule" : "New Subject Rule"}</h2>
            <p>Define the curriculum rule before delivering the subject inside a real class.</p>
          </div>
          <button type="button" onClick={() => setModalOpen(false)} aria-label="Close subject rule form">
            ✕
          </button>
        </div>

        <section className="ba-form-section">
          <h3>Rule Identity</h3>
          <div className="ba-form">
            <label>
              <span>Curriculum</span>
              <select value={form.curriculumId} onChange={(e) => updateForm({ curriculumId: e.target.value, pathwayId: "" })}>
                <option value="">Select curriculum</option>
                {curriculums.map((r: any) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {r.name || r.title || `Curriculum ${r.id}`}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Subject</span>
              <select value={form.subjectId} onChange={(e) => updateForm({ subjectId: e.target.value })}>
                <option value="">Select subject</option>
                {subjects.map((r: any) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {r.name || r.title || `Subject ${r.id}`}
                    {r.code ? ` · ${r.code}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Pathway</span>
              <select value={form.pathwayId} onChange={(e) => updateForm({ pathwayId: e.target.value })}>
                <option value="">No pathway</option>
                {pathways.map((r: any) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {r.name || `Pathway ${r.id}`}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Organization / Department</span>
              <select value={form.organizationId} onChange={(e) => updateForm({ organizationId: e.target.value })}>
                <option value="">No organization</option>
                {organizations.map((r: any) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {r.name || `Organization ${r.id}`}
                    {r.type ? ` · ${r.type}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Subject Type</span>
              <select value={form.type} onChange={(e) => updateForm({ type: e.target.value as CurriculumSubjectType })}>
                <option value="core">Core</option>
                <option value="elective">Elective</option>
                <option value="optional">Optional</option>
              </select>
            </label>

            <label>
              <span>Status</span>
              <select value={form.active ? "active" : "inactive"} onChange={(e) => updateForm({ active: e.target.value === "active" })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        </section>

        <section className="ba-form-section">
          <h3>Academic Rules</h3>
          <div className="ba-form">
            <label>
              <span>Credits</span>
              <input type="number" value={form.credits} onChange={(e) => updateForm({ credits: e.target.value })} placeholder="Optional" />
            </label>

            <label>
              <span>Contact Hours</span>
              <input
                type="number"
                value={form.contactHours}
                onChange={(e) => updateForm({ contactHours: e.target.value })}
                placeholder="Optional"
              />
            </label>

            <label>
              <span>Minimum Pass Score</span>
              <input
                type="number"
                value={form.minimumPassScore}
                onChange={(e) => updateForm({ minimumPassScore: e.target.value })}
                placeholder="Optional"
              />
            </label>

            <label>
              <span>Order Index</span>
              <input type="number" value={form.orderIndex} onChange={(e) => updateForm({ orderIndex: e.target.value })} placeholder="Optional" />
            </label>
          </div>
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Create Subject Rule"}
          </button>
        </div>
      </form>
    </div>
  );
}

function groupedCounts(rows: CurriculumSubjectView[], keyFn: (item: CurriculumSubjectView) => string) {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = keyFn(r) || "Unknown";
    m.set(k, (m.get(k) || 0) + 1);
  });

  return Array.from(m.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function AnalysisCard({ title, rows, total }: { title: string; rows: { label: string; value: number }[]; total: number }) {
  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{rows.reduce((s, r) => s + r.value, 0)}</strong>

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

.ba-page {
  --ease: cubic-bezier(.2,.8,.2,1);
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(40px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 9%, transparent), transparent 30rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111827);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.ba-page *,
.ba-page *::before,
.ba-page *::after {
  box-sizing: border-box;
  min-width: 0;
}

.ba-page button,
.ba-page input,
.ba-page select,
.ba-page textarea {
  font: inherit;
  max-width: 100%;
}

.ba-page button {
  -webkit-tap-highlight-color: transparent;
}

.ba-page input,
.ba-page select,
.ba-page textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111827));
  outline: none;
  font-weight: 750;
}

.ba-page input:focus,
.ba-page select:focus,
.ba-page textarea:focus {
  border-color: color-mix(in srgb, var(--ba-primary) 52%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ba-primary) 12%, transparent);
}

.ba-state,
.ba-search-card,
.ba-summary-line,
.ba-card,
.ba-table-card,
.ba-analysis,
.ba-empty,
.ba-sheet,
.ba-modal,
.student-row {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.ba-state {
  min-height: min(420px, calc(100dvh - 32px));
  width: min(520px, 100%);
  margin: 0 auto;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 22px;
  border-radius: 28px;
  text-align: center;
}

.ba-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent);
  border-top-color: var(--ba-primary);
  animation: spin .8s linear infinite;
}

.ba-state h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ba-state p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-state-button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 16px;
  background: var(--ba-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.ba-toast {
  position: sticky;
  top: 8px;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 850;
  box-shadow: 0 18px 40px rgba(15,23,42,.12);
}

.ba-toast.success { background: rgba(34,197,94,.14); color: #166534; }
.ba-toast.error { background: rgba(239,68,68,.12); color: #991b1b; }
.ba-toast.info { background: rgba(59,130,246,.13); color: #1d4ed8; }

.ba-toast button {
  border: 0;
  background: transparent;
  color: currentColor;
  font-weight: 1000;
  cursor: pointer;
}

/* Compact search/action strip. The page intentionally has no duplicate title header. */
.ba-topbar,
.ba-title,
.ba-topbar-actions {
  display: none;
}

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

.ba-search span {
  color: var(--muted,#64748b);
  font-size: 17px;
  font-weight: 1000;
}

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

.ba-summary-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 20px;
}

.ba-summary-line div {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.ba-summary-line strong {
  font-size: 21px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ba-summary-line span,
.ba-summary-line p {
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 850;
}

.ba-summary-line p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-filter-chips {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding: 8px 1px 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.ba-filter-chips::-webkit-scrollbar {
  display: none;
}

.ba-filter-chips button {
  flex: 0 0 auto;
  min-height: 31px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ba-primary) 11%, transparent);
  color: var(--ba-primary);
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  cursor: pointer;
}

.ba-list {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.student-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 22px;
  text-align: left;
  cursor: pointer;
  transition: transform .16s var(--ease), box-shadow .16s var(--ease), border-color .16s var(--ease);
}

.student-row:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--ba-primary) 24%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 16px 34px rgba(15,23,42,.07);
}

.ba-avatar {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  color: #fff;
  font-size: 17px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
}

.student-main,
.student-main strong,
.student-main small,
.student-main em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-main strong {
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -.02em;
}

.student-main small {
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 850;
  font-style: normal;
}

.student-main em {
  margin-top: 3px;
  color: color-mix(in srgb, var(--muted,#64748b) 86%, var(--text,#111827));
  font-size: 11px;
  font-weight: 750;
  font-style: normal;
}

.student-side {
  display: grid;
  justify-items: end;
  gap: 6px;
  flex: 0 0 auto;
}

.student-side i {
  color: var(--muted,#64748b);
  font-style: normal;
  font-size: 18px;
  font-weight: 1000;
  line-height: 1;
}

.ba-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}

.ba-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.ba-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.ba-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.ba-chip.gray { background: color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color: var(--muted,#64748b); }
.ba-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.ba-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.status-dot-mini {
  width: 10px;
  height: 10px;
  display: inline-block;
  border-radius: 999px;
  background: var(--muted,#64748b);
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 10%, transparent);
}

.status-dot-mini.green { background: #22c55e; }
.status-dot-mini.red { background: #ef4444; }
.status-dot-mini.blue { background: #3b82f6; }
.status-dot-mini.orange { background: #f59e0b; }
.status-dot-mini.gray { background: var(--muted,#64748b); }

.status-sheet-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 8px;
}

.status-sheet-grid span {
  display: grid;
  gap: 5px;
  padding: 11px;
  border: 1px solid var(--border,rgba(0,0,0,.08));
  border-radius: 18px;
  background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent);
}

.status-sheet-grid b {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.status-sheet-grid em {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text,#111827);
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


.ba-sheet-backdrop,
.ba-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15,23,42,.50);
  backdrop-filter: blur(12px);
}

.ba-sheet {
  width: min(760px, 100%);
  max-height: min(88dvh, 760px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px 28px 22px 22px;
  box-shadow: 0 30px 90px rgba(15,23,42,.32);
  animation: sheetIn .18s var(--ease);
}

.ba-sheet.small {
  width: min(520px, 100%);
}

@keyframes sheetIn {
  from { transform: translateY(16px); opacity: .7; }
  to { transform: translateY(0); opacity: 1; }
}

.ba-sheet-head,
.ba-sheet-profile {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
}

.ba-sheet-head h2,
.ba-sheet-profile h2,
.ba-modal-head h2 {
  margin: 0;
  color: var(--text,#111827);
  font-size: 21px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ba-sheet-head p,
.ba-sheet-profile p,
.ba-modal-head p {
  margin: 5px 0 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  line-height: 1.5;
  font-weight: 750;
}

.ba-sheet-head button,
.ba-sheet-profile button,
.ba-modal-head button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-weight: 1000;
  cursor: pointer;
  flex: 0 0 auto;
}

.ba-sheet-actions,
.ba-modal-actions {
  position: sticky;
  bottom: -14px;
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding: 12px 0 2px;
  background: linear-gradient(to top, var(--card-bg,var(--surface,#fff)) 70%, transparent);
}

.ba-sheet-actions button,
.ba-modal-actions button {
  min-height: 42px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ba-sheet-actions button.primary,
.ba-modal-actions button:last-child {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent);
}

.ba-modal-actions button:disabled {
  opacity: .65;
  cursor: not-allowed;
}

.ba-menu-list {
  display: grid;
  gap: 8px;
}

.ba-menu-list button {
  width: 100%;
  display: grid;
  grid-template-columns: 42px minmax(0,1fr);
  column-gap: 10px;
  align-items: center;
  min-height: 58px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 18px;
  padding: 9px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  text-align: left;
  cursor: pointer;
}

.ba-menu-list button span {
  grid-row: span 2;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ba-primary) 10%, transparent);
  color: var(--ba-primary);
  font-weight: 1000;
}

.ba-menu-list button b,
.ba-menu-list button small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-menu-list button b {
  font-size: 13px;
  font-weight: 1000;
}

.ba-menu-list button small {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
}

.ba-menu-list button.active {
  border-color: color-mix(in srgb, var(--ba-primary) 34%, var(--border,rgba(0,0,0,.10)));
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--surface,#fff));
}

.ba-menu-list button.danger span {
  background: color-mix(in srgb, #dc2626 10%, transparent);
  color: #dc2626;
}

.ba-menu-list button.danger b {
  color: #991b1b;
}

.student-detail-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 7px;
  margin-bottom: 10px;
}

.student-detail-strip span {
  display: block;
  padding: 9px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted,#64748b) 8%, transparent);
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-detail-strip b {
  display: block;
  margin-bottom: 3px;
  color: var(--text,#111827);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .05em;
}

.ba-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.ba-form.two {
  grid-template-columns: minmax(0,1fr);
}

.ba-form.compact {
  gap: 9px;
}

.ba-form label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.ba-form span {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.ba-media-hint {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.4;
}

.ba-form .wide {
  grid-column: 1 / -1;
}

.ba-form-section {
  padding: 12px 0;
  border-top: 1px solid var(--border,rgba(0,0,0,.08));
}

.ba-form-section:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.ba-form-section h3 {
  margin: 0 0 10px;
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.ba-page input[type="file"] {
  padding: 10px;
  font-size: 12px;
}

.ba-page textarea {
  min-height: 92px;
  padding: 12px;
  resize: vertical;
  line-height: 1.55;
}


.ba-media-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.ba-media-button {
  width: auto;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ba-primary);
  border-radius: 999px;
  padding: 0 14px;
  background: var(--ba-primary);
  color: #fff !important;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0 !important;
  text-transform: none !important;
  cursor: pointer;
  box-shadow: 0 10px 22px color-mix(in srgb, var(--ba-primary) 18%, transparent);
}

.ba-media-button.secondary {
  background: var(--surface, #fff);
  color: var(--ba-primary) !important;
  box-shadow: none;
}

.ba-media-button input {
  display: none;
}

.ba-preview-photo {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 22px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
}

.ba-preview-banner {
  width: 100%;
  height: 130px;
  object-fit: cover;
  border-radius: 22px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
}

.ba-modal {
  width: min(980px, 100%);
  max-height: min(92dvh, 900px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px;
  box-shadow: 0 30px 90px rgba(15,23,42,.35);
}

.ba-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 2px 14px;
}

.ba-analysis-grid {
  display: grid;
  grid-template-columns: minmax(0,1fr);
  gap: 10px;
  margin-top: 10px;
}

.ba-analysis,
.ba-table-card,
.ba-empty {
  padding: 13px;
  border-radius: 24px;
}

.ba-analysis span {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.ba-analysis strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(22px,7vw,30px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
  overflow-wrap: anywhere;
}

.ba-analysis p {
  margin: 8px 0 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  line-height: 1.5;
}

.ba-analysis-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.ba-analysis-list section {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent);
}

.ba-analysis-list section > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.ba-analysis-list b,
.ba-analysis-list small {
  font-size: 12px;
}

.ba-analysis-list small {
  color: var(--muted,#64748b);
  font-weight: 850;
}

.ba-progress {
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb,var(--muted,#64748b) 18%,transparent);
  overflow: hidden;
}

.ba-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ba-primary);
}

.ba-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 220px;
  text-align: center;
  border-style: dashed;
}

.ba-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));
  font-size: 28px;
}

.ba-empty h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.ba-empty p {
  margin: 0;
  color: var(--muted,#64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-table-card {
  margin-top: 10px;
}

.ba-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border,rgba(0,0,0,.08));
}

.ba-table-scroll table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  background: var(--card-bg, var(--surface, var(--bg, transparent)));
}

.ba-table-scroll th,
.ba-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border,rgba(0,0,0,.08));
  vertical-align: top;
  text-align: left;
  font-size: 13px;
}

.ba-table-scroll th {
  background: var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface, var(--bg, transparent)))));
  color: var(--table-header-text, var(--muted, var(--text)));
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
}

.ba-table-scroll td strong,
.ba-table-scroll td span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-table-scroll td span {
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 11px;
}

.ba-table-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 7px;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.ba-table-actions::-webkit-scrollbar {
  display: none;
}

.ba-table-actions button {
  flex: 0 0 auto;
  min-height: 34px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 10px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
}

.ba-table-actions button:first-child {
  background: var(--ba-primary);
  color: #fff;
  border-color: var(--ba-primary);
}

.ba-delete,
.ba-table-actions button.ba-delete {
  color: #991b1b;
  background: color-mix(in srgb,#dc2626 7%,var(--surface,#fff));
  border-color: color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)));
}

.ba-empty-table {
  padding: 22px;
  text-align: center;
  color: var(--muted,#64748b);
  font-weight: 850;
}

@media (min-width: 680px) {
  .ba-page {
    padding: calc(12px * var(--local-density-scale,1));
    padding-bottom: 44px;
  }

  .ba-search-card {
    grid-template-columns: minmax(0,1fr) 48px 48px 48px;
  }

  .ba-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .student-row {
    border-radius: 24px;
    padding: 12px;
  }

  .ba-analysis-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .ba-form {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .ba-form.two {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .ba-modal-backdrop,
  .ba-sheet-backdrop {
    place-items: center;
    padding: 18px;
  }

  .ba-sheet {
    border-radius: 28px;
    padding: 18px;
  }

  .ba-modal {
    padding: 18px;
  }

}

@media (min-width: 1040px) {
  .ba-page {
    padding: calc(16px * var(--local-density-scale,1));
    padding-bottom: 48px;
  }

  .ba-search-card,
  .ba-summary-line,
  .ba-list,
  .ba-analysis-grid,
  .ba-table-card,
  .ba-filter-chips {
    max-width: 1180px;
    margin-left: auto;
    margin-right: auto;
  }

  .ba-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ba-analysis-grid {
    grid-template-columns: repeat(4, minmax(0,1fr));
  }

  .ba-current-filter {
    grid-column: span 2;
  }

  .ba-form {
    grid-template-columns: repeat(3, minmax(0,1fr));
  }

  .ba-form.two {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

}

@media (max-width: 520px) {
  .ba-page {
    padding: calc(7px * var(--local-density-scale,1));
    padding-bottom: max(38px, env(safe-area-inset-bottom));
  }

  .ba-title h1 {
    font-size: 28px;
  }

  .ba-icon-button,
  .ba-filter-button,
  .ba-add-inline {
    width: 40px;
    height: 40px;
  }

  .ba-summary-line {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .student-detail-strip {
    grid-template-columns: minmax(0,1fr);
  }

  .ba-sheet,
  .ba-modal {
    border-radius: 24px 24px 18px 18px;
    padding: 12px;
  }

  .ba-sheet-actions,
  .ba-modal-actions {
    display: grid;
    grid-template-columns: minmax(0,1fr);
  }

  .ba-sheet-actions button,
  .ba-modal-actions button {
    width: 100%;
  }
}


.ba-media-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.ba-media-button {
  min-height: 40px;
  border: 1px solid var(--ba-primary);
  border-radius: 999px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ba-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
  text-align: center;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--ba-primary) 18%, transparent);
}

.ba-media-button.secondary {
  background: var(--surface, #fff);
  color: var(--ba-primary);
  box-shadow: none;
}

.ba-media-hint {
  display: block;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.45;
}

.camera-backdrop {
  z-index: 100;
  place-items: center;
}

.ba-camera-modal {
  width: min(720px, 100%);
  max-height: min(92dvh, 880px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 30px 90px rgba(15,23,42,.35);
}

.ba-camera-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 24px;
  background: #020617;
  border: 1px solid var(--border, rgba(0,0,0,.10));
}

.ba-camera-preview video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background: #020617;
}

.ba-camera-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(2,6,23,.72);
  color: #fff;
  font-size: 13px;
  font-weight: 950;
}

.ba-camera-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.ba-camera-actions button {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ba-camera-secondary {
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: color-mix(in srgb, var(--muted, #64748b) 8%, var(--surface, #fff));
  color: var(--text, #111827);
}

.ba-camera-primary {
  border: 1px solid var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent);
}

.ba-camera-actions button:disabled {
  opacity: .62;
  cursor: not-allowed;
}

@media (max-width: 520px) {
  .ba-media-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ba-media-button,
  .ba-camera-actions button {
    width: 100%;
  }

  .ba-camera-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .ba-camera-modal {
    border-radius: 22px;
    padding: 11px;
  }
}

.curriculum-row .ba-avatar { width: 44px; height: 44px; border-radius: 16px; }
.curriculum-main { display: grid; gap: 2px; min-width: 0; }
.curriculum-main strong,
.curriculum-main small,
.curriculum-main em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.curriculum-main strong { color: var(--text,#111827); font-size: 14px; font-weight: 1000; letter-spacing: -.02em; }
.curriculum-main small { color: var(--muted,#64748b); font-size: 12px; font-weight: 850; font-style: normal; }
.curriculum-main em { color: var(--muted,#64748b); font-size: 11px; font-weight: 750; font-style: normal; }
.curriculum-side { display: inline-flex; align-items: center; gap: 8px; color: var(--muted,#64748b); }
.curriculum-side i { font-style: normal; font-weight: 1000; }
.ba-current-filter { min-height: 154px; }



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

`;
