"use client";

import { useEffect, useMemo, useState } from "react";
import { db, Student } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

type Status = "active" | "graduated" | "transferred" | "withdrawn";

export default function Students() {
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "#2f6fed";

  // ================= DATA =================
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ================= UI =================
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");

  const [filterClass, setFilterClass] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterGender, setFilterGender] = useState("");
  const [filterOrg, setFilterOrg] = useState("");

  // ================= FORM =================
  const [form, setForm] = useState<Partial<Student>>({
    fullName: "",
    age: undefined,
    gender: "",
    dateOfBirth: "",
    admissionNumber: "",
    parentName: "",
    parentPhone: "",
    parentEmail: "",
    address: "",
    status: "active",
    currentClassId: undefined,
    organizationId: undefined,
  });

  // ================= LOAD =================
  const load = async () => {
    setLoading(true);

    const [s, c, o] = await Promise.all([
      db.students.toArray(),
      db.classes.toArray(),
      db.organizations?.toArray?.() || [],
    ]);

    setStudents(s);
    setClasses(c);
    setOrganizations(o);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ================= RESET =================
  const reset = () => {
    setForm({
      fullName: "",
      age: undefined,
      gender: "",
      dateOfBirth: "",
      admissionNumber: "",
      parentName: "",
      parentPhone: "",
      parentEmail: "",
      address: "",
      status: "active",
      currentClassId: undefined,
      organizationId: undefined,
    });

    setEditingId(null);
    setShowForm(false);
  };

  // ================= SAVE =================
  const save = async () => {
    if (!form.fullName?.trim()) {
      alert("Full name is required");
      return;
    }

    const payload = prepareSyncData({
      ...form,
      age: Number(form.age || 0),
      currentClassId: Number(form.currentClassId),
      organizationId: Number(form.organizationId),
    });

    if (editingId) {
      await db.students.update(editingId, payload);
    } else {
      await db.students.add(payload);
    }

    reset();
    load();
  };

  // ================= EDIT =================
  const edit = (s: Student) => {
    setEditingId(s.id!);
    setForm(s);
    setShowForm(true);
  };

  // ================= DELETE =================
  const remove = async (id: number) => {
    if (!confirm("Delete student?")) return;

    await db.transaction(
      "rw",
      db.students,
      db.scores,
      db.attendance,
      db.payments,
      async () => {
        await db.students.delete(id);
        await db.scores.where("studentId").equals(id).delete();
        await db.attendance.where("studentId").equals(id).delete();
        await db.payments.where("studentId").equals(id).delete();
      }
    );

    load();
  };

  // ================= MAPS =================
  const classMap = useMemo(
    () => new Map(classes.map((c) => [c.id, c.name])),
    [classes]
  );

  const orgMap = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations]
  );

  // ================= FILTER ENGINE =================
  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchSearch =
        s.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        s.admissionNumber?.toLowerCase().includes(search.toLowerCase());

      const matchClass = filterClass
        ? String(s.currentClassId) === filterClass
        : true;

      const matchStatus = filterStatus ? s.status === filterStatus : true;

      const matchGender = filterGender ? s.gender === filterGender : true;

      const matchOrg = filterOrg
        ? String(s.organizationId) === filterOrg
        : true;

      return matchSearch && matchClass && matchStatus && matchGender && matchOrg;
    });
  }, [students, search, filterClass, filterStatus, filterGender, filterOrg]);

  // ================= STYLES =================
  const page: React.CSSProperties = {
    padding: 20,
    color: "var(--text)",
  };

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid rgba(0,0,0,0.08)",
    padding: 12,
    borderRadius: 12,
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "transparent",
    color: "var(--text)",
  };

  const primaryBtn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  };

  const outlineBtn: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 10,
    border: `1px solid ${primary}`,
    background: "transparent",
    color: "var(--text)",
    cursor: "pointer",
  };

  if (loading) return <div style={page}>Loading students...</div>;

  // ================= UI =================
  return (
    <div style={page}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Students</h2>

        <button style={primaryBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close" : "+ Add Student"}
        </button>
      </div>

      {/* FILTER GRID (NOW INCLUDING ORG) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
          gap: 10,
          marginTop: 10,
        }}
      >
        <input
          style={input}
          placeholder="Search student / admission no..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select style={input} value={filterOrg} onChange={(e) => setFilterOrg(e.target.value)}>
          <option value="">All Organizations</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>

        <select style={input} value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select style={input} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Status</option>
          <option value="active">Active</option>
          <option value="graduated">Graduated</option>
          <option value="transferred">Transferred</option>
          <option value="withdrawn">Withdrawn</option>
        </select>

        <select style={input} value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
          <option value="">Gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </div>

      {/* FORM (now includes org) */}
      {showForm && (
        <div style={{ ...card, marginTop: 15, maxWidth: 520, display: "grid", gap: 8 }}>

          <input style={input} placeholder="Full Name"
            value={form.fullName || ""}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />

          <select
            style={input}
            value={form.organizationId || ""}
            onChange={(e) => setForm({ ...form, organizationId: Number(e.target.value) })}
          >
            <option value="">Organization</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>

          <select
            style={input}
            value={form.currentClassId || ""}
            onChange={(e) => setForm({ ...form, currentClassId: Number(e.target.value) })}
          >
            <option value="">Class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <input style={input} placeholder="Admission Number"
            value={form.admissionNumber || ""}
            onChange={(e) => setForm({ ...form, admissionNumber: e.target.value })}
          />

          <input style={input} placeholder="Parent Phone"
            value={form.parentPhone || ""}
            onChange={(e) => setForm({ ...form, parentPhone: e.target.value })}
          />

          <select style={input}
            value={form.status || "active"}
            onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
          >
            <option value="active">Active</option>
            <option value="graduated">Graduated</option>
            <option value="transferred">Transferred</option>
            <option value="withdrawn">Withdrawn</option>
          </select>

          <div style={{ display: "flex", gap: 10 }}>
            <button style={primaryBtn} onClick={save}>
              {editingId ? "Update" : "Save"}
            </button>

            <button style={outlineBtn} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LIST */}
      <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
        {filtered.map((s) => (
          <div key={s.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <b>{s.fullName}</b>

                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {orgMap.get(s.organizationId || 0) || "No Org"} •{" "}
                  {classMap.get(s.currentClassId || 0) || "No Class"} •{" "}
                  {s.status}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={outlineBtn} onClick={() => edit(s)}>Edit</button>
                <button style={outlineBtn} onClick={() => remove(s.id!)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}