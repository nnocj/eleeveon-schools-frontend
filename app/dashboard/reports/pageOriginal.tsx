"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  db,
  Student,
  Class,
  Subject,
  AcademicPeriod,
  AssessmentComponent,
  AssessmentEntry,
  AssessmentStructure,
  AssessmentStructureItem,
  GradingSystem,
  GradeRule,
} from "../../lib/db";

import { useSettings } from "../../context/settings-context";

type ViewMode =
  | "class"
  | "student";

export default function ReportPage() {
  const { settings } =
    useSettings();

  const primary =
    settings?.primaryColor ||
    "var(--primary-color)";

  // =========================
  // STATE
  // =========================

  const [loading, setLoading] =
    useState(true);

  const [mode, setMode] =
    useState<ViewMode>("class");

  const [students, setStudents] =
    useState<Student[]>([]);

  const [classes, setClasses] =
    useState<Class[]>([]);

  const [subjects, setSubjects] =
    useState<Subject[]>([]);

  const [periods, setPeriods] =
    useState<AcademicPeriod[]>(
      []
    );

  const [components, setComponents] =
    useState<
      AssessmentComponent[]
    >([]);

  const [entries, setEntries] =
    useState<
      AssessmentEntry[]
    >([]);

  const [structures, setStructures] =
    useState<
      AssessmentStructure[]
    >([]);

  const [
    structureItems,
    setStructureItems,
  ] = useState<
    AssessmentStructureItem[]
  >([]);

  const [
    gradingSystems,
    setGradingSystems,
  ] = useState<
    GradingSystem[]
  >([]);

  const [gradeRules, setGradeRules] =
    useState<GradeRule[]>([]);

  const [
    selectedClass,
    setSelectedClass,
  ] = useState<number>();

  const [
    selectedStudent,
    setSelectedStudent,
  ] = useState<number>();

  const [
    selectedSubject,
    setSelectedSubject,
  ] = useState<number>();

  const [
    selectedPeriod,
    setSelectedPeriod,
  ] = useState<number>();

  // =========================
  // STYLES
  // =========================

  const card: React.CSSProperties =
    {
      background:
        "var(--surface)",
      border:
        "1px solid rgba(0,0,0,0.08)",
      borderRadius: 22,
      padding: 18,
      boxShadow:
        "0 6px 20px rgba(0,0,0,0.04)",
    };

  const input: React.CSSProperties =
    {
      width: "100%",
      padding: 12,
      borderRadius: 12,
      border:
        "1px solid rgba(0,0,0,0.12)",
      background:
        "var(--surface)",
      color: "var(--text)",
      outline: "none",
      fontSize: 14,
    };

  const button: React.CSSProperties =
    {
      padding: "12px 16px",
      borderRadius: 12,
      border: "none",
      background: primary,
      color: "#fff",
      fontWeight: 700,
      cursor: "pointer",
    };

  const outlineButton: React.CSSProperties =
    {
      padding: "12px 16px",
      borderRadius: 12,
      border: `1px solid ${primary}`,
      background: "transparent",
      color: "var(--text)",
      fontWeight: 700,
      cursor: "pointer",
    };

  const badge: React.CSSProperties =
    {
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background:
        "rgba(0,0,0,0.06)",
    };

  // =========================
  // LOAD
  // =========================

  const load = async () => {
    setLoading(true);

    try {
      const [
        s,
        c,
        sub,
        p,
        comp,
        e,
        st,
        si,
        gs,
        gr,
      ] = await Promise.all([
        db.students.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.academicPeriods.toArray(),
        db.assessmentComponents.toArray(),
        db.assessmentEntries.toArray(),
        db.assessmentStructures.toArray(),
        db.assessmentStructureItems.toArray(),
        db.gradingSystems.toArray(),
        db.gradeRules.toArray(),
      ]);

      setStudents(
        s.filter(
          (x) => !x.isDeleted
        )
      );

      setClasses(
        c.filter(
          (x) => !x.isDeleted
        )
      );

      setSubjects(
        sub.filter(
          (x) => !x.isDeleted
        )
      );

      setPeriods(
        p.filter(
          (x) => !x.isDeleted
        )
      );

      setComponents(
        comp.filter(
          (x) => !x.isDeleted
        )
      );

      setEntries(
        e.filter(
          (x) => !x.isDeleted
        )
      );

      setStructures(
        st.filter(
          (x) => !x.isDeleted
        )
      );

      setStructureItems(
        si.filter(
          (x) => !x.isDeleted
        )
      );

      setGradingSystems(
        gs.filter(
          (x) => !x.isDeleted
        )
      );

      setGradeRules(
        gr.filter(
          (x) => !x.isDeleted
        )
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // =========================
  // CLASS STUDENTS
  // =========================

  const classStudents =
    useMemo(() => {
      if (!selectedClass)
        return [];

      return students.filter(
        (s) =>
          s.currentClassId ===
          selectedClass
      );
    }, [
      students,
      selectedClass,
    ]);

  // =========================
  // ACTIVE CONFIG
  // =========================

  const activeComponent =
    useMemo(() => {
      return components.find(
        (c) =>
          c.classId ===
            selectedClass &&
          c.subjectId ===
            selectedSubject &&
          c.academicPeriodId ===
            selectedPeriod
      );
    }, [
      components,
      selectedClass,
      selectedSubject,
      selectedPeriod,
    ]);

  const structure =
    useMemo(() => {
      if (!activeComponent)
        return null;

      return structures.find(
        (s) =>
          s.id ===
          activeComponent.assessmentStructureId
      );
    }, [
      activeComponent,
      structures,
    ]);

  const items = useMemo(() => {
    if (!structure) return [];

    return structureItems.filter(
      (i) =>
        i.assessmentStructureId ===
        structure.id
    );
  }, [
    structure,
    structureItems,
  ]);

  const rules = useMemo(() => {
    if (!activeComponent)
      return [];

    const gs =
      gradingSystems.find(
        (g) =>
          g.id ===
          activeComponent.gradingSystemId
      );

    if (!gs) return [];

    return gradeRules.filter(
      (r) =>
        r.gradingSystemId ===
        gs.id
    );
  }, [
    activeComponent,
    gradingSystems,
    gradeRules,
  ]);

  // =========================
  // FILTERED ENTRIES
  // =========================

  const filteredEntries =
    useMemo(() => {
      return entries.filter(
        (e) =>
          e.classId ===
            selectedClass &&
          e.subjectId ===
            selectedSubject &&
          e.academicPeriodId ===
            selectedPeriod
      );
    }, [
      entries,
      selectedClass,
      selectedSubject,
      selectedPeriod,
    ]);

  // =========================
  // ENGINE
  // =========================

  const computeStudent = (
    studentId: number
  ) => {
    const studentEntries =
      filteredEntries.filter(
        (e) =>
          e.studentId ===
          studentId
      );

    let total = 0;

    const breakdown =
      items.map((item) => {
        const entry =
          studentEntries.filter(
            (e) =>
              e.assessmentStructureItemId ===
              item.id
          );

        const score =
          entry.reduce(
            (a, b) =>
              a +
              (b.score || 0),
            0
          );

        const weighted =
          item.maxScore > 0
            ? (score /
                item.maxScore) *
              item.weight
            : 0;

        total += weighted;

        return {
          name: item.name,
          score,
          max: item.maxScore,
          weight:
            item.weight,
          weighted,
        };
      });

    const rule = rules.find(
      (r) =>
        total >= r.minScore &&
        total <= r.maxScore
    );

    return {
      total: Number(
        total.toFixed(2)
      ),
      grade:
        rule?.grade || "-",
      remark:
        rule?.remark || "",
      gpa: rule?.gpa || 0,
      breakdown,
    };
  };

  const rankedStudents =
    useMemo(() => {
      return classStudents
        .map((s) => ({
          student: s,
          result:
            computeStudent(
              s.id!
            ),
        }))
        .sort(
          (a, b) =>
            b.result.total -
            a.result.total
        );
    }, [
      classStudents,
      filteredEntries,
      items,
      rules,
    ]);

  // =========================
  // ANALYTICS
  // =========================

  const averageScore =
    rankedStudents.length > 0
      ? (
          rankedStudents.reduce(
            (sum, s) =>
              sum +
              s.result.total,
            0
          ) /
          rankedStudents.length
        ).toFixed(2)
      : "0";

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <div
        style={{
          padding: 20,
        }}
      >
        Loading report...
      </div>
    );
  }

  // =========================
  // UI
  // =========================

  return (
    <div
      style={{
        padding: 20,
        color: "var(--text)",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
            }}
          >
            Academic Report Engine
          </h2>

          <div
            style={{
              opacity: 0.7,
              marginTop: 4,
              fontSize: 13,
            }}
          >
            Smart report and
            grading analytics
            powered by academic
            configurations.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            style={
              mode === "class"
                ? button
                : outlineButton
            }
            onClick={() =>
              setMode("class")
            }
          >
            Class Report
          </button>

          <button
            style={
              mode === "student"
                ? button
                : outlineButton
            }
            onClick={() =>
              setMode("student")
            }
          >
            Student Report
          </button>
        </div>
      </div>

      {/* SUMMARY */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(220px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div
            style={{
              opacity: 0.7,
              fontSize: 12,
            }}
          >
            Students
          </div>

          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {
              rankedStudents.length
            }
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              opacity: 0.7,
              fontSize: 12,
            }}
          >
            Assessment Items
          </div>

          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {items.length}
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              opacity: 0.7,
              fontSize: 12,
            }}
          >
            Average Score
          </div>

          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {averageScore}%
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              opacity: 0.7,
              fontSize: 12,
            }}
          >
            Grading Rules
          </div>

          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {rules.length}
          </div>
        </div>
      </div>

      {/* FILTERS */}

      <div
        style={{
          ...card,
          marginTop: 20,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(240px,1fr))",
          gap: 14,
        }}
      >
        <select
          style={input}
          value={selectedClass}
          onChange={(e) =>
            setSelectedClass(
              Number(
                e.target.value
              )
            )
          }
        >
          <option value="">
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
          value={selectedSubject}
          onChange={(e) =>
            setSelectedSubject(
              Number(
                e.target.value
              )
            )
          }
        >
          <option value="">
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
          value={selectedPeriod}
          onChange={(e) =>
            setSelectedPeriod(
              Number(
                e.target.value
              )
            )
          }
        >
          <option value="">
            Select Academic
            Period
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

        {mode ===
          "student" && (
          <select
            style={input}
            value={
              selectedStudent
            }
            onChange={(e) =>
              setSelectedStudent(
                Number(
                  e.target.value
                )
              )
            }
          >
            <option value="">
              Select Student
            </option>

            {classStudents.map(
              (s) => (
                <option
                  key={s.id}
                  value={s.id}
                >
                  {s.fullName}
                </option>
              )
            )}
          </select>
        )}
      </div>

      {/* ACTIVE CONFIG */}

      {activeComponent && (
        <div
          style={{
            ...card,
            marginTop: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={badge}>
              Structure:{" "}
              {structure?.name}
            </div>

            <div style={badge}>
              Items:{" "}
              {items.length}
            </div>

            <div style={badge}>
              Rules:{" "}
              {rules.length}
            </div>
          </div>
        </div>
      )}

      {/* WARNING */}

      {!activeComponent && (
        <div
          style={{
            ...card,
            marginTop: 20,
            textAlign: "center",
            opacity: 0.7,
          }}
        >
          No assessment
          configuration found
          for this selection.
        </div>
      )}

      {/* TABLE */}

      {/* REPORT TABLE */}

{/* REPORT TABLE */}

{activeComponent && (
  <div
    style={{
      ...card,
      marginTop: 20,
      overflowX: "auto",
      padding: 0,
    }}
  >
    {/* HEADER */}

    <div
      style={{
        padding: 18,
        borderBottom:
          "1px solid rgba(0,0,0,0.08)",
        display: "flex",
        justifyContent:
          "space-between",
        gap: 16,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <div>
        <div
          style={{
            fontWeight: 700,
            fontSize: 22,
          }}
        >
          Academic Report Sheet
        </div>

        <div
          style={{
            opacity: 0.7,
            marginTop: 4,
            fontSize: 13,
          }}
        >
          Real-time grading and
          performance analytics
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={badge}>
          Students:
          {" "}
          {rankedStudents.length}
        </div>

        <div style={badge}>
          Subject:
          {" "}
          {
            subjects.find(
              (s) =>
                s.id ===
                selectedSubject
            )?.name
          }
        </div>

        <div style={badge}>
          Period:
          {" "}
          {
            periods.find(
              (p) =>
                p.id ===
                selectedPeriod
            )?.name
          }
        </div>
      </div>
    </div>

    {/* TABLE */}

    <table
      style={{
        width: "100%",
        borderCollapse:
          "collapse",
        minWidth: 1200,
      }}
    >
      <thead>
        {/* MAIN HEADER */}

        <tr
          style={{
            background:
              "rgba(0,0,0,0.06)",
          }}
        >
          <th
            style={{
              border:
                "1px solid rgba(0,0,0,0.08)",
              padding: 14,
              minWidth: 240,
              textAlign: "left",
            }}
          >
            Student Name
          </th>

          {items.map((i) => (
            <th
              key={i.id}
              style={{
                border:
                  "1px solid rgba(0,0,0,0.08)",
                padding: 14,
                textAlign:
                  "center",
                minWidth: 120,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                }}
              >
                {i.name}
              </div>

              <div
                style={{
                  opacity: 0.7,
                  fontSize: 11,
                  marginTop: 4,
                }}
              >
                {i.weight}% Weight
              </div>
            </th>
          ))}

          <th
            style={{
              border:
                "1px solid rgba(0,0,0,0.08)",
              padding: 14,
              minWidth: 100,
            }}
          >
            Total
          </th>

          <th
            style={{
              border:
                "1px solid rgba(0,0,0,0.08)",
              padding: 14,
              minWidth: 90,
            }}
          >
            Grade
          </th>

          <th
            style={{
              border:
                "1px solid rgba(0,0,0,0.08)",
              padding: 14,
              minWidth: 180,
            }}
          >
            Remark
          </th>

          <th
            style={{
              border:
                "1px solid rgba(0,0,0,0.08)",
              padding: 14,
              minWidth: 80,
            }}
          >
            GPA
          </th>

          <th
            style={{
              border:
                "1px solid rgba(0,0,0,0.08)",
              padding: 14,
              minWidth: 90,
            }}
          >
            Position
          </th>
        </tr>
      </thead>

      <tbody>
        {rankedStudents
          .filter((r) =>
            mode ===
              "student" &&
            selectedStudent
              ? r.student.id ===
                selectedStudent
              : true
          )
          .map((r, idx) => (
            <tr
              key={r.student.id}
              style={{
                background:
                  idx % 2 === 0
                    ? "transparent"
                    : "rgba(0,0,0,0.02)",
              }}
            >
              {/* STUDENT */}

              <td
                style={{
                  border:
                    "1px solid rgba(0,0,0,0.08)",
                  padding: 14,
                  verticalAlign:
                    "top",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  {
                    r.student
                      .fullName
                  }
                </div>

                <div
                  style={{
                    opacity: 0.6,
                    fontSize: 12,
                    marginTop: 5,
                  }}
                >
                  Rank #
                  {idx + 1}
                </div>
              </td>

              {/* ITEM SCORES */}

              {r.result.breakdown.map(
                (
                  b,
                  breakdownIndex
                ) => {
                  const percent =
                    b.max > 0
                      ? (b.score /
                          b.max) *
                        100
                      : 0;

                  return (
                    <td
                      key={
                        breakdownIndex
                      }
                      style={{
                        border:
                          "1px solid rgba(0,0,0,0.08)",
                        padding: 12,
                        textAlign:
                          "center",
                        verticalAlign:
                          "top",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 17,
                        }}
                      >
                        {b.score}
                      </div>

                      <div
                        style={{
                          opacity: 0.6,
                          fontSize: 11,
                          marginTop: 3,
                        }}
                      >
                        / {b.max}
                      </div>

                      {/* VISUAL WEIGHTED BAR */}

                      <div
                        style={{
                          height: 6,
                          width: "100%",
                          background:
                            "rgba(0,0,0,0.08)",
                          borderRadius: 999,
                          marginTop: 10,
                          overflow:
                            "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(
                              percent,
                              100
                            )}%`,
                            background:
                              primary,
                            height:
                              "100%",
                            borderRadius: 999,
                          }}
                        />
                      </div>

                      <div
                        style={{
                          fontSize: 11,
                          opacity: 0.7,
                          marginTop: 5,
                        }}
                      >
                        Weighted:
                        {" "}
                        {Number(
                          b.weighted
                        ).toFixed(1)}
                      </div>
                    </td>
                  );
                }
              )}

              {/* TOTAL */}

              <td
                style={{
                  border:
                    "1px solid rgba(0,0,0,0.08)",
                  padding: 14,
                  textAlign:
                    "center",
                  fontWeight: 700,
                  fontSize: 20,
                }}
              >
                {r.result.total}%
              </td>

              {/* GRADE */}

              <td
                style={{
                  border:
                    "1px solid rgba(0,0,0,0.08)",
                  padding: 14,
                  textAlign:
                    "center",
                }}
              >
                <span
                  style={{
                    ...badge,
                    background:
                      primary,
                    color: "#fff",
                    padding:
                      "8px 12px",
                  }}
                >
                  {
                    r.result
                      .grade
                  }
                </span>
              </td>

              {/* REMARK */}

              <td
                style={{
                  border:
                    "1px solid rgba(0,0,0,0.08)",
                  padding: 14,
                  fontSize: 14,
                }}
              >
                {
                  r.result
                    .remark
                }
              </td>

              {/* GPA */}

              <td
                style={{
                  border:
                    "1px solid rgba(0,0,0,0.08)",
                  padding: 14,
                  textAlign:
                    "center",
                  fontWeight: 700,
                }}
              >
                {r.result.gpa}
              </td>

              {/* POSITION */}

              <td
                style={{
                  border:
                    "1px solid rgba(0,0,0,0.08)",
                  padding: 14,
                  textAlign:
                    "center",
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                #{idx + 1}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  </div>
)}
  </div>
);
}