"use client";

/**
 * CurriculumPathways.tsx
 * -----------------------------------------------------
 * ACADEMIC PATHWAY ENGINE
 *
 * Manages curriculum-level pathway grouping:
 * - Major / stream / track concepts are logically defined here
 * - Actual subject mapping happens in CurriculumSubjects.tsx
 *
 * This keeps curriculum structure flexible without mixing
 * academic delivery rules.
 * -----------------------------------------------------
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Curriculum,
  CurriculumPathway,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

// ======================================================
// COMPONENT
// ======================================================

export default function CurriculumPathways() {
  const { settings } = useSettings();

  const branchId = settings?.branchId || 1;

  // ======================================================
  // STATE
  // ======================================================

  const [rows, setRows] = useState<CurriculumPathway[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [loading, setLoading] = useState(true);

  // ======================================================
  // UI STATE
  // ======================================================

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ======================================================
  // FORM STATE
  // ======================================================

  const [curriculumId, setCurriculumId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  // ======================================================
  // FILTERS
  // ======================================================

  const [search, setSearch] = useState("");
  const [curriculumFilter, setCurriculumFilter] = useState("");

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    setLoading(true);

    const [r, c] = await Promise.all([
      db.curriculumPathways.toArray(),
      db.curriculums.toArray(),
    ]);

    setRows(r.filter(x => !x.isDeleted));
    setCurriculums(c);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const curriculumMap = useMemo(
    () => new Map(curriculums.map(c => [c.id, c.name])),
    [curriculums]
  );

  // ======================================================
  // RESET
  // ======================================================

  const reset = () => {
    setCurriculumId("");
    setName("");
    setCode("");

    setEditingId(null);
    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================

  const save = async () => {
    if (!curriculumId || !name.trim()) {
      alert("Curriculum and Pathway name required");
      return;
    }

    const payload = prepareSyncData({
      branchId,
      curriculumId: Number(curriculumId),

      name: name.trim(),
      code: code.trim() || undefined,

      active: true,
    });

    if (editingId) {
      await db.curriculumPathways.update(editingId, payload);
    } else {
      await db.curriculumPathways.add(payload);
    }

    reset();
    load();
  };

  // ======================================================
  // EDIT
  // ======================================================

  const edit = (r: CurriculumPathway) => {
    setEditingId(r.id!);

    setCurriculumId(String(r.curriculumId));
    setName(r.name || "");
    setCode(r.code || "");

    setShowForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================

  const remove = async (id: number) => {
    if (!confirm("Delete pathway?")) return;

    await db.curriculumPathways.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    load();
  };

  // ======================================================
  // FILTERED
  // ======================================================

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return rows.filter(r => {
      const curriculumName =
        curriculumMap.get(r.curriculumId)?.toLowerCase() || "";

      const matchText =
        r.name?.toLowerCase().includes(q) ||
        curriculumName.includes(q);

      const matchCurriculum =
        !curriculumFilter || r.curriculumId === Number(curriculumFilter);

      return matchText && matchCurriculum;
    });
  }, [rows, search, curriculumFilter]);

  // ======================================================
  // STYLES (UNCHANGED - CONSISTENT UI SYSTEM)
  // ======================================================

  const container: React.CSSProperties = {
    padding: 20,
    color: "var(--text)",
  };

  const card: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "var(--surface)",
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  };

  const input: React.CSSProperties = {
    padding: 10,
    width: "100%",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  const button: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--primary-color)",
    background: "var(--surface)",
    color: "var(--text)",
    cursor: "pointer",
  };

  const primary: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    background: "var(--primary-color)",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  };

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return <div style={container}>Loading pathways...</div>;
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={container}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Curriculum Pathways</h2>
          <p style={{ margin: 0, opacity: 0.6 }}>
            Define academic specializations and tracks
          </p>
        </div>

        <button style={primary} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close" : "+ Add Pathway"}
        </button>
      </div>

      {/* FILTERS */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input
          style={{ ...input, width: 220 }}
          placeholder="Search pathways..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          style={button}
          value={curriculumFilter}
          onChange={(e) => setCurriculumFilter(e.target.value)}
        >
          <option value="">All Curriculums</option>
          {curriculums.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* FORM */}
      {showForm && (
        <div style={{ ...card, maxWidth: 600, marginTop: 15 }}>

          <select style={input} value={curriculumId} onChange={e => setCurriculumId(e.target.value)}>
            <option value="">Select Curriculum</option>
            {curriculums.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <input
            style={{ ...input, marginTop: 10 }}
            placeholder="Pathway name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            style={{ ...input, marginTop: 10 }}
            placeholder="Code (optional)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button style={primary} onClick={save}>
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
        {filtered.map(r => (
          <div key={r.id} style={card}>

            <b>{r.name}</b>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Curriculum: {curriculumMap.get(r.curriculumId)} <br />
              Code: {r.code || "-"}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button style={button} onClick={() => edit(r)}>Edit</button>
              <button style={button} onClick={() => remove(r.id!)}>Delete</button>
            </div>

          </div>
        ))}
      </div>

    </div>
  );
}