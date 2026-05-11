"use client";

/**
 * AssessmentEntries.tsx
 * ---------------------------------------------------------
 * NEXT-GEN ASSESSMENT ENTRY ENGINE
 * ---------------------------------------------------------
 *
 * ARCHITECTURE
 * ---------------------------------------------------------
 * CurriculumSubject
 *        ↓
 * AcademicSubjectContext
 *        ↓
 * AssessmentStructure
 *        ↓
 * AssessmentStructureItems
 *        ↓
 * GradingSystem
 *        ↓
 * GradeRules
 *        ↓
 * AssessmentEntry
 *
 * ❌ NO AssessmentComponent
 * ❌ NO SubjectOffering
 * ❌ NO duplicated configuration logic
 *
 * ✅ Fully driven by AcademicSubjectContext
 * ✅ Curriculum-aware
 * ✅ Auto grading
 * ✅ Auto remarks
 * ✅ Auto structure resolution
 */

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
  CurriculumSubject,
  AcademicSubjectContext,
  AssessmentStructureItem,
  AssessmentEntry,
  StudentEnrollment,
  GradingSystem,
  GradeRule,
  AcademicPeriod,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

import { useSettings } from "../context/settings-context";

import { SyncStatus } from "../lib/constants/syncStatus";

// ======================================================
// TYPES
// ======================================================

type ScoreMap = Record<string, number>;

type ResultMap = Record<
  string,
  {
    total: number;
    grade?: string;
    remark?: string;
  }
>;

// ======================================================
// COMPONENT
// ======================================================

