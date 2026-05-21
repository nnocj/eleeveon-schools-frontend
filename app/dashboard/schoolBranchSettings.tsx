"use client";

/**
 * schoolBranchSettings.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE SCHOOL + BRANCH SETTINGS CENTER
 * ---------------------------------------------------------
 *
 * Architecture:
 * Account -> School -> Branch -> SchoolBranchSettings
 *
 * Every setting item is scoped to the selected account/school/branch:
 * - theme / dark mode / light mode
 * - primary color
 * - font family / font size
 * - academic year / current term
 * - current academic structure / period
 * - dashboard images
 * - portal images
 * - report card branding
 * - gallery fallback images
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - Settings reads/writes use accountId + schoolId + branchId.
 * - School/branch identity saves are protected by the active account context where supported.
 * - Mobile-first cards and upload blocks.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  Branch,
  School,
  SchoolBranchSetting,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// COLOR UTILITIES
// ======================================================

function darken(hex: string, factor = 0.35) {
  let col = (hex || "#2f6fed").replace("#", "");

  if (col.length === 3) {
    col = col
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const num = parseInt(col, 16);

  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;

  r = Math.floor(r * factor);
  g = Math.floor(g * factor);
  b = Math.floor(b * factor);

  return `rgb(${r}, ${g}, ${b})`;
}

function getContrastTextColor(hex: string) {
  let col = (hex || "#ffffff").replace("#", "");

  if (col.startsWith("rgb")) return "#fff";

  if (col.length === 3) {
    col = col
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const num = parseInt(col, 16);

  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 140 ? "#111" : "#fff";
}

// ======================================================
// OPTIONS + TYPES
// ======================================================

const fontOptions = [
  { label: "System Default", value: "system-ui, -apple-system, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Helvetica", value: "Helvetica, sans-serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Tahoma", value: "Tahoma, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Segoe UI", value: "'Segoe UI', sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Poppins", value: "Poppins, sans-serif" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Montserrat", value: "Montserrat, sans-serif" },
  { label: "Open Sans", value: "'Open Sans', sans-serif" },
  { label: "Lato", value: "Lato, sans-serif" },
  { label: "Nunito", value: "Nunito, sans-serif" },
  { label: "Ubuntu", value: "Ubuntu, sans-serif" },
  { label: "Merriweather", value: "Merriweather, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Garamond", value: "Garamond, serif" },
  { label: "Palatino", value: "'Palatino Linotype', serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Monaco", value: "Monaco, monospace" },
];

type ImageField =
  | "logo"
  | "reportCardBackgroundImage"
  | "reportCardWatermark"
  | "reportCardSignatureImage"
  | "dashboardHeroImage"
  | "dashboardBannerImage"
  | "studentPortalImage"
  | "teacherPortalImage"
  | "classroomPlaceholderImage"
  | "subjectPlaceholderImage";

type SettingsForm = {
  id?: number;
  schoolId?: number;
  branchId?: number;
  mode: string;
  fontFamily: string;
  fontSize: number;
  primaryColor: string;
  theme: "light" | "dark";
  currentTerm: string;
  academicYear: string;
  currentAcademicStructureId?: number;
  currentAcademicPeriodId?: number;
  logo: string;
  reportCardBackgroundImage: string;
  reportCardWatermark: string;
  reportCardSignatureImage: string;
  dashboardHeroImage: string;
  dashboardBannerImage: string;
  studentPortalImage: string;
  teacherPortalImage: string;
  classroomPlaceholderImage: string;
  subjectPlaceholderImage: string;
  schoolGalleryImages: string[];
};

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type SchoolForm = {
  id?: number;
  name?: string;
  motto?: string;
  logo?: string;
  address?: string;
  location?: string;
  email?: string;
  phone?: string;
  website?: string;
  galleryImages?: string[];
  bannerImage?: string;
  active?: boolean;
};

type BranchForm = {
  id?: number;
  schoolId?: number;
  name?: string;
  code?: string;
  address?: string;
  location?: string;
  city?: string;
  email?: string;
  phone?: string;
  website?: string;
  logo?: string;
  bannerImage?: string;
  active?: boolean;
};

const defaultForm = (
  schoolId?: number | null,
  branchId?: number | null
): SettingsForm => ({
  schoolId: schoolId || undefined,
  branchId: branchId || undefined,
  mode: "manual",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 16,
  primaryColor: "#2f6fed",
  theme: "light",
  currentTerm: "Term 1",
  academicYear: "",
  currentAcademicStructureId: undefined,
  currentAcademicPeriodId: undefined,
  logo: "",
  reportCardBackgroundImage: "",
  reportCardWatermark: "",
  reportCardSignatureImage: "",
  dashboardHeroImage: "",
  dashboardBannerImage: "",
  studentPortalImage: "",
  teacherPortalImage: "",
  classroomPlaceholderImage: "",
  subjectPlaceholderImage: "",
  schoolGalleryImages: [],
});

// ======================================================
// COMPONENT
// ======================================================

export default function SchoolBranchSettings() {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    schools: contextSchools,
    branches: contextBranches,
    setActiveSchoolId,
    setActiveBranchId,
    loading: contextLoading,
    refreshInstitution,
  } = useActiveBranch();

  const selectedAccountId = accountId || settings?.accountId;
  const selectedSchoolId = activeSchoolId || activeSchool?.id || formSafeNumber(settings?.schoolId);
  const selectedBranchId = activeBranchId || activeBranch?.id || formSafeNumber(settings?.branchId);
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [schools, setSchools] = useState<School[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [settingsRows, setSettingsRows] = useState<SchoolBranchSetting[]>([]);

  const [form, setForm] = useState<SettingsForm>(defaultForm(activeSchoolId, activeBranchId));
  const [schoolForm, setSchoolForm] = useState<SchoolForm>({});
  const [branchForm, setBranchForm] = useState<BranchForm>({});

  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSchool, setSavingSchool] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);

  // ======================================================
  // AUTH + CONTEXT PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/account");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
    router,
  ]);

  // ======================================================
  // TENANT HELPERS
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === selectedAccountId &&
    row.schoolId === selectedSchoolId &&
    row.branchId === selectedBranchId &&
    !row.isDeleted;

  const sameAccountRow = (row: { accountId?: string; isDeleted?: boolean }) => {
    if (row.isDeleted) return false;
    if (row.accountId && row.accountId !== selectedAccountId) return false;
    return true;
  };

  const clearData = () => {
    setSchools([]);
    setBranches([]);
    setSettingsRows([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
  };

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    if (!authenticated || !selectedAccountId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [schoolRows, branchRows, settingRows, structureRows, periodRows] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
        db.schoolBranchSettings.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
      ]);

      const accountSchools = schoolRows.filter((row: any) => sameAccountRow(row));
      const accountSchoolIds = new Set(accountSchools.map((row) => row.id).filter(Boolean));

      const accountBranches = branchRows.filter((row: any) => {
        if (row.isDeleted) return false;
        if (row.accountId && row.accountId !== selectedAccountId) return false;
        if (row.schoolId && accountSchoolIds.size && !accountSchoolIds.has(row.schoolId)) return false;
        return true;
      });

      setSchools(accountSchools);
      setBranches(accountBranches);

      setSettingsRows(
        settingRows.filter((row: any) => {
          if (row.isDeleted) return false;
          if (row.accountId && row.accountId !== selectedAccountId) return false;
          if (selectedSchoolId && row.schoolId !== selectedSchoolId) return false;
          if (selectedBranchId && row.branchId !== selectedBranchId) return false;
          return true;
        })
      );

      setAcademicStructures(
        structureRows.filter((row: any) => {
          if (row.isDeleted) return false;
          if (row.accountId !== selectedAccountId) return false;
          if (selectedSchoolId && row.schoolId !== selectedSchoolId) return false;
          if (selectedBranchId && row.branchId !== selectedBranchId) return false;
          return true;
        })
      );

      setAcademicPeriods(
        periodRows.filter((row: any) => {
          if (row.isDeleted) return false;
          if (row.accountId !== selectedAccountId) return false;
          if (selectedSchoolId && row.schoolId !== selectedSchoolId) return false;
          if (selectedBranchId && row.branchId !== selectedBranchId) return false;
          return true;
        })
      );
    } catch (error) {
      console.error("Failed to load school branch settings:", error);
      clearData();
      alert("Failed to load school branch settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, selectedAccountId, selectedSchoolId, selectedBranchId]);

  // ======================================================
  // CURRENT SCHOOL / BRANCH SETTINGS
  // ======================================================

  const currentSelectedSchoolId = activeSchoolId || form.schoolId || selectedSchoolId;
  const currentSelectedBranchId = activeBranchId || form.branchId || selectedBranchId;

  const selectedSchool = useMemo(() => {
    return (
      activeSchool ||
      schools.find((row) => row.id === currentSelectedSchoolId) ||
      contextSchools.find((row) => row.id === currentSelectedSchoolId) ||
      null
    );
  }, [activeSchool, schools, contextSchools, currentSelectedSchoolId]);

  const selectedBranch = useMemo(() => {
    return (
      activeBranch ||
      branches.find((row) => row.id === currentSelectedBranchId) ||
      contextBranches.find((row) => row.id === currentSelectedBranchId) ||
      null
    );
  }, [activeBranch, branches, contextBranches, currentSelectedBranchId]);

  const currentSchoolBranchSetting = useMemo(() => {
    if (!currentSelectedSchoolId || !currentSelectedBranchId) return undefined;

    return settingsRows.find(
      (row) =>
        row.schoolId === currentSelectedSchoolId &&
        row.branchId === currentSelectedBranchId &&
        (row as any).accountId === selectedAccountId
    );
  }, [settingsRows, currentSelectedSchoolId, currentSelectedBranchId, selectedAccountId]);

  // ======================================================
  // HYDRATE FORM
  // ======================================================

  useEffect(() => {
    if (!currentSelectedSchoolId || !currentSelectedBranchId) {
      setForm(defaultForm(currentSelectedSchoolId, currentSelectedBranchId));
      return;
    }

    const current = currentSchoolBranchSetting as any;

    setForm({
      ...defaultForm(currentSelectedSchoolId, currentSelectedBranchId),
      ...(current || {}),
      id: current?.id,
      schoolId: currentSelectedSchoolId,
      branchId: currentSelectedBranchId,
      fontSize: Number(current?.fontSize || 16),
      fontFamily: current?.fontFamily || "system-ui, -apple-system, sans-serif",
      primaryColor: current?.primaryColor || "#2f6fed",
      theme: current?.theme || "light",
      mode: current?.mode || "manual",
      currentTerm: current?.currentTerm || "Term 1",
      academicYear: current?.academicYear || "",
      logo: current?.logo || "",
      reportCardBackgroundImage: current?.reportCardBackgroundImage || "",
      reportCardWatermark: current?.reportCardWatermark || "",
      reportCardSignatureImage: current?.reportCardSignatureImage || "",
      dashboardHeroImage: current?.dashboardHeroImage || "",
      dashboardBannerImage: current?.dashboardBannerImage || "",
      studentPortalImage: current?.studentPortalImage || "",
      teacherPortalImage: current?.teacherPortalImage || "",
      classroomPlaceholderImage: current?.classroomPlaceholderImage || "",
      subjectPlaceholderImage: current?.subjectPlaceholderImage || "",
      schoolGalleryImages: Array.isArray(current?.schoolGalleryImages)
        ? current.schoolGalleryImages
        : [],
    });
  }, [currentSelectedSchoolId, currentSelectedBranchId, currentSchoolBranchSetting?.id]);

  useEffect(() => {
    const row: any = selectedSchool;
    if (!row) {
      setSchoolForm({});
      return;
    }

    setSchoolForm({
      id: row.id,
      name: row.name || "",
      motto: row.motto || "",
      logo: row.logo || row.photo || "",
      address: row.address || "",
      location: row.location || "",
      email: row.email || "",
      phone: row.phone || "",
      website: row.website || "",
      galleryImages: Array.isArray(row.galleryImages) ? row.galleryImages : [],
      bannerImage: row.bannerImage || "",
      active: row.active !== false,
    });
  }, [selectedSchool]);

  useEffect(() => {
    const row: any = selectedBranch;
    if (!row) {
      setBranchForm({});
      return;
    }

    setBranchForm({
      id: row.id,
      schoolId: row.schoolId,
      name: row.name || "",
      code: row.code || "",
      address: row.address || "",
      location: row.location || row.city || "",
      city: row.city || "",
      email: row.email || "",
      phone: row.phone || "",
      website: row.website || "",
      logo: row.logo || row.photo || "",
      bannerImage: row.bannerImage || "",
      active: row.active !== false,
    });
  }, [selectedBranch]);

  // ======================================================
  // DERIVED DATA
  // ======================================================

  const filteredBranches = useMemo(() => {
    return branches.filter((branch) => {
      if (!currentSelectedSchoolId) return true;
      return branch.schoolId === Number(currentSelectedSchoolId);
    });
  }, [branches, currentSelectedSchoolId]);

  const filteredAcademicStructures = useMemo(() => {
    return academicStructures
      .filter((structure) => {
        if (!currentSelectedBranchId) return false;
        return structure.branchId === Number(currentSelectedBranchId) && structure.active !== false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [academicStructures, currentSelectedBranchId]);

  const filteredAcademicPeriods = useMemo(() => {
    return academicPeriods
      .filter((period) => {
        if (!currentSelectedBranchId) return false;
        if (period.branchId !== Number(currentSelectedBranchId)) return false;
        if (period.active === false) return false;
        if (
          form.currentAcademicStructureId &&
          period.academicStructureId !== Number(form.currentAcademicStructureId)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }, [academicPeriods, currentSelectedBranchId, form.currentAcademicStructureId]);

  const activeStructure = useMemo(() => {
    return filteredAcademicStructures.find((row) => row.id === form.currentAcademicStructureId);
  }, [filteredAcademicStructures, form.currentAcademicStructureId]);

  const activePeriod = useMemo(() => {
    return filteredAcademicPeriods.find((row) => row.id === form.currentAcademicPeriodId);
  }, [filteredAcademicPeriods, form.currentAcademicPeriodId]);

  const completion = useMemo(() => {
    const checks = [
      !!selectedSchool?.name,
      !!selectedBranch?.name,
      !!form.academicYear,
      !!form.currentTerm,
      !!form.currentAcademicStructureId,
      !!form.currentAcademicPeriodId,
      !!form.primaryColor,
      !!form.logo || !!schoolForm.logo || !!branchForm.logo,
      !!form.dashboardHeroImage,
      !!form.reportCardSignatureImage,
    ];

    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [selectedSchool, selectedBranch, form, schoolForm.logo, branchForm.logo]);

  // ======================================================
  // FIELD HELPERS
  // ======================================================

  const updateForm = (key: keyof SettingsForm, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSchoolField = (key: keyof SchoolForm, value: any) => {
    setSchoolForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateBranchField = (key: keyof BranchForm, value: any) => {
    setBranchForm((prev) => ({ ...prev, [key]: value }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    });
  };

  const uploadImage = async (field: ImageField, file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm(field, value);
  };

  const uploadSchoolImage = async (field: keyof SchoolForm, file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateSchoolField(field, value);
  };

  const uploadBranchImage = async (field: keyof BranchForm, file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateBranchField(field, value);
  };

  const handleGalleryUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const images = await Promise.all(Array.from(files).map(fileToBase64));
    setForm((prev) => ({
      ...prev,
      schoolGalleryImages: [...(prev.schoolGalleryImages || []), ...images],
    }));
  };

  const removeGalleryImage = (index: number) => {
    setForm((prev) => ({
      ...prev,
      schoolGalleryImages: (prev.schoolGalleryImages || []).filter((_, i) => i !== index),
    }));
  };

  // ======================================================
  // CONTEXT SWITCHERS
  // ======================================================

  const switchSchool = async (schoolIdValue?: number) => {
    await setActiveSchoolId?.(schoolIdValue || null);
    updateForm("schoolId", schoolIdValue);
    updateForm("branchId", undefined);
    updateForm("currentAcademicStructureId", undefined);
    updateForm("currentAcademicPeriodId", undefined);
  };

  const switchBranch = async (branchIdValue?: number) => {
    await setActiveBranchId?.(branchIdValue || null);
    updateForm("branchId", branchIdValue);
    updateForm("currentAcademicStructureId", undefined);
    updateForm("currentAcademicPeriodId", undefined);
  };

  // ======================================================
  // SAVE HANDLERS
  // ======================================================

  const requireTenant = () => {
    if (!authenticated || !selectedAccountId) {
      alert("Sign in first.");
      return false;
    }
    if (!currentSelectedSchoolId) {
      alert("Select a school first.");
      return false;
    }
    if (!currentSelectedBranchId) {
      alert("Select a branch first.");
      return false;
    }
    return true;
  };

  const saveSchoolBranchSettings = async (silent = false) => {
    if (!requireTenant()) return false;

    try {
      setSavingSettings(true);

      const payload = prepareSyncData({
        ...form,
        accountId: selectedAccountId,
        schoolId: Number(currentSelectedSchoolId),
        branchId: Number(currentSelectedBranchId),
        currentAcademicStructureId: form.currentAcademicStructureId || undefined,
        currentAcademicPeriodId: form.currentAcademicPeriodId || undefined,
        schoolGalleryImages: Array.isArray(form.schoolGalleryImages)
          ? form.schoolGalleryImages
          : [],
        isDeleted: false,
      }) as SchoolBranchSetting;

      const existingId = currentSchoolBranchSetting?.id || form.id;

      if (existingId) {
        await db.schoolBranchSettings.update(existingId, {
          ...payload,
          id: existingId,
          accountId: selectedAccountId,
          schoolId: payload.schoolId,
          branchId: payload.branchId,
          isDeleted: false,
        } as any);
      } else {
        await db.schoolBranchSettings.add(payload);
      }

      await load();
      await refreshInstitution?.();
      window.dispatchEvent(new Event("school-branch-settings-updated"));

      if (!silent) alert("School branch settings saved successfully");
      return true;
    } catch (error) {
      console.error("Failed to save school branch settings:", error);
      alert("Failed to save school branch settings");
      return false;
    } finally {
      setSavingSettings(false);
    }
  };

  const saveSchoolIdentity = async (silent = false) => {
    if (!selectedAccountId) return alert("Sign in first"), false;
    if (!schoolForm.id) return alert("Select a school first"), false;
    if (!schoolForm.name?.trim()) return alert("School name is required"), false;

    try {
      setSavingSchool(true);

      await db.schools.update(schoolForm.id, {
        accountId: selectedAccountId,
        name: schoolForm.name.trim(),
        motto: schoolForm.motto?.trim() || undefined,
        logo: schoolForm.logo || undefined,
        bannerImage: schoolForm.bannerImage || undefined,
        galleryImages: schoolForm.galleryImages || [],
        address: schoolForm.address?.trim() || undefined,
        location: schoolForm.location?.trim() || undefined,
        email: schoolForm.email?.trim() || undefined,
        phone: schoolForm.phone?.trim() || undefined,
        website: schoolForm.website?.trim() || undefined,
        active: schoolForm.active !== false,
        updatedAt: Date.now(),
      } as any);

      await load();
      await refreshInstitution?.();
      window.dispatchEvent(new Event("school-branch-settings-updated"));

      if (!silent) alert("School identity saved successfully");
      return true;
    } catch (error) {
      console.error("Failed to save school identity:", error);
      alert("Failed to save school identity");
      return false;
    } finally {
      setSavingSchool(false);
    }
  };

  const saveBranchIdentity = async (silent = false) => {
    if (!selectedAccountId) return alert("Sign in first"), false;
    if (!branchForm.id) return alert("Select a branch first"), false;
    if (!branchForm.name?.trim()) return alert("Branch name is required"), false;

    try {
      setSavingBranch(true);

      await db.branches.update(branchForm.id, {
        accountId: selectedAccountId,
        schoolId: Number(currentSelectedSchoolId || branchForm.schoolId),
        name: branchForm.name.trim(),
        code: branchForm.code?.trim() || undefined,
        logo: branchForm.logo || undefined,
        bannerImage: branchForm.bannerImage || undefined,
        address: branchForm.address?.trim() || undefined,
        location: branchForm.location?.trim() || undefined,
        city: branchForm.city?.trim() || branchForm.location?.trim() || undefined,
        email: branchForm.email?.trim() || undefined,
        phone: branchForm.phone?.trim() || undefined,
        website: branchForm.website?.trim() || undefined,
        active: branchForm.active !== false,
        updatedAt: Date.now(),
      } as any);

      await load();
      await refreshInstitution?.();
      window.dispatchEvent(new Event("school-branch-settings-updated"));

      if (!silent) alert("Branch identity saved successfully");
      return true;
    } catch (error) {
      console.error("Failed to save branch identity:", error);
      alert("Failed to save branch identity");
      return false;
    } finally {
      setSavingBranch(false);
    }
  };

  const saveAll = async () => {
    if (!requireTenant()) return;

    try {
      setSavingAll(true);
      if (schoolForm.id) await saveSchoolIdentity(true);
      if (branchForm.id) await saveBranchIdentity(true);
      await saveSchoolBranchSettings(true);
      alert("All school branch settings saved successfully");
    } finally {
      setSavingAll(false);
    }
  };

  // ======================================================
  // APPLY THEME FOR ACTIVE SCHOOL BRANCH
  // ======================================================

  useEffect(() => {
    document.documentElement.style.setProperty("--primary-color", form.primaryColor);
    document.documentElement.style.setProperty("--font-family", form.fontFamily);
    document.documentElement.style.setProperty("--font-size", `${form.fontSize}px`);

    document.body.style.fontFamily = form.fontFamily;
    document.body.style.fontSize = `${form.fontSize}px`;

    document.documentElement.setAttribute("data-theme", form.theme);

    if (form.theme === "dark") {
      document.documentElement.style.setProperty("--bg", darken(form.primaryColor, 0.25));
      document.documentElement.style.setProperty("--surface", darken(form.primaryColor, 0.15));
      document.documentElement.style.setProperty("--text", "#ffffff");
    } else {
      document.documentElement.style.setProperty("--bg", "#f7f8fb");
      document.documentElement.style.setProperty("--surface", "#ffffff");
      document.documentElement.style.setProperty("--text", "#111111");
    }
  }, [form.primaryColor, form.fontFamily, form.fontSize, form.theme]);

  useEffect(() => {
    const icon = form.logo || schoolForm.logo || branchForm.logo;
    if (!icon) return;

    const link: HTMLLinkElement =
      document.querySelector("link[rel~='icon']") || document.createElement("link");

    link.rel = "icon";
    link.href = icon;
    document.head.appendChild(link);
  }, [form.logo, schoolForm.logo, branchForm.logo]);

  // ======================================================
  // PREVIEW
  // ======================================================

  const darkBg = darken(form.primaryColor, 0.25);
  const textColor = getContrastTextColor(form.theme === "dark" ? darkBg : "#ffffff");

  const previewStyle: React.CSSProperties =
    form.theme === "dark"
      ? { background: darkBg, color: textColor }
      : { background: "#fff", color: "#111" };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="sbs-page" style={{ "--sbs-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sbs-state-card">
          <div className="sbs-spinner" />
          <h2>Opening branch settings...</h2>
          <p>Checking account, school, branch, academic defaults, and branding assets.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !selectedAccountId) {
    return (
      <main className="sbs-page" style={{ "--sbs-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sbs-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing school branch settings.</p>
        </section>
      </main>
    );
  }

  if (!currentSelectedSchoolId || !currentSelectedBranchId) {
    return (
      <main className="sbs-page" style={{ "--sbs-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sbs-state-card">
          <h2>Select a branch first</h2>
          <p>Settings are saved under one active school branch.</p>
          <button type="button" className="sbs-primary-btn" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="sbs-page" style={{ "--sbs-primary": form.primaryColor || primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sbs-hero">
        <div className="sbs-hero-left">
          <div className="sbs-hero-icon">⚙️</div>
          <div className="sbs-title-wrap">
            <p>Scoped Configuration</p>
            <h2>School Branch Settings</h2>
            <span>
              {selectedSchool?.name || "No School Selected"}
              {selectedBranch?.name ? ` · ${selectedBranch.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" onClick={saveAll} disabled={savingAll} className="sbs-primary-btn">
          {savingAll ? "Saving..." : "Save All"}
        </button>
      </section>

      <section className="sbs-context-card">
        <div>
          <p>Active Settings Context</p>
          <h3>{selectedSchool?.name || "No School Selected"}</h3>
          <span>
            {selectedBranch?.name || "No Branch Selected"}
            {activeStructure ? ` · ${activeStructure.name}` : ""}
            {activePeriod ? ` · ${activePeriod.name}` : ""}
          </span>
        </div>
        <div className="sbs-pill-row">
          <Chip tone="blue">School</Chip>
          <Chip tone="green">Branch</Chip>
          <Chip tone="purple">Scoped Settings</Chip>
          <Chip tone={completion >= 80 ? "green" : completion >= 50 ? "orange" : "red"}>{completion}% Complete</Chip>
        </div>
      </section>

      <section className="sbs-card">
        <SectionHead title="📚 School, Branch & Academic Defaults" text="Select the branch whose settings you want to edit, then set its current academic defaults." />

        <div className="sbs-form-grid">
          <Field label="School">
            <select value={currentSelectedSchoolId || ""} onChange={(event) => switchSchool(Number(event.target.value) || undefined)}>
              <option value="">Select School</option>
              {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </select>
          </Field>

          <Field label="Active Branch">
            <select value={currentSelectedBranchId || ""} onChange={(event) => switchBranch(Number(event.target.value) || undefined)}>
              <option value="">Select Active Branch</option>
              {filteredBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </Field>

          <Field label="Academic Structure">
            <select value={form.currentAcademicStructureId || ""} onChange={(event) => {
              updateForm("currentAcademicStructureId", Number(event.target.value) || undefined);
              updateForm("currentAcademicPeriodId", undefined);
            }}>
              <option value="">Select Academic Structure</option>
              {filteredAcademicStructures.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.level})</option>)}
            </select>
          </Field>

          <Field label="Academic Period">
            <select value={form.currentAcademicPeriodId || ""} onChange={(event) => updateForm("currentAcademicPeriodId", Number(event.target.value) || undefined)}>
              <option value="">Select Academic Period</option>
              {filteredAcademicPeriods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>

          <Field label="Academic Year">
            <input value={form.academicYear || ""} onChange={(event) => updateForm("academicYear", event.target.value)} placeholder="e.g. 2025/2026" />
          </Field>

          <Field label="Current Term">
            <select value={form.currentTerm || "Term 1"} onChange={(event) => updateForm("currentTerm", event.target.value)}>
              <option>Term 1</option>
              <option>Term 2</option>
              <option>Term 3</option>
              <option>Semester 1</option>
              <option>Semester 2</option>
            </select>
          </Field>

          <Field label="Mode">
            <select value={form.mode} onChange={(event) => updateForm("mode", event.target.value)}>
              <option value="manual">Manual Mode</option>
              <option value="auto">Auto Mode</option>
            </select>
          </Field>
        </div>

        <button type="button" onClick={() => saveSchoolBranchSettings()} disabled={savingSettings} className="sbs-secondary-btn">
          {savingSettings ? "Saving Defaults..." : "Save Branch Academic Defaults"}
        </button>
      </section>

      <section className="sbs-card">
        <SectionHead title="🏫 School Identity" text="School identity remains on the school record. Branch-specific experience lives in SchoolBranchSettings." />

        <div className="sbs-form-grid">
          <Field label="School Name"><input value={schoolForm.name || ""} onChange={(event) => updateSchoolField("name", event.target.value)} /></Field>
          <Field label="Motto"><input value={schoolForm.motto || ""} onChange={(event) => updateSchoolField("motto", event.target.value)} /></Field>
          <Field label="Location"><input value={schoolForm.location || ""} onChange={(event) => updateSchoolField("location", event.target.value)} /></Field>
          <Field label="Address"><input value={schoolForm.address || ""} onChange={(event) => updateSchoolField("address", event.target.value)} /></Field>
          <Field label="Email"><input value={schoolForm.email || ""} onChange={(event) => updateSchoolField("email", event.target.value)} /></Field>
          <Field label="Phone"><input value={schoolForm.phone || ""} onChange={(event) => updateSchoolField("phone", event.target.value)} /></Field>
          <Field label="Website"><input value={schoolForm.website || ""} onChange={(event) => updateSchoolField("website", event.target.value)} /></Field>
        </div>

        <div className="sbs-media-grid">
          <SchoolImageUploader label="School Logo" field="logo" helper="Official school logo stored on the school record." value={schoolForm.logo || ""} upload={uploadSchoolImage} clear={() => updateSchoolField("logo", "")} />
          <SchoolImageUploader label="School Banner" field="bannerImage" helper="General school banner stored on the school record." value={schoolForm.bannerImage || ""} upload={uploadSchoolImage} clear={() => updateSchoolField("bannerImage", "")} />
        </div>

        <button type="button" onClick={() => saveSchoolIdentity()} disabled={savingSchool} className="sbs-secondary-btn">
          {savingSchool ? "Saving School..." : "Save School Identity"}
        </button>
      </section>

      <section className="sbs-card">
        <SectionHead title="🏢 Branch Identity" text="Branch identity remains on the branch record. Settings below control the branch experience." />
        {!branchForm.id && <div className="sbs-notice">Select a branch above to edit branch identity.</div>}

        <div className="sbs-form-grid">
          <Field label="Branch Name"><input value={branchForm.name || ""} onChange={(event) => updateBranchField("name", event.target.value)} /></Field>
          <Field label="Branch Code"><input value={branchForm.code || ""} onChange={(event) => updateBranchField("code", event.target.value)} /></Field>
          <Field label="Location / City"><input value={branchForm.location || ""} onChange={(event) => { updateBranchField("location", event.target.value); updateBranchField("city", event.target.value); }} /></Field>
          <Field label="Address"><input value={branchForm.address || ""} onChange={(event) => updateBranchField("address", event.target.value)} /></Field>
          <Field label="Email"><input value={branchForm.email || ""} onChange={(event) => updateBranchField("email", event.target.value)} /></Field>
          <Field label="Phone"><input value={branchForm.phone || ""} onChange={(event) => updateBranchField("phone", event.target.value)} /></Field>
          <Field label="Website"><input value={branchForm.website || ""} onChange={(event) => updateBranchField("website", event.target.value)} /></Field>
        </div>

        <div className="sbs-media-grid">
          <BranchImageUploader label="Branch Logo" field="logo" helper="Optional branch-specific logo stored on the branch record." value={branchForm.logo || ""} upload={uploadBranchImage} clear={() => updateBranchField("logo", "")} />
          <BranchImageUploader label="Branch Banner" field="bannerImage" helper="Optional branch-specific banner stored on the branch record." value={branchForm.bannerImage || ""} upload={uploadBranchImage} clear={() => updateBranchField("bannerImage", "")} />
        </div>

        <button type="button" onClick={() => saveBranchIdentity()} disabled={savingBranch} className="sbs-secondary-btn">
          {savingBranch ? "Saving Branch..." : "Save Branch Identity"}
        </button>
      </section>

      <section className="sbs-card">
        <SectionHead title="🖼 Dashboard & Portal Images" text="These images belong only to the selected school branch settings row." />
        <div className="sbs-media-grid">
          <ImageUploader label="Dashboard Hero Image" field="dashboardHeroImage" helper="Main dashboard hero visual for this branch." value={form.dashboardHeroImage} upload={uploadImage} clear={() => updateForm("dashboardHeroImage", "")} />
          <ImageUploader label="Dashboard Banner Image" field="dashboardBannerImage" helper="Wide dashboard and finance banner visual for this branch." value={form.dashboardBannerImage} upload={uploadImage} clear={() => updateForm("dashboardBannerImage", "")} />
          <ImageUploader label="Student Portal Image" field="studentPortalImage" helper="Image used for student dashboard/portal cards in this branch." value={form.studentPortalImage} upload={uploadImage} clear={() => updateForm("studentPortalImage", "")} />
          <ImageUploader label="Teacher Portal Image" field="teacherPortalImage" helper="Image used for teacher dashboard/portal cards in this branch." value={form.teacherPortalImage} upload={uploadImage} clear={() => updateForm("teacherPortalImage", "")} />
          <ImageUploader label="Classroom Placeholder Image" field="classroomPlaceholderImage" helper="Image used for class/classroom cards in this branch." value={form.classroomPlaceholderImage} upload={uploadImage} clear={() => updateForm("classroomPlaceholderImage", "")} />
          <ImageUploader label="Subject Placeholder Image" field="subjectPlaceholderImage" helper="Image used for subject cards in this branch." value={form.subjectPlaceholderImage} upload={uploadImage} clear={() => updateForm("subjectPlaceholderImage", "")} />
        </div>
      </section>

      <section className="sbs-card">
        <SectionHead title="📄 Report Card Branding" text="These report card assets belong only to the selected school branch." />
        <div className="sbs-media-grid">
          <ImageUploader label="Report Background Image" field="reportCardBackgroundImage" helper="A light background image for this branch's printed report cards." value={form.reportCardBackgroundImage} upload={uploadImage} clear={() => updateForm("reportCardBackgroundImage", "")} />
          <ImageUploader label="Report Watermark" field="reportCardWatermark" helper="Used behind report card content for this branch." value={form.reportCardWatermark} upload={uploadImage} clear={() => updateForm("reportCardWatermark", "")} />
          <ImageUploader label="Official Signature Image" field="reportCardSignatureImage" helper="Used near the headteacher/principal signature section." value={form.reportCardSignatureImage} upload={uploadImage} clear={() => updateForm("reportCardSignatureImage", "")} />
          <ImageUploader label="Branch Settings Logo" field="logo" helper="Optional settings-level logo for this branch experience." value={form.logo} upload={uploadImage} clear={() => updateForm("logo", "")} />
        </div>
      </section>

      <section className="sbs-card">
        <SectionHead title="🖼 Branch Experience Gallery" text="Images stored on this branch settings row for dashboards, portals, or future visual experiences." />
        <div className="sbs-media-block">
          <div className="sbs-media-title">Gallery Images</div>
          <p>Used to bring the soul of the selected school branch into the app.</p>
          <input type="file" accept="image/*" multiple onChange={(event) => handleGalleryUpload(event.target.files)} />

          {!!form.schoolGalleryImages?.length && (
            <div className="sbs-gallery-grid">
              {form.schoolGalleryImages.map((image, index) => (
                <div key={`${image}-${index}`} className="sbs-gallery-item">
                  <img src={image} alt={`Gallery ${index + 1}`} />
                  <button type="button" onClick={() => removeGalleryImage(index)}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="sbs-card">
        <SectionHead title="🎨 Branch App Appearance" text="Theme, color and font now belong to this school branch only." />

        <div className="sbs-form-grid">
          <Field label="Font Family">
            <select value={form.fontFamily} onChange={(event) => updateForm("fontFamily", event.target.value)}>
              {fontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
            </select>
          </Field>

          <Field label="Font Size">
            <input type="number" min={12} max={22} value={form.fontSize} onChange={(event) => updateForm("fontSize", Number(event.target.value))} />
          </Field>

          <Field label="Primary Color">
            <input className="sbs-color-input" type="color" value={form.primaryColor} onChange={(event) => updateForm("primaryColor", event.target.value)} />
          </Field>

          <Field label="Theme">
            <select value={form.theme} onChange={(event) => updateForm("theme", event.target.value as "light" | "dark")}>
              <option value="light">Light Theme</option>
              <option value="dark">Dark Theme</option>
            </select>
          </Field>
        </div>

        <div className="sbs-preview" style={previewStyle}>
          <div className="sbs-preview-aa" style={{ background: form.primaryColor, color: getContrastTextColor(form.primaryColor) }}>Aa</div>
          <div>
            <strong>Live Branch Theme Preview</strong>
            <span>{selectedSchool?.name || "School"} · {selectedBranch?.name || "Branch"}</span>
          </div>
        </div>

        <button type="button" onClick={() => saveSchoolBranchSettings()} disabled={savingSettings} className="sbs-secondary-btn">
          {savingSettings ? "Saving Appearance..." : "Save Branch Settings"}
        </button>
      </section>

      <button type="button" onClick={saveAll} disabled={savingAll} className="sbs-sticky-save">
        {savingAll ? "Saving..." : "Save All Settings"}
      </button>
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function formSafeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function SectionHead({ title, text }: { title: string; text: string }) {
  return (
    <div className="sbs-section-head">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="sbs-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`sbs-chip ${tone}`}>{children}</span>;
}

function ImageUploader({ label, field, helper, value, upload, clear }: { label: string; field: ImageField; helper?: string; value: string; upload: (field: ImageField, file?: File) => void; clear: () => void }) {
  return (
    <div className="sbs-media-block">
      <div className="sbs-media-title">{label}</div>
      {helper && <p>{helper}</p>}
      <input type="file" accept="image/*" onChange={(event) => upload(field, event.target.files?.[0])} />
      {value && <ImagePreview label={label} value={value} clear={clear} />}
    </div>
  );
}

function SchoolImageUploader({ label, field, helper, value, upload, clear }: { label: string; field: keyof SchoolForm; helper?: string; value: string; upload: (field: keyof SchoolForm, file?: File) => void; clear: () => void }) {
  return (
    <div className="sbs-media-block">
      <div className="sbs-media-title">{label}</div>
      {helper && <p>{helper}</p>}
      <input type="file" accept="image/*" onChange={(event) => upload(field, event.target.files?.[0])} />
      {value && <ImagePreview label={label} value={value} clear={clear} />}
    </div>
  );
}

function BranchImageUploader({ label, field, helper, value, upload, clear }: { label: string; field: keyof BranchForm; helper?: string; value: string; upload: (field: keyof BranchForm, file?: File) => void; clear: () => void }) {
  return (
    <div className="sbs-media-block">
      <div className="sbs-media-title">{label}</div>
      {helper && <p>{helper}</p>}
      <input type="file" accept="image/*" onChange={(event) => upload(field, event.target.files?.[0])} />
      {value && <ImagePreview label={label} value={value} clear={clear} />}
    </div>
  );
}

function ImagePreview({ label, value, clear }: { label: string; value: string; clear: () => void }) {
  return (
    <div className="sbs-image-preview-wrap">
      <img src={value} alt={label} />
      <button type="button" onClick={clear}>Remove</button>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes sbsSpin { to { transform: rotate(360deg); } }

.sbs-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(86px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}
.sbs-page *, .sbs-page *::before, .sbs-page *::after { box-sizing: border-box; }
.sbs-page button, .sbs-page input, .sbs-page select, .sbs-page textarea { font: inherit; max-width: 100%; }
.sbs-page img { max-width: 100%; }
.sbs-page input,
.sbs-page select,
.sbs-page textarea {
  width: 100%;
  min-height: 43px;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 15px;
  padding: 0 12px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  outline: none;
  font-weight: 750;
}
.sbs-page input[type='file'] { padding: 10px; height: auto; font-size: 12px; }
.sbs-color-input { padding: 4px !important; height: 48px; }

.sbs-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}
.sbs-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.sbs-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.sbs-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--sbs-primary) 18%, transparent); border-top-color: var(--sbs-primary); animation: sbsSpin .8s linear infinite; }

.sbs-primary-btn,
.sbs-secondary-btn,
.sbs-sticky-save {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--sbs-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.sbs-secondary-btn { margin-top: 14px; }
.sbs-primary-btn:disabled,
.sbs-secondary-btn:disabled,
.sbs-sticky-save:disabled { opacity: .55; cursor: not-allowed; }

.sbs-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--sbs-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.sbs-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.sbs-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--sbs-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--sbs-primary) 28%, transparent); font-size: 22px; }
.sbs-title-wrap { min-width: 0; }
.sbs-title-wrap p, .sbs-title-wrap h2, .sbs-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbs-title-wrap p { margin: 0 0 2px; color: var(--sbs-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sbs-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.sbs-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.sbs-context-card,
.sbs-card {
  min-width: 0;
  margin-top: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
  padding: 13px;
}
.sbs-context-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, color-mix(in srgb, var(--sbs-primary) 10%, #fff), #fff 68%);
}
.sbs-context-card p { margin: 0; color: var(--sbs-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sbs-context-card h3 { margin: 4px 0 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.05em; }
.sbs-context-card span { display: block; margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.sbs-pill-row { display: flex; flex-wrap: wrap; gap: 7px; }

.sbs-section-head h3 { margin: 0; font-size: 18px; font-weight: 1000; letter-spacing: -.04em; }
.sbs-section-head p { margin: 5px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.55; }
.sbs-form-grid, .sbs-media-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; margin-top: 12px; }
.sbs-field { display: grid; gap: 6px; min-width: 0; }
.sbs-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }

.sbs-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sbs-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.sbs-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.sbs-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.sbs-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.sbs-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.sbs-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.sbs-media-block {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, .18);
  border-radius: 20px;
  padding: 12px;
  background: rgba(148, 163, 184, .06);
  overflow: hidden;
}
.sbs-media-title { font-weight: 1000; font-size: 13px; }
.sbs-media-block p { margin: 5px 0 10px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.sbs-image-preview-wrap { margin-top: 10px; display: grid; gap: 8px; }
.sbs-image-preview-wrap img { width: 100%; height: 132px; object-fit: cover; border-radius: 16px; border: 1px solid rgba(148, 163, 184, .18); }
.sbs-image-preview-wrap button {
  min-height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(239,68,68,.18);
  background: rgba(239,68,68,.08);
  color: #dc2626;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.sbs-gallery-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.sbs-gallery-item { position: relative; border-radius: 16px; overflow: hidden; border: 1px solid rgba(148, 163, 184, .18); }
.sbs-gallery-item img { width: 100%; height: 110px; object-fit: cover; display: block; }
.sbs-gallery-item button { position: absolute; top: 6px; right: 6px; width: 28px; height: 28px; border-radius: 999px; border: 0; background: rgba(239,68,68,.92); color: #fff; font-weight: 1000; cursor: pointer; }
.sbs-notice { margin-top: 10px; padding: 11px; border-radius: 16px; background: rgba(245,158,11,.12); color: #b45309; font-size: 12px; font-weight: 900; }
.sbs-preview { margin-top: 14px; display: flex; align-items: center; gap: 10px; border-radius: 20px; padding: 14px; border: 1px solid rgba(148,163,184,.22); }
.sbs-preview-aa { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 17px; font-weight: 1000; }
.sbs-preview strong, .sbs-preview span { display: block; }
.sbs-preview strong { font-size: 14px; font-weight: 1000; }
.sbs-preview span { margin-top: 3px; opacity: .72; font-size: 12px; font-weight: 750; }
.sbs-sticky-save {
  position: sticky;
  bottom: max(10px, env(safe-area-inset-bottom));
  width: 100%;
  margin-top: 12px;
  box-shadow: 0 18px 44px rgba(15, 23, 42, .22);
  z-index: 10;
}

@media (min-width: 680px) {
  .sbs-page { padding: 12px; }
  .sbs-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sbs-media-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sbs-gallery-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .sbs-page { padding: 16px; }
  .sbs-card, .sbs-context-card { padding: 16px; }
  .sbs-form-grid { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
  .sbs-media-grid { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  .sbs-gallery-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
}

@media (max-width: 520px) {
  .sbs-page { padding: 6px; padding-bottom: max(86px, env(safe-area-inset-bottom)); }
  .sbs-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .sbs-primary-btn { width: 100%; }
  .sbs-context-card, .sbs-card { border-radius: 20px; padding: 11px; }
  .sbs-secondary-btn { width: 100%; }
  .sbs-gallery-grid { grid-template-columns: 1fr; }
}
`;
