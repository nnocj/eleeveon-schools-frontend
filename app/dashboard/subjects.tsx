"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";

export default function Subjects() {
  const [name, setName] = useState("");
  const [subjects, setSubjects] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ================= LOAD =================
  const loadSubjects = async () => {
    const data = await db.subjects.toArray();
    setSubjects(data);
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  // ================= RESET =================
  const reset = () => {
    setName("");
    setEditingId(null);
    setShowForm(false);
  };

  // ================= SAVE =================
  const save = async () => {
    if (!name.trim()) {
      alert("Please enter subject name");
      return;
    }

    const exists = await db.subjects
      .filter((s) => s.name.toLowerCase() === name.toLowerCase())
      .first();

    if (exists && !editingId) {
      alert("Subject already exists");
      return;
    }

    const payload = prepareSyncData({
      name,
    });

    if (editingId) {
      await db.subjects.update(editingId, payload);
    } else {
      await db.subjects.add(payload);
    }

    reset();
    loadSubjects();
  };

  // ================= EDIT =================
  const edit = (s: any) => {
    setName(s.name);
    setEditingId(s.id);
    setShowForm(true);
  };

  // ================= SAFE DELETE =================
  const remove = async (id: number) => {
    const confirmDelete = confirm(
      "Are you sure you want to delete this subject?\n\nThis action cannot be undone."
    );

    if (!confirmDelete) return;

    await db.subjects.delete(id);
    loadSubjects();
  };

  // ================= FILTER =================
  const filtered = subjects.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  // ================= STYLES (MATCH CLASSES EXACTLY) =================
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
        <h2 style={{ margin: 0 }}>Subjects</h2>

        <button style={primaryButton} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close" : "+ Add Subject"}
        </button>
      </div>

      {/* SEARCH */}
      <div style={{ marginTop: 10 }}>
        <input
          placeholder="Search subject..."
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
            {editingId ? "Edit Subject" : "Create Subject"}
          </h3>

          <input
            placeholder="Subject name (e.g. Mathematics)"
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
          <p style={{ opacity: 0.6 }}>No subjects found</p>
        )}

        {filtered.map((s) => (
          <div key={s.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <b>{s.name}</b>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  ID: {s.id}
                </div>
              </div>

              {/* ACTIONS (MATCH CLASSES EXACTLY) */}
              <div style={{ display: "flex", gap: 8 }}>
                <button style={button} onClick={() => edit(s)}>
                  Edit
                </button>

                <button style={button} onClick={() => remove(s.id)}>
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