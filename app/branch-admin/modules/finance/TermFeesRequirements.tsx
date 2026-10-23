"use client";

/**
 * Eleeveon Schools â€” Term Fees & Requirements, V1.
 * Uses the existing synchronized feeStructures, studentFeeInvoices,
 * studentFeeInvoiceItems and studentFeePayments stores. No schema version bump.
 * Non-cash requirements are always zero-value invoice items; delivery counts
 * are encoded in the existing description string and never change fee totals.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import TermNoticePrintTemplate from "./TermNoticePrintTemplate";
import { useSettings } from "../../../context/settings-context";
import { useActiveBranch } from "../../../context/active-branch-context";
import { useBranchWorkspaceScope } from "../../../hooks/useBranchWorkspaceScope";
import { useBranchTableRevision } from "../../../hooks/useBranchTableRevision";
import { useRegisterBranchWorkspaceToolbar } from "../../../components/role-portals/shell/BranchWorkspaceToolbar";
import { createLocal, updateLocal, listActiveLocal } from "../../../lib/sync/syncUtils";
import type {
  AcademicPeriod, AcademicStructure, Class, FeeStructure, FeeStructureItem,
  Student, StudentEnrollment, StudentFeeInvoice, StudentFeeInvoiceItem,
  StudentFeePayment, PaymentChannel,
} from "../../../lib/db/db";

const MARKER = "ELEEVEON_REQUIREMENT_V1:";
const NOTICE_MARKER = "ELEEVEON_TERM_NOTICE_V1";
type Section = "notices" | "tracking" | "summary";
type RequirementEvent = { quantity: number; at: string; note?: string };
type RequirementState = { sourceKey: string; unit: string; required: boolean; instructions?: string; received: number; events: RequirementEvent[] };
type DraftLine = FeeStructureItem & { key: string };
type Scope = { accountId: string; schoolId: string; branchId: string };
const id = (v: unknown) => String(v ?? "").trim();
const money = (n: unknown) => Math.round(Math.max(0, Number(n) || 0) * 100) / 100;
const titleCase = (s: unknown) => id(s).toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a, b) => a + b.toUpperCase());
const formatGhs = (amount: number) => `GHâ‚µ${money(amount).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const usable = (r: { isDeleted?: boolean; active?: boolean }) => r.isDeleted !== true && r.active !== false;
function isTenant(row: any, scope: Scope) {
  return usable(row) && id(row.accountId) === scope.accountId && id(row.schoolId) === scope.schoolId && id(row.branchId) === scope.branchId;
}
const isRequirement = (item: FeeStructureItem) => item.kind === "requirement";
const isNoticeMeta = (item: FeeStructureItem) => item.kind === "notice_meta";
function parseRequirement(text?: string): RequirementState | null {
  if (!text?.startsWith(MARKER)) return null;
  try {
    const value = JSON.parse(text.slice(MARKER.length));
    if (!value || typeof value.sourceKey !== "string") return null;
    return {
      sourceKey: value.sourceKey, unit: id(value.unit) || "pcs", required: value.required !== false,
      instructions: id(value.instructions), received: Math.max(0, Number(value.received) || 0),
      events: Array.isArray(value.events) ? value.events : [],
    };
  } catch { return null; }
}
const serializeRequirement = (state: RequirementState) => MARKER + JSON.stringify(state);
function makeKey() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
async function readRows<T>(table: string) { return (await listActiveLocal(table as any) || []) as T[]; }

export default function TermFeesRequirements() {
  const workspace = useBranchWorkspaceScope() as any;
  const { settings } = useSettings() as any;
  const { activeSchool, activeBranch } = useActiveBranch() as any;
  const { accountId, schoolId, branchId, authenticated, ready, restoring, branchLoading } = workspace;
  const scope = useMemo<Scope | null>(() => accountId && schoolId && branchId ? { accountId: id(accountId), schoolId: id(schoolId), branchId: id(branchId) } : null, [accountId, schoolId, branchId]);
  const revision = useBranchTableRevision(["feeStructures", "studentFeeInvoices", "studentFeeInvoiceItems", "studentFeePayments", "students", "studentEnrollments", "classes", "academicStructures", "academicPeriods"]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [noticeRows, setNoticeRows] = useState<FeeStructure[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [structures, setStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [invoices, setInvoices] = useState<StudentFeeInvoice[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<StudentFeeInvoiceItem[]>([]);
  const [payments, setPayments] = useState<StudentFeePayment[]>([]);
  const [section, setSection] = useState<Section>("notices");
  const [structureId, setStructureId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [classId, setClassId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [feeLines, setFeeLines] = useState<DraftLine[]>([]);
  const [requirementLines, setRequirementLines] = useState<DraftLine[]>([]);
  const [editingStructure, setEditingStructure] = useState("");
  const [noticeNote, setNoticeNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [trackingStudentId, setTrackingStudentId] = useState("");
  const [message, setMessage] = useState("");
  const [receivedEditor, setReceivedEditor] = useState<StudentFeeInvoiceItem | null>(null);
  const [receiveQty, setReceiveQty] = useState("1");
  const [receiveNote, setReceiveNote] = useState("");
  const [paymentStudent, setPaymentStudent] = useState<Student | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentChannel>("cash");
  const [payReference, setPayReference] = useState("");
  const [printStudent, setPrintStudent] = useState<string | null>(null);
  const [printAll, setPrintAll] = useState(false);
  const [view, setView] = useState<"cards" | "table">("cards");

  useEffect(() => {
    if (typeof window !== "undefined") setView(window.matchMedia("(min-width: 900px)").matches ? "table" : "cards");
  }, []);

  const load = useCallback(async () => {
    if (!scope || !authenticated || !ready) { setLoading(false); return; }
    try {
      setLoading(true);
      const [a, b, c, d, e, f, g, h, i] = await Promise.all([
        readRows<FeeStructure>("feeStructures"), readRows<Student>("students"),
        readRows<StudentEnrollment>("studentEnrollments"), readRows<Class>("classes"),
        readRows<AcademicStructure>("academicStructures"), readRows<AcademicPeriod>("academicPeriods"),
        readRows<StudentFeeInvoice>("studentFeeInvoices"), readRows<StudentFeeInvoiceItem>("studentFeeInvoiceItems"),
        readRows<StudentFeePayment>("studentFeePayments"),
      ]);
      setNoticeRows(a.filter(row => isTenant(row, scope)));
      setStudents(b.filter(row => isTenant(row, scope) && row.status !== "withdrawn"));
      setEnrollments(c.filter(row => isTenant(row, scope) && row.status !== "withdrawn"));
      setClasses(d.filter(row => isTenant(row, scope)).sort((x, y) => x.name.localeCompare(y.name)));
      setStructures(e.filter(row => isTenant(row, scope)).sort((x, y) => x.name.localeCompare(y.name)));
      setPeriods(f.filter(row => isTenant(row, scope)).sort((x, y) => Number(x.order || 0) - Number(y.order || 0)));
      setInvoices(g.filter(row => isTenant(row, scope)));
      setInvoiceItems(h.filter(row => isTenant(row, scope)));
      setPayments(i.filter(row => isTenant(row, scope)));
    } catch (e) { console.error("Finance load failed", e); setMessage("Could not load the branch's finance records."); }
    finally { setLoading(false); }
  }, [scope, authenticated, ready]);
  useEffect(() => { void load(); }, [load, revision]);
  useEffect(() => {
    if (!structures.length) return;
    setStructureId(current => structures.some(row => row.id === current) ? current : (id(settings?.currentAcademicStructureId) && structures.some(row => row.id === id(settings?.currentAcademicStructureId)) ? id(settings?.currentAcademicStructureId) : structures[0].id));
  }, [structures, settings?.currentAcademicStructureId]);
  const visiblePeriods = useMemo(() => periods.filter(p => !structureId || p.academicStructureId === structureId), [periods, structureId]);
  useEffect(() => {
    setPeriodId(current => visiblePeriods.some(p => p.id === current) ? current :
      (visiblePeriods.some(p => p.id === id(settings?.currentAcademicPeriodId)) ? id(settings?.currentAcademicPeriodId) : visiblePeriods[0]?.id || ""));
  }, [visiblePeriods, settings?.currentAcademicPeriodId]);
  useEffect(() => { if (!classes.some(c => c.id === classId)) setClassId(classes[0]?.id || ""); }, [classes, classId]);

  // Class membership works for future terms: prefer currentClassId, otherwise the latest enrollment.
  const targetStudents = useMemo(() => {
    const latest = new Map<string, StudentEnrollment>();
    [...enrollments].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).forEach(e => { if (!latest.has(e.studentId)) latest.set(e.studentId, e); });
    return students.filter(s => (id(s.currentClassId) || id(latest.get(s.id)?.classId)) === classId).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [students, enrollments, classId]);
  const selectedStructure = structures.find(r => r.id === structureId);
  const selectedPeriod = periods.find(r => r.id === periodId);
  const selectedClass = classes.find(r => r.id === classId);
  // Reuse the canonical fee structure for this class/term. Creating a second
  // feeStructure could double-count charges in the existing Fees module.
  // Prefer an already tagged notice if several legacy records exist.
  const notice = useMemo(() => noticeRows
    .filter(row => id(row.academicStructureId) === structureId && id(row.academicPeriodId) === periodId && id(row.classId) === classId)
    .sort((a, b) => {
      const aNotice = (a.items || []).some(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
      const bNotice = (b.items || []).some(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
      return Number(bNotice) - Number(aNotice) || (b.updatedAt || 0) - (a.updatedAt || 0);
    })[0], [noticeRows, structureId, periodId, classId]);
  const noticeMetadata = (notice?.items || []).find(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
  const fees = useMemo(() => (notice?.items || []).filter(item => !isRequirement(item) && !isNoticeMeta(item)), [notice]);
  const requirements = useMemo(() => (notice?.items || []).filter(isRequirement), [notice]);
  const feesTotal = fees.reduce((sum, item) => sum + money(item.amount), 0);
  const scopedInvoices = invoices.filter(inv => id(inv.academicStructureId) === structureId && id(inv.academicPeriodId) === periodId && id(inv.classId) === classId && inv.status !== "void" && inv.status !== "cancelled");
  const invoicesByStudent = useMemo(() => new Map(scopedInvoices.map(inv => [inv.studentId, inv])), [scopedInvoices]);
  const paymentsByStudent = useMemo(() => {
    const invoiceIds = new Set(scopedInvoices.map(inv => inv.id));
    const totals = new Map<string, number>();
    payments.forEach(p => {
      if (p.status !== "paid" || !p.invoiceId || !invoiceIds.has(p.invoiceId)) return;
      totals.set(p.studentId, (totals.get(p.studentId) || 0) + money(p.amount));
    });
    return totals;
  }, [payments, scopedInvoices]);
  const receivedByStudent = useMemo(() => {
    const result = new Map<string, { total: number; received: number; entries: Array<{ item: StudentFeeInvoiceItem; state: RequirementState }> }>();
    for (const invoice of scopedInvoices) {
      const entries = invoiceItems.filter(item => item.invoiceId === invoice.id).flatMap(item => {
        const state = parseRequirement(item.description);
        return state ? [{ item, state }] : [];
      });
      result.set(invoice.studentId, { total: entries.reduce((a, r) => a + Math.max(0, Number(r.item.quantity) || 0), 0), received: entries.reduce((a, r) => a + Math.min(Number(r.item.quantity) || 0, r.state.received), 0), entries });
    }
    return result;
  }, [scopedInvoices, invoiceItems]);
  const studentRow = (student: Student) => {
    const invoice = invoicesByStudent.get(student.id);
    const matchingPayments = paymentsByStudent.get(student.id);
    // Invoice balances may predate this module; use settled payment lines when present.
    const paid = matchingPayments != null ? matchingPayments : money(invoice?.amountPaid);
    const billed = invoice ? money(invoice.total) : feesTotal;
    const items = receivedByStudent.get(student.id);
    const balance = Math.max(0, money(billed - paid));
    return { student, invoice, paid, billed, balance, items, paidStatus: balance <= 0 && billed > 0 ? "paid" : paid > 0 ? "part" : "unpaid" };
  };
  const studentRows = useMemo(() => targetStudents.map(studentRow), [targetStudents, invoicesByStudent, paymentsByStudent, feesTotal, receivedByStudent]);
  const displayed = studentRows.filter(r => {
    const match = `${r.student.fullName} ${r.student.admissionNumber || ""}`.toLowerCase().includes(query.toLowerCase().trim());
    return match && (statusFilter === "all" || statusFilter === r.paidStatus || (statusFilter === "items_pending" && (!r.items || r.items.received < r.items.total)));
  });
  const totalBilled = studentRows.reduce((a, r) => a + r.billed, 0);
  const totalReceived = studentRows.reduce((a, r) => a + r.paid, 0);
  const totalOutstanding = studentRows.reduce((a, r) => a + r.balance, 0);
  const requireScope = () => { if (!scope || !structureId || !periodId || !classId) { setMessage("Select a branch, academic structure, period and class."); return false; } return true; };

  const openEditor = () => {
    if (!requireScope()) return;
    setEditingStructure(notice?.id || "");
    setNoticeNote(noticeMetadata?.instructions || "");
    setDueDate(noticeMetadata?.dueDate || "");
    setFeeLines(fees.map(item => ({ ...item, key: makeKey() })));
    setRequirementLines(requirements.map(item => ({ ...item, key: makeKey() })));
    setEditorOpen(true);
  };
  const saveNotice = async () => {
    if (!scope || !requireScope()) return;
    const validFees = feeLines.filter(item => id(item.name)).map(({ key: _key, ...r }) => ({ ...r, kind: "fee" as const, amount: money(r.amount) }));
    const validReqs = requirementLines.filter(item => id(item.name)).map(({ key: _key, ...r }) => ({ ...r, kind: "requirement" as const, amount: 0, quantity: Math.max(1, Math.floor(Number(r.quantity) || 1)) }));
    if (!validFees.length && !validReqs.length) { setMessage("Add at least one fee or required item."); return; }
    if (validFees.some(r => r.amount <= 0)) { setMessage("Fees must have positive amounts."); return; }
    try {
      setBusy(true);
      const items: FeeStructureItem[] = [
        { kind: "notice_meta", name: NOTICE_MARKER, amount: 0, instructions: id(noticeNote).slice(0, 1000), dueDate: id(dueDate) },
        ...validFees.map(item => ({ ...item, itemKey: item.itemKey || makeKey() })),
        ...validReqs.map(item => ({ ...item, itemKey: item.itemKey || makeKey() })),
      ];
      if (editingStructure) await updateLocal("feeStructures", editingStructure, { items });
      else await createLocal("feeStructures", { ...scope, classId, academicStructureId: structureId, academicPeriodId: periodId, items } as FeeStructure);
      setEditorOpen(false);
      setMessage("Term fees and requirements saved.");
      await load();
    } catch (e) { console.error(e); setMessage("Unable to save this notice. Please retry."); }
    finally { setBusy(false); }
  };

  const issueInvoices = async () => {
    if (!scope || !notice || !targetStudents.length || !requireScope()) return;
    if (!window.confirm(`Create missing invoices and requirement checklists for ${targetStudents.length} students in ${selectedClass?.name || "this class"}? Existing invoices and payments will be preserved.`)) return;
    try {
      setBusy(true);
      // Refresh before issuing to reduce duplicates when data has changed in another module.
      const freshInvoices = (await readRows<StudentFeeInvoice>("studentFeeInvoices")).filter(row => isTenant(row, scope));
      const freshItems = (await readRows<StudentFeeInvoiceItem>("studentFeeInvoiceItems")).filter(row => isTenant(row, scope));
      let created = 0;
      for (const student of targetStudents) {
        let invoice = freshInvoices.find(row => row.studentId === student.id && id(row.classId) === classId && id(row.academicStructureId) === structureId && id(row.academicPeriodId) === periodId && row.status !== "void" && row.status !== "cancelled");
        const invoiceAlreadyIssued = Boolean(invoice);
        if (!invoice) {
          const invoiceNumber = `EFE-${id(selectedPeriod?.name).replace(/\W/g, "").slice(0, 5).toUpperCase() || "TERM"}-${student.id.slice(0, 8)}-${Date.now().toString(36).slice(-5)}`;
          invoice = await createLocal("studentFeeInvoices", { ...scope, studentId: student.id, classId, academicStructureId: structureId, academicPeriodId: periodId, invoiceNumber, subtotal: feesTotal, total: feesTotal, amountPaid: 0, balance: feesTotal, status: "issued", issueDate: today() } as StudentFeeInvoice) as StudentFeeInvoice;
          created++;
        }
        const existingForInvoice = freshItems.filter(row => row.invoiceId === invoice!.id);
        for (let index = 0; index < (notice.items || []).length; index++) {
          const item = notice.items[index];
          if (!item || isNoticeMeta(item)) continue;
          // Never add monetary fee lines to an existing invoice. That invoice
          // may already have independently configured fees and payments.
          if (invoiceAlreadyIssued && !isRequirement(item)) continue;
          const sourceKey = item.itemKey || `${notice.id}:${index}`;
          const already = existingForInvoice.some(row => row.feeStructureId === notice.id && (parseRequirement(row.description)?.sourceKey === sourceKey || (!isRequirement(item) && row.name === item.name && row.amount === money(item.amount))));
          if (already) continue;
          const description = isRequirement(item) ? serializeRequirement({ sourceKey, unit: id(item.unit) || "pcs", required: item.required !== false, instructions: item.instructions, received: 0, events: [] }) : undefined;
          const savedItem = await createLocal("studentFeeInvoiceItems", { ...scope, invoiceId: invoice.id, feeStructureId: notice.id, name: item.name, description, quantity: isRequirement(item) ? Math.max(1, Number(item.quantity) || 1) : 1, unitAmount: isRequirement(item) ? 0 : money(item.amount), amount: isRequirement(item) ? 0 : money(item.amount), required: item.required !== false, order: index + 1 } as StudentFeeInvoiceItem) as StudentFeeInvoiceItem;
          existingForInvoice.push(savedItem);
          freshItems.push(savedItem);
        }
      }
      setMessage(`Student records prepared. ${created} new invoices created; existing invoices were preserved.`);
      await load();
      setSection("tracking");
    } catch (e) { console.error(e); setMessage("Some records could not be issued. Retry; existing items will be checked before adding."); await load(); }
    finally { setBusy(false); }
  };

  const receiveItem = async () => {
    const item = receivedEditor;
    if (!item) return;
    const state = parseRequirement(item.description);
    if (!state) return;
    const count = Number(receiveQty);
    const remaining = Math.max(0, (Number(item.quantity) || 0) - state.received);
    if (!Number.isInteger(count) || count <= 0 || count > remaining) { setMessage(`Enter a whole quantity from 1 to ${remaining}.`); return; }
    try {
      setBusy(true);
      const next = { ...state, received: state.received + count, events: [...state.events, { quantity: count, at: new Date().toISOString(), note: id(receiveNote) || undefined }] };
      await updateLocal("studentFeeInvoiceItems", item.id, { description: serializeRequirement(next) });
      setReceivedEditor(null); setReceiveQty("1"); setReceiveNote(""); await load();
      setMessage("Item receipt recorded.");
    } catch (e) { console.error(e); setMessage("Could not record item receipt."); }
    finally { setBusy(false); }
  };
  const recordPayment = async () => {
    if (!scope || !paymentStudent) return;
    const invoice = invoicesByStudent.get(paymentStudent.id);
    if (!invoice) { setMessage("Issue this student's invoice before recording a payment."); return; }
    const row = studentRow(paymentStudent);
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > row.balance + 0.005) { setMessage(`Enter an amount between GHâ‚µ0.01 and ${formatGhs(row.balance)}.`); return; }
    try {
      setBusy(true);
      await createLocal("studentFeePayments", { ...scope, invoiceId: invoice.id, studentId: paymentStudent.id, amount: money(amount), method: payMethod, status: "paid", date: today(), paidAt: new Date().toISOString(), referenceNumber: id(payReference) || undefined } as StudentFeePayment);
      const settled = money(row.paid + amount);
      await updateLocal("studentFeeInvoices", invoice.id, { amountPaid: settled, balance: money(Math.max(0, row.billed - settled)), status: settled + 0.005 >= row.billed ? "paid" : "part_paid", paidAt: settled + 0.005 >= row.billed ? today() : undefined });
      setPaymentStudent(null); setPayAmount(""); setPayReference(""); setMessage("Payment recorded."); await load();
    } catch (e) { console.error(e); setMessage("Payment could not be saved. Check payment history before retrying."); }
    finally { setBusy(false); }
  };

  const printNotice = (studentId: string | null = null) => {
    if (!notice) { setMessage("Save the class notice before printing."); return; }
    setPrintStudent(studentId);
    setPrintAll(studentId === "__all__");
    window.setTimeout(() => window.print(), 120);
  };
  useRegisterBranchWorkspaceToolbar("financeWorkspace", {
    add: openEditor, search: setQuery, filter: () => setFilterOpen(true), more: () => setMoreOpen(true), print: () => printNotice(),
  });

  const schoolName = id(activeSchool?.name) || "School";
  const branchName = id(activeBranch?.name);
  const academicTitle = selectedStructure?.name || "Academic Structure";
  const periodTitle = selectedPeriod?.name || "Academic Period";
  const classTitle = selectedClass?.name || "Class";
  const printIds = printAll ? targetStudents.map(s => s.id) : printStudent ? [printStudent] : [""];
  const field = (label: string, children: React.ReactNode) => <label className="ef-field"><span>{label}</span>{children}</label>;
  const button = (text: string, onClick: () => void, disabled = false) => <button type="button" disabled={disabled || busy} onClick={onClick}>{text}</button>;

  if (restoring || branchLoading || (ready && loading)) return <section className="ef-page"><div className="ef-empty">Opening Financeâ€¦</div></section>;
  if (!authenticated || !scope) return <section className="ef-page"><div className="ef-empty">Choose an authorized branch workspace to manage its finances.</div></section>;

  return <section className="ef-page">
    <style>{styles}</style>
    <div className="ef-no-print">
      {message && <div role="status" className="ef-message" onClick={() => setMessage("")}>{message} <span>Ã—</span></div>}
      <div className="ef-selection">
        {field("Academic Structure", <select value={structureId} onChange={e => { setStructureId(e.target.value); setPeriodId(""); }}><option value="">Select structure</option>{structures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>)}
        {field("Academic Period", <select value={periodId} onChange={e => setPeriodId(e.target.value)}><option value="">Select period</option>{visiblePeriods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>)}
        {field("Class", <select value={classId} onChange={e => setClassId(e.target.value)}><option value="">Select class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>)}
      </div>
      <div className="ef-section-tabs" role="group" aria-label="Fee views">
        {([ ["notices", "Term Notices"], ["tracking", "Student Tracking"], ["summary", "Summary"] ] as const).map(([key, label]) => <button type="button" key={key} className={section === key ? "active" : ""} onClick={() => setSection(key)} aria-pressed={section === key}>{label}</button>)}
      </div>
      {section === "notices" && <>
        <div className="ef-heading"><div><strong>Next-Term Fees & Requirements</strong><span>{academicTitle} Â· {periodTitle} Â· {classTitle}</span></div></div>
        <div className="ef-grid">
          <article className="ef-panel"><header>Fees Payable <span>{fees.length} entries</span></header>{fees.length ? fees.map((item, n) => <div className="ef-line" key={n}><span>{item.name}</span><b>{formatGhs(item.amount)}</b></div>) : <div className="ef-muted">No fees configured for this class and period.</div>}<div className="ef-line total"><span>Total</span><b>{formatGhs(feesTotal)}</b></div></article>
          <article className="ef-panel"><header>Items to Bring or Purchase <span>{requirements.length} entries</span></header>{requirements.length ? requirements.map((item, n) => <div className="ef-line" key={n}><span>{item.name}{item.instructions ? <small>{item.instructions}</small> : null}</span><b>{item.quantity || 1} {item.unit || "pcs"}</b></div>) : <div className="ef-muted">No physical requirements configured.</div>}</article>
        </div>
        <div className="ef-actions">{button("Print Class Notice", () => printNotice(), !notice)}{button("Print Individual Notices", () => printNotice("__all__"), !notice || !targetStudents.length)}{button("Issue Student Records", issueInvoices, !notice || !targetStudents.length)}</div>
        <p className="ef-help">Print notices without invoicing, or issue student records to begin tracking payments and materials. Required items have no monetary charge unless separately listed as a fee.</p>
      </>}
      {section === "tracking" && <>
        <div className="ef-heading"><div><strong>Student Collections & Items</strong><span>{displayed.length} students Â· {classTitle}</span></div><div className="ef-actions compact">{button(view === "table" ? "Cards" : "Table", () => setView(view === "table" ? "cards" : "table"))}{button("Issue Records", issueInvoices, !notice)}</div></div>
        {view === "table" ? <div className="ef-table-wrap"><table className="ef-table"><thead><tr><th>Student</th><th>Billed</th><th>Paid</th><th>Balance</th><th>Items Received</th><th>Actions</th></tr></thead><tbody>{displayed.map(row => <tr key={row.student.id}><td><b>{titleCase(row.student.fullName)}</b><small>{row.student.admissionNumber || "â€”"}</small></td><td>{formatGhs(row.billed)}</td><td>{formatGhs(row.paid)}</td><td>{formatGhs(row.balance)}</td><td>{row.items ? `${row.items.received}/${row.items.total}` : "Not issued"}</td><td>{button("Payment", () => { setPaymentStudent(row.student); setPayAmount(String(row.balance || "")); }, !row.invoice || !row.balance)} {button("Items", () => setTrackingForStudent(row.student.id))} {button("Print", () => printNotice(row.student.id), !notice)}</td></tr>)}</tbody></table></div> : <div className="ef-cards">{displayed.map(row => <article key={row.student.id} className="ef-student"><div className="ef-student-head"><b>{titleCase(row.student.fullName)}</b><small>{row.student.admissionNumber || "â€”"}</small></div><div className="ef-metrics"><span>Fees <b>{formatGhs(row.billed)}</b></span><span>Paid <b>{formatGhs(row.paid)}</b></span><span>Balance <b>{formatGhs(row.balance)}</b></span><span>Items <b>{row.items ? `${row.items.received}/${row.items.total}` : "â€”"}</b></span></div><div className="ef-actions">{button("Record Payment", () => { setPaymentStudent(row.student); setPayAmount(String(row.balance || "")); }, !row.invoice || !row.balance)}{button("Receive Items", () => setTrackingForStudent(row.student.id))}{button("Print", () => printNotice(row.student.id), !notice)}</div></article>)}</div>}
        {!displayed.length && <div className="ef-empty">No students match the selected class and filters.</div>}
        {trackingStudentId && <div className="ef-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setTrackingStudentId(""); }}><section className="ef-sheet" role="dialog" aria-modal="true" aria-label="Item submissions"><header><strong>Materials Received</strong><button onClick={() => setTrackingStudentId("")}>Ã—</button></header><p>{titleCase(students.find(s => s.id === trackingStudentId)?.fullName)}</p>{(receivedByStudent.get(trackingStudentId)?.entries || []).map(({ item, state }) => <div className="ef-line" key={item.id}><span>{item.name}<small>{state.received} / {item.quantity} {state.unit} received</small></span>{button("+ Receive", () => { setReceivedEditor(item); setReceiveQty(String(Math.max(1, Number(item.quantity || 0) - state.received))); }, state.received >= Number(item.quantity || 0))}</div>)}{!receivedByStudent.get(trackingStudentId)?.entries.length && <div className="ef-muted">Issue student records to enable item tracking.</div>}</section></div>}
      </>}
      {section === "summary" && <><div className="ef-heading"><div><strong>Collection Summary</strong><span>{academicTitle} Â· {periodTitle} Â· {classTitle}</span></div></div><div className="ef-summary">{[["Students", String(targetStudents.length)],["Fees Expected", formatGhs(totalBilled)],["Fees Received", formatGhs(totalReceived)],["Outstanding", formatGhs(totalOutstanding)],["Fully Paid", String(studentRows.filter(r => r.paidStatus === "paid").length)],["Items Complete", String(studentRows.filter(r => r.items?.total && r.items.received >= r.items.total).length)]].map(([name, value]) => <article key={name}><small>{name}</small><strong>{value}</strong></article>)}</div><p className="ef-help">The summary uses this class's issued invoices and linked successful student-fee payments. Payments without an invoice/academic-period link are not automatically allocated to a term.</p></>}
    </div>
    {editorOpen && <div className="ef-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setEditorOpen(false); }}><div role="dialog" aria-modal="true" aria-label="Edit term notice" className="ef-sheet large"><header><strong>Term Fees & Requirements</strong><button onClick={() => setEditorOpen(false)}>Ã—</button></header><p>{academicTitle} Â· {periodTitle} Â· {classTitle}</p><h3>Fees Payable</h3>{feeLines.map((line, i) => <div key={line.key} className="ef-edit-row"><input aria-label="Fee name" placeholder="Tuition, ICT, Examinationâ€¦" value={line.name} onChange={e => setFeeLines(rows => rows.map(r => r.key === line.key ? { ...r, name: e.target.value } : r))}/><input aria-label="Amount" type="number" min="0" step="0.01" placeholder="GHâ‚µ" value={line.amount} onChange={e => setFeeLines(rows => rows.map(r => r.key === line.key ? { ...r, amount: Number(e.target.value) } : r))}/><button aria-label={`Remove fee ${i + 1}`} onClick={() => setFeeLines(rows => rows.filter(r => r.key !== line.key))}>Ã—</button></div>)}{button("+ Fee", () => setFeeLines(rows => [...rows, { key: makeKey(), kind: "fee", name: "", amount: 0 }]))}<h3>Items to Bring / Purchase</h3>{requirementLines.map((line, i) => <div key={line.key} className="ef-item-edit"><div className="ef-edit-row"><input aria-label="Item name" placeholder="Exercise books, toiletriesâ€¦" value={line.name} onChange={e => setRequirementLines(rows => rows.map(r => r.key === line.key ? { ...r, name: e.target.value } : r))}/><input aria-label="Quantity" type="number" min="1" step="1" value={line.quantity || 1} onChange={e => setRequirementLines(rows => rows.map(r => r.key === line.key ? { ...r, quantity: Number(e.target.value) } : r))}/><button aria-label={`Remove item ${i + 1}`} onClick={() => setRequirementLines(rows => rows.filter(r => r.key !== line.key))}>Ã—</button></div><div className="ef-edit-row"><input aria-label="Unit" placeholder="Unit (pcs, rollsâ€¦)" value={line.unit || ""} onChange={e => setRequirementLines(rows => rows.map(r => r.key === line.key ? { ...r, unit: e.target.value } : r))}/><input aria-label="Instructions" placeholder="Textbook title or purchase instructions" value={line.instructions || ""} onChange={e => setRequirementLines(rows => rows.map(r => r.key === line.key ? { ...r, instructions: e.target.value } : r))}/></div><label className="ef-option"><input type="checkbox" checked={line.required !== false} onChange={e => setRequirementLines(rows => rows.map(r => r.key === line.key ? { ...r, required: e.target.checked } : r))} /> Required item</label></div>)}{button("+ Item", () => setRequirementLines(rows => [...rows, { key: makeKey(), kind: "requirement", name: "", amount: 0, quantity: 1, unit: "pcs", required: true }]))}
        {field("Payment / collection instructions", <input value={noticeNote} onChange={e => setNoticeNote(e.target.value)} placeholder="Pay at school office or use account details shown on receipts" />)}
        {field("Due date (optional)", <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />)}
        <div className="ef-actions">{button(busy ? "Savingâ€¦" : "Save Notice", saveNotice, busy)}{button("Cancel", () => setEditorOpen(false))}</div><p className="ef-help">Editing an already-issued term notice does not silently change existing invoices. Review and reissue records deliberately.</p></div></div>}
    {receivedEditor && <div className="ef-overlay"><section role="dialog" aria-modal="true" className="ef-sheet"><header><strong>Receive {receivedEditor.name}</strong><button onClick={() => setReceivedEditor(null)}>Ã—</button></header><p>Record an additional quantity received.</p>{field("Quantity", <input type="number" min="1" step="1" value={receiveQty} onChange={e => setReceiveQty(e.target.value)}/>)}{field("Optional note", <input value={receiveNote} onChange={e => setReceiveNote(e.target.value)} placeholder="Received by school office"/>)}<div className="ef-actions">{button("Save Receipt", receiveItem)}{button("Cancel", () => setReceivedEditor(null))}</div></section></div>}
    {paymentStudent && <div className="ef-overlay"><section role="dialog" aria-modal="true" className="ef-sheet"><header><strong>Record Fee Payment</strong><button onClick={() => setPaymentStudent(null)}>Ã—</button></header><p>{titleCase(paymentStudent.fullName)} Â· Balance {formatGhs(studentRow(paymentStudent).balance)}</p>{field("Amount (GHâ‚µ)", <input type="number" min="0.01" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}/>)}{field("Method", <select value={payMethod} onChange={e => setPayMethod(e.target.value as PaymentChannel)}><option value="cash">Cash</option><option value="momo">Mobile Money</option><option value="bank">Bank</option><option value="card">Card</option><option value="manual">Manual</option></select>)}{field("Reference (optional)", <input value={payReference} onChange={e => setPayReference(e.target.value)}/>)}<div className="ef-actions">{button("Save Payment", recordPayment)}{button("Cancel", () => setPaymentStudent(null))}</div></section></div>}
    {filterOpen && <div className="ef-overlay"><section role="dialog" aria-modal="true" className="ef-sheet"><header><strong>Filter Students</strong><button onClick={() => setFilterOpen(false)}>Ã—</button></header>{field("Fee status", <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All</option><option value="paid">Paid</option><option value="part">Part paid</option><option value="unpaid">Unpaid</option><option value="items_pending">Items pending</option></select>)}<div className="ef-actions">{button("Apply", () => setFilterOpen(false))}{button("Reset", () => { setStatusFilter("all"); setQuery(""); setFilterOpen(false); })}</div></section></div>}
    {moreOpen && <div className="ef-overlay"><section role="dialog" aria-modal="true" className="ef-sheet"><header><strong>More Actions</strong><button onClick={() => setMoreOpen(false)}>Ã—</button></header><div className="ef-actions">{button("Edit Notice", () => { setMoreOpen(false); openEditor(); })}{button("Issue Records", () => { setMoreOpen(false); void issueInvoices(); })}{button("Print Class Notice", () => { setMoreOpen(false); printNotice(); })}{button("Cards / Table", () => { setMoreOpen(false); setView(view === "table" ? "cards" : "table"); })}</div></section></div>}
    <div id="finance-term-notice-print" className="ef-print" aria-hidden="true">
      {printIds.map(studentKey => {
        const target = students.find(student => student.id === studentKey);
        const current = target ? studentRow(target) : null;
        return (
          <TermNoticePrintTemplate
            key={studentKey || "class"}
            schoolName={schoolName}
            branchName={branchName}
            schoolLogo={id((activeBranch as any)?.logo || (activeSchool as any)?.logo)}
            schoolMotto={id((activeSchool as any)?.motto)}
            schoolAddress={id((activeBranch as any)?.address || (activeSchool as any)?.address)}
            schoolPhone={id((activeBranch as any)?.phone || (activeSchool as any)?.phone)}
            primaryColor={id(settings?.primaryColor) || "#1e4f83"}
            academicStructure={academicTitle}
            academicPeriod={periodTitle}
            className={classTitle}
            studentName={target ? titleCase(target.fullName) : undefined}
            admissionNumber={target?.admissionNumber}
            fees={fees}
            requirements={requirements}
            dueDate={noticeMetadata?.dueDate}
            notice={noticeMetadata?.instructions}
            studentBalance={current?.invoice ? current.balance : undefined}
            issuedOn={today()}
          />
        );
      })}
    </div>
  </section>;

  function setTrackingForStudent(studentId: string) { setTrackingStudentId(studentId); }
}

const styles = `
.ef-page{color:var(--text,#142134);width:100%;min-width:0;}
.ef-page *{box-sizing:border-box;}
.ef-no-print{display:grid;gap:9px;min-width:0;}
.ef-selection{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;}
.ef-field{display:grid;gap:4px;min-width:0;font-size:11px;font-weight:700;color:var(--muted,#566475);}
.ef-field select,.ef-field input,.ef-edit-row input{width:100%;min-width:0;background:var(--surface,#fff);color:var(--text,#111827);border:1px solid var(--border,#d5dce5);border-radius:8px;padding:9px 10px;font-size:12px;outline-offset:2px;}
.ef-section-tabs{display:flex;gap:4px;overflow-x:auto;white-space:nowrap;border-bottom:1px solid var(--border,#d9e0e9);padding-bottom:6px;}
.ef-section-tabs button{flex:0 0 auto;border:0;background:transparent;color:var(--muted,#64748b);border-radius:7px;padding:8px 11px;font-weight:750;font-size:12px;cursor:pointer;}
.ef-section-tabs button.active{background:color-mix(in srgb,var(--primary-color,#2563eb) 12%,var(--surface,#fff));color:var(--text,#111827);}
.ef-heading{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;min-width:0;}
.ef-heading>div:first-child{display:grid;gap:3px;min-width:0;}.ef-heading strong{font-size:15px;}.ef-heading span{font-size:11px;color:var(--muted,#64748b);}
.ef-page button{cursor:pointer;font:inherit;font-size:12px;font-weight:750;border-radius:8px;border:1px solid var(--border,#d1d5db);padding:7px 10px;color:var(--text,#111827);background:var(--surface,#fff);}
.ef-page button:disabled{opacity:.45;cursor:not-allowed;}.ef-page .ef-primary{background:var(--primary-color,#2563eb);border-color:var(--primary-color,#2563eb);color:white;}
.ef-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0;}.ef-panel,.ef-student,.ef-summary article{border:1px solid var(--border,#d9e0e9);background:var(--card-bg,var(--surface,#fff));border-radius:12px;padding:12px;min-width:0;}
.ef-panel>header{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:850;margin-bottom:6px;}.ef-panel header span{font-size:10px;color:var(--muted,#64748b);font-weight:600;}
.ef-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 1px;font-size:12px;border-bottom:1px solid var(--border,#e5e7eb);min-width:0;}.ef-line>span{min-width:0;overflow-wrap:anywhere;}.ef-line b{font-variant-numeric:tabular-nums;white-space:nowrap;}.ef-line small{display:block;color:var(--muted,#64748b);font-size:10px;margin-top:3px;}.ef-line.total{font-size:13px;border:0;}
.ef-muted,.ef-empty{padding:22px 12px;text-align:center;color:var(--muted,#64748b);font-size:12px;}.ef-help{font-size:11px;color:var(--muted,#64748b);margin:2px 0;line-height:1.5;}
.ef-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}.ef-actions.compact{margin:0;}.ef-message{background:color-mix(in srgb,var(--primary-color,#2563eb) 8%,var(--surface,#fff));padding:8px 10px;border:1px solid var(--border,#d1d5db);border-radius:9px;font-size:12px;display:flex;justify-content:space-between;cursor:pointer;}
.ef-table-wrap{width:100%;min-width:0;overflow-x:auto;}.ef-table{width:100%;min-width:700px;border-collapse:collapse;font-size:12px;}.ef-table th,.ef-table td{padding:10px 7px;border-bottom:1px solid var(--border,#e5e7eb);text-align:left;}.ef-table th{background:var(--surface,#fff);color:var(--muted,#64748b);font-size:11px;}.ef-table td small{display:block;color:var(--muted,#64748b);}.ef-table td:last-child{white-space:nowrap;}.ef-table td button{padding:5px 7px;font-size:10px;}
.ef-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}.ef-student{display:grid;gap:8px;}.ef-student-head{display:flex;flex-direction:column;gap:2px;font-size:13px;}.ef-student-head small{color:var(--muted,#64748b);font-size:11px;}.ef-metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px;}.ef-metrics>span{display:grid;gap:3px;font-size:10px;color:var(--muted,#64748b);}.ef-metrics b{font-size:12px;color:var(--text,#142134);}
.ef-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}.ef-summary article{display:grid;gap:8px;}.ef-summary small{font-size:11px;color:var(--muted,#64748b);}.ef-summary strong{font-size:18px;}
.ef-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(15,23,42,.55);backdrop-filter:blur(5px);z-index:10000;}
.ef-sheet{display:grid;gap:12px;background:var(--surface,#fff);color:var(--text,#111827);border:1px solid var(--border,#d1d5db);border-radius:15px;padding:17px;width:min(100%,470px);max-height:calc(100vh - 32px);overflow-y:auto;box-shadow:0 20px 70px rgba(0,0,0,.25);}
.ef-sheet.large{width:min(100%,740px);}.ef-sheet>header{display:flex;justify-content:space-between;align-items:center;gap:12px;}.ef-sheet>header strong{font-size:16px;}.ef-sheet>header button{width:34px;height:34px;min-width:34px;font-size:22px;display:grid;place-items:center;padding:0;}.ef-sheet h3{margin:0;font-size:13px;}.ef-sheet p{margin:0;font-size:12px;color:var(--muted,#64748b);}
.ef-edit-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,.7fr) 32px;gap:5px;align-items:center;}.ef-edit-row>button{padding:0;height:32px;font-size:20px;}.ef-item-edit{display:grid;gap:5px;border:1px solid var(--border,#e5e7eb);border-radius:9px;padding:7px;}.ef-item-edit .ef-edit-row:nth-child(2){grid-template-columns:minmax(0,1fr) minmax(0,2fr);}.ef-option{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted,#64748b);}.ef-option input{width:15px;height:15px;}
.ef-print{display:none;}
@media(max-width:1050px){.ef-cards{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:700px){.ef-selection{grid-template-columns:1fr 1fr;}.ef-field:last-child:nth-child(3){grid-column:span 2;}.ef-grid{grid-template-columns:1fr;}.ef-cards{grid-template-columns:1fr;}.ef-summary{grid-template-columns:repeat(2,minmax(0,1fr));}.ef-sheet{align-self:flex-end;width:100%;border-radius:17px 17px 0 0;max-height:90vh;}.ef-overlay{padding:0;}.ef-heading strong{font-size:14px;}.ef-summary strong{font-size:16px;}}
@media print{
 @page{size:A4 portrait;margin:11mm;}
 body *{visibility:hidden!important;}
 #finance-term-notice-print,#finance-term-notice-print *{visibility:visible!important;}
 #finance-term-notice-print{display:block!important;position:absolute!important;top:0;left:0;width:100%;background:white!important;color:#111827!important;}
 .ef-print-sheet{break-after:page;page-break-after:always;padding:5mm 0;background:#fff;color:#111827;font-family:Arial,sans-serif;}
 .ef-print-sheet header{text-align:center;border-bottom:2px solid #111827;padding-bottom:12px;}.ef-print-sheet header strong{display:block;font-size:23px;text-transform:uppercase;}.ef-print-sheet header span{display:block;font-size:12px;}.ef-print-sheet header h2{font-size:15px;margin:12px 0 4px;}.ef-print-sheet header p{font-size:12px;margin:5px 0;}.ef-print-sheet h3{font-size:14px;margin:19px 0 6px;}.ef-print-sheet table{width:100%;border-collapse:collapse;}.ef-print-sheet td,.ef-print-sheet th{border:1px solid #111827;padding:8px;font-size:12px;text-align:left;}.ef-print-sheet td:nth-child(2){min-width:90px;}.ef-print-sheet footer{font-size:10px;margin-top:26px;text-align:center;}.ef-print-note{font-size:11px;margin-top:14px;}
}
`;