export default function AssessmentEntriesPage() {
  const { settings } = useSettings();

  const branchId = settings?.branchId || 1;

  const primary =
    settings?.primaryColor ||
    "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [sessionStarted, setSessionStarted] =
    useState(false);

  // ======================================================
  // DATA
  // ======================================================

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);

  const [curriculumSubjects, setCurriculumSubjects] =
    useState<CurriculumSubject[]>([]);

  const [contexts, setContexts] =
    useState<AcademicSubjectContext[]>([]);

  const [items, setItems] =
    useState<AssessmentStructureItem[]>([]);

  const [entries, setEntries] =
    useState<AssessmentEntry[]>([]);

  const [gradings, setGradings] =
    useState<GradingSystem[]>([]);

  const [rules, setRules] =
    useState<GradeRule[]>([]);

  const [enrollments, setEnrollments] =
    useState<StudentEnrollment[]>([]);

  // ======================================================
  // FILTERS
  // ======================================================

  const [classId, setClassId] = useState<number>(0);

  const [subjectId, setSubjectId] =
    useState<number>(0);

  const [academicPeriodId, setAcademicPeriodId] =
    useState<number>(0);

  // ======================================================
  // GRID
  // ======================================================

  const [scores, setScores] =
    useState<ScoreMap>({});

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    setLoading(true);

    try {
      const [
        st,
        cl,
        sb,
        pe,
        cs,
        ctx,
        it,
        en,
        gr,
        rl,
        enr,
      ] = await Promise.all([
        db.students.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.academicPeriods.toArray(),
        db.curriculumSubjects.toArray(),
        db.academicSubjectContexts.toArray(),
        db.assessmentStructureItems.toArray(),
        db.assessmentEntries.toArray(),
        db.gradingSystems.toArray(),
        db.gradeRules.toArray(),
        db.studentEnrollments.toArray(),
      ]);

      setStudents(
        st.filter(
          x =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setClasses(
        cl.filter(
          x =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setSubjects(
        sb.filter(
          x =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setPeriods(
        pe.filter(
          x =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setCurriculumSubjects(
        cs.filter(
          x =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setContexts(
        ctx.filter(
          x =>
            x.branchId === branchId &&
            !x.isDeleted &&
            x.active
        )
      );

      setItems(
        it.filter(
          x =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setEntries(
        en.filter(
          x =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setGradings(
        gr.filter(
          x =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setRules(
        rl.filter(
          x =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setEnrollments(
        enr.filter(
          x =>
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
  // CURRICULUM SUBJECTS
  // ======================================================

  const filteredCurriculumSubjects =
    useMemo(() => {
      return curriculumSubjects.filter(
        cs =>
          Number(cs.classId) === Number(classId) &&
          Number(cs.academicPeriodId) ===
            Number(academicPeriodId) &&
          cs.active
      );
    }, [
      curriculumSubjects,
      classId,
      academicPeriodId,
    ]);

  // ======================================================
  // CONTEXT
  // ======================================================

  const context = useMemo(() => {
    return contexts.find(
      x =>
        Number(x.classId) === Number(classId) &&
        Number(x.subjectId) === Number(subjectId) &&
        Number(x.academicPeriodId) ===
          Number(academicPeriodId)
    );
  }, [
    contexts,
    classId,
    subjectId,
    academicPeriodId,
  ]);

  // ======================================================
  // STRUCTURE
  // ======================================================

  const assessmentStructureId =
    context?.assessmentStructureId;

  const gradingSystemId =
    context?.gradingSystemId;

  const structureItems = useMemo(() => {
    if (!assessmentStructureId) return [];

    return items
      .filter(
        x =>
          Number(x.assessmentStructureId) ===
            Number(assessmentStructureId) &&
          x.active
      )
      .sort((a, b) => a.order - b.order);
  }, [items, assessmentStructureId]);

  // ======================================================
  // GRADING
  // ======================================================

  const gradingSystem = useMemo(() => {
    return gradings.find(
      x => x.id === gradingSystemId
    );
  }, [gradings, gradingSystemId]);

  const gradeRules = useMemo(() => {
    if (!gradingSystemId) return [];

    return rules
      .filter(
        x =>
          Number(x.gradingSystemId) ===
          Number(gradingSystemId)
      )
      .sort((a, b) => b.minScore - a.minScore);
  }, [rules, gradingSystemId]);

  // ======================================================
  // STUDENTS
  // ======================================================

  const filteredStudents = useMemo(() => {
    if (!classId) return [];

    return students.filter(student => {
      const enrollment = enrollments.find(
        e =>
          Number(e.studentId) ===
            Number(student.id) &&
          Number(e.classId) ===
            Number(classId) &&
          Number(e.academicPeriodId) ===
            Number(academicPeriodId) &&
          e.status === "active"
      );

      return !!enrollment;
    });
  }, [
    students,
    enrollments,
    classId,
    academicPeriodId,
  ]);

  // ======================================================
  // RESULTS
  // ======================================================

  const computedResults =
    useMemo<ResultMap>(() => {
      const result: ResultMap = {};

      for (const student of filteredStudents) {
        let total = 0;

        for (const item of structureItems) {
          const key = `${student.id}-${item.id}`;

          total += Number(scores[key] || 0);
        }

        const matchedRule = gradeRules.find(
          r =>
            total >= r.minScore &&
            total <= r.maxScore
        );

        result[String(student.id)] = {
          total,
          grade: matchedRule?.grade,
          remark: matchedRule?.remark,
        };
      }

      return result;
    }, [
      filteredStudents,
      structureItems,
      scores,
      gradeRules,
    ]);

  // ======================================================
  // UPDATE SCORE
  // ======================================================

  const updateScore = (
    studentId: number,
    item: AssessmentStructureItem,
    value: string
  ) => {
    const num = Number(value);

    setScores(prev => ({
      ...prev,
      [`${studentId}-${item.id}`]:
        num > item.maxScore
          ? item.maxScore
          : num < 0
          ? 0
          : num,
    }));
  };

  // ======================================================
  // SESSION
  // ======================================================

  const startSession = () => {
    if (
      !classId ||
      !subjectId ||
      !academicPeriodId
    ) {
      alert(
        "Select class, subject and period"
      );
      return;
    }

    if (!context) {
      alert(
        "No Academic Subject Context configured"
      );
      return;
    }

    if (!assessmentStructureId) {
      alert("No assessment structure");
      return;
    }

    setSessionStarted(true);
  };

  // ======================================================
  // SAVE
  // ======================================================

  const saveAll = async () => {
    if (!context) {
      alert("No academic context");
      return;
    }

    setSaving(true);

    try {
      const now = Date.now();

      for (const student of filteredStudents) {
        const result =
          computedResults[String(student.id)];

        for (const item of structureItems) {
          const key = `${student.id}-${item.id}`;

          const score = scores[key];

          if (score == null) continue;

          const payload: AssessmentEntry =
            prepareSyncData({
              branchId,

              organizationId:
                context.organizationId,

              academicStructureId:
                undefined,

              academicPeriodId,

              gradingSystemId,

              assessmentStructureId,

              assessmentStructureItemId:
                item.id!,

              studentId: student.id!,

              classId,

              subjectId,

              score,

              grade: result?.grade,

              remark: result?.remark,

              published: false,

              locked: false,

              active: true,

              updatedAt: now,
              createdAt: now,

              version: 1,

              deviceId: "local-device",

              synced: SyncStatus.PENDING,

              isDeleted: false,
            });

          const existing =
            await db.assessmentEntries
              .where({
                studentId:
                  payload.studentId,

                classId:
                  payload.classId,

                subjectId:
                  payload.subjectId,

                academicPeriodId:
                  payload.academicPeriodId,

                assessmentStructureItemId:
                  payload.assessmentStructureItemId,
              })
              .first();

          if (existing?.id) {
            await db.assessmentEntries.update(
              existing.id,
              {
                score: payload.score,
                grade: payload.grade,
                remark: payload.remark,
                updatedAt: now,
                synced:
                  SyncStatus.PENDING,
              }
            );
          } else {
            await db.assessmentEntries.add(
              payload
            );
          }
        }
      }

      await load();

      alert("Saved successfully");
    } catch (err) {
      console.error(err);
      alert("Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // ANALYTICS
  // ======================================================

  const totalStudents =
    filteredStudents.length;

  const totalItems =
    structureItems.length;

  const totalWeight =
    structureItems.reduce(
      (sum, item) =>
        sum + Number(item.weight || 0),
      0
    );

  // ======================================================
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border:
      "1px solid rgba(0,0,0,0.08)",
    borderRadius: 20,
    padding: 18,
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border:
      "1px solid rgba(0,0,0,0.12)",
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

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        Loading...
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
      {/* HEADER */}

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
        }}
      >
        <h2>
          Assessment Entries
        </h2>

        <button
          style={button}
          onClick={startSession}
        >
          {sessionStarted
            ? "Session Active"
            : "Start Session"}
        </button>
      </div>

      {/* FILTERS */}

      <div
        style={{
          ...card,
          marginTop: 20,
          display: "grid",
          gap: 12,
        }}
      >
        <select
          style={input}
          value={classId}
          onChange={e => {
            setClassId(
              Number(e.target.value)
            );

            setSubjectId(0);
          }}
        >
          <option value={0}>
            Select Class
          </option>

          {classes.map(c => (
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
          value={academicPeriodId}
          onChange={e =>
            setAcademicPeriodId(
              Number(e.target.value)
            )
          }
        >
          <option value={0}>
            Select Academic Period
          </option>

          {periods.map(p => (
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
          value={subjectId}
          onChange={e =>
            setSubjectId(
              Number(e.target.value)
            )
          }
        >
          <option value={0}>
            Select Subject
          </option>

          {filteredCurriculumSubjects.map(
            cs => {
              const subject =
                subjects.find(
                  s =>
                    s.id ===
                    cs.subjectId
                );

              return (
                <option
                  key={cs.id}
                  value={cs.subjectId}
                >
                  {subject?.name}
                </option>
              );
            }
          )}
        </select>
      </div>

      {/* CONTEXT */}

      {context && (
        <div
          style={{
            ...card,
            marginTop: 20,
          }}
        >
          <div>
            <b>
              Assessment Structure:
            </b>{" "}
            {
              structureItems[0]
                ?.assessmentStructureId
            }
          </div>

          <div
            style={{
              marginTop: 8,
            }}
          >
            <b>
              Grading System:
            </b>{" "}
            {gradingSystem?.name}
          </div>

          <div
            style={{
              marginTop: 8,
            }}
          >
            <b>Total Items:</b>{" "}
            {totalItems}
          </div>

          <div
            style={{
              marginTop: 8,
            }}
          >
            <b>Total Weight:</b>{" "}
            {totalWeight}%
          </div>
        </div>
      )}

      {/* ANALYTICS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(200px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          Students: {totalStudents}
        </div>

        <div style={card}>
          Items: {totalItems}
        </div>

        <div style={card}>
          Weight: {totalWeight}%
        </div>

        <div style={card}>
          Grade Rules:{" "}
          {gradeRules.length}
        </div>
      </div>

      {/* TABLE */}

      {sessionStarted && context && (
        <div
          style={{
            ...card,
            marginTop: 20,
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              minWidth: 1200,
            }}
          >
            <thead>
              <tr>
                <th>Student</th>

                {structureItems.map(
                  item => (
                    <th key={item.id}>
                      {item.name}

                      <div
                        style={{
                          fontSize: 10,
                          opacity: 0.6,
                        }}
                      >
                        Max:{" "}
                        {
                          item.maxScore
                        }
                      </div>
                    </th>
                  )
                )}

                <th>Total</th>
                <th>Grade</th>
                <th>Remark</th>
              </tr>
            </thead>

            <tbody>
              {filteredStudents.map(
                student => {
                  const result =
                    computedResults[
                      String(
                        student.id
                      )
                    ];

                  return (
                    <tr
                      key={
                        student.id
                      }
                    >
                      <td
                        style={{
                          fontWeight: 700,
                        }}
                      >
                        {
                          student.fullName
                        }
                      </td>

                      {structureItems.map(
                        item => {
                          const key = `${student.id}-${item.id}`;

                          return (
                            <td
                              key={
                                key
                              }
                            >
                              <input
                                type="number"
                                style={
                                  input
                                }
                                placeholder={`/${item.maxScore}`}
                                value={
                                  scores[
                                    key
                                  ] ??
                                  ""
                                }
                                onChange={e =>
                                  updateScore(
                                    student.id!,
                                    item,
                                    e
                                      .target
                                      .value
                                  )
                                }
                              />
                            </td>
                          );
                        }
                      )}

                      <td>
                        {
                          result?.total
                        }
                      </td>

                      <td>
                        {
                          result?.grade
                        }
                      </td>

                      <td>
                        {
                          result?.remark
                        }
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>

          <div
            style={{
              display: "flex",
              justifyContent:
                "flex-end",
              marginTop: 20,
            }}
          >
            <button
              style={button}
              disabled={saving}
              onClick={saveAll}
            >
              {saving
                ? "Saving..."
                : "Save All"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}