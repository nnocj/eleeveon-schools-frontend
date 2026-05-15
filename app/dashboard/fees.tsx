"use client";

/**
 * fees.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL FEES MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB-safe rewrite for current db.ts.
 *
 * ACTUAL FINANCE MODELS
 * ---------------------------------------------------------
 * FeeStructure:
 * - branchId
 * - classId?
 * - academicStructureId
 * - academicPeriodId
 * - items: { name: string; amount: number }[]
 *
 * Payment:
 * - branchId
 * - studentId
 * - amount
 * - method
 * - date
 * - receiptNumber?
 * - note?
 *
 * IMPORTANT ARCHITECTURE
 * ---------------------------------------------------------
 * Active School -> Active Branch -> Academic Structure -> Academic Period -> Class -> Student Fees
 *
 * Fee payable is resolved from FeeStructure.
 * Students are resolved from StudentEnrollment.
 * Payments are simple student-level payments in the current db.ts, so balances are computed
 * by comparing total payments against the student's applicable fee structure.
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  Class,
  FeeStructure,
  Payment,
  PaymentMethod,
  Student,
  StudentEnrollment,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type FeeItem = {
  name: string;
  amount: number;
};

type FeeStructureForm = {
  id?: number;
  classId?: number;
  academicStructureId?: number;
  academicPeriodId?: number;
  items: FeeItem[];
};

type PaymentForm = {
  id?: number;
  studentId?: number;
  amount: number;
  method: PaymentMethod;
  date: string;
  receiptNumber?: string;
  note?: string;
};

type StudentFinanceRow = {
  student: Student;
  enrollment?: StudentEnrollment;
  className: string;
  feeStructure?: FeeStructure;
  expected: number;
  paid: number;
  balance: number;
  paymentCount: number;
};

// ======================================================
// HELPERS
// ======================================================

const todayISO = () => new Date().toISOString().slice(0, 10);

const money = (value: number) => {
  return `GHS ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const feeTotal = (structure?: FeeStructure) => {
  return (structure?.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
};

// ======================================================
// COMPONENT
// ======================================================

export default function Fees() {
  const { settings } = useSettings();
  const {
    activeSchool,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const branchId = activeBranchId || settings?.branchId || 1;
  const primary = settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);

  const [academicStructureId, setAcademicStructureId] = useState<number | undefined>(
    settings?.currentAcademicStructureId
  );
  const [academicPeriodId, setAcademicPeriodId] = useState<number | undefined>(
    settings?.currentAcademicPeriodId
  );
  const [classId, setClassId] = useState<number | undefined>();
  const [search, setSearch] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "paid" | "owing" | "unpaid">("all");

  const [feeDrawerOpen, setFeeDrawerOpen] = useState(false);
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const [feeEditMode, setFeeEditMode] = useState(false);
  const [paymentEditMode, setPaymentEditMode] = useState(false);

  const [feeForm, setFeeForm] = useState<FeeStructureForm>({
    classId: undefined,
    academicStructureId: settings?.currentAcademicStructureId,
    academicPeriodId: settings?.currentAcademicPeriodId,
    items: [{ name: "Tuition", amount: 0 }],
  });

  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    studentId: undefined,
    amount: 0,
    method: "cash",
    date: todayISO(),
    receiptNumber: "",
    note: "",
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [
        feeRows,
        paymentRows,
        studentRows,
        classRows,
        structureRows,
        periodRows,
        enrollmentRows,
      ] = await Promise.all([
        db.feeStructures.toArray(),
        db.payments.toArray(),
        db.students.toArray(),
        db.classes.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.studentEnrollments.toArray(),
      ]);

      setFeeStructures(feeRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setPayments(paymentRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setStudents(
        studentRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.status !== "withdrawn"
        )
      );
      setClasses(classRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false));
      setAcademicStructures(
        structureRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );
      setAcademicPeriods(
        periodRows
          .filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
      setEnrollments(enrollmentRows.filter(row => row.branchId === branchId && !row.isDeleted));
    } catch (error) {
      console.error("Failed to load fees:", error);
      alert("Failed to load fees");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const classMap = useMemo(() => new Map(classes.map(row => [row.id, row])), [classes]);
  const studentMap = useMemo(() => new Map(students.map(row => [row.id, row])), [students]);

  const filteredPeriods = useMemo(() => {
    if (!academicStructureId) return academicPeriods;
    return academicPeriods.filter(row => row.academicStructureId === academicStructureId);
  }, [academicPeriods, academicStructureId]);

  const availableClassIds = useMemo(() => {
    const ids = new Set<number>();

    enrollments.forEach(row => {
      if (row.status !== "active") return;
      if (academicStructureId && row.academicStructureId !== academicStructureId) return;
      if (academicPeriodId && row.academicPeriodId !== academicPeriodId) return;
      ids.add(row.classId);
    });

    feeStructures.forEach(row => {
      if (academicStructureId && row.academicStructureId !== academicStructureId) return;
      if (academicPeriodId && row.academicPeriodId !== academicPeriodId) return;
      if (row.classId) ids.add(row.classId);
    });

    return ids;
  }, [enrollments, feeStructures, academicStructureId, academicPeriodId]);

  const availableClasses = useMemo(() => {
    if (!academicStructureId && !academicPeriodId) return classes;
    return classes.filter(row => row.id && availableClassIds.has(row.id));
  }, [classes, availableClassIds, academicStructureId, academicPeriodId]);

  const filteredFeeStructures = useMemo(() => {
    return feeStructures
      .filter(row => {
        if (academicStructureId && row.academicStructureId !== academicStructureId) return false;
        if (academicPeriodId && row.academicPeriodId !== academicPeriodId) return false;
        if (classId && row.classId !== classId) return false;
        return true;
      })
      .sort((a, b) => {
        const classA = a.classId ? classMap.get(a.classId)?.name || "" : "All Classes";
        const classB = b.classId ? classMap.get(b.classId)?.name || "" : "All Classes";
        return classA.localeCompare(classB);
      });
  }, [feeStructures, academicStructureId, academicPeriodId, classId, classMap]);

  const feeStructureForClass = useMemo(() => {
    const map = new Map<string, FeeStructure>();

    feeStructures.forEach(row => {
      const key = `${row.academicStructureId}:${row.academicPeriodId}:${row.classId || "all"}`;
      map.set(key, row);
    });

    return map;
  }, [feeStructures]);

  const paymentsByStudent = useMemo(() => {
    const map = new Map<number, Payment[]>();

    payments.forEach(row => {
      const list = map.get(row.studentId) || [];
      list.push(row);
      map.set(row.studentId, list);
    });

    return map;
  }, [payments]);

  // ======================================================
  // STUDENT FINANCE ROWS
  // ======================================================

  const financeRows = useMemo<StudentFinanceRow[]>(() => {
    if (!academicStructureId || !academicPeriodId) return [];

    return enrollments
      .filter(row => {
        if (row.status !== "active") return false;
        if (row.academicStructureId !== academicStructureId) return false;
        if (row.academicPeriodId !== academicPeriodId) return false;
        if (classId && row.classId !== classId) return false;
        return true;
      })
      .map(enrollment => {
        const student = studentMap.get(enrollment.studentId);
        if (!student) return undefined;

        const classSpecificKey = `${academicStructureId}:${academicPeriodId}:${enrollment.classId}`;
        const generalKey = `${academicStructureId}:${academicPeriodId}:all`;
        const feeStructure = feeStructureForClass.get(classSpecificKey) || feeStructureForClass.get(generalKey);
        const expected = feeTotal(feeStructure);
        const studentPayments = paymentsByStudent.get(student.id || 0) || [];
        const paid = studentPayments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const balance = Math.max(0, expected - paid);

        return {
          student,
          enrollment,
          className: classMap.get(enrollment.classId)?.name || "Unknown Class",
          feeStructure,
          expected,
          paid,
          balance,
          paymentCount: studentPayments.length,
        };
      })
      .filter(Boolean) as StudentFinanceRow[];
  }, [
    enrollments,
    academicStructureId,
    academicPeriodId,
    classId,
    studentMap,
    classMap,
    feeStructureForClass,
    paymentsByStudent,
  ]);

  const filteredFinanceRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return financeRows
      .filter(row => {
        if (balanceFilter === "paid" && row.balance > 0) return false;
        if (balanceFilter === "owing" && row.balance <= 0) return false;
        if (balanceFilter === "unpaid" && row.paid > 0) return false;

        if (!query) return true;

        return `${row.student.fullName} ${row.student.admissionNumber || ""} ${row.className}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => b.balance - a.balance || a.student.fullName.localeCompare(b.student.fullName));
  }, [financeRows, search, balanceFilter]);

  const selectedStudentPayments = useMemo(() => {
    if (!paymentForm.studentId) return [];
    return paymentsByStudent.get(paymentForm.studentId) || [];
  }, [paymentsByStudent, paymentForm.studentId]);

  // ======================================================
  // SUMMARY
  // ======================================================

  const summary = useMemo(() => {
    const expected = financeRows.reduce((sum, row) => sum + row.expected, 0);
    const paid = financeRows.reduce((sum, row) => sum + row.paid, 0);
    const balance = financeRows.reduce((sum, row) => sum + row.balance, 0);
    const owing = financeRows.filter(row => row.balance > 0).length;
    const paidStudents = financeRows.filter(row => row.expected > 0 && row.balance <= 0).length;

    return {
      students: financeRows.length,
      structures: filteredFeeStructures.length,
      expected,
      paid,
      balance,
      owing,
      paidStudents,
    };
  }, [financeRows, filteredFeeStructures]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const openCreateFee = () => {
    setFeeEditMode(false);
    setFeeForm({
      classId,
      academicStructureId,
      academicPeriodId,
      items: [{ name: "Tuition", amount: 0 }],
    });
    setFeeDrawerOpen(true);
  };

  const openEditFee = (row: FeeStructure) => {
    setFeeEditMode(true);
    setFeeForm({
      id: row.id,
      classId: row.classId,
      academicStructureId: row.academicStructureId,
      academicPeriodId: row.academicPeriodId,
      items: row.items?.length ? row.items.map(item => ({ ...item })) : [{ name: "Tuition", amount: 0 }],
    });
    setFeeDrawerOpen(true);
  };

  const openCreatePayment = (studentId?: number) => {
    setPaymentEditMode(false);
    setPaymentForm({
      studentId,
      amount: 0,
      method: "cash",
      date: todayISO(),
      receiptNumber: "",
      note: "",
    });
    setPaymentDrawerOpen(true);
  };

  const openEditPayment = (row: Payment) => {
    setPaymentEditMode(true);
    setPaymentForm({
      id: row.id,
      studentId: row.studentId,
      amount: row.amount,
      method: row.method,
      date: row.date,
      receiptNumber: row.receiptNumber || "",
      note: row.note || "",
    });
    setPaymentDrawerOpen(true);
  };

  const updateFeeItem = (index: number, patch: Partial<FeeItem>) => {
    setFeeForm(prev => ({
      ...prev,
      items: prev.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }));
  };

  const addFeeItem = () => {
    setFeeForm(prev => ({
      ...prev,
      items: [...prev.items, { name: "", amount: 0 }],
    }));
  };

  const removeFeeItem = (index: number) => {
    setFeeForm(prev => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validateFee = () => {
    if (!feeForm.academicStructureId) return "Select academic structure";
    if (!feeForm.academicPeriodId) return "Select academic period";
    if (!feeForm.items.length) return "Add at least one fee item";

    for (const item of feeForm.items) {
      if (!item.name.trim()) return "Every fee item needs a name";
      if (Number(item.amount) < 0) return "Fee amount cannot be negative";
    }

    const duplicate = feeStructures.find(row => {
      if (feeEditMode && row.id === feeForm.id) return false;
      return (
        row.academicStructureId === Number(feeForm.academicStructureId) &&
        row.academicPeriodId === Number(feeForm.academicPeriodId) &&
        (row.classId || 0) === (feeForm.classId || 0)
      );
    });

    if (duplicate) {
      return "A fee structure already exists for this class/period. Edit it instead.";
    }

    return null;
  };

  const saveFeeStructure = async () => {
    const error = validateFee();
    if (error) return alert(error);

    try {
      setSaving(true);

      const payload = prepareSyncData({
        branchId,
        classId: feeForm.classId || undefined,
        academicStructureId: Number(feeForm.academicStructureId),
        academicPeriodId: Number(feeForm.academicPeriodId),
        items: feeForm.items.map(item => ({
          name: item.name.trim(),
          amount: Number(item.amount || 0),
        })),
      }) as FeeStructure;

      if (feeEditMode && feeForm.id) {
        await db.feeStructures.update(feeForm.id, {
          classId: payload.classId,
          academicStructureId: payload.academicStructureId,
          academicPeriodId: payload.academicPeriodId,
          items: payload.items,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        await db.feeStructures.add(payload);
      }

      setFeeDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save fee structure:", error);
      alert("Failed to save fee structure");
    } finally {
      setSaving(false);
    }
  };

  const validatePayment = () => {
    if (!paymentForm.studentId) return "Select student";
    if (Number(paymentForm.amount) <= 0) return "Payment amount must be greater than zero";
    if (!paymentForm.method) return "Select payment method";
    if (!paymentForm.date) return "Select payment date";
    return null;
  };

  const savePayment = async () => {
    const error = validatePayment();
    if (error) return alert(error);

    try {
      setSaving(true);

      const payload = prepareSyncData({
        branchId,
        studentId: Number(paymentForm.studentId),
        amount: Number(paymentForm.amount),
        method: paymentForm.method,
        date: paymentForm.date,
        receiptNumber: paymentForm.receiptNumber?.trim() || undefined,
        note: paymentForm.note?.trim() || undefined,
      }) as Payment;

      if (paymentEditMode && paymentForm.id) {
        await db.payments.update(paymentForm.id, {
          studentId: payload.studentId,
          amount: payload.amount,
          method: payload.method,
          date: payload.date,
          receiptNumber: payload.receiptNumber,
          note: payload.note,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        await db.payments.add(payload);
      }

      setPaymentDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save payment:", error);
      alert("Failed to save payment");
    } finally {
      setSaving(false);
    }
  };

  const deleteFeeStructure = async (row: FeeStructure) => {
    if (!row.id) return;
    if (!confirm("Delete this fee structure?")) return;

    await db.feeStructures.update(row.id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const deletePayment = async (row: Payment) => {
    if (!row.id) return;
    if (!confirm("Delete this payment record?")) return;

    await db.payments.update(row.id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  // ======================================================
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 650,
  };

  const label: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 12,
    opacity: 0.72,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  const button: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
  };

  const ghostButton: React.CSSProperties = {
    padding: "10px 13px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 750,
    cursor: "pointer",
  };

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange" | "purple"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
      purple: { bg: "rgba(147,51,234,0.12)", color: "#7e22ce" },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 9px",
      borderRadius: 999,
      background: tones.bg,
      color: tones.color,
      fontSize: 11,
      fontWeight: 850,
    };
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading fees...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Fees belong to a branch. Select a school and branch first.
          </p>
        </div>
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Fees</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing school fees in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={openCreateFee} style={ghostButton}>
            + Fee Structure
          </button>
          <button type="button" onClick={() => openCreatePayment()} style={button}>
            + Record Payment
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div
        style={{
          ...card,
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 12,
        }}
      >
        <select
          value={academicStructureId || ""}
          onChange={e => {
            setAcademicStructureId(Number(e.target.value) || undefined);
            setAcademicPeriodId(undefined);
            setClassId(undefined);
          }}
          style={input}
        >
          <option value="">Select Academic Structure</option>
          {academicStructures.map(row => (
            <option key={row.id} value={row.id}>
              {row.name} • {row.level}
            </option>
          ))}
        </select>

        <select
          value={academicPeriodId || ""}
          onChange={e => {
            setAcademicPeriodId(Number(e.target.value) || undefined);
            setClassId(undefined);
          }}
          style={input}
        >
          <option value="">Select Academic Period</option>
          {filteredPeriods.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={classId || ""}
          onChange={e => setClassId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Classes</option>
          {availableClasses.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={balanceFilter}
          onChange={e => setBalanceFilter(e.target.value as typeof balanceFilter)}
          style={input}
        >
          <option value="all">All Balances</option>
          <option value="paid">Fully Paid</option>
          <option value="owing">Owing</option>
          <option value="unpaid">No Payment</option>
        </select>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search student, admission number, class..."
          style={input}
        />
      </div>

      {/* SUMMARY */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Students</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{summary.students}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Expected</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>{money(summary.expected)}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Paid</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>{money(summary.paid)}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Balance</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>{money(summary.balance)}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Owing</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{summary.owing}</div>
        </div>
      </div>

      {/* FEE STRUCTURES */}
      <section style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Fee Structures</h3>
          <span style={badge("gray")}>{filteredFeeStructures.length} structure(s)</span>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {filteredFeeStructures.map(row => {
            const className = row.classId ? classMap.get(row.classId)?.name || "Unknown Class" : "All Classes";
            const total = feeTotal(row);

            return (
              <div key={row.id} style={card}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <strong style={{ fontSize: 17 }}>{className}</strong>
                      <span style={badge(row.classId ? "blue" : "purple")}>{row.classId ? "Class Specific" : "General"}</span>
                      <span style={badge("green")}>{money(total)}</span>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(row.items || []).map((item, index) => (
                        <span key={`${item.name}-${index}`} style={badge("gray")}>
                          {item.name}: {money(item.amount)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button style={ghostButton} onClick={() => openEditFee(row)}>Edit</button>
                    <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => deleteFeeStructure(row)}>Delete</button>
                  </div>
                </div>
              </div>
            );
          })}

          {!filteredFeeStructures.length && (
            <div style={{ ...card, textAlign: "center", padding: 28 }}>
              No fee structures found for the selected filters.
            </div>
          )}
        </div>
      </section>

      {/* STUDENT BALANCES */}
      <section style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Student Balances</h3>
          <span style={badge("gray")}>{filteredFinanceRows.length} student(s)</span>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {filteredFinanceRows.map(row => (
            <div key={row.student.id} style={card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 16,
                      background: row.student.photo
                        ? `url(${row.student.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 950,
                      flex: "0 0 46px",
                    }}
                  >
                    {!row.student.photo && row.student.fullName.slice(0, 1).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 900 }}>{row.student.fullName}</div>
                    <div style={{ marginTop: 4, display: "flex", gap: 7, flexWrap: "wrap" }}>
                      <span style={badge("gray")}>{row.student.admissionNumber || "No admission no."}</span>
                      <span style={badge("blue")}>{row.className}</span>
                      <span style={badge(row.feeStructure ? "green" : "orange")}>
                        {row.feeStructure ? "Fee assigned" : "No fee structure"}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span style={badge("blue")}>Expected: {money(row.expected)}</span>
                  <span style={badge("green")}>Paid: {money(row.paid)}</span>
                  <span style={badge(row.balance > 0 ? "red" : "green")}>Balance: {money(row.balance)}</span>
                  <button style={button} onClick={() => openCreatePayment(row.student.id)}>Pay</button>
                </div>
              </div>
            </div>
          ))}

          {!filteredFinanceRows.length && (
            <div style={{ ...card, textAlign: "center", padding: 28 }}>
              Select academic structure and period to load student balances.
            </div>
          )}
        </div>
      </section>

      {/* FEE STRUCTURE DRAWER */}
      {feeDrawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            justifyContent: "flex-end",
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setFeeDrawerOpen(false)}
        >
          <div
            style={{
              width: "min(620px, 100vw)",
              height: "100vh",
              background: "var(--surface)",
              color: "var(--text)",
              boxShadow: "-20px 0 50px rgba(0,0,0,0.25)",
              padding: 22,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                  {feeEditMode ? "Edit Fee Structure" : "Create Fee Structure"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Define payable fee items for a class or all classes.
                </div>
              </div>
              <button style={ghostButton} onClick={() => setFeeDrawerOpen(false)}>Close</button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Academic Structure</label>
                <select
                  value={feeForm.academicStructureId || ""}
                  onChange={e => setFeeForm(prev => ({ ...prev, academicStructureId: Number(e.target.value) || undefined, academicPeriodId: undefined }))}
                  style={input}
                >
                  <option value="">Select Academic Structure</option>
                  {academicStructures.map(row => <option key={row.id} value={row.id}>{row.name} • {row.level}</option>)}
                </select>
              </div>

              <div>
                <label style={label}>Academic Period</label>
                <select
                  value={feeForm.academicPeriodId || ""}
                  onChange={e => setFeeForm(prev => ({ ...prev, academicPeriodId: Number(e.target.value) || undefined }))}
                  style={input}
                >
                  <option value="">Select Academic Period</option>
                  {academicPeriods
                    .filter(row => !feeForm.academicStructureId || row.academicStructureId === feeForm.academicStructureId)
                    .map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </div>

              <div>
                <label style={label}>Class</label>
                <select
                  value={feeForm.classId || ""}
                  onChange={e => setFeeForm(prev => ({ ...prev, classId: Number(e.target.value) || undefined }))}
                  style={input}
                >
                  <option value="">All Classes</option>
                  {classes.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </div>

              <div style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12 }}>
                  <strong>Fee Items</strong>
                  <button type="button" style={ghostButton} onClick={addFeeItem}>+ Add Item</button>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {feeForm.items.map((item, index) => (
                    <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 150px auto", gap: 8 }}>
                      <input
                        value={item.name}
                        onChange={e => updateFeeItem(index, { name: e.target.value })}
                        placeholder="Item name"
                        style={input}
                      />
                      <input
                        type="number"
                        value={item.amount}
                        onChange={e => updateFeeItem(index, { amount: Number(e.target.value) })}
                        placeholder="Amount"
                        style={input}
                      />
                      <button type="button" style={{ ...ghostButton, color: "#dc2626" }} onClick={() => removeFeeItem(index)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12, fontWeight: 900 }}>
                  Total: {money(feeForm.items.reduce((sum, item) => sum + Number(item.amount || 0), 0))}
                </div>
              </div>

              <button onClick={saveFeeStructure} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : feeEditMode ? "Save Changes" : "Create Fee Structure"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT DRAWER */}
      {paymentDrawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            justifyContent: "flex-end",
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setPaymentDrawerOpen(false)}
        >
          <div
            style={{
              width: "min(620px, 100vw)",
              height: "100vh",
              background: "var(--surface)",
              color: "var(--text)",
              boxShadow: "-20px 0 50px rgba(0,0,0,0.25)",
              padding: 22,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                  {paymentEditMode ? "Edit Payment" : "Record Payment"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Payments are recorded directly against the student in the current DB model.
                </div>
              </div>
              <button style={ghostButton} onClick={() => setPaymentDrawerOpen(false)}>Close</button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Student</label>
                <select
                  value={paymentForm.studentId || ""}
                  onChange={e => setPaymentForm(prev => ({ ...prev, studentId: Number(e.target.value) || undefined }))}
                  style={input}
                >
                  <option value="">Select Student</option>
                  {students.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.fullName} {row.admissionNumber ? `• ${row.admissionNumber}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Amount</label>
                <input
                  type="number"
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Payment Method</label>
                <select
                  value={paymentForm.method}
                  onChange={e => setPaymentForm(prev => ({ ...prev, method: e.target.value as PaymentMethod }))}
                  style={input}
                >
                  <option value="cash">Cash</option>
                  <option value="momo">MoMo</option>
                  <option value="bank">Bank</option>
                  <option value="card">Card</option>
                </select>
              </div>

              <div>
                <label style={label}>Date</label>
                <input
                  type="date"
                  value={paymentForm.date}
                  onChange={e => setPaymentForm(prev => ({ ...prev, date: e.target.value }))}
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Receipt Number</label>
                <input
                  value={paymentForm.receiptNumber || ""}
                  onChange={e => setPaymentForm(prev => ({ ...prev, receiptNumber: e.target.value }))}
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Note</label>
                <textarea
                  value={paymentForm.note || ""}
                  onChange={e => setPaymentForm(prev => ({ ...prev, note: e.target.value }))}
                  rows={3}
                  style={{ ...input, resize: "vertical" }}
                />
              </div>

              {!!selectedStudentPayments.length && (
                <div style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <strong>Previous Payments</strong>
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {selectedStudentPayments.map(row => (
                      <div key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <span>{row.date} • {row.method}</span>
                        <strong>{money(row.amount)}</strong>
                        <button style={ghostButton} onClick={() => openEditPayment(row)}>Edit</button>
                        <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => deletePayment(row)}>Delete</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={savePayment} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : paymentEditMode ? "Save Changes" : "Record Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
