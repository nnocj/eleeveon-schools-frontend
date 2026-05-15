"use client";

/**
 * CurriculumPathways.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL CURRICULUM PATHWAY MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: curriculumPathways
 * Supporting tables:
 * - curriculums
 * - curriculumSubjects
 * - studentCurriculums
 *
 * ARCHITECTURE
 * ---------------------------------------------------------
 * CurriculumPathway is the stream/track/specialization layer under
 * a curriculum.
 *
 * Examples:
 * - General Pathway
 * - Science Track
 * - Business Track
 * - Visual Arts Track
 * - Technical/Vocational Track
 *
 * Active School -> Active Branch -> Curriculum -> Pathway
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Curriculum,
  CurriculumPathway,
  CurriculumSubject,
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
  curriculumId?: number;
  name: string;
  code?: string;
  photo?: string;
  bannerImage?: string;
  description?: string;
  active?: boolean;
};

type PathwayView = {
  row: CurriculumPathway;
  curriculumName: string;
  subjectCount: number;
  studentCount: number;
};

// ======================================================
// COMPONENT
// ======================================================

export default function CurriculumPathwaysPage() {
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

  const [rows, setRows] = useState<CurriculumPathway[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [studentCurriculums, setStudentCurriculums] = useState<StudentCurriculum[]>([]);

  const [search, setSearch] = useState("");
  const [filterCurriculumId, setFilterCurriculumId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
    curriculumId: undefined,
    name: "",
    code: "",
    photo: "",
    bannerImage: "",
    description: "",
    active: true,
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [pathwayRows, curriculumRows, subjectRows, studentCurriculumRows] =
        await Promise.all([
          db.curriculumPathways.toArray(),
          db.curriculums.toArray(),
          db.curriculumSubjects.toArray(),
          db.studentCurriculums.toArray(),
        ]);

      setRows(pathwayRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setCurriculums(
        curriculumRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setCurriculumSubjects(
        subjectRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setStudentCurriculums(
        studentCurriculumRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
    } catch (error) {
      console.error("Failed to load curriculum pathways:", error);
      alert("Failed to load curriculum pathways");
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

  const curriculumMap = useMemo(
    () => new Map(curriculums.map(row => [row.id, row])),
    [curriculums]
  );

  const usageMaps = useMemo(() => {
    const subjectMap = new Map<number, number>();
    const studentMap = new Map<number, number>();

    curriculumSubjects.forEach(row => {
      if (!row.pathwayId) return;
      subjectMap.set(row.pathwayId, (subjectMap.get(row.pathwayId) || 0) + 1);
    });

    studentCurriculums.forEach(row => {
      if (!row.pathwayId) return;
      studentMap.set(row.pathwayId, (studentMap.get(row.pathwayId) || 0) + 1);
    });

    return { subjectMap, studentMap };
  }, [curriculumSubjects, studentCurriculums]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<PathwayView[]>(() => {
    return rows.map(row => {
      const curriculum = curriculumMap.get(row.curriculumId);
      const id = row.id || 0;

      return {
        row,
        curriculumName: curriculum?.name || "Unknown curriculum",
        subjectCount: usageMaps.subjectMap.get(id) || 0,
        studentCount: usageMaps.studentMap.get(id) || 0,
      };
    });
  }, [rows, curriculumMap, usageMaps]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter(item => {
        const row = item.row;

        if (filterCurriculumId && row.curriculumId !== filterCurriculumId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.code || ""}
          ${row.description || ""}
          ${item.curriculumName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const byCurriculum = a.curriculumName.localeCompare(b.curriculumName);
        if (byCurriculum !== 0) return byCurriculum;
        return a.row.name.localeCompare(b.row.name);
      });
  }, [viewRows, search, filterCurriculumId, filterStatus]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter(row => row.active !== false).length,
      inactive: rows.filter(row => row.active === false).length,
      subjectLinks: curriculumSubjects.filter(row => row.pathwayId).length,
      studentLinks: studentCurriculums.filter(row => row.pathwayId).length,
    };
  }, [rows, curriculumSubjects, studentCurriculums]);

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
      alert("Select a branch first before creating a pathway.");
      return;
    }

    setEditMode(false);
    setForm({
      curriculumId: filterCurriculumId,
      name: "",
      code: "",
      photo: "",
      bannerImage: "",
      description: "",
      active: true,
    });
    setDrawerOpen(true);
  };

  const openEdit = (row: CurriculumPathway) => {
    setEditMode(true);
    setForm({
      id: row.id,
      curriculumId: row.curriculumId,
      name: row.name,
      code: row.code || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
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
    if (!form.curriculumId) return "Select curriculum";
    if (!form.name.trim()) return "Enter pathway name";

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      const sameCurriculum = row.curriculumId === Number(form.curriculumId);
      const sameName = row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
      const sameCode =
        form.code?.trim() && row.code?.trim().toLowerCase() === form.code.trim().toLowerCase();

      return sameCurriculum && (sameName || sameCode) && !row.isDeleted;
    });

    if (duplicate) {
      return "A pathway with this name or code already exists under this curriculum";
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
        curriculumId: Number(form.curriculumId),
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,
        description: form.description?.trim() || undefined,
        active: form.active !== false,
      }) as CurriculumPathway;

      if (editMode && form.id) {
        await db.curriculumPathways.update(form.id, {
          curriculumId: payload.curriculumId,
          name: payload.name,
          code: payload.code,
          photo: payload.photo,
          bannerImage: payload.bannerImage,
          description: payload.description,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        await db.curriculumPathways.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save curriculum pathway:", error);
      alert("Failed to save curriculum pathway");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: PathwayView) => {
    if (!item.row.id) return;

    const totalUsage = item.subjectCount + item.studentCount;

    if (totalUsage) {
      const proceed = confirm(
        `This pathway is used by ${item.subjectCount} curriculum subject(s) and ${item.studentCount} student curriculum record(s). Delete anyway?`
      );
      if (!proceed) return;
    } else {
      if (!confirm("Delete this pathway?")) return;
    }

    await db.curriculumPathways.update(item.row.id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: CurriculumPathway) => {
    if (!row.id) return;

    await db.curriculumPathways.update(row.id, {
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
    return <div style={{ padding: 20 }}>Loading curriculum pathways...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Curriculum pathways belong to a branch. Select a school and branch first.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Curriculum Pathways</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing curriculum streams/tracks in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Create Pathway
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
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Pathways</div>
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
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Subject Links</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.subjectLinks}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Student Links</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.studentLinks}</div>
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
          placeholder="Search pathway, code, curriculum..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterCurriculumId || ""}
          onChange={e => setFilterCurriculumId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Curriculums</option>
          {curriculums.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
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
                      <span style={badge(row.active === false ? "red" : "green")}>
                        {row.active === false ? "Inactive" : "Active"}
                      </span>
                    </div>

                    <div style={{ marginTop: 7, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                      {item.curriculumName}
                    </div>

                    {row.description && (
                      <div style={{ marginTop: 7, opacity: 0.68, fontSize: 13 }}>
                        {row.description}
                      </div>
                    )}

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("blue")}>{item.subjectCount} curriculum subject(s)</span>
                      <span style={badge("purple")}>{item.studentCount} student curriculum(s)</span>
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
                  <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => remove(item)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!filteredRows.length && (
          <div style={{ ...card, textAlign: "center", padding: 30 }}>
            No curriculum pathways found in this branch.
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
                  {editMode ? "Edit Pathway" : "Create Pathway"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Pathway will be saved under {activeBranch?.name || "the selected branch"}.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Curriculum</label>
                <select
                  value={form.curriculumId || ""}
                  onChange={e => updateForm({ curriculumId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Curriculum</option>
                  {curriculums.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Pathway Name</label>
                <input
                  value={form.name}
                  onChange={e => updateForm({ name: e.target.value })}
                  placeholder="e.g. General Pathway, Science Track"
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Pathway Code</label>
                <input
                  value={form.code || ""}
                  onChange={e => updateForm({ code: e.target.value })}
                  placeholder="e.g. SCI, GEN, BUS"
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Description</label>
                <textarea
                  value={form.description || ""}
                  onChange={e => updateForm({ description: e.target.value })}
                  placeholder="Describe this pathway or track"
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
                <label style={label}>Pathway Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("photo", e.target.files?.[0])}
                  style={input}
                />
                {form.photo && (
                  <img
                    src={form.photo}
                    alt="Pathway"
                    style={{ height: 88, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <div>
                <label style={label}>Pathway Banner Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("bannerImage", e.target.files?.[0])}
                  style={input}
                />
                {form.bannerImage && (
                  <img
                    src={form.bannerImage}
                    alt="Pathway banner"
                    style={{ width: "100%", height: 120, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Pathway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
