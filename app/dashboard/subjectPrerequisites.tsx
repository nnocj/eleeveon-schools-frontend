"use client";

/**
 * SubjectPrerequisites.tsx
 * -----------------------------------------------------
 * PREREQUISITE ENGINE (ACADEMIC RULES LAYER)
 *
 * This file defines subject dependency rules such as:
 * - Calculus II requires Calculus I
 * - Advanced Physics requires Intro Physics
 *
 * This is used by:
 * - registration validation
 * - academic progression checks
 * - graduation audit engine
 * - transcript validation
 *
 * This is NOT UI decoration — it is academic logic enforcement.
 * -----------------------------------------------------
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Subject,
  SubjectPrerequisite,
  CurriculumSubject,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

// ======================================================
// COMPONENT
// ======================================================

export default function SubjectPrerequisites() {
  const { settings } = useSettings();

  const branchId = settings?.branchId || 1;

  // ======================================================
  // STATE
  // ======================================================

  const [rows, setRows] = useState<SubjectPrerequisite[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [loading, setLoading] = useState(true);

  // ======================================================
  // UI STATE
  // ======================================================

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ======================================================
  // FORM STATE
  // ======================================================

  const [subjectId, setSubjectId] = useState<string>("");
  const [prerequisiteId, setPrerequisiteId] = useState<string>("");
  const [type, setType] = useState<SubjectPrerequisite["type"]>("prerequisite");
  const [minScore, setMinScore] = useState<string>("");

  // ======================================================
  // FILTERS
  // ======================================================

  const [search, setSearch] = useState("");

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    setLoading(true);

    const [r, s, cs] = await Promise.all([
      db.subjectPrerequisites.toArray(),
      db.subjects.toArray(),
      db.curriculumSubjects.toArray(),
    ]);

    setRows(r.filter(x => !x.isDeleted));
    setSubjects(s);
    setCurriculumSubjects(cs);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const subjectMap = useMemo(
    () => new Map(subjects.map(s => [s.id, s.name])),
    [subjects]
  );

  // ======================================================
  // RESET
  // ======================================================

  const reset = () => {
    setSubjectId("");
    setPrerequisiteId("");
    setType("prerequisite");
    setMinScore("");

    setEditingId(null);
    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================

  const save = async () => {
    if (!subjectId || !prerequisiteId) {
      alert("Both subject and prerequisite are required");
      return;
    }

    const payload = prepareSyncData({
      branchId,

      curriculumSubjectId: Number(subjectId),
      prerequisiteSubjectId: Number(prerequisiteId),

      type,
      minimumScore: minScore ? Number(minScore) : undefined,

      active: true,
    });

    if (editingId) {
      await db.subjectPrerequisites.update(editingId, payload);
    } else {
      await db.subjectPrerequisites.add(payload);
    }

    reset();
    load();
  };

  // ======================================================
  // EDIT
  // ======================================================

  const edit = (r: SubjectPrerequisite) => {
    setEditingId(r.id!);

    setSubjectId(String(r.curriculumSubjectId));
    setPrerequisiteId(String(r.prerequisiteSubjectId));
    setType(r.type || "prerequisite");
    setMinScore(r.minimumScore ? String(r.minimumScore) : "");

    setShowForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================

  const remove = async (id: number) => {
    if (!confirm("Delete prerequisite rule?")) return;

    await db.subjectPrerequisites.update(id, {
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
      const subjectName =
        subjectMap.get(r.curriculumSubjectId)?.toLowerCase() || "";

      const prereqName =
        subjectMap.get(r.prerequisiteSubjectId)?.toLowerCase() || "";

      return (
        subjectName.includes(q) ||
        prereqName.includes(q)
      );
    });
  }, [rows, search, subjectMap]);

  // ======================================================
  // STYLES (CONSISTENT UI SYSTEM)
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

  if (loading) return <div style={container}>Loading prerequisites...</div>;

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={container}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Subject Prerequisites</h2>
          <p style={{ margin: 0, opacity: 0.6 }}>
            Define subject dependency rules for academic progression
          </p>
        </div>

        <button style={primary} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close" : "+ Add Rule"}
        </button>
      </div>

      {/* SEARCH */}
      <div style={{ marginTop: 12 }}>
        <input
          style={{ ...input, width: 250 }}
          placeholder="Search subjects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* FORM */}
      {showForm && (
        <div style={{ ...card, maxWidth: 600, marginTop: 15 }}>

          <select
            style={input}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Select Subject</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            style={{ ...input, marginTop: 10 }}
            value={prerequisiteId}
            onChange={(e) => setPrerequisiteId(e.target.value)}
          >
            <option value="">Select Prerequisite</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            style={{ ...input, marginTop: 10 }}
            value={type}
            onChange={(e) => setType(e.target.value as any)}
          >
            <option value="prerequisite">Prerequisite</option>
            <option value="corequisite">Corequisite</option>
            <option value="recommended">Recommended</option>
          </select>

          <input
            style={{ ...input, marginTop: 10 }}
            placeholder="Minimum score (optional)"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
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
        {filtered.length === 0 && (
          <p style={{ opacity: 0.6 }}>No prerequisite rules found</p>
        )}

        {filtered.map(r => (
          <div key={r.id} style={card}>

            <b>
              {subjectMap.get(r.curriculumSubjectId)} →{" "}
              {subjectMap.get(r.prerequisiteSubjectId)}
            </b>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Type: {r.type} <br />
              Min Score: {r.minimumScore || "-"}
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