/*"use client";

import { useEffect, useMemo, useState } from "react";
import { db, } from "../lib/db";
import type {
  Assessment,
  AssessmentComponent,
  AcademicPeriod,
  AcademicStructure,
  Class,
  Organization,
  Score,
  Student,
  Subject,
  Teacher,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

export default function Assessments() {
  const { settings } = useSettings();

  // ======================================================
  // CONTEXT
  // ======================================================

  const branchId = settings?.branchId ?? 1;
  const organizationId = settings?.organizationId;

  const currentAcademicStructureId =
    settings?.currentAcademicStructureId;

  const currentAcademicPeriodId =
    settings?.currentAcademicPeriodId;

  const primary =
    settings?.primaryColor ||
    "var(--primary-color)";

  // ======================================================
  // DATA
  // ======================================================

  const [loading, setLoading] = useState(true);

  const [assessments, setAssessments] = useState<
    Assessment[]
  >([]);

  const [students, setStudents] = useState<Student[]>(
    []
  );

  const [subjects, setSubjects] = useState<Subject[]>(
    []
  );

  const [classes, setClasses] = useState<Class[]>([]);

  const [teachers, setTeachers] = useState<Teacher[]>(
    []
  );

  const [organizations, setOrganizations] =
    useState<Organization[]>([]);

  const [academicStructures, setAcademicStructures] =
    useState<AcademicStructure[]>([]);

  const [academicPeriods, setAcademicPeriods] =
    useState<AcademicPeriod[]>([]);

  const [components, setComponents] = useState<
    AssessmentComponent[]
  >([]);

  const [scores, setScores] = useState<Score[]>([]);

  // ======================================================
  // UI
  // ======================================================

  const [showForm, setShowForm] = useState(false);

  const [editingId, setEditingId] = useState<
    number | null
  >(null);

  // ======================================================
  // FILTERS
  // ======================================================

  const [search, setSearch] = useState("");

  const [classFilter, setClassFilter] = useState("");

  const [subjectFilter, setSubjectFilter] =
    useState("");

  const [studentFilter, setStudentFilter] =
    useState("");

  const [periodFilter, setPeriodFilter] =
    useState(
      currentAcademicPeriodId
        ? String(currentAcademicPeriodId)
        : ""
    );

  const [structureFilter, setStructureFilter] =
    useState(
      currentAcademicStructureId
        ? String(currentAcademicStructureId)
        : ""
    );

  const [componentFilter, setComponentFilter] =
    useState("");

  // ======================================================
  // FORM
  // ======================================================

  const [studentId, setStudentId] = useState("");

  const [classId, setClassId] = useState("");

  const [subjectId, setSubjectId] = useState("");

  const [componentId, setComponentId] =
    useState("");

  const [academicStructureId, setAcademicStructureId] =
    useState(
      currentAcademicStructureId
        ? String(currentAcademicStructureId)
        : ""
    );

  const [academicPeriodId, setAcademicPeriodId] =
    useState(
      currentAcademicPeriodId
        ? String(currentAcademicPeriodId)
        : ""
    );

  const [score, setScore] = useState("");

  const [maxScore, setMaxScore] = useState("100");

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    setLoading(true);

    try {
      const [
        ass,
        st,
        su,
        cl,
        te,
        orgs,
        str,
        per,
        comps,
        scr,
      ] = await Promise.all([
        db.assessments.toArray(),
        db.students.toArray(),
        db.subjects.toArray(),
        db.classes.toArray(),
        db.teachers.toArray(),
        db.organizations.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.assessmentComponents.toArray(),
        db.scores.toArray(),
      ]);

      const filteredAssessments = ass.filter(
        (x: any) => {
          const branchMatch =
            x.branchId === branchId;

          const orgMatch = organizationId
            ? classes.find(
                (c) =>
                  c.id === x.classId &&
                  c.organizationId ===
                    organizationId
              )
            : true;

          return (
            branchMatch &&
            orgMatch &&
            !x.isDeleted
          );
        }
      );

      filteredAssessments.sort(
        (a, b) =>
          (b.updatedAt || 0) -
          (a.updatedAt || 0)
      );

      setAssessments(filteredAssessments);

      setStudents(
        st.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setSubjects(
        su.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setClasses(
        cl.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setTeachers(
        te.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setOrganizations(
        orgs.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setAcademicStructures(
        str.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setAcademicPeriods(
        per.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setComponents(
        comps.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setScores(
        scr.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );
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

  const getStudent = (id?: number) =>
    students.find((x) => x.id === id);

  const getSubject = (id?: number) =>
    subjects.find((x) => x.id === id);

  const getClass = (id?: number) =>
    classes.find((x) => x.id === id);

  const getTeacher = (id?: number) =>
    teachers.find((x) => x.id === id);

  const getComponent = (id?: number) =>
    components.find((x) => x.id === id);

  const getPeriod = (id?: number) =>
    academicPeriods.find((x) => x.id === id);

  const getStructure = (id?: number) =>
    academicStructures.find((x) => x.id === id);

  const getOrganization = (id?: number) =>
    organizations.find((x) => x.id === id);

  // ======================================================
  // RESET
  // ======================================================

  const reset = () => {
    setStudentId("");
    setClassId("");
    setSubjectId("");
    setComponentId("");

    setScore("");
    setMaxScore("100");

    setEditingId(null);

    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================

  const save = async () => {
    if (
      !studentId ||
      !classId ||
      !subjectId ||
      !componentId
    ) {
      alert("Please complete required fields");
      return;
    }

    if (!score || !maxScore) {
      alert("Score and max score required");
      return;
    }

    const payload = prepareSyncData({
      branchId,

      studentId: Number(studentId),

      classId: Number(classId),

      subjectId: Number(subjectId),

      academicStructureId:
        Number(academicStructureId),

      academicPeriodId:
        Number(academicPeriodId),

      componentId: Number(componentId),

      score: Number(score),

      maxScore: Number(maxScore),
    });

    if (editingId) {
      await db.assessments.update(
        editingId,
        payload
      );
    } else {
      await db.assessments.add(payload);
    }

    reset();

    load();
  };

  // ======================================================
  // EDIT
  // ======================================================

  const editAssessment = (item: Assessment) => {
    setEditingId(item.id || null);

    setStudentId(String(item.studentId));

    setClassId(String(item.classId));

    setSubjectId(String(item.subjectId));

    setComponentId(String(item.componentId));

    setAcademicStructureId(
      String(item.academicStructureId)
    );

    setAcademicPeriodId(
      String(item.academicPeriodId)
    );

    setScore(String(item.score));

    setMaxScore(String(item.maxScore));

    setShowForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================

  const removeAssessment = async (
    id: number
  ) => {
    if (!confirm("Delete assessment?"))
      return;

    await db.assessments.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    load();
  };

  // ======================================================
  // FILTERED
  // ======================================================

  const filtered = useMemo(() => {
    return assessments.filter((i) => {
      const student = getStudent(i.studentId);

      const subject = getSubject(i.subjectId);

      const cls = getClass(i.classId);

      const component = getComponent(
        i.componentId
      );

      const q = search.toLowerCase();

      const matchSearch =
        student?.fullName
          ?.toLowerCase()
          .includes(q) ||
        subject?.name
          ?.toLowerCase()
          .includes(q) ||
        cls?.name
          ?.toLowerCase()
          .includes(q) ||
        component?.name
          ?.toLowerCase()
          .includes(q);

      const matchClass = classFilter
        ? i.classId === Number(classFilter)
        : true;

      const matchSubject = subjectFilter
        ? i.subjectId ===
          Number(subjectFilter)
        : true;

      const matchStudent = studentFilter
        ? i.studentId ===
          Number(studentFilter)
        : true;

      const matchPeriod = periodFilter
        ? i.academicPeriodId ===
          Number(periodFilter)
        : true;

      const matchStructure =
        structureFilter
          ? i.academicStructureId ===
            Number(structureFilter)
          : true;

      const matchComponent =
        componentFilter
          ? i.componentId ===
            Number(componentFilter)
          : true;

      return (
        matchSearch &&
        matchClass &&
        matchSubject &&
        matchStudent &&
        matchPeriod &&
        matchStructure &&
        matchComponent
      );
    });
  }, [
    assessments,
    search,
    classFilter,
    subjectFilter,
    studentFilter,
    periodFilter,
    structureFilter,
    componentFilter,
  ]);

  // ======================================================
  // ANALYTICS
  // ======================================================

  const totalAssessments =
    filtered.length;

  const averageScore =
    filtered.length > 0
      ? filtered.reduce(
          (sum, x) =>
            sum +
            (x.score / x.maxScore) * 100,
          0
        ) / filtered.length
      : 0;

  const highestScore =
    filtered.length > 0
      ? Math.max(
          ...filtered.map(
            (x) =>
              (x.score / x.maxScore) *
              100
          )
        )
      : 0;

  // ======================================================
  // STYLES
  // ======================================================

  const page: React.CSSProperties = {
    padding: 20,
    color: "var(--text)",
  };

  const card: React.CSSProperties = {
    background: "var(--surface)",
    borderRadius: 14,
    padding: 14,
    border:
      "1px solid rgba(0,0,0,0.08)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border:
      "1px solid rgba(0,0,0,0.15)",
    background: "transparent",
    color: "var(--text)",
  };

  const primaryBtn: React.CSSProperties = {
    border: "none",
    borderRadius: 10,
    padding: "10px 14px",
    background: primary,
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  };

  const outlineBtn: React.CSSProperties = {
    borderRadius: 10,
    padding: "8px 12px",
    background: "transparent",
    color: "var(--text)",
    border: `1px solid ${primary}`,
    cursor: "pointer",
  };

  // ======================================================
  // UI
  // ======================================================

  if (loading) {
    return (
      <div style={page}>
        Loading assessments...
      </div>
    );
  }

  return (
    <div style={page}>
      {/* HEADER *//*}

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>
            Assessments
          </h2>

          <p
            style={{
              opacity: 0.7,
              marginTop: 4,
              fontSize: 13,
            }}
          >
            Comprehensive academic
            assessment tracking
          </p>
        </div>

        <button
          style={primaryBtn}
          onClick={() =>
            setShowForm((p) => !p)
          }
        >
          {showForm
            ? "Close"
            : "+ Add Assessment"}
        </button>
      </div>

      {/* ANALYTICS *//*}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(220px,1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        <div style={card}>
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Total Assessments
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {totalAssessments}
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Average Percentage
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {averageScore.toFixed(1)}%
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Highest Score
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {highestScore.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* FILTERS *//*}

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(180px,1fr))",
          gap: 10,
        }}
      >
        <input
          style={input}
          placeholder="Search..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />

        <select
          style={input}
          value={classFilter}
          onChange={(e) =>
            setClassFilter(e.target.value)
          }
        >
          <option value="">
            All Classes
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
          value={subjectFilter}
          onChange={(e) =>
            setSubjectFilter(
              e.target.value
            )
          }
        >
          <option value="">
            All Subjects
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
          value={studentFilter}
          onChange={(e) =>
            setStudentFilter(
              e.target.value
            )
          }
        >
          <option value="">
            All Students
          </option>

          {students.map((s) => (
            <option
              key={s.id}
              value={s.id}
            >
              {s.fullName}
            </option>
          ))}
        </select>

        <select
          style={input}
          value={componentFilter}
          onChange={(e) =>
            setComponentFilter(
              e.target.value
            )
          }
        >
          <option value="">
            All Components
          </option>

          {components.map((c) => (
            <option
              key={c.id}
              value={c.id}
            >
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* FORM *//*}

      {showForm && (
        <div
          style={{
            ...card,
            marginTop: 20,
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            {editingId
              ? "Edit Assessment"
              : "Create Assessment"}
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(220px,1fr))",
              gap: 10,
            }}
          >
            <select
              style={input}
              value={studentId}
              onChange={(e) =>
                setStudentId(
                  e.target.value
                )
              }
            >
              <option value="">
                Select Student
              </option>

              {students.map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                >
                  {s.fullName}
                </option>
              ))}
            </select>

            <select
              style={input}
              value={classId}
              onChange={(e) =>
                setClassId(
                  e.target.value
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
              value={subjectId}
              onChange={(e) =>
                setSubjectId(
                  e.target.value
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
              value={componentId}
              onChange={(e) =>
                setComponentId(
                  e.target.value
                )
              }
            >
              <option value="">
                Select Component
              </option>

              {components.map((c) => (
                <option
                  key={c.id}
                  value={c.id}
                >
                  {c.name} ({c.weight}%)
                </option>
              ))}
            </select>

            <select
              style={input}
              value={
                academicStructureId
              }
              onChange={(e) =>
                setAcademicStructureId(
                  e.target.value
                )
              }
            >
              <option value="">
                Academic Structure
              </option>

              {academicStructures.map(
                (a) => (
                  <option
                    key={a.id}
                    value={a.id}
                  >
                    {a.name}
                  </option>
                )
              )}
            </select>

            <select
              style={input}
              value={academicPeriodId}
              onChange={(e) =>
                setAcademicPeriodId(
                  e.target.value
                )
              }
            >
              <option value="">
                Academic Period
              </option>

              {academicPeriods.map(
                (p) => (
                  <option
                    key={p.id}
                    value={p.id}
                  >
                    {p.name}
                  </option>
                )
              )}
            </select>

            <input
              style={input}
              type="number"
              placeholder="Score"
              value={score}
              onChange={(e) =>
                setScore(
                  e.target.value
                )
              }
            />

            <input
              style={input}
              type="number"
              placeholder="Max Score"
              value={maxScore}
              onChange={(e) =>
                setMaxScore(
                  e.target.value
                )
              }
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 15,
            }}
          >
            <button
              style={primaryBtn}
              onClick={save}
            >
              {editingId
                ? "Update"
                : "Save"}
            </button>

            <button
              style={outlineBtn}
              onClick={reset}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LIST *//*}

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gap: 12,
        }}
      >
        {filtered.length === 0 && (
          <div style={card}>
            No assessments found
          </div>
        )}

        {filtered.map((item) => {
          const student = getStudent(
            item.studentId
          );

          const subject = getSubject(
            item.subjectId
          );

          const cls = getClass(
            item.classId
          );

          const component =
            getComponent(
              item.componentId
            );

          const structure =
            getStructure(
              item.academicStructureId
            );

          const period = getPeriod(
            item.academicPeriodId
          );

          const percent =
            (
              (item.score /
                item.maxScore) *
              100
            ).toFixed(1);

          const org = cls?.organizationId
            ? getOrganization(
                cls.organizationId
              )
            : undefined;

          return (
            <div
              key={item.id}
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
                      fontSize: 18,
                    }}
                  >
                    {student?.fullName}
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      opacity: 0.7,
                      fontSize: 13,
                    }}
                  >
                    {subject?.name} •{" "}
                    {component?.name}
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      opacity: 0.7,
                      fontSize: 13,
                    }}
                  >
                    {cls?.name}
                    {org
                      ? ` • ${org.name}`
                      : ""}
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      opacity: 0.7,
                      fontSize: 13,
                    }}
                  >
                    {structure?.name} •{" "}
                    {period?.name}
                  </div>
                </div>

                <div
                  style={{
                    textAlign: "right",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 26,
                    }}
                  >
                    {item.score}/
                    {item.maxScore}
                  </div>

                  <div
                    style={{
                      opacity: 0.7,
                    }}
                  >
                    {percent}%
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent:
                        "flex-end",
                      marginTop: 12,
                    }}
                  >
                    <button
                      style={outlineBtn}
                      onClick={() =>
                        editAssessment(
                          item
                        )
                      }
                    >
                      Edit
                    </button>

                    <button
                      style={outlineBtn}
                      onClick={() =>
                        removeAssessment(
                          item.id!
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}*/