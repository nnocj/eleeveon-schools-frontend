"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";

import type {
  Expense,
  ExpenseSourceType,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

export default function Expenses() {
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // ======================================================
  // RELATED ENTITIES
  // ======================================================
  const [students, setStudents] = useState<any[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [academicStructures, setAcademicStructures] =
    useState<any[]>([]);
  const [academicPeriods, setAcademicPeriods] =
    useState<any[]>([]);

  // ======================================================
  // UI STATE
  // ======================================================
  const [showForm, setShowForm] = useState(false);

  const [editingId, setEditingId] =
    useState<number | null>(null);

  // ======================================================
  // FILTERS
  // ======================================================
  const [search, setSearch] = useState("");

  const [sourceFilter, setSourceFilter] =
    useState<ExpenseSourceType | "">("");

  const [methodFilter, setMethodFilter] =
    useState("");

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

  const [method, setMethod] = useState("");

  const [date, setDate] = useState("");

  const [note, setNote] = useState("");

  // ======================================================
  // CLASSIFICATION
  // ======================================================
  const [sourceType, setSourceType] =
    useState<ExpenseSourceType>("other");

  // ======================================================
  // RELATIONAL LINKS
  // ======================================================
  const [studentId, setStudentId] =
    useState<number | undefined>();

  const [parentId, setParentId] =
    useState<number | undefined>();

  const [teacherId, setTeacherId] =
    useState<number | undefined>();

  const [classId, setClassId] =
    useState<number | undefined>();

  const [subjectId, setSubjectId] =
    useState<number | undefined>();

  // ======================================================
  // ACADEMIC
  // ======================================================
  const [
    academicStructureId,
    setAcademicStructureId,
  ] = useState<number | undefined>();

  const [
    academicPeriodId,
    setAcademicPeriodId,
  ] = useState<number | undefined>();

  // ======================================================
  // STAFF / APPROVAL
  // ======================================================
  const [approvedBy, setApprovedBy] =
    useState<number | undefined>();

  const [requestedBy, setRequestedBy] =
    useState<number | undefined>();

  const [paidBy, setPaidBy] =
    useState<number | undefined>();

  // ======================================================
  // PROCUREMENT
  // ======================================================
  const [vendor, setVendor] = useState("");
  const [vendorContact, setVendorContact] =
    useState("");

  const [vendorAddress, setVendorAddress] =
    useState("");

  // ======================================================
  // TRANSACTION
  // ======================================================
  const [receiptNumber, setReceiptNumber] =
    useState("");

  const [invoiceNumber, setInvoiceNumber] =
    useState("");

  const [transactionId, setTransactionId] =
    useState("");

  const [referenceNumber, setReferenceNumber] =
    useState("");

  // ======================================================
  // LOCATION / DEPARTMENT
  // ======================================================
  const [department, setDepartment] =
    useState("");

  const [destination, setDestination] =
    useState("");

  const [expenseLocation, setExpenseLocation] =
    useState("");

  // ======================================================
  // EVENT / PROJECT
  // ======================================================
  const [eventName, setEventName] =
    useState("");

  const [projectName, setProjectName] =
    useState("");

  // ======================================================
  // FLAGS
  // ======================================================
  const [recurring, setRecurring] =
    useState(false);

  const [autoGenerated, setAutoGenerated] =
    useState(false);

  const [reimbursable, setReimbursable] =
    useState(false);

  const [refunded, setRefunded] =
    useState(false);

  // ======================================================
  // STATUS
  // ======================================================
  const [status, setStatus] = useState<
    | "pending"
    | "approved"
    | "paid"
    | "cancelled"
    | "rejected"
    | "refunded"
  >("paid");

  // ======================================================
  // LOAD
  // ======================================================
  const load = async () => {
    setLoading(true);

    try {
      const [
        exp,
        st,
        pa,
        te,
        cl,
        su,
        acs,
        acp,
      ] = await Promise.all([
        db.expenses.toArray(),
        db.students.toArray(),
        db.parents.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
      ]);

      const filtered = exp.filter((x: any) => {
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
      });

      filtered.sort(
        (a: any, b: any) =>
          new Date(b.date).getTime() -
          new Date(a.date).getTime()
      );

      setExpenses(filtered);

      setStudents(st);
      setParents(pa);
      setTeachers(te);
      setClasses(cl);
      setSubjects(su);

      setAcademicStructures(acs);
      setAcademicPeriods(acp);
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
    setTitle("");
    setCategory("");

    setAmount("");
    setMethod("");
    setDate("");
    setNote("");

    setSourceType("other");

    setStudentId(undefined);
    setParentId(undefined);
    setTeacherId(undefined);

    setClassId(undefined);
    setSubjectId(undefined);

    setAcademicStructureId(undefined);
    setAcademicPeriodId(undefined);

    setApprovedBy(undefined);
    setRequestedBy(undefined);
    setPaidBy(undefined);

    setVendor("");
    setVendorContact("");
    setVendorAddress("");

    setReceiptNumber("");
    setInvoiceNumber("");
    setTransactionId("");
    setReferenceNumber("");

    setDepartment("");
    setDestination("");
    setExpenseLocation("");

    setEventName("");
    setProjectName("");

    setRecurring(false);
    setAutoGenerated(false);
    setReimbursable(false);
    setRefunded(false);

    setStatus("paid");

    setEditingId(null);
    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================
  const save = async () => {
    if (!title.trim()) {
      alert("Expense title required");
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
      subjectId,

      academicStructureId,
      academicPeriodId,

      approvedBy,
      requestedBy,
      paidBy,

      vendor: vendor.trim(),
      vendorContact:
        vendorContact.trim(),

      vendorAddress:
        vendorAddress.trim(),

      receiptNumber:
        receiptNumber.trim(),

      invoiceNumber:
        invoiceNumber.trim(),

      transactionId:
        transactionId.trim(),

      referenceNumber:
        referenceNumber.trim(),

      department:
        department.trim(),

      destination:
        destination.trim(),

      expenseLocation:
        expenseLocation.trim(),

      eventName:
        eventName.trim(),

      projectName:
        projectName.trim(),

      recurring,
      autoGenerated,
      reimbursable,
      refunded,

      status,
    });

    if (editingId) {
      await db.expenses.update(
        editingId,
        payload
      );
    } else {
      await db.expenses.add(payload);
    }

    reset();
    load();
  };

  // ======================================================
  // EDIT
  // ======================================================
  const edit = (item: Expense) => {
    setEditingId(item.id || null);

    setTitle(item.title || "");
    setCategory(item.category || "");

    setAmount(String(item.amount || ""));
    setMethod(item.method || "");

    setDate(item.date || "");

    setNote(item.note || "");

    setSourceType(
      item.sourceType || "other"
    );

    setStudentId(item.studentId);
    setParentId(item.parentId);
    setTeacherId(item.teacherId);

    setClassId(item.classId);

    setSubjectId(item.subjectId);

    setAcademicStructureId(
      item.academicStructureId
    );

    setAcademicPeriodId(
      item.academicPeriodId
    );

    setApprovedBy(item.approvedBy);

    setRequestedBy(item.requestedBy);

    setPaidBy(item.paidBy);

    setVendor(item.vendor || "");

    setVendorContact(
      item.vendorContact || ""
    );

    setVendorAddress(
      item.vendorAddress || ""
    );

    setReceiptNumber(
      item.receiptNumber || ""
    );

    setInvoiceNumber(
      item.invoiceNumber || ""
    );

    setTransactionId(
      item.transactionId || ""
    );

    setReferenceNumber(
      item.referenceNumber || ""
    );

    setDepartment(
      item.department || ""
    );

    setDestination(
      item.destination || ""
    );

    setExpenseLocation(
      item.expenseLocation || ""
    );

    setEventName(
      item.eventName || ""
    );

    setProjectName(
      item.projectName || ""
    );

    setRecurring(
      item.recurring || false
    );

    setAutoGenerated(
      item.autoGenerated || false
    );

    setReimbursable(
      item.reimbursable || false
    );

    setRefunded(
      item.refunded || false
    );

    setStatus(item.status || "paid");

    setShowForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================
  const remove = async (id: number) => {
    if (!confirm("Delete expense?")) return;

    await db.expenses.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    load();
  };

  // ======================================================
  // SOURCE LABEL
  // ======================================================
  const getSourceLabel = (
    item: Expense
  ) => {
    switch (item.sourceType) {
      case "salary":
        return "Salary";

      case "maintenance":
        return "Maintenance";

      case "transport":
        return "Transport";

      case "academic":
        return "Academic";

      case "technology":
        return "Technology";

      case "feeding":
        return "Feeding";

      case "construction":
        return "Construction";

      case "internet":
        return "Internet";

      default:
        return (
          item.sourceType || "Other"
        );
    }
  };

  // ======================================================
  // FILTERED
  // ======================================================
  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      const q = search.toLowerCase();

      const matchSearch =
        e.title
          ?.toLowerCase()
          .includes(q) ||
        e.category
          ?.toLowerCase()
          .includes(q) ||
        e.note
          ?.toLowerCase()
          .includes(q) ||
        getSourceLabel(e)
          .toLowerCase()
          .includes(q) ||
        e.vendor
          ?.toLowerCase()
          .includes(q) ||
        e.department
          ?.toLowerCase()
          .includes(q);

      const matchSource =
        sourceFilter
          ? e.sourceType ===
            sourceFilter
          : true;

      const matchMethod =
        methodFilter
          ? e.method ===
            methodFilter
          : true;

      const matchStatus =
        statusFilter
          ? e.status ===
            statusFilter
          : true;

      const matchDate =
        dateFilter
          ? e.date === dateFilter
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
    expenses,
    search,
    sourceFilter,
    methodFilter,
    statusFilter,
    dateFilter,
  ]);

  // ======================================================
  // ANALYTICS
  // ======================================================
  const totalExpense =
    filtered.reduce(
      (sum, item) =>
        sum +
        Number(item.amount || 0),
      0
    );

  const todayExpense =
    filtered
      .filter(
        (x) =>
          x.date ===
          new Date()
            .toISOString()
            .split("T")[0]
      )
      .reduce(
        (sum, item) =>
          sum +
          Number(item.amount || 0),
        0
      );

  const pendingExpense =
    filtered
      .filter(
        (x) =>
          x.status === "pending"
      )
      .reduce(
        (sum, item) =>
          sum +
          Number(item.amount || 0),
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
    border:
      "1px solid rgba(0,0,0,0.08)",

    background: "var(--surface)",

    padding: 14,

    borderRadius: 12,
  };

  const input: React.CSSProperties = {
    padding: 10,

    borderRadius: 10,

    border:
      "1px solid rgba(0,0,0,0.15)",

    background: "transparent",

    color: "var(--text)",

    width: "100%",
  };

  const primaryBtn: React.CSSProperties =
    {
      padding: "10px 14px",

      borderRadius: 10,

      border: "none",

      background: primary,

      color: "#fff",

      cursor: "pointer",

      fontWeight: 600,
    };

  const outlineBtn: React.CSSProperties =
    {
      padding: "8px 12px",

      borderRadius: 10,

      border: `1px solid ${primary}`,

      background: "transparent",

      color: "var(--text)",

      cursor: "pointer",
    };

  // ======================================================
  // UI
  // ======================================================
  if (loading) {
    return (
      <div style={page}>
        Loading expenses...
      </div>
    );
  }

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
            Expenses
          </h2>

          <p
            style={{
              margin: "4px 0 0",
              opacity: 0.7,
              fontSize: 13,
            }}
          >
            Full institutional
            expense tracking &
            management
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
            : "+ Add Expense"}
        </button>
      </div>

      {/* SUMMARY */}
      <div
        style={{
          marginTop: 15,

          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit,minmax(220px,1fr))",

          gap: 12,
        }}
      >
        <div style={card}>
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Total Expenses
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 4,
            }}
          >
            GHS{" "}
            {totalExpense.toFixed(2)}
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Today's Expenses
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 4,
            }}
          >
            GHS{" "}
            {todayExpense.toFixed(2)}
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Pending Expenses
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 4,
            }}
          >
            GHS{" "}
            {pendingExpense.toFixed(2)}
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Records
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 4,
            }}
          >
            {filtered.length}
          </div>
        </div>
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
          placeholder="Search expenses..."
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
        />

        <select
          style={input}
          value={sourceFilter}
          onChange={(e) =>
            setSourceFilter(
              e.target
                .value as ExpenseSourceType
            )
          }
        >
          <option value="">
            All Types
          </option>

          <option value="salary">
            Salary
          </option>

          <option value="maintenance">
            Maintenance
          </option>

          <option value="utility">
            Utility
          </option>

          <option value="transport">
            Transport
          </option>

          <option value="technology">
            Technology
          </option>

          <option value="academic">
            Academic
          </option>

          <option value="feeding">
            Feeding
          </option>

          <option value="construction">
            Construction
          </option>

          <option value="external">
            External
          </option>

          <option value="other">
            Other
          </option>
        </select>

        <select
          style={input}
          value={methodFilter}
          onChange={(e) =>
            setMethodFilter(
              e.target.value
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

          <option value="approved">
            Approved
          </option>

          <option value="paid">
            Paid
          </option>

          <option value="cancelled">
            Cancelled
          </option>

          <option value="rejected">
            Rejected
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
          <h3 style={{ marginTop: 0 }}>
            {editingId
              ? "Edit Expense"
              : "Create Expense"}
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(240px,1fr))",

              gap: 12,
            }}
          >
            <input
              style={input}
              placeholder="Expense Title"
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
              style={input}
              type="number"
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
              value={method}
              onChange={(e) =>
                setMethod(
                  e.target.value
                )
              }
            >
              <option value="">
                Payment Method
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
              value={sourceType}
              onChange={(e) =>
                setSourceType(
                  e.target
                    .value as ExpenseSourceType
                )
              }
            >
              <option value="salary">
                Salary
              </option>

              <option value="maintenance">
                Maintenance
              </option>

              <option value="utility">
                Utility
              </option>

              <option value="transport">
                Transport
              </option>

              <option value="technology">
                Technology
              </option>

              <option value="academic">
                Academic
              </option>

              <option value="feeding">
                Feeding
              </option>

              <option value="construction">
                Construction
              </option>

              <option value="external">
                External
              </option>

              <option value="other">
                Other
              </option>
            </select>

            {/* CLASS */}
            <select
              style={input}
              value={classId || ""}
              onChange={(e) =>
                setClassId(
                  Number(
                    e.target.value
                  ) || undefined
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

            {/* SUBJECT */}
            <select
              style={input}
              value={subjectId || ""}
              onChange={(e) =>
                setSubjectId(
                  Number(
                    e.target.value
                  ) || undefined
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

            {/* VENDOR */}
            <input
              style={input}
              placeholder="Vendor"
              value={vendor}
              onChange={(e) =>
                setVendor(
                  e.target.value
                )
              }
            />

            <input
              style={input}
              placeholder="Vendor Contact"
              value={vendorContact}
              onChange={(e) =>
                setVendorContact(
                  e.target.value
                )
              }
            />

            <input
              style={input}
              placeholder="Department"
              value={department}
              onChange={(e) =>
                setDepartment(
                  e.target.value
                )
              }
            />

            <input
              style={input}
              placeholder="Project Name"
              value={projectName}
              onChange={(e) =>
                setProjectName(
                  e.target.value
                )
              }
            />

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

            <select
              style={input}
              value={status}
              onChange={(e) =>
                setStatus(
                  e.target.value as any
                )
              }
            >
              <option value="pending">
                Pending
              </option>

              <option value="approved">
                Approved
              </option>

              <option value="paid">
                Paid
              </option>

              <option value="cancelled">
                Cancelled
              </option>

              <option value="rejected">
                Rejected
              </option>

              <option value="refunded">
                Refunded
              </option>
            </select>

            {/* NOTE */}
            <textarea
              style={{
                ...input,
                minHeight: 120,
                gridColumn:
                  "1 / -1",
              }}
              placeholder="Expense notes..."
              value={note}
              onChange={(e) =>
                setNote(
                  e.target.value
                )
              }
            />

            {/* FLAGS */}
            <div
              style={{
                display: "flex",
                gap: 15,
                flexWrap: "wrap",
                gridColumn:
                  "1 / -1",
              }}
            >
              <label>
                <input
                  type="checkbox"
                  checked={
                    recurring
                  }
                  onChange={(e) =>
                    setRecurring(
                      e.target.checked
                    )
                  }
                />{" "}
                Recurring
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    reimbursable
                  }
                  onChange={(e) =>
                    setReimbursable(
                      e.target.checked
                    )
                  }
                />{" "}
                Reimbursable
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    refunded
                  }
                  onChange={(e) =>
                    setRefunded(
                      e.target.checked
                    )
                  }
                />{" "}
                Refunded
              </label>
            </div>

            {/* ACTIONS */}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 10,
                gridColumn:
                  "1 / -1",
              }}
            >
              <button
                style={primaryBtn}
                onClick={save}
              >
                {editingId
                  ? "Update Expense"
                  : "Save Expense"}
              </button>

              <button
                style={outlineBtn}
                onClick={reset}
              >
                Cancel
              </button>
            </div>
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
            No expense records found
          </div>
        )}

        {filtered.map((item) => (
          <div
            key={item.id}
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
                    fontSize: 16,
                  }}
                >
                  {item.title}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.7,
                    marginTop: 4,
                  }}
                >
                  {getSourceLabel(
                    item
                  )}{" "}
                  •{" "}
                  {item.method ||
                    "N/A"}{" "}
                  • {item.date}
                </div>

                {item.department && (
                  <div
                    style={{
                      fontSize: 13,
                      marginTop: 5,
                    }}
                  >
                    Department:{" "}
                    {
                      item.department
                    }
                  </div>
                )}

                {item.vendor && (
                  <div
                    style={{
                      fontSize: 13,
                      marginTop: 5,
                    }}
                  >
                    Vendor:{" "}
                    {item.vendor}
                  </div>
                )}

                {item.projectName && (
                  <div
                    style={{
                      fontSize: 13,
                      marginTop: 5,
                    }}
                  >
                    Project:{" "}
                    {
                      item.projectName
                    }
                  </div>
                )}

                {item.note && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      opacity: 0.75,
                    }}
                  >
                    {item.note}
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
                    fontWeight: 700,
                    fontSize: 22,
                  }}
                >
                  GHS{" "}
                  {Number(
                    item.amount
                  ).toFixed(2)}
                </div>

                <div
                  style={{
                    marginTop: 5,
                    fontSize: 12,
                    opacity: 0.7,
                  }}
                >
                  {item.status}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 10,
                    justifyContent:
                      "flex-end",
                  }}
                >
                  <button
                    style={outlineBtn}
                    onClick={() =>
                      edit(item)
                    }
                  >
                    Edit
                  </button>

                  <button
                    style={outlineBtn}
                    onClick={() =>
                      remove(
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
        ))}
      </div>
    </div>
  );
}