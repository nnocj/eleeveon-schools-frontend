"use client";

/**
 * fees.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE FEES MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB tables:
 * - feeStructures
 * - payments
 * - students
 * - classes
 * - academicStructures
 * - academicPeriods
 * - studentEnrollments
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Mobile-first student finance cards.
 * - Responsive fee/payment drawers.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

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

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

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

const paymentMethodLabel = (method?: PaymentMethod) => {
  if (!method) return "Unspecified";
  if (method === "momo") return "MoMo";
  return method.charAt(0).toUpperCase() + method.slice(1);
};

const feeFormDefaults = (academicStructureId?: number, academicPeriodId?: number, classId?: number): FeeStructureForm => ({
  classId,
  academicStructureId,
  academicPeriodId,
  items: [{ name: "Tuition", amount: 0 }],
});

const paymentFormDefaults = (studentId?: number): PaymentForm => ({
  studentId,
  amount: 0,
  method: "cash",
  date: todayISO(),
  receiptNumber: "",
  note: "",
});

// ======================================================
// COMPONENT
// ======================================================

export default function Fees() {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

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

  const [feeForm, setFeeForm] = useState<FeeStructureForm>(
    feeFormDefaults(settings?.currentAcademicStructureId, settings?.currentAcademicPeriodId)
  );
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(paymentFormDefaults());

  // ======================================================
  // AUTH + CONTEXT PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/account");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
    router,
  ]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const clearData = () => {
    setFeeStructures([]);
    setPayments([]);
    setStudents([]);
    setClasses([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setEnrollments([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

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

      setFeeStructures(feeRows.filter(sameTenant));
      setPayments(paymentRows.filter(sameTenant));

      setStudents(
        studentRows
          .filter((row) => sameTenant(row) && row.status !== "withdrawn")
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );

      setClasses(
        classRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setAcademicStructures(
        structureRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setAcademicPeriods(
        periodRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );

      setEnrollments(enrollmentRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load fees:", error);
      clearData();
      alert("Failed to load fees");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);
  const studentMap = useMemo(() => new Map(students.map((row) => [row.id, row])), [students]);

  const filteredPeriods = useMemo(() => {
    if (!academicStructureId) return academicPeriods;
    return academicPeriods.filter((row) => row.academicStructureId === academicStructureId);
  }, [academicPeriods, academicStructureId]);

  const availableClassIds = useMemo(() => {
    const ids = new Set<number>();

    enrollments.forEach((row) => {
      if (row.status !== "active") return;
      if (academicStructureId && row.academicStructureId !== academicStructureId) return;
      if (academicPeriodId && row.academicPeriodId !== academicPeriodId) return;
      ids.add(row.classId);
    });

    feeStructures.forEach((row) => {
      if (academicStructureId && row.academicStructureId !== academicStructureId) return;
      if (academicPeriodId && row.academicPeriodId !== academicPeriodId) return;
      if (row.classId) ids.add(row.classId);
    });

    return ids;
  }, [enrollments, feeStructures, academicStructureId, academicPeriodId]);

  const availableClasses = useMemo(() => {
    if (!academicStructureId && !academicPeriodId) return classes;
    return classes.filter((row) => row.id && availableClassIds.has(row.id));
  }, [classes, availableClassIds, academicStructureId, academicPeriodId]);

  const filteredFeeStructures = useMemo(() => {
    return feeStructures
      .filter((row) => {
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

    feeStructures.forEach((row) => {
      const key = `${row.academicStructureId}:${row.academicPeriodId}:${row.classId || "all"}`;
      map.set(key, row);
    });

    return map;
  }, [feeStructures]);

  const paymentsByStudent = useMemo(() => {
    const map = new Map<number, Payment[]>();

    payments.forEach((row) => {
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
      .filter((row) => {
        if (row.status !== "active") return false;
        if (row.academicStructureId !== academicStructureId) return false;
        if (row.academicPeriodId !== academicPeriodId) return false;
        if (classId && row.classId !== classId) return false;
        return true;
      })
      .map((enrollment) => {
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
      .filter((row) => {
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
    const owing = financeRows.filter((row) => row.balance > 0).length;
    const paidStudents = financeRows.filter((row) => row.expected > 0 && row.balance <= 0).length;

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

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a school branch first.");
      return false;
    }

    return true;
  };

  const openCreateFee = () => {
    if (!requireTenant()) return;

    setFeeEditMode(false);
    setFeeForm(feeFormDefaults(academicStructureId, academicPeriodId, classId));
    setFeeDrawerOpen(true);
  };

  const openEditFee = (row: FeeStructure) => {
    setFeeEditMode(true);
    setFeeForm({
      id: row.id,
      classId: row.classId,
      academicStructureId: row.academicStructureId,
      academicPeriodId: row.academicPeriodId,
      items: row.items?.length ? row.items.map((item) => ({ ...item })) : [{ name: "Tuition", amount: 0 }],
    });
    setFeeDrawerOpen(true);
  };

  const openCreatePayment = (studentId?: number) => {
    if (!requireTenant()) return;

    setPaymentEditMode(false);
    setPaymentForm(paymentFormDefaults(studentId));
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
    setFeeForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }));
  };

  const addFeeItem = () => {
    setFeeForm((prev) => ({
      ...prev,
      items: [...prev.items, { name: "", amount: 0 }],
    }));
  };

  const removeFeeItem = (index: number) => {
    setFeeForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validateFee = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId || !branchId) return "Select a branch first";
    if (!feeForm.academicStructureId) return "Select academic structure";
    if (!feeForm.academicPeriodId) return "Select academic period";
    if (!feeForm.items.length) return "Add at least one fee item";

    for (const item of feeForm.items) {
      if (!item.name.trim()) return "Every fee item needs a name";
      if (Number(item.amount) < 0) return "Fee amount cannot be negative";
    }

    const duplicate = feeStructures.find((row) => {
      if (feeEditMode && row.id === feeForm.id) return false;
      return (
        row.academicStructureId === Number(feeForm.academicStructureId) &&
        row.academicPeriodId === Number(feeForm.academicPeriodId) &&
        (row.classId || 0) === (feeForm.classId || 0)
      );
    });

    if (duplicate) return "A fee structure already exists for this class/period. Edit it instead.";
    return null;
  };

  const saveFeeStructure = async () => {
    const error = validateFee();
    if (error) return alert(error);

    try {
      setSaving(true);

      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        classId: feeForm.classId || undefined,
        academicStructureId: Number(feeForm.academicStructureId),
        academicPeriodId: Number(feeForm.academicPeriodId),
        items: feeForm.items.map((item) => ({
          name: item.name.trim(),
          amount: Number(item.amount || 0),
        })),
      }) as FeeStructure;

      if (feeEditMode && feeForm.id) {
        await db.feeStructures.update(feeForm.id, {
          ...payload,
          id: feeForm.id,
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
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId || !branchId) return "Select a branch first";
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
        accountId,
        schoolId,
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
          ...payload,
          id: paymentForm.id,
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
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="fee-page" style={{ "--fee-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="fee-state-card">
          <div className="fee-spinner" />
          <h2>Opening fees...</h2>
          <p>Checking account, branch, classes, periods, fee structures, students, and payments.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="fee-page" style={{ "--fee-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="fee-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing fees.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="fee-page" style={{ "--fee-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="fee-state-card">
          <h2>Select a branch first</h2>
          <p>Fees belong to one active school branch.</p>
          <button type="button" className="fee-primary-btn" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="fee-page" style={{ "--fee-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="fee-hero">
        <div className="fee-hero-left">
          <div className="fee-hero-icon">💳</div>
          <div className="fee-title-wrap">
            <p>Finance Inflow</p>
            <h2>Fees</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <div className="fee-hero-actions">
          <button type="button" className="fee-ghost-btn" onClick={openCreateFee}>+ Fee Structure</button>
          <button type="button" className="fee-primary-btn" onClick={() => openCreatePayment()}>+ Record Payment</button>
        </div>
      </section>

      <section className="fee-filter-card">
        <select value={academicStructureId || ""} onChange={(event) => {
          setAcademicStructureId(Number(event.target.value) || undefined);
          setAcademicPeriodId(undefined);
          setClassId(undefined);
        }}>
          <option value="">Select Academic Structure</option>
          {academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} • {row.level}</option>)}
        </select>

        <select value={academicPeriodId || ""} onChange={(event) => {
          setAcademicPeriodId(Number(event.target.value) || undefined);
          setClassId(undefined);
        }}>
          <option value="">Select Academic Period</option>
          {filteredPeriods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={classId || ""} onChange={(event) => setClassId(Number(event.target.value) || undefined)}>
          <option value="">All Classes</option>
          {availableClasses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={balanceFilter} onChange={(event) => setBalanceFilter(event.target.value as typeof balanceFilter)}>
          <option value="all">All Balances</option>
          <option value="paid">Fully Paid</option>
          <option value="owing">Owing</option>
          <option value="unpaid">No Payment</option>
        </select>

        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, admission number, class..." />
      </section>

      <section className="fee-summary-grid" aria-label="Fees summary">
        <SummaryCard label="Students" value={summary.students} icon="🎓" />
        <SummaryCard label="Expected" value={money(summary.expected)} icon="📌" />
        <SummaryCard label="Paid" value={money(summary.paid)} icon="✅" positive />
        <SummaryCard label="Balance" value={money(summary.balance)} icon="⚠️" danger />
        <SummaryCard label="Owing" value={summary.owing} icon="📍" danger />
      </section>

      <section className="fee-section">
        <div className="fee-section-head">
          <h3>Fee Structures</h3>
          <Chip tone="gray">{filteredFeeStructures.length} structure(s)</Chip>
        </div>

        <div className="fee-list">
          {filteredFeeStructures.map((row) => {
            const className = row.classId ? classMap.get(row.classId)?.name || "Unknown Class" : "All Classes";
            const total = feeTotal(row);

            return (
              <article key={row.id} className="fee-entity-card">
                <div className="fee-structure-head">
                  <div>
                    <h3>{className}</h3>
                    <div className="fee-chip-row">
                      <Chip tone={row.classId ? "blue" : "purple"}>{row.classId ? "Class Specific" : "General"}</Chip>
                      <Chip tone="green">{money(total)}</Chip>
                    </div>
                  </div>

                  <div className="fee-action-row compact">
                    <button type="button" onClick={() => openEditFee(row)}>Edit</button>
                    <button type="button" className="danger" onClick={() => deleteFeeStructure(row)}>Delete</button>
                  </div>
                </div>

                <div className="fee-items-grid">
                  {(row.items || []).map((item, index) => (
                    <MiniStat key={`${item.name}-${index}`} label={item.name} value={money(item.amount)} />
                  ))}
                </div>
              </article>
            );
          })}

          {!filteredFeeStructures.length && <EmptyCard text="No fee structures found for the selected filters." />}
        </div>
      </section>

      <section className="fee-section">
        <div className="fee-section-head">
          <h3>Student Balances</h3>
          <Chip tone="gray">{filteredFinanceRows.length} student(s)</Chip>
        </div>

        <div className="fee-list">
          {filteredFinanceRows.map((row) => (
            <article key={row.student.id} className="fee-entity-card">
              <div className="fee-card-top">
                <Avatar student={row.student} primary={primary} />

                <div className="fee-card-main">
                  <h3>{row.student.fullName}</h3>
                  <p>{row.student.admissionNumber || "No admission no."} · {row.className}</p>

                  <div className="fee-chip-row">
                    <Chip tone={row.feeStructure ? "green" : "orange"}>{row.feeStructure ? "Fee assigned" : "No fee structure"}</Chip>
                    <Chip tone="gray">{row.paymentCount} payment(s)</Chip>
                  </div>
                </div>
              </div>

              <div className="fee-balance-grid">
                <MiniStat label="Expected" value={money(row.expected)} />
                <MiniStat label="Paid" value={money(row.paid)} />
                <MiniStat label="Balance" value={money(row.balance)} danger={row.balance > 0} />
              </div>

              <div className="fee-action-row">
                <button type="button" className="primary" onClick={() => openCreatePayment(row.student.id)}>Pay</button>
              </div>
            </article>
          ))}

          {!filteredFinanceRows.length && <EmptyCard text="Select academic structure and period to load student balances." />}
        </div>
      </section>

      {feeDrawerOpen && (
        <Drawer title={feeEditMode ? "Edit Fee Structure" : "Create Fee Structure"} subtitle="Define payable fee items for a class or all classes." onClose={() => setFeeDrawerOpen(false)}>
          <div className="fee-form-grid">
            <Field label="Academic Structure">
              <select value={feeForm.academicStructureId || ""} onChange={(event) => setFeeForm((prev) => ({ ...prev, academicStructureId: Number(event.target.value) || undefined, academicPeriodId: undefined }))}>
                <option value="">Select Academic Structure</option>
                {academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} • {row.level}</option>)}
              </select>
            </Field>

            <Field label="Academic Period">
              <select value={feeForm.academicPeriodId || ""} onChange={(event) => setFeeForm((prev) => ({ ...prev, academicPeriodId: Number(event.target.value) || undefined }))}>
                <option value="">Select Academic Period</option>
                {academicPeriods
                  .filter((row) => !feeForm.academicStructureId || row.academicStructureId === feeForm.academicStructureId)
                  .map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </Field>

            <Field label="Class">
              <select value={feeForm.classId || ""} onChange={(event) => setFeeForm((prev) => ({ ...prev, classId: Number(event.target.value) || undefined }))}>
                <option value="">All Classes</option>
                {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </Field>

            <section className="fee-form-card">
              <div className="fee-form-card-head">
                <strong>Fee Items</strong>
                <button type="button" onClick={addFeeItem}>+ Add Item</button>
              </div>

              <div className="fee-item-list">
                {feeForm.items.map((item, index) => (
                  <div key={index} className="fee-item-row">
                    <input value={item.name} onChange={(event) => updateFeeItem(index, { name: event.target.value })} placeholder="Item name" />
                    <input type="number" value={item.amount} onChange={(event) => updateFeeItem(index, { amount: Number(event.target.value) })} placeholder="Amount" />
                    <button type="button" className="danger" onClick={() => removeFeeItem(index)}>Remove</button>
                  </div>
                ))}
              </div>

              <div className="fee-form-total">Total: {money(feeForm.items.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</div>
            </section>

            <button type="button" onClick={saveFeeStructure} disabled={saving} className="fee-save-btn">
              {saving ? "Saving..." : feeEditMode ? "Save Changes" : "Create Fee Structure"}
            </button>
          </div>
        </Drawer>
      )}

      {paymentDrawerOpen && (
        <Drawer title={paymentEditMode ? "Edit Payment" : "Record Payment"} subtitle="Payments are recorded directly against the student." onClose={() => setPaymentDrawerOpen(false)}>
          <div className="fee-form-grid">
            <Field label="Student">
              <select value={paymentForm.studentId || ""} onChange={(event) => setPaymentForm((prev) => ({ ...prev, studentId: Number(event.target.value) || undefined }))}>
                <option value="">Select Student</option>
                {students.map((row) => <option key={row.id} value={row.id}>{row.fullName} {row.admissionNumber ? `• ${row.admissionNumber}` : ""}</option>)}
              </select>
            </Field>

            <div className="fee-form-two">
              <Field label="Amount">
                <input type="number" value={paymentForm.amount} onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: Number(event.target.value) }))} />
              </Field>

              <Field label="Date">
                <input type="date" value={paymentForm.date} onChange={(event) => setPaymentForm((prev) => ({ ...prev, date: event.target.value }))} />
              </Field>
            </div>

            <Field label="Payment Method">
              <select value={paymentForm.method} onChange={(event) => setPaymentForm((prev) => ({ ...prev, method: event.target.value as PaymentMethod }))}>
                <option value="cash">Cash</option>
                <option value="momo">MoMo</option>
                <option value="bank">Bank</option>
                <option value="card">Card</option>
              </select>
            </Field>

            <Field label="Receipt Number">
              <input value={paymentForm.receiptNumber || ""} onChange={(event) => setPaymentForm((prev) => ({ ...prev, receiptNumber: event.target.value }))} />
            </Field>

            <Field label="Note">
              <textarea value={paymentForm.note || ""} onChange={(event) => setPaymentForm((prev) => ({ ...prev, note: event.target.value }))} rows={3} />
            </Field>

            {!!selectedStudentPayments.length && (
              <section className="fee-form-card">
                <strong>Previous Payments</strong>
                <div className="fee-payment-list">
                  {selectedStudentPayments.map((row) => (
                    <div key={row.id} className="fee-payment-row">
                      <span>{row.date} · {paymentMethodLabel(row.method)}</span>
                      <strong>{money(row.amount)}</strong>
                      <button type="button" onClick={() => openEditPayment(row)}>Edit</button>
                      <button type="button" className="danger" onClick={() => deletePayment(row)}>Delete</button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <button type="button" onClick={savePayment} disabled={saving} className="fee-save-btn">
              {saving ? "Saving..." : paymentEditMode ? "Save Changes" : "Record Payment"}
            </button>
          </div>
        </Drawer>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon, positive = false, danger = false }: { label: string; value: string | number; icon: string; positive?: boolean; danger?: boolean }) {
  return (
    <article className={`fee-summary-card ${positive ? "positive" : ""} ${danger ? "danger" : ""}`}>
      <div className="fee-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Avatar({ student, primary }: { student: Student; primary: string }) {
  return (
    <div className="fee-avatar" style={{ background: student.photo ? `url(${student.photo}) center/cover` : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))` }}>
      {!student.photo && student.fullName.slice(0, 1).toUpperCase()}
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`fee-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className={`fee-mini-stat ${danger ? "danger" : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="fee-empty-card">
      <div className="fee-empty-icon">💳</div>
      <h3>No fee data</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="fee-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fee-drawer-layer">
      <button type="button" className="fee-drawer-overlay" aria-label="Close drawer" onClick={onClose} />
      <aside className="fee-drawer">
        <div className="fee-drawer-head">
          <div>
            <p>Fees</p>
            <h2>{title}</h2>
            <span>{subtitle}</span>
          </div>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes feeSpin { to { transform: rotate(360deg); } }

.fee-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}
.fee-page *, .fee-page *::before, .fee-page *::after { box-sizing: border-box; }
.fee-page button, .fee-page input, .fee-page select, .fee-page textarea { font: inherit; max-width: 100%; }
.fee-page input, .fee-page select, .fee-page textarea {
  width: 100%; min-height: 43px; border: 1px solid rgba(148,163,184,.28); border-radius: 15px;
  padding: 0 12px; background: var(--surface, #fff); color: var(--text, #0f172a); outline: none; font-weight: 750;
}
.fee-page textarea { padding-top: 10px; resize: vertical; }

.fee-state-card { min-height: min(420px, calc(100dvh - 32px)); display: grid; place-items: center; align-content: center; gap: 10px; width: min(460px, 100%); margin: 0 auto; padding: 22px; border-radius: 28px; background: var(--surface, #fff); border: 1px solid rgba(148,163,184,.22); box-shadow: 0 24px 60px rgba(15,23,42,.08); text-align: center; }
.fee-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.fee-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.fee-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--fee-primary) 18%, transparent); border-top-color: var(--fee-primary); animation: feeSpin .8s linear infinite; }

.fee-primary-btn, .fee-save-btn { min-height: 46px; border: 0; border-radius: 999px; padding: 0 18px; background: var(--fee-primary); color: #fff; font-weight: 950; cursor: pointer; }
.fee-ghost-btn { min-height: 46px; border: 1px solid rgba(148,163,184,.24); border-radius: 999px; padding: 0 18px; background: var(--surface, #fff); color: var(--text, #0f172a); font-weight: 950; cursor: pointer; }
.fee-save-btn { width: 100%; }
.fee-primary-btn:disabled, .fee-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.fee-hero { display: flex; align-items: stretch; justify-content: space-between; gap: 10px; padding: 12px; border-radius: 28px; background: linear-gradient(135deg, color-mix(in srgb, var(--fee-primary) 12%, #fff), #fff 64%); border: 1px solid rgba(148,163,184,.22); box-shadow: 0 18px 46px rgba(15,23,42,.07); overflow: hidden; }
.fee-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.fee-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--fee-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--fee-primary) 28%, transparent); font-size: 22px; }
.fee-title-wrap { min-width: 0; }
.fee-title-wrap p, .fee-title-wrap h2, .fee-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fee-title-wrap p { margin: 0 0 2px; color: var(--fee-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.fee-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.fee-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.fee-hero-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

.fee-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; padding: 10px; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148,163,184,.2); box-shadow: 0 16px 40px rgba(15,23,42,.055); }
.fee-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.fee-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148,163,184,.2); box-shadow: 0 12px 28px rgba(15,23,42,.04); overflow: hidden; }
.fee-summary-card.positive { background: linear-gradient(135deg, rgba(34,197,94,.08), #fff); }
.fee-summary-card.danger { background: linear-gradient(135deg, rgba(239,68,68,.08), #fff); }
.fee-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--fee-primary) 12%, #fff); }
.fee-summary-card div:last-child { min-width: 0; }
.fee-summary-card strong, .fee-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fee-summary-card strong { font-size: 18px; font-weight: 1000; letter-spacing: -.05em; }
.fee-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.fee-section { margin-top: 16px; }
.fee-section-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.fee-section-head h3 { margin: 0; font-size: 19px; font-weight: 1000; letter-spacing: -.04em; }
.fee-list { display: grid; gap: 10px; }
.fee-entity-card, .fee-empty-card { min-width: 0; border-radius: 24px; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148,163,184,.2); box-shadow: 0 12px 28px rgba(15,23,42,.045); overflow: hidden; padding: 13px; }
.fee-structure-head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.fee-structure-head h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.fee-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.fee-avatar { width: 56px; height: 56px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15,23,42,.12); }
.fee-card-main { min-width: 0; flex: 1; }
.fee-card-main h3, .fee-card-main p { display: block; overflow: hidden; text-overflow: ellipsis; }
.fee-card-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.fee-card-main p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.fee-chip-row, .fee-action-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.fee-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fee-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.fee-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.fee-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.fee-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.fee-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.fee-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.fee-items-grid, .fee-balance-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
.fee-mini-stat { min-width: 0; padding: 9px; border-radius: 17px; background: rgba(148,163,184,.09); border: 1px solid rgba(148,163,184,.13); overflow: hidden; }
.fee-mini-stat.danger { background: rgba(239,68,68,.08); }
.fee-mini-stat strong, .fee-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fee-mini-stat strong { font-size: 13px; font-weight: 1000; }
.fee-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.fee-action-row button, .fee-form-card button, .fee-payment-row button, .fee-item-row button { min-height: 40px; border: 1px solid rgba(148,163,184,.24); border-radius: 999px; padding: 0 13px; background: var(--surface, #fff); color: var(--text, #0f172a); font-size: 12px; font-weight: 950; cursor: pointer; }
.fee-action-row button.primary { background: var(--fee-primary); color: #fff; border-color: transparent; }
.fee-action-row button.danger, .fee-payment-row button.danger, .fee-item-row button.danger { color: #dc2626; background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.12); }
.fee-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 190px; text-align: center; border-style: dashed; }
.fee-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--fee-primary) 12%, #fff); font-size: 28px; }
.fee-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.fee-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.fee-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.fee-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15,23,42,.52); }
.fee-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 620px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15,23,42,.22); }
.fee-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.fee-drawer-head div { min-width: 0; }
.fee-drawer-head p { margin: 0; color: var(--fee-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.fee-drawer-head h2, .fee-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.fee-drawer-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.fee-drawer-head span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.fee-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid rgba(148,163,184,.24); border-radius: 15px; background: #fff; font-weight: 1000; cursor: pointer; }
.fee-form-grid { display: grid; gap: 12px; }
.fee-form-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.fee-field { display: grid; gap: 6px; min-width: 0; }
.fee-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.fee-form-card { padding: 12px; border-radius: 20px; background: rgba(148,163,184,.08); border: 1px solid rgba(148,163,184,.16); }
.fee-form-card-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; }
.fee-item-list, .fee-payment-list { display: grid; gap: 9px; margin-top: 10px; }
.fee-item-row { display: grid; grid-template-columns: minmax(0,1fr); gap: 8px; }
.fee-payment-row { display: grid; grid-template-columns: minmax(0,1fr); gap: 7px; padding: 10px; border-radius: 15px; background: #fff; }
.fee-form-total { margin-top: 12px; font-size: 16px; font-weight: 1000; }

@media (min-width: 680px) {
  .fee-page { padding: 12px; }
  .fee-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .fee-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fee-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fee-item-row { grid-template-columns: minmax(0, 1fr) 150px auto; }
  .fee-payment-row { grid-template-columns: minmax(0, 1fr) auto auto auto; align-items: center; }
}
@media (min-width: 1040px) {
  .fee-page { padding: 16px; }
  .fee-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .fee-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .fee-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .fee-page { padding: 6px; }
  .fee-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .fee-hero-actions { display: grid; grid-template-columns: 1fr; }
  .fee-primary-btn, .fee-ghost-btn { width: 100%; }
  .fee-summary-grid { gap: 6px; }
  .fee-summary-card { padding: 10px; border-radius: 19px; }
  .fee-summary-card strong { font-size: 16px; }
  .fee-entity-card, .fee-empty-card { border-radius: 20px; padding: 11px; }
  .fee-structure-head { flex-direction: column; }
  .fee-action-row.compact { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fee-card-top { align-items: flex-start; }
  .fee-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .fee-items-grid, .fee-balance-grid { grid-template-columns: 1fr; }
  .fee-action-row button { width: 100%; }
  .fee-drawer { width: min(96vw, 620px); padding: 12px; }
}
`;
