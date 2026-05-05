"use client";

import { useEffect, useState } from "react";
import { db, TermType, Setting } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";

type PaymentMethod = "cash" | "momo" | "bank";

const TERMS: TermType[] = ["Term 1", "Term 2", "Term 3"];

export default function Fees() {
  // ================= STATE =================
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [feeStructures, setFeeStructures] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  // 🔥 FIX: use undefined instead of null (cleaner + safer with Dexie)
  const [settings, setSettings] = useState<Setting | undefined>(undefined);

  const [selectedClassId, setSelectedClassId] = useState<number | "">("");
  const [selectedStudentId, setSelectedStudentId] = useState<number | "">("");

  const [itemName, setItemName] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [items, setItems] = useState<any[]>([]);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");

  const [receipt, setReceipt] = useState<any>(null);

  // ================= LOAD =================
  const load = async () => {
    const [c, s, fs, p, setArr] = await Promise.all([
      db.classes.toArray(),
      db.students.toArray(),
      db.feeStructures.toArray(),
      db.payments.toArray(),
      db.settings.toArray(),
    ]);

    setClasses(c);
    setStudents(s);
    setFeeStructures(fs);
    setPayments(p);

    let setting: Setting | undefined = setArr[0];

    // 🔥 AUTO CREATE SETTINGS IF MISSING
    if (!setting) {
      const id = await db.settings.add(
        prepareSyncData({
          currentTerm: "Term 1",
          academicYear: "2025/2026",
          mode: "auto",
        } as Setting)
      );

      setting = await db.settings.get(id);
    }

    setSettings(setting);
  };

  useEffect(() => {
    load();
  }, []);

  // ================= GUARD =================
  if (!settings) return <p>Loading...</p>;

  // ================= TERM HELPERS =================
  const getNextTerm = (term: TermType): TermType => {
    const index = TERMS.indexOf(term);
    return TERMS[index + 1] || "Term 1";
  };

  const getNextYear = (year: string) => {
    const [a, b] = year.split("/").map(Number);
    return `${a + 1}/${b + 1}`;
  };

  const rolloverTerm = async () => {
    let nextTerm = getNextTerm(settings.currentTerm);
    let nextYear = settings.academicYear;

    if (settings.currentTerm === "Term 3") {
      nextYear = getNextYear(settings.academicYear);
    }

    await db.settings.update(settings.id!, {
      currentTerm: nextTerm,
      academicYear: nextYear,
    });

    load();
  };

  // ================= FEE STRUCTURE =================
  const addItem = () => {
    if (!itemName || !itemAmount) return;

    setItems((prev) => [
      ...prev,
      { name: itemName, amount: Number(itemAmount) },
    ]);

    setItemName("");
    setItemAmount("");
  };

  const saveFeeStructure = async () => {
    if (!selectedClassId || items.length === 0) return;

    await db.feeStructures.add(
      prepareSyncData({
        classId: Number(selectedClassId),
        academicYear: settings.academicYear,
        term: settings.currentTerm,
        items,
      })
    );

    setItems([]);
    load();
  };

  const getClassFee = (classId: number, term: TermType, year: string) => {
    return feeStructures.find(
      (f) =>
        f.classId === classId &&
        f.term === term &&
        f.academicYear === year
    );
  };

  const getTotalFees = (classId: number, term: TermType, year: string) => {
    const fs = getClassFee(classId, term, year);
    if (!fs) return 0;

    return fs.items.reduce((sum: number, i: any) => sum + i.amount, 0);
  };

  // ================= PAYMENTS =================
  const generateReceiptNumber = () => "REC-" + Date.now();

  const makePayment = async () => {
    if (!selectedStudentId || !paymentAmount) return;

    const payment = {
      studentId: Number(selectedStudentId),
      amount: Number(paymentAmount),
      method,
      term: settings.currentTerm,
      academicYear: settings.academicYear,
      date: new Date().toISOString(),
      receiptNumber: generateReceiptNumber(),
    };

    await db.payments.add(prepareSyncData(payment));

    const student = students.find((s) => s.id === Number(selectedStudentId));

    setReceipt({
      ...payment,
      studentName: student?.fullName,
    });

    setPaymentAmount("");
    load();
  };

  const getTotalPaid = (studentId: number, term: TermType) => {
    return payments
      .filter(
        (p) =>
          p.studentId === studentId &&
          p.term === term &&
          p.academicYear === settings.academicYear
      )
      .reduce((sum, p) => sum + p.amount, 0);
  };

  // ================= ARREARS =================
  const getArrears = (student: any) => {
    let arrears = 0;

    for (const t of TERMS) {
      if (t === settings.currentTerm) break;

      const fees = getTotalFees(student.classId, t, settings.academicYear);
      const paid = getTotalPaid(student.id, t);

      arrears += fees - paid;
    }

    return arrears;
  };

  const getCurrentBalance = (student: any) => {
    const fees = getTotalFees(
      student.classId,
      settings.currentTerm,
      settings.academicYear
    );

    const paid = getTotalPaid(student.id, settings.currentTerm);

    return fees - paid;
  };

  const getTotalBalance = (student: any) =>
    getArrears(student) + getCurrentBalance(student);

  // ================= UI =================
  return (
    <div style={{ padding: 20 }}>
      <h2>Fees Management</h2>

      <div>
        <b>
          {settings.currentTerm} - {settings.academicYear}
        </b>
        <br />
        <button onClick={rolloverTerm}>Promote Term</button>
      </div>

      <hr />

      {/* FEE STRUCTURE */}
      <h3>Fee Structure</h3>

      <select
        value={selectedClassId}
        onChange={(e) => setSelectedClassId(Number(e.target.value))}
      >
        <option value="">Select Class</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <input
        placeholder="Item"
        value={itemName}
        onChange={(e) => setItemName(e.target.value)}
      />

      <input
        placeholder="Amount"
        value={itemAmount}
        onChange={(e) => setItemAmount(e.target.value)}
      />

      <button onClick={addItem}>Add</button>
      <button onClick={saveFeeStructure}>Save</button>

      <hr />

      {/* PAYMENT */}
      <h3>Payment</h3>

      <select
        value={selectedStudentId}
        onChange={(e) => setSelectedStudentId(Number(e.target.value))}
      >
        <option value="">Select Student</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.fullName}
          </option>
        ))}
      </select>

      <input
        placeholder="Amount"
        value={paymentAmount}
        onChange={(e) => setPaymentAmount(e.target.value)}
      />

      <select
        value={method}
        onChange={(e) => setMethod(e.target.value as PaymentMethod)}
      >
        <option value="cash">Cash</option>
        <option value="momo">MoMo</option>
        <option value="bank">Bank</option>
      </select>

      <button onClick={makePayment}>Pay</button>

      <hr />

      {/* RECEIPT */}
      {receipt && (
        <div style={{ border: "1px dashed black", padding: 10 }}>
          <h3>Receipt</h3>
          <p>{receipt.receiptNumber}</p>
          <p>{receipt.studentName}</p>
          <p>{receipt.amount}</p>
        </div>
      )}

      <hr />

      {/* BALANCES */}
      <h3>Balances</h3>

      {students.map((s) => {
        const arrears = getArrears(s);
        const current = getCurrentBalance(s);
        const total = getTotalBalance(s);

        return (
          <div key={s.id}>
            <b>{s.fullName}</b>
            <div>Arrears: {arrears}</div>
            <div>Current: {current}</div>
            <div style={{ color: total > 0 ? "red" : "green" }}>
              Total: {total}
            </div>
          </div>
        );
      })}
    </div>
  );
}