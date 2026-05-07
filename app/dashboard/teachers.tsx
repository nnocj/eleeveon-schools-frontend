"use client";

import { useEffect, useState } from "react";
import { db, Teacher } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";

export default function Teachers() {
  // ================= UI STATE =================
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  // ================= FORM STATE =================
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relativePhone, setRelativePhone] = useState("");
  const [employmentDate, setEmploymentDate] = useState("");
  const [salary, setSalary] = useState("");
  const [role, setRole] = useState<"teacher" | "head_teacher">("teacher");
  const [signature, setSignature] = useState("");

  // ================= LOAD =================
  const load = async () => {
    const data = await db.teachers.toArray();
    setTeachers(data);
  };

  useEffect(() => {
    load();
  }, []);

  // ================= RESET =================
  const reset = () => {
    setFullName("");
    setAge("");
    setEmail("");
    setPhone("");
    setRelativePhone("");
    setEmploymentDate("");
    setSalary("");
    setRole("teacher");
    setSignature("");
    setEditingId(null);
    setShowForm(false);
  };

  // ================= SAVE =================
  const save = async () => {
    if (!fullName.trim() || !email.trim()) {
      alert("Name and Email are required");
      return;
    }

    // 🔥 ONLY ONE HEAD TEACHER RULE
    if (role === "head_teacher") {
      const existing = await db.teachers
        .where("role")
        .equals("head_teacher")
        .first();

      if (existing && existing.id !== editingId) {
        alert("A Head Teacher already exists");
        return;
      }
    }

    const payload = prepareSyncData({
      fullName,
      age: Number(age || 0),
      email,
      phone,
      relativePhone,
      employmentDate,
      salary: Number(salary || 0),
      role,
      signature,
    });

    if (editingId) {
      await db.teachers.update(editingId, payload);
    } else {
      await db.teachers.add(payload);
    }

    reset();
    load();
  };

  // ================= EDIT =================
  const edit = (t: Teacher) => {
    setEditingId(t.id || null);
    setFullName(t.fullName);
    setAge(String(t.age));
    setEmail(t.email);
    setPhone(t.phone);
    setRelativePhone(t.relativePhone);
    setEmploymentDate(t.employmentDate);
    setSalary(String(t.salary));
    setRole(t.role);
    setSignature(t.signature || "");
    setShowForm(true);
  };

  // ================= DELETE =================
  const remove = async (id: number) => {
    const ok = confirm(
      "Delete this teacher?\n\nThis action cannot be undone."
    );

    if (!ok) return;

    await db.teachers.delete(id);
    load();
  };

  // ================= FILTER =================
  const filtered = teachers.filter((t) =>
    t.fullName.toLowerCase().includes(search.toLowerCase())
  );

  // ================= STYLES =================
  const card: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "var(--surface)",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  };

  const button: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid var(--primary-color)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  const primaryButton: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
    border: "none",
    background: "var(--primary-color)",
    color: "#fff",
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  // ================= UI =================
  return (
    <div style={{ padding: 20 }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Teachers</h2>

        <button style={primaryButton} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close" : "+ Add Teacher"}
        </button>
      </div>

      {/* SEARCH */}
      <div style={{ marginTop: 10 }}>
        <input
          style={input}
          placeholder="Search teacher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* FORM */}
      {showForm && (
        <div
          style={{
            marginTop: 15,
            padding: 15,
            borderRadius: 10,
            background: "var(--surface)",
            border: "1px solid rgba(0,0,0,0.1)",
            maxWidth: 350,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <input style={input} placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <input style={input} placeholder="Age" value={age} onChange={(e) => setAge(e.target.value)} />
          <input style={input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={input} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input style={input} placeholder="Relative Phone" value={relativePhone} onChange={(e) => setRelativePhone(e.target.value)} />
          <input style={input} type="date" value={employmentDate} onChange={(e) => setEmploymentDate(e.target.value)} />
          <input style={input} placeholder="Salary" value={salary} onChange={(e) => setSalary(e.target.value)} />

          <select style={input} value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="teacher">Teacher</option>
            <option value="head_teacher">Head Teacher</option>
          </select>

          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              const reader = new FileReader();
              reader.onloadend = () => setSignature(reader.result as string);
              reader.readAsDataURL(file);
            }}
          />

          {signature && (
            <img src={signature} style={{ height: 60, objectFit: "contain" }} />
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button style={primaryButton} onClick={save}>
              {editingId ? "Update" : "Save"}
            </button>

            <button style={button} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LIST */}
      <div style={{ marginTop: 20 }}>
        {filtered.map((t) => (
          <div key={t.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <b>{t.fullName}</b>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {t.role === "head_teacher" ? "Head Teacher" : "Teacher"} • {t.email}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={button} onClick={() => edit(t)}>
                  Edit
                </button>

                <button style={button} onClick={() => remove(t.id!)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}