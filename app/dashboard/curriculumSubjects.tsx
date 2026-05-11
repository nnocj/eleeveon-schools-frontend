"use client";

/**
 * CurriculumSubjects.tsx
 * -----------------------------------------------------
 * CORE CURRICULUM BLUEPRINT ENGINE (SIMPLIFIED)
 * -----------------------------------------------------
 * RESPONSIBILITY
 * -----------------------------------------------------
 * This file ONLY defines the structure of a curriculum:
 *
 * - Which subjects belong to a curriculum
 * - Subject classification (core / elective / optional)
 * - Ordering of subjects within curriculum
 * - Credit allocation (optional metadata)
 *
 * ❌ DOES NOT HANDLE:
 * - Classes
 * - Academic periods
 * - Assessment rules
 * - Grading systems
 *
 * These are handled by:
 * - AcademicSubjectContext (runtime mapping)
 * - AssessmentApplicability (assessment rules engine)
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Curriculum,
  CurriculumSubject,
  Subject,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

// ======================================================
// TYPES
// ======================================================

type SubjectType = "core" | "elective" | "optional";

type FormState = {
  id?: number;

  curriculumId: number | "";
  subjectId: number | "";

  type: SubjectType;

  credits: string;
  orderIndex: string;

  active: boolean;
};

// ======================================================
// COMPONENT
// ======================================================

export default function CurriculumSubjects() {
  const { settings } = useSettings();

  const branchId = settings?.branchId || 1;
  const primary = settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [rows, setRows] = useState<CurriculumSubject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  // UI
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // FILTERS
  const [search, setSearch] = useState("");
  const [curriculumFilter, setCurriculumFilter] = useState<number | "">("");

  // FORM
  const [form, setForm] = useState<FormState>({
    curriculumId: "",
    subjectId: "",
    type: "core",
    credits: "",
    orderIndex: "",
    active: true,
  });

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    setLoading(true);

    const [cs, c, s] = await Promise.all([
      db.curriculumSubjects.toArray(),
      db.curriculums.toArray(),
      db.subjects.toArray(),
    ]);

    setRows(cs.filter(x => x.branchId === branchId && !x.isDeleted));
    setCurriculums(c.filter(x => x.branchId === branchId && !x.isDeleted));
    setSubjects(s.filter(x => x.branchId === branchId && !x.isDeleted));

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const curriculumMap = useMemo(
    () => new Map(curriculums.map(c => [c.id, c.name])),
    [curriculums]
  );

  const subjectMap = useMemo(
    () => new Map(subjects.map(s => [s.id, s.name])),
    [subjects]
  );

  // ======================================================
  // RESET
  // ======================================================

  const reset = () => {
    setForm({
      curriculumId: "",
      subjectId: "",
      type: "core",
      credits: "",
      orderIndex: "",
      active: true,
    });

    setEditingId(null);
    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================

  const save = async () => {
    if (!form.curriculumId || !form.subjectId) {
      alert("Curriculum and Subject are required");
      return;
    }

    const payload = prepareSyncData({
      branchId,

      curriculumId: Number(form.curriculumId),
      subjectId: Number(form.subjectId),

      type: form.type,
      credits: form.credits ? Number(form.credits) : undefined,
      orderIndex: form.orderIndex ? Number(form.orderIndex) : undefined,

      active: form.active,
    });

    if (editingId) {
      await db.curriculumSubjects.update(editingId, payload);
    } else {
      await db.curriculumSubjects.add(payload);
    }

    reset();
    load();
  };

  // ======================================================
  // EDIT
  // ======================================================

  const edit = (r: CurriculumSubject) => {
    setEditingId(r.id || null);

    setForm({
      curriculumId: r.curriculumId,
      subjectId: r.subjectId,
      type: (r.type as SubjectType) || "core",
      credits: r.credits ? String(r.credits) : "",
      orderIndex: r.orderIndex ? String(r.orderIndex) : "",
      active: r.active ?? true,
    });

    setShowForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================

  const remove = async (id?: number) => {
    if (!id) return;
    if (!confirm("Delete curriculum subject?")) return;

    await db.curriculumSubjects.update(id, {
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
      const subject = subjectMap.get(r.subjectId)?.toLowerCase() || "";
      const curriculum = curriculumMap.get(r.curriculumId)?.toLowerCase() || "";

      const matchesText =
        subject.includes(q) || curriculum.includes(q);

      const matchesCurriculum =
        !curriculumFilter || r.curriculumId === curriculumFilter;

      return matchesText && matchesCurriculum;
    });
  }, [rows, search, curriculumFilter]);

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return <div style={{ padding: 20 }}>Loading curriculum subjects...</div>;
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Curriculum Subjects</h2>
          <p style={{ margin: 0, opacity: 0.6 }}>
            Define curriculum structure (subjects only)
          </p>
        </div>

        <button
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: primary,
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Close" : "+ Add Subject"}
        </button>
      </div>

      {/* FILTERS */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input
          style={{
            padding: 10,
            width: 220,
            borderRadius: 8,
            border: "1px solid #ccc",
          }}
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          value={curriculumFilter}
          onChange={(e) =>
            setCurriculumFilter(Number(e.target.value) || "")
          }
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
        <div style={{ marginTop: 20, padding: 16, border: "1px solid #ddd" }}>

          <select
            value={form.curriculumId}
            onChange={(e) =>
              setForm({ ...form, curriculumId: Number(e.target.value) || "" })
            }
          >
            <option value="">Select Curriculum</option>
            {curriculums.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={form.subjectId}
            onChange={(e) =>
              setForm({ ...form, subjectId: Number(e.target.value) || "" })
            }
          >
            <option value="">Select Subject</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            value={form.type}
            onChange={(e) =>
              setForm({ ...form, type: e.target.value as SubjectType })
            }
          >
            <option value="core">Core</option>
            <option value="elective">Elective</option>
            <option value="optional">Optional</option>
          </select>

          <input
            placeholder="Credits"
            value={form.credits}
            onChange={(e) => setForm({ ...form, credits: e.target.value })}
          />

          <input
            placeholder="Order Index"
            value={form.orderIndex}
            onChange={(e) => setForm({ ...form, orderIndex: e.target.value })}
          />

          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button onClick={save} style={{ background: primary, color: "#fff" }}>
              Save
            </button>
            <button onClick={reset}>Cancel</button>
          </div>

        </div>
      )}

      {/* LIST */}
      <div style={{ marginTop: 20 }}>
        {filtered.map(r => (
          <div key={r.id} style={{ padding: 12, border: "1px solid #ddd", marginBottom: 10 }}>
            <b>{subjectMap.get(r.subjectId)}</b>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Curriculum: {curriculumMap.get(r.curriculumId)} <br />
              Type: {r.type} | Credits: {r.credits || "-"}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button onClick={() => edit(r)}>Edit</button>
              <button onClick={() => remove(r.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}