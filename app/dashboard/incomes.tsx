"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";

import type {
  Income,
  IncomeSourceType,
  PaymentMethod,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

import { useSettings } from "../context/settings-context";

export default function IncomesPage() {
  const { settings } = useSettings();

  // ======================================================
  // ORGANIZATION CONTEXT
  // ======================================================

  const branchId = settings?.branchId ?? 1;
  const organizationId = settings?.organizationId;

  const primary =
    settings?.primaryColor ||
    "var(--primary-color)";

  // ======================================================
  // DATA
  // ======================================================

  const [loading, setLoading] = useState(true);

  const [incomes, setIncomes] = useState<Income[]>(
    []
  );

  const [students, setStudents] = useState<any[]>(
    []
  );

  const [parents, setParents] = useState<any[]>([]);

  const [teachers, setTeachers] = useState<any[]>(
    []
  );

  const [classes, setClasses] = useState<any[]>([]);

  const [
    academicPeriods,
    setAcademicPeriods,
  ] = useState<any[]>([]);

  const [
    academicStructures,
    setAcademicStructures,
  ] = useState<any[]>([]);

  // ======================================================
  // UI
  // ======================================================

  const [showForm, setShowForm] =
    useState(false);

  const [editingId, setEditingId] = useState<
    number | null
  >(null);

  // ======================================================
  // FILTERS
  // ======================================================

  const [search, setSearch] = useState("");

  const [sourceFilter, setSourceFilter] =
    useState<IncomeSourceType | "">("");

  const [methodFilter, setMethodFilter] =
    useState<PaymentMethod | "">("");

  const [statusFilter, setStatusFilter] =
    useState("");

  const [dateFilter, setDateFilter] =
    useState("");

  // ======================================================
  // FORM
  // ======================================================

  const [title, setTitle] = useState("");

  const [category, setCategory] = useState("");

  const [amount, setAmount] = useState("");

  const [method, setMethod] =
    useState<PaymentMethod | "">("");

  const [date, setDate] = useState("");

  const [note, setNote] = useState("");

  const [sourceType, setSourceType] =
    useState<IncomeSourceType>("external");

  const [status, setStatus] = useState<
    Income["status"]
  >("completed");

  const [studentId, setStudentId] =
    useState<number>();

  const [parentId, setParentId] =
    useState<number>();

  const [teacherId, setTeacherId] =
    useState<number>();

  const [classId, setClassId] =
    useState<number>();

  const [
    academicStructureId,
    setAcademicStructureId,
  ] = useState<number>();

  const [
    academicPeriodId,
    setAcademicPeriodId,
  ] = useState<number>();

  const [externalSource, setExternalSource] =
    useState("");

  const [
    externalContact,
    setExternalContact,
  ] = useState("");

  const [receiptNumber, setReceiptNumber] =
    useState("");

  const [transactionId, setTransactionId] =
    useState("");

  const [referenceNumber, setReferenceNumber] =
    useState("");

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    setLoading(true);

    try {
      const [
        incomeData,
        studentData,
        parentData,
        teacherData,
        classData,
        periodData,
        structureData,
      ] = await Promise.all([
        db.incomes.toArray(),
        db.students.toArray(),
        db.parents.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.academicPeriods.toArray(),
        db.academicStructures.toArray(),
      ]);

      const filtered = incomeData.filter(
        (x: any) => {
          const branchMatch =
            x.branchId === branchId;

          const orgMatch = organizationId
            ? x.organizationId ===
              organizationId
            : true;

          return (
            branchMatch &&
            orgMatch &&
            !x.isDeleted
          );
        }
      );

      filtered.sort(
        (a, b) =>
          new Date(b.date).getTime() -
          new Date(a.date).getTime()
      );

      setIncomes(filtered);

      setStudents(studentData);

      setParents(parentData);

      setTeachers(teacherData);

      setClasses(classData);

      setAcademicPeriods(periodData);

      setAcademicStructures(structureData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // RESET
  // ======================================================

  const reset = () => {
    setEditingId(null);

    setTitle("");

    setCategory("");

    setAmount("");

    setMethod("");

    setDate("");

    setNote("");

    setSourceType("external");

    setStatus("completed");

    setStudentId(undefined);

    setParentId(undefined);

    setTeacherId(undefined);

    setClassId(undefined);

    setAcademicStructureId(undefined);

    setAcademicPeriodId(undefined);

    setExternalSource("");

    setExternalContact("");

    setReceiptNumber("");

    setTransactionId("");

    setReferenceNumber("");

    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================

  const save = async () => {
    if (!title.trim()) {
      alert("Title required");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      alert("Valid amount required");
      return;
    }

    if (!date) {
      alert("Date required");
      return;
    }

    const payload = prepareSyncData({
      branchId,
      organizationId,

      title: title.trim(),

      category: category.trim(),

      amount: Number(amount),

      method: method || undefined,

      date,

      note: note.trim(),

      sourceType,

      studentId,

      parentId,

      teacherId,

      classId,

      academicStructureId,

      academicPeriodId,

      externalSource:
        externalSource.trim() || undefined,

      externalContact:
        externalContact.trim() || undefined,

      receiptNumber:
        receiptNumber.trim() || undefined,

      transactionId:
        transactionId.trim() || undefined,

      referenceNumber:
        referenceNumber.trim() || undefined,

      status,
    });

    if (editingId) {
      await db.incomes.update(
        editingId,
        payload
      );
    } else {
      await db.incomes.add(payload);
    }

    reset();

    load();
  };

  // ======================================================
  // EDIT
  // ======================================================

  const edit = (i: Income) => {
    setEditingId(i.id || null);

    setTitle(i.title || "");

    setCategory(i.category || "");

    setAmount(String(i.amount || ""));

    setMethod(i.method || "");

    setDate(i.date || "");

    setNote(i.note || "");

    setSourceType(
      i.sourceType || "external"
    );

    setStatus(i.status || "completed");

    setStudentId(i.studentId);

    setParentId(i.parentId);

    setTeacherId(i.teacherId);

    setClassId(i.classId);

    setAcademicStructureId(
      i.academicStructureId
    );

    setAcademicPeriodId(
      i.academicPeriodId
    );

    setExternalSource(
      i.externalSource || ""
    );

    setExternalContact(
      i.externalContact || ""
    );

    setReceiptNumber(
      i.receiptNumber || ""
    );

    setTransactionId(
      i.transactionId || ""
    );

    setReferenceNumber(
      i.referenceNumber || ""
    );

    setShowForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================

  const remove = async (id: number) => {
    const ok = confirm(
      "Delete income record?"
    );

    if (!ok) return;

    await db.incomes.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    load();
  };

  // ======================================================
  // HELPERS
  // ======================================================

  const getStudentName = (id?: number) =>
    students.find((x) => x.id === id)
      ?.fullName || "Student";

  const getParentName = (id?: number) =>
    parents.find((x) => x.id === id)
      ?.fullName || "Parent";

  const getTeacherName = (id?: number) =>
    teachers.find((x) => x.id === id)
      ?.fullName || "Teacher";

  const getClassName = (id?: number) =>
    classes.find((x) => x.id === id)
      ?.name || "Class";

  const getPeriodName = (id?: number) =>
    academicPeriods.find(
      (x) => x.id === id
    )?.name || "Period";

  const getSourceLabel = (i: Income) => {
    switch (i.sourceType) {
      case "student":
        return getStudentName(i.studentId);

      case "parent":
        return getParentName(i.parentId);

      case "teacher":
        return getTeacherName(i.teacherId);

      case "school_fee":
        return "School Fees";

      case "pta":
        return "PTA";

      case "transport":
        return "Transport";

      case "canteen":
        return "Canteen";

      case "uniform":
        return "Uniform";

      case "boarding":
        return "Boarding";

      case "donation":
        return "Donation";

      case "external":
        return (
          i.externalSource ||
          "External Source"
        );

      default:
        return (
          i.sourceType || "Other"
        );
    }
  };

  // ======================================================
  // FILTERED
  // ======================================================

  const filtered = useMemo(() => {
    return incomes.filter((i) => {
      const q = search.toLowerCase();

      const matchSearch =
        i.title
          ?.toLowerCase()
          .includes(q) ||
        i.category
          ?.toLowerCase()
          .includes(q) ||
        i.note
          ?.toLowerCase()
          .includes(q) ||
        getSourceLabel(i)
          .toLowerCase()
          .includes(q);

      const matchSource = sourceFilter
        ? i.sourceType === sourceFilter
        : true;

      const matchMethod = methodFilter
        ? i.method === methodFilter
        : true;

      const matchStatus = statusFilter
        ? i.status === statusFilter
        : true;

      const matchDate = dateFilter
        ? i.date === dateFilter
        : true;

      return (
        matchSearch &&
        matchSource &&
        matchMethod &&
        matchStatus &&
        matchDate
      );
    });
  }, [
    incomes,
    search,
    sourceFilter,
    methodFilter,
    statusFilter,
    dateFilter,
  ]);

  // ======================================================
  // ANALYTICS
  // ======================================================

  const totalIncome = filtered.reduce(
    (sum, i) =>
      sum + Number(i.amount || 0),
    0
  );

  const completedIncome =
    filtered
      .filter(
        (x) => x.status === "completed"
      )
      .reduce(
        (sum, i) =>
          sum + Number(i.amount || 0),
        0
      );

  const pendingIncome = filtered
    .filter((x) => x.status === "pending")
    .reduce(
      (sum, i) =>
        sum + Number(i.amount || 0),
      0
    );

  const todayIncome = filtered
    .filter(
      (x) =>
        x.date ===
        new Date()
          .toISOString()
          .split("T")[0]
    )
    .reduce(
      (sum, i) =>
        sum + Number(i.amount || 0),
      0
    );

  // ======================================================
  // STYLES
  // ======================================================

  const page: React.CSSProperties = {
    padding: 20,
    color: "var(--text)",
  };

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border:
      "1px solid rgba(0,0,0,0.08)",
    borderRadius: 14,
    padding: 14,
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border:
      "1px solid rgba(0,0,0,0.2)",
    width: "100%",
    background: "transparent",
    color: "var(--text)",
  };

  const primaryBtn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: primary,
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  };

  const outlineBtn: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: `1px solid ${primary}`,
    background: "transparent",
    color: "var(--text)",
    cursor: "pointer",
  };

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return (
      <div style={page}>
        Loading income records...
      </div>
    );
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
          justifyContent:
            "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>
            Income Management
          </h2>

          <p
            style={{
              marginTop: 4,
              opacity: 0.7,
            }}
          >
            Fully tracked institutional
            income system
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
            : "+ Add Income"}
        </button>
      </div>

      {/* SUMMARY */}

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(220px,1fr))",
          gap: 12,
        }}
      >
        <div style={card}>
          <div>Total Income</div>

          <h1>
            GHS{" "}
            {totalIncome.toFixed(2)}
          </h1>
        </div>

        <div style={card}>
          <div>Completed</div>

          <h1>
            GHS{" "}
            {completedIncome.toFixed(2)}
          </h1>
        </div>

        <div style={card}>
          <div>Pending</div>

          <h1>
            GHS{" "}
            {pendingIncome.toFixed(2)}
          </h1>
        </div>

        <div style={card}>
          <div>Today</div>

          <h1>
            GHS{" "}
            {todayIncome.toFixed(2)}
          </h1>
        </div>
      </div>

      {/* FILTERS */}

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns:
            "2fr 1fr 1fr 1fr 1fr",
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
          value={sourceFilter}
          onChange={(e) =>
            setSourceFilter(
              e.target.value as IncomeSourceType
            )
          }
        >
          <option value="">
            All Sources
          </option>

          <option value="student">
            Student
          </option>

          <option value="school_fee">
            School Fee
          </option>

          <option value="donation">
            Donation
          </option>

          <option value="external">
            External
          </option>
        </select>

        <select
          style={input}
          value={methodFilter}
          onChange={(e) =>
            setMethodFilter(
              e.target.value as PaymentMethod
            )
          }
        >
          <option value="">
            All Methods
          </option>

          <option value="cash">
            Cash
          </option>

          <option value="momo">
            Mobile Money
          </option>

          <option value="bank">
            Bank
          </option>

          <option value="card">
            Card
          </option>
        </select>

        <select
          style={input}
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value
            )
          }
        >
          <option value="">
            All Status
          </option>

          <option value="pending">
            Pending
          </option>

          <option value="completed">
            Completed
          </option>

          <option value="cancelled">
            Cancelled
          </option>

          <option value="refunded">
            Refunded
          </option>
        </select>

        <input
          type="date"
          style={input}
          value={dateFilter}
          onChange={(e) =>
            setDateFilter(
              e.target.value
            )
          }
        />
      </div>

      {/* FORM */}

      {showForm && (
        <div
          style={{
            ...card,
            marginTop: 20,
          }}
        >
          <h3>
            {editingId
              ? "Edit Income"
              : "Create Income"}
          </h3>

          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns:
                "repeat(auto-fit,minmax(220px,1fr))",
            }}
          >
            <input
              style={input}
              placeholder="Title"
              value={title}
              onChange={(e) =>
                setTitle(
                  e.target.value
                )
              }
            />

            <input
              style={input}
              placeholder="Category"
              value={category}
              onChange={(e) =>
                setCategory(
                  e.target.value
                )
              }
            />

            <input
              type="number"
              style={input}
              placeholder="Amount"
              value={amount}
              onChange={(e) =>
                setAmount(
                  e.target.value
                )
              }
            />

            <input
              type="date"
              style={input}
              value={date}
              onChange={(e) =>
                setDate(
                  e.target.value
                )
              }
            />

            <select
              style={input}
              value={sourceType}
              onChange={(e) =>
                setSourceType(
                  e.target
                    .value as IncomeSourceType
                )
              }
            >
              <option value="external">
                External
              </option>

              <option value="student">
                Student
              </option>

              <option value="parent">
                Parent
              </option>

              <option value="teacher">
                Teacher
              </option>

              <option value="school_fee">
                School Fee
              </option>

              <option value="donation">
                Donation
              </option>
            </select>

            <select
              style={input}
              value={method}
              onChange={(e) =>
                setMethod(
                  e.target
                    .value as PaymentMethod
                )
              }
            >
              <option value="">
                Method
              </option>

              <option value="cash">
                Cash
              </option>

              <option value="momo">
                Mobile Money
              </option>

              <option value="bank">
                Bank
              </option>

              <option value="card">
                Card
              </option>
            </select>

            <select
              style={input}
              value={status}
              onChange={(e) =>
                setStatus(
                  e.target
                    .value as Income["status"]
                )
              }
            >
              <option value="completed">
                Completed
              </option>

              <option value="pending">
                Pending
              </option>

              <option value="cancelled">
                Cancelled
              </option>

              <option value="refunded">
                Refunded
              </option>
            </select>

            {/* STUDENT */}

            {sourceType ===
              "student" && (
              <select
                style={input}
                value={studentId}
                onChange={(e) =>
                  setStudentId(
                    Number(
                      e.target.value
                    )
                  )
                }
              >
                <option>
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
            )}

            {/* PARENT */}

            {sourceType ===
              "parent" && (
              <select
                style={input}
                value={parentId}
                onChange={(e) =>
                  setParentId(
                    Number(
                      e.target.value
                    )
                  )
                }
              >
                <option>
                  Select Parent
                </option>

                {parents.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                  >
                    {p.fullName}
                  </option>
                ))}
              </select>
            )}

            {/* TEACHER */}

            {sourceType ===
              "teacher" && (
              <select
                style={input}
                value={teacherId}
                onChange={(e) =>
                  setTeacherId(
                    Number(
                      e.target.value
                    )
                  )
                }
              >
                <option>
                  Select Teacher
                </option>

                {teachers.map((t) => (
                  <option
                    key={t.id}
                    value={t.id}
                  >
                    {t.fullName}
                  </option>
                ))}
              </select>
            )}

            {/* CLASS */}

            <select
              style={input}
              value={classId}
              onChange={(e) =>
                setClassId(
                  Number(
                    e.target.value
                  )
                )
              }
            >
              <option>
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

            {/* ACADEMIC PERIOD */}

            <select
              style={input}
              value={
                academicPeriodId
              }
              onChange={(e) =>
                setAcademicPeriodId(
                  Number(
                    e.target.value
                  )
                )
              }
            >
              <option>
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

            {/* EXTERNAL */}

            {sourceType ===
              "external" && (
              <>
                <input
                  style={input}
                  placeholder="External Source"
                  value={
                    externalSource
                  }
                  onChange={(e) =>
                    setExternalSource(
                      e.target.value
                    )
                  }
                />

                <input
                  style={input}
                  placeholder="External Contact"
                  value={
                    externalContact
                  }
                  onChange={(e) =>
                    setExternalContact(
                      e.target.value
                    )
                  }
                />
              </>
            )}

            <input
              style={input}
              placeholder="Receipt Number"
              value={receiptNumber}
              onChange={(e) =>
                setReceiptNumber(
                  e.target.value
                )
              }
            />

            <input
              style={input}
              placeholder="Transaction ID"
              value={transactionId}
              onChange={(e) =>
                setTransactionId(
                  e.target.value
                )
              }
            />

            <input
              style={input}
              placeholder="Reference Number"
              value={referenceNumber}
              onChange={(e) =>
                setReferenceNumber(
                  e.target.value
                )
              }
            />

            <textarea
              style={{
                ...input,
                minHeight: 100,
                gridColumn:
                  "1 / -1",
              }}
              placeholder="Notes..."
              value={note}
              onChange={(e) =>
                setNote(
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
                ? "Update Income"
                : "Save Income"}
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

      {/* LIST */}

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gap: 10,
        }}
      >
        {filtered.length === 0 && (
          <div style={card}>
            No income records found
          </div>
        )}

        {filtered.map((i) => (
          <div
            key={i.id}
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
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 18,
                  }}
                >
                  {i.title}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    opacity: 0.7,
                    fontSize: 13,
                  }}
                >
                  {getSourceLabel(i)} •{" "}
                  {i.method || "N/A"} •{" "}
                  {i.date}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    opacity: 0.7,
                    fontSize: 13,
                  }}
                >
                  {getClassName(
                    i.classId
                  )}{" "}
                  •{" "}
                  {getPeriodName(
                    i.academicPeriodId
                  )}
                </div>

                {i.note && (
                  <div
                    style={{
                      marginTop: 6,
                      opacity: 0.7,
                    }}
                  >
                    {i.note}
                  </div>
                )}
              </div>

              <div
                style={{
                  textAlign: "right",
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                  }}
                >
                  GHS{" "}
                  {Number(
                    i.amount
                  ).toFixed(2)}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    opacity: 0.7,
                  }}
                >
                  {i.status}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent:
                      "flex-end",
                    marginTop: 10,
                  }}
                >
                  <button
                    style={
                      outlineBtn
                    }
                    onClick={() =>
                      edit(i)
                    }
                  >
                    Edit
                  </button>

                  <button
                    style={
                      outlineBtn
                    }
                    onClick={() =>
                      remove(
                        i.id!
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}