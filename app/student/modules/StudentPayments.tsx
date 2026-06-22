"use client";

/**
 * app/student/modules/StudentPayments.tsx
 * ---------------------------------------------------------
 * ELEEVEON STUDENT PAYMENTS V3
 * ---------------------------------------------------------
 * Single Student Finance Center.
 *
 * This file replaces the separate StudentFees.tsx idea.
 *
 * Student-facing structure:
 * - Fees To Pay: real studentFeeInvoices + studentFeeInvoiceItems.
 * - Payment History: studentFeePayments + paymentTransactions context.
 * - Receipts: receipt-focused view from paid studentFeePayments.
 *
 * Important business rule:
 * - Students do NOT pay feeStructures directly.
 * - feeStructures are Branch Admin templates only.
 * - Branch Admin creates/saves fee structures, then the system generates
 *   studentFeeInvoices for enrolled students.
 * - StudentPayments only shows invoices as payable records.
 *
 * Online Pay Now:
 * - Uses the shared generic PaymentCheckout component.
 * - PaymentCheckout calls POST /finance/student-fees/payments/initiate
 *   with purpose="student_fee".
 * - Verifies redirected Paystack references via:
 *   GET /finance/student-fees/payments/verify/:reference?provider=paystack&invoiceId=...
 *
 * Compact Golden Standard:
 * - status dot + search + Pay + filter + More
 * - compact summary line
 * - compact rows
 * - More sheet holds sections/views/refresh
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { db } from "../../lib/db";
import { listActiveLocal } from "../../lib/sync/syncUtils";
import { apiRequest } from "../../lib/platformApi";
import PaymentCheckout from "../../components/payments/PaymentCheckout";

type AnyRow = Record<string, any>;

type SectionMode = "fees" | "history" | "receipts";
type ViewMode = "cards" | "table" | "analytics";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";
type StatusFilter = "all" | "unpaid" | "part_paid" | "paid" | "overdue" | "cancelled";

type InvoiceRow = AnyRow & {
  amountPaid: number;
  balance: number;
  computedStatus: string;
  className: string;
  itemCount: number;
};

type PaymentRow = AnyRow & {
  invoiceNumber: string;
  className: string;
};

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function idOf(row?: AnyRow | null) {
  return row?.id ?? row?.localId ?? row?.cloudRecordId ?? row?.cloudId ?? row?.payload?.id ?? row?.payload?.localId;
}

function cleanId(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sameAccount(row: AnyRow, accountId?: string | null) {
  if (!row || row.isDeleted === true) return false;
  if (accountId && row.accountId && row.accountId !== accountId) return false;
  return true;
}

function rowName(row?: AnyRow | null) {
  return text(row?.fullName || row?.name || row?.title || row?.label || row?.email, "Student");
}

function normalize(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function dateLabel(value?: number | string | null) {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", year: "numeric" }).format(new Date(time));
  } catch {
    return "Not set";
  }
}

function money(value: any, currency = "GHS") {
  const amount = n(value);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "GHS", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency || "GHS"} ${amount.toLocaleString()}`;
  }
}

function invoiceStatus(invoice: AnyRow) {
  const status = normalize(invoice.status);
  const balance = n(invoice.balance ?? n(invoice.total) - n(invoice.amountPaid));

  if (["paid", "cancelled", "void"].includes(status)) return status;
  if (balance <= 0 && n(invoice.total) > 0) return "paid";
  if (n(invoice.amountPaid) > 0) return "part_paid";
  if (invoice.dueDate && new Date(invoice.dueDate).getTime() < Date.now()) return "overdue";
  if (status === "draft") return "unpaid";
  return status || "unpaid";
}

function statusTone(status?: string): Tone {
  const value = normalize(status);
  if (["paid", "success", "succeeded"].includes(value)) return "green";
  if (["overdue", "failed", "cancelled", "void"].includes(value)) return "red";
  if (["part_paid", "pending", "processing"].includes(value)) return "orange";
  if (["issued", "unpaid", "draft"].includes(value)) return "blue";
  return "gray";
}

async function safeArray(tableName: string): Promise<AnyRow[]> {
  try {
    return await listActiveLocal<AnyRow>(tableName as any);
  } catch {
    const table = (db as any)[tableName];
    return table?.toArray ? table.toArray() : [];
  }
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`sp-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="sp-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function Empty({ title, text: body }: { title: string; text: string }) {
  return (
    <section className="sp-empty">
      <div>💳</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

// STUDENT_PAYMENTS_VERSION: single-finance-center-v4-shared-payment-checkout
export default function StudentPaymentsPage() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";

  const [loading, setLoading] = useState(true);

  const [section, setSection] = useState<SectionMode>("fees");
  const [view, setView] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState<PaymentRow | null>(null);

  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [payAmount, setPayAmount] = useState("");

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [student, setStudent] = useState<AnyRow | null>(null);
  const [resolvedStudentId, setResolvedStudentId] = useState(0);
  const [studentContextNote, setStudentContextNote] = useState("");

  const [invoices, setInvoices] = useState<AnyRow[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);
  const [transactions, setTransactions] = useState<AnyRow[]>([]);
  const [classes, setClasses] = useState<AnyRow[]>([]);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  async function resolveStudentIdentity(studentRows: AnyRow[]) {
    const explicit =
      cleanId((settings as any)?.studentLocalId) ||
      cleanId((settings as any)?.studentId) ||
      cleanId((settings as any)?.activeStudentId);

    if (explicit) {
      const match = studentRows.find((row) => Number(idOf(row)) === Number(explicit)) || null;
      return { studentId: explicit, student: match, note: "Resolved from student setting." };
    }

    const membershipRows = await safeArray("userMemberships");
    const fallbackMembershipRows = membershipRows.length ? membershipRows : await safeArray("memberships");
    const currentUserId = text((settings as any)?.userId || (settings as any)?.appUserId || (settings as any)?.currentUserId);

    const ranked = fallbackMembershipRows
      .filter((row) => sameAccount(row, accountId) && normalize(row.role) === "student" && cleanId(row.studentLocalId || row.studentId))
      .map((membership) => {
        let score = 0;
        if (currentUserId && String(membership.userId || "") === currentUserId) score += 100;
        if (membership.active !== false) score += 10;
        return { membership, score };
      })
      .sort((a, b) => b.score - a.score);

    const membership = ranked[0]?.membership;
    const fromMembership = cleanId(membership?.studentLocalId || membership?.studentId);

    if (fromMembership) {
      const match = studentRows.find((row) => Number(idOf(row)) === Number(fromMembership)) || null;
      return { studentId: fromMembership, student: match, note: "Resolved from student membership." };
    }

    const fallbackStudent = studentRows[0] || null;
    const fallbackId = cleanId(idOf(fallbackStudent));

    return {
      studentId: fallbackId,
      student: fallbackStudent,
      note: fallbackId ? "Resolved from first available student record. Link login membership for strict accuracy." : "No linked student record found.",
    };
  }

  async function load(options?: { preserveNotice?: boolean }) {
    if (!authenticated || !accountId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    if (!options?.preserveNotice) setNotice("");

    try {
      const [studentRows, invoiceRows, invoiceItemRows, paymentRows, transactionRows, classRows] = await Promise.all([
        safeArray("students"),
        safeArray("studentFeeInvoices"),
        safeArray("studentFeeInvoiceItems"),
        safeArray("studentFeePayments"),
        safeArray("paymentTransactions"),
        safeArray("classes"),
      ]);

      const scopedStudents = studentRows.filter((row) => sameAccount(row, accountId));
      const identity = await resolveStudentIdentity(scopedStudents);
      const studentId = identity.studentId;
      const currentStudent = identity.student || scopedStudents.find((row) => Number(idOf(row)) === Number(studentId)) || null;

      const studentInvoices = invoiceRows.filter((row) => sameAccount(row, accountId) && Number(row.studentId || 0) === Number(studentId));
      const studentInvoiceIds = new Set(studentInvoices.map((row) => Number(idOf(row))).filter(Boolean));

      const studentInvoiceItems = invoiceItemRows.filter((row) => sameAccount(row, accountId) && studentInvoiceIds.has(Number(row.invoiceId || 0)));

      const studentPayments = paymentRows.filter(
        (row) => sameAccount(row, accountId) && (Number(row.studentId || 0) === Number(studentId) || studentInvoiceIds.has(Number(row.invoiceId || 0)))
      );

      const studentTransactions = transactionRows.filter(
        (row) =>
          sameAccount(row, accountId) &&
          (Number(row.studentId || 0) === Number(studentId) ||
            studentPayments.some((payment) => payment.paymentTransactionId && Number(payment.paymentTransactionId) === Number(idOf(row))))
      );

      setStudent(currentStudent);
      setResolvedStudentId(studentId);
      setStudentContextNote(identity.note);
      setInvoices(studentInvoices);
      setInvoiceItems(studentInvoiceItems);
      setPayments(studentPayments);
      setTransactions(studentTransactions);
      setClasses(classRows.filter((row) => sameAccount(row, accountId)));
    } catch (err: any) {
      setError(err?.message || "Unable to load student finance records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();

    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    const invoiceId = params.get("invoiceId") || params.get("trxref_invoiceId");

    if (reference) verifyAfterRedirect(reference, invoiceId || undefined);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, accountLoading, settingsLoading]);

  async function verifyAfterRedirect(reference: string, invoiceId?: string) {
    try {
      setError("");
      setNotice("Verifying payment...");

      const suffix = invoiceId ? `?provider=paystack&invoiceId=${encodeURIComponent(invoiceId)}` : "?provider=paystack";
      await apiRequest(`/finance/student-fees/payments/verify/${encodeURIComponent(reference)}${suffix}`);

      await load({ preserveNotice: true });
      setNotice("Payment verified. Your invoice balance will update after refresh/sync.");

      const url = new URL(window.location.href);
      ["reference", "trxref", "invoiceId", "trxref_invoiceId"].forEach((key) => url.searchParams.delete(key));
      window.history.replaceState({}, "", url.toString());
    } catch (err: any) {
      setError(err?.message || "Unable to verify payment.");
    }
  }

  const classMap = useMemo(() => new Map(classes.map((item) => [Number(idOf(item)), rowName(item)])), [classes]);
  const invoiceItemMap = useMemo(() => {
    const map = new Map<number, AnyRow[]>();
    invoiceItems.forEach((item) => {
      const invoiceId = cleanId(item.invoiceId);
      if (!invoiceId) return;
      const list = map.get(invoiceId) || [];
      list.push(item);
      map.set(invoiceId, list);
    });
    return map;
  }, [invoiceItems]);

  const invoiceMap = useMemo(() => new Map(invoices.map((item) => [Number(idOf(item)), item])), [invoices]);

  const invoiceRows = useMemo<InvoiceRow[]>(() => {
    const q = query.toLowerCase().trim();

    return invoices
      .map((invoice) => {
        const invoiceId = cleanId(idOf(invoice));
        const items = invoiceItemMap.get(invoiceId) || [];
        const paidFromRows = payments
          .filter((payment) => Number(payment.invoiceId || 0) === Number(invoiceId))
          .filter((payment) => ["paid", "success", "succeeded"].includes(normalize(payment.status || "paid")))
          .reduce((sum, payment) => sum + n(payment.amount), 0);

        const amountPaid = Math.max(n(invoice.amountPaid), paidFromRows);
        const balance = Math.max(0, n(invoice.balance ?? n(invoice.total) - amountPaid));
        const computedStatus = invoiceStatus({ ...invoice, amountPaid, balance });

        return {
          ...(invoice as AnyRow),
          amountPaid,
          balance,
          computedStatus,
          className: invoice.classId ? classMap.get(Number(invoice.classId)) || "Class" : "Class",
          itemCount: items.length,
        } as InvoiceRow;
      })
      .filter((invoice) => {
        if (status === "all") return true;
        if (status === "unpaid") return ["unpaid", "issued", "draft"].includes(invoice.computedStatus);
        return invoice.computedStatus === status;
      })
      .filter((invoice) => {
        if (!q) return true;
        const items = invoiceItemMap.get(cleanId(idOf(invoice))) || [];
        return [
          invoice.invoiceNumber,
          invoice.className,
          invoice.status,
          invoice.note,
          items.map((item) => item.name).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const aPaid = a.computedStatus === "paid" ? 1 : 0;
        const bPaid = b.computedStatus === "paid" ? 1 : 0;
        if (aPaid !== bPaid) return aPaid - bPaid;
        return n(b.issueDate || b.createdAt || b.updatedAt) - n(a.issueDate || a.createdAt || a.updatedAt);
      });
  }, [classMap, invoiceItemMap, invoices, payments, query, status]);

  const paymentRows = useMemo<PaymentRow[]>(() => {
    const q = query.toLowerCase().trim();

    return payments
      .map((payment) => {
        const invoice = invoiceMap.get(Number(payment.invoiceId || 0));
        return {
          ...(payment as AnyRow),
          invoiceNumber: text(invoice?.invoiceNumber, payment.invoiceId ? "Invoice" : "Manual payment"),
          className: invoice?.classId ? classMap.get(Number(invoice.classId)) || "Class" : "Manual payment",
        } as PaymentRow;
      })
      .filter((payment) => {
        if (!q) return true;
        return [
          payment.receiptNumber,
          payment.referenceNumber,
          payment.providerReference,
          payment.invoiceNumber,
          payment.className,
          payment.method,
          payment.status,
          payment.payerName,
          payment.note,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => n(b.paidAt || b.date || b.updatedAt || b.createdAt) - n(a.paidAt || a.date || a.updatedAt || a.createdAt));
  }, [classMap, invoiceMap, payments, query]);

  const receiptRows = useMemo(() => paymentRows.filter((row) => ["paid", "success", "succeeded"].includes(normalize(row.status || "paid"))), [paymentRows]);

  const currency = text(invoiceRows[0]?.currencyCode || paymentRows[0]?.currencyCode || settings?.currencyCode || "GHS", "GHS");

  const summary = useMemo(() => {
    const totalBilled = invoiceRows.reduce((sum, row) => sum + n(row.total), 0);
    const totalPaid = paymentRows.reduce((sum, row) => sum + n(row.amount), 0) || invoiceRows.reduce((sum, row) => sum + n(row.amountPaid), 0);
    const outstanding = invoiceRows.reduce((sum, row) => sum + n(row.balance), 0);
    const payableCount = invoiceRows.filter((row) => n(row.balance) > 0 && !["cancelled", "void", "paid"].includes(row.computedStatus)).length;

    return {
      totalBilled,
      totalPaid,
      outstanding,
      payableCount,
      invoiceCount: invoiceRows.length,
      paymentCount: paymentRows.length,
      receiptCount: receiptRows.length,
      overdueCount: invoiceRows.filter((row) => row.computedStatus === "overdue").length,
      transactionCount: transactions.length,
    };
  }, [invoiceRows, paymentRows, receiptRows.length, transactions.length]);

  const nextPayable = invoiceRows.find((row) => n(row.balance) > 0 && !["cancelled", "void", "paid"].includes(row.computedStatus)) || null;
  const activeFilterCount = status !== "all" ? 1 : 0;

  function openPay(invoice: InvoiceRow) {
    setSelectedInvoice(invoice);
    setPayAmount(String(n(invoice.balance || invoice.total)));
    setNotice("");
    setError("");
    setPayOpen(true);
  }

  async function afterCheckout(result: any) {
    setNotice(result?.message || "Payment started. Complete the Paystack step, then refresh after confirmation.");
    setPayOpen(false);
    setSelectedInvoice(null);
    await load({ preserveNotice: true });
  }

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening finance..." text="Loading your fees, payments and receipts." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing your finance records." />;
  }

  if (!resolvedStudentId) {
    return <State primary={primary} title="No linked student found" text="This login has not been linked to a student record yet." />;
  }

  return (
    <main className="sp-page" style={{ "--sp-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sp-search-card" aria-label="Student finance search and actions">
        <span className={`status-dot-mini ${summary.outstanding ? "orange" : "green"}`} />

        <label className="sp-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={section === "fees" ? "Search fees to pay..." : section === "history" ? "Search payment history..." : "Search receipts..."}
            aria-label="Search student finance"
          />
        </label>

        <button type="button" className="sp-add-inline" onClick={() => (nextPayable ? openPay(nextPayable) : setNotice("No unpaid invoice found."))} disabled={!nextPayable}>
          Pay
        </button>

        <button type="button" className={`sp-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="sp-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">
          ⋯
        </button>
      </section>

      <section className="sp-compact-line">
        <b>{money(summary.outstanding, currency)} due</b>
        <Chip tone={summary.payableCount ? "orange" : "green"}>{summary.payableCount ? `${summary.payableCount} payable` : "clear"}</Chip>
        <small>{rowName(student)} · {studentContextNote}</small>
      </section>

      <section className="sp-section-tabs" aria-label="Student finance sections">
        <button type="button" className={section === "fees" ? "active" : ""} onClick={() => setSection("fees")}>💳 Fees <b>{summary.invoiceCount}</b></button>
        <button type="button" className={section === "history" ? "active" : ""} onClick={() => setSection("history")}>💰 Payments <b>{summary.paymentCount}</b></button>
        <button type="button" className={section === "receipts" ? "active" : ""} onClick={() => setSection("receipts")}>🧾 Receipts <b>{summary.receiptCount}</b></button>
      </section>

      {(status !== "all" || query.trim()) && (
        <section className="sp-filter-chips" aria-label="Active filters">
          {status !== "all" && <button type="button" onClick={() => setStatus("all")}>Status: {status} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      {notice ? <SlimNotice tone="green">{notice}</SlimNotice> : null}
      {error ? <SlimNotice tone="red">{error}</SlimNotice> : null}

      {view === "analytics" && <AnalyticsView summary={summary} currency={currency} student={student} />}

      {view === "table" && (
        <TableView
          section={section}
          invoices={invoiceRows}
          payments={paymentRows}
          receipts={receiptRows}
          currency={currency}
          openPay={openPay}
          openReceipt={setReceiptOpen}
        />
      )}

      {view === "cards" && section === "fees" && (
        <section className="sp-list">
          {invoiceRows.map((invoice) => (
            <InvoiceCard
              key={String(idOf(invoice))}
              invoice={invoice}
              items={invoiceItemMap.get(cleanId(idOf(invoice))) || []}
              currency={invoice.currencyCode || currency}
              openPay={openPay}
            />
          ))}
          {!invoiceRows.length && <Empty title="No fees to pay" text="When Branch Admin generates your fee invoice, it will appear here with Pay Now." />}
        </section>
      )}

      {view === "cards" && section === "history" && (
        <section className="sp-list">
          {paymentRows.map((payment) => <PaymentCard key={String(idOf(payment))} payment={payment} currency={payment.currencyCode || currency} openReceipt={setReceiptOpen} />)}
          {!paymentRows.length && <Empty title="No payments found" text="When a payment is recorded or confirmed, it will appear here." />}
        </section>
      )}

      {view === "cards" && section === "receipts" && (
        <section className="sp-list">
          {receiptRows.map((payment) => <ReceiptCard key={String(idOf(payment))} payment={payment} currency={payment.currencyCode || currency} openReceipt={setReceiptOpen} />)}
          {!receiptRows.length && <Empty title="No receipts yet" text="Paid fee records with receipt numbers will appear here." />}
        </section>
      )}

      {filterOpen && <FilterSheet status={status} setStatus={setStatus} onClose={() => setFilterOpen(false)} />}

      {moreOpen && (
        <MoreSheet
          section={section}
          setSection={(next) => {
            setSection(next);
            setMoreOpen(false);
          }}
          view={view}
          setView={(next) => {
            setView(next);
            setMoreOpen(false);
          }}
          summary={summary}
          currency={currency}
          student={student}
          resolvedStudentId={resolvedStudentId}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {payOpen && selectedInvoice && (
        <PaymentCheckout
          open={payOpen}
          onClose={() => setPayOpen(false)}
          purpose="student_fee"
          title={`Pay ${selectedInvoice.invoiceNumber || "Fee Invoice"}`}
          description={`${selectedInvoice.className} · Balance ${money(selectedInvoice.balance, selectedInvoice.currencyCode || currency)}`}
          amount={n(payAmount) || n(selectedInvoice.balance)}
          currency={selectedInvoice.currencyCode || currency}
          schoolId={Number(selectedInvoice.schoolId)}
          branchId={Number(selectedInvoice.branchId)}
          studentId={Number(selectedInvoice.studentId || resolvedStudentId)}
          invoiceId={idOf(selectedInvoice)}
          payerNameDefault={rowName(student)}
          payerPhoneDefault={text(student?.phone || student?.guardianPhone)}
          payerEmailDefault={text(student?.email || student?.studentEmail)}
          callbackUrl={`${typeof window !== "undefined" ? window.location.origin : ""}${typeof window !== "undefined" ? window.location.pathname : ""}?invoiceId=${encodeURIComponent(String(idOf(selectedInvoice)))}`}
          metadata={{
            invoiceNumber: selectedInvoice.invoiceNumber,
            classId: selectedInvoice.classId,
          }}
          onSuccess={afterCheckout}
          onError={(message) => setError(message)}
        />
      )}

      {receiptOpen && <ReceiptSheet payment={receiptOpen} currency={receiptOpen.currencyCode || currency} close={() => setReceiptOpen(null)} />}
    </main>
  );
}

function State({ primary, title, text: body }: { primary: string; title: string; text: string }) {
  return (
    <main className="sp-page" style={{ "--sp-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="sp-state">
        <div className="sp-spinner" />
        <h2>{title}</h2>
        <p>{body}</p>
      </section>
    </main>
  );
}

function SlimNotice({ tone, children }: { tone: "green" | "red" | "orange" | "gray"; children: React.ReactNode }) {
  return (
    <section className={`sp-slim-notice ${tone}`}>
      <span className={`status-dot-mini ${tone === "red" ? "red" : tone === "orange" ? "orange" : tone === "green" ? "green" : "gray"}`} />
      <p>{children}</p>
    </section>
  );
}

function InvoiceCard({
  invoice,
  items,
  currency,
  openPay,
}: {
  invoice: InvoiceRow;
  items: AnyRow[];
  currency: string;
  openPay: (invoice: InvoiceRow) => void;
}) {
  const payable = n(invoice.balance) > 0 && !["paid", "cancelled", "void"].includes(invoice.computedStatus);

  return (
    <article className="pay-row">
      <span className="pay-avatar">💳</span>
      <span className="pay-main">
        <strong>{invoice.invoiceNumber || "Fee Invoice"}</strong>
        <small>{money(invoice.balance, currency)} due · {money(invoice.total, currency)} total</small>
        <em>{invoice.className} · {items.length || invoice.itemCount} item(s) · Due {dateLabel(invoice.dueDate)}</em>
      </span>
      <span className="pay-side">
        <Chip tone={statusTone(invoice.computedStatus)}>{String(invoice.computedStatus).replaceAll("_", " ")}</Chip>
        {payable && <button type="button" onClick={() => openPay(invoice)}>Pay</button>}
      </span>

      {items.length ? (
        <div className="mini-items">
          {items.slice(0, 3).map((item) => (
            <span key={String(idOf(item) || item.name)}>
              {item.name || "Fee item"} · {money(item.amount, item.currencyCode || currency)}
            </span>
          ))}
          {items.length > 3 ? <span>+ {items.length - 3} more item(s)</span> : null}
        </div>
      ) : null}
    </article>
  );
}

function PaymentCard({ payment, currency, openReceipt }: { payment: PaymentRow; currency: string; openReceipt: (payment: PaymentRow) => void }) {
  return (
    <article className="pay-row">
      <span className="pay-avatar">💰</span>
      <span className="pay-main">
        <strong>{money(payment.amount, currency)}</strong>
        <small>{payment.receiptNumber || payment.referenceNumber || "Payment"} · {dateLabel(payment.paidAt || payment.date)}</small>
        <em>{payment.invoiceNumber} · {payment.method || "manual"} · {payment.className}</em>
      </span>
      <span className="pay-side">
        <Chip tone={statusTone(payment.status)}>{payment.status || "paid"}</Chip>
        <button type="button" onClick={() => openReceipt(payment)}>View</button>
      </span>
    </article>
  );
}

function ReceiptCard({ payment, currency, openReceipt }: { payment: PaymentRow; currency: string; openReceipt: (payment: PaymentRow) => void }) {
  return (
    <article className="pay-row">
      <span className="pay-avatar">🧾</span>
      <span className="pay-main">
        <strong>{payment.receiptNumber || payment.referenceNumber || "Receipt"}</strong>
        <small>{money(payment.amount, currency)} · {payment.invoiceNumber}</small>
        <em>{payment.method || "manual"} · {dateLabel(payment.paidAt || payment.date)}</em>
      </span>
      <span className="pay-side">
        <Chip tone="green">receipt</Chip>
        <button type="button" onClick={() => openReceipt(payment)}>Open</button>
      </span>
    </article>
  );
}

function TableView({
  section,
  invoices,
  payments,
  receipts,
  currency,
  openPay,
  openReceipt,
}: {
  section: SectionMode;
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  receipts: PaymentRow[];
  currency: string;
  openPay: (invoice: InvoiceRow) => void;
  openReceipt: (payment: PaymentRow) => void;
}) {
  if (section === "fees") {
    return (
      <section className="sp-table-card">
        <div className="sp-table-scroll">
          <table>
            <thead><tr><th>Fees ({invoices.length})</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Due</th><th>Action</th></tr></thead>
            <tbody>
              {invoices.map((invoice) => {
                const payable = n(invoice.balance) > 0 && !["paid", "cancelled", "void"].includes(invoice.computedStatus);
                return (
                  <tr key={String(idOf(invoice))}>
                    <td><strong>{invoice.invoiceNumber || "Fee Invoice"}</strong><span>{invoice.className} · {invoice.itemCount} item(s)</span></td>
                    <td>{money(invoice.total, invoice.currencyCode || currency)}</td>
                    <td>{money(invoice.amountPaid, invoice.currencyCode || currency)}</td>
                    <td>{money(invoice.balance, invoice.currencyCode || currency)}</td>
                    <td><Chip tone={statusTone(invoice.computedStatus)}>{String(invoice.computedStatus).replaceAll("_", " ")}</Chip></td>
                    <td>{dateLabel(invoice.dueDate)}</td>
                    <td><div className="sp-table-actions">{payable && <button type="button" onClick={() => openPay(invoice)}>Pay</button>}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!invoices.length && <div className="sp-empty-table">No fee invoice found.</div>}
        </div>
      </section>
    );
  }

  const rows = section === "receipts" ? receipts : payments;

  return (
    <section className="sp-table-card">
      <div className="sp-table-scroll">
        <table>
          <thead><tr><th>{section === "receipts" ? "Receipts" : "Payments"} ({rows.length})</th><th>Invoice</th><th>Amount</th><th>Method</th><th>Status</th><th>Receipt</th><th>Date</th><th>Action</th></tr></thead>
          <tbody>
            {rows.map((payment) => (
              <tr key={String(idOf(payment))}>
                <td><strong>{payment.referenceNumber || payment.providerReference || "Payment"}</strong><span>{payment.provider || "manual"}</span></td>
                <td>{payment.invoiceNumber}</td>
                <td>{money(payment.amount, payment.currencyCode || currency)}</td>
                <td>{payment.method || "manual"}</td>
                <td><Chip tone={statusTone(payment.status)}>{payment.status || "paid"}</Chip></td>
                <td>{payment.receiptNumber || "Not set"}</td>
                <td>{dateLabel(payment.paidAt || payment.date || payment.createdAt)}</td>
                <td><div className="sp-table-actions"><button type="button" onClick={() => openReceipt(payment)}>View</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="sp-empty-table">No record found.</div>}
      </div>
    </section>
  );
}

function FilterSheet({ status, setStatus, onClose }: { status: StatusFilter; setStatus: (value: StatusFilter) => void; onClose: () => void }) {
  return (
    <div className="sp-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="sp-sheet small">
        <div className="sp-sheet-head"><div><h2>Filters</h2><p>Filter fee invoices by payment status.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="sp-form compact">
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="all">All statuses</option><option value="unpaid">Unpaid</option><option value="part_paid">Part paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="cancelled">Cancelled</option></select></label>
        </div>
        <div className="sp-sheet-actions"><button type="button" onClick={() => setStatus("all")}>Reset</button><button type="button" className="primary" onClick={onClose}>Apply</button></div>
      </section>
    </div>
  );
}

function MoreSheet({
  section,
  setSection,
  view,
  setView,
  summary,
  currency,
  student,
  resolvedStudentId,
  onRefresh,
  onClose,
}: {
  section: SectionMode;
  setSection: (value: SectionMode) => void;
  view: ViewMode;
  setView: (value: ViewMode) => void;
  summary: AnyRow;
  currency: string;
  student: AnyRow | null;
  resolvedStudentId: number;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="sp-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="sp-sheet small">
        <div className="sp-sheet-head"><div><h2>More</h2><p>{money(summary.outstanding, currency)} outstanding.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="sp-menu-list">
          <button type="button" className={section === "fees" ? "active" : ""} onClick={() => setSection("fees")}><span>💳</span><b>Fees To Pay</b><small>{summary.payableCount} payable invoice(s)</small></button>
          <button type="button" className={section === "history" ? "active" : ""} onClick={() => setSection("history")}><span>💰</span><b>Payment History</b><small>{summary.paymentCount} payment record(s)</small></button>
          <button type="button" className={section === "receipts" ? "active" : ""} onClick={() => setSection("receipts")}><span>🧾</span><b>Receipts</b><small>{summary.receiptCount} receipt(s)</small></button>
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>Cards</b><small>Compact finance records</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table</b><small>Dense records</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{money(summary.totalPaid, currency)} paid</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload fees, payments and receipts</small></button>
          <button type="button" disabled><span>🎓</span><b>{rowName(student)}</b><small>Student ID {resolvedStudentId || "not linked"}</small></button>
        </div>
      </section>
    </div>
  );
}


function ReceiptSheet({ payment, currency, close }: { payment: PaymentRow; currency: string; close: () => void }) {
  function printReceipt() {
    window.print();
  }

  return (
    <div className="sp-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="sp-sheet small receipt-print">
        <div className="sp-sheet-head no-print"><div><h2>Receipt</h2><p>{payment.receiptNumber || payment.referenceNumber || "Payment receipt"}</p></div><button type="button" onClick={close}>✕</button></div>
        <section className="receipt-box">
          <h2>Payment Receipt</h2>
          <p>{payment.receiptNumber || payment.referenceNumber || payment.providerReference || "No receipt number"}</p>
          <dl>
            <div><dt>Invoice</dt><dd>{payment.invoiceNumber}</dd></div>
            <div><dt>Amount</dt><dd>{money(payment.amount, currency)}</dd></div>
            <div><dt>Method</dt><dd>{payment.method || "manual"}</dd></div>
            <div><dt>Status</dt><dd>{payment.status || "paid"}</dd></div>
            <div><dt>Date</dt><dd>{dateLabel(payment.paidAt || payment.date || payment.createdAt)}</dd></div>
            <div><dt>Reference</dt><dd>{payment.referenceNumber || payment.providerReference || "Not set"}</dd></div>
          </dl>
        </section>
        <div className="sp-sheet-actions no-print">
          <button type="button" onClick={close}>Close</button>
          <button type="button" className="primary" onClick={printReceipt}>Print</button>
        </div>
      </section>
    </div>
  );
}

function AnalyticsView({ summary, currency, student }: { summary: AnyRow; currency: string; student: AnyRow | null }) {
  return (
    <section className="sp-analysis-grid">
      <article className="sp-analysis"><span>Student</span><strong>{rowName(student)}</strong><p>Fees, payments and receipts.</p></article>
      <article className="sp-analysis"><span>Outstanding</span><strong>{money(summary.outstanding, currency)}</strong><p>{summary.payableCount} payable invoice(s).</p></article>
      <article className="sp-analysis"><span>Paid</span><strong>{money(summary.totalPaid, currency)}</strong><p>{summary.paymentCount} payment record(s).</p></article>
      <article className="sp-analysis"><span>Receipts</span><strong>{summary.receiptCount}</strong><p>Printable payment receipts.</p></article>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.sp-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--sp-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.sp-page *,.sp-page *::before,.sp-page *::after{box-sizing:border-box;min-width:0}.sp-page button,.sp-page input,.sp-page select,.sp-page textarea{font:inherit;max-width:100%}.sp-page button{-webkit-tap-highlight-color:transparent}.sp-page input,.sp-page select,.sp-page textarea{width:100%;min-height:40px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:15px;padding:0 11px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.sp-state,.sp-search-card,.pay-row,.sp-table-card,.sp-analysis,.sp-empty,.sp-sheet,.sp-slim-notice{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.sp-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.sp-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--sp-primary) 18%,transparent);border-top-color:var(--sp-primary);animation:spin .8s linear infinite}.sp-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.sp-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.sp-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.sp-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:42px;padding:0 10px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.sp-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.sp-search input{min-height:40px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:13px}.sp-icon-button,.sp-filter-button,.sp-add-inline{width:40px;height:40px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:17px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.sp-add-inline{width:auto;min-width:52px;padding:0 12px;border-color:var(--sp-primary);background:var(--sp-primary);color:#fff;font-size:12px;box-shadow:0 12px 28px color-mix(in srgb,var(--sp-primary) 22%,transparent)}.sp-add-inline:disabled{opacity:.55;cursor:not-allowed}.sp-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.sp-filter-button{position:relative;background:color-mix(in srgb,var(--sp-primary) 8%,var(--card-bg,#fff));color:var(--sp-primary)}.sp-filter-button.active{background:var(--sp-primary);color:#fff;border-color:var(--sp-primary)}.sp-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.red{background:#ef4444}.status-dot-mini.gray{background:var(--muted,#64748b)}.sp-compact-line{max-width:1180px;margin:8px auto 0;display:flex;align-items:center;gap:7px;overflow-x:auto;white-space:nowrap}.sp-compact-line b{font-size:13px;font-weight:1000;color:var(--text,#111827)}.sp-compact-line small{font-size:11px;font-weight:800;color:var(--muted,#64748b)}.sp-section-tabs{max-width:1180px;margin:8px auto 0;display:flex;gap:7px;overflow-x:auto;scrollbar-width:none}.sp-section-tabs::-webkit-scrollbar{display:none}.sp-section-tabs button{flex:0 0 auto;min-height:34px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 11px;background:var(--card-bg,var(--surface,#fff));color:var(--muted,#64748b);font-size:12px;font-weight:950;cursor:pointer;white-space:nowrap}.sp-section-tabs button.active{background:color-mix(in srgb,var(--sp-primary) 10%,var(--card-bg,#fff));color:var(--sp-primary);border-color:color-mix(in srgb,var(--sp-primary) 28%,var(--border,rgba(0,0,0,.10)))}.sp-section-tabs b{margin-left:4px}.sp-slim-notice{max-width:1180px;margin:8px auto 0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:9px;border-radius:17px;padding:8px 10px}.sp-slim-notice p{margin:0;font-size:11px;line-height:1.35;font-weight:850}.sp-slim-notice.green{background:#f0fdf4;color:#166534;border-color:#bbf7d0}.sp-slim-notice.red{background:#fef2f2;color:#991b1b;border-color:#fecaca}.sp-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.sp-filter-chips::-webkit-scrollbar{display:none}.sp-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--sp-primary) 11%,transparent);color:var(--sp-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.sp-list{display:grid;gap:8px;margin-top:10px}.pay-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left}.pay-avatar{width:44px;height:44px;display:grid;place-items:center;border-radius:17px;background:color-mix(in srgb,var(--sp-primary) 12%,var(--surface,#fff));font-size:21px}.pay-main,.pay-main strong,.pay-main small,.pay-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pay-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000}.pay-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.pay-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.pay-side{display:flex;align-items:center;gap:5px}.pay-side button{min-height:30px;border:1px solid var(--sp-primary);border-radius:999px;background:var(--sp-primary);color:#fff;font-size:11px;font-weight:950;padding:0 10px;cursor:pointer}.sp-chip{max-width:100%;display:inline-flex;align-items:center;min-height:23px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.sp-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.sp-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.sp-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.sp-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.sp-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.sp-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.mini-items{grid-column:1/-1;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.mini-items::-webkit-scrollbar{display:none}.mini-items span{flex:0 0 auto;min-height:25px;display:inline-flex;align-items:center;border-radius:999px;padding:0 8px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);color:var(--muted,#64748b);font-size:10px;font-weight:850}.sp-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.sp-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.sp-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.sp-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.sp-sheet-head h2{margin:0;color:var(--text,#111827);font-size:20px;font-weight:1000;letter-spacing:-.05em}.sp-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.sp-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.sp-form{display:grid;gap:10px}.sp-form label{display:grid;gap:6px}.sp-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.sp-method-toggle{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:4px;border-radius:999px;background:color-mix(in srgb,var(--sp-primary) 8%,transparent);border:1px solid var(--border,rgba(0,0,0,.10));margin:10px 0}.sp-method-toggle button{min-height:34px;border:0;border-radius:999px;background:transparent;color:var(--muted,#64748b);font-size:11px;font-weight:1000;cursor:pointer}.sp-method-toggle button.active{background:var(--sp-primary);color:#fff}.sp-pay-target{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:center;padding:10px;border-radius:18px;background:color-mix(in srgb,var(--sp-primary) 9%,transparent);border:1px solid color-mix(in srgb,var(--sp-primary) 18%,var(--border,rgba(0,0,0,.10)))}.sp-pay-target span{grid-row:span 2;width:40px;height:40px;display:grid;place-items:center;border-radius:16px;background:var(--card-bg,var(--surface,#fff));font-size:20px}.sp-pay-target b,.sp-pay-target small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sp-pay-target b{font-size:13px;font-weight:1000}.sp-pay-target small{font-size:11px;font-weight:800;color:var(--muted,#64748b)}.sp-inline-error{padding:10px 12px;border-radius:18px;font-size:12px;font-weight:850;margin-bottom:10px;background:rgba(239,68,68,.12);color:#991b1b}.sp-menu-list{display:grid;gap:8px}.sp-menu-list button{width:100%;display:grid;grid-template-columns:40px minmax(0,1fr);column-gap:9px;align-items:center;min-height:54px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:8px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.sp-menu-list button:disabled{opacity:.62;cursor:not-allowed}.sp-menu-list button span{grid-row:span 2;width:40px;height:40px;display:grid;place-items:center;border-radius:15px;background:color-mix(in srgb,var(--sp-primary) 10%,transparent);color:var(--sp-primary);font-weight:1000}.sp-menu-list button b,.sp-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sp-menu-list button b{font-size:13px;font-weight:1000}.sp-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.sp-menu-list button.active{border-color:color-mix(in srgb,var(--sp-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--sp-primary) 8%,var(--surface,#fff))}.sp-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.sp-sheet-actions button{min-height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 14px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.sp-sheet-actions button.primary{border-color:var(--sp-primary);background:var(--sp-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--sp-primary) 25%,transparent)}.sp-sheet-actions button:disabled{opacity:.55;cursor:not-allowed}.sp-table-card,.sp-analysis,.sp-empty{padding:13px;border-radius:24px}.sp-table-card{margin-top:10px;display:grid;gap:10px}.sp-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.sp-table-scroll table{width:100%;min-width:860px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.sp-table-scroll th,.sp-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.sp-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--sp-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.sp-table-scroll td strong,.sp-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sp-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.sp-table-actions{display:flex;gap:7px;overflow-x:auto}.sp-table-actions button{flex:0 0 auto;min-height:32px;border:1px solid var(--sp-primary);border-radius:999px;padding:0 11px;background:var(--sp-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.sp-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.sp-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.sp-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.sp-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.sp-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.sp-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:200px;text-align:center;border-style:dashed;margin-top:10px}.sp-empty div{width:52px;height:52px;display:grid;place-items:center;border-radius:20px;background:color-mix(in srgb,var(--sp-primary) 12%,var(--surface,#fff));font-size:26px}.sp-empty h3{margin:0;font-size:18px;font-weight:1000}.sp-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.receipt-box{border:1px dashed var(--border,rgba(0,0,0,.16));border-radius:22px;padding:14px;background:color-mix(in srgb,var(--sp-primary) 4%,transparent)}.receipt-box h2{margin:0;font-size:19px;font-weight:1000}.receipt-box p{margin:4px 0 12px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.receipt-box dl{display:grid;gap:8px;margin:0}.receipt-box div{display:grid;grid-template-columns:minmax(90px,.7fr) minmax(0,1.3fr);gap:10px;padding:8px 0;border-top:1px solid var(--border,rgba(0,0,0,.08))}.receipt-box dt{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.receipt-box dd{margin:0;font-size:13px;font-weight:950;overflow-wrap:anywhere}@media print{body *{visibility:hidden}.receipt-print,.receipt-print *{visibility:visible}.receipt-print{position:absolute;inset:0;width:100%;box-shadow:none;border:0}.no-print{display:none!important}.receipt-box{border:0}}@media (min-width:680px){.sp-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.sp-search-card{grid-template-columns:auto minmax(0,1fr) auto 44px 44px}.sp-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pay-row{border-radius:24px;padding:11px;grid-template-columns:auto minmax(0,1fr)}.pay-side{grid-column:1/-1;justify-content:flex-end}.sp-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sp-sheet-backdrop{place-items:center;padding:18px}.sp-sheet{border-radius:28px;padding:18px}}@media (min-width:1040px){.sp-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.sp-search-card,.sp-list,.sp-analysis-grid,.sp-table-card,.sp-filter-chips,.sp-compact-line,.sp-section-tabs,.sp-slim-notice{max-width:1180px;margin-left:auto;margin-right:auto}.sp-list{grid-template-columns:repeat(3,minmax(0,1fr))}.pay-row{grid-template-columns:auto minmax(0,1fr) auto}.pay-side{grid-column:auto}.sp-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.sp-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.sp-search-card{gap:6px}.sp-icon-button,.sp-filter-button{width:39px;height:39px}.sp-add-inline{min-width:49px}.pay-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.pay-side{grid-column:1/-1;justify-content:flex-end;overflow-x:auto}.sp-sheet{padding:12px}.sp-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.sp-sheet-actions button{width:100%}}
`;
