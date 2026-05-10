"use client";

import { useEffect, useMemo, useState } from "react";
import { db, Attendance } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

type AttendanceStatus =
  | "present"
  | "absent"
  | "late"
  | "excused";

export default function StudentAttendance() {
  const { settings } = useSettings();

  const branchId = settings?.branchId ?? 1;
  const activeOrganizationId = settings?.organizationId;

  // ======================================================
  // DATA
  // ======================================================
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  // ======================================================
  // UI STATE
  // ======================================================
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ======================================================
  // FILTERS
  // ======================================================
  const [search, setSearch] = useState("");

  const [organizationFilter, setOrganizationFilter] = useState<
    number | ""
  >(activeOrganizationId || "");

  const [classFilter, setClassFilter] = useState<number | "">("");

  const [statusFilter, setStatusFilter] = useState<
    AttendanceStatus | ""
  >("");

  const [dateFilter, setDateFilter] = useState("");

  // ======================================================
  // FORM
  // ======================================================
  const [studentId, setStudentId] = useState<number | "">("");
  const [classId, setClassId] = useState<number | "">("");

  const [academicStructureId, setAcademicStructureId] =
    useState<number | "">("");

  const [academicPeriodId, setAcademicPeriodId] =
    useState<number | "">("");

  const [organizationId, setOrganizationId] = useState<
    number | ""
  >(activeOrganizationId || "");

  const [date, setDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [status, setStatus] =
    useState<AttendanceStatus>("present");

  // ======================================================
  // LOAD
  // ======================================================
  const load = async () => {
    setLoading(true);

    try {
      const [a, s, c, o, st, p] = await Promise.all([
        db.attendance.toArray(),
        db.students.toArray(),
        db.classes.toArray(),
        db.organizations?.toArray?.() || [],
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
      ]);

      const filteredStudents = s.filter((x: any) => {
        if (x.isDeleted) return false;

        if (activeOrganizationId) {
          return x.organizationId === activeOrganizationId;
        }

        return true;
      });

      const filteredClasses = c.filter((x: any) => {
        if (activeOrganizationId) {
          return x.organizationId === activeOrganizationId;
        }

        return true;
      });

      const filteredAttendance = a.filter((x: any) => {
        if (x.isDeleted) return false;

        if (activeOrganizationId) {
          return x.organizationId === activeOrganizationId;
        }

        return true;
      });

      setAttendance(filteredAttendance);
      setStudents(filteredStudents);
      setClasses(filteredClasses);
      setOrganizations(o);
      setStructures(st);
      setPeriods(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // LOOKUPS
  // ======================================================
  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  );

  const classMap = useMemo(
    () => new Map(classes.map((c) => [c.id, c.name])),
    [classes]
  );

  const organizationMap = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations]
  );

  const structureMap = useMemo(
    () => new Map(structures.map((s) => [s.id, s.name])),
    [structures]
  );

  const periodMap = useMemo(
    () => new Map(periods.map((p) => [p.id, p.name])),
    [periods]
  );

  // ======================================================
  // RESET
  // ======================================================
  const reset = () => {
    setStudentId("");
    setClassId("");

    setAcademicStructureId("");
    setAcademicPeriodId("");

    setOrganizationId(activeOrganizationId || "");

    setDate(new Date().toISOString().split("T")[0]);

    setStatus("present");

    setEditingId(null);
    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================
  const save = async () => {
    if (!studentId) {
      alert("Select student");
      return;
    }

    if (!classId) {
      alert("Select class");
      return;
    }

    if (!academicStructureId) {
      alert("Select academic structure");
      return;
    }

    if (!academicPeriodId) {
      alert("Select academic period");
      return;
    }

    if (!date) {
      alert("Attendance date required");
      return;
    }

    const payload = prepareSyncData({
      branchId,

      organizationId:
        organizationId === ""
          ? undefined
          : Number(organizationId),

      studentId: Number(studentId),
      classId: Number(classId),

      academicStructureId: Number(academicStructureId),
      academicPeriodId: Number(academicPeriodId),

      date,
      status,
    });

    // prevent duplicate attendance
    const existing = await db.attendance
      .where({
        studentId: payload.studentId,
        classId: payload.classId,
        date: payload.date,
      })
      .first();

    if (
      existing &&
      existing.id !== editingId
    ) {
      alert(
        "Attendance already recorded for this student on this date"
      );
      return;
    }

    if (editingId) {
      await db.attendance.update(editingId, payload);
    } else {
      await db.attendance.add(payload);
    }

    reset();
    load();
  };

  // ======================================================
  // EDIT
  // ======================================================
  const edit = (a: any) => {
    setEditingId(a.id);

    setStudentId(a.studentId || "");
    setClassId(a.classId || "");

    setAcademicStructureId(
      a.academicStructureId || ""
    );

    setAcademicPeriodId(
      a.academicPeriodId || ""
    );

    setOrganizationId(a.organizationId || "");

    setDate(a.date || "");

    setStatus(a.status || "present");

    setShowForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================
  const remove = async (id: number) => {
    if (!confirm("Delete attendance record?")) return;

    await db.attendance.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    load();
  };

  // ======================================================
  // FILTERED
  // ======================================================
  const filtered = useMemo(() => {
    return attendance.filter((a: any) => {
      const student =
        studentMap.get(a.studentId);

      const matchSearch =
        student?.fullName
          ?.toLowerCase()
          .includes(search.toLowerCase()) || false;

      const matchOrganization =
        organizationFilter === ""
          ? true
          : a.organizationId === organizationFilter;

      const matchClass =
        classFilter === ""
          ? true
          : a.classId === classFilter;

      const matchStatus =
        statusFilter === ""
          ? true
          : a.status === statusFilter;

      const matchDate =
        !dateFilter || a.date === dateFilter;

      return (
        matchSearch &&
        matchOrganization &&
        matchClass &&
        matchStatus &&
        matchDate
      );
    });
  }, [
    attendance,
    search,
    organizationFilter,
    classFilter,
    statusFilter,
    dateFilter,
    studentMap,
  ]);

  // ======================================================
  // STYLES
  // ======================================================
  const page: React.CSSProperties = {
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
    fontWeight: 600,
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  const badge = (
    status: AttendanceStatus
  ): React.CSSProperties => ({
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    width: "fit-content",

    background:
      status === "present"
        ? "rgba(0,180,0,0.12)"
        : status === "late"
        ? "rgba(255,165,0,0.15)"
        : status === "excused"
        ? "rgba(0,120,255,0.15)"
        : "rgba(255,0,0,0.12)",
  });

  if (loading) {
    return <div style={page}>Loading attendance...</div>;
  }

  // ======================================================
  // UI
  // ======================================================
  return (
    <div style={page}>

      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>
            Student Attendance
          </h2>

          <p
            style={{
              margin: 0,
              opacity: 0.6,
              fontSize: 13,
            }}
          >
            Daily class attendance management
          </p>
        </div>

        <button
          style={primaryButton}
          onClick={() =>
            setShowForm((p) => !p)
          }
        >
          {showForm
            ? "Close"
            : "+ Record Attendance"}
        </button>
      </div>

      {/* FILTERS */}
      <div
        style={{
          marginTop: 15,
          display: "grid",
          gridTemplateColumns:
            "2fr 1fr 1fr 1fr 1fr",
          gap: 10,
        }}
      >
        <input
          style={input}
          placeholder="Search student..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />

        <select
          style={input}
          value={organizationFilter}
          onChange={(e) =>
            setOrganizationFilter(
              e.target.value
                ? Number(e.target.value)
                : ""
            )
          }
        >
          <option value="">
            All Organizations
          </option>

          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        <select
          style={input}
          value={classFilter}
          onChange={(e) =>
            setClassFilter(
              e.target.value
                ? Number(e.target.value)
                : ""
            )
          }
        >
          <option value="">All Classes</option>

          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          style={input}
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value as AttendanceStatus
            )
          }
        >
          <option value="">All Status</option>
          <option value="present">
            Present
          </option>
          <option value="absent">
            Absent
          </option>
          <option value="late">Late</option>
          <option value="excused">
            Excused
          </option>
        </select>

        <input
          type="date"
          style={input}
          value={dateFilter}
          onChange={(e) =>
            setDateFilter(e.target.value)
          }
        />
      </div>

      {/* FORM */}
      {showForm && (
        <div
          style={{
            ...card,
            marginTop: 15,
            maxWidth: 550,
            display: "grid",
            gap: 10,
          }}
        >
          <h3 style={{ margin: 0 }}>
            {editingId
              ? "Edit Attendance"
              : "Record Attendance"}
          </h3>

          <select
            style={input}
            value={organizationId}
            onChange={(e) =>
              setOrganizationId(
                e.target.value
                  ? Number(e.target.value)
                  : ""
              )
            }
          >
            <option value="">
              Select Organization
            </option>

            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>

          <select
            style={input}
            value={classId}
            onChange={(e) =>
              setClassId(
                e.target.value
                  ? Number(e.target.value)
                  : ""
              )
            }
          >
            <option value="">Select Class</option>

            {classes
              .filter((c) => {
                if (!organizationId)
                  return true;

                return (
                  c.organizationId ===
                  organizationId
                );
              })
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>

          <select
            style={input}
            value={studentId}
            onChange={(e) =>
              setStudentId(
                e.target.value
                  ? Number(e.target.value)
                  : ""
              )
            }
          >
            <option value="">
              Select Student
            </option>

            {students
              .filter((s) => {
                if (
                  classId &&
                  s.currentClassId !== classId
                ) {
                  return false;
                }

                if (
                  organizationId &&
                  s.organizationId !==
                    organizationId
                ) {
                  return false;
                }

                return true;
              })
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
          </select>

          <select
            style={input}
            value={academicStructureId}
            onChange={(e) =>
              setAcademicStructureId(
                e.target.value
                  ? Number(e.target.value)
                  : ""
              )
            }
          >
            <option value="">
              Academic Structure
            </option>

            {structures.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            style={input}
            value={academicPeriodId}
            onChange={(e) =>
              setAcademicPeriodId(
                e.target.value
                  ? Number(e.target.value)
                  : ""
              )
            }
          >
            <option value="">
              Academic Period
            </option>

            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            style={input}
            value={date}
            onChange={(e) =>
              setDate(e.target.value)
            }
          />

          <select
            style={input}
            value={status}
            onChange={(e) =>
              setStatus(
                e.target
                  .value as AttendanceStatus
              )
            }
          >
            <option value="present">
              Present
            </option>
            <option value="absent">
              Absent
            </option>
            <option value="late">Late</option>
            <option value="excused">
              Excused
            </option>
          </select>

          {/* ACTIONS */}
          <div
            style={{
              display: "flex",
              gap: 10,
            }}
          >
            <button
              style={primaryButton}
              onClick={save}
            >
              {editingId
                ? "Update"
                : "Save"}
            </button>

            <button
              style={button}
              onClick={reset}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LIST */}
      <div style={{ marginTop: 20 }}>
        {filtered.length === 0 && (
          <p style={{ opacity: 0.6 }}>
            No attendance records found
          </p>
        )}

        {filtered.map((a: any) => {
          const student =
            studentMap.get(a.studentId);

          return (
            <div
              key={a.id}
              style={card}
            >
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
                  <b>
                    {student?.fullName ||
                      "Unknown Student"}
                  </b>

                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.7,
                      marginTop: 4,
                    }}
                  >
                    🏫{" "}
                    {organizationMap.get(
                      a.organizationId
                    ) || "No Organization"}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.7,
                    }}
                  >
                    🎓{" "}
                    {classMap.get(a.classId) ||
                      "No Class"}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.7,
                    }}
                  >
                    📚{" "}
                    {structureMap.get(
                      a.academicStructureId
                    ) || "-"}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.7,
                    }}
                  >
                    🗓️{" "}
                    {periodMap.get(
                      a.academicPeriodId
                    ) || "-"}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.7,
                    }}
                  >
                    📅 {a.date}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                    }}
                  >
                    <div
                      style={badge(a.status)}
                    >
                      {a.status}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    height: "fit-content",
                  }}
                >
                  <button
                    style={button}
                    onClick={() =>
                      edit(a)
                    }
                  >
                    Edit
                  </button>

                  <button
                    style={button}
                    onClick={() =>
                      remove(a.id)
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}