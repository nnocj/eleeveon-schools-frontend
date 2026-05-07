"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";

export default function Classes() {
  const [name, setName] = useState("");
  const [classes, setClasses] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ================= LOAD =================
  const loadClasses = async () => {
    const data = await db.classes.toArray();
    setClasses(data);
  };

  useEffect(() => {
    loadClasses();
  }, []);

  // ================= RESET =================
  const reset = () => {
    setName("");
    setEditingId(null);
    setShowForm(false);
  };

  // ================= SAVE (ADD / UPDATE) =================
  const save = async () => {
    if (!name.trim()) {
      alert("Please enter class name");
      return;
    }

    const exists = await db.classes
      .filter((c) => c.name.toLowerCase() === name.toLowerCase())
      .first();

    if (exists && !editingId) {
      alert("Class already exists");
      return;
    }

    const payload = prepareSyncData({
      name,
    });

    if (editingId) {
      await db.classes.update(editingId, payload);
    } else {
      await db.classes.add(payload);
    }

    reset();
    loadClasses();
  };

  // ================= EDIT =================
  const edit = (c: any) => {
    setName(c.name);
    setEditingId(c.id);
    setShowForm(true);
  };

  // ================= SAFE DELETE (IMPORTANT UPGRADE) =================
  const remove = async (id: number) => {
    // 🔥 1. CHECK STUDENTS
    const studentsCount = await db.students
      .where("classId")
      .equals(id)
      .count();

    if (studentsCount > 0) {
      alert(
        `❌ Cannot delete this class.\n\nThere are ${studentsCount} student(s) assigned to it.\nMove or delete students first before deleting this class.`
      );
      return;
    }

    // 🔥 2. CHECK SCORES (OPTIONAL BUT IMPORTANT SAFETY)
    const scoresCount = await db.scores
      .where("classId")
      .equals(id)
      .count();

    if (scoresCount > 0) {
      alert(
        "❌ Cannot delete this class.\n\nAcademic score records exist for this class."
      );
      return;
    }

    // 🔥 3. FINAL CONFIRMATION
    const confirmDelete = confirm(
      "⚠️ Delete this class permanently?\n\nThis action cannot be undone."
    );

    if (!confirmDelete) return;

    await db.classes.delete(id);
    loadClasses();
  };

  // ================= FILTER =================
  const filtered = classes.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // ================= STYLES =================
  const container: React.CSSProperties = {
    padding: 20,
  };

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

  // ================= UI =================
  return (
    <div style={container}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Classes</h2>

        <button style={primaryButton} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close" : "+ Add Class"}
        </button>
      </div>

      {/* SEARCH */}
      <div style={{ marginTop: 10 }}>
        <input
          placeholder="Search class..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: 10,
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.2)",
            width: "100%",
            maxWidth: 300,
          }}
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
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            {editingId ? "Edit Class" : "Create Class"}
          </h3>

          <input
            placeholder="Class name (e.g. JHS 1)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              padding: 10,
              width: "100%",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.2)",
              marginBottom: 10,
            }}
          />

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
        {filtered.length === 0 && (
          <p style={{ opacity: 0.6 }}>No classes found</p>
        )}

        {filtered.map((c) => (
          <div key={c.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <b>{c.name}</b>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  ID: {c.id}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={button} onClick={() => edit(c)}>
                  Edit
                </button>

                <button style={button} onClick={() => remove(c.id)}>
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