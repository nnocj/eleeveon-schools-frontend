"use client";

/**
 * app/branch-admin/modules/SubjectPrerequisites.tsx
 * Eleeveon Subject Prerequisites V2.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this branch-admin curriculum module from accidentally using stale
 *   school/branch context left behind by another role or portal
 * - all reads and writes now use the resolved workspace schoolId and branchId
 *
 * Upgraded to the Students.tsx / AssessmentItems.tsx golden standard:
 * - compact search + inline add + slider filter + more menu
 * - filters and advanced views moved into sheets
 * - compact cards by default, table/summary from More
 * - createLocal/updateLocal/softDeleteLocal/listActiveLocal used where appropriate
 * - theme-safe ba-* CSS with dark-mode friendly variables
 *
 * Responsibility:
 * - create/edit/archive subjectPrerequisites only
 * - validate prerequisite/corequisite/recommended relationships
 * - keep relationships inside the same curriculum
 * - prevent self-prerequisite and duplicate rules
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
  type Subject,
  type SubjectPrerequisite,
} from "../../lib/db/db";

import {
  createLocal,
  updateLocal,
  softDeleteLocal,
  listActiveLocal,
} from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type RuleType = "prerequisite" | "corequisite" | "recommended";
type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type StatusFilter = "all" | "active" | "inactive";
type TypeFilter = "all" | RuleType;

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type PrerequisiteForm = {
  id?: string;
  curriculumSubjectId: string;
  prerequisiteSubjectId: string;
  minimumGrade: string;
  minimumScore: string;
  type: RuleType;
  groupCode: string;
  active: boolean;
};

type CurriculumSubjectOption = {
  id: string;
  row: CurriculumSubject;
  curriculumId: string;
  subjectId: string;
  pathwayId: string;
  label: string;
  shortLabel: string;
  curriculumName: string;
  subjectName: string;
  subjectCode: string;
  pathwayName: string;
};

type PrerequisiteViewRow = {
  id: string;
  row: SubjectPrerequisite;
  owner?: CurriculumSubjectOption;
  prerequisite?: CurriculumSubjectOption;
  ownerLabel: string;
  prerequisiteLabel: string;
  curriculumName: string;
  pathwayName: string;
  type: RuleType;
  typeLabel: string;
  minimumGrade: string;
  minimumScore: string;
  groupCode: string;
  active: boolean;
};

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

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

const emptyForm = (): PrerequisiteForm => ({
  curriculumSubjectId: "",
  prerequisiteSubjectId: "",
  minimumGrade: "",
  minimumScore: "",
  type: "prerequisite",
  groupCode: "",
  active: true,
});

const idOf = (value: any): string => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
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
    if (parsed && parsed !== "0") return parsed;
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
  new Intl.NumberFormat("en-GH", { maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );

function typeLabel(type?: string) {
  if (type === "corequisite") return "Corequisite";
  if (type === "recommended") return "Recommended";
  return "Prerequisite";
}

function typeIcon(type?: string) {
  if (type === "corequisite") return "🔄";
  if (type === "recommended") return "💡";
  return "🔐";
}

function typeTone(type?: string): "green" | "orange" | "purple" {
  if (type === "corequisite") return "purple";
  if (type === "recommended") return "orange";
  return "green";
}

function ruleShortText(row: PrerequisiteViewRow) {
  const parts = [
    row.typeLabel,
    row.minimumGrade ? `Grade ${row.minimumGrade}` : "",
    row.minimumScore ? `${row.minimumScore}%` : "",
    row.groupCode ? `Group ${row.groupCode}` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "No condition set";
}

function groupedCounts<T>(rows: T[], labeler: (row: T) => string) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const label = labeler(row) || "Unknown";
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
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

export default function SubjectPrerequisites() {
  const dataRevision = useDataRevision();

  const router = useRouter();
  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount() as any;
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
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [curriculumFilter, setCurriculumFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");

  const [rules, setRules] = useState<SubjectPrerequisite[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<
    CurriculumSubject[]
  >([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<PrerequisiteViewRow | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PrerequisiteForm>(emptyForm());
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
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
    setRules([]);
    setCurriculumSubjects([]);
    setCurriculums([]);
    setSubjects([]);
    setPathways([]);
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
        ruleRows,
        curriculumSubjectRows,
        curriculumRows,
        subjectRows,
        pathwayRows,
      ] = await Promise.all([
        tableSafe("subjectPrerequisites")?.toArray?.() || [],
        listActiveLocal("curriculumSubjects", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("curriculums", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("subjects", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
        listActiveLocal("curriculumPathways", {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
        } as any),
      ]);

      setRules(
        (ruleRows as SubjectPrerequisite[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort(
            (a: any, b: any) =>
              String(a.curriculumSubjectId || "").localeCompare(
                String(b.curriculumSubjectId || ""),
              ) || String(a.type || "").localeCompare(String(b.type || "")),
          ),
      );

      setCurriculumSubjects(
        (curriculumSubjectRows as CurriculumSubject[]).sort(
          (a: any, b: any) => {
            const byCurriculum = String(a.curriculumId || "").localeCompare(
              String(b.curriculumId || ""),
            );
            return (
              byCurriculum ||
              Number(a.orderIndex || 0) - Number(b.orderIndex || 0)
            );
          },
        ),
      );
      setCurriculums(
        (curriculumRows as Curriculum[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
      setSubjects(
        (subjectRows as Subject[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
      setPathways(
        (pathwayRows as CurriculumPathway[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
    } catch (error) {
      console.error("Failed to load subject prerequisites:", error);
      clearData();
      showToast("error", "Failed to load subject prerequisite rules.");
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

  const curriculumMap = useMemo(
    () => new Map(curriculums.map((row: any) => [idOf(row.id), row])),
    [curriculums],
  );
  const subjectMap = useMemo(
    () => new Map(subjects.map((row: any) => [idOf(row.id), row])),
    [subjects],
  );
  const pathwayMap = useMemo(
    () => new Map(pathways.map((row: any) => [idOf(row.id), row])),
    [pathways],
  );

  const curriculumSubjectOptions = useMemo<CurriculumSubjectOption[]>(() => {
    return curriculumSubjects
      .map((row: any) => {
        const id = idOf(row.id);
        if (!id) return undefined;
        const curriculum = curriculumMap.get(idOf(row.curriculumId)) as any;
        const subject = subjectMap.get(idOf(row.subjectId)) as any;
        const pathway = pathwayMap.get(idOf(row.pathwayId)) as any;
        const curriculumName = curriculum?.name || "Unknown curriculum";
        const subjectName = subject?.name || "Unknown subject";
        const subjectCode = subject?.code || "";
        const pathwayName = pathway?.name || "No pathway";
        return {
          id,
          row,
          curriculumId: idOf(row.curriculumId),
          subjectId: idOf(row.subjectId),
          pathwayId: idOf(row.pathwayId),
          curriculumName,
          subjectName,
          subjectCode,
          pathwayName,
          shortLabel: `${subjectName}${subjectCode ? ` (${subjectCode})` : ""}`,
          label: `${curriculumName} · ${subjectName}${subjectCode ? ` (${subjectCode})` : ""} · ${pathwayName}`,
        };
      })
      .filter(Boolean) as CurriculumSubjectOption[];
  }, [curriculumSubjects, curriculumMap, pathwayMap, subjectMap]);

  const curriculumSubjectMap = useMemo(
    () => new Map(curriculumSubjectOptions.map((row) => [row.id, row])),
    [curriculumSubjectOptions],
  );

  const selectedOwnerOption = useMemo(() => {
    const ownerId = idOf(form.curriculumSubjectId);
    return ownerId ? curriculumSubjectMap.get(ownerId) : undefined;
  }, [curriculumSubjectMap, form.curriculumSubjectId]);

  const prerequisiteOptions = useMemo(() => {
    if (!selectedOwnerOption) return curriculumSubjectOptions;
    return curriculumSubjectOptions.filter(
      (option) =>
        !sameId(option.id, selectedOwnerOption.id) &&
        sameId(option.curriculumId, selectedOwnerOption.curriculumId),
    );
  }, [curriculumSubjectOptions, selectedOwnerOption]);

  const groupCodes = useMemo(
    () =>
      Array.from(
        new Set(
          rules
            .map((row: any) => String(row.groupCode || "").trim())
            .filter(Boolean),
        ),
      ).sort(),
    [rules],
  );

  const viewRows = useMemo<PrerequisiteViewRow[]>(() => {
    return rules.map((row: any) => {
      const id = idOf(row.id);
      const owner = curriculumSubjectMap.get(idOf(row.curriculumSubjectId));
      const prerequisite = curriculumSubjectMap.get(
        idOf(row.prerequisiteSubjectId),
      );
      const type = (row.type || "prerequisite") as RuleType;
      return {
        id,
        row,
        owner,
        prerequisite,
        ownerLabel:
          owner?.shortLabel || `Curriculum Subject #${row.curriculumSubjectId}`,
        prerequisiteLabel:
          prerequisite?.shortLabel ||
          `Curriculum Subject #${row.prerequisiteSubjectId}`,
        curriculumName: owner?.curriculumName || "Unknown curriculum",
        pathwayName: owner?.pathwayName || "No pathway",
        type,
        typeLabel: typeLabel(type),
        minimumGrade: row.minimumGrade || "",
        minimumScore: row.minimumScore == null ? "" : String(row.minimumScore),
        groupCode: row.groupCode || "",
        active: isActiveRow(row),
      };
    });
  }, [curriculumSubjectMap, rules]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return viewRows.filter((rule) => {
      const haystack = [
        rule.ownerLabel,
        rule.prerequisiteLabel,
        rule.curriculumName,
        rule.pathwayName,
        rule.typeLabel,
        rule.minimumGrade,
        rule.minimumScore,
        rule.groupCode,
      ]
        .join(" ")
        .toLowerCase();
      const searchOk = !term || haystack.includes(term);
      const statusOk =
        statusFilter === "all" ||
        (statusFilter === "active" ? rule.active : !rule.active);
      const typeOk = typeFilter === "all" || rule.type === typeFilter;
      const curriculumOk =
        curriculumFilter === "all" ||
        sameId(rule.owner?.curriculumId, curriculumFilter);
      const groupOk = groupFilter === "all" || rule.groupCode === groupFilter;
      return searchOk && statusOk && typeOk && curriculumOk && groupOk;
    });
  }, [
    curriculumFilter,
    groupFilter,
    search,
    statusFilter,
    typeFilter,
    viewRows,
  ]);

  const activeRules = viewRows.filter((rule) => rule.active);
  const archivedRules = viewRows.length - activeRules.length;
  const prerequisiteRules = viewRows.filter(
    (rule) => rule.type === "prerequisite",
  ).length;
  const corequisiteRules = viewRows.filter(
    (rule) => rule.type === "corequisite",
  ).length;
  const recommendedRules = viewRows.filter(
    (rule) => rule.type === "recommended",
  ).length;
  const groupedRules = viewRows.filter((rule) => !!rule.groupCode).length;

  const activeFilterCount = useMemo(
    () =>
      [curriculumFilter, typeFilter, statusFilter, groupFilter].filter(
        (value) => value !== "all",
      ).length,
    [curriculumFilter, groupFilter, statusFilter, typeFilter],
  );
  const countsByCurriculum = useMemo(
    () => groupedCounts(viewRows, (row) => row.curriculumName),
    [viewRows],
  );
  const countsByType = useMemo(
    () => groupedCounts(viewRows, (row) => row.typeLabel),
    [viewRows],
  );
  const countsByStatus = useMemo(
    () =>
      groupedCounts(viewRows, (row) => (row.active ? "Active" : "Inactive")),
    [viewRows],
  );
  const countsByGroup = useMemo(
    () =>
      groupedCounts(
        viewRows.filter((row) => !!row.groupCode),
        (row) => row.groupCode,
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
    setCurriculumFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
    setGroupFilter("all");
  };

  const updateForm = (patch: Partial<PrerequisiteForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const openCreate = () => {
    if (!requireTenant()) return;
    const firstOption = curriculumSubjectOptions[0];
    setSelectedRule(null);
    setForm({
      ...emptyForm(),
      curriculumSubjectId: firstOption ? String(firstOption.id) : "",
      prerequisiteSubjectId: "",
    });
    setModalOpen(true);
  };

  const openEdit = (row: PrerequisiteViewRow | SubjectPrerequisite) => {
    const item: any = "row" in row ? row.row : row;
    setSelectedRule(null);
    setForm({
      id: idOf(item.id),
      curriculumSubjectId: String(item.curriculumSubjectId || ""),
      prerequisiteSubjectId: String(item.prerequisiteSubjectId || ""),
      minimumGrade: item.minimumGrade || "",
      minimumScore: item.minimumScore == null ? "" : String(item.minimumScore),
      type: (item.type || "prerequisite") as RuleType,
      groupCode: item.groupCode || "",
      active: isActiveRow(item),
    });
    setModalOpen(true);
  };

  const validate = () => {
    if (!form.curriculumSubjectId)
      return "Select the subject being controlled.";
    if (!form.prerequisiteSubjectId)
      return "Select the required or related subject.";
    const ownerId = idOf(form.curriculumSubjectId);
    const requiredId = idOf(form.prerequisiteSubjectId);
    if (!ownerId || !requiredId) return "Select valid curriculum subjects.";
    if (ownerId === requiredId) return "A subject cannot require itself.";
    const owner = curriculumSubjectMap.get(ownerId);
    const required = curriculumSubjectMap.get(requiredId);
    if (!owner)
      return "The controlled subject is not available in this branch.";
    if (!required)
      return "The required subject is not available in this branch.";
    if (!sameId(owner.curriculumId, required.curriculumId))
      return "Subject prerequisite rules must stay inside the same curriculum.";
    if (form.minimumScore.trim()) {
      const parsed = Number(form.minimumScore);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)
        return "Minimum score must be between 0 and 100.";
    }
    const duplicate = rules.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      return (
        sameId(row.curriculumSubjectId, ownerId) &&
        sameId(row.prerequisiteSubjectId, requiredId) &&
        safeLower(row.type || "prerequisite") ===
          safeLower(form.type || "prerequisite") &&
        !row.isDeleted
      );
    });
    if (duplicate) return "This subject relationship already exists.";
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
        ? rules.find((row: any) => sameId(row.id, form.id))
        : undefined;
      const payload: Partial<SubjectPrerequisite> = {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        curriculumSubjectId: idOf(form.curriculumSubjectId),
        prerequisiteSubjectId: idOf(form.prerequisiteSubjectId),
        minimumGrade: form.minimumGrade.trim() || undefined,
        minimumScore:
          form.minimumScore.trim() === ""
            ? undefined
            : Number(form.minimumScore),
        type: form.type || "prerequisite",
        groupCode: form.groupCode.trim() || undefined,
        active: form.active,
        isDeleted: false,
      } as Partial<SubjectPrerequisite>;
      if (form.id && existing)
        await updateLocal("subjectPrerequisites", String(form.id), payload);
      else
        await createLocal(
          "subjectPrerequisites",
          payload as SubjectPrerequisite,
        );
      setModalOpen(false);
      showToast(
        "success",
        form.id
          ? "Subject prerequisite updated."
          : "Subject prerequisite created.",
      );
      await load();
    } catch (error) {
      console.error("Failed to save subject prerequisite:", error);
      showToast("error", "Failed to save subject prerequisite.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (row: PrerequisiteViewRow) => {
    const confirmed = window.confirm(
      `Archive this ${row.typeLabel.toLowerCase()} rule?\n\n${row.ownerLabel} → ${row.prerequisiteLabel}`,
    );
    if (!confirmed) return;
    await softDeleteLocal("subjectPrerequisites", row.id);
    setSelectedRule(null);
    showToast("success", "Subject prerequisite archived.");
    await load();
  };

  const duplicateRule = async (row: PrerequisiteViewRow) => {
    if (!requireTenant()) return;
    try {
      await createLocal("subjectPrerequisites", {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
        curriculumSubjectId: idOf(row.row.curriculumSubjectId),
        prerequisiteSubjectId: idOf(row.row.prerequisiteSubjectId),
        minimumGrade: row.row.minimumGrade,
        minimumScore: row.row.minimumScore,
        type: row.row.type || "prerequisite",
        groupCode: row.row.groupCode ? `${row.row.groupCode} Copy` : undefined,
        active: false,
        isDeleted: false,
      } as SubjectPrerequisite);
      setSelectedRule(null);
      showToast("success", "Rule duplicated as inactive.");
      await load();
    } catch (error) {
      console.error("Failed to duplicate subject prerequisite:", error);
      showToast("error", "Failed to duplicate rule.");
    }
  };

  const toggleActive = async (row: PrerequisiteViewRow) => {
    await updateLocal("subjectPrerequisites", row.id, {
      active: !row.active,
      isDeleted: false,
    } as Partial<SubjectPrerequisite>);
    setSelectedRule(null);
    showToast("success", row.active ? "Rule deactivated." : "Rule activated.");
    await load();
  };

  if (loading || accountLoading || settingsLoading || contextLoading)
    return (
      <State
        primary={primary}
        title="Opening Subject Prerequisites..."
        text="Checking curriculums, curriculum subjects, pathways and prerequisite rules."
      />
    );
  if (!authenticated || !accountId)
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing subject prerequisites."
      />
    );

  if (!schoolId || !branchId) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>Subject prerequisite rules belong to one active school branch.</p>
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
        aria-label="Subject prerequisite search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subject prerequisites..."
            aria-label="Search subject prerequisites"
          />
        </label>
        <button
          type="button"
          className="ba-add-inline"
          onClick={openCreate}
          aria-label="Add subject prerequisite"
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

      {!curriculumSubjectOptions.length && (
        <section className="ba-warning">
          Add curriculum subjects first. Prerequisite rules must connect
          subjects that already exist inside a curriculum.
        </section>
      )}

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {curriculumFilter !== "all" && (
            <button type="button" onClick={() => setCurriculumFilter("all")}>
              Curriculum:{" "}
              {(curriculumMap.get(idOf(curriculumFilter)) as any)?.name ||
                curriculumFilter}{" "}
              ×
            </button>
          )}
          {typeFilter !== "all" && (
            <button type="button" onClick={() => setTypeFilter("all")}>
              Type: {typeLabel(typeFilter)} ×
            </button>
          )}
          {statusFilter !== "all" && (
            <button type="button" onClick={() => setStatusFilter("all")}>
              Status: {statusFilter === "active" ? "Active" : "Inactive"} ×
            </button>
          )}
          {groupFilter !== "all" && (
            <button type="button" onClick={() => setGroupFilter("all")}>
              Group: {groupFilter} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid">
          <AnalysisCard
            title="Rules by Curriculum"
            rows={countsByCurriculum}
            total={viewRows.length}
          />
          <AnalysisCard
            title="Rules by Type"
            rows={countsByType}
            total={viewRows.length}
          />
          <AnalysisCard
            title="Rules by Status"
            rows={countsByStatus}
            total={viewRows.length}
          />
          <AnalysisCard
            title="Grouped Rules"
            rows={countsByGroup}
            total={groupedRules}
          />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{filteredRows.length}</strong>
            <p>
              {activeRules.length} active · {archivedRules} inactive ·{" "}
              {prerequisiteRules} prerequisites · {corequisiteRules}{" "}
              corequisites · {recommendedRules} recommended.
            </p>
          </article>
        </section>
      )}
      {viewMode === "table" && (
        <TableView
          rows={filteredRows}
          openEdit={openEdit}
          duplicateRule={duplicateRule}
          archive={archive}
          toggleActive={toggleActive}
        />
      )}
      {viewMode === "cards" && (
        <section className="ba-list prerequisite-list">
          {filteredRows.map((rule) => (
            <RuleListRow
              key={String(rule.id)}
              rule={rule}
              onOpen={() => setSelectedRule(rule)}
            />
          ))}
          {!filteredRows.length && (
            <Empty
              icon="🔗"
              title="No prerequisite rules found"
              text="Create rules that connect subjects as prerequisites, corequisites or recommended preparation."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          curriculums={curriculums}
          groupCodes={groupCodes}
          curriculumFilter={curriculumFilter}
          typeFilter={typeFilter}
          statusFilter={statusFilter}
          groupFilter={groupFilter}
          setCurriculumFilter={setCurriculumFilter}
          setTypeFilter={setTypeFilter}
          setStatusFilter={setStatusFilter}
          setGroupFilter={setGroupFilter}
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
      {selectedRule && (
        <ActionSheet
          rule={selectedRule}
          openEdit={openEdit}
          duplicateRule={duplicateRule}
          archive={archive}
          toggleActive={toggleActive}
          onClose={() => setSelectedRule(null)}
        />
      )}
      {modalOpen && (
        <RuleModal
          form={form}
          saving={saving}
          curriculumSubjectOptions={curriculumSubjectOptions}
          prerequisiteOptions={prerequisiteOptions}
          selectedOwnerOption={selectedOwnerOption}
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
  rule,
  onOpen,
}: {
  rule: PrerequisiteViewRow;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="student-row prerequisite-row"
      onClick={onOpen}
    >
      <span className={`prerequisite-icon ${rule.type}`}>
        {typeIcon(rule.type)}
      </span>
      <span className="student-main">
        <strong>{rule.ownerLabel}</strong>
        <small>
          {rule.typeLabel}: {rule.prerequisiteLabel}
        </small>
        <em>
          {rule.curriculumName} · {rule.pathwayName} · {ruleShortText(rule)}
        </em>
      </span>
      <span className="student-side">
        <span
          className={`status-dot-mini ${rule.active ? "green" : "gray"}`}
          title={rule.active ? "Active" : "Inactive"}
          aria-label={rule.active ? "Active" : "Inactive"}
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

function FilterSheet(props: {
  curriculums: Curriculum[];
  groupCodes: string[];
  curriculumFilter: string;
  typeFilter: TypeFilter;
  statusFilter: StatusFilter;
  groupFilter: string;
  setCurriculumFilter: (value: string) => void;
  setTypeFilter: (value: TypeFilter) => void;
  setStatusFilter: (value: StatusFilter) => void;
  setGroupFilter: (value: string) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>
              Filter subject prerequisite rules by curriculum, type, status and
              group.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close filters"
          >
            ✕
          </button>
        </div>
        <div className="ba-form compact">
          <label>
            <span>Curriculum</span>
            <select
              value={props.curriculumFilter}
              onChange={(event) =>
                props.setCurriculumFilter(event.target.value)
              }
            >
              <option value="all">All curriculums</option>
              {props.curriculums.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Rule Type</span>
            <select
              value={props.typeFilter}
              onChange={(event) =>
                props.setTypeFilter(event.target.value as TypeFilter)
              }
            >
              <option value="all">All rule types</option>
              <option value="prerequisite">Prerequisite</option>
              <option value="corequisite">Corequisite</option>
              <option value="recommended">Recommended</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={props.statusFilter}
              onChange={(event) =>
                props.setStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive / Archived</option>
            </select>
          </label>
          <label>
            <span>Group Code</span>
            <select
              value={props.groupFilter}
              onChange={(event) => props.setGroupFilter(event.target.value)}
            >
              <option value="all">All groups</option>
              {props.groupCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="ba-sheet-actions">
          <button type="button" onClick={props.clearFilters}>
            Clear
          </button>
          <button type="button" className="primary" onClick={props.onClose}>
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
            <small>Compact prerequisite rule cards</small>
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
            <small>Curriculum, type, status and group summaries</small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch rules</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function ActionSheet({
  rule,
  openEdit,
  duplicateRule,
  archive,
  toggleActive,
  onClose,
}: {
  rule: PrerequisiteViewRow;
  openEdit: (row: PrerequisiteViewRow | SubjectPrerequisite) => void;
  duplicateRule: (row: PrerequisiteViewRow) => void | Promise<void>;
  archive: (row: PrerequisiteViewRow) => void | Promise<void>;
  toggleActive: (row: PrerequisiteViewRow) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{rule.ownerLabel}</h2>
            <p>
              {rule.typeLabel}: {rule.prerequisiteLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rule actions"
          >
            ✕
          </button>
        </div>
        <div className="student-detail-strip">
          <span>
            <b>Type</b>
            {rule.typeLabel}
          </span>
          <span>
            <b>Grade</b>
            {rule.minimumGrade || "—"}
          </span>
          <span>
            <b>Score</b>
            {rule.minimumScore || "—"}
          </span>
        </div>
        <div className="ba-menu-list">
          <button type="button" onClick={() => openEdit(rule)}>
            <span>✎</span>
            <b>Edit rule</b>
            <small>Update subject relationship, type and conditions</small>
          </button>
          <button type="button" onClick={() => toggleActive(rule)}>
            <span>{rule.active ? "⏸" : "▶"}</span>
            <b>{rule.active ? "Deactivate" : "Activate"}</b>
            <small>
              {rule.active
                ? "Keep rule but stop applying it"
                : "Make rule available again"}
            </small>
          </button>
          <button type="button" onClick={() => duplicateRule(rule)}>
            <span>⧉</span>
            <b>Duplicate rule</b>
            <small>Create an inactive copy for adjustment</small>
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => archive(rule)}
          >
            <span>⌫</span>
            <b>Archive</b>
            <small>Soft delete this prerequisite rule locally</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function TableView({
  rows,
  openEdit,
  duplicateRule,
  archive,
  toggleActive,
}: {
  rows: PrerequisiteViewRow[];
  openEdit: (row: PrerequisiteViewRow | SubjectPrerequisite) => void;
  duplicateRule: (row: PrerequisiteViewRow) => void | Promise<void>;
  archive: (row: PrerequisiteViewRow) => void | Promise<void>;
  toggleActive: (row: PrerequisiteViewRow) => void | Promise<void>;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rules ({rows.length})</th>
              <th>Requires / Related</th>
              <th>Curriculum</th>
              <th>Pathway</th>
              <th>Type</th>
              <th>Minimum</th>
              <th>Group</th>
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
                    <strong>{rule.ownerLabel}</strong>
                    <span>Controlled subject</span>
                  </td>
                  <td>
                    {rule.prerequisiteLabel}
                    <span>Required / related subject</span>
                  </td>
                  <td>{rule.curriculumName}</td>
                  <td>{rule.pathwayName}</td>
                  <td>
                    <Chip tone={typeTone(rule.type)}>{rule.typeLabel}</Chip>
                  </td>
                  <td>
                    {rule.minimumGrade || rule.minimumScore ? (
                      <span>
                        {rule.minimumGrade || "—"} · {rule.minimumScore || "—"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{rule.groupCode || "—"}</td>
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
                      <button type="button" onClick={() => toggleActive(rule)}>
                        {rule.active ? "Deactivate" : "Activate"}
                      </button>
                      <button type="button" onClick={() => duplicateRule(rule)}>
                        Duplicate
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
            No subject prerequisite rule matches your filters.
          </div>
        )}
      </div>
    </section>
  );
}

function RuleModal(props: {
  form: PrerequisiteForm;
  saving: boolean;
  curriculumSubjectOptions: CurriculumSubjectOption[];
  prerequisiteOptions: CurriculumSubjectOption[];
  selectedOwnerOption?: CurriculumSubjectOption;
  updateForm: (patch: Partial<PrerequisiteForm>) => void;
  setModalOpen: (open: boolean) => void;
  save: (event?: React.FormEvent) => void | Promise<void>;
}) {
  const selectedType = props.form.type || "prerequisite";
  return (
    <div className="ba-modal-backdrop" role="dialog" aria-modal="true">
      <section className="ba-modal">
        <div className="ba-sheet-head">
          <div>
            <h2>{props.form.id ? "Edit Subject Rule" : "Add Subject Rule"}</h2>
            <p>
              Define prerequisite, corequisite or recommended subject
              relationships.
            </p>
          </div>
          <button
            type="button"
            onClick={() => props.setModalOpen(false)}
            aria-label="Close form"
          >
            ✕
          </button>
        </div>
        <form className="ba-form compact" onSubmit={props.save}>
          <label>
            <span>Subject being controlled</span>
            <select
              value={props.form.curriculumSubjectId}
              onChange={(event) =>
                props.updateForm({
                  curriculumSubjectId: event.target.value,
                  prerequisiteSubjectId: "",
                })
              }
              required
            >
              <option value="">Select curriculum subject</option>
              {props.curriculumSubjectOptions.map((option) => (
                <option key={String(option.id)} value={String(option.id)}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Required / related subject</span>
            <select
              value={props.form.prerequisiteSubjectId}
              onChange={(event) =>
                props.updateForm({ prerequisiteSubjectId: event.target.value })
              }
              required
            >
              <option value="">Select required subject</option>
              {props.prerequisiteOptions.map((option) => (
                <option key={String(option.id)} value={String(option.id)}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Rule type</span>
            <select
              value={selectedType}
              onChange={(event) =>
                props.updateForm({ type: event.target.value as RuleType })
              }
            >
              <option value="prerequisite">Prerequisite</option>
              <option value="corequisite">Corequisite</option>
              <option value="recommended">Recommended</option>
            </select>
          </label>
          <label>
            <span>Group code</span>
            <input
              value={props.form.groupCode}
              onChange={(event) =>
                props.updateForm({ groupCode: event.target.value })
              }
              placeholder="Optional e.g. ALT-A"
            />
          </label>
          <label>
            <span>Minimum grade</span>
            <input
              value={props.form.minimumGrade}
              onChange={(event) =>
                props.updateForm({ minimumGrade: event.target.value })
              }
              placeholder="e.g. C6, B3, Pass"
            />
          </label>
          <label>
            <span>Minimum score</span>
            <input
              type="number"
              value={props.form.minimumScore}
              onChange={(event) =>
                props.updateForm({ minimumScore: event.target.value })
              }
              placeholder="e.g. 50"
              min="0"
              max="100"
            />
          </label>
          {props.selectedOwnerOption && (
            <section className="ba-form-note">
              <strong>Curriculum locked:</strong> related subjects are limited
              to {props.selectedOwnerOption.curriculumName}.
            </section>
          )}
          <label className="ba-check">
            <input
              type="checkbox"
              checked={props.form.active}
              onChange={(event) =>
                props.updateForm({ active: event.target.checked })
              }
            />
            <span>Active rule</span>
          </label>
          <div className="ba-modal-actions">
            <button type="button" onClick={() => props.setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={props.saving}>
              {props.saving
                ? "Saving..."
                : props.form.id
                  ? "Save Changes"
                  : "Create Rule"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AnalysisCard({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; count: number }[];
  total: number;
}) {
  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{numberText(total)}</strong>
      <div className="ba-analysis-bars">
        {rows.slice(0, 6).map((row) => {
          const percent = total ? Math.round((row.count / total) * 100) : 0;
          return (
            <div key={row.label} className="ba-analysis-row">
              <p>
                <b>{row.label}</b>
                <em>{row.count}</em>
              </p>
              <div className="ba-bar">
                <i style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
        {!rows.length && <p className="ba-analysis-empty">No data yet.</p>}
      </div>
    </article>
  );
}

const css = `
@keyframes baSpin{to{transform:rotate(360deg)}}
.ba-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select{font:inherit;max-width:100%}.ba-page button{-webkit-tap-highlight-color:transparent}.ba-page input,.ba-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ba-page input:focus,.ba-page select:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}.ba-state,.ba-search-card,.ba-warning,.student-row,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet,.ba-modal{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:baSpin .8s linear infinite}.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer;box-shadow:0 14px 32px color-mix(in srgb,var(--ba-primary) 25%,transparent)}.ba-toast{position:sticky;top:8px;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:10px;max-width:1180px;margin:0 auto 8px;padding:10px 12px;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.10));background:var(--card-bg,var(--surface,#fff));box-shadow:0 16px 36px rgba(15,23,42,.08);font-size:12px;font-weight:900}.ba-toast.success{color:#16a34a}.ba-toast.error{color:#dc2626}.ba-toast.info{color:var(--ba-primary)}.ba-toast button{width:28px;height:28px;border:0;border-radius:999px;background:color-mix(in srgb,currentColor 10%,transparent);color:currentColor;font-weight:1000;cursor:pointer}.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) 42px 42px 42px;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ba-add-inline{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:20px;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ba-warning{margin-top:8px;padding:10px 12px;border-radius:18px;background:rgba(245,158,11,.12);color:#92400e;border-color:rgba(245,158,11,.22);font-size:12px;font-weight:800;line-height:1.5}.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ba-list{display:grid;gap:8px;margin-top:10px}.student-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease);color:var(--text,#111827)}.student-row:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 24%,var(--border,rgba(0,0,0,.10)));box-shadow:0 16px 34px rgba(15,23,42,.07)}.prerequisite-icon{width:48px;height:48px;border-radius:18px;display:grid;place-items:center;background:color-mix(in srgb,var(--ba-primary) 10%,var(--surface,#fff));color:var(--ba-primary);font-size:20px;font-weight:1000;box-shadow:0 12px 24px rgba(15,23,42,.08)}.prerequisite-icon.corequisite{background:rgba(147,51,234,.12);color:#7e22ce}.prerequisite-icon.recommended{background:rgba(245,158,11,.14);color:#b45309}.student-main,.student-main strong,.student-main small,.student-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.student-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.student-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.student-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.student-side{display:grid;justify-items:end;gap:5px}.student-side i{font-style:normal;font-weight:1000;color:var(--muted,#64748b)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex}.status-dot-mini.green{background:#22c55e}.status-dot-mini.gray{background:var(--muted,#64748b)}.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ba-table-card{margin-top:10px;border-radius:24px;overflow:hidden}.ba-table-scroll{width:100%;overflow:auto}table{width:100%;border-collapse:separate;border-spacing:0;min-width:980px}th,td{padding:12px;text-align:left;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:middle}th{position:sticky;top:0;z-index:1;background:var(--table-header-bg,color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff)));color:var(--table-header-text,var(--text,#111827));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}td{font-size:13px;color:var(--text,#111827)}td strong,td span{display:block}.ba-table-actions{display:flex;align-items:center;gap:6px;white-space:nowrap}.ba-table-actions button{min-height:32px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 10px;background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;font-weight:900;cursor:pointer}.ba-table-actions .ba-delete{border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.08);color:#dc2626}.ba-empty-table{padding:18px;text-align:center;color:var(--muted,#64748b);font-size:13px;font-weight:800}.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ba-analysis{padding:12px;border-radius:22px}.ba-analysis>span{display:block;color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis>strong{display:block;margin-top:6px;font-size:28px;font-weight:1000;letter-spacing:-.06em}.ba-analysis>p{margin:6px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:800;line-height:1.5}.ba-analysis-bars{display:grid;gap:8px;margin-top:10px}.ba-analysis-row p{display:flex;justify-content:space-between;gap:10px;margin:0 0 4px}.ba-analysis-row b,.ba-analysis-row em{font-size:11px;font-weight:900;font-style:normal}.ba-bar{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);overflow:hidden}.ba-bar i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}.ba-analysis-empty{margin:0;color:var(--muted,#64748b);font-size:12px}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:210px;margin-top:10px;padding:22px;border-radius:24px;border-style:dashed;text-align:center}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-sheet-backdrop,.ba-modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.ba-sheet,.ba-modal{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.ba-sheet.small{width:min(520px,100%)}.ba-modal{width:min(680px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.ba-sheet-head,.ba-sheet-profile{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.ba-sheet-head h2,.ba-sheet-profile h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.ba-sheet-head p,.ba-sheet-profile p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.ba-sheet-head button,.ba-sheet-profile button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.ba-form.compact{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.ba-form label{display:grid;gap:6px;min-width:0}.ba-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ba-form-note{padding:10px 12px;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 9%,transparent);border:1px solid color-mix(in srgb,var(--ba-primary) 16%,transparent);font-size:12px;line-height:1.5;color:var(--text,#111827)}.ba-check{display:flex!important;align-items:center!important;gap:9px!important;min-height:44px;padding:10px 12px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 6%,transparent)}.ba-check input{width:auto;min-height:auto}.ba-check span{text-transform:none!important;letter-spacing:0!important;font-size:12px!important;color:var(--text,#111827)!important}.ba-sheet-actions,.ba-modal-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.ba-modal-actions button,.ba-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ba-modal-actions button.primary,.ba-sheet-actions button.primary{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ba-primary) 25%,transparent)}.ba-modal-actions button:disabled{opacity:.65;cursor:not-allowed}.student-detail-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}.student-detail-strip span{display:grid;gap:4px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.student-detail-strip b{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.ba-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list button b,.ba-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-menu-list button b{font-size:13px;font-weight:1000}.ba-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ba-menu-list button.active{border-color:color-mix(in srgb,var(--ba-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ba-primary) 8%,var(--surface,#fff))}.ba-menu-list button.danger span{background:rgba(239,68,68,.10);color:#dc2626}.ba-menu-list button.danger b{color:#dc2626}@media (min-width:680px){.ba-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.ba-search-card{grid-template-columns:minmax(0,1fr) 48px 48px 48px}.ba-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-sheet-backdrop,.ba-modal-backdrop{place-items:center;padding:18px}.ba-sheet,.ba-modal{border-radius:28px;padding:18px}.ba-form.compact{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form-note,.ba-check,.ba-modal-actions{grid-column:1/-1}}@media (min-width:1040px){.ba-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.ba-search-card,.ba-list,.ba-table-card,.ba-analysis-grid,.ba-filter-chips,.ba-warning{max-width:1180px;margin-left:auto;margin-right:auto}.ba-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ba-current-filter{grid-column:span 2}}@media (max-width:520px){.ba-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.ba-search-card{grid-template-columns:minmax(0,1fr) 40px 40px 40px;gap:6px;padding:6px;border-radius:22px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:40px;height:40px}.student-detail-strip{grid-template-columns:1fr}.ba-sheet-actions,.ba-modal-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ba-sheet-actions button,.ba-modal-actions button{width:100%}}
`;
