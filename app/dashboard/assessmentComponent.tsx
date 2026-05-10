/*Assessment Components Page (With Visual Entry Counters)

Applicability Layer (THIS FILE)
AssessmentComponent = THE “WHEN + WHO + WHAT”

This is the most important discovery:

classId + subjectId + academicPeriodId
+ assessmentStructureId + gradingSystemId

👉 Meaning:

Field	Meaning
classId	WHO (which class)
subjectId	WHAT (subject)
academicPeriodId	WHEN (term/semester)
assessmentStructureId	HOW (weights)
gradingSystemId	HOW GRADES ARE CALCULATED

🔥 THIS is your activation map

Nothing exists without this.

*/

"use client";

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AssessmentComponent,
  Class,
  Subject,
  AcademicPeriod,
  AssessmentStructure,
  GradingSystem,
  AssessmentEntry,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

// ======================================================
// TYPES
// ======================================================

type FormState = {
  id?: number;

  classId: number;
  subjectId: number;

  academicPeriodId: number;

  assessmentStructureId: number;

  gradingSystemId?: number;

  active: boolean;
};

// ======================================================
// COMPONENT
// ======================================================

export default function AssessmentComponentsPage() {
  // ======================================================
  // SETTINGS
  // ======================================================

  const { settings } = useSettings();

  const branchId = settings?.branchId ?? 1;

  const primary =
    settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);

  const [editMode, setEditMode] = useState(false);

  const [search, setSearch] = useState("");

  const [components, setComponents] = useState<
    AssessmentComponent[]
  >([]);

  const [entries, setEntries] = useState<AssessmentEntry[]>([]);

  const [classes, setClasses] = useState<Class[]>([]);

  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [periods, setPeriods] = useState<AcademicPeriod[]>(
    []
  );

  const [structures, setStructures] = useState<
    AssessmentStructure[]
  >([]);

  const [gradingSystems, setGradingSystems] = useState<
    GradingSystem[]
  >([]);

  // ======================================================
  // FORM
  // ======================================================

  const [form, setForm] = useState<FormState>({
    classId: 0,
    subjectId: 0,
    academicPeriodId: 0,
    assessmentStructureId: 0,
    gradingSystemId: undefined,
    active: true,
  });

  // ======================================================
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 18,
    padding: 18,
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
  };

  const button: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  const outlineButton: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 12,
    border: `1px solid ${primary}`,
    background: "transparent",
    color: "var(--text)",
    fontWeight: 700,
    cursor: "pointer",
  };

  const badge: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background: "rgba(0,0,0,0.06)",
  };

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    setLoading(true);

    try {
      const [
        comps,
        entryData,
        cls,
        subjs,
        per,
        struct,
        grades,
      ] = await Promise.all([
        db.assessmentComponents.toArray(),
        db.assessmentEntries.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.academicPeriods.toArray(),
        db.assessmentStructures.toArray(),
        db.gradingSystems.toArray(),
      ]);

      setComponents(
        comps.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setEntries(
        entryData.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setClasses(
        cls.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setSubjects(
        subjs.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setPeriods(
        per.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setStructures(
        struct.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setGradingSystems(
        grades.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // FILTER
  // ======================================================

  const filtered = useMemo(() => {
    if (!search.trim()) return components;

    return components.filter((c) => {
      const cls =
        classes.find((x) => x.id === c.classId)?.name ||
        "";

      const sub =
        subjects.find((x) => x.id === c.subjectId)
          ?.name || "";

      return (
        cls
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        sub
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    });
  }, [search, components, classes, subjects]);

  // ======================================================
  // GROUPED
  // ======================================================

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      AssessmentComponent[]
    >();

    filtered.forEach((c) => {
      const key = `${c.classId}-${c.subjectId}-${c.academicPeriodId}`;

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key)?.push(c);
    });

    return Array.from(map.entries());
  }, [filtered]);

  // ======================================================
  // SAVE
  // ======================================================

  const save = async () => {
    if (
      !form.classId ||
      !form.subjectId ||
      !form.academicPeriodId ||
      !form.assessmentStructureId
    ) {
      alert("Complete all required fields");
      return;
    }

    const payload: AssessmentComponent =
      prepareSyncData({
        branchId,

        classId: form.classId,

        subjectId: form.subjectId,

        academicPeriodId:
          form.academicPeriodId,

        assessmentStructureId:
          form.assessmentStructureId,

        gradingSystemId:
          form.gradingSystemId,

        active: form.active,
      });

    if (editMode && form.id) {
      await db.assessmentComponents.update(
        form.id,
        payload
      );
    } else {
      await db.assessmentComponents.add(payload);
    }

    reset();

    load();
  };

  // ======================================================
  // EDIT
  // ======================================================

  const edit = (
    component: AssessmentComponent
  ) => {
    setForm({
      id: component.id,

      classId: component.classId,

      subjectId: component.subjectId,

      academicPeriodId:
        component.academicPeriodId,

      assessmentStructureId:
        component.assessmentStructureId,

      gradingSystemId:
        component.gradingSystemId,

      active: component.active,
    });

    setEditMode(true);

    setShowForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================

  const remove = async (id?: number) => {
    if (!id) return;

    await db.assessmentComponents.delete(id);

    load();
  };

  // ======================================================
  // RESET
  // ======================================================

  const reset = () => {
    setForm({
      classId: 0,
      subjectId: 0,
      academicPeriodId: 0,
      assessmentStructureId: 0,
      gradingSystemId: undefined,
      active: true,
    });

    setEditMode(false);

    setShowForm(false);
  };

  // ======================================================
  // HELPERS
  // ======================================================

  const get = {
    class: (id: number) =>
      classes.find((x) => x.id === id)?.name ||
      "Unknown",

    subject: (id: number) =>
      subjects.find((x) => x.id === id)?.name ||
      "Unknown",

    period: (id: number) =>
      periods.find((x) => x.id === id)?.name ||
      "Unknown",

    structure: (id: number) =>
      structures.find((x) => x.id === id)
        ?.name || "Unknown",

    grade: (id?: number) =>
      gradingSystems.find((x) => x.id === id)
        ?.name || "-",
  };

  // ======================================================
  // ENTRY COUNTS
  // ======================================================

  const getEntryCount = (
    classId: number,
    subjectId: number,
    periodId: number
  ) => {
    return entries.filter(
      (x) =>
        x.classId === classId &&
        x.subjectId === subjectId &&
        x.academicPeriodId === periodId
    ).length;
  };

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        Loading assessment components...
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div
      style={{
        padding: 20,
        color: "var(--text)",
      }}
    >
      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>
            Assessment Components
          </h2>

          <div
            style={{
              opacity: 0.7,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            Configure assessment structures
            for classes and subjects.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <input
            style={{
              ...input,
              width: 260,
            }}
            placeholder="Search class or subject..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />

          {!showForm && (
            <button
              style={button}
              onClick={() =>
                setShowForm(true)
              }
            >
              + Create Component
            </button>
          )}
        </div>
      </div>

      {/* ====================================================== */}
      {/* FORM */}
      {/* ====================================================== */}

      {showForm && (
        <div
          style={{
            ...card,
            marginTop: 20,
            display: "grid",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0 }}>
              {editMode
                ? "Edit Component"
                : "Create Component"}
            </h3>

            <button
              style={outlineButton}
              onClick={reset}
            >
              Close
            </button>
          </div>

          <select
            style={input}
            value={form.classId}
            onChange={(e) =>
              setForm({
                ...form,
                classId: Number(
                  e.target.value
                ),
              })
            }
          >
            <option value={0}>
              Select Class
            </option>

            {classes.map((c) => (
              <option
                key={c.id}
                value={c.id}
              >
                {c.name}
              </option>
            ))}
          </select>

          <select
            style={input}
            value={form.subjectId}
            onChange={(e) =>
              setForm({
                ...form,
                subjectId: Number(
                  e.target.value
                ),
              })
            }
          >
            <option value={0}>
              Select Subject
            </option>

            {subjects.map((s) => (
              <option
                key={s.id}
                value={s.id}
              >
                {s.name}
              </option>
            ))}
          </select>

          <select
            style={input}
            value={
              form.academicPeriodId
            }
            onChange={(e) =>
              setForm({
                ...form,
                academicPeriodId:
                  Number(
                    e.target.value
                  ),
              })
            }
          >
            <option value={0}>
              Select Period
            </option>

            {periods.map((p) => (
              <option
                key={p.id}
                value={p.id}
              >
                {p.name}
              </option>
            ))}
          </select>

          <select
            style={input}
            value={
              form.assessmentStructureId
            }
            onChange={(e) =>
              setForm({
                ...form,
                assessmentStructureId:
                  Number(
                    e.target.value
                  ),
              })
            }
          >
            <option value={0}>
              Select Structure
            </option>

            {structures.map((s) => (
              <option
                key={s.id}
                value={s.id}
              >
                {s.name}
              </option>
            ))}
          </select>

          <select
            style={input}
            value={
              form.gradingSystemId || 0
            }
            onChange={(e) =>
              setForm({
                ...form,
                gradingSystemId:
                  Number(
                    e.target.value
                  ),
              })
            }
          >
            <option value={0}>
              Select Grading System
            </option>

            {gradingSystems.map((g) => (
              <option
                key={g.id}
                value={g.id}
              >
                {g.name}
              </option>
            ))}
          </select>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm({
                  ...form,
                  active:
                    e.target.checked,
                })
              }
            />

            Active
          </label>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              style={button}
              onClick={save}
            >
              {editMode
                ? "Update Component"
                : "Save Component"}
            </button>

            <button
              style={outlineButton}
              onClick={reset}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* VISUAL SUMMARY */}
      {/* ====================================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.7 }}>
            Total Components
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 8,
            }}
          >
            {components.length}
          </div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.7 }}>
            Total Assessment Entries
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 8,
            }}
          >
            {entries.length}
          </div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.7 }}>
            Active Components
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 8,
            }}
          >
            {
              components.filter((x) => x.active)
                .length
            }
          </div>
        </div>
      </div>

      {/* ====================================================== */}
      {/* LIST */}
      {/* ====================================================== */}

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gap: 14,
        }}
      >
        {grouped.length === 0 && (
          <div style={card}>
            No assessment components found.
          </div>
        )}

        {grouped.map(([key, items]) => {
          const item = items[0];

          const entryCount = getEntryCount(
            item.classId,
            item.subjectId,
            item.academicPeriodId
          );

          return (
            <div
              key={key}
              style={card}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    {get.class(
                      item.classId
                    )}{" "}
                    →{" "}
                    {get.subject(
                      item.subjectId
                    )}{" "}
                    →{" "}
                    {get.period(
                      item.academicPeriodId
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      opacity: 0.7,
                    }}
                  >
                    Structure:{" "}
                    {get.structure(
                      item.assessmentStructureId
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      opacity: 0.7,
                    }}
                  >
                    Grading:{" "}
                    {get.grade(
                      item.gradingSystemId
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "start",
                  }}
                >
                  <div style={badge}>
                    Components: {items.length}
                  </div>

                  <div style={badge}>
                    Entries: {entryCount}
                  </div>
                </div>
              </div>

              {/* VISUAL ENTRY BAR */}

              <div
                style={{
                  marginTop: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    fontSize: 12,
                    marginBottom: 6,
                    opacity: 0.7,
                  }}
                >
                  <span>Assessment Usage</span>
                  <span>{entryCount} Entries</span>
                </div>

                <div
                  style={{
                    height: 10,
                    borderRadius: 999,
                    background:
                      "rgba(0,0,0,0.08)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(
                        entryCount,
                        100
                      )}%`,
                      height: "100%",
                      background: primary,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 16,
                  flexWrap: "wrap",
                }}
              >
                <button
                  style={outlineButton}
                  onClick={() =>
                    edit(item)
                  }
                >
                  Edit
                </button>

                <button
                  style={outlineButton}
                  onClick={() =>
                    remove(item.id)
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
