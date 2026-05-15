"use client";

/**
 * Programs.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL PROGRAM MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: programs
 *
 * Program belongs to a Branch.
 * Curriculum may optionally link to Program through programId.
 *
 * Active School -> Active Branch -> Programs
 *
 * PURPOSE
 * ---------------------------------------------------------
 * This page manages program identities only.
 * Curriculum Management should reference programs, not create them.
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Curriculum,
  Organization,
  Program,
  StudentCurriculum,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type FormState = {
  id?: number;
  organizationId?: number;
  name: string;
  code?: string;
  photo?: string;
  bannerImage?: string;
  awardType?: string;
  durationYears?: number;
  description?: string;
  active?: boolean;
};

type ProgramView = {
  row: Program;
  organizationName: string;
  curriculumCount: number;
  studentCurriculumCount: number;
};

// ======================================================
// COMPONENT
// ======================================================

export default function ProgramsPage() {
  const { settings } = useSettings();
  const {
    activeSchool,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const branchId = activeBranchId || settings?.branchId || 1;
  const primary = settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<Program[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [studentCurriculums, setStudentCurriculums] = useState<StudentCurriculum[]>([]);

  const [search, setSearch] = useState("");
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
    organizationId: undefined,
    name: "",
    code: "",
    photo: "",
    bannerImage: "",
    awardType: "",
    durationYears: undefined,
    description: "",
    active: true,
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [programRows, organizationRows, curriculumRows, studentCurriculumRows] =
        await Promise.all([
          db.programs.toArray(),
          db.organizations.toArray(),
          db.curriculums.toArray(),
          db.studentCurriculums.toArray(),
        ]);

      setRows(programRows.filter(row => row.branchId === branchId && !row.isDeleted));

      setOrganizations(
        organizationRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setCurriculums(
        curriculumRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setStudentCurriculums(
        studentCurriculumRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
    } catch (error) {
      console.error("Failed to load programs:", error);
      alert("Failed to load programs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const organizationMap = useMemo(
    () => new Map(organizations.map(row => [row.id, row])),
    [organizations]
  );

  const curriculumCountMap = useMemo(() => {
    const map = new Map<number, number>();

    curriculums.forEach(row => {
      if (!row.programId) return;
      map.set(row.programId, (map.get(row.programId) || 0) + 1);
    });

    return map;
  }, [curriculums]);

  const studentCurriculumCountMap = useMemo(() => {
    const map = new Map<number, number>();

    studentCurriculums.forEach(studentCurriculum => {
      const curriculum = curriculums.find(row => row.id === studentCurriculum.curriculumId);
      if (!curriculum?.programId) return;

      map.set(
        curriculum.programId,
        (map.get(curriculum.programId) || 0) + 1
      );
    });

    return map;
  }, [studentCurriculums, curriculums]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<ProgramView[]>(() => {
    return rows.map(row => {
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
      const id = row.id || 0;

      return {
        row,
        organizationName: organization?.name || "No organization",
        curriculumCount: curriculumCountMap.get(id) || 0,
        studentCurriculumCount: studentCurriculumCountMap.get(id) || 0,
      };
    });
  }, [rows, organizationMap, curriculumCountMap, studentCurriculumCountMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter(item => {
        const row = item.row;

        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.code || ""}
          ${row.awardType || ""}
          ${row.durationYears || ""}
          ${row.description || ""}
          ${item.organizationName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name));
  }, [viewRows, search, filterOrganizationId, filterStatus]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter(row => row.active !== false).length,
      inactive: rows.filter(row => row.active === false).length,
      curriculums: curriculums.filter(row => row.programId).length,
      students: studentCurriculums.length,
    };
  }, [rows, curriculums, studentCurriculums]);

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

  const handleImageUpload = async (field: "photo" | "bannerImage", file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [field]: value });
  };

  const openCreate = () => {
    if (!activeBranchId) {
      alert("Select a branch first before creating a program.");
      return;
    }

    setEditMode(false);

    setForm({
      organizationId: undefined,
      name: "",
      code: "",
      photo: "",
      bannerImage: "",
      awardType: "",
      durationYears: undefined,
      description: "",
      active: true,
    });

    setDrawerOpen(true);
  };

  const openEdit = (row: Program) => {
    setEditMode(true);

    setForm({
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      code: row.code || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      awardType: row.awardType || "",
      durationYears: row.durationYears,
      description: row.description || "",
      active: row.active ?? true,
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!branchId) return "Select a branch first";
    if (!form.name.trim()) return "Enter program name";

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      const sameName = row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
      const sameCode =
        form.code?.trim() && row.code?.trim().toLowerCase() === form.code.trim().toLowerCase();

      return (sameName || sameCode) && !row.isDeleted;
    });

    if (duplicate) {
      return "A program with this name or code already exists in this branch";
    }

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
        branchId,
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,
        awardType: form.awardType?.trim() || undefined,
        durationYears: form.durationYears == null ? undefined : Number(form.durationYears),
        description: form.description?.trim() || undefined,
        active: form.active !== false,
      }) as Program;

      if (editMode && form.id) {
        await db.programs.update(form.id, {
          organizationId: payload.organizationId,
          name: payload.name,
          code: payload.code,
          photo: payload.photo,
          bannerImage: payload.bannerImage,
          awardType: payload.awardType,
          durationYears: payload.durationYears,
          description: payload.description,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        await db.programs.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save program:", error);
      alert("Failed to save program");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Program) => {
    if (!row.id) return;

    const curriculumCount = curriculumCountMap.get(row.id) || 0;
    const studentCount = studentCurriculumCountMap.get(row.id) || 0;
    const totalUsage = curriculumCount + studentCount;

    if (totalUsage) {
      const proceed = confirm(
        `This program is used by ${curriculumCount} curriculum(s) and ${studentCount} student curriculum record(s). Delete anyway?`
      );
      if (!proceed) return;
    } else {
      if (!confirm("Delete this program?")) return;
    }

    await db.programs.update(row.id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: Program) => {
    if (!row.id) return;

    await db.programs.update(row.id, {
      active: row.active === false,
      updatedAt: Date.now(),
    });

    await load();
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

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange" | "purple"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
      purple: { bg: "rgba(147,51,234,0.12)", color: "#7e22ce" },
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

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading programs...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Programs belong to a branch. Select a school and branch from the sidebar before managing programs.
          </p>
        </div>
      </div>
    );
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Programs</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing programs in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Create Program
        </button>
      </div>

      {/* ANALYTICS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Programs</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.active}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Inactive</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.inactive}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Linked Curriculums</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.curriculums}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Student Curriculum Records</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.students}</div>
        </div>
      </div>

      {/* FILTERS */}
      <div
        style={{
          ...card,
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 12,
        }}
      >
        <input
          placeholder="Search program, code, award type, organization..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterOrganizationId || ""}
          onChange={e => setFilterOrganizationId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Organizations</option>
          {organizations.map(row => (
            <option key={row.id} value={row.id}>
              {row.name} • {row.type}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as any)}
          style={input}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* LIST */}
      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {filteredRows.map(item => {
          const row = item.row;

          return (
            <div key={row.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
              {row.bannerImage && (
                <div
                  style={{
                    height: 92,
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.42), rgba(15,23,42,0.08)), url(${row.bannerImage})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              )}

              <div
                style={{
                  padding: 16,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
                  <div
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 18,
                      background: row.photo
                        ? `url(${row.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 950,
                      flex: "0 0 58px",
                    }}
                  >
                    {!row.photo && row.name.slice(0, 2).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{row.name}</div>
                      {row.code && <span style={badge("gray")}>{row.code}</span>}
                      {row.awardType && <span style={badge("blue")}>{row.awardType}</span>}
                      <span style={badge(row.active === false ? "red" : "green")}>
                        {row.active === false ? "Inactive" : "Active"}
                      </span>
                    </div>

                    <div style={{ marginTop: 7, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                      {item.organizationName}
                      {row.durationYears ? ` • ${row.durationYears} year(s)` : ""}
                    </div>

                    {row.description && (
                      <div style={{ marginTop: 7, opacity: 0.68, fontSize: 13 }}>
                        {row.description}
                      </div>
                    )}

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("blue")}>{item.curriculumCount} curriculum(s)</span>
                      <span style={badge("purple")}>{item.studentCurriculumCount} student record(s)</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button style={ghostButton} onClick={() => toggleActive(row)}>
                    {row.active === false ? "Activate" : "Deactivate"}
                  </button>
                  <button style={ghostButton} onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => remove(row)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!filteredRows.length && (
          <div style={{ ...card, textAlign: "center", padding: 30 }}>
            No programs found in this branch.
          </div>
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
              width: "min(600px, 100vw)",
              height: "100vh",
              background: "var(--surface)",
              color: "var(--text)",
              boxShadow: "-20px 0 50px rgba(0,0,0,0.25)",
              padding: 22,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                  {editMode ? "Edit Program" : "Create Program"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Program will be saved under {activeBranch?.name || "the selected branch"}.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Program Name</label>
                <input
                  value={form.name}
                  onChange={e => updateForm({ name: e.target.value })}
                  placeholder="e.g. Basic Education, JHS Programme"
                  style={input}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                <div>
                  <label style={label}>Program Code</label>
                  <input
                    value={form.code || ""}
                    onChange={e => updateForm({ code: e.target.value })}
                    placeholder="e.g. BASIC, JHS"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Duration Years</label>
                  <input
                    type="number"
                    value={form.durationYears ?? ""}
                    onChange={e =>
                      updateForm({
                        durationYears: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="Years"
                    style={input}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Award Type</label>
                <input
                  value={form.awardType || ""}
                  onChange={e => updateForm({ awardType: e.target.value })}
                  placeholder="e.g. Basic Education Certificate, Diploma"
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Organization / Department</label>
                <select
                  value={form.organizationId || ""}
                  onChange={e => updateForm({ organizationId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">No organization</option>
                  {organizations.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name} • {row.type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Description</label>
                <textarea
                  value={form.description || ""}
                  onChange={e => updateForm({ description: e.target.value })}
                  placeholder="Program description"
                  rows={4}
                  style={{ ...input, resize: "vertical" }}
                />
              </div>

              <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                <input
                  type="checkbox"
                  checked={form.active !== false}
                  onChange={e => updateForm({ active: e.target.checked })}
                />
                Active
              </label>

              <div>
                <label style={label}>Program Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("photo", e.target.files?.[0])}
                  style={input}
                />
                {form.photo && (
                  <img
                    src={form.photo}
                    alt="Program"
                    style={{ height: 88, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <div>
                <label style={label}>Program Banner Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("bannerImage", e.target.files?.[0])}
                  style={input}
                />
                {form.bannerImage && (
                  <img
                    src={form.bannerImage}
                    alt="Program banner"
                    style={{ width: "100%", height: 120, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Program"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
