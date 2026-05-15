"use client";

/**
 * Schools.tsx
 * ---------------------------------------------------------
 * INSTITUTION PROFILE & BRANDING CENTER
 * ---------------------------------------------------------
 *
 * DB table: schools
 *
 * PURPOSE
 * ---------------------------------------------------------
 * This page creates and manages School records.
 * It also gives true school-level insight.
 *
 * Important distinction:
 * - Page-level analytics = institution portfolio overview
 * - Each school card = counts only for that specific school
 *
 * This avoids confusing totals where branches, students and teachers
 * from different schools appear as if they belong to one school.
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  Branch,
  Class,
  ClassSubject,
  School,
  Student,
  Subject,
  Teacher,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type FormState = {
  id?: number;
  name: string;
  logo?: string;
  motto?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  photo?: string;
  bannerImage?: string;
  galleryImages?: string[];
};

type SchoolView = {
  row: School;
  branchCount: number;
  activeBranchCount: number;
  studentCount: number;
  teacherCount: number;
  classCount: number;
  subjectCount: number;
  academicStructureCount: number;
  academicPeriodCount: number;
  classSubjectCount: number;
  branchNames: string[];
  completeness: number;
};

// ======================================================
// COMPONENT
// ======================================================

export default function SchoolsPage() {
  const { settings } = useSettings();
  const {
    activeSchoolId,
    activeSchool,
    setActiveSchoolId,
    refreshInstitution,
  } = useActiveBranch();

  const primary = settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<School[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);

  const [search, setSearch] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
    name: "",
    logo: "",
    motto: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    photo: "",
    bannerImage: "",
    galleryImages: [],
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [
        schoolRows,
        branchRows,
        studentRows,
        teacherRows,
        classRows,
        subjectRows,
        structureRows,
        periodRows,
        classSubjectRows,
      ] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
        db.students.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.classSubjects.toArray(),
      ]);

      setRows(schoolRows.filter(row => !row.isDeleted));
      setBranches(branchRows.filter(row => !row.isDeleted));
      setStudents(studentRows.filter(row => !row.isDeleted && row.status !== "withdrawn"));
      setTeachers(teacherRows.filter(row => !row.isDeleted));
      setClasses(classRows.filter(row => !row.isDeleted));
      setSubjects(subjectRows.filter(row => !row.isDeleted));
      setAcademicStructures(structureRows.filter(row => !row.isDeleted));
      setAcademicPeriods(periodRows.filter(row => !row.isDeleted));
      setClassSubjects(classSubjectRows.filter(row => !row.isDeleted));
    } catch (error) {
      console.error("Failed to load schools:", error);
      alert("Failed to load schools");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // SCHOOL-SPECIFIC VIEW MODEL
  // ======================================================

  const viewRows = useMemo<SchoolView[]>(() => {
    return rows.map(row => {
      const schoolBranches = branches.filter(branch => branch.schoolId === row.id);
      const activeBranches = schoolBranches.filter(branch => branch.active !== false);
      const branchIds = new Set(schoolBranches.map(branch => branch.id));

      const schoolStudents = students.filter(student => branchIds.has(student.branchId));
      const schoolTeachers = teachers.filter(teacher => branchIds.has(teacher.branchId));
      const schoolClasses = classes.filter(classRow => branchIds.has(classRow.branchId));
      const schoolSubjects = subjects.filter(subject => branchIds.has(subject.branchId));
      const schoolStructures = academicStructures.filter(structure => branchIds.has(structure.branchId));
      const schoolPeriods = academicPeriods.filter(period => branchIds.has(period.branchId));
      const schoolClassSubjects = classSubjects.filter(classSubject => branchIds.has(classSubject.branchId));

      const completenessChecks = [
        !!row.name,
        !!row.logo,
        !!row.motto,
        !!row.phone || !!row.email,
        !!row.address,
        schoolBranches.length > 0,
        schoolStudents.length > 0,
        schoolTeachers.length > 0,
        schoolClasses.length > 0,
        schoolSubjects.length > 0,
      ];

      const completeness = Math.round(
        (completenessChecks.filter(Boolean).length / completenessChecks.length) * 100
      );

      return {
        row,
        branchCount: schoolBranches.length,
        activeBranchCount: activeBranches.length,
        studentCount: schoolStudents.length,
        teacherCount: schoolTeachers.length,
        classCount: schoolClasses.length,
        subjectCount: schoolSubjects.length,
        academicStructureCount: schoolStructures.length,
        academicPeriodCount: schoolPeriods.length,
        classSubjectCount: schoolClassSubjects.length,
        branchNames: schoolBranches.map(branch => branch.name).slice(0, 4),
        completeness,
      };
    });
  }, [
    rows,
    branches,
    students,
    teachers,
    classes,
    subjects,
    academicStructures,
    academicPeriods,
    classSubjects,
  ]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter(item => {
        if (!query) return true;
        const row = item.row;

        return `
          ${row.name}
          ${row.motto || ""}
          ${row.phone || ""}
          ${row.email || ""}
          ${row.address || ""}
          ${row.website || ""}
          ${item.branchNames.join(" ")}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name));
  }, [viewRows, search]);

  // ======================================================
  // PORTFOLIO INSIGHTS
  // ======================================================

  const portfolio = useMemo(() => {
    const activeBranches = branches.filter(branch => branch.active !== false);
    const schoolsWithBranches = viewRows.filter(item => item.branchCount > 0).length;
    const schoolsReadyForOperations = viewRows.filter(item => item.completeness >= 70).length;
    const unassignedSchools = viewRows.filter(item => item.branchCount === 0).length;

    return {
      schools: rows.length,
      activeBranches: activeBranches.length,
      schoolsWithBranches,
      schoolsReadyForOperations,
      unassignedSchools,
    };
  }, [rows, branches, viewRows]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (
    field: "logo" | "photo" | "bannerImage",
    file?: File
  ) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [field]: value });
  };

  const handleGalleryUpload = async (files?: FileList | null) => {
    if (!files?.length) return;

    const images = await Promise.all(Array.from(files).map(fileToBase64));

    setForm(prev => ({
      ...prev,
      galleryImages: [...(prev.galleryImages || []), ...images],
    }));
  };

  const removeGalleryImage = (index: number) => {
    setForm(prev => ({
      ...prev,
      galleryImages: (prev.galleryImages || []).filter((_, i) => i !== index),
    }));
  };

  const openCreate = () => {
    setEditMode(false);

    setForm({
      name: "",
      logo: "",
      motto: "",
      phone: "",
      email: "",
      address: "",
      website: "",
      photo: "",
      bannerImage: "",
      galleryImages: [],
    });

    setDrawerOpen(true);
  };

  const openEdit = (row: School) => {
    setEditMode(true);

    setForm({
      id: row.id,
      name: row.name,
      logo: row.logo || "",
      motto: row.motto || "",
      phone: row.phone || "",
      email: row.email || "",
      address: row.address || "",
      website: row.website || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      galleryImages: row.galleryImages || [],
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!form.name.trim()) return "Enter school name";

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;
      return row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
    });

    if (duplicate) return "A school with this name already exists";

    return null;
  };

  const save = async () => {
    const error = validate();
    if (error) {
      alert(error);
      return;
    }

    try {
      setSaving(true);

      const payload = prepareSyncData({
        name: form.name.trim(),
        logo: form.logo || undefined,
        motto: form.motto?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        email: form.email?.trim() || undefined,
        address: form.address?.trim() || undefined,
        website: form.website?.trim() || undefined,
        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,
        galleryImages: form.galleryImages || [],
      }) as School;

      let savedSchoolId = form.id;

      if (editMode && form.id) {
        await db.schools.update(form.id, {
          name: payload.name,
          logo: payload.logo,
          motto: payload.motto,
          phone: payload.phone,
          email: payload.email,
          address: payload.address,
          website: payload.website,
          photo: payload.photo,
          bannerImage: payload.bannerImage,
          galleryImages: payload.galleryImages,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: payload.isDeleted,
        } as any);
      } else {
        const id = await db.schools.add(payload);
        savedSchoolId = Number(id);
      }

      await refreshInstitution();

      if (savedSchoolId && !activeSchoolId) {
        await setActiveSchoolId(savedSchoolId);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save school:", error);
      alert("Failed to save school");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const schoolView = viewRows.find(item => item.row.id === id);
    const branchCount = schoolView?.branchCount || 0;

    if (branchCount) {
      const proceed = confirm(
        `This school has ${branchCount} branch(es). Delete anyway?`
      );
      if (!proceed) return;
    } else {
      if (!confirm("Delete this school?")) return;
    }

    await db.schools.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    if (activeSchoolId === id) {
      await setActiveSchoolId(null);
    }

    await refreshInstitution();
    await load();
  };

  const makeActiveSchool = async (id?: number) => {
    if (!id) return;
    await setActiveSchoolId(id);
    await refreshInstitution();
  };

  // ======================================================
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 650,
  };

  const label: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 12,
    opacity: 0.72,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  const button: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
  };

  const ghostButton: React.CSSProperties = {
    padding: "10px 13px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 750,
    cursor: "pointer",
  };

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 9px",
      borderRadius: 999,
      background: tones.bg,
      color: tones.color,
      fontSize: 11,
      fontWeight: 850,
    };
  };

  const renderImageInput = (
    title: string,
    field: "logo" | "photo" | "bannerImage",
    fit: "contain" | "cover" = "cover"
  ) => (
    <div>
      <label style={label}>{title}</label>
      <input
        type="file"
        accept="image/*"
        onChange={e => handleImageUpload(field, e.target.files?.[0])}
        style={input}
      />
      {form[field] && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src={form[field]}
            alt={title}
            style={{
              height: field === "bannerImage" ? 120 : 86,
              width: field === "bannerImage" ? "100%" : 120,
              borderRadius: 14,
              objectFit: fit,
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          />
        </div>
      )}
    </div>
  );

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return <div style={{ padding: 20 }}>Loading schools...</div>;
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Schools</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Manage school identity and view true school-level reach across branches.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Create School
        </button>
      </div>

      {/* PORTFOLIO ANALYTICS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>School Profiles</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{portfolio.schools}</div>
          <div style={{ marginTop: 4, opacity: 0.58, fontSize: 12 }}>Total institutions created</div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active Branches</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{portfolio.activeBranches}</div>
          <div style={{ marginTop: 4, opacity: 0.58, fontSize: 12 }}>Across all schools</div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Schools With Branches</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{portfolio.schoolsWithBranches}</div>
          <div style={{ marginTop: 4, opacity: 0.58, fontSize: 12 }}>Ready for branch operations</div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Needs Branch Setup</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{portfolio.unassignedSchools}</div>
          <div style={{ marginTop: 4, opacity: 0.58, fontSize: 12 }}>Schools without branches</div>
        </div>
      </div>

      {/* FILTER */}
      <div style={{ ...card, marginTop: 18 }}>
        <input
          placeholder="Search school, motto, phone, email, website, branch..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />
      </div>

      {/* LIST */}
      <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
        {filteredRows.map(item => {
          const row = item.row;
          const isActiveSchool = activeSchoolId === row.id;

          return (
            <div key={row.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
              {(row.bannerImage || row.photo) && (
                <div
                  style={{
                    height: 130,
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.58), rgba(15,23,42,0.14)), url(${row.bannerImage || row.photo})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              )}

              <div
                style={{
                  padding: 18,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 15, minWidth: 0 }}>
                  <div
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: 22,
                      background: row.logo
                        ? `#fff url(${row.logo}) center/contain no-repeat`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 950,
                      flex: "0 0 68px",
                      border: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    {!row.logo && row.name.slice(0, 2).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 950 }}>{row.name}</div>
                      {isActiveSchool && <span style={badge("blue")}>Current school</span>}
                      <span style={badge(item.completeness >= 70 ? "green" : "orange")}>
                        {item.completeness}% complete
                      </span>
                    </div>

                    {row.motto && (
                      <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13, fontStyle: "italic" }}>
                        “{row.motto}”
                      </div>
                    )}

                    <div style={{ marginTop: 8, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                      {row.address || "No address"} {row.website ? `• ${row.website}` : ""}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("blue")}>{item.branchCount} branch(es)</span>
                      <span style={badge("green")}>{item.activeBranchCount} active</span>
                      <span style={badge("gray")}>{item.studentCount} students</span>
                      <span style={badge("gray")}>{item.teacherCount} teachers</span>
                      <span style={badge("gray")}>{item.classCount} classes</span>
                      <span style={badge("gray")}>{item.subjectCount} subjects</span>
                      <span style={badge("orange")}>{item.classSubjectCount} class subjects</span>
                    </div>

                    {!!item.branchNames.length && (
                      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
                        Branches: {item.branchNames.join(", ")}
                        {item.branchCount > item.branchNames.length ? "..." : ""}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {!isActiveSchool && (
                    <button style={ghostButton} onClick={() => makeActiveSchool(row.id)}>
                      Switch to School
                    </button>
                  )}
                  <button style={ghostButton} onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => remove(row.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!filteredRows.length && (
          <div style={{ ...card, textAlign: "center", padding: 30 }}>No schools found.</div>
        )}
      </div>

      {/* DRAWER */}
      {drawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            justifyContent: "flex-end",
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            style={{
              width: "min(580px, 100vw)",
              height: "100vh",
              background: "var(--surface)",
              color: "var(--text)",
              boxShadow: "-20px 0 50px rgba(0,0,0,0.25)",
              padding: 22,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                  {editMode ? "Edit School" : "Create School"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Define the official institutional identity and branding.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>School Name</label>
                <input
                  value={form.name}
                  onChange={e => updateForm({ name: e.target.value })}
                  placeholder="Official school name"
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Motto</label>
                <input
                  value={form.motto || ""}
                  onChange={e => updateForm({ motto: e.target.value })}
                  placeholder="School motto"
                  style={input}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label style={label}>Phone</label>
                  <input
                    value={form.phone || ""}
                    onChange={e => updateForm({ phone: e.target.value })}
                    placeholder="Phone number"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Email</label>
                  <input
                    value={form.email || ""}
                    onChange={e => updateForm({ email: e.target.value })}
                    placeholder="Email address"
                    style={input}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Website</label>
                <input
                  value={form.website || ""}
                  onChange={e => updateForm({ website: e.target.value })}
                  placeholder="Website"
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Address</label>
                <textarea
                  value={form.address || ""}
                  onChange={e => updateForm({ address: e.target.value })}
                  placeholder="School address"
                  rows={3}
                  style={{ ...input, resize: "vertical" }}
                />
              </div>

              {renderImageInput("School Logo", "logo", "contain")}
              {renderImageInput("School Photo", "photo", "cover")}
              {renderImageInput("School Banner Image", "bannerImage", "cover")}

              <div>
                <label style={label}>School Gallery</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={e => handleGalleryUpload(e.target.files)}
                  style={input}
                />

                {!!form.galleryImages?.length && (
                  <div
                    style={{
                      marginTop: 12,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))",
                      gap: 10,
                    }}
                  >
                    {form.galleryImages.map((image, index) => (
                      <div key={`${image}-${index}`} style={{ position: "relative" }}>
                        <img
                          src={image}
                          alt={`Gallery ${index + 1}`}
                          style={{
                            width: "100%",
                            height: 90,
                            borderRadius: 12,
                            objectFit: "cover",
                            border: "1px solid rgba(0,0,0,0.08)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => removeGalleryImage(index)}
                          style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            border: "none",
                            borderRadius: 999,
                            width: 24,
                            height: 24,
                            background: "rgba(220,38,38,0.92)",
                            color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create School"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
