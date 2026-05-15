//promotion.tsx

/*
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
  AcademicPeriod,
  StudentEnrollment,
  AssessmentComponent,
  AssessmentEntry,
  ComputedResult,
  GradingSystem,
  Organization,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

import { useSettings } from "../context/settings-context";

// ======================================================
// TYPES
// ======================================================

type Decision =
  | "promote"
  | "repeat"
  | "graduate";

interface PromotionRow {
  student: Student;

  enrollment: StudentEnrollment;

  currentClass?: Class;

  currentPeriod?: AcademicPeriod;

  currentOrganization?: Organization;

  gradingSystem?: GradingSystem;

  average: number;

  grade?: string;

  remark?: string;

  autoDecision: Decision;

  suggestedNextPeriod?: AcademicPeriod;

  suggestedNextClass?: Class;

  hasNextPeriod: boolean;

  hasNextClass: boolean;

  completedEntries: number;

  totalEntries: number;
}

// ======================================================
// CONSTANTS
// ======================================================

const PASS_MARK = 50;

// ======================================================
// COMPONENT
// ======================================================

export default function PromotionsPage() {
  // ======================================================
  // SETTINGS
  // ======================================================

  const { settings } = useSettings();

  const primary =
    settings?.primaryColor ||
    "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] =
    useState(true);

  const [processing, setProcessing] =
    useState(false);

  const [students, setStudents] =
    useState<Student[]>([]);

  const [classes, setClasses] =
    useState<Class[]>([]);

  const [periods, setPeriods] =
    useState<AcademicPeriod[]>([]);

  const [organizations, setOrganizations] =
    useState<Organization[]>([]);

  const [enrollments, setEnrollments] =
    useState<StudentEnrollment[]>([]);

  const [components, setComponents] =
    useState<AssessmentComponent[]>(
      []
    );

  const [entries, setEntries] =
    useState<AssessmentEntry[]>([]);

  const [results, setResults] =
    useState<ComputedResult[]>([]);

  const [
    gradingSystems,
    setGradingSystems,
  ] = useState<GradingSystem[]>(
    []
  );



  // ======================================================
  // FILTERS
  // ======================================================

  const [
    selectedPeriodId,
    setSelectedPeriodId,
  ] = useState<number>(0);

  const [
    selectedClassId,
    setSelectedClassId,
  ] = useState<number>(0);

  const [
    selectedOrganizationId,
    setSelectedOrganizationId,
  ] = useState<number>(0);

  const [
    selectedStudentId,
    setSelectedStudentId,
  ] = useState<number>(0);

  const [search, setSearch] =
    useState("");

  // ======================================================
  // OVERRIDES
  // ======================================================

  const [
    decisionOverrides,
    setDecisionOverrides,
  ] = useState<
    Record<number, Decision>
  >({});

  const [
    periodOverrides,
    setPeriodOverrides,
  ] = useState<
    Record<number, number>
  >({});

  const [
    classOverrides,
    setClassOverrides,
  ] = useState<
    Record<number, number>
  >({});

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
    padding: "12px 18px",
    borderRadius: 12,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  const outlineButton: React.CSSProperties =
    {
      padding: "12px 18px",
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
    background:
      "rgba(0,0,0,0.06)",
    fontSize: 12,
    fontWeight: 700,
  };

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    setLoading(true);

    try {
      const [
        studentData,
        classData,
        periodData,
        organizationData,
        enrollmentData,
        componentData,
        entryData,
        resultData,
        gradingData,
        ruleData,
        subjectData,
      ] = await Promise.all([
        db.students.toArray(),

        db.classes.toArray(),

        db.academicPeriods.toArray(),

        db.organizations.toArray(),

        db.studentEnrollments.toArray(),

        db.assessmentComponents.toArray(),

        db.assessmentEntries.toArray(),

        db.computedResults.toArray(),

        db.gradingSystems.toArray(),

        db.gradeRules.toArray(),

        db.subjects.toArray(),
      ]);

      setStudents(
        studentData.filter(
          (x) => !x.isDeleted
        )
      );

      setClasses(
        classData.filter(
          (x) => !x.isDeleted
        )
      );

      setPeriods(
        periodData.filter(
          (x) => !x.isDeleted
        )
      );

      setOrganizations(
        organizationData.filter(
          (x) => !x.isDeleted
        )
      );

      setEnrollments(
        enrollmentData.filter(
          (x) => !x.isDeleted
        )
      );

      setComponents(
        componentData.filter(
          (x) =>
            !x.isDeleted &&
            x.active
        )
      );

      setEntries(
        entryData.filter(
          (x) => !x.isDeleted
        )
      );

      setResults(
        resultData.filter(
          (x) => !x.isDeleted
        )
      );

      setGradingSystems(
        gradingData.filter(
          (x) => !x.isDeleted
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
  }, []);

  // ======================================================
  // HELPERS
  // ======================================================

  const getClass = (id?: number) =>
    classes.find((x) => x.id === id);

  const getPeriod = (id?: number) =>
    periods.find((x) => x.id === id);

  const getOrganization = (
    id?: number
  ) =>
    organizations.find(
      (x) => x.id === id
    );

  // ======================================================
  // ACTIVE ENROLLMENTS
  // ======================================================

  const activeEnrollments =
    useMemo(() => {
      return enrollments.filter(
        (x) => x.status === "active"
      );
    }, [enrollments]);

  // ======================================================
  // CASCADING FILTERS
  // ======================================================

  const filteredClasses = useMemo(() => {
    return classes
      .filter((cls) => {
        if (
          selectedOrganizationId === 0
        )
          return true;

        return students.some(
          (student) =>
            student.organizationId ===
              selectedOrganizationId &&
            student.currentClassId ===
              cls.id
        );
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );
  }, [
    classes,
    students,
    selectedOrganizationId,
  ]);

  const filteredStudents =
    useMemo(() => {
      return students
        .filter((student) => {
          const matchesOrganization =
            selectedOrganizationId ===
              0 ||
            student.organizationId ===
              selectedOrganizationId;

          const matchesClass =
            selectedClassId === 0 ||
            student.currentClassId ===
              selectedClassId;

          return (
            matchesOrganization &&
            matchesClass
          );
        })
        .sort((a, b) =>
          a.fullName.localeCompare(
            b.fullName
          )
        );
    }, [
      students,
      selectedOrganizationId,
      selectedClassId,
    ]);

  useEffect(() => {
    setSelectedClassId(0);

    setSelectedStudentId(0);
  }, [selectedOrganizationId]);

  useEffect(() => {
    setSelectedStudentId(0);
  }, [selectedClassId]);

  // ======================================================
  // ROWS
  // ======================================================

  const rows: PromotionRow[] =
    useMemo(() => {
      return activeEnrollments
        .map((enrollment) => {
          const student =
            students.find(
              (x) =>
                x.id ===
                enrollment.studentId
            );

          if (!student) return null;

          const currentClass =
            getClass(
              enrollment.classId
            );

          const currentPeriod =
            getPeriod(
              enrollment.academicPeriodId
            );

          const currentOrganization =
            getOrganization(
              student.organizationId
            );

          const sameStructurePeriods =
            periods
              .filter(
                (x) =>
                  x.academicStructureId ===
                  enrollment.academicStructureId
              )
              .sort(
                (a, b) =>
                  a.order - b.order
              );

          const nextPeriod =
            sameStructurePeriods.find(
              (x) =>
                x.order ===
                (currentPeriod?.order ||
                  0) +
                  1
            );

          const sameStructureClasses =
            classes
              .filter(
                (x) =>
                  x.academicStructureId ===
                  enrollment.academicStructureId
              )
              .sort((a, b) =>
                (
                  a.name || ""
                ).localeCompare(
                  b.name || ""
                )
              );

          const currentIndex =
            sameStructureClasses.findIndex(
              (x) =>
                x.id ===
                enrollment.classId
            );

          const nextClass =
            currentIndex >= 0
              ? sameStructureClasses[
                  currentIndex + 1
                ]
              : undefined;

          const studentResults =
            results.filter(
              (x) =>
                x.studentId ===
                  student.id &&
                x.classId ===
                  enrollment.classId &&
                x.academicPeriodId ===
                  enrollment.academicPeriodId
            );

          const average =
            studentResults.length > 0
              ? studentResults.reduce(
                  (sum, x) =>
                    sum +
                    (x.average ||
                      x.total ||
                      0),
                  0
                ) /
                studentResults.length
              : 0;

          const classComponents =
            components.filter(
              (x) =>
                x.classId ===
                  enrollment.classId &&
                x.academicPeriodId ===
                  enrollment.academicPeriodId
            );

          const gradingSystem =
            gradingSystems.find(
              (g) =>
                g.id ===
                classComponents[0]
                  ?.gradingSystemId
            );

          const relevantEntries =
            entries.filter(
              (x) =>
                x.studentId ===
                  student.id &&
                x.classId ===
                  enrollment.classId &&
                x.academicPeriodId ===
                  enrollment.academicPeriodId
            );

          const completedEntries =
            relevantEntries.length;

          const totalEntries =
            classComponents.length;

          let autoDecision: Decision =
            "repeat";

          if (
            average >= PASS_MARK &&
            nextPeriod
          ) {
            autoDecision =
              "promote";
          } else if (
            average >= PASS_MARK &&
            !nextPeriod &&
            nextClass
          ) {
            autoDecision =
              "promote";
          } else if (
            average >= PASS_MARK &&
            !nextPeriod &&
            !nextClass
          ) {
            autoDecision =
              "graduate";
          }

          return {
            student,

            enrollment,

            currentClass,

            currentPeriod,

            currentOrganization,

            gradingSystem,

            average,

            autoDecision,

            suggestedNextPeriod:
              nextPeriod,

            suggestedNextClass:
              nextClass,

            hasNextPeriod:
              !!nextPeriod,

            hasNextClass:
              !!nextClass,

            completedEntries,

            totalEntries,
          };
        })
        .filter(Boolean) as PromotionRow[];
    }, [
      activeEnrollments,
      students,
      classes,
      periods,
      organizations,
      results,
      components,
      gradingSystems,
      entries,
    ]);

  // ======================================================
  // FILTERED ROWS
  // ======================================================

  const filteredRows =
    useMemo(() => {
      return rows.filter((row) => {
        const matchesPeriod =
          selectedPeriodId === 0 ||
          row.enrollment
            .academicPeriodId ===
            selectedPeriodId;

        const matchesClass =
          selectedClassId === 0 ||
          row.enrollment.classId ===
            selectedClassId;

        const matchesOrganization =
          selectedOrganizationId ===
            0 ||
          row.student
            .organizationId ===
            selectedOrganizationId;

        const matchesStudent =
          selectedStudentId === 0 ||
          row.student.id ===
            selectedStudentId;

        const matchesSearch =
          !search.trim() ||
          row.student.fullName
            .toLowerCase()
            .includes(
              search.toLowerCase()
            ) ||
          row.currentClass?.name
            ?.toLowerCase()
            .includes(
              search.toLowerCase()
            ) ||
          row.currentOrganization?.name
            ?.toLowerCase()
            .includes(
              search.toLowerCase()
            );

        return (
          matchesPeriod &&
          matchesClass &&
          matchesOrganization &&
          matchesStudent &&
          matchesSearch
        );
      });
    }, [
      rows,
      selectedPeriodId,
      selectedClassId,
      selectedOrganizationId,
      selectedStudentId,
      search,
    ]);

  // ======================================================
  // DECISION HELPERS
  // ======================================================

  const getFinalDecision = (
    studentId?: number,
    auto?: Decision
  ): Decision => {
    if (!studentId)
      return auto || "repeat";

    return (
      decisionOverrides[studentId] ||
      auto ||
      "repeat"
    );
  };

  // ======================================================
  // PROCESS PROMOTION
  // ======================================================

  const runPromotion =
    async () => {
      try {
        setProcessing(true);

        for (const row of filteredRows) {
          if (!row.student.id)
            continue;

          const finalDecision =
            getFinalDecision(
              row.student.id,
              row.autoDecision
            );

          await db.studentEnrollments.update(
            row.enrollment.id!,
            {
              status:
                finalDecision ===
                "repeat"
                  ? "active"
                  : "completed",

              endDate:
                new Date().toISOString(),
            }
          );

          if (
            finalDecision ===
            "graduate"
          ) {
            await db.students.update(
              row.student.id,
              {
                status:
                  "graduated",
              }
            );

            continue;
          }

          if (
            finalDecision ===
            "repeat"
          ) {
            continue;
          }

          const targetPeriodId =
            periodOverrides[
              row.student.id
            ] ||
            row.suggestedNextPeriod
              ?.id ||
            row.enrollment
              .academicPeriodId;

          const targetClassId =
            classOverrides[
              row.student.id
            ] ||
            row.suggestedNextClass
              ?.id ||
            row.enrollment.classId;

          const targetClass =
            getClass(
              targetClassId
            );

          await db.studentEnrollments.add(
            prepareSyncData({
              branchId:
                row.enrollment
                  .branchId,

              studentId:
                row.student.id,

              classId:
                targetClassId,

              academicStructureId:
                targetClass?.academicStructureId ||
                row.enrollment
                  .academicStructureId,

              academicPeriodId:
                targetPeriodId,

              startDate:
                new Date().toISOString(),

              status: "active",
            })
          );

          await db.students.update(
            row.student.id,
            {
              currentClassId:
                targetClassId,
            }
          );
        }

        alert(
          "Promotion process completed successfully."
        );

        setDecisionOverrides({});

        setClassOverrides({});

        setPeriodOverrides({});

        load();
      } catch (err) {
        console.error(err);

        alert(
          "Failed to process promotions."
        );
      } finally {
        setProcessing(false);
      }
    };

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        Loading promotion engine...
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
      <div style={card}>
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
              }}
            >
              Promotion Engine
            </h2>

            <div
              style={{
                opacity: 0.7,
                marginTop: 4,
                fontSize: 13,
              }}
            >
              Dynamic promotion
              engine powered by
              enrollments,
              academic periods,
              assessments,
              organizations and
              intelligent student
              progression logic.
            </div>
          </div>

          <div style={badge}>
            Students:{" "}
            {filteredRows.length}
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(220px,1fr))",
            gap: 12,
          }}
        >
          <input
            style={input}
            placeholder="Search student, class or organization..."
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
          />

          <select
            style={input}
            value={
              selectedStudentId
            }
            onChange={(e) =>
              setSelectedStudentId(
                Number(
                  e.target.value
                )
              )
            }
          >
            <option value={0}>
              All Students
            </option>

            {filteredStudents.map(
              (student) => (
                <option
                  key={student.id}
                  value={student.id}
                >
                  {student.fullName}
                </option>
              )
            )}
          </select>

          <select
            style={input}
            value={
              selectedOrganizationId
            }
            onChange={(e) =>
              setSelectedOrganizationId(
                Number(
                  e.target.value
                )
              )
            }
          >
            <option value={0}>
              All Organizations
            </option>

            {organizations.map(
              (org) => (
                <option
                  key={org.id}
                  value={org.id}
                >
                  {org.name}
                </option>
              )
            )}
          </select>

          <select
            style={input}
            value={
              selectedPeriodId
            }
            onChange={(e) =>
              setSelectedPeriodId(
                Number(
                  e.target.value
                )
              )
            }
          >
            <option value={0}>
              All Periods
            </option>

            {periods
              .sort(
                (a, b) =>
                  a.order - b.order
              )
              .map((p) => (
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
              selectedClassId
            }
            onChange={(e) =>
              setSelectedClassId(
                Number(
                  e.target.value
                )
              )
            }
          >
            <option value={0}>
              All Classes
            </option>

            {filteredClasses.map(
              (c) => (
                <option
                  key={c.id}
                  value={c.id}
                >
                  {c.name}
                </option>
              )
            )}
          </select>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <button
            style={button}
            disabled={processing}
            onClick={
              runPromotion
            }
          >
            {processing
              ? "Processing..."
              : "Run Promotion"}
          </button>

          <button
            style={
              outlineButton
            }
            onClick={load}
          >
            Refresh
          </button>
        </div>

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
              borderCollapse:
                "collapse",
              minWidth: 900,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderBottom:
                      "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  Student
                </th>

                <th
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderBottom:
                      "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  Current Period
                </th>

                <th
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderBottom:
                      "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  Current Class
                </th>

                <th
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderBottom:
                      "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  Decision
                </th>

                <th
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderBottom:
                      "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  Next Period
                </th>

                <th
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderBottom:
                      "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  Next Class
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map(
                (row) => {
                  const finalDecision =
                    getFinalDecision(
                      row.student.id,
                      row.autoDecision
                    );

                  return (
                    <tr
                      key={
                        row.student.id
                      }
                    >
                      <td
                        style={{
                          padding: 12,
                          borderBottom:
                            "1px solid rgba(0,0,0,0.06)",
                        }}
                      >
                        {
                          row.student
                            .fullName
                        }
                      </td>

                      <td
                        style={{
                          padding: 12,
                          borderBottom:
                            "1px solid rgba(0,0,0,0.06)",
                        }}
                      >
                        {
                          row
                            .currentPeriod
                            ?.name
                        }
                      </td>

                      <td
                        style={{
                          padding: 12,
                          borderBottom:
                            "1px solid rgba(0,0,0,0.06)",
                        }}
                      >
                        {
                          row
                            .currentClass
                            ?.name
                        }
                      </td>

                      <td
                        style={{
                          padding: 12,
                          borderBottom:
                            "1px solid rgba(0,0,0,0.06)",
                        }}
                      >
                        <select
                          style={
                            input
                          }
                          value={
                            finalDecision
                          }
                          onChange={(
                            e
                          ) =>
                            setDecisionOverrides(
                              (
                                prev
                              ) => ({
                                ...prev,
                                [
                                  row
                                    .student
                                    .id!
                                ]:
                                  e
                                    .target
                                    .value as Decision,
                              })
                            )
                          }
                        >
                          <option value="promote">
                            Promote
                          </option>

                          <option value="repeat">
                            Repeat
                          </option>

                          <option value="graduate">
                            Graduate
                          </option>
                        </select>
                      </td>

                      <td
                        style={{
                          padding: 12,
                          borderBottom:
                            "1px solid rgba(0,0,0,0.06)",
                        }}
                      >
                        <select
                          style={
                            input
                          }
                          value={
                            periodOverrides[
                              row
                                .student
                                .id!
                            ] ||
                            row
                              .suggestedNextPeriod
                              ?.id ||
                            row
                              .enrollment
                              .academicPeriodId
                          }
                          onChange={(
                            e
                          ) =>
                            setPeriodOverrides(
                              (
                                prev
                              ) => ({
                                ...prev,
                                [
                                  row
                                    .student
                                    .id!
                                ]:
                                  Number(
                                    e
                                      .target
                                      .value
                                  ),
                              })
                            )
                          }
                        >
                          {periods
                            .sort(
                              (
                                a,
                                b
                              ) =>
                                a.order -
                                b.order
                            )
                            .map(
                              (
                                period
                              ) => (
                                <option
                                  key={
                                    period.id
                                  }
                                  value={
                                    period.id
                                  }
                                >
                                  {
                                    period.name
                                  }
                                </option>
                              )
                            )}
                        </select>
                      </td>

                      <td
                        style={{
                          padding: 12,
                          borderBottom:
                            "1px solid rgba(0,0,0,0.06)",
                        }}
                      >
                        <select
                          style={
                            input
                          }
                          value={
                            classOverrides[
                              row
                                .student
                                .id!
                            ] ||
                            row
                              .suggestedNextClass
                              ?.id ||
                            row
                              .enrollment
                              .classId
                          }
                          onChange={(
                            e
                          ) =>
                            setClassOverrides(
                              (
                                prev
                              ) => ({
                                ...prev,
                                [
                                  row
                                    .student
                                    .id!
                                ]:
                                  Number(
                                    e
                                      .target
                                      .value
                                  ),
                              })
                            )
                          }
                        >
                          {classes
                            .sort(
                              (
                                a,
                                b
                              ) =>
                                a.name.localeCompare(
                                  b.name
                                )
                            )
                            .map(
                              (
                                cls
                              ) => (
                                <option
                                  key={
                                    cls.id
                                  }
                                  value={
                                    cls.id
                                  }
                                >
                                  {
                                    cls.name
                                  }
                                </option>
                              )
                            )}
                        </select>
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
*/


export default function PromotionOld(){
  <div>Promotion New</div>
}