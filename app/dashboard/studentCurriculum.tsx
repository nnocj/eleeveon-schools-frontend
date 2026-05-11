"use client";

/**
 * StudentCurriculum.tsx
 * -----------------------------------------------------
 * STUDENT ACADEMIC IDENTITY ENGINE
 *
 * This file binds a student to:
 * - a curriculum (what they are studying)
 * - a pathway (specialization track)
 *
 * This is the FOUNDATION of:
 * - course outlines
 * - graduation tracking
 * - promotion engine
 * - transcript generation
 *
 * Without this, students have no academic structure.
 * -----------------------------------------------------
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Student,
  Curriculum,
  CurriculumPathway,
  StudentCurriculum,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

// ======================================================
// COMPONENT
// ======================================================

export default function StudentCurriculumPage() {
  const { settings } = useSettings();

  const branchId = settings?.branchId || 1;

  // ======================================================
  // STATE
  // ======================================================

  const [rows, setRows] = useState<StudentCurriculum[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [loading, setLoading] = useState(true);

  // ======================================================
  // UI STATE
  // ======================================================

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ======================================================
  // FORM STATE
  // ======================================================

  const [studentId, setStudentId] = useState("");
  const [curriculumId, setCurriculumId] = useState("");
  const [pathwayId, setPathwayId] = useState("");

  // ======================================================
  // FILTERS
  // ======================================================

  const [search, setSearch] = useState("");

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    setLoading(true);

    const [
      r,
      s,
      c,
      p,
    ] = await Promise.all([
      db.studentCurriculums.toArray(),
      db.students.toArray(),
      db.curriculums.toArray(),
      db.curriculumPathways.toArray(),
    ]);

    setRows(r.filter(x => !x.isDeleted));
    setStudents(s);
    setCurriculums(c);
    setPathways(p);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const studentMap = useMemo(
    () => new Map(students.map(s => [s.id, s.fullName])),
    [students]
  );

  const curriculumMap = useMemo(
    () => new Map(curriculums.map(c => [c.id, c.name])),
    [curriculums]
  );

  const pathwayMap = useMemo(
    () => new Map(pathways.map(p => [p.id, p.name])),
    [pathways]
  );

  // ======================================================
  // RESET
  // ======================================================

  const reset = () => {
    setStudentId("");
    setCurriculumId("");
    setPathwayId("");

    setEditingId(null);
    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================

  const save = async () => {
    if (!studentId || !curriculumId) {
      alert("Student and Curriculum are required");
      return;
    }

    const payload = prepareSyncData({
      branchId,

      studentId: Number(studentId),
      curriculumId: Number(curriculumId),
      pathwayId: pathwayId ? Number(pathwayId) : undefined,

      status: "active",
      active: true,
    });

    if (editingId) {
      await db.studentCurriculums.update(editingId, payload);
    } else {
      await db.studentCurriculums.add(payload);
    }

    reset();
    load();
  };

  // ======================================================
  // EDIT
  // ======================================================

  const edit = (r: StudentCurriculum) => {
    setEditingId(r.id!);

    setStudentId(String(r.studentId));
    setCurriculumId(String(r.curriculumId));
    setPathwayId(String(r.pathwayId || ""));

    setShowForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================

  const remove = async (id: number) => {
    if (!confirm("Remove student curriculum assignment?")) return;

    await db.studentCurriculums.update(id, {
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
      const student = studentMap.get(r.studentId)?.toLowerCase() || "";
      const curriculum = curriculumMap.get(r.curriculumId)?.toLowerCase() || "";

      return (
        student.includes(q) ||
        curriculum.includes(q)
      );
    });
  }, [rows, search, studentMap, curriculumMap]);

  // ======================================================
  // STYLES (CONSISTENT SYSTEM)
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

  if (loading) return <div style={container}>Loading student curricula...</div>;

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={container}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Student Curriculums</h2>
          <p style={{ margin: 0, opacity: 0.6 }}>
            Assign students to academic programs and pathways
          </p>
        </div>

        <button style={primary} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close" : "+ Assign"}
        </button>
      </div>

      {/* SEARCH */}
      <div style={{ marginTop: 12 }}>
        <input
          style={{ ...input, width: 250 }}
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* FORM */}
      {showForm && (
        <div style={{ ...card, maxWidth: 600, marginTop: 15 }}>

          <select style={input} value={studentId} onChange={e => setStudentId(e.target.value)}>
            <option value="">Select Student</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>

          <select style={{ ...input, marginTop: 10 }} value={curriculumId} onChange={e => setCurriculumId(e.target.value)}>
            <option value="">Select Curriculum</option>
            {curriculums.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select style={{ ...input, marginTop: 10 }} value={pathwayId} onChange={e => setPathwayId(e.target.value)}>
            <option value="">Optional Pathway</option>
            {pathways.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button style={primary} onClick={save}>
              {editingId ? "Update" : "Assign"}
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

            <b>
              {studentMap.get(r.studentId)} → {curriculumMap.get(r.curriculumId)}
            </b>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Pathway: {pathwayMap.get(r.pathwayId || 0) || "None"} <br />
              Status: {r.status}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button style={button} onClick={() => edit(r)}>Edit</button>
              <button style={button} onClick={() => remove(r.id!)}>Remove</button>
            </div>

          </div>
        ))}
      </div>

    </div>
  );
}