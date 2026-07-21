"use client";

/**
 * app/branch-admin/modules/CurriculumSubjects.tsx
 * --------------------------------------------------------------------------
 * ELEEVEON CURRICULUM SUBJECTS V1
 * --------------------------------------------------------------------------
 * Golden Standard Module
 *
 * Purpose:
 * - Attach subjects to curriculums.
 * - Optionally scope a subject to a curriculum pathway or organization.
 * - Configure subject type, credits, contact hours, pass score and order.
 * - Branch scoped, offline first, mobile first, syncUtils powered.
 *
 * UI:
 * - compact search + inline add + slider filter + More menu
 * - filters live in a sheet
 * - cards/table/analytics views
 * - no duplicate module hero
 * - theme-safe, responsive and dark-mode compatible
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useSettings } from "../../context/settings-context";
import {
  db,
  type Curriculum,
  type CurriculumPathway,
  type CurriculumSubject,
  type Organization,
  type Subject,
  type SubjectPrerequisite,
  type ClassSubject,
  type SubjectOffering,
} from "../../lib/db/db";
import {
  createLocal,
  listActiveLocal,
  softDeleteLocal,
  updateLocal,
} from "../../lib/sync/syncUtils";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";

type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type SubjectType = "core" | "elective" | "optional";

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type CurriculumSubjectView = {
  id: string;
  row: CurriculumSubject;
  curriculumName: string;
  curriculumCode: string;
  subjectName: string;
  subjectCode: string;
  pathwayName: string;
  organizationName: string;
  prerequisiteCount: number;
  classCount: number;
  offeringCount: number;
  active: boolean;
};

type FormState = {
  id?: string;
  curriculumId: string;
  subjectId: string;
  pathwayId: string;
  organizationId: string;
  type: SubjectType;
  credits: string;
  contactHours: string;
  minimumPassScore: string;
  orderIndex: string;
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

const idOf = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();

const sameId = (a: unknown, b: unknown) => idOf(a) === idOf(b);

const safeLower = (value: unknown) =>
  String(value || "")
    .toLowerCase()
    .trim();

const tableSafe = (name: string) => (db as any)[name];

const numberOrUndefined = (value: string) => {
  const clean = String(value || "").trim();
  if (!clean) return undefined;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const isActiveRow = (row: any) => {
  const status = safeLower(row?.status);
  if (row?.isDeleted) return false;
  if (row?.active === false) return false;
  return !["inactive", "deleted", "archived", "suspended"].includes(status);
};

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`cs-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="cs-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
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
    <section className="cs-empty">
      <div className="cs-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <span>
      <b>{value}</b>
      {label}
    </span>
  );
}

function groupedCounts<T>(
  rows: T[],
  getLabel: (row: T) => string,
): Array<{ label: string; value: number }> {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const label = getLabel(row) || "Not set";
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export default function CurriculumSubjects() {
  const dataRevision = useBranchTableRevision([
    "curriculumSubjects",
    "curriculums",
    "curriculumPathways",
    "subjects",
    "organizations",
    "subjectPrerequisites",
    "classSubjects",
    "subjectOfferings",
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
  const [rows, setRows] = useState<CurriculumSubject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [prerequisites, setPrerequisites] = useState<SubjectPrerequisite[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [offerings, setOfferings] = useState<SubjectOffering[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filterCurriculumId, setFilterCurriculumId] = useState("all");
  const [filterPathwayId, setFilterPathwayId] = useState("all");
  const [filterOrganizationId, setFilterOrganizationId] = useState("all");
  const [filterType, setFilterType] = useState<"all" | SubjectType>("all");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "active" | "inactive"
  >("active");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] =
    useState<CurriculumSubjectView | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
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
        setToast((current) =>
          current?.message === message ? null : current,
        ),
      4200,
    );
  };

  const clearData = () => {
    setRows([]);
    setCurriculums([]);
    setPathways([]);
    setSubjects([]);
    setOrganizations([]);
    setPrerequisites([]);
    setClassSubjects([]);
    setOfferings([]);
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
        pathwayRows,
        subjectRows,
        organizationRows,
        prerequisiteRows,
        classSubjectRows,
        offeringRows,
      ] = await Promise.all([
        tableSafe("curriculumSubjects")?.toArray?.() || [],
        listActiveLocal("curriculums", {
          accountId,
          schoolId,
          branchId,
        } as any),
        tableSafe("curriculumPathways")?.toArray?.() || [],
        listActiveLocal("subjects", {
          accountId,
          schoolId,
          branchId,
        } as any),
        listActiveLocal("organizations", {
          accountId,
          schoolId,
          branchId,
        } as any),
        tableSafe("subjectPrerequisites")?.toArray?.() || [],
        tableSafe("classSubjects")?.toArray?.() || [],
        tableSafe("subjectOfferings")?.toArray?.() || [],
      ]);

      setRows(
        (curriculumSubjectRows as CurriculumSubject[])
          .filter((row) => sameTenant(row as TenantRow))
          .sort(
            (a: any, b: any) =>
              Number(a.orderIndex ?? Number.MAX_SAFE_INTEGER) -
              Number(b.orderIndex ?? Number.MAX_SAFE_INTEGER),
          ),
      );

      setCurriculums(
        (curriculumRows as Curriculum[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );

      setPathways(
        (pathwayRows as CurriculumPathway[])
          .filter((row) => sameTenant(row as TenantRow))
          .filter((row) => isActiveRow(row))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );

      setSubjects(
        (subjectRows as Subject[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );

      setOrganizations(
        (organizationRows as Organization[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );

      setPrerequisites(
        (prerequisiteRows as SubjectPrerequisite[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setClassSubjects(
        (classSubjectRows as ClassSubject[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setOfferings(
        (offeringRows as SubjectOffering[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
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

  const pathwayMap = useMemo(
    () => new Map(pathways.map((row: any) => [idOf(row.id), row])),
    [pathways],
  );

  const subjectMap = useMemo(
    () => new Map(subjects.map((row: any) => [idOf(row.id), row])),
    [subjects],
  );

  const organizationMap = useMemo(
    () => new Map(organizations.map((row: any) => [idOf(row.id), row])),
    [organizations],
  );

  const usage = useMemo(() => {
    const prerequisiteMap = new Map<string, number>();
    const classMap = new Map<string, number>();
    const offeringMap = new Map<string, number>();

    prerequisites.forEach((row: any) => {
      const id = idOf(row.curriculumSubjectId);
      if (id) prerequisiteMap.set(id, (prerequisiteMap.get(id) || 0) + 1);
    });

    classSubjects.forEach((row: any) => {
      const id = idOf(row.curriculumSubjectId);
      if (id) classMap.set(id, (classMap.get(id) || 0) + 1);
    });

    offerings.forEach((row: any) => {
      const id = idOf(row.curriculumSubjectId);
      if (id) offeringMap.set(id, (offeringMap.get(id) || 0) + 1);
    });

    return { prerequisiteMap, classMap, offeringMap };
  }, [prerequisites, classSubjects, offerings]);

  const viewRows = useMemo<CurriculumSubjectView[]>(
    () =>
      rows.map((row: any) => {
        const id = idOf(row.id);
        const curriculum = curriculumMap.get(idOf(row.curriculumId));
        const subject = subjectMap.get(idOf(row.subjectId));
        const pathway = pathwayMap.get(idOf(row.pathwayId));
        const organization = organizationMap.get(idOf(row.organizationId));

        return {
          id,
          row,
          curriculumName: curriculum?.name || "Unknown curriculum",
          curriculumCode: curriculum?.code || "",
          subjectName: subject?.name || "Unknown subject",
          subjectCode: subject?.code || "",
          pathwayName: pathway?.name || "All pathways",
          organizationName: organization?.name || "No organization",
          prerequisiteCount: usage.prerequisiteMap.get(id) || 0,
          classCount: usage.classMap.get(id) || 0,
          offeringCount: usage.offeringMap.get(id) || 0,
          active: isActiveRow(row),
        };
      }),
    [rows, curriculumMap, subjectMap, pathwayMap, organizationMap, usage],
  );

  const availablePathways = useMemo(() => {
    if (!form.curriculumId) return pathways;
    return pathways.filter((row: any) =>
      sameId(row.curriculumId, form.curriculumId),
    );
  }, [form.curriculumId, pathways]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row: any = item.row;

        if (
          filterCurriculumId !== "all" &&
          !sameId(row.curriculumId, filterCurriculumId)
        )
          return false;

        if (
          filterPathwayId !== "all" &&
          !sameId(row.pathwayId, filterPathwayId)
        )
          return false;

        if (
          filterOrganizationId !== "all" &&
          !sameId(row.organizationId, filterOrganizationId)
        )
          return false;

        if (filterType !== "all" && row.type !== filterType) return false;
        if (filterStatus === "active" && !item.active) return false;
        if (filterStatus === "inactive" && item.active) return false;

        if (!term) return true;

        return `${item.subjectName} ${item.subjectCode} ${item.curriculumName} ${item.curriculumCode} ${item.pathwayName} ${item.organizationName} ${row.type || ""}`
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => {
        const order =
          Number((a.row as any).orderIndex ?? Number.MAX_SAFE_INTEGER) -
          Number((b.row as any).orderIndex ?? Number.MAX_SAFE_INTEGER);
        return order || a.subjectName.localeCompare(b.subjectName);
      });
  }, [
    viewRows,
    search,
    filterCurriculumId,
    filterPathwayId,
    filterOrganizationId,
    filterType,
    filterStatus,
  ]);

  const summary = useMemo(
    () => ({
      total: viewRows.length,
      active: viewRows.filter((item) => item.active).length,
      inactive: viewRows.filter((item) => !item.active).length,
      core: viewRows.filter((item) => item.row.type === "core").length,
      elective: viewRows.filter((item) => item.row.type === "elective").length,
      optional: viewRows.filter((item) => item.row.type === "optional").length,
      credits: viewRows.reduce(
        (sum, item) => sum + Number(item.row.credits || 0),
        0,
      ),
      showing: filteredRows.length,
    }),
    [viewRows, filteredRows.length],
  );

  const activeFilterCount = useMemo(
    () =>
      [
        filterCurriculumId,
        filterPathwayId,
        filterOrganizationId,
        filterType,
        filterStatus,
      ].filter((value) => value !== "all" && value !== "active").length,
    [
      filterCurriculumId,
      filterPathwayId,
      filterOrganizationId,
      filterType,
      filterStatus,
    ],
  );

  const countsByCurriculum = useMemo(
    () => groupedCounts(viewRows, (item) => item.curriculumName),
    [viewRows],
  );

  const countsByType = useMemo(
    () =>
      groupedCounts(viewRows, (item) => {
        const type = item.row.type || "core";
        return type.charAt(0).toUpperCase() + type.slice(1);
      }),
    [viewRows],
  );

  const countsByPathway = useMemo(
    () => groupedCounts(viewRows, (item) => item.pathwayName),
    [viewRows],
  );

  const updateForm = (patch: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...patch }));

  const clearFilters = () => {
    setFilterCurriculumId("all");
    setFilterPathwayId("all");
    setFilterOrganizationId("all");
    setFilterType("all");
    setFilterStatus("active");
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

    setSelectedItem(null);
    setForm({
      ...emptyForm,
      curriculumId:
        filterCurriculumId !== "all"
          ? filterCurriculumId
          : idOf(curriculums[0]?.id),
      pathwayId:
        filterPathwayId !== "all" ? filterPathwayId : "",
      organizationId:
        filterOrganizationId !== "all" ? filterOrganizationId : "",
      type: filterType !== "all" ? filterType : "core",
      orderIndex: String(viewRows.length + 1),
    });
    setModalOpen(true);
  };

  const openEdit = (item: CurriculumSubjectView) => {
    const row: any = item.row;
    setSelectedItem(null);
    setForm({
      id: item.id,
      curriculumId: idOf(row.curriculumId),
      subjectId: idOf(row.subjectId),
      pathwayId: idOf(row.pathwayId),
      organizationId: idOf(row.organizationId),
      type: row.type || "core",
      credits: row.credits == null ? "" : String(row.credits),
      contactHours:
        row.contactHours == null ? "" : String(row.contactHours),
      minimumPassScore:
        row.minimumPassScore == null ? "" : String(row.minimumPassScore),
      orderIndex: row.orderIndex == null ? "" : String(row.orderIndex),
      active: item.active,
    });
    setModalOpen(true);
  };

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first.";
    if (!schoolId || !branchId) return "Select a school branch first.";
    if (!form.curriculumId) return "Select a curriculum.";
    if (!form.subjectId) return "Select a subject.";

    const selectedPathway = pathways.find((row: any) =>
      sameId(row.id, form.pathwayId),
    );

    if (
      selectedPathway &&
      !sameId((selectedPathway as any).curriculumId, form.curriculumId)
    ) {
      return "The selected pathway does not belong to this curriculum.";
    }

    const duplicate = rows.find((row: any) => {
      if (form.id && sameId(row.id, form.id)) return false;
      if (row.isDeleted) return false;

      return (
        sameId(row.curriculumId, form.curriculumId) &&
        sameId(row.subjectId, form.subjectId) &&
        sameId(row.pathwayId || "", form.pathwayId || "")
      );
    });

    if (duplicate) {
      return "This subject is already attached to the selected curriculum and pathway.";
    }

    const passScore = numberOrUndefined(form.minimumPassScore);
    if (passScore !== undefined && (passScore < 0 || passScore > 100)) {
      return "Minimum pass score must be between 0 and 100.";
    }

    for (const [label, value] of [
      ["Credits", form.credits],
      ["Contact hours", form.contactHours],
      ["Order", form.orderIndex],
    ] as const) {
      const parsed = numberOrUndefined(value);
      if (parsed !== undefined && parsed < 0) return `${label} cannot be negative.`;
    }

    return "";
  };

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const error = validate();
    if (error) {
      showToast("error", error);
      return;
    }

    try {
      setSaving(true);

      const existing = form.id
        ? rows.find((row: any) => sameId(row.id, form.id))
        : undefined;

      const payload: Partial<CurriculumSubject> = {
        accountId: String(accountId),
        schoolId: String(schoolId),
        branchId: String(branchId),
        curriculumId: form.curriculumId,
        subjectId: form.subjectId,
        pathwayId: form.pathwayId || undefined,
        organizationId: form.organizationId || undefined,
        type: form.type,
        credits: numberOrUndefined(form.credits),
        contactHours: numberOrUndefined(form.contactHours),
        minimumPassScore: numberOrUndefined(form.minimumPassScore),
        orderIndex: numberOrUndefined(form.orderIndex),
        active: form.active,
        isDeleted: false,
      };

      if (form.id && existing) {
        await updateLocal("curriculumSubjects", form.id, payload);
      } else {
        await createLocal(
          "curriculumSubjects",
          payload as CurriculumSubject,
        );
      }

      setModalOpen(false);
      setForm(emptyForm);
      showToast("success", "Curriculum subject saved.");
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not save curriculum subject.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: CurriculumSubjectView) => {
    if (!item.id) return;

    try {
      await updateLocal("curriculumSubjects", item.id, {
        active: !item.active,
        isDeleted: false,
      } as Partial<CurriculumSubject>);

      setSelectedItem(null);
      showToast(
        "success",
        item.active
          ? "Curriculum subject deactivated."
          : "Curriculum subject activated.",
      );
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not update curriculum subject status.");
    }
  };

  const remove = async (item: CurriculumSubjectView) => {
    const usageTotal =
      item.prerequisiteCount + item.classCount + item.offeringCount;

    const ok = window.confirm(
      usageTotal
        ? `"${item.subjectName}" has ${usageTotal} linked record(s). Delete anyway?`
        : `Delete "${item.subjectName}" from ${item.curriculumName}?`,
    );

    if (!ok) return;

    try {
      await softDeleteLocal("curriculumSubjects", item.id);
      setSelectedItem(null);
      showToast("success", "Curriculum subject deleted.");
      await load();
    } catch (error) {
      console.error(error);
      showToast("error", "Could not delete curriculum subject.");
    }
  };

  if (
    accountLoading ||
    settingsLoading ||
    contextLoading ||
    (!workspaceReady && !workspaceError)
  ) {
    return (
      <div className="cs-state">
        <span className="cs-spinner" />
        <p>Preparing curriculum subjects…</p>
        <Styles primary={primary} />
      </div>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <div className="cs-state">
        <h3>Sign-in required</h3>
        <p>Please sign in to manage curriculum subjects.</p>
        <Styles primary={primary} />
      </div>
    );
  }

  if (!schoolId || !branchId || workspaceError) {
    return (
      <div className="cs-state">
        <h3>Branch workspace required</h3>
        <p>
          {workspaceError ||
            "Select a school branch before opening curriculum subjects."}
        </p>
        <Styles primary={primary} />
      </div>
    );
  }

  return (
    <div className="cs-root">
      <Styles primary={primary} />

      <div className="cs-toolbar">
        <label className="cs-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search curriculum subjects..."
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </label>

        <button
          type="button"
          className="cs-icon-button cs-primary"
          onClick={openCreate}
          aria-label="Add curriculum subject"
          title="Add curriculum subject"
        >
          +
        </button>

        <button
          type="button"
          className="cs-icon-button"
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? (
            <b className="cs-action-badge">{activeFilterCount}</b>
          ) : null}
        </button>

        <div className="cs-more-wrap">
          <button
            type="button"
            className="cs-icon-button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-label="More options"
            title="More"
          >
            ⋯
          </button>

          {moreOpen ? (
            <>
              <button
                type="button"
                className="cs-menu-backdrop"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
              />
              <div className="cs-menu">
                <button
                  type="button"
                  className={viewMode === "cards" ? "active" : ""}
                  onClick={() => {
                    setViewMode("cards");
                    setMoreOpen(false);
                  }}
                >
                  <span>▦</span> Card view
                </button>
                <button
                  type="button"
                  className={viewMode === "table" ? "active" : ""}
                  onClick={() => {
                    setViewMode("table");
                    setMoreOpen(false);
                  }}
                >
                  <span>☷</span> Table view
                </button>
                <button
                  type="button"
                  className={viewMode === "summary" ? "active" : ""}
                  onClick={() => {
                    setViewMode("summary");
                    setMoreOpen(false);
                  }}
                >
                  <span>◔</span> Analytics
                </button>
                <hr />
                <button
                  type="button"
                  onClick={() => {
                    load();
                    setMoreOpen(false);
                  }}
                >
                  <span>↻</span> Refresh
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearFilters();
                    setSearch("");
                    setMoreOpen(false);
                  }}
                >
                  <span>×</span> Reset view
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {(search ||
        activeFilterCount > 0 ||
        viewMode === "table" ||
        viewMode === "summary") && (
        <div className="cs-compact-summary">
          <MiniStat label="total" value={summary.total} />
          <MiniStat label="showing" value={summary.showing} />
          <MiniStat label="active" value={summary.active} />
          <MiniStat label="credits" value={summary.credits} />
        </div>
      )}

      {loading ? (
        <div className="cs-loading-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="cs-skeleton" key={index} />
          ))}
        </div>
      ) : !filteredRows.length ? (
        <Empty
          icon="📚"
          title={viewRows.length ? "No matching subjects" : "No curriculum subjects"}
          text={
            viewRows.length
              ? "Change your search or filters to see more records."
              : "Attach subjects to a curriculum to define its academic content."
          }
        />
      ) : viewMode === "cards" ? (
        <div className="cs-grid">
          {filteredRows.map((item) => {
            const row: any = item.row;
            const initials = item.subjectName
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase();

            return (
              <article className="cs-card" key={item.id}>
                <button
                  type="button"
                  className="cs-card-main"
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="cs-avatar">{initials || "S"}</div>

                  <div className="cs-card-copy">
                    <div className="cs-card-heading">
                      <div>
                        <h3>{item.subjectName}</h3>
                        <p>
                          {item.subjectCode || "No code"} ·{" "}
                          {item.curriculumName}
                        </p>
                      </div>
                      <span
                        className={`cs-status-dot ${
                          item.active ? "active" : "inactive"
                        }`}
                        title={item.active ? "Active" : "Inactive"}
                      />
                    </div>

                    <div className="cs-chips">
                      <Chip
                        tone={
                          row.type === "core"
                            ? "blue"
                            : row.type === "elective"
                              ? "purple"
                              : "orange"
                        }
                      >
                        {row.type || "core"}
                      </Chip>
                      {row.pathwayId ? (
                        <Chip tone="gray">{item.pathwayName}</Chip>
                      ) : (
                        <Chip tone="green">All pathways</Chip>
                      )}
                    </div>

                    <div className="cs-metrics">
                      <MiniStat label="credits" value={row.credits ?? "—"} />
                      <MiniStat
                        label="hours"
                        value={row.contactHours ?? "—"}
                      />
                      <MiniStat
                        label="pass"
                        value={
                          row.minimumPassScore == null
                            ? "—"
                            : `${row.minimumPassScore}%`
                        }
                      />
                    </div>
                  </div>
                </button>

                <div className="cs-card-actions">
                  <button type="button" onClick={() => openEdit(item)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedItem(item)}
                  >
                    More
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : viewMode === "table" ? (
        <div className="cs-table-wrap">
          <table className="cs-table">
            <thead>
              <tr>
                <th>Subject ({filteredRows.length})</th>
                <th>Curriculum</th>
                <th>Pathway</th>
                <th>Type</th>
                <th>Credits</th>
                <th>Hours</th>
                <th>Pass score</th>
                <th>Status</th>
                <th className="cs-actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((item) => {
                const row: any = item.row;
                return (
                  <tr key={item.id}>
                    <td>
                      <b>{item.subjectName}</b>
                      <small>{item.subjectCode || "No subject code"}</small>
                    </td>
                    <td>
                      {item.curriculumName}
                      <small>{item.curriculumCode || "No code"}</small>
                    </td>
                    <td>{item.pathwayName}</td>
                    <td>
                      <Chip
                        tone={
                          row.type === "core"
                            ? "blue"
                            : row.type === "elective"
                              ? "purple"
                              : "orange"
                        }
                      >
                        {row.type || "core"}
                      </Chip>
                    </td>
                    <td>{row.credits ?? "—"}</td>
                    <td>{row.contactHours ?? "—"}</td>
                    <td>
                      {row.minimumPassScore == null
                        ? "—"
                        : `${row.minimumPassScore}%`}
                    </td>
                    <td>
                      <Chip tone={item.active ? "green" : "red"}>
                        {item.active ? "Active" : "Inactive"}
                      </Chip>
                    </td>
                    <td className="cs-table-actions">
                      <button type="button" onClick={() => openEdit(item)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedItem(item)}
                      >
                        More
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="cs-analytics">
          <div className="cs-stat-grid">
            <article>
              <b>{summary.total}</b>
              <span>Total subjects</span>
            </article>
            <article>
              <b>{summary.active}</b>
              <span>Active</span>
            </article>
            <article>
              <b>{summary.core}</b>
              <span>Core</span>
            </article>
            <article>
              <b>{summary.elective}</b>
              <span>Elective</span>
            </article>
            <article>
              <b>{summary.optional}</b>
              <span>Optional</span>
            </article>
            <article>
              <b>{summary.credits}</b>
              <span>Total credits</span>
            </article>
          </div>

          <div className="cs-analysis-grid">
            <AnalysisCard title="By curriculum" rows={countsByCurriculum} />
            <AnalysisCard title="By type" rows={countsByType} />
            <AnalysisCard title="By pathway" rows={countsByPathway} />
          </div>
        </section>
      )}

      {filterOpen ? (
        <div className="cs-overlay">
          <button
            type="button"
            className="cs-backdrop"
            onClick={() => setFilterOpen(false)}
            aria-label="Close filters"
          />
          <aside className="cs-sheet">
            <div className="cs-sheet-head">
              <div>
                <h3>Filter curriculum subjects</h3>
                <p>Limit records by academic context and status.</p>
              </div>
              <button type="button" onClick={() => setFilterOpen(false)}>
                ×
              </button>
            </div>

            <div className="cs-form-grid single">
              <label>
                <span>Curriculum</span>
                <select
                  value={filterCurriculumId}
                  onChange={(event) => setFilterCurriculumId(event.target.value)}
                >
                  <option value="all">All curriculums</option>
                  {curriculums.map((row: any) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Pathway</span>
                <select
                  value={filterPathwayId}
                  onChange={(event) => setFilterPathwayId(event.target.value)}
                >
                  <option value="all">All pathways</option>
                  {pathways.map((row: any) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Organization</span>
                <select
                  value={filterOrganizationId}
                  onChange={(event) =>
                    setFilterOrganizationId(event.target.value)
                  }
                >
                  <option value="all">All organizations</option>
                  {organizations.map((row: any) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Subject type</span>
                <select
                  value={filterType}
                  onChange={(event) =>
                    setFilterType(event.target.value as "all" | SubjectType)
                  }
                >
                  <option value="all">All types</option>
                  <option value="core">Core</option>
                  <option value="elective">Elective</option>
                  <option value="optional">Optional</option>
                </select>
              </label>

              <label>
                <span>Status</span>
                <select
                  value={filterStatus}
                  onChange={(event) =>
                    setFilterStatus(
                      event.target.value as "all" | "active" | "inactive",
                    )
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>

            <div className="cs-sheet-actions">
              <button
                type="button"
                className="cs-secondary-button"
                onClick={clearFilters}
              >
                Reset
              </button>
              <button
                type="button"
                className="cs-primary-button"
                onClick={() => setFilterOpen(false)}
              >
                Apply filters
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="cs-overlay">
          <button
            type="button"
            className="cs-backdrop"
            onClick={() => !saving && setModalOpen(false)}
            aria-label="Close form"
          />
          <section className="cs-modal">
            <form onSubmit={save}>
              <div className="cs-sheet-head">
                <div>
                  <h3>
                    {form.id
                      ? "Edit curriculum subject"
                      : "Add curriculum subject"}
                  </h3>
                  <p>
                    Define how this subject belongs to the selected curriculum.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !saving && setModalOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className="cs-form-grid">
                <label>
                  <span>
                    Curriculum <b>*</b>
                  </span>
                  <select
                    value={form.curriculumId}
                    onChange={(event) =>
                      updateForm({
                        curriculumId: event.target.value,
                        pathwayId: "",
                      })
                    }
                    required
                  >
                    <option value="">Select curriculum</option>
                    {curriculums.map((row: any) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                        {row.code ? ` · ${row.code}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>
                    Subject <b>*</b>
                  </span>
                  <select
                    value={form.subjectId}
                    onChange={(event) =>
                      updateForm({ subjectId: event.target.value })
                    }
                    required
                  >
                    <option value="">Select subject</option>
                    {subjects.map((row: any) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                        {row.code ? ` · ${row.code}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Pathway</span>
                  <select
                    value={form.pathwayId}
                    onChange={(event) =>
                      updateForm({ pathwayId: event.target.value })
                    }
                    disabled={!form.curriculumId}
                  >
                    <option value="">All pathways</option>
                    {availablePathways.map((row: any) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  <small>
                    Leave blank when the subject applies to every pathway.
                  </small>
                </label>

                <label>
                  <span>Organization</span>
                  <select
                    value={form.organizationId}
                    onChange={(event) =>
                      updateForm({ organizationId: event.target.value })
                    }
                  >
                    <option value="">No organization</option>
                    {organizations.map((row: any) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Subject type</span>
                  <select
                    value={form.type}
                    onChange={(event) =>
                      updateForm({ type: event.target.value as SubjectType })
                    }
                  >
                    <option value="core">Core</option>
                    <option value="elective">Elective</option>
                    <option value="optional">Optional</option>
                  </select>
                </label>

                <label>
                  <span>Order</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.orderIndex}
                    onChange={(event) =>
                      updateForm({ orderIndex: event.target.value })
                    }
                    placeholder="1"
                  />
                </label>

                <label>
                  <span>Credits</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.credits}
                    onChange={(event) =>
                      updateForm({ credits: event.target.value })
                    }
                    placeholder="3"
                  />
                </label>

                <label>
                  <span>Contact hours</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.contactHours}
                    onChange={(event) =>
                      updateForm({ contactHours: event.target.value })
                    }
                    placeholder="40"
                  />
                </label>

                <label>
                  <span>Minimum pass score (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.minimumPassScore}
                    onChange={(event) =>
                      updateForm({ minimumPassScore: event.target.value })
                    }
                    placeholder="50"
                  />
                </label>

                <label className="cs-toggle-row">
                  <span>
                    <b>Active</b>
                    <small>Available for class and assessment setup.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) =>
                      updateForm({ active: event.target.checked })
                    }
                  />
                </label>
              </div>

              <div className="cs-modal-actions">
                <button
                  type="button"
                  className="cs-secondary-button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cs-primary-button"
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save subject"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {selectedItem ? (
        <div className="cs-overlay">
          <button
            type="button"
            className="cs-backdrop"
            onClick={() => setSelectedItem(null)}
            aria-label="Close details"
          />
          <aside className="cs-sheet">
            <div className="cs-sheet-head">
              <div>
                <h3>{selectedItem.subjectName}</h3>
                <p>{selectedItem.curriculumName}</p>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)}>
                ×
              </button>
            </div>

            <div className="cs-detail-hero">
              <div className="cs-avatar large">
                {selectedItem.subjectName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()}
              </div>
              <div>
                <h4>{selectedItem.subjectName}</h4>
                <p>{selectedItem.subjectCode || "No subject code"}</p>
              </div>
            </div>

            <div className="cs-detail-grid">
              <div>
                <span>Curriculum</span>
                <b>{selectedItem.curriculumName}</b>
              </div>
              <div>
                <span>Pathway</span>
                <b>{selectedItem.pathwayName}</b>
              </div>
              <div>
                <span>Organization</span>
                <b>{selectedItem.organizationName}</b>
              </div>
              <div>
                <span>Type</span>
                <b>{selectedItem.row.type || "core"}</b>
              </div>
              <div>
                <span>Credits</span>
                <b>{selectedItem.row.credits ?? "Not set"}</b>
              </div>
              <div>
                <span>Contact hours</span>
                <b>{selectedItem.row.contactHours ?? "Not set"}</b>
              </div>
              <div>
                <span>Minimum pass</span>
                <b>
                  {selectedItem.row.minimumPassScore == null
                    ? "Not set"
                    : `${selectedItem.row.minimumPassScore}%`}
                </b>
              </div>
              <div>
                <span>Order</span>
                <b>{selectedItem.row.orderIndex ?? "Not set"}</b>
              </div>
            </div>

            <div className="cs-usage">
              <MiniStat
                label="prerequisites"
                value={selectedItem.prerequisiteCount}
              />
              <MiniStat label="classes" value={selectedItem.classCount} />
              <MiniStat label="offerings" value={selectedItem.offeringCount} />
            </div>

            <div className="cs-sheet-action-list">
              <button type="button" onClick={() => openEdit(selectedItem)}>
                <span>✎</span>
                <div>
                  <b>Edit subject settings</b>
                  <small>Update curriculum rules and academic values.</small>
                </div>
              </button>

              <button
                type="button"
                onClick={() => toggleActive(selectedItem)}
              >
                <span>{selectedItem.active ? "○" : "●"}</span>
                <div>
                  <b>{selectedItem.active ? "Deactivate" : "Activate"}</b>
                  <small>
                    {selectedItem.active
                      ? "Hide it from active academic setup."
                      : "Make it available for academic setup."}
                  </small>
                </div>
              </button>

              <button
                type="button"
                className="danger"
                onClick={() => remove(selectedItem)}
              >
                <span>⌫</span>
                <div>
                  <b>Delete curriculum subject</b>
                  <small>Soft delete this link while preserving sync history.</small>
                </div>
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {toast ? (
        <div className={`cs-toast ${toast.tone}`}>{toast.message}</div>
      ) : null}
    </div>
  );
}

function AnalysisCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <article className="cs-analysis-card">
      <h3>{title}</h3>
      {rows.length ? (
        <div className="cs-bars">
          {rows.slice(0, 10).map((row) => (
            <div className="cs-bar-row" key={row.label}>
              <div>
                <span>{row.label}</span>
                <b>{row.value}</b>
              </div>
              <i>
                <em style={{ width: `${(row.value / max) * 100}%` }} />
              </i>
            </div>
          ))}
        </div>
      ) : (
        <p className="cs-muted">No records available.</p>
      )}
    </article>
  );
}

function Styles({ primary }: { primary: string }) {
  return (
    <style jsx global>{`
      .cs-root {
        --cs-primary: ${primary};
        --cs-bg: var(--background, #f7f8fb);
        --cs-surface: var(--card, #ffffff);
        --cs-surface-2: color-mix(in srgb, var(--cs-surface) 94%, var(--cs-primary));
        --cs-text: var(--foreground, #172033);
        --cs-muted: color-mix(in srgb, var(--cs-text) 62%, transparent);
        --cs-border: color-mix(in srgb, var(--cs-text) 13%, transparent);
        --cs-soft-primary: color-mix(in srgb, var(--cs-primary) 11%, transparent);
        color: var(--cs-text);
        width: 100%;
        min-width: 0;
      }

      .cs-root *,
      .cs-root *::before,
      .cs-root *::after {
        box-sizing: border-box;
      }

      .cs-toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto auto;
        gap: 8px;
        align-items: center;
        margin-bottom: 10px;
      }

      .cs-search {
        min-width: 0;
        height: 42px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 11px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 13px;
        box-shadow: 0 5px 18px rgba(15, 23, 42, 0.04);
      }

      .cs-search > span {
        font-size: 21px;
        line-height: 1;
        color: var(--cs-muted);
        transform: translateY(-1px);
      }

      .cs-search input {
        width: 100%;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
        color: var(--cs-text);
        font: inherit;
        font-size: 14px;
      }

      .cs-search button,
      .cs-sheet-head > button {
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: var(--cs-muted);
        font-size: 20px;
        cursor: pointer;
      }

      .cs-icon-button {
        position: relative;
        width: 42px;
        height: 42px;
        border-radius: 13px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        color: var(--cs-text);
        font: inherit;
        font-size: 23px;
        line-height: 1;
        display: grid;
        place-items: center;
        cursor: pointer;
        box-shadow: 0 5px 18px rgba(15, 23, 42, 0.04);
      }

      .cs-icon-button:hover {
        background: var(--cs-surface-2);
      }

      .cs-icon-button.cs-primary {
        background: var(--cs-primary);
        color: #fff;
        border-color: var(--cs-primary);
      }

      .cs-slider-icon {
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
      }

      .cs-action-badge {
        position: absolute;
        right: -4px;
        top: -4px;
        min-width: 17px;
        height: 17px;
        padding: 0 4px;
        border-radius: 9px;
        display: grid;
        place-items: center;
        background: #ef4444;
        color: #fff;
        font-size: 10px;
        border: 2px solid var(--cs-surface);
      }

      .cs-more-wrap {
        position: relative;
      }

      .cs-menu-backdrop {
        position: fixed;
        inset: 0;
        z-index: 30;
        border: 0;
        background: transparent;
      }

      .cs-menu {
        position: absolute;
        z-index: 31;
        right: 0;
        top: calc(100% + 7px);
        width: 210px;
        padding: 7px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 14px;
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.16);
      }

      .cs-menu button {
        width: 100%;
        border: 0;
        background: transparent;
        color: var(--cs-text);
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        border-radius: 9px;
        cursor: pointer;
        text-align: left;
        font: inherit;
        font-size: 13px;
      }

      .cs-menu button:hover,
      .cs-menu button.active {
        background: var(--cs-soft-primary);
        color: var(--cs-primary);
      }

      .cs-menu hr {
        border: 0;
        border-top: 1px solid var(--cs-border);
        margin: 5px 0;
      }

      .cs-compact-summary,
      .cs-usage {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-bottom: 10px;
      }

      .cs-compact-summary > span,
      .cs-usage > span {
        display: inline-flex;
        align-items: baseline;
        gap: 4px;
        padding: 6px 9px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 999px;
        color: var(--cs-muted);
        font-size: 11px;
      }

      .cs-compact-summary b,
      .cs-usage b {
        color: var(--cs-text);
        font-size: 13px;
      }

      .cs-grid,
      .cs-loading-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 10px;
      }

      .cs-card {
        min-width: 0;
        overflow: hidden;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 16px;
        box-shadow: 0 7px 24px rgba(15, 23, 42, 0.045);
      }

      .cs-card-main {
        width: 100%;
        border: 0;
        background: transparent;
        color: inherit;
        display: flex;
        align-items: flex-start;
        gap: 11px;
        padding: 13px;
        text-align: left;
        cursor: pointer;
      }

      .cs-avatar {
        flex: 0 0 auto;
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        border-radius: 13px;
        background: var(--cs-soft-primary);
        color: var(--cs-primary);
        font-size: 13px;
        font-weight: 800;
      }

      .cs-avatar.large {
        width: 52px;
        height: 52px;
        border-radius: 16px;
        font-size: 16px;
      }

      .cs-card-copy {
        min-width: 0;
        flex: 1;
      }

      .cs-card-heading {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }

      .cs-card h3,
      .cs-analysis-card h3,
      .cs-sheet h3,
      .cs-modal h3,
      .cs-detail-hero h4 {
        margin: 0;
        color: var(--cs-text);
      }

      .cs-card h3 {
        font-size: 14px;
        line-height: 1.25;
      }

      .cs-card-heading p,
      .cs-sheet-head p,
      .cs-detail-hero p {
        margin: 3px 0 0;
        color: var(--cs-muted);
        font-size: 11px;
      }

      .cs-status-dot {
        width: 8px;
        height: 8px;
        margin-top: 4px;
        border-radius: 50%;
        background: #94a3b8;
        box-shadow: 0 0 0 3px color-mix(in srgb, #94a3b8 15%, transparent);
      }

      .cs-status-dot.active {
        background: #22c55e;
        box-shadow: 0 0 0 3px color-mix(in srgb, #22c55e 15%, transparent);
      }

      .cs-status-dot.inactive {
        background: #ef4444;
        box-shadow: 0 0 0 3px color-mix(in srgb, #ef4444 15%, transparent);
      }

      .cs-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 9px;
      }

      .cs-chip {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        padding: 3px 7px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        text-transform: capitalize;
        white-space: nowrap;
      }

      .cs-chip.green {
        color: #15803d;
        background: color-mix(in srgb, #22c55e 12%, transparent);
      }
      .cs-chip.red {
        color: #dc2626;
        background: color-mix(in srgb, #ef4444 12%, transparent);
      }
      .cs-chip.blue {
        color: #2563eb;
        background: color-mix(in srgb, #3b82f6 12%, transparent);
      }
      .cs-chip.gray {
        color: var(--cs-muted);
        background: color-mix(in srgb, var(--cs-text) 7%, transparent);
      }
      .cs-chip.orange {
        color: #c2410c;
        background: color-mix(in srgb, #f97316 12%, transparent);
      }
      .cs-chip.purple {
        color: #7c3aed;
        background: color-mix(in srgb, #8b5cf6 12%, transparent);
      }

      .cs-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        margin-top: 10px;
      }

      .cs-metrics > span {
        min-width: 0;
        padding: 6px;
        border-radius: 9px;
        background: color-mix(in srgb, var(--cs-text) 3.5%, transparent);
        color: var(--cs-muted);
        display: flex;
        flex-direction: column;
        font-size: 9px;
      }

      .cs-metrics b {
        color: var(--cs-text);
        font-size: 12px;
      }

      .cs-card-actions {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
        padding: 8px 10px;
        border-top: 1px solid var(--cs-border);
      }

      .cs-card-actions button,
      .cs-table-actions button {
        border: 0;
        background: transparent;
        color: var(--cs-primary);
        padding: 5px 7px;
        border-radius: 7px;
        font: inherit;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }

      .cs-card-actions button:hover,
      .cs-table-actions button:hover {
        background: var(--cs-soft-primary);
      }

      .cs-skeleton {
        height: 155px;
        border-radius: 16px;
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--cs-text) 5%, transparent),
          color-mix(in srgb, var(--cs-text) 9%, transparent),
          color-mix(in srgb, var(--cs-text) 5%, transparent)
        );
        background-size: 220% 100%;
        animation: cs-shimmer 1.25s infinite linear;
      }

      @keyframes cs-shimmer {
        to {
          background-position: -220% 0;
        }
      }

      .cs-empty,
      .cs-state {
        min-height: 260px;
        display: grid;
        place-items: center;
        align-content: center;
        text-align: center;
        padding: 30px;
        border: 1px dashed var(--cs-border);
        border-radius: 18px;
        background: var(--cs-surface);
        color: var(--cs-text);
      }

      .cs-empty-icon {
        font-size: 32px;
      }

      .cs-empty h3,
      .cs-state h3 {
        margin: 9px 0 4px;
      }

      .cs-empty p,
      .cs-state p {
        max-width: 460px;
        margin: 0;
        color: var(--cs-muted);
        font-size: 13px;
      }

      .cs-spinner {
        width: 24px;
        height: 24px;
        border: 3px solid var(--cs-border);
        border-top-color: var(--cs-primary);
        border-radius: 50%;
        animation: cs-spin 0.75s linear infinite;
      }

      @keyframes cs-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .cs-table-wrap {
        width: 100%;
        overflow: auto;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 15px;
      }

      .cs-table {
        width: 100%;
        min-width: 970px;
        border-collapse: collapse;
        font-size: 12px;
      }

      .cs-table th {
        position: sticky;
        top: 0;
        z-index: 1;
        padding: 10px;
        background: color-mix(in srgb, var(--cs-surface) 94%, var(--cs-primary));
        color: var(--cs-muted);
        font-size: 10px;
        text-align: left;
        text-transform: uppercase;
        letter-spacing: 0.045em;
        white-space: nowrap;
      }

      .cs-table td {
        padding: 10px;
        border-top: 1px solid var(--cs-border);
        vertical-align: middle;
      }

      .cs-table td b,
      .cs-table td small {
        display: block;
      }

      .cs-table td small {
        margin-top: 2px;
        color: var(--cs-muted);
        font-size: 10px;
      }

      .cs-actions-column,
      .cs-table-actions {
        text-align: right !important;
        white-space: nowrap;
      }

      .cs-analytics {
        display: grid;
        gap: 10px;
      }

      .cs-stat-grid {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 8px;
      }

      .cs-stat-grid article {
        padding: 12px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 13px;
      }

      .cs-stat-grid b {
        display: block;
        color: var(--cs-primary);
        font-size: 20px;
      }

      .cs-stat-grid span {
        color: var(--cs-muted);
        font-size: 10px;
      }

      .cs-analysis-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .cs-analysis-card {
        min-width: 0;
        padding: 14px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        border-radius: 15px;
      }

      .cs-analysis-card h3 {
        font-size: 13px;
        margin-bottom: 12px;
      }

      .cs-bars {
        display: grid;
        gap: 10px;
      }

      .cs-bar-row > div {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        color: var(--cs-muted);
        font-size: 10px;
      }

      .cs-bar-row > div span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cs-bar-row > div b {
        color: var(--cs-text);
      }

      .cs-bar-row i {
        display: block;
        height: 6px;
        margin-top: 4px;
        overflow: hidden;
        border-radius: 99px;
        background: color-mix(in srgb, var(--cs-text) 8%, transparent);
      }

      .cs-bar-row em {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--cs-primary);
      }

      .cs-muted {
        color: var(--cs-muted);
        font-size: 12px;
      }

      .cs-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        justify-content: flex-end;
        align-items: stretch;
      }

      .cs-backdrop {
        position: absolute;
        inset: 0;
        border: 0;
        background: rgba(15, 23, 42, 0.48);
        backdrop-filter: blur(2px);
      }

      .cs-sheet,
      .cs-modal {
        position: relative;
        z-index: 1;
        width: min(430px, 100%);
        height: 100%;
        overflow: auto;
        background: var(--cs-surface);
        color: var(--cs-text);
        box-shadow: -18px 0 60px rgba(15, 23, 42, 0.2);
        padding: 18px;
      }

      .cs-modal {
        width: min(760px, 100%);
      }

      .cs-modal form {
        min-height: 100%;
        display: flex;
        flex-direction: column;
      }

      .cs-sheet-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--cs-border);
      }

      .cs-sheet-head h3 {
        font-size: 16px;
      }

      .cs-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 13px;
        padding: 16px 0;
      }

      .cs-form-grid.single {
        grid-template-columns: 1fr;
      }

      .cs-form-grid label {
        min-width: 0;
        display: grid;
        gap: 6px;
        align-content: start;
      }

      .cs-form-grid label > span {
        color: var(--cs-text);
        font-size: 11px;
        font-weight: 700;
      }

      .cs-form-grid label > span > b {
        color: #ef4444;
      }

      .cs-form-grid input:not([type="checkbox"]),
      .cs-form-grid select {
        width: 100%;
        min-width: 0;
        height: 42px;
        border: 1px solid var(--cs-border);
        border-radius: 11px;
        background: var(--cs-surface);
        color: var(--cs-text);
        padding: 0 11px;
        outline: 0;
        font: inherit;
        font-size: 13px;
      }

      .cs-form-grid input:focus,
      .cs-form-grid select:focus {
        border-color: var(--cs-primary);
        box-shadow: 0 0 0 3px var(--cs-soft-primary);
      }

      .cs-form-grid label > small {
        color: var(--cs-muted);
        font-size: 10px;
        line-height: 1.35;
      }

      .cs-toggle-row {
        grid-column: 1 / -1;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between;
        gap: 12px;
        padding: 11px 12px;
        border: 1px solid var(--cs-border);
        border-radius: 12px;
      }

      .cs-toggle-row > span {
        display: grid;
        gap: 2px;
      }

      .cs-toggle-row small {
        color: var(--cs-muted);
        font-size: 10px;
        font-weight: 400;
      }

      .cs-toggle-row input {
        width: 38px;
        height: 20px;
        accent-color: var(--cs-primary);
      }

      .cs-sheet-actions,
      .cs-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: auto;
        padding-top: 14px;
        border-top: 1px solid var(--cs-border);
      }

      .cs-primary-button,
      .cs-secondary-button {
        min-height: 40px;
        padding: 0 15px;
        border-radius: 11px;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }

      .cs-primary-button {
        border: 1px solid var(--cs-primary);
        background: var(--cs-primary);
        color: #fff;
      }

      .cs-secondary-button {
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        color: var(--cs-text);
      }

      .cs-primary-button:disabled,
      .cs-secondary-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .cs-detail-hero {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 0;
      }

      .cs-detail-hero h4 {
        font-size: 15px;
      }

      .cs-detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 14px;
      }

      .cs-detail-grid > div {
        min-width: 0;
        padding: 10px;
        border: 1px solid var(--cs-border);
        border-radius: 11px;
        background: color-mix(in srgb, var(--cs-text) 2.5%, transparent);
      }

      .cs-detail-grid span,
      .cs-detail-grid b {
        display: block;
      }

      .cs-detail-grid span {
        color: var(--cs-muted);
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .cs-detail-grid b {
        margin-top: 3px;
        overflow: hidden;
        color: var(--cs-text);
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cs-sheet-action-list {
        display: grid;
        gap: 7px;
        margin-top: 13px;
      }

      .cs-sheet-action-list > button {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 11px;
        border: 1px solid var(--cs-border);
        background: var(--cs-surface);
        color: var(--cs-text);
        border-radius: 12px;
        text-align: left;
        cursor: pointer;
      }

      .cs-sheet-action-list > button:hover {
        background: var(--cs-surface-2);
      }

      .cs-sheet-action-list > button > span {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border-radius: 9px;
        background: var(--cs-soft-primary);
        color: var(--cs-primary);
        font-weight: 800;
      }

      .cs-sheet-action-list b,
      .cs-sheet-action-list small {
        display: block;
      }

      .cs-sheet-action-list b {
        font-size: 12px;
      }

      .cs-sheet-action-list small {
        margin-top: 2px;
        color: var(--cs-muted);
        font-size: 10px;
      }

      .cs-sheet-action-list > button.danger {
        color: #dc2626;
      }

      .cs-sheet-action-list > button.danger > span {
        color: #dc2626;
        background: color-mix(in srgb, #ef4444 11%, transparent);
      }

      .cs-toast {
        position: fixed;
        z-index: 1500;
        left: 50%;
        bottom: 22px;
        transform: translateX(-50%);
        max-width: min(92vw, 520px);
        padding: 10px 14px;
        border-radius: 11px;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        box-shadow: 0 16px 45px rgba(15, 23, 42, 0.24);
      }

      .cs-toast.success {
        background: #15803d;
      }

      .cs-toast.error {
        background: #dc2626;
      }

      .cs-toast.info {
        background: #2563eb;
      }

      @media (max-width: 900px) {
        .cs-stat-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .cs-analysis-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 620px) {
        .cs-toolbar {
          grid-template-columns: minmax(0, 1fr) auto auto auto;
          gap: 6px;
        }

        .cs-search,
        .cs-icon-button {
          height: 40px;
        }

        .cs-icon-button {
          width: 40px;
          border-radius: 12px;
        }

        .cs-grid,
        .cs-loading-grid {
          grid-template-columns: 1fr;
        }

        .cs-form-grid {
          grid-template-columns: 1fr;
        }

        .cs-toggle-row {
          grid-column: auto;
        }

        .cs-stat-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .cs-sheet,
        .cs-modal {
          width: 100%;
          padding: 15px;
        }
      }
    `}</style>
  );
}