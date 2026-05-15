"use client";

/**
 * Parents.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL PARENT / GUARDIAN MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB tables:
 * - parents
 * - studentParents
 *
 * Parent belongs to a Branch.
 * StudentParent links parents to students.
 *
 * Active School -> Active Branch -> Parents
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Parent,
  Student,
  StudentParent,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type Relationship = "father" | "mother" | "guardian";
type StudentParentRelationship = "father" | "mother" | "guardian" | "other";

type FormState = {
  id?: number;
  fullName: string;
  phone: string;
  photo?: string;
  coverPhoto?: string;
  email?: string;
  address?: string;
  occupation?: string;
  emergencyContact?: string;
  relationship?: Relationship;
};

type LinkFormState = {
  parentId?: number;
  studentId?: number;
  relationship: StudentParentRelationship;
  isPrimary?: boolean;
};

type ParentView = {
  row: Parent;
  linkedStudents: Student[];
  linkCount: number;
  primaryChildren: number;
};

// ======================================================
// COMPONENT
// ======================================================

export default function ParentsPage() {
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
  const [linkSaving, setLinkSaving] = useState(false);

  const [rows, setRows] = useState<Parent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);

  const [search, setSearch] = useState("");
  const [filterRelationship, setFilterRelationship] = useState<"all" | Relationship>("all");
  const [filterLinked, setFilterLinked] = useState<"all" | "linked" | "unlinked">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [linkDrawerOpen, setLinkDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
    fullName: "",
    phone: "",
    photo: "",
    coverPhoto: "",
    email: "",
    address: "",
    occupation: "",
    emergencyContact: "",
    relationship: "guardian",
  });

  const [linkForm, setLinkForm] = useState<LinkFormState>({
    parentId: undefined,
    studentId: undefined,
    relationship: "guardian",
    isPrimary: false,
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [parentRows, studentRows, relationRows] = await Promise.all([
        db.parents.toArray(),
        db.students.toArray(),
        db.studentParents.toArray(),
      ]);

      setRows(parentRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setStudents(
        studentRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.status !== "withdrawn"
        )
      );
      setStudentParents(relationRows.filter(row => row.branchId === branchId && !row.isDeleted));
    } catch (error) {
      console.error("Failed to load parents:", error);
      alert("Failed to load parents");
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

  const studentMap = useMemo(
    () => new Map(students.map(row => [row.id, row])),
    [students]
  );

  const relationByParent = useMemo(() => {
    const map = new Map<number, StudentParent[]>();

    studentParents.forEach(row => {
      const list = map.get(row.parentId) || [];
      list.push(row);
      map.set(row.parentId, list);
    });

    return map;
  }, [studentParents]);

  const relationByStudent = useMemo(() => {
    const map = new Map<number, StudentParent[]>();

    studentParents.forEach(row => {
      const list = map.get(row.studentId) || [];
      list.push(row);
      map.set(row.studentId, list);
    });

    return map;
  }, [studentParents]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<ParentView[]>(() => {
    return rows.map(row => {
      const relations = relationByParent.get(row.id || 0) || [];
      const linkedStudents = relations
        .map(relation => studentMap.get(relation.studentId))
        .filter(Boolean) as Student[];

      return {
        row,
        linkedStudents,
        linkCount: linkedStudents.length,
        primaryChildren: relations.filter(relation => relation.isPrimary).length,
      };
    });
  }, [rows, relationByParent, studentMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter(item => {
        const row = item.row;

        if (filterRelationship !== "all" && row.relationship !== filterRelationship) return false;
        if (filterLinked === "linked" && item.linkCount === 0) return false;
        if (filterLinked === "unlinked" && item.linkCount > 0) return false;

        if (!query) return true;

        return `
          ${row.fullName}
          ${row.phone}
          ${row.email || ""}
          ${row.address || ""}
          ${row.occupation || ""}
          ${row.emergencyContact || ""}
          ${row.relationship || ""}
          ${item.linkedStudents.map(student => student.fullName).join(" ")}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.fullName.localeCompare(b.row.fullName));
  }, [viewRows, search, filterRelationship, filterLinked]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      linked: viewRows.filter(item => item.linkCount > 0).length,
      unlinked: viewRows.filter(item => item.linkCount === 0).length,
      studentsWithParents: relationByStudent.size,
      primaryParents: studentParents.filter(row => row.isPrimary).length,
    };
  }, [rows, viewRows, relationByStudent, studentParents]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const updateLinkForm = (patch: Partial<LinkFormState>) => {
    setLinkForm(prev => ({ ...prev, ...patch }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (field: "photo" | "coverPhoto", file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [field]: value });
  };

  const openCreate = () => {
    if (!activeBranchId) {
      alert("Select a branch first before creating a parent.");
      return;
    }

    setEditMode(false);

    setForm({
      fullName: "",
      phone: "",
      photo: "",
      coverPhoto: "",
      email: "",
      address: "",
      occupation: "",
      emergencyContact: "",
      relationship: "guardian",
    });

    setDrawerOpen(true);
  };

  const openEdit = (row: Parent) => {
    setEditMode(true);

    setForm({
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      photo: row.photo || "",
      coverPhoto: row.coverPhoto || "",
      email: row.email || "",
      address: row.address || "",
      occupation: row.occupation || "",
      emergencyContact: row.emergencyContact || "",
      relationship: row.relationship || "guardian",
    });

    setDrawerOpen(true);
  };

  const openLinkDrawer = (parent?: Parent) => {
    if (!activeBranchId) {
      alert("Select a branch first.");
      return;
    }

    setLinkForm({
      parentId: parent?.id,
      studentId: undefined,
      relationship: parent?.relationship || "guardian",
      isPrimary: false,
    });

    setLinkDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE PARENT
  // ======================================================

  const validate = () => {
    if (!branchId) return "Select a branch first";
    if (!form.fullName.trim()) return "Enter parent full name";
    if (!form.phone.trim()) return "Enter parent phone number";

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;
      return row.phone.trim().toLowerCase() === form.phone.trim().toLowerCase();
    });

    if (duplicate) return "A parent with this phone number already exists in this branch";

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
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        photo: form.photo || undefined,
        coverPhoto: form.coverPhoto || undefined,
        email: form.email?.trim() || undefined,
        address: form.address?.trim() || undefined,
        occupation: form.occupation?.trim() || undefined,
        emergencyContact: form.emergencyContact?.trim() || undefined,
        relationship: form.relationship || "guardian",
      }) as Parent;

      let savedParentId = form.id;

      if (editMode && form.id) {
        await db.parents.update(form.id, {
          fullName: payload.fullName,
          phone: payload.phone,
          photo: payload.photo,
          coverPhoto: payload.coverPhoto,
          email: payload.email,
          address: payload.address,
          occupation: payload.occupation,
          emergencyContact: payload.emergencyContact,
          relationship: payload.relationship,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        const id = await db.parents.add(payload);
        savedParentId = Number(id);
      }

      setDrawerOpen(false);
      await load();

      if (!editMode && savedParentId) {
        openLinkDrawer({ ...payload, id: savedParentId });
      }
    } catch (error) {
      console.error("Failed to save parent:", error);
      alert("Failed to save parent");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // LINK STUDENT + PARENT
  // ======================================================

  const saveLink = async () => {
    if (!linkForm.parentId) {
      alert("Select parent");
      return;
    }

    if (!linkForm.studentId) {
      alert("Select student");
      return;
    }

    const duplicate = studentParents.find(
      row =>
        row.parentId === Number(linkForm.parentId) &&
        row.studentId === Number(linkForm.studentId) &&
        !row.isDeleted
    );

    if (duplicate) {
      alert("This parent is already linked to this student");
      return;
    }

    try {
      setLinkSaving(true);

      if (linkForm.isPrimary) {
        const existingPrimaryLinks = studentParents.filter(
          row => row.studentId === Number(linkForm.studentId) && row.isPrimary
        );

        await Promise.all(
          existingPrimaryLinks.map(row =>
            row.id
              ? db.studentParents.update(row.id, {
                  isPrimary: false,
                  updatedAt: Date.now(),
                })
              : Promise.resolve()
          )
        );
      }

      const payload = prepareSyncData({
        branchId,
        parentId: Number(linkForm.parentId),
        studentId: Number(linkForm.studentId),
        relationship: linkForm.relationship,
        isPrimary: !!linkForm.isPrimary,
      }) as StudentParent;

      await db.studentParents.add(payload);

      setLinkDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to link parent and student:", error);
      alert("Failed to link parent and student");
    } finally {
      setLinkSaving(false);
    }
  };

  const unlink = async (relationId?: number) => {
    if (!relationId) return;
    if (!confirm("Remove this parent-student link?")) return;

    await db.studentParents.update(relationId, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const linkCount = relationByParent.get(id)?.length || 0;

    if (linkCount) {
      const proceed = confirm(
        `This parent is linked to ${linkCount} student(s). Delete anyway?`
      );
      if (!proceed) return;
    } else {
      if (!confirm("Delete this parent?")) return;
    }

    await db.parents.update(id, {
      isDeleted: true,
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
    return <div style={{ padding: 20 }}>Loading parents...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Parents belong to a branch. Select a school and branch from the sidebar before managing parents.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Parents & Guardians</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing parents in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => openLinkDrawer()} style={ghostButton}>
            Link Parent to Student
          </button>
          <button onClick={openCreate} style={button}>
            + Add Parent
          </button>
        </div>
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
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Total Parents</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Linked Parents</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.linked}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Unlinked Parents</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.unlinked}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Students With Parents</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.studentsWithParents}</div>
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
          placeholder="Search parent, phone, email, occupation, student..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterRelationship}
          onChange={e => setFilterRelationship(e.target.value as any)}
          style={input}
        >
          <option value="all">All Relationships</option>
          <option value="father">Father</option>
          <option value="mother">Mother</option>
          <option value="guardian">Guardian</option>
        </select>

        <select
          value={filterLinked}
          onChange={e => setFilterLinked(e.target.value as any)}
          style={input}
        >
          <option value="all">All Link Status</option>
          <option value="linked">Linked</option>
          <option value="unlinked">Unlinked</option>
        </select>
      </div>

      {/* LIST */}
      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {filteredRows.map(item => {
          const row = item.row;
          const relations = relationByParent.get(row.id || 0) || [];

          return (
            <div key={row.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
              {row.coverPhoto && (
                <div
                  style={{
                    height: 88,
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.42), rgba(15,23,42,0.08)), url(${row.coverPhoto})`,
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
                    {!row.photo && row.fullName.slice(0, 1).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{row.fullName}</div>
                      <span style={badge("blue")}>{row.relationship || "guardian"}</span>
                      <span style={badge(item.linkCount ? "green" : "orange")}>
                        {item.linkCount ? `${item.linkCount} child link(s)` : "Unlinked"}
                      </span>
                    </div>

                    <div style={{ marginTop: 6, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                      {row.phone}
                      {row.email ? ` • ${row.email}` : ""}
                      {row.occupation ? ` • ${row.occupation}` : ""}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {item.linkedStudents.map(student => (
                        <span key={student.id} style={badge("gray")}>
                          {student.fullName}
                        </span>
                      ))}
                      {row.emergencyContact && (
                        <span style={badge("red")}>Emergency: {row.emergencyContact}</span>
                      )}
                    </div>

                    {!!relations.length && (
                      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                        {relations.map(relation => {
                          const student = studentMap.get(relation.studentId);
                          return (
                            <div
                              key={relation.id}
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                flexWrap: "wrap",
                                fontSize: 12,
                                opacity: 0.8,
                              }}
                            >
                              <span>
                                {student?.fullName || `Student #${relation.studentId}`} • {relation.relationship}
                                {relation.isPrimary ? " • Primary" : ""}
                              </span>
                              <button
                                type="button"
                                onClick={() => unlink(relation.id)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "#dc2626",
                                  cursor: "pointer",
                                  fontWeight: 800,
                                }}
                              >
                                Remove link
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button style={ghostButton} onClick={() => openLinkDrawer(row)}>
                    Link Student
                  </button>
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
          <div style={{ ...card, textAlign: "center", padding: 30 }}>
            No parents found in this branch.
          </div>
        )}
      </div>

      {/* CREATE / EDIT DRAWER */}
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
              width: "min(620px, 100vw)",
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
                  {editMode ? "Edit Parent" : "Add Parent"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Parent will be saved under {activeBranch?.name || "the selected branch"}.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Full Name</label>
                <input
                  value={form.fullName}
                  onChange={e => updateForm({ fullName: e.target.value })}
                  placeholder="Parent / guardian full name"
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
                    value={form.phone}
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
                <label style={label}>Relationship</label>
                <select
                  value={form.relationship || "guardian"}
                  onChange={e => updateForm({ relationship: e.target.value as Relationship })}
                  style={input}
                >
                  <option value="father">Father</option>
                  <option value="mother">Mother</option>
                  <option value="guardian">Guardian</option>
                </select>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label style={label}>Occupation</label>
                  <input
                    value={form.occupation || ""}
                    onChange={e => updateForm({ occupation: e.target.value })}
                    placeholder="Occupation"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Emergency Contact</label>
                  <input
                    value={form.emergencyContact || ""}
                    onChange={e => updateForm({ emergencyContact: e.target.value })}
                    placeholder="Emergency contact"
                    style={input}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Address</label>
                <textarea
                  value={form.address || ""}
                  onChange={e => updateForm({ address: e.target.value })}
                  placeholder="Parent address"
                  rows={3}
                  style={{ ...input, resize: "vertical" }}
                />
              </div>

              <div>
                <label style={label}>Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("photo", e.target.files?.[0])}
                  style={input}
                />
                {form.photo && (
                  <img
                    src={form.photo}
                    alt="Parent"
                    style={{ height: 88, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <div>
                <label style={label}>Cover Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("coverPhoto", e.target.files?.[0])}
                  style={input}
                />
                {form.coverPhoto && (
                  <img
                    src={form.coverPhoto}
                    alt="Parent cover"
                    style={{ width: "100%", height: 120, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Add Parent"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LINK DRAWER */}
      {linkDrawerOpen && (
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
          onClick={() => setLinkDrawerOpen(false)}
        >
          <div
            style={{
              width: "min(520px, 100vw)",
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
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Link Parent to Student</h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Connect a parent/guardian to a student record.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setLinkDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Parent</label>
                <select
                  value={linkForm.parentId || ""}
                  onChange={e => updateLinkForm({ parentId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Parent</option>
                  {rows.map(parent => (
                    <option key={parent.id} value={parent.id}>
                      {parent.fullName} • {parent.phone}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Student</label>
                <select
                  value={linkForm.studentId || ""}
                  onChange={e => updateLinkForm({ studentId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Student</option>
                  {students.map(student => (
                    <option key={student.id} value={student.id}>
                      {student.fullName} {student.admissionNumber ? `• ${student.admissionNumber}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Relationship to Student</label>
                <select
                  value={linkForm.relationship}
                  onChange={e =>
                    updateLinkForm({ relationship: e.target.value as StudentParentRelationship })
                  }
                  style={input}
                >
                  <option value="father">Father</option>
                  <option value="mother">Mother</option>
                  <option value="guardian">Guardian</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <label style={{ ...card, display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!!linkForm.isPrimary}
                  onChange={e => updateLinkForm({ isPrimary: e.target.checked })}
                />
                Mark as primary parent/guardian for this student
              </label>

              <button onClick={saveLink} disabled={linkSaving} style={{ ...button, opacity: linkSaving ? 0.6 : 1 }}>
                {linkSaving ? "Linking..." : "Link Parent to Student"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
