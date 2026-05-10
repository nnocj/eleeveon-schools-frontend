"use client";

import { useEffect, useMemo, useState } from "react";
import { db, FeeStructure, Payment } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

type Tab = "structures" | "payments";

export default function FeesPage() {
  const { settings } = useSettings();

  const branchId = settings?.branchId ?? 1;
  const organizationId = settings?.organizationId;

  // ======================================================
  // UI STATE
  // ======================================================
  const [tab, setTab] = useState<Tab>("structures");
  const [loading, setLoading] = useState(true);

  const [showFeeForm, setShowFeeForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const [editingFeeId, setEditingFeeId] = useState<number | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);

  // ======================================================
  // DATA
  // ======================================================
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);

  const [academicStructures, setAcademicStructures] = useState<any[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<any[]>([]);

  // ======================================================
  // FILTERS
  // ======================================================
  const [search, setSearch] = useState("");

  const [filterClass, setFilterClass] = useState("");
  const [filterOrganization, setFilterOrganization] = useState("");

  const [filterAcademicStructure, setFilterAcademicStructure] = useState("");
  const [filterAcademicPeriod, setFilterAcademicPeriod] = useState("");

  // ======================================================
  // FEE FORM
  // ======================================================
  const [feeClassId, setFeeClassId] = useState("");

  const [feeAcademicStructureId, setFeeAcademicStructureId] = useState("");
  const [feeAcademicPeriodId, setFeeAcademicPeriodId] = useState("");

  const [items, setItems] = useState([
    {
      name: "",
      amount: 0,
    },
  ]);

  // ======================================================
  // PAYMENT FORM
  // ======================================================
  const [studentId, setStudentId] = useState("");

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");

  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [receiptNumber, setReceiptNumber] = useState("");
  const [note, setNote] = useState("");

  // ======================================================
  // LOAD
  // ======================================================
  const load = async () => {
    setLoading(true);

    try {
      const [
        fs,
        p,
        s,
        c,
        orgs,
        structures,
        periods,
      ] = await Promise.all([
        db.feeStructures
          .where("branchId")
          .equals(branchId)
          .toArray(),

        db.payments
          .where("branchId")
          .equals(branchId)
          .toArray(),

        db.students
          .where("branchId")
          .equals(branchId)
          .toArray(),

        db.classes
          .where("branchId")
          .equals(branchId)
          .toArray(),

        db.organizations?.toArray?.() || [],

        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
      ]);

      let filteredStudents = s;
      let filteredClasses = c;

      // ======================================================
      // ORGANIZATION FILTERING
      // ======================================================
      if (organizationId) {
        filteredStudents = s.filter(
          (x: any) => x.organizationId === organizationId
        );

        filteredClasses = c.filter(
          (x: any) => x.organizationId === organizationId
        );
      }

      setFeeStructures(fs);
      setPayments(p);

      setStudents(filteredStudents);
      setClasses(filteredClasses);

      setOrganizations(orgs);

      setAcademicStructures(structures);
      setAcademicPeriods(periods);
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
  const classMap = useMemo(
    () => new Map(classes.map((c) => [c.id, c.name])),
    [classes]
  );

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s.fullName])),
    [students]
  );

  const studentClassMap = useMemo(
    () =>
      new Map(
        students.map((s) => [
          s.id,
          classMap.get(s.currentClassId) || "No Class",
        ])
      ),
    [students, classMap]
  );

  const organizationMap = useMemo(
    () => new Map(organizations.map((o: any) => [o.id, o.name])),
    [organizations]
  );

  const structureMap = useMemo(
    () =>
      new Map(
        academicStructures.map((s) => [s.id, s.name])
      ),
    [academicStructures]
  );

  const periodMap = useMemo(
    () =>
      new Map(
        academicPeriods.map((p) => [p.id, p.name])
      ),
    [academicPeriods]
  );

  // ======================================================
  // RESETS
  // ======================================================
  const resetFeeForm = () => {
    setFeeClassId("");

    setFeeAcademicStructureId("");
    setFeeAcademicPeriodId("");

    setItems([
      {
        name: "",
        amount: 0,
      },
    ]);

    setEditingFeeId(null);
    setShowFeeForm(false);
  };

  const resetPaymentForm = () => {
    setStudentId("");

    setAmount("");
    setMethod("cash");

    setPaymentDate(
      new Date().toISOString().split("T")[0]
    );

    setReceiptNumber("");
    setNote("");

    setEditingPaymentId(null);
    setShowPaymentForm(false);
  };

  // ======================================================
  // SAVE FEE STRUCTURE
  // ======================================================
  const saveFeeStructure = async () => {
    if (
      !feeAcademicStructureId ||
      !feeAcademicPeriodId
    ) {
      alert("Academic structure and period required");
      return;
    }

    const cleanedItems = items.filter(
      (x) => x.name.trim() && Number(x.amount) > 0
    );

    if (cleanedItems.length === 0) {
      alert("Add at least one fee item");
      return;
    }

    const payload = prepareSyncData({
      branchId,

      classId: feeClassId
        ? Number(feeClassId)
        : undefined,

      academicStructureId: Number(
        feeAcademicStructureId
      ),

      academicPeriodId: Number(
        feeAcademicPeriodId
      ),

      items: cleanedItems.map((x) => ({
        name: x.name,
        amount: Number(x.amount),
      })),
    });

    if (editingFeeId) {
      await db.feeStructures.update(
        editingFeeId,
        payload
      );
    } else {
      await db.feeStructures.add(payload);
    }

    resetFeeForm();
    load();
  };

  // ======================================================
  // SAVE PAYMENT
  // ======================================================
  const savePayment = async () => {
    if (!studentId || !amount) {
      alert("Student and amount required");
      return;
    }

    const payload = prepareSyncData({
      branchId,

      studentId: Number(studentId),

      amount: Number(amount),

      method,

      date: paymentDate,

      receiptNumber,
      note,
    });

    if (editingPaymentId) {
      await db.payments.update(
        editingPaymentId,
        payload
      );
    } else {
      await db.payments.add(payload);
    }

    resetPaymentForm();
    load();
  };

  // ======================================================
  // EDITS
  // ======================================================
  const editFeeStructure = (f: FeeStructure) => {
    setEditingFeeId(f.id || null);

    setFeeClassId(String(f.classId || ""));

    setFeeAcademicStructureId(
      String(f.academicStructureId)
    );

    setFeeAcademicPeriodId(
      String(f.academicPeriodId)
    );

    setItems(
      f.items?.length
        ? f.items
        : [{ name: "", amount: 0 }]
    );

    setShowFeeForm(true);
  };

  const editPayment = (p: Payment) => {
    setEditingPaymentId(p.id || null);

    setStudentId(String(p.studentId));

    setAmount(String(p.amount));
    setMethod(p.method);

    setPaymentDate(p.date);

    setReceiptNumber(p.receiptNumber || "");
    setNote(p.note || "");

    setShowPaymentForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================
  const removeFeeStructure = async (id: number) => {
    if (!confirm("Delete fee structure?")) return;

    await db.feeStructures.delete(id);

    load();
  };

  const removePayment = async (id: number) => {
    if (!confirm("Delete payment?")) return;

    await db.payments.delete(id);

    load();
  };

  // ======================================================
  // FILTERING
  // ======================================================
  const filteredStructures = useMemo(() => {
    return feeStructures.filter((f) => {
      const matchClass = filterClass
        ? String(f.classId || "") === filterClass
        : true;

      const matchStructure = filterAcademicStructure
        ? String(f.academicStructureId) ===
          filterAcademicStructure
        : true;

      const matchPeriod = filterAcademicPeriod
        ? String(f.academicPeriodId) ===
          filterAcademicPeriod
        : true;

      return (
        matchClass &&
        matchStructure &&
        matchPeriod
      );
    });
  }, [
    feeStructures,
    filterClass,
    filterAcademicStructure,
    filterAcademicPeriod,
  ]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const student = students.find(
        (s) => s.id === p.studentId
      );

      const matchSearch =
        student?.fullName
          ?.toLowerCase()
          .includes(search.toLowerCase()) || false;

      const matchClass = filterClass
        ? String(student?.currentClassId || "") ===
          filterClass
        : true;

      const matchOrganization = filterOrganization
        ? String(student?.organizationId || "") ===
          filterOrganization
        : true;

      return (
        matchSearch &&
        matchClass &&
        matchOrganization
      );
    });
  }, [
    payments,
    students,
    search,
    filterClass,
    filterOrganization,
  ]);

  // ======================================================
  // TOTAL HELPERS
  // ======================================================
  const totalRevenue = filteredPayments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
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
    border: "1px solid rgba(0,0,0,0.08)",
    background: "var(--surface)",
    padding: 14,
    borderRadius: 12,
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.2)",
    width: "100%",
    background: "transparent",
    color: "var(--text)",
  };

  const primaryBtn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: "var(--primary-color)",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  };

  const outlineBtn: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid var(--primary-color)",
    background: "transparent",
    color: "var(--text)",
    cursor: "pointer",
  };

  const tabBtn = (
    active: boolean
  ): React.CSSProperties => ({
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.1)",
    background: active
      ? "var(--primary-color)"
      : "transparent",
    color: active ? "#fff" : "var(--text)",
    cursor: "pointer",
    fontWeight: 600,
  });

  if (loading) {
    return <div style={page}>Loading finance...</div>;
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
            Fees & Finance
          </h2>

          <p
            style={{
              margin: "4px 0 0",
              opacity: 0.6,
              fontSize: 13,
            }}
          >
            Fee structures, collections and school finance
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            style={tabBtn(tab === "structures")}
            onClick={() =>
              setTab("structures")
            }
          >
            Fee Structures
          </button>

          <button
            style={tabBtn(tab === "payments")}
            onClick={() =>
              setTab("payments")
            }
          >
            Payments
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div
        style={{
          marginTop: 15,
          display: "grid",
          gridTemplateColumns:
            "2fr 1fr 1fr 1fr",
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
          value={filterClass}
          onChange={(e) =>
            setFilterClass(e.target.value)
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
          value={filterOrganization}
          onChange={(e) =>
            setFilterOrganization(
              e.target.value
            )
          }
        >
          <option value="">
            All Organizations
          </option>

          {organizations.map((o: any) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        <select
          style={input}
          value={filterAcademicPeriod}
          onChange={(e) =>
            setFilterAcademicPeriod(
              e.target.value
            )
          }
        >
          <option value="">
            All Periods
          </option>

          {academicPeriods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* ====================================================== */}
      {/* FEE STRUCTURES */}
      {/* ====================================================== */}
      {tab === "structures" && (
        <div style={{ marginTop: 20 }}>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <h3>Fee Structures</h3>

            <button
              style={primaryBtn}
              onClick={() =>
                setShowFeeForm((p) => !p)
              }
            >
              {showFeeForm
                ? "Close"
                : "+ Add Fee Structure"}
            </button>
          </div>

          {/* FORM */}
          {showFeeForm && (
            <div
              style={{
                ...card,
                marginTop: 15,
                maxWidth: 650,
                display: "grid",
                gap: 10,
              }}
            >
              <select
                style={input}
                value={feeClassId}
                onChange={(e) =>
                  setFeeClassId(
                    e.target.value
                  )
                }
              >
                <option value="">
                  Whole School / General
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
                value={
                  feeAcademicStructureId
                }
                onChange={(e) =>
                  setFeeAcademicStructureId(
                    e.target.value
                  )
                }
              >
                <option value="">
                  Academic Structure
                </option>

                {academicStructures.map(
                  (s) => (
                    <option
                      key={s.id}
                      value={s.id}
                    >
                      {s.name}
                    </option>
                  )
                )}
              </select>

              <select
                style={input}
                value={feeAcademicPeriodId}
                onChange={(e) =>
                  setFeeAcademicPeriodId(
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

              {/* ITEMS */}
              <div>
                <b>Fee Items</b>

                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  {items.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "2fr 1fr auto",
                        gap: 10,
                      }}
                    >
                      <input
                        style={input}
                        placeholder="Fee item"
                        value={item.name}
                        onChange={(e) => {
                          const copy = [
                            ...items,
                          ];

                          copy[index].name =
                            e.target.value;

                          setItems(copy);
                        }}
                      />

                      <input
                        style={input}
                        placeholder="Amount"
                        type="number"
                        value={item.amount}
                        onChange={(e) => {
                          const copy = [
                            ...items,
                          ];

                          copy[index].amount =
                            Number(
                              e.target.value
                            );

                          setItems(copy);
                        }}
                      />

                      <button
                        style={outlineBtn}
                        onClick={() =>
                          setItems((prev) =>
                            prev.filter(
                              (_, i) =>
                                i !== index
                            )
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  style={{
                    ...outlineBtn,
                    marginTop: 10,
                  }}
                  onClick={() =>
                    setItems((prev) => [
                      ...prev,
                      {
                        name: "",
                        amount: 0,
                      },
                    ])
                  }
                >
                  + Add Item
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                }}
              >
                <button
                  style={primaryBtn}
                  onClick={
                    saveFeeStructure
                  }
                >
                  {editingFeeId
                    ? "Update"
                    : "Save"}
                </button>

                <button
                  style={outlineBtn}
                  onClick={resetFeeForm}
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
            {filteredStructures.map((f) => {
              const total =
                f.items?.reduce(
                  (sum, i) =>
                    sum +
                    Number(i.amount || 0),
                  0
                ) || 0;

              return (
                <div
                  key={f.id}
                  style={card}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: 20,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <b>
                        {f.classId
                          ? classMap.get(
                              f.classId
                            )
                          : "General School Fees"}
                      </b>

                      <div
                        style={{
                          fontSize: 13,
                          opacity: 0.7,
                          marginTop: 5,
                        }}
                      >
                        📚{" "}
                        {structureMap.get(
                          f.academicStructureId
                        )}{" "}
                        • 📅{" "}
                        {periodMap.get(
                          f.academicPeriodId
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 13,
                          opacity: 0.75,
                        }}
                      >
                        {f.items?.map(
                          (i, idx) => (
                            <div key={idx}>
                              • {i.name} —
                              GHS{" "}
                              {Number(
                                i.amount
                              ).toFixed(2)}
                            </div>
                          )
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          fontWeight: 700,
                        }}
                      >
                        Total: GHS{" "}
                        {total.toFixed(2)}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                      }}
                    >
                      <button
                        style={outlineBtn}
                        onClick={() =>
                          editFeeStructure(
                            f
                          )
                        }
                      >
                        Edit
                      </button>

                      <button
                        style={outlineBtn}
                        onClick={() =>
                          removeFeeStructure(
                            f.id!
                          )
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
      )}

      {/* ====================================================== */}
      {/* PAYMENTS */}
      {/* ====================================================== */}
      {tab === "payments" && (
        <div style={{ marginTop: 20 }}>

          {/* SUMMARY */}
          <div
            style={{
              ...card,
              marginBottom: 15,
            }}
          >
            <div
              style={{
                fontSize: 13,
                opacity: 0.7,
              }}
            >
              Total Revenue
            </div>

            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              GHS {totalRevenue.toFixed(2)}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <h3>Payments</h3>

            <button
              style={primaryBtn}
              onClick={() =>
                setShowPaymentForm(
                  (p) => !p
                )
              }
            >
              {showPaymentForm
                ? "Close"
                : "+ Add Payment"}
            </button>
          </div>

          {/* FORM */}
          {showPaymentForm && (
            <div
              style={{
                ...card,
                marginTop: 15,
                maxWidth: 500,
                display: "grid",
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

              <select
                style={input}
                value={method}
                onChange={(e) =>
                  setMethod(
                    e.target.value
                  )
                }
              >
                <option value="cash">
                  Cash
                </option>

                <option value="mobile_money">
                  Mobile Money
                </option>

                <option value="bank_transfer">
                  Bank Transfer
                </option>

                <option value="card">
                  Card
                </option>
              </select>

              <input
                type="date"
                style={input}
                value={paymentDate}
                onChange={(e) =>
                  setPaymentDate(
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

              <textarea
                style={{
                  ...input,
                  minHeight: 80,
                }}
                placeholder="Note"
                value={note}
                onChange={(e) =>
                  setNote(
                    e.target.value
                  )
                }
              />

              <div
                style={{
                  display: "flex",
                  gap: 10,
                }}
              >
                <button
                  style={primaryBtn}
                  onClick={savePayment}
                >
                  {editingPaymentId
                    ? "Update"
                    : "Save"}
                </button>

                <button
                  style={outlineBtn}
                  onClick={
                    resetPaymentForm
                  }
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
            {filteredPayments.map((p) => {
              const student =
                students.find(
                  (s) =>
                    s.id ===
                    p.studentId
                );

              return (
                <div
                  key={p.id}
                  style={card}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: 20,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <b>
                        {studentMap.get(
                          p.studentId
                        )}
                      </b>

                      <div
                        style={{
                          fontSize: 13,
                          opacity: 0.7,
                          marginTop: 5,
                        }}
                      >
                        🎓{" "}
                        {studentClassMap.get(
                          p.studentId
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          opacity: 0.7,
                          marginTop: 5,
                        }}
                      >
                        🏢{" "}
                        {organizationMap.get(
                          student?.organizationId
                        ) ||
                          "No Organization"}
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 15,
                          fontWeight: 700,
                        }}
                      >
                        GHS{" "}
                        {Number(
                          p.amount
                        ).toFixed(2)}
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          opacity: 0.7,
                          marginTop: 4,
                        }}
                      >
                        {p.method} • {p.date}
                      </div>

                      {p.receiptNumber && (
                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.6,
                            marginTop: 4,
                          }}
                        >
                          Receipt:{" "}
                          {
                            p.receiptNumber
                          }
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                      }}
                    >
                      <button
                        style={outlineBtn}
                        onClick={() =>
                          editPayment(p)
                        }
                      >
                        Edit
                      </button>

                      <button
                        style={outlineBtn}
                        onClick={() =>
                          removePayment(
                            p.id!
                          )
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
      )}
    </div>
  );
}