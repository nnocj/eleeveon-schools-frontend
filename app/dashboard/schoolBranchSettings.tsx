"use client";

/**
 * schoolBranchSettings.tsx
 * ---------------------------------------------------------
 * SCHOOL + BRANCH SETTINGS CENTER
 * ---------------------------------------------------------
 *
 * New architecture:
 * School -> Branch -> SchoolBranchSettings
 *
 * Every setting item is now scoped to the selected school branch:
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
 * This replaces the old global settings.tsx model.
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  Branch,
  School,
  SchoolBranchSetting,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// COLOR UTILITIES
// ======================================================

function darken(hex: string, factor = 0.35) {
  let col = (hex || "#2f6fed").replace("#", "");

  if (col.length === 3) {
    col = col
      .split("")
      .map(c => c + c)
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
      .map(c => c + c)
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
// OPTIONS
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

  // ======================================================
  // STATE
  // ======================================================

  const [schools, setSchools] = useState<School[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [settingsRows, setSettingsRows] = useState<SchoolBranchSetting[]>([]);

  const [form, setForm] = useState<SettingsForm>(defaultForm(activeSchoolId, activeBranchId));
  const [schoolForm, setSchoolForm] = useState<any>({});
  const [branchForm, setBranchForm] = useState<any>({});

  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSchool, setSavingSchool] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    const [schoolRows, branchRows, settingRows, structureRows, periodRows] = await Promise.all([
      db.schools.toArray(),
      db.branches.toArray(),
      db.schoolBranchSettings.toArray(),
      db.academicStructures.toArray(),
      db.academicPeriods.toArray(),
    ]);

    setSchools(schoolRows.filter(row => !row.isDeleted));
    setBranches(branchRows.filter(row => !row.isDeleted));
    setSettingsRows(settingRows.filter(row => !row.isDeleted));
    setAcademicStructures(structureRows.filter(row => !row.isDeleted));
    setAcademicPeriods(periodRows.filter(row => !row.isDeleted));
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // CURRENT SCHOOL / BRANCH SETTINGS
  // ======================================================

  const selectedSchoolId = activeSchoolId || form.schoolId;
  const selectedBranchId = activeBranchId || form.branchId;

  const selectedSchool = useMemo(() => {
    return (
      activeSchool ||
      schools.find(row => row.id === selectedSchoolId) ||
      contextSchools.find(row => row.id === selectedSchoolId) ||
      null
    );
  }, [activeSchool, schools, contextSchools, selectedSchoolId]);

  const selectedBranch = useMemo(() => {
    return (
      activeBranch ||
      branches.find(row => row.id === selectedBranchId) ||
      contextBranches.find(row => row.id === selectedBranchId) ||
      null
    );
  }, [activeBranch, branches, contextBranches, selectedBranchId]);

  const currentSchoolBranchSetting = useMemo(() => {
    if (!selectedSchoolId || !selectedBranchId) return undefined;

    return settingsRows.find(
      row => row.schoolId === selectedSchoolId && row.branchId === selectedBranchId
    );
  }, [settingsRows, selectedSchoolId, selectedBranchId]);

  // ======================================================
  // HYDRATE FORM
  // ======================================================

  useEffect(() => {
    if (!selectedSchoolId || !selectedBranchId) {
      setForm(defaultForm(selectedSchoolId, selectedBranchId));
      return;
    }

    const current = currentSchoolBranchSetting as any;

    setForm({
      ...defaultForm(selectedSchoolId, selectedBranchId),
      ...(current || {}),
      id: current?.id,
      schoolId: selectedSchoolId,
      branchId: selectedBranchId,
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
  }, [selectedSchoolId, selectedBranchId, currentSchoolBranchSetting?.id]);

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
    return branches.filter(branch => {
      if (!selectedSchoolId) return true;
      return branch.schoolId === Number(selectedSchoolId);
    });
  }, [branches, selectedSchoolId]);

  const filteredAcademicStructures = useMemo(() => {
    return academicStructures.filter(structure => {
      if (!selectedBranchId) return false;
      return structure.branchId === Number(selectedBranchId) && structure.active !== false;
    });
  }, [academicStructures, selectedBranchId]);

  const filteredAcademicPeriods = useMemo(() => {
    return academicPeriods
      .filter(period => {
        if (!selectedBranchId) return false;
        if (period.branchId !== Number(selectedBranchId)) return false;
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
  }, [academicPeriods, selectedBranchId, form.currentAcademicStructureId]);

  const activeStructure = useMemo(() => {
    return filteredAcademicStructures.find(row => row.id === form.currentAcademicStructureId);
  }, [filteredAcademicStructures, form.currentAcademicStructureId]);

  const activePeriod = useMemo(() => {
    return filteredAcademicPeriods.find(row => row.id === form.currentAcademicPeriodId);
  }, [filteredAcademicPeriods, form.currentAcademicPeriodId]);

  // ======================================================
  // FIELD HELPERS
  // ======================================================

  const updateForm = (key: keyof SettingsForm, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateSchoolField = (key: string, value: any) => {
    setSchoolForm((prev: any) => ({ ...prev, [key]: value }));
  };

  const updateBranchField = (key: string, value: any) => {
    setBranchForm((prev: any) => ({ ...prev, [key]: value }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>(resolve => {
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

  const uploadSchoolImage = async (field: string, file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateSchoolField(field, value);
  };

  const uploadBranchImage = async (field: string, file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateBranchField(field, value);
  };

  const handleGalleryUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const images = await Promise.all(Array.from(files).map(fileToBase64));
    setForm(prev => ({
      ...prev,
      schoolGalleryImages: [...(prev.schoolGalleryImages || []), ...images],
    }));
  };

  const removeGalleryImage = (index: number) => {
    setForm(prev => ({
      ...prev,
      schoolGalleryImages: (prev.schoolGalleryImages || []).filter((_, i) => i !== index),
    }));
  };

  // ======================================================
  // CONTEXT SWITCHERS
  // ======================================================

  const switchSchool = async (schoolId?: number) => {
    await setActiveSchoolId?.(schoolId || null);
    updateForm("schoolId", schoolId);
    updateForm("branchId", undefined);
    updateForm("currentAcademicStructureId", undefined);
    updateForm("currentAcademicPeriodId", undefined);
  };

  const switchBranch = async (branchId?: number) => {
    await setActiveBranchId?.(branchId || null);
    updateForm("branchId", branchId);
    updateForm("currentAcademicStructureId", undefined);
    updateForm("currentAcademicPeriodId", undefined);
  };

  // ======================================================
  // SAVE HANDLERS
  // ======================================================

  const saveSchoolBranchSettings = async () => {
    if (!selectedSchoolId) return alert("Select a school first");
    if (!selectedBranchId) return alert("Select a branch first");

    try {
      setSavingSettings(true);

      const payload = prepareSyncData({
        ...form,
        schoolId: Number(selectedSchoolId),
        branchId: Number(selectedBranchId),
        currentAcademicStructureId: form.currentAcademicStructureId || undefined,
        currentAcademicPeriodId: form.currentAcademicPeriodId || undefined,
        schoolGalleryImages: Array.isArray(form.schoolGalleryImages)
          ? form.schoolGalleryImages
          : [],
        isDeleted: false,
      }) as SchoolBranchSetting;

      if (currentSchoolBranchSetting?.id || form.id) {
        await db.schoolBranchSettings.update(currentSchoolBranchSetting?.id || form.id!, {
          schoolId: payload.schoolId,
          branchId: payload.branchId,
          mode: payload.mode,
          fontFamily: payload.fontFamily,
          fontSize: payload.fontSize,
          primaryColor: payload.primaryColor,
          theme: payload.theme,
          currentTerm: payload.currentTerm,
          academicYear: payload.academicYear,
          currentAcademicStructureId: payload.currentAcademicStructureId,
          currentAcademicPeriodId: payload.currentAcademicPeriodId,
          logo: payload.logo,
          reportCardBackgroundImage: payload.reportCardBackgroundImage,
          reportCardWatermark: payload.reportCardWatermark,
          reportCardSignatureImage: payload.reportCardSignatureImage,
          dashboardHeroImage: payload.dashboardHeroImage,
          dashboardBannerImage: payload.dashboardBannerImage,
          studentPortalImage: payload.studentPortalImage,
          teacherPortalImage: payload.teacherPortalImage,
          classroomPlaceholderImage: payload.classroomPlaceholderImage,
          subjectPlaceholderImage: payload.subjectPlaceholderImage,
          schoolGalleryImages: payload.schoolGalleryImages,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        } as any);
      } else {
        await db.schoolBranchSettings.add(payload);
      }

      await load();
      alert("School branch settings saved successfully");
    } catch (error) {
      console.error("Failed to save school branch settings:", error);
      alert("Failed to save school branch settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const saveSchoolIdentity = async () => {
    if (!schoolForm.id) return alert("Select a school first");
    if (!schoolForm.name?.trim()) return alert("School name is required");

    try {
      setSavingSchool(true);

      await db.schools.update(schoolForm.id, {
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
      alert("School identity saved successfully");
    } catch (error) {
      console.error("Failed to save school identity:", error);
      alert("Failed to save school identity");
    } finally {
      setSavingSchool(false);
    }
  };

  const saveBranchIdentity = async () => {
    if (!branchForm.id) return alert("Select a branch first");
    if (!branchForm.name?.trim()) return alert("Branch name is required");

    try {
      setSavingBranch(true);

      await db.branches.update(branchForm.id, {
        name: branchForm.name.trim(),
        code: branchForm.code?.trim() || undefined,
        logo: branchForm.logo || undefined,
        bannerImage: branchForm.bannerImage || undefined,
        address: branchForm.address?.trim() || undefined,
        city: branchForm.city?.trim() || branchForm.location?.trim() || undefined,
        email: branchForm.email?.trim() || undefined,
        phone: branchForm.phone?.trim() || undefined,
        website: branchForm.website?.trim() || undefined,
        active: branchForm.active !== false,
        updatedAt: Date.now(),
      } as any);

      await load();
      await refreshInstitution?.();
      alert("Branch identity saved successfully");
    } catch (error) {
      console.error("Failed to save branch identity:", error);
      alert("Failed to save branch identity");
    } finally {
      setSavingBranch(false);
    }
  };

  const saveAll = async () => {
    setLoading(true);

    try {
      if (schoolForm.id) {
        await db.schools.update(schoolForm.id, {
          name: schoolForm.name?.trim() || undefined,
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
      }

      if (branchForm.id) {
        await db.branches.update(branchForm.id, {
          name: branchForm.name?.trim() || undefined,
          code: branchForm.code?.trim() || undefined,
          logo: branchForm.logo || undefined,
          bannerImage: branchForm.bannerImage || undefined,
          address: branchForm.address?.trim() || undefined,
          city: branchForm.city?.trim() || branchForm.location?.trim() || undefined,
          email: branchForm.email?.trim() || undefined,
          phone: branchForm.phone?.trim() || undefined,
          website: branchForm.website?.trim() || undefined,
          active: branchForm.active !== false,
          updatedAt: Date.now(),
        } as any);
      }

      await saveSchoolBranchSettings();
      await refreshInstitution?.();
    } finally {
      setLoading(false);
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
  // IMAGE RENDERERS
  // ======================================================

  const renderImageUploader = (label: string, field: ImageField, helper?: string) => (
    <div style={styles.mediaBlock}>
      <div style={styles.mediaTitle}>{label}</div>
      {helper && <div style={styles.helper}>{helper}</div>}

      <input
        type="file"
        accept="image/*"
        onChange={e => uploadImage(field, e.target.files?.[0])}
        style={styles.input}
      />

      {form[field] && (
        <div style={styles.imagePreviewWrap}>
          <img src={form[field]} alt={label} style={styles.imagePreview} />
          <button type="button" onClick={() => updateForm(field, "")} style={styles.smallDangerButton}>
            Remove
          </button>
        </div>
      )}
    </div>
  );

  const renderSchoolImageUploader = (label: string, field: string, helper?: string) => (
    <div style={styles.mediaBlock}>
      <div style={styles.mediaTitle}>{label}</div>
      {helper && <div style={styles.helper}>{helper}</div>}

      <input
        type="file"
        accept="image/*"
        onChange={e => uploadSchoolImage(field, e.target.files?.[0])}
        style={styles.input}
      />

      {schoolForm[field] && (
        <div style={styles.imagePreviewWrap}>
          <img src={schoolForm[field]} alt={label} style={styles.imagePreview} />
          <button type="button" onClick={() => updateSchoolField(field, "")} style={styles.smallDangerButton}>
            Remove
          </button>
        </div>
      )}
    </div>
  );

  const renderBranchImageUploader = (label: string, field: string, helper?: string) => (
    <div style={styles.mediaBlock}>
      <div style={styles.mediaTitle}>{label}</div>
      {helper && <div style={styles.helper}>{helper}</div>}

      <input
        type="file"
        accept="image/*"
        onChange={e => uploadBranchImage(field, e.target.files?.[0])}
        style={styles.input}
      />

      {branchForm[field] && (
        <div style={styles.imagePreviewWrap}>
          <img src={branchForm[field]} alt={label} style={styles.imagePreview} />
          <button type="button" onClick={() => updateBranchField(field, "")} style={styles.smallDangerButton}>
            Remove
          </button>
        </div>
      )}
    </div>
  );

  // ======================================================
  // LOADING
  // ======================================================

  if (contextLoading) {
    return <div style={styles.container}>Loading school branch settings...</div>;
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>⚙ School Branch Settings</h2>
          <p style={styles.subtitle}>
            Configure settings for the selected school and branch. Every setting here belongs to this branch context.
          </p>
        </div>

        <button type="button" onClick={saveAll} disabled={loading} style={styles.primaryButton}>
          {loading ? "Saving..." : "Save All Settings"}
        </button>
      </div>

      {/* CONTEXT AWARENESS */}
      <section style={styles.sectionHero}>
        <div>
          <div style={styles.kicker}>Active Settings Context</div>
          <h3 style={{ margin: "6px 0", fontSize: 24 }}>
            {selectedSchool?.name || "No School Selected"}
          </h3>
          <p style={{ margin: 0, opacity: 0.78 }}>
            {selectedBranch?.name || "No Branch Selected"}
            {activeStructure ? ` • ${activeStructure.name}` : ""}
            {activePeriod ? ` • ${activePeriod.name}` : ""}
          </p>
        </div>

        <div style={styles.contextPills}>
          <span style={styles.pill}>School</span>
          <span style={styles.pill}>Branch</span>
          <span style={styles.pill}>Scoped Settings</span>
          <span style={styles.pill}>No Global Settings</span>
        </div>
      </section>

      {/* CONTEXT SWITCHING + ACADEMIC DEFAULTS */}
      <section style={styles.section}>
        <h3>📚 School, Branch & Academic Defaults</h3>
        <p style={styles.sectionText}>
          Select the school branch whose settings you want to edit, then set its current academic defaults.
        </p>

        <div style={styles.gridTwo}>
          <select
            value={selectedSchoolId || ""}
            onChange={e => switchSchool(Number(e.target.value) || undefined)}
            style={styles.input}
          >
            <option value="">Select School</option>
            {schools.map(school => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>

          <select
            value={selectedBranchId || ""}
            onChange={e => switchBranch(Number(e.target.value) || undefined)}
            style={styles.input}
          >
            <option value="">Select Active Branch</option>
            {filteredBranches.map(branch => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>

          <select
            value={form.currentAcademicStructureId || ""}
            onChange={e => {
              updateForm("currentAcademicStructureId", Number(e.target.value) || undefined);
              updateForm("currentAcademicPeriodId", undefined);
            }}
            style={styles.input}
          >
            <option value="">Select Academic Structure</option>
            {filteredAcademicStructures.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.level})
              </option>
            ))}
          </select>

          <select
            value={form.currentAcademicPeriodId || ""}
            onChange={e => updateForm("currentAcademicPeriodId", Number(e.target.value) || undefined)}
            style={styles.input}
          >
            <option value="">Select Academic Period</option>
            {filteredAcademicPeriods.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <input
            placeholder="Academic Year"
            value={form.academicYear || ""}
            onChange={e => updateForm("academicYear", e.target.value)}
            style={styles.input}
          />

          <select
            value={form.currentTerm || "Term 1"}
            onChange={e => updateForm("currentTerm", e.target.value)}
            style={styles.input}
          >
            <option>Term 1</option>
            <option>Term 2</option>
            <option>Term 3</option>
            <option>Semester 1</option>
            <option>Semester 2</option>
          </select>

          <select value={form.mode} onChange={e => updateForm("mode", e.target.value)} style={styles.input}>
            <option value="manual">Manual Mode</option>
            <option value="auto">Auto Mode</option>
          </select>
        </div>

        <button type="button" onClick={saveSchoolBranchSettings} disabled={savingSettings} style={styles.secondaryButton}>
          {savingSettings ? "Saving Defaults..." : "Save Branch Academic Defaults"}
        </button>
      </section>

      {/* SCHOOL IDENTITY */}
      <section style={styles.section}>
        <h3>🏫 School Identity</h3>
        <p style={styles.sectionText}>
          School identity remains on the school record. Branch-specific experience lives in SchoolBranchSettings.
        </p>

        <div style={styles.gridTwo}>
          <input placeholder="School Name" value={schoolForm.name || ""} onChange={e => updateSchoolField("name", e.target.value)} style={styles.input} />
          <input placeholder="Motto" value={schoolForm.motto || ""} onChange={e => updateSchoolField("motto", e.target.value)} style={styles.input} />
          <input placeholder="Location" value={schoolForm.location || ""} onChange={e => updateSchoolField("location", e.target.value)} style={styles.input} />
          <input placeholder="Address" value={schoolForm.address || ""} onChange={e => updateSchoolField("address", e.target.value)} style={styles.input} />
          <input placeholder="Email" value={schoolForm.email || ""} onChange={e => updateSchoolField("email", e.target.value)} style={styles.input} />
          <input placeholder="Phone" value={schoolForm.phone || ""} onChange={e => updateSchoolField("phone", e.target.value)} style={styles.input} />
          <input placeholder="Website" value={schoolForm.website || ""} onChange={e => updateSchoolField("website", e.target.value)} style={styles.input} />
        </div>

        <div style={styles.mediaGrid}>
          {renderSchoolImageUploader("School Logo", "logo", "Official school logo stored on the school record.")}
          {renderSchoolImageUploader("School Banner", "bannerImage", "General school banner stored on the school record.")}
        </div>

        <button type="button" onClick={saveSchoolIdentity} disabled={savingSchool} style={styles.secondaryButton}>
          {savingSchool ? "Saving School..." : "Save School Identity"}
        </button>
      </section>

      {/* BRANCH IDENTITY */}
      <section style={styles.section}>
        <h3>🏢 Branch Identity</h3>
        <p style={styles.sectionText}>
          Branch identity remains on the branch record. Settings below control the branch experience.
        </p>

        {!branchForm.id && <div style={styles.notice}>Select a branch above to edit branch identity.</div>}

        <div style={styles.gridTwo}>
          <input placeholder="Branch Name" value={branchForm.name || ""} onChange={e => updateBranchField("name", e.target.value)} style={styles.input} />
          <input placeholder="Branch Code" value={branchForm.code || ""} onChange={e => updateBranchField("code", e.target.value)} style={styles.input} />
          <input placeholder="Location / City" value={branchForm.location || ""} onChange={e => { updateBranchField("location", e.target.value); updateBranchField("city", e.target.value); }} style={styles.input} />
          <input placeholder="Address" value={branchForm.address || ""} onChange={e => updateBranchField("address", e.target.value)} style={styles.input} />
          <input placeholder="Email" value={branchForm.email || ""} onChange={e => updateBranchField("email", e.target.value)} style={styles.input} />
          <input placeholder="Phone" value={branchForm.phone || ""} onChange={e => updateBranchField("phone", e.target.value)} style={styles.input} />
          <input placeholder="Website" value={branchForm.website || ""} onChange={e => updateBranchField("website", e.target.value)} style={styles.input} />
        </div>

        <div style={styles.mediaGrid}>
          {renderBranchImageUploader("Branch Logo", "logo", "Optional branch-specific logo stored on the branch record.")}
          {renderBranchImageUploader("Branch Banner", "bannerImage", "Optional branch-specific banner stored on the branch record.")}
        </div>

        <button type="button" onClick={saveBranchIdentity} disabled={savingBranch} style={styles.secondaryButton}>
          {savingBranch ? "Saving Branch..." : "Save Branch Identity"}
        </button>
      </section>

      {/* BRANCH DASHBOARD / PORTAL ASSETS */}
      <section style={styles.section}>
        <h3>🖼 Dashboard & Portal Images</h3>
        <p style={styles.sectionText}>
          These images belong only to the selected school branch settings row.
        </p>

        <div style={styles.mediaGrid}>
          {renderImageUploader("Dashboard Hero Image", "dashboardHeroImage", "Main dashboard hero visual for this branch.")}
          {renderImageUploader("Dashboard Banner Image", "dashboardBannerImage", "Wide dashboard and finance banner visual for this branch.")}
          {renderImageUploader("Student Portal Image", "studentPortalImage", "Image used for student dashboard/portal cards in this branch.")}
          {renderImageUploader("Teacher Portal Image", "teacherPortalImage", "Image used for teacher dashboard/portal cards in this branch.")}
          {renderImageUploader("Classroom Placeholder Image", "classroomPlaceholderImage", "Image used for class/classroom cards in this branch.")}
          {renderImageUploader("Subject Placeholder Image", "subjectPlaceholderImage", "Image used for subject cards in this branch.")}
        </div>
      </section>

      {/* REPORT BRANDING */}
      <section style={styles.section}>
        <h3>📄 Report Card Branding</h3>
        <p style={styles.sectionText}>
          These report card assets belong only to the selected school branch.
        </p>

        <div style={styles.mediaGrid}>
          {renderImageUploader("Report Background Image", "reportCardBackgroundImage", "A light background image for this branch's printed report cards.")}
          {renderImageUploader("Report Watermark", "reportCardWatermark", "Used behind report card content for this branch.")}
          {renderImageUploader("Official Signature Image", "reportCardSignatureImage", "Used near the headteacher/principal signature section for this branch.")}
          {renderImageUploader("Branch Settings Logo", "logo", "Optional settings-level logo for this branch experience.")}
        </div>
      </section>

      {/* GALLERY */}
      <section style={styles.section}>
        <h3>🖼 Branch Experience Gallery</h3>
        <p style={styles.sectionText}>
          Images stored on this branch settings row for dashboards, portals, or future visual experiences.
        </p>

        <div style={styles.mediaBlock}>
          <div style={styles.mediaTitle}>Gallery Images</div>
          <div style={styles.helper}>Used to bring the soul of the selected school branch into the app.</div>

          <input type="file" accept="image/*" multiple onChange={e => handleGalleryUpload(e.target.files)} style={styles.input} />

          {!!form.schoolGalleryImages?.length && (
            <div style={styles.galleryGrid}>
              {form.schoolGalleryImages.map((image: string, index: number) => (
                <div key={`${image}-${index}`} style={styles.galleryItem}>
                  <img src={image} alt={`Gallery ${index + 1}`} style={styles.galleryImage} />
                  <button type="button" onClick={() => removeGalleryImage(index)} style={styles.galleryRemove}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* APPEARANCE */}
      <section style={styles.section}>
        <h3>🎨 Branch App Appearance</h3>
        <p style={styles.sectionText}>
          Theme, color and font now belong to this school branch only.
        </p>

        <div style={styles.gridTwo}>
          <select value={form.fontFamily} onChange={e => updateForm("fontFamily", e.target.value)} style={styles.input}>
            {fontOptions.map(font => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>

          <input type="number" min={12} max={22} value={form.fontSize} onChange={e => updateForm("fontSize", Number(e.target.value))} style={styles.input} placeholder="Font Size" />
          <input type="color" value={form.primaryColor} onChange={e => updateForm("primaryColor", e.target.value)} style={{ ...styles.input, height: 48 }} />

          <select value={form.theme} onChange={e => updateForm("theme", e.target.value as "light" | "dark")} style={styles.input}>
            <option value="light">Light Theme</option>
            <option value="dark">Dark Theme</option>
          </select>
        </div>

        <div style={{ ...styles.preview, ...previewStyle }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: form.primaryColor,
                color: getContrastTextColor(form.primaryColor),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
              }}
            >
              Aa
            </div>
            <div>
              <strong>Live Branch Theme Preview</strong>
              <div style={{ opacity: 0.72, fontSize: 13 }}>
                {selectedSchool?.name || "School"} • {selectedBranch?.name || "Branch"}
              </div>
            </div>
          </div>
        </div>

        <button type="button" onClick={saveSchoolBranchSettings} disabled={savingSettings} style={styles.secondaryButton}>
          {savingSettings ? "Saving Appearance..." : "Save Branch Settings"}
        </button>
      </section>

      <button type="button" onClick={saveAll} disabled={loading} style={styles.stickySaveButton}>
        {loading ? "Saving..." : "Save All Settings"}
      </button>
    </div>
  );
}

// ======================================================
// STYLES
// ======================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 20,
    color: "var(--text)",
    background: "var(--bg)",
    minHeight: "100vh",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 18,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 950,
    letterSpacing: -0.4,
  },
  subtitle: {
    margin: "6px 0 0",
    opacity: 0.72,
    fontWeight: 650,
    fontSize: 13,
  },
  sectionHero: {
    background: "linear-gradient(135deg, rgba(47,111,237,0.16), rgba(255,255,255,0.08))",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 24,
    padding: 22,
    marginBottom: 18,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  },
  kicker: {
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    opacity: 0.65,
  },
  contextPills: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  pill: {
    borderRadius: 999,
    padding: "7px 10px",
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(0,0,0,0.08)",
    fontSize: 12,
    fontWeight: 850,
    color: "#111827",
  },
  section: {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 20,
    marginBottom: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  },
  sectionText: {
    marginTop: -4,
    marginBottom: 14,
    opacity: 0.68,
    fontSize: 13,
    fontWeight: 650,
  },
  gridTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
    gap: 12,
  },
  mediaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
    gap: 14,
    marginTop: 14,
  },
  input: {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 650,
    boxSizing: "border-box",
  },
  primaryButton: {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: "var(--primary-color)",
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(0,0,0,0.16)",
  },
  secondaryButton: {
    marginTop: 16,
    padding: "11px 14px",
    borderRadius: 13,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--primary-color)",
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
  },
  stickySaveButton: {
    position: "sticky",
    bottom: 18,
    width: "100%",
    padding: 15,
    borderRadius: 16,
    border: "none",
    background: "var(--primary-color)",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 16px 34px rgba(0,0,0,0.22)",
  },
  mediaBlock: {
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 18,
    padding: 14,
    background: "rgba(255,255,255,0.04)",
  },
  mediaTitle: {
    fontWeight: 900,
    marginBottom: 5,
  },
  helper: {
    opacity: 0.64,
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 1.45,
  },
  imagePreviewWrap: {
    marginTop: 12,
    display: "grid",
    gap: 8,
  },
  imagePreview: {
    width: "100%",
    height: 140,
    objectFit: "cover",
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.08)",
  },
  smallDangerButton: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(239,68,68,0.2)",
    background: "rgba(239,68,68,0.08)",
    color: "#dc2626",
    fontWeight: 850,
    cursor: "pointer",
  },
  galleryGrid: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
    gap: 12,
  },
  galleryItem: {
    position: "relative",
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid rgba(0,0,0,0.08)",
  },
  galleryImage: {
    width: "100%",
    height: 110,
    objectFit: "cover",
    display: "block",
  },
  galleryRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 999,
    border: "none",
    background: "rgba(239,68,68,0.9)",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  preview: {
    marginTop: 16,
    borderRadius: 18,
    padding: 18,
    border: "1px solid rgba(0,0,0,0.08)",
  },
  notice: {
    padding: 12,
    borderRadius: 14,
    background: "rgba(245,158,11,0.12)",
    color: "#b45309",
    fontWeight: 800,
    marginBottom: 12,
  },
};
