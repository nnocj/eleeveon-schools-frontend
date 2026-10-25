"use client";

/**
 * Eleeveon Schools — Term Fees & Requirements, V1.
 * Uses the existing synchronized feeStructures, studentFeeInvoices,
 * studentFeeInvoiceItems and studentFeePayments stores. No schema version bump.
 * Non-cash requirements are always zero-value invoice items; delivery counts
 * are encoded in the existing description string and never change fee totals.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import TermNoticePrintTemplate from "./TermNoticePrintTemplate";
import StudentTrackingPrintTemplate, { type TrackingPrintRow } from "./StudentTrackingPrintTemplate";
import BranchReportPreview, { BranchReportZoomControls, BranchReportZoomProvider } from "../../../components/role-portals/shell/BranchReportPreview";
import { FINANCE_CURRENCIES, formatFinanceMoney } from "./financeCurrency";
import { useSettings } from "../../../context/settings-context";
import { useActiveBranch } from "../../../context/active-branch-context";
import { useBranchWorkspaceScope } from "../../../hooks/useBranchWorkspaceScope";
import { useBranchTableRevision } from "../../../hooks/useBranchTableRevision";
import { useEntityMediaUrls } from "../../../hooks/useEntityMediaUrls";
import { useRegisterBranchWorkspaceToolbar } from "../../../components/role-portals/shell/BranchWorkspaceToolbar";
import { createLocal, updateLocal, listActiveLocal } from "../../../lib/sync/syncUtils";
import type {
  AcademicPeriod, AcademicStructure, Class, Organization, FeeStructure, FeeStructureItem,
  Student, StudentEnrollment, StudentFeeInvoice, StudentFeeInvoiceItem,
  StudentFeePayment, PaymentChannel,
} from "../../../lib/db/db";

const MARKER = "ELEEVEON_REQUIREMENT_V1:";
const NOTICE_MARKER = "ELEEVEON_TERM_NOTICE_V1";
type Section = "notices" | "tracking";
type RequirementEvent = { quantity: number; at: string; note?: string };
type RequirementState = { sourceKey: string; unit: string; required: boolean; instructions?: string; received: number; events: RequirementEvent[] };
type DraftLine = FeeStructureItem & { key: string };
type Scope = { accountId: string; schoolId: string; branchId: string };
const id = (v: unknown) => String(v ?? "").trim();
const money = (n: unknown) => Math.round(Math.max(0, Number(n) || 0) * 100) / 100;
const titleCase = (s: unknown) => id(s).toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a, b) => a + b.toUpperCase());

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

export default function TermFeesRequirements({ mode = "notices" }: { mode?: Section }) {
  const workspace = useBranchWorkspaceScope() as any;
  const { settings } = useSettings() as any;
  const { activeSchool, activeBranch } = useActiveBranch() as any;
  const { accountId, schoolId, branchId, authenticated, ready, restoring, branchLoading } = workspace;
  const scope = useMemo<Scope | null>(() => accountId && schoolId && branchId ? { accountId: id(accountId), schoolId: id(schoolId), branchId: id(branchId) } : null, [accountId, schoolId, branchId]);
  const revision = useBranchTableRevision(["feeStructures", "studentFeeInvoices", "studentFeeInvoiceItems", "studentFeePayments", "students", "studentEnrollments", "classes", "organizations", "academicStructures", "academicPeriods", "mediaAssets", "mediaBlobs"]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [noticeRows, setNoticeRows] = useState<FeeStructure[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  // Batch application is deliberately class-scoped: one canonical feeStructure
  // per class/term, no duplicate shared fee record or duplicate student billing.
  const [batchMode, setBatchMode] = useState<"single" | "selected" | "organization">("single");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [appliedClassIds, setAppliedClassIds] = useState<string[]>([]);
  const [structures, setStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [invoices, setInvoices] = useState<StudentFeeInvoice[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<StudentFeeInvoiceItem[]>([]);
  const [payments, setPayments] = useState<StudentFeePayment[]>([]);
  const section = mode;
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
  const [printJobs, setPrintJobs] = useState<Array<{ classId: string; studentId?: string }>>([]);
  const [trackingPrintRows, setTrackingPrintRows] = useState<TrackingPrintRow[] | null>(null);
  const [individualPrintPickerOpen, setIndividualPrintPickerOpen] = useState(false);
  const [individualPrintStudentId, setIndividualPrintStudentId] = useState("");
  const [canPortal, setCanPortal] = useState(false);
  const [currencyCode, setCurrencyCode] = useState("GHS");
  const [currencySettings, setCurrencySettings] = useState<Array<{currencyCode?: string;defaultForFees?: boolean;active?: boolean}>>([]);
  const [payPickerOpen, setPayPickerOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [payPickerStudentId, setPayPickerStudentId] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  // Like Assessment Entries, Term Notices starts with a class browser.
  const [openedNoticeClass, setOpenedNoticeClass] = useState(false);
  // Fee Tracking has its own class browser; keep its navigation independent
  // from Term Notices while reusing the same compact class-card design.
  const [openedTrackingClass, setOpenedTrackingClass] = useState(false);
  const [trackingPreviewRows, setTrackingPreviewRows] = useState<TrackingPrintRow[] | null>(null);
  // The preview is separate from the document-only print root. Users can
  // inspect a general class notice or every student's personalised notice.
  const [previewMode, setPreviewMode] = useState<"class" | "batch" | "student" | "classes" | "all_students" | null>(null);
  const [previewStudentId, setPreviewStudentId] = useState("");
  const resolvedMediaById = useEntityMediaUrls({
    accountId,
    ownerTable: "students",
    rows: students,
    fields: [{ fieldKey: "photo", mediaIdKey: "photoMediaId" }],
  });
  const studentPhoto = (student: Student) =>
    resolvedMediaById[id(student.id)]?.photo ||
    (!student.photoMediaId && student.photo && !student.photo.startsWith("blob:") ? student.photo : "");
  const studentAvatar = (student: Student) => {
    const photo = studentPhoto(student);
    return <span className="ef-avatar" aria-label={`${titleCase(student.fullName)} photo`}>
      {photo ? <img src={photo} alt="" loading="lazy" /> : <span aria-hidden="true">{titleCase(student.fullName).charAt(0) || "S"}</span>}
    </span>;
  };

  useEffect(() => { setCanPortal(true); }, []);
  // Keep body and shell content behind the modal; restore previous scroll values on exit.
  const anyFinanceDialogOpen = Boolean(trackingStudentId || payPickerOpen || editorOpen || receivedEditor ||
    paymentStudent || filterOpen || summaryOpen || moreOpen || individualPrintPickerOpen ||
    previewMode || trackingPreviewRows);
  useEffect(() => {
    if (!anyFinanceDialogOpen || typeof document === "undefined") return;
    const previousBody = document.body.style.overflow;
    const previousHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBody;
      document.documentElement.style.overflow = previousHtml;
    };
  }, [anyFinanceDialogOpen]);

  useEffect(() => {
    if (typeof window !== "undefined") setView(window.matchMedia("(min-width: 900px)").matches ? "table" : "cards");
  }, []);

  const load = useCallback(async () => {
    if (!scope || !authenticated || !ready) { setLoading(false); return; }
    try {
      setLoading(true);
      const [a, b, c, d, e, f, g, h, i, j, k] = await Promise.all([
        readRows<FeeStructure>("feeStructures"), readRows<Student>("students"),
        readRows<StudentEnrollment>("studentEnrollments"), readRows<Class>("classes"),
        readRows<AcademicStructure>("academicStructures"), readRows<AcademicPeriod>("academicPeriods"),
        readRows<StudentFeeInvoice>("studentFeeInvoices"), readRows<StudentFeeInvoiceItem>("studentFeeInvoiceItems"),
        readRows<StudentFeePayment>("studentFeePayments"),
        readRows<any>("schoolCurrencySettings"),
        readRows<Organization>("organizations"),
      ]);
      setNoticeRows(a.filter(row => isTenant(row, scope)));
      setStudents(b.filter(row => isTenant(row, scope) && row.status !== "withdrawn"));
      setEnrollments(c.filter(row => isTenant(row, scope) && row.status !== "withdrawn"));
      setClasses(d.filter(row => isTenant(row, scope)).sort((x, y) => x.name.localeCompare(y.name)));
      setOrganizations(k.filter(row => isTenant(row, scope)).sort((x, y) => x.name.localeCompare(y.name)));
      setStructures(e.filter(row => isTenant(row, scope)).sort((x, y) => x.name.localeCompare(y.name)));
      setPeriods(f.filter(row => isTenant(row, scope)).sort((x, y) => Number(x.order || 0) - Number(y.order || 0)));
      setInvoices(g.filter(row => isTenant(row, scope)));
      setInvoiceItems(h.filter(row => isTenant(row, scope)));
      setPayments(i.filter(row => isTenant(row, scope)));
      setCurrencySettings(j.filter((row: any) => isTenant(row, scope)));
    } catch (e) { console.error("Finance load failed", e); setMessage("Could not load the branch's finance records."); }
    finally { setLoading(false); }
  }, [scope, authenticated, ready]);
  useEffect(() => { void load(); }, [load, revision]);
  useEffect(() => {
    if (!structures.length) return;
    setStructureId(current => structures.some(row => row.id === current) ? current :
      (structures.some(row => row.id === id(settings?.currentAcademicStructureId)) ? id(settings?.currentAcademicStructureId) :
      structures.find(row => periods.some(p => p.academicStructureId === row.id && p.startDate && p.endDate &&
        String(p.startDate).slice(0, 10) <= today() && String(p.endDate).slice(0, 10) >= today()))?.id || structures[0].id));
  }, [structures, periods, settings?.currentAcademicStructureId]);
  const visiblePeriods = useMemo(() => periods.filter(p => !structureId || p.academicStructureId === structureId), [periods, structureId]);
  useEffect(() => {
    setPeriodId(current => visiblePeriods.some(p => p.id === current) ? current :
      (visiblePeriods.some(p => p.id === id(settings?.currentAcademicPeriodId)) ? id(settings?.currentAcademicPeriodId) :
      visiblePeriods.find(row => row.startDate && row.endDate &&
        String(row.startDate).slice(0, 10) <= today() && String(row.endDate).slice(0, 10) >= today())?.id || visiblePeriods[0]?.id || ""));
  }, [visiblePeriods, settings?.currentAcademicPeriodId]);
  useEffect(() => { if (!classes.some(c => c.id === classId)) setClassId(classes[0]?.id || ""); }, [classes, classId]);

  // Prefer the selected student's current class, then their most recent enrollment;
  // avoid issuing the same student twice for multiple old period enrollments.
  const latestClassByStudent = useMemo(() => {
    const latest = new Map<string, StudentEnrollment>();
    [...enrollments].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).forEach(e => {
      if (!latest.has(e.studentId)) latest.set(e.studentId, e);
    });
    return new Map(students.map(student => [student.id, id(student.currentClassId) || id(latest.get(student.id)?.classId)]));
  }, [students, enrollments]);
  const studentsForClass = (targetClassId: string) => students
    .filter(student => latestClassByStudent.get(student.id) === targetClassId)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const targetStudents = useMemo(() => studentsForClass(classId), [students, latestClassByStudent, classId]);
  const eligibleClasses = classes;
  const editTargetClassIds = batchMode === "single" ? (classId ? [classId] : [])
    : batchMode === "selected" ? eligibleClasses.filter(row => selectedClassIds.includes(row.id)).map(row => row.id)
    : eligibleClasses.filter(row => row.organizationId && row.organizationId === selectedOrganizationId).map(row => row.id);
  const getNoticeForClass = (targetClassId: string): FeeStructure | undefined => noticeRows
    .filter(row => id(row.academicStructureId) === structureId && id(row.academicPeriodId) === periodId && id(row.classId) === targetClassId)
    .sort((a, b) => {
      const aNotice = (a.items || []).some(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
      const bNotice = (b.items || []).some(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
      return Number(bNotice) - Number(aNotice) || (b.updatedAt || 0) - (a.updatedAt || 0);
    })[0];
  const classLabel = (targetClassId: string) => classes.find(row => row.id === targetClassId)?.name || "Class";
  const selectedStructure = structures.find(r => r.id === structureId);
  const selectedPeriod = periods.find(r => r.id === periodId);
  // Opening a class card always starts with the school's CURRENT academic
  // context, not the last period browsed in the filter or notice editor.
  // Prefer the configured academic calendar; dates are a safe fallback only.
  const currentAcademicContext = useMemo(() => {
    const configuredPeriod = periods.find(row => row.id === id(settings?.currentAcademicPeriodId));
    const configuredStructure = structures.find(row => row.id === id(settings?.currentAcademicStructureId));
    const now = today();
    const datedPeriod = periods.find(row => row.startDate && row.endDate &&
      String(row.startDate).slice(0, 10) <= now && String(row.endDate).slice(0, 10) >= now);
    const confirmed = Boolean(configuredPeriod || datedPeriod);
    const period = configuredPeriod || datedPeriod ||
      periods.find(row => row.academicStructureId === configuredStructure?.id) || periods[0];
    const structure = structures.find(row => row.id === period?.academicStructureId) || configuredStructure || structures[0];
    return { structureId: structure?.id || "", periodId: period?.id || "",
      structureName: structure?.name || "Academic structure not set",
      periodName: period?.name || "Academic period not set", confirmed };
  }, [structures, periods, settings?.currentAcademicStructureId, settings?.currentAcademicPeriodId]);
  const openCurrentClass = (targetClassId: string) => {
    if (currentAcademicContext.structureId) setStructureId(currentAcademicContext.structureId);
    if (currentAcademicContext.periodId) setPeriodId(currentAcademicContext.periodId);
    setClassId(targetClassId);
    setAppliedClassIds([]);
    setOpenedNoticeClass(true);
  };
  const openTrackingClass = (targetClassId: string) => {
    if (currentAcademicContext.structureId) setStructureId(currentAcademicContext.structureId);
    if (currentAcademicContext.periodId) setPeriodId(currentAcademicContext.periodId);
    setClassId(targetClassId);
    // Search in the class browser is for class names; clear it before showing students.
    setQuery("");
    setStatusFilter("all");
    setOpenedTrackingClass(true);
  };
  const closeTrackingClass = () => {
    setOpenedTrackingClass(false);
    setQuery("");
    setStatusFilter("all");
  };
  const selectedIsCurrent = currentAcademicContext.confirmed && structureId === currentAcademicContext.structureId &&
    periodId === currentAcademicContext.periodId;
  // Only show a next-term figure if that period and its fee structure truly exist.
  const currentPeriodIndex = visiblePeriods.findIndex(r => r.id === periodId);
  const withinStructureNext = currentPeriodIndex >= 0 ? visiblePeriods[currentPeriodIndex + 1] : undefined;
  // Term 3 may be followed by Term 1 in the NEXT academic year. Only use an
  // actual future period with a valid start date; never make up a new period.
  const selectedPeriodForNext = periods.find(row => row.id === periodId);
  const currentPeriodEnd = selectedPeriodForNext?.endDate ? Date.parse(selectedPeriodForNext.endDate) : NaN;
  const nextAcademicYearPeriod = Number.isFinite(currentPeriodEnd) ? periods
    .filter(row => row.id !== periodId && Number.isFinite(Date.parse(row.startDate)) && Date.parse(row.startDate) >= currentPeriodEnd)
    .sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))[0] : undefined;
  const nextPeriod = withinStructureNext || nextAcademicYearPeriod;
  const nextStructureName = structures.find(row => row.id === nextPeriod?.academicStructureId)?.name;
  const getNoticeForPeriod = (targetClassId: string, targetPeriodId: string, targetStructureId: string): FeeStructure | undefined => noticeRows
    .filter(row => id(row.academicStructureId) === targetStructureId && id(row.academicPeriodId) === targetPeriodId && id(row.classId) === targetClassId)
    .sort((a, b) => {
      const markedA = (a.items || []).some(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
      const markedB = (b.items || []).some(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
      return Number(markedB) - Number(markedA) || (b.updatedAt || 0) - (a.updatedAt || 0);
    })[0];

  const selectedClass = classes.find(r => r.id === classId);
  // Reuse the canonical fee structure for this class/term. Creating a second
  // feeStructure could double-count charges in the existing Fees module.
  // Prefer an already tagged notice if several legacy records exist.
  const notice = useMemo(() => getNoticeForClass(classId), [noticeRows, structureId, periodId, classId]);
  const noticeMetadata = (notice?.items || []).find(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
  const preferredCurrency = id(currencySettings.find(row => row.defaultForFees)?.currencyCode || currencySettings[0]?.currencyCode) || "GHS";
  // Stored in the metadata item's description because feeStructures.items is already
  // a synchronized JSON array; no backend schema changes are required.
  const noticeCurrency = id(noticeMetadata?.description) || preferredCurrency;
  const formatAmount = (amount: number) => formatFinanceMoney(amount, noticeCurrency);
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

  // Keep the notice editor tied to its selected academic period and class.
  // Changing any selector loads that target's existing notice (or a clean draft),
  // rather than accidentally carrying another period's fees into a new notice.
  const loadEditorDraft = (targetStructureId: string, targetPeriodId: string, targetClassId: string) => {
    const targetNotice = targetStructureId && targetPeriodId && targetClassId
      ? getNoticeForPeriod(targetClassId, targetPeriodId, targetStructureId)
      : undefined;
    const targetItems = targetNotice?.items || [];
    const targetMeta = targetItems.find(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
    setCurrencyCode(id(targetMeta?.description) || preferredCurrency);
    setNoticeNote(targetMeta?.instructions || "");
    setDueDate(targetMeta?.dueDate || "");
    setFeeLines(targetItems.filter(item => !isRequirement(item) && !isNoticeMeta(item))
      .map(item => ({ ...item, key: makeKey() })));
    setRequirementLines(targetItems.filter(isRequirement)
      .map(item => ({ ...item, key: makeKey() })));
  };

  const chooseEditorStructure = (nextStructureId: string) => {
    const matchingPeriods = periods.filter(row => row.academicStructureId === nextStructureId);
    const nextPeriodId = matchingPeriods.some(row => row.id === periodId)
      ? periodId : matchingPeriods[0]?.id || "";
    setStructureId(nextStructureId);
    setPeriodId(nextPeriodId);
    loadEditorDraft(nextStructureId, nextPeriodId, classId);
  };
  const chooseEditorPeriod = (nextPeriodId: string) => {
    setPeriodId(nextPeriodId);
    loadEditorDraft(structureId, nextPeriodId, classId);
  };
  const chooseEditorClass = (nextClassId: string) => {
    setClassId(nextClassId);
    setBatchMode("single");
    setSelectedClassIds(nextClassId ? [nextClassId] : []);
    loadEditorDraft(structureId, periodId, nextClassId);
  };

  const openEditor = () => {
    // The editor itself must open even when a period or class is not selected.
    // saveNotice already validates required targets before saving.
    if (!scope) return;
    setBatchMode("single");
    setSelectedClassIds(classId ? [classId] : []);
    setSelectedOrganizationId("");
    loadEditorDraft(structureId, periodId, classId);
    setEditorOpen(true);
  };
  const saveNotice = async () => {
    if (!scope || !structureId || !periodId) {
      setMessage("Choose an academic structure and period before saving."); return;
    }
    const targetIds = [...new Set(editTargetClassIds)].filter(cid => eligibleClasses.some(row => row.id === cid));
    if (!targetIds.length) { setMessage("Choose at least one class or an organization with classes."); return; }
    const validFees = feeLines.filter(item => id(item.name)).map(({ key: _key, ...r }) => ({ ...r, kind: "fee" as const, amount: money(r.amount) }));
    const validReqs = requirementLines.filter(item => id(item.name)).map(({ key: _key, ...r }) => ({ ...r, kind: "requirement" as const, amount: 0, quantity: Math.max(1, Math.floor(Number(r.quantity) || 1)) }));
    if (!validFees.length && !validReqs.length) { setMessage("Add a fee or required item."); return; }
    if (validFees.some(row => row.amount <= 0)) { setMessage("Fees must have positive amounts."); return; }
    const nextTotal = money(validFees.reduce((sum, line) => sum + line.amount, 0));
    const freshInvoices = (await readRows<StudentFeeInvoice>("studentFeeInvoices")).filter(row => isTenant(row, scope));
    // Prevent hidden repricing of students who already received invoices.
    const blocked = targetIds.filter(cid => freshInvoices.some(inv =>
      id(inv.classId) === cid && id(inv.academicStructureId) === structureId && id(inv.academicPeriodId) === periodId &&
      inv.status !== "void" && inv.status !== "cancelled" &&
      (Math.abs(money(inv.total) - nextTotal) > 0.005 || Boolean(inv.currencyCode && inv.currencyCode !== currencyCode))
    ));
    if (blocked.length) {
      setMessage(`Cannot overwrite billed amounts or currencies for ${blocked.map(classLabel).join(", ")}. Existing invoices and payments are protected. Select unaffected classes or review those invoices first.`);
      return;
    }
    if (targetIds.length > 1 && !window.confirm(`Apply the same fees and materials to ${targetIds.length} classes: ${targetIds.map(classLabel).join(", ")}? Existing invoices and payments will not be changed.`)) return;
    try {
      setBusy(true);
      let completed: string[] = [];
      // Fetch before writing, to avoid duplicating a notice if another device
      // created one since this workspace was opened.
      const latestNotices = (await readRows<FeeStructure>("feeStructures")).filter(row => isTenant(row, scope));
      for (const cid of targetIds) {
        const candidates = latestNotices.filter(row => id(row.classId) === cid && id(row.academicStructureId) === structureId && id(row.academicPeriodId) === periodId)
          .sort((a, b) => Number((b.items || []).some(item => isNoticeMeta(item) && item.name === NOTICE_MARKER)) - Number((a.items || []).some(item => isNoticeMeta(item) && item.name === NOTICE_MARKER)) || (b.updatedAt || 0) - (a.updatedAt || 0));
        const existing = candidates[0];
        const items: FeeStructureItem[] = [
          { kind: "notice_meta", name: NOTICE_MARKER, amount: 0, instructions: id(noticeNote).slice(0, 1000), dueDate: id(dueDate), description: currencyCode },
          ...validFees.map(line => ({ ...line, itemKey: line.itemKey || makeKey() })),
          ...validReqs.map(line => ({ ...line, itemKey: line.itemKey || makeKey() })),
        ];
        if (existing) await updateLocal("feeStructures", existing.id, { items });
        else await createLocal("feeStructures", { ...scope, classId: cid, academicStructureId: structureId, academicPeriodId: periodId, items } as FeeStructure);
        completed.push(cid);
      }
      setAppliedClassIds(completed);
      setClassId(completed[0] || classId);
      setOpenedNoticeClass(true);
      setEditorOpen(false);
      await load();
      setMessage(`Notice saved for ${completed.length} ${completed.length === 1 ? "class" : "classes"}: ${completed.map(classLabel).join(", ")}. You can preview, print, or issue student records.`);
    } catch (error) {
      console.error("Unable to save class batch", error);
      await load();
      setMessage("Some class notices may have saved. Reopen and verify the targeted classes before retrying; existing records were not deleted.");
    } finally { setBusy(false); }
  };

  const issueInvoices = async () => {
    if (!scope || !structureId || !periodId || !requireScope()) return;
    const classIds = section === "notices" && appliedClassIds.length ? appliedClassIds : [classId];
    const jobs = classIds.flatMap(cid => studentsForClass(cid).map(student => ({ cid, student })));
    if (!jobs.length) { setMessage("There are no students in the selected classes."); return; }
    if (!window.confirm(`Create missing student invoices and material checklists for ${jobs.length} students across ${classIds.length} class(es)? Existing invoices and payments will be kept.`)) return;
    try {
      setBusy(true);
      const freshInvoices = (await readRows<StudentFeeInvoice>("studentFeeInvoices")).filter(row => isTenant(row, scope));
      const freshItems = (await readRows<StudentFeeInvoiceItem>("studentFeeInvoiceItems")).filter(row => isTenant(row, scope));
      const classNotices = new Map(classIds.map(cid => [cid, getNoticeForClass(cid)]));
      const missing = classIds.filter(cid => !classNotices.get(cid));
      if (missing.length) { setMessage(`Save notices for ${missing.map(classLabel).join(", ")} before issuing records.`); return; }
      const incompatible = jobs.find(({ cid, student }) => {
        const n = classNotices.get(cid)!;
        const meta = (n.items || []).find(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
        const code = id(meta?.description) || preferredCurrency;
        const due = freshInvoices.find(row => row.studentId === student.id && id(row.classId) === cid && id(row.academicStructureId) === structureId && id(row.academicPeriodId) === periodId && row.status !== "void" && row.status !== "cancelled");
        return due && due.currencyCode && due.currencyCode !== code;
      });
      if (incompatible) { setMessage(`Currency conflict for ${classLabel(incompatible.cid)}. Existing invoices are preserved.`); return; }
      let created = 0;
      for (const { cid, student } of jobs) {
        const n = classNotices.get(cid)!;
        const meta = (n.items || []).find(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
        const code = id(meta?.description) || preferredCurrency;
        const payable = money((n.items || []).filter(item => !isRequirement(item) && !isNoticeMeta(item)).reduce((total, line) => total + money(line.amount), 0));
        let invoice = freshInvoices.find(row => row.studentId === student.id && id(row.classId) === cid && id(row.academicStructureId) === structureId && id(row.academicPeriodId) === periodId && row.status !== "void" && row.status !== "cancelled");
        const alreadyIssued = Boolean(invoice);
        if (!invoice) {
          const invoiceNumber = `EFE-${id(selectedPeriod?.name).replace(/\W/g, "").slice(0, 5).toUpperCase() || "TERM"}-${student.id.slice(0, 8)}-${Date.now().toString(36).slice(-5)}-${Math.random().toString(36).slice(2, 5)}`;
          invoice = await createLocal("studentFeeInvoices", { ...scope, studentId: student.id, classId: cid, academicStructureId: structureId, academicPeriodId: periodId, invoiceNumber, currencyCode: code, subtotal: payable, total: payable, amountPaid: 0, balance: payable, status: "issued", issueDate: today() } as StudentFeeInvoice) as StudentFeeInvoice;
          freshInvoices.push(invoice);
          created++;
        }
        const existingForInvoice = freshItems.filter(row => row.invoiceId === invoice!.id);
        for (let index = 0; index < (n.items || []).length; index++) {
          const item = n.items[index];
          if (!item || isNoticeMeta(item) || (alreadyIssued && !isRequirement(item))) continue;
          const sourceKey = item.itemKey || `${n.id}:${index}`;
          const found = existingForInvoice.some(row => row.feeStructureId === n.id && (parseRequirement(row.description)?.sourceKey === sourceKey || (!isRequirement(item) && row.name === item.name && row.amount === money(item.amount))));
          if (found) continue;
          const description = isRequirement(item) ? serializeRequirement({ sourceKey, unit: id(item.unit) || "pcs", required: item.required !== false, instructions: item.instructions, received: 0, events: [] }) : undefined;
          const saved = await createLocal("studentFeeInvoiceItems", { ...scope, invoiceId: invoice.id, feeStructureId: n.id, currencyCode: code, name: item.name, description, quantity: isRequirement(item) ? Math.max(1, Number(item.quantity) || 1) : 1, unitAmount: isRequirement(item) ? 0 : money(item.amount), amount: isRequirement(item) ? 0 : money(item.amount), required: item.required !== false, order: index + 1 } as StudentFeeInvoiceItem) as StudentFeeInvoiceItem;
          freshItems.push(saved); existingForInvoice.push(saved);
        }
      }
      await load();
      setMessage(`Prepared ${jobs.length} student records across ${classIds.length} classes, including ${created} new invoices. Existing payments were preserved.`);
    } catch (error) {
      console.error(error);
      setMessage("Some records could not be issued. Review payment history before retrying; existing invoices are checked before new ones are created.");
      await load();
    } finally { setBusy(false); }
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
    if (!Number.isFinite(amount) || amount <= 0 || amount > row.balance + 0.005) { setMessage(`Enter an amount between ${formatFinanceMoney(0.01, invoice.currencyCode || noticeCurrency)} and ${formatFinanceMoney(row.balance, invoice.currencyCode || noticeCurrency)}.`); return; }
    try {
      setBusy(true);
      await createLocal("studentFeePayments", { ...scope, invoiceId: invoice.id, studentId: paymentStudent.id, currencyCode: invoice.currencyCode || noticeCurrency, amount: money(amount), method: payMethod, status: "paid", date: today(), paidAt: new Date().toISOString(), referenceNumber: id(payReference) || undefined } as StudentFeePayment);
      const settled = money(row.paid + amount);
      await updateLocal("studentFeeInvoices", invoice.id, { amountPaid: settled, balance: money(Math.max(0, row.billed - settled)), status: settled + 0.005 >= row.billed ? "paid" : "part_paid", paidAt: settled + 0.005 >= row.billed ? today() : undefined });
      setPaymentStudent(null); setPayAmount(""); setPayReference(""); setMessage("Payment recorded."); await load();
    } catch (e) { console.error(e); setMessage("Payment could not be saved. Check payment history before retrying."); }
    finally { setBusy(false); }
  };

  type NoticeJob = { classId: string; studentId?: string };
  const previewJobs: NoticeJob[] = previewMode === "classes" ? (appliedClassIds.length ? appliedClassIds : [classId]).map(cid => ({ classId: cid }))
    : previewMode === "all_students" ? (appliedClassIds.length ? appliedClassIds : [classId]).flatMap(cid => studentsForClass(cid).map(student => ({ classId: cid, studentId: student.id })))
    : previewMode === "batch" ? targetStudents.map(student => ({ classId, studentId: student.id }))
    : previewMode === "student" ? [{ classId, studentId: previewStudentId }]
    : [{ classId }];
  const openPreview = (kind: NonNullable<typeof previewMode>, studentId = "") => {
    const ids = (kind === "classes" || kind === "all_students") && appliedClassIds.length ? appliedClassIds : [classId];
    if (ids.some(cid => !getNoticeForClass(cid))) { setMessage("Save a notice for every selected class before previewing."); return; }
    if ((kind === "batch" || kind === "all_students") && !ids.some(cid => studentsForClass(cid).length)) {
      setMessage("No students belong to those classes yet."); return;
    }
    setPreviewStudentId(studentId);
    setPreviewMode(kind);
  };
  const renderDocument = (job: NoticeJob, key: string) => {
    const documentNotice = getNoticeForClass(job.classId);
    if (!documentNotice) return null;
    const documentFees = (documentNotice.items || []).filter(item => !isRequirement(item) && !isNoticeMeta(item));
    const documentRequirements = (documentNotice.items || []).filter(isRequirement);
    const meta = (documentNotice.items || []).find(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
    const documentCurrency = id(meta?.description) || preferredCurrency;
    const student = job.studentId ? students.find(row => row.id === job.studentId) : undefined;
    const nextNotice = nextPeriod ? getNoticeForPeriod(job.classId, nextPeriod.id, id(nextPeriod.academicStructureId)) : undefined;
    const nextItems = nextNotice?.items || [];
    const nextFees = nextItems.filter(item => !isRequirement(item) && !isNoticeMeta(item));
    const nextRequirements = nextItems.filter(isRequirement);
    const nextMeta = nextItems.find(item => isNoticeMeta(item) && item.name === NOTICE_MARKER);
    const nextCurrency = id(nextMeta?.description) || preferredCurrency;
    const studentInvoice = student && invoices.find(inv => inv.studentId === student.id && id(inv.classId) === job.classId && id(inv.academicStructureId) === structureId && id(inv.academicPeriodId) === periodId && inv.status !== "void" && inv.status !== "cancelled");
    const paid = studentInvoice ? payments.filter(pay => pay.invoiceId === studentInvoice.id && pay.status === "paid").reduce((a, pay) => a + money(pay.amount), 0) : 0;
    return <TermNoticePrintTemplate
      key={key}
      schoolName={id(activeSchool?.name) || "School"}
      branchName={id(activeBranch?.name)}
      schoolLogo={id((activeBranch as any)?.logo || (activeSchool as any)?.logo)}
      schoolMotto={id((activeSchool as any)?.motto)}
      schoolAddress={id((activeBranch as any)?.address || (activeSchool as any)?.address)}
      schoolPhone={id((activeBranch as any)?.phone || (activeSchool as any)?.phone)}
      primaryColor={id(settings?.primaryColor) || "#1e4f83"}
      academicStructure={selectedStructure?.name || "Academic Structure"}
      academicPeriod={selectedPeriod?.name || "Academic Period"}
      nextAcademicPeriod={nextPeriod?.name}
      nextAcademicStructure={nextStructureName}
      nextPeriodConfigured={Boolean(nextNotice)}
      nextFees={nextFees}
      nextRequirements={nextRequirements}
      nextCurrencyCode={nextCurrency}
      nextDueDate={nextMeta?.dueDate}
      nextNotice={nextMeta?.instructions}
      className={classLabel(job.classId)}
      studentName={student ? titleCase(student.fullName) : undefined}
      admissionNumber={student?.admissionNumber}
      fees={documentFees}
      requirements={documentRequirements}
      dueDate={meta?.dueDate}
      notice={meta?.instructions}
      studentBalance={studentInvoice && (!studentInvoice.currencyCode || studentInvoice.currencyCode === documentCurrency) ? money(Math.max(0, studentInvoice.total - paid)) : undefined}
      currencyCode={documentCurrency}
      issuedOn={today()}
    />;
  };
  const printNotice = (jobs: NoticeJob[]) => {
    if (!jobs.length) { setMessage("No notices selected for printing."); return; }
    const missingClasses = [...new Set(jobs.map(job => job.classId))].filter(cid => !getNoticeForClass(cid));
    if (missingClasses.length) {
      setMessage(`Save the notice for ${missingClasses.map(classLabel).join(", ")} before batch printing.`);
      return;
    }
    // Print roots are attached directly to BODY. Do not print the portal scroll pane.
    flushSync(() => { setTrackingPrintRows(null); setPrintJobs(jobs); });
    window.print();
  };
  const printTrackingList = () => {
    if (!displayed.length) { setMessage("No student records match the current filters."); return; }
    const rows: TrackingPrintRow[] = displayed.map(row => ({
      studentName: titleCase(row.student.fullName),
      admissionNumber: row.student.admissionNumber || "—",
      billed: row.billed, paid: row.paid, balance: row.balance,
      currencyCode: row.invoice?.currencyCode || noticeCurrency,
      itemsReceived: row.items?.received,
      itemsRequired: row.items?.total,
      status: row.paidStatus === "paid" ? "Paid" : row.paidStatus === "part" ? "Part paid" : "Unpaid",
    }));
    setTrackingPreviewRows(rows);
  };
  const printTrackingNow = () => {
    if (!trackingPreviewRows?.length) return;
    flushSync(() => { setPrintJobs([]); setTrackingPrintRows(trackingPreviewRows); });
    window.print();
  };
  const printOneFromPicker = () => {
    const studentId = individualPrintStudentId;
    if (!studentId || !studentsForClass(classId).some(student => student.id === studentId)) {
      setMessage("Choose a student from the selected class."); return;
    }
    setIndividualPrintPickerOpen(false);
    setIndividualPrintStudentId("");
    openPreview("student", studentId);
  };
  useRegisterBranchWorkspaceToolbar("financeWorkspace", {
    add: () => section === "notices" ? openEditor() :
      openedTrackingClass ? setPayPickerOpen(true) : setMessage("Choose a class card to record a payment."),
    search: setQuery,
    filter: () => setFilterOpen(true),
    more: () => setMoreOpen(true),
    print: () => section === "tracking" ?
      (openedTrackingClass ? printTrackingList() : setMessage("Choose a class card to print fee tracking.")) :
      openedNoticeClass ? openPreview("class") : setMessage("Select a class card to preview its term notice."),
  });

  const schoolName = id(activeSchool?.name) || "School";
  const branchName = id(activeBranch?.name);
  const academicTitle = selectedStructure?.name || "Academic Structure";
  const periodTitle = selectedPeriod?.name || "Academic Period";
  const classTitle = selectedClass?.name || "Class";

  const field = (label: string, children: React.ReactNode) => <label className="ef-field"><span>{label}</span>{children}</label>;
  const button = (text: string, onClick: () => void, disabled = false) => <button type="button" disabled={disabled || busy} onClick={onClick}>{text}</button>;

  if (restoring || branchLoading || (ready && loading)) return <section className="ef-page"><div className="ef-empty">Opening Finance…</div></section>;
  if (!authenticated || !scope) return <section className="ef-page"><div className="ef-empty">Choose an authorized branch workspace to manage its finances.</div></section>;

  return <><section className="ef-page">
    <style>{styles}</style>
    <div className="ef-no-print">
      {message && <div role="status" className="ef-message" onClick={() => setMessage("")}>{message} <span>×</span></div>}
      {section === "notices" && <>
        {!openedNoticeClass ? <>
          <div className="ef-class-browser-caption">Choose a class <span>{currentAcademicContext.structureName} · {currentAcademicContext.periodName}</span></div>
          <p className="ef-scope-guide">{currentAcademicContext.confirmed ? "Opens the current term." : "Current term not set; showing the first available period."} Use <strong>+</strong> to prepare another term.</p>
          <div className="ef-class-browser" aria-label="Term notice classes">
            {classes.filter(row => !query.trim() || `${row.name} ${row.code || ""}`.toLowerCase().includes(query.toLowerCase())).map(row => {
              const classNotice = getNoticeForPeriod(row.id, currentAcademicContext.periodId, currentAcademicContext.structureId);
              const feeItems = (classNotice?.items || []).filter(item => !isRequirement(item) && !isNoticeMeta(item));
              const requirements = (classNotice?.items || []).filter(isRequirement);
              const studentCount = studentsForClass(row.id).length;
              return <button key={row.id} type="button" className="ef-class-card" onClick={() => openCurrentClass(row.id)}>
                <span className="ef-class-card-mark">{row.name.slice(0,1).toUpperCase()}</span>
                <span className="ef-class-card-main"><strong>{row.name}</strong><small>{studentCount} student{studentCount === 1 ? "" : "s"} · {currentAcademicContext.periodName}</small></span>
                <span className={`ef-class-card-status ${classNotice ? "configured" : "draft"}`}>
                  <i />{classNotice ? `${feeItems.length} fees · ${requirements.length} items` : "Not prepared"}
                </span>
                <span aria-hidden="true" className="ef-class-card-arrow">›</span>
              </button>;
            })}
          </div>
          {!classes.length && <div className="ef-empty">Create classes in Setup before preparing term notices.</div>}
          <p className="ef-help">Use + to prepare notices for multiple classes or all classes in an organization.</p>
        </> : <>
        <div className="ef-class-detail-top">
          <div className="ef-class-open-left">
            <button type="button" className="ef-back-classes" onClick={() => setOpenedNoticeClass(false)}>← Classes</button>
            <strong className="ef-open-class-name">{classTitle}</strong>
          </div>
          <span className="ef-class-context"><strong>{selectedIsCurrent ? "Current term" : "Selected term"}</strong> · {academicTitle} · {periodTitle}</span>
        </div>
        <p className="ef-scope-guide">Use <strong>Filter</strong> to view another period; <strong>+</strong> to prepare a notice.</p>
        <div className="ef-grid">
          <article className="ef-panel"><header>Fees Payable <span>{fees.length} entries</span></header>{fees.length ? fees.map((item, n) => <div className="ef-line" key={n}><span>{item.name}</span><b>{formatAmount(item.amount)}</b></div>) : <div className="ef-muted">No fees configured for this class and period.</div>}<div className="ef-line total"><span>Total</span><b>{formatAmount(feesTotal)}</b></div></article>
          <article className="ef-panel"><header>Items to Bring or Purchase <span>{requirements.length} entries</span></header>{requirements.length ? requirements.map((item, n) => <div className="ef-line" key={n}><span>{item.name}{item.instructions ? <small>{item.instructions}</small> : null}</span><b>{item.quantity || 1} {item.unit || "pcs"}</b></div>) : <div className="ef-muted">No physical requirements configured.</div>}</article>
        </div>
        <p className="ef-help">Print notices without invoicing, or issue student records to begin tracking payments and materials. Required items have no monetary charge unless separately listed as a fee.</p>
        </>}
      </>}
      {section === "tracking" && <>
        {!openedTrackingClass ? <>
          <div className="ef-class-browser-caption">Choose a class <span>{currentAcademicContext.structureName} · {currentAcademicContext.periodName}</span></div>
          <p className="ef-scope-guide">{currentAcademicContext.confirmed ? "Opens the current term." : "Current term not set; showing the first available period."} Select a class to track payments and materials.</p>
          <div className="ef-class-browser" aria-label="Fee tracking classes">
            {classes.filter(row => !query.trim() || `${row.name} ${row.code || ""}`.toLowerCase().includes(query.toLowerCase().trim())).map(row => {
              const classStudents = studentsForClass(row.id);
              const currentInvoices = invoices.filter(inv =>
                id(inv.classId) === row.id &&
                id(inv.academicStructureId) === currentAcademicContext.structureId &&
                id(inv.academicPeriodId) === currentAcademicContext.periodId &&
                inv.status !== "void" && inv.status !== "cancelled"
              );
              const issuedStudentIds = new Set(currentInvoices.map(inv => inv.studentId));
              const issuedCount = classStudents.filter(student => issuedStudentIds.has(student.id)).length;
              return <button key={row.id} type="button" className="ef-class-card" onClick={() => openTrackingClass(row.id)}>
                <span className="ef-class-card-mark">{row.name.slice(0,1).toUpperCase()}</span>
                <span className="ef-class-card-main">
                  <strong>{row.name}</strong>
                  <small>{classStudents.length} student{classStudents.length === 1 ? "" : "s"} · {currentAcademicContext.periodName}</small>
                </span>
                <span className={`ef-class-card-status ${issuedCount ? "configured" : "draft"}`}>
                  <i />{issuedCount ? `${issuedCount} issued` : "Not issued"}
                </span>
                <span aria-hidden="true" className="ef-class-card-arrow">›</span>
              </button>;
            })}
          </div>
          {!classes.length && <div className="ef-empty">Create classes in Setup before tracking fees.</div>}
          <p className="ef-help">Choose a class first. Use Filter after opening it to view another term.</p>
        </> : <>
          <div className="ef-class-detail-top">
            <div className="ef-class-open-left">
              <button type="button" className="ef-back-classes" onClick={closeTrackingClass}>← Classes</button>
              <strong className="ef-open-class-name">{classTitle}</strong>
            </div>
            <span className="ef-class-context"><strong>{selectedIsCurrent ? "Current term" : "Selected term"}</strong> · {academicTitle} · {periodTitle}</span>
          </div>
          <p className="ef-scope-guide">Use <strong>Filter</strong> to view another period; <strong>+</strong> to record a payment.</p>
        {view === "table" ? (
          <section className="ef-table-card" aria-label="Student fee records">
            <div className="ef-table-wrap">
              <table className="ef-table">
                <thead><tr>
                  <th>Students ({displayed.length})</th><th>Admission No.</th>
                  <th>Billed</th><th>Paid</th><th>Balance</th><th>Items Received</th><th>Status</th><th>Actions</th>
                </tr></thead>
                <tbody>{displayed.map(row => (
                  <tr key={row.student.id}>
                    <td><div className="ef-table-person">{studentAvatar(row.student)}<strong>{titleCase(row.student.fullName)}</strong></div></td>
                    <td>{row.student.admissionNumber || "—"}</td>
                    <td>{formatFinanceMoney(row.billed, row.invoice?.currencyCode || noticeCurrency)}</td>
                    <td>{formatFinanceMoney(row.paid, row.invoice?.currencyCode || noticeCurrency)}</td>
                    <td><strong>{formatFinanceMoney(row.balance, row.invoice?.currencyCode || noticeCurrency)}</strong></td>
                    <td>{row.items ? `${row.items.received}/${row.items.total}` : "Not issued"}</td>
                    <td><span className={`ef-status ${row.paidStatus}`}><i />{row.paidStatus === "part" ? "Part paid" : row.paidStatus === "paid" ? "Paid" : "Unpaid"}</span></td>
                    <td><div className="ef-row-actions">
                      {button("Payment", () => { setPaymentStudent(row.student); setPayAmount(String(row.balance || "")); }, !row.invoice || !row.balance)}
                      {button("Items", () => setTrackingForStudent(row.student.id))}
                      {button("Preview", () => openPreview("student", row.student.id), !notice)}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        ) : (
          <div className="ef-cards">{displayed.map(row => (
            <article key={row.student.id} className="ef-student">
              <div className="ef-student-head">
                {studentAvatar(row.student)}
                <div className="ef-student-identity"><b>{titleCase(row.student.fullName)}</b><small>{row.student.admissionNumber || "No admission number"}</small></div>
                <span className={`ef-status ${row.paidStatus}`}><i />{row.paidStatus === "part" ? "Part paid" : row.paidStatus === "paid" ? "Paid" : "Unpaid"}</span>
              </div>
              <div className="ef-metrics">
                <span>Fees <b>{formatFinanceMoney(row.billed, row.invoice?.currencyCode || noticeCurrency)}</b></span>
                <span>Paid <b>{formatFinanceMoney(row.paid, row.invoice?.currencyCode || noticeCurrency)}</b></span>
                <span>Balance <b>{formatFinanceMoney(row.balance, row.invoice?.currencyCode || noticeCurrency)}</b></span>
                <span>Items <b>{row.items ? `${row.items.received}/${row.items.total}` : "—"}</b></span>
              </div>
              <div className="ef-actions">
                {button("Record Payment", () => { setPaymentStudent(row.student); setPayAmount(String(row.balance || "")); }, !row.invoice || !row.balance)}
                {button("Receive Items", () => setTrackingForStudent(row.student.id))}
                {button("Preview", () => openPreview("student", row.student.id), !notice)}
              </div>
            </article>
          ))}</div>
        )}
        {!displayed.length && <div className="ef-empty">No students match the selected class and filters.</div>}
        </>}
      </>}
    </div>
  </section>
  {canPortal && createPortal(
    <div className="ef-page ef-modal-host" style={{ "--ef-primary": id(settings?.primaryColor) || "#2563eb" } as React.CSSProperties}>
        {trackingStudentId && <div className="ef-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setTrackingStudentId(""); }}><section className="ef-sheet" role="dialog" aria-modal="true" aria-label="Item submissions"><header><strong>Materials Received</strong><button onClick={() => setTrackingStudentId("")}>×</button></header><p>{titleCase(students.find(s => s.id === trackingStudentId)?.fullName)}</p>{(receivedByStudent.get(trackingStudentId)?.entries || []).map(({ item, state }) => <div className="ef-line" key={item.id}><span>{item.name}<small>{state.received} / {item.quantity} {state.unit} received</small></span>{button("+ Receive", () => { setReceivedEditor(item); setReceiveQty(String(Math.max(1, Number(item.quantity || 0) - state.received))); }, state.received >= Number(item.quantity || 0))}</div>)}{!receivedByStudent.get(trackingStudentId)?.entries.length && <div className="ef-muted">Issue student records to enable item tracking.</div>}</section></div>}
    {payPickerOpen && <div className="ef-overlay"><section className="ef-sheet" role="dialog" aria-modal="true" aria-label="Record a student payment"><header><strong>Select Student</strong><button type="button" onClick={() => setPayPickerOpen(false)}>×</button></header>
      {field("Student", <select value={payPickerStudentId} onChange={e => setPayPickerStudentId(e.target.value)}><option value="">Choose student</option>{studentRows.filter(r => r.invoice && r.balance > 0).map(r => <option key={r.student.id} value={r.student.id}>{titleCase(r.student.fullName)}</option>)}</select>)}
      <div className="ef-actions">{button("Record Payment", () => {const row = studentRows.find(r => r.student.id === payPickerStudentId); if (!row) return; setPaymentStudent(row.student);setPayAmount(String(row.balance));setPayPickerStudentId("");setPayPickerOpen(false);})}{button("Cancel", () => setPayPickerOpen(false))}</div>
    </section></div>}
    {editorOpen && <div className="ef-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setEditorOpen(false); }}><div role="dialog" aria-modal="true" aria-label="Edit term notice" className="ef-sheet large"><header><strong>Term Fees & Requirements</strong><button onClick={() => setEditorOpen(false)}>×</button></header><div className="ef-editor-context ef-selection">
          {field("Academic Structure", <select value={structureId} onChange={e => chooseEditorStructure(e.target.value)}><option value="">Select structure</option>{structures.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>)}
          {field("Academic Period", <select value={periodId} onChange={e => chooseEditorPeriod(e.target.value)}><option value="">Select period</option>{visiblePeriods.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>)}
          {field("Class", <select value={classId} onChange={e => chooseEditorClass(e.target.value)}><option value="">Select class</option>{classes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>)}
          {field("Currency", <select value={currencyCode} onChange={e => setCurrencyCode(e.target.value)}>{FINANCE_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}</select>)}
        </div>
        <fieldset className="ef-target-scope"><legend>Apply Notice To</legend>
          <div className="ef-batch-choices">
            {([ ["single", "One class"], ["selected", "Selected classes"], ["organization", "Entire organization"] ] as const).map(([value, label]) =>
              <label key={value}><input type="radio" name="term-notice-target" value={value} checked={batchMode === value} onChange={() => setBatchMode(value)} />{label}</label>
            )}
          </div>
          {batchMode === "selected" && <div className="ef-batch-class-grid" role="group" aria-label="Select classes to receive notice">
            {eligibleClasses.map(row => <label key={row.id}>
              <input type="checkbox" checked={selectedClassIds.includes(row.id)} onChange={event => setSelectedClassIds(previous => event.target.checked ? [...new Set([...previous, row.id])] : previous.filter(value => value !== row.id))}/>
              {row.name}
            </label>)}
          </div>}
          {batchMode === "organization" && field("Organization", <select value={selectedOrganizationId} onChange={e => setSelectedOrganizationId(e.target.value)}>
            <option value="">Choose organization</option>{organizations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>)}
          <p className="ef-help">{editTargetClassIds.length} selected {editTargetClassIds.length === 1 ? "class" : "classes"}{editTargetClassIds.length ? `: ${editTargetClassIds.map(classLabel).join(", ")}` : ". Select a class or organization."}. Each class gets its own term notice, and existing invoices are never silently repriced.</p>
        </fieldset>
        <h3>Fees Payable</h3>{feeLines.map((line, i) => <div key={line.key} className="ef-edit-row"><input aria-label="Fee name" placeholder="Tuition, ICT, Examination…" value={line.name} onChange={e => setFeeLines(rows => rows.map(r => r.key === line.key ? { ...r, name: e.target.value } : r))}/><input aria-label="Amount" type="number" min="0" step="0.01" placeholder="Amount" value={line.amount} onChange={e => setFeeLines(rows => rows.map(r => r.key === line.key ? { ...r, amount: Number(e.target.value) } : r))}/><button aria-label={`Remove fee ${i + 1}`} onClick={() => setFeeLines(rows => rows.filter(r => r.key !== line.key))}>×</button></div>)}{button("+ Fee", () => setFeeLines(rows => [...rows, { key: makeKey(), kind: "fee", name: "", amount: 0 }]))}<h3>Items to Bring / Purchase</h3>{requirementLines.map((line, i) => <div key={line.key} className="ef-item-edit"><div className="ef-edit-row"><input aria-label="Item name" placeholder="Exercise books, toiletries…" value={line.name} onChange={e => setRequirementLines(rows => rows.map(r => r.key === line.key ? { ...r, name: e.target.value } : r))}/><input aria-label="Quantity" type="number" min="1" step="1" value={line.quantity || 1} onChange={e => setRequirementLines(rows => rows.map(r => r.key === line.key ? { ...r, quantity: Number(e.target.value) } : r))}/><button aria-label={`Remove item ${i + 1}`} onClick={() => setRequirementLines(rows => rows.filter(r => r.key !== line.key))}>×</button></div><div className="ef-edit-row"><input aria-label="Unit" placeholder="Unit (pcs, rolls…)" value={line.unit || ""} onChange={e => setRequirementLines(rows => rows.map(r => r.key === line.key ? { ...r, unit: e.target.value } : r))}/><input aria-label="Instructions" placeholder="Textbook title or purchase instructions" value={line.instructions || ""} onChange={e => setRequirementLines(rows => rows.map(r => r.key === line.key ? { ...r, instructions: e.target.value } : r))}/></div><label className="ef-option"><input type="checkbox" checked={line.required !== false} onChange={e => setRequirementLines(rows => rows.map(r => r.key === line.key ? { ...r, required: e.target.checked } : r))} /> Required item</label></div>)}{button("+ Item", () => setRequirementLines(rows => [...rows, { key: makeKey(), kind: "requirement", name: "", amount: 0, quantity: 1, unit: "pcs", required: true }]))}
        {field("Payment / collection instructions", <input value={noticeNote} onChange={e => setNoticeNote(e.target.value)} placeholder="Pay at school office or use account details shown on receipts" />)}
        {field("Due date (optional)", <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />)}
        <div className="ef-actions">{button(busy ? "Saving…" : "Save Notice", saveNotice, busy)}{button("Cancel", () => setEditorOpen(false))}</div><p className="ef-help">Editing an already-issued term notice does not silently change existing invoices. Review and reissue records deliberately.</p></div></div>}
    {receivedEditor && <div className="ef-overlay"><section role="dialog" aria-modal="true" className="ef-sheet"><header><strong>Receive {receivedEditor.name}</strong><button onClick={() => setReceivedEditor(null)}>×</button></header><p>Record an additional quantity received.</p>{field("Quantity", <input type="number" min="1" step="1" value={receiveQty} onChange={e => setReceiveQty(e.target.value)}/>)}{field("Optional note", <input value={receiveNote} onChange={e => setReceiveNote(e.target.value)} placeholder="Received by school office"/>)}<div className="ef-actions">{button("Save Receipt", receiveItem)}{button("Cancel", () => setReceivedEditor(null))}</div></section></div>}
    {paymentStudent && <div className="ef-overlay"><section role="dialog" aria-modal="true" className="ef-sheet"><header><strong>Record Fee Payment</strong><button onClick={() => setPaymentStudent(null)}>×</button></header><p>{titleCase(paymentStudent.fullName)} · Balance {formatFinanceMoney(studentRow(paymentStudent).balance, invoicesByStudent.get(paymentStudent.id)?.currencyCode || noticeCurrency)}</p>{field("Amount", <input type="number" min="0.01" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}/>)}{field("Method", <select value={payMethod} onChange={e => setPayMethod(e.target.value as PaymentChannel)}><option value="cash">Cash</option><option value="momo">Mobile Money</option><option value="bank">Bank</option><option value="card">Card</option><option value="manual">Manual</option></select>)}{field("Reference (optional)", <input value={payReference} onChange={e => setPayReference(e.target.value)}/>)}<div className="ef-actions">{button("Save Payment", recordPayment)}{button("Cancel", () => setPaymentStudent(null))}</div></section></div>}
    {filterOpen && <div className="ef-overlay"><section role="dialog" aria-modal="true" className="ef-sheet"><header><strong>Filter Students</strong><button onClick={() => setFilterOpen(false)}>×</button></header>{field("Academic Structure", <select value={structureId} onChange={e => { setStructureId(e.target.value);setPeriodId(""); }}><option value="">Choose structure</option>{structures.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>)}
      {field("Academic Period", <select value={periodId} onChange={e => setPeriodId(e.target.value)}><option value="">Choose period</option>{visiblePeriods.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>)}
      {field("Class", <select value={classId} onChange={e => setClassId(e.target.value)}><option value="">Choose class</option>{classes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>)}
      {section === "tracking" && field("Fee status", <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All</option><option value="paid">Paid</option><option value="part">Part paid</option><option value="unpaid">Unpaid</option><option value="items_pending">Items pending</option></select>)}<div className="ef-actions">{button("Apply", () => setFilterOpen(false))}{button("Reset", () => { setStatusFilter("all"); setQuery(""); setFilterOpen(false); })}</div></section></div>}
    {summaryOpen && <div className="ef-overlay"><section role="dialog" aria-modal="true" className="ef-sheet large"><header><strong>Collection Summary</strong><button type="button" onClick={() => setSummaryOpen(false)}>×</button></header>
      <div className="ef-summary">{[
        ["Students", String(targetStudents.length)], ["Expected", formatAmount(totalBilled)],
        ["Received", formatAmount(totalReceived)], ["Outstanding", formatAmount(totalOutstanding)],
        ["Fully Paid", String(studentRows.filter(r => r.paidStatus === "paid").length)],
        ["Items Complete", String(studentRows.filter(r => r.items?.total && r.items.received >= r.items.total).length)]
      ].map(([name, value]) => <article key={name}><small>{name}</small><strong>{value}</strong></article>)}</div>
      <p className="ef-help">Balances use issued invoices and recorded settled payments; nothing is converted between currencies.</p>
    </section></div>}
    {moreOpen && <div className="ef-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setMoreOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Finance actions" className="ef-sheet">
        <header><strong>More Actions</strong><button aria-label="Close menu" onClick={() => setMoreOpen(false)}>×</button></header>
        <div className="ef-more-actions">
          {section === "notices" ? <>
            {button("Edit / Apply Term Notice", () => { setMoreOpen(false); openEditor(); })}
            {button("Issue Student Records", () => { setMoreOpen(false); void issueInvoices(); }, !notice)}
            {button("Preview Class Notice", () => { setMoreOpen(false); openPreview("class"); }, !notice)}
            {button(`Preview Individual Notices (${targetStudents.length})`, () => { setMoreOpen(false); openPreview("batch"); }, !notice || !targetStudents.length)}
            {appliedClassIds.length > 1 && button(`Preview Class Batch (${appliedClassIds.length})`, () => { setMoreOpen(false); openPreview("classes"); })}
            {appliedClassIds.length > 1 && button("Preview All Student Notices", () => { setMoreOpen(false); openPreview("all_students"); })}
            {button("Print Class Notice", () => { setMoreOpen(false); if (notice) printNotice([{ classId }]); }, !notice)}
            {button(`Print Individual Notices — Class (${targetStudents.length})`, () => { setMoreOpen(false); if (notice) printNotice(targetStudents.map(student => ({ classId, studentId: student.id }))); }, !notice || !targetStudents.length)}
            {appliedClassIds.length > 1 && button("Print Class Batch", () => { setMoreOpen(false); printNotice(appliedClassIds.map(cid => ({ classId: cid }))); })}
            {appliedClassIds.length > 1 && button("Print Student Batch — All Selected Classes", () => { setMoreOpen(false); printNotice(appliedClassIds.flatMap(cid => studentsForClass(cid).map(student => ({ classId: cid, studentId: student.id })))); })}
          </> : <>
            {button("Issue Student Records", () => { setMoreOpen(false); void issueInvoices(); }, !openedTrackingClass || !notice)}
            {button(`Print Fee Tracking List (${displayed.length})`, () => { setMoreOpen(false); printTrackingList(); }, !openedTrackingClass || !displayed.length)}
            {button(`Preview All Individual Notices (${targetStudents.length})`, () => { setMoreOpen(false); openPreview("batch"); }, !openedTrackingClass || !notice || !targetStudents.length)}
            {button(`Print All Individual Notices (${targetStudents.length})`, () => { setMoreOpen(false); printNotice(targetStudents.map(student => ({ classId, studentId: student.id }))); }, !openedTrackingClass || !notice || !targetStudents.length)}
            {button("Print Individual Notice…", () => { setMoreOpen(false); setIndividualPrintStudentId(""); setIndividualPrintPickerOpen(true); }, !openedTrackingClass || !notice || !targetStudents.length)}
            {button(view === "table" ? "Card View" : "Table View", () => { setMoreOpen(false); setView(view === "table" ? "cards" : "table"); })}
            {button("Collection Summary", () => { setMoreOpen(false); setSummaryOpen(true); }, !openedTrackingClass)}
          </>}
        </div>
      </section>
    </div>}
    {individualPrintPickerOpen && <div className="ef-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setIndividualPrintPickerOpen(false); }}>
      <section className="ef-sheet" role="dialog" aria-modal="true" aria-label="Select a student notice">
        <header><strong>Individual Notice</strong><button aria-label="Close" onClick={() => setIndividualPrintPickerOpen(false)}>×</button></header>
        {field("Student", <select value={individualPrintStudentId} onChange={event => setIndividualPrintStudentId(event.target.value)}>
          <option value="">Select student</option>
          {targetStudents.map(student => <option key={student.id} value={student.id}>{titleCase(student.fullName)} · {student.admissionNumber || "No admission no."}</option>)}
        </select>)}
        <div className="ef-actions">{button("Preview and Print", printOneFromPicker, !individualPrintStudentId)}{button("Cancel", () => setIndividualPrintPickerOpen(false))}</div>
      </section>
    </div>}

    </div>, document.body
  )}
  {canPortal && previewMode && createPortal(
    <div className="ef-preview-backdrop ef-notice-preview-backdrop" role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) setPreviewMode(null); }}>
      <section className="ef-preview-dialog ef-register-preview-dialog ef-notice-preview-dialog"
        role="dialog" aria-modal="true" aria-label="Vertically scrolling term notice batch preview">
        <BranchReportZoomProvider>
          <header className="ef-preview-toolbar report-no-print">
            <div>
              <strong>{previewJobs.length > 1 ? "Term Notice Batch" : "Term Notice Preview"}</strong>
              <small>{previewJobs.length} notice{previewJobs.length === 1 ? "" : "s"} · {academicTitle} · {periodTitle} · Scroll down to see each notice</small>
            </div>
            <div className="ef-preview-controls">
              <BranchReportZoomControls />
              <button type="button" className="ef-preview-print" onClick={() => printNotice(previewJobs)}>
                {previewJobs.length > 1 ? `Print All (${previewJobs.length})` : "Print Notice"}
              </button>
              <button type="button" className="ef-preview-close" aria-label="Close preview" onClick={() => setPreviewMode(null)}>×</button>
            </div>
          </header>
          <div className="ef-register-preview-document ef-notice-preview-document">
            <BranchReportPreview printZoneId="finance-term-notice-preview" naturalWidth={794}>
              <div className="ef-notice-batch-pages">
                {previewJobs.map((job, index) => (
                  <div className="ef-notice-preview-paper" key={`preview-${job.classId}-${job.studentId || "class"}-${index}`}>
                    {renderDocument(job, `preview-${job.classId}-${job.studentId || "class"}-${index}`)}
                  </div>
                ))}
              </div>
            </BranchReportPreview>
          </div>
        </BranchReportZoomProvider>
      </section>
    </div>, document.body
  )}
  {canPortal && trackingPreviewRows && createPortal(
    <div className="ef-preview-backdrop ef-register-preview-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) setTrackingPreviewRows(null);
    }}>
      <section className="ef-preview-dialog ef-register-preview-dialog" role="dialog" aria-modal="true" aria-label="Fee Tracking A4 preview">
        <BranchReportZoomProvider>
          <header className="ef-preview-toolbar report-no-print">
            <div><strong>Fee Tracking Report</strong><small>{classTitle} · {periodTitle} · {trackingPreviewRows.length} students</small></div>
            <div className="ef-preview-controls">
              <BranchReportZoomControls />
              <button type="button" className="ef-preview-print" onClick={printTrackingNow}>Print Report</button>
              <button type="button" className="ef-preview-close" aria-label="Close preview" onClick={() => setTrackingPreviewRows(null)}>×</button>
            </div>
          </header>
          <div className="ef-register-preview-document">
            <BranchReportPreview printZoneId="finance-student-tracking-preview" naturalWidth={794}>
              <StudentTrackingPrintTemplate
                schoolName={schoolName} branchName={branchName}
                schoolLogo={id((activeBranch as any)?.logo || (activeSchool as any)?.logo)}
                academicStructure={academicTitle} academicPeriod={periodTitle}
                className={classTitle} rows={trackingPreviewRows} issuedOn={today()}
              />
            </BranchReportPreview>
          </div>
        </BranchReportZoomProvider>
      </section>
    </div>, document.body
  )}
  {canPortal && createPortal(
    <div id="eleeveon-finance-print-root" className="ef-print" aria-hidden="true">
      {trackingPrintRows && <StudentTrackingPrintTemplate
        schoolName={schoolName} branchName={branchName}
        schoolLogo={id((activeBranch as any)?.logo || (activeSchool as any)?.logo)}
        academicStructure={academicTitle} academicPeriod={periodTitle}
        className={classTitle} currencyCode={noticeCurrency}
        rows={trackingPrintRows} issuedOn={today()}
      />}
      {!trackingPrintRows && printJobs.map((job, index) => renderDocument(job, `print-${job.classId}-${job.studentId || 'class'}-${index}`))}
    </div>, document.body
  )}
  </>;

  function setTrackingForStudent(studentId: string) { setTrackingStudentId(studentId); }
}

const styles = `
.ef-page.ef-modal-host{position:fixed!important;inset:0!important;z-index:30000!important;min-height:0!important;height:0!important;width:0!important;min-width:0!important;padding:0!important;background:transparent!important;overflow:visible!important;pointer-events:none!important;}
.ef-modal-host .ef-overlay{position:fixed!important;inset:0!important;width:100vw;height:100dvh;max-height:none;z-index:30000!important;pointer-events:auto;overscroll-behavior:contain;padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom));}
.ef-modal-host .ef-sheet{max-height:calc(100dvh - 20px);min-height:0;overflow-y:auto;overscroll-behavior:contain;}
@media(max-width:700px){.ef-modal-host .ef-overlay{padding:0!important;}.ef-modal-host .ef-sheet{border-radius:0!important;max-height:100dvh!important;height:100dvh!important;width:100vw!important;max-width:100vw!important;padding:calc(12px + env(safe-area-inset-top)) 14px calc(16px + env(safe-area-inset-bottom));align-self:stretch;}}
.ef-notice-preview-dialog{height:calc(100dvh - 24px)!important;max-height:calc(100dvh - 24px)!important;width:min(100%,1050px);}
.ef-notice-preview-document{overflow-y:auto!important;overflow-x:hidden!important;min-height:0;flex:1 1 auto;padding:14px;overscroll-behavior:contain;}
.ef-notice-batch-pages{width:794px;display:flex;flex-direction:column;gap:18px;}
.ef-notice-preview-paper{width:794px;min-width:794px;max-width:794px;min-height:1123px;overflow:visible;background:white;box-shadow:0 6px 22px rgba(0,0,0,.2);color:#142238;padding:11mm;box-sizing:border-box;}
.ef-notice-preview-paper .ef-term-notice-a4{width:100%;min-width:0;max-width:none;}
@media(max-width:699px){.ef-notice-preview-backdrop{padding:0!important;}.ef-notice-preview-document{padding:5px!important;}.ef-notice-preview-dialog{height:100dvh!important;max-height:100dvh!important;width:100vw!important;border-radius:0!important;}}

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
.ef-more-actions{display:grid;gap:7px;max-height:58dvh;overflow-y:auto;padding:2px;}
.ef-more-actions button{min-height:40px;text-align:left;width:100%;padding:9px 12px!important;
 background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 92%,var(--text,#182235) 8%);
 border:1px solid var(--border,#d4dae3);font-size:12px!important;}
.ef-more-actions button:hover{background:color-mix(in srgb,var(--ef-primary,#2563eb) 10%,var(--card-bg,var(--surface,#fff)));}
.ef-more-actions button:disabled{opacity:.5;}
/* Match the texture and density used by the Students module. */
.ef-page{--ef-primary:var(--ba-primary,var(--primary-color,#2563eb));background:radial-gradient(circle at 5% 0%,color-mix(in srgb,var(--ef-primary) 6%,transparent),transparent 25rem),var(--bg,transparent);padding:8px;min-height:120px;font-family:var(--font-family,system-ui,sans-serif);}
.ef-panel,.ef-student,.ef-summary article,.ef-table-wrap{background:var(--card-bg,var(--surface,#fff));border-radius:12px;box-shadow:none;}
.ef-sheet{background:var(--card-bg,var(--surface,#fff));border-radius:16px;}
.ef-page button:focus-visible{outline:2px solid var(--ef-primary);outline-offset:2px;}
.ef-actions button:first-child{background:var(--ef-primary);color:#fff;border-color:var(--ef-primary);}
.ef-editor-context{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
.ef-summary{margin:4px 0 12px;}

/* Consistent Students V2 mixed-surface records. No extra action bar or view buttons. */
.ef-page{background:var(--bg,var(--background,#f2f4f7));padding:5px;min-height:0;}
.ef-panel,.ef-student,.ef-table-card,.ef-summary article{
 background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 93%,var(--text,#182235) 7%);
 border:1px solid color-mix(in srgb,var(--border,#d4dae3) 85%,var(--text,#182235) 15%);
 border-radius:13px;box-shadow:none;
}
.ef-cards{grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:2px;}
.ef-table-card{padding:4px;width:100%;min-width:0;overflow:visible;}
.ef-table-wrap{width:100%;max-width:100%;overflow-x:auto;overflow-y:auto;
 -webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;border-radius:10px;}
.ef-table{width:100%;min-width:850px;background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 95%,var(--text,#182235) 5%);}
.ef-table thead th{position:sticky;top:0;z-index:2;
 background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 85%,var(--text,#182235) 15%);
 color:var(--text,#182235);font-weight:800;letter-spacing:.01em;text-transform:none;}
.ef-table tbody tr:nth-child(even){background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 89%,var(--text,#182235) 11%);}
.ef-table th,.ef-table td{background-color:transparent;padding:9px 10px;font-size:12px;}
.ef-table-person{display:flex;align-items:center;gap:9px;min-width:160px;}
.ef-table-person strong{font-size:12px;line-height:1.25;}
.ef-avatar{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;
 overflow:hidden;border-radius:11px;color:var(--text,#182235);font-size:13px;font-weight:900;
 background:color-mix(in srgb,var(--ef-primary,#2563eb) 12%,var(--card-bg,var(--surface,#fff)));
 border:1px solid color-mix(in srgb,var(--ef-primary,#2563eb) 28%,var(--border,#d4dae3));}
.ef-avatar img{width:100%;height:100%;object-fit:cover;display:block;}
.ef-student-head{display:flex;flex-direction:row;align-items:center;gap:9px;min-width:0;}
.ef-student-identity{display:flex;flex-direction:column;min-width:0;flex:1 1 0;gap:3px;}
.ef-student-identity b{font-size:12px;line-height:1.2;overflow-wrap:anywhere;}
.ef-student-identity small{font-size:10px;color:var(--muted,#64748b);}
.ef-status{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:800;
 color:var(--muted,#64748b);white-space:nowrap;}
.ef-status i{display:block;width:8px;height:8px;border-radius:50%;background:#94a3b8;}
.ef-status.paid i{background:#16a34a;}.ef-status.part i{background:#d97706;}.ef-status.unpaid i{background:#ef4444;}
.ef-row-actions{display:flex;flex-wrap:nowrap;gap:4px;overflow-x:auto;scrollbar-width:thin;}
.ef-row-actions button{flex:0 0 auto;font-size:10px!important;padding:5px 8px!important;}
.ef-preview-backdrop{position:fixed;inset:0;z-index:12000;background:rgba(15,23,42,.72);
 backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:12px;}
.ef-preview-dialog{width:min(100%,980px);height:min(97dvh,1050px);display:flex;flex-direction:column;
 border:1px solid var(--border,#d4dae3);border-radius:14px;overflow:hidden;
 background:var(--card-bg,var(--surface,#fff));color:var(--text,#182235);box-shadow:0 25px 70px #0005;}
.ef-preview-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;
 padding:9px 12px;border-bottom:1px solid var(--border,#d4dae3);}
.ef-preview-toolbar>div:first-child{display:grid;gap:3px;}
.ef-preview-toolbar strong{font-size:14px;}.ef-preview-toolbar small{font-size:11px;color:var(--muted,#64748b);}
.ef-preview-controls{display:flex;gap:5px;flex-wrap:wrap;align-items:center;}
.ef-preview-controls button{border:1px solid var(--border,#d4dae3);border-radius:8px;padding:7px 10px;
 background:var(--surface,#fff);color:var(--text,#182235);font-size:11px;font-weight:750;cursor:pointer;}
.ef-preview-controls button:disabled{opacity:.4;cursor:not-allowed;}
.ef-preview-controls .ef-preview-print{color:#fff;background:var(--primary-color,#2563eb);border-color:var(--primary-color,#2563eb);}
.ef-preview-controls .ef-preview-close{font-size:20px;padding:3px 10px;}
.ef-preview-scroller{flex:1 1 auto;overflow:auto;min-height:0;background:#d8dee6;padding:16px;
 -webkit-overflow-scrolling:touch;}
.ef-preview-page{box-sizing:border-box;width:210mm;min-height:297mm;margin:0 auto;padding:11mm;
 box-shadow:0 4px 26px #0003;background:#fff;color:#142238;}
.ef-target-scope{display:grid;gap:8px;min-width:0;padding:11px;border:1px solid var(--border,#d4dae3);border-radius:10px;}
.ef-target-scope legend{padding:0 4px;font-weight:850;font-size:12px;}
.ef-batch-choices{display:flex;flex-wrap:wrap;gap:8px 14px;}
.ef-batch-choices label,.ef-batch-class-grid label{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:650;cursor:pointer;}
.ef-batch-choices input,.ef-batch-class-grid input{width:16px;height:16px;accent-color:var(--ef-primary,#2563eb);}
.ef-batch-class-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-height:200px;overflow:auto;padding:8px;background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 94%,var(--text,#182235));border-radius:9px;}
@media(max-width:620px){.ef-batch-class-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.ef-batch-choices{display:grid;gap:8px;}}
@media(min-width:680px) and (max-width:1023px){.ef-cards{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:679px){.ef-page{padding:3px;}.ef-cards{grid-template-columns:minmax(0,1fr);gap:7px;}
 .ef-preview-backdrop{padding:0;}.ef-preview-dialog{height:100dvh;max-height:100dvh;border-radius:0;}
 .ef-preview-toolbar{align-items:stretch;}.ef-preview-controls{justify-content:flex-end;}
 .ef-preview-scroller{padding:8px;}}

@media(max-width:1050px){.ef-cards{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:700px){.ef-grid,.ef-cards,.ef-editor-context{grid-template-columns:1fr;}.ef-summary{grid-template-columns:repeat(2,minmax(0,1fr));}.ef-sheet{align-self:flex-end;width:100%;max-height:90dvh;border-radius:16px 16px 0 0;}.ef-overlay{padding:0;}}
@media screen{#eleeveon-finance-print-root{display:none!important;}}
@media print {
 @page{size:A4 portrait;margin:11mm;}
 /* Portal is a direct BODY child: escapes shell transforms, scroll containers and mobile overlays. */
 body > *:not(#eleeveon-finance-print-root){display:none!important;}
 .ef-preview-backdrop{display:none!important;}
 html,body{height:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important;background:#fff!important;}
 #eleeveon-finance-print-root{display:block!important;position:static!important;width:100%!important;height:auto!important;overflow:visible!important;background:white!important;color:#111827!important;}
 #eleeveon-finance-print-root *{visibility:visible!important;}
 #eleeveon-finance-print-root .ef-term-notice-a4{display:block!important;width:100%!important;max-width:none!important;padding:0!important;margin:0!important;overflow:visible!important;break-after:page;page-break-after:always;}
 #eleeveon-finance-print-root .ef-term-notice-a4:last-child{break-after:auto;page-break-after:auto;}
 #eleeveon-finance-print-root .ef-doc-section{break-inside:avoid-page;}
}

/* Compact academic context, with no competing navigation or extra cards. */
.ef-scope-guide{margin:2px 3px 9px;font-size:10.5px;line-height:1.4;color:var(--muted,#64748b);font-weight:500;}
.ef-scope-guide strong{color:var(--text,#182235);font-weight:850;}
.ef-class-context{max-width:100%;overflow-wrap:anywhere;text-align:right;line-height:1.4;}
.ef-class-context strong{color:var(--ef-primary,#2563eb);font-weight:900;}
@media(max-width:520px){.ef-class-browser-caption{flex-wrap:wrap;gap:3px;}.ef-class-browser-caption span{width:100%;}}

/* Assessment Entries-style first step: class cards, then the selected term notice. */
.ef-class-browser-caption{display:flex;justify-content:space-between;gap:12px;align-items:center;
 padding:6px 3px 7px;font-size:12px;font-weight:850;color:var(--text,#182235);}
.ef-class-browser-caption span{font-size:11px;font-weight:650;color:var(--muted,#64748b);}
.ef-class-browser{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;}
.ef-page .ef-class-card{display:flex;align-items:center;gap:10px;min-width:0;min-height:80px;
 border:1px solid color-mix(in srgb,var(--border,#d4dae3) 85%,var(--text,#182235) 15%);
 border-radius:13px;padding:11px;text-align:left;
 background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 93%,var(--text,#182235) 7%);
 color:var(--text,#182235);box-shadow:none;}
.ef-page .ef-class-card:hover,.ef-page .ef-class-card:focus-visible{border-color:var(--ef-primary,#2563eb);
 background:color-mix(in srgb,var(--ef-primary,#2563eb) 7%,var(--card-bg,var(--surface,#fff)));}
.ef-class-card-mark{width:36px;height:36px;flex:0 0 36px;display:grid;place-items:center;
 border-radius:10px;background:color-mix(in srgb,var(--ef-primary,#2563eb) 10%,var(--card-bg,var(--surface,#fff)));
 color:var(--ef-primary,#2563eb);font-weight:950;font-size:16px;}
.ef-class-card-main{min-width:0;flex:1;display:grid;gap:5px;}
.ef-class-card-main strong{font-size:13px;line-height:1.15;overflow-wrap:anywhere;}
.ef-class-card-main small{font-size:10px;font-weight:650;color:var(--muted,#64748b);}
.ef-class-card-status{display:flex;align-items:center;gap:5px;flex:0 0 auto;
 font-size:10px;font-weight:750;color:var(--muted,#64748b);}
.ef-class-card-status i{width:7px;height:7px;border-radius:50%;background:#94a3b8;}
.ef-class-card-status.configured i{background:#16a34a;}
.ef-class-card-arrow{color:var(--muted,#64748b);font-size:19px;}
.ef-class-detail-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 0 8px;}
.ef-class-open-left{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;}
.ef-open-class-name{font-size:12px;font-weight:850;color:var(--text,#182235);overflow-wrap:anywhere;}
.ef-page .ef-back-classes{font-size:11px;border-radius:7px;min-height:31px;}
.ef-class-context{font-size:11px;font-weight:800;color:var(--muted,#64748b);}
.ef-register-preview-document{flex:1 1 auto;min-height:0;overflow-x:hidden;overflow-y:auto;
 background:#d9dfe8;padding:12px;overscroll-behavior:contain;}
.ef-register-preview-document .ba-fit-viewport{max-height:none!important;overflow-y:visible!important;}
.ef-register-preview-document .ba-fit-stage{margin:0 auto;}
.ef-register-preview-dialog .ef-preview-toolbar{flex:0 0 auto;}
.ef-register-preview-dialog .ba-global-report-zoom{display:flex;gap:3px;margin-left:0;}
.ef-register-preview-dialog .ba-global-report-zoom button,.ef-register-preview-dialog .ba-global-report-zoom select{
 min-height:31px;min-width:31px;font-size:12px;border:1px solid var(--border,#d4dae3);
 background:var(--surface,#fff);color:var(--text,#182235);border-radius:7px;padding:4px;}
@media(min-width:700px) and (max-width:1150px){.ef-class-browser{grid-template-columns:repeat(3,minmax(0,1fr));}}
@media(max-width:699px){.ef-class-browser{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;}
 .ef-page .ef-class-card{display:grid;grid-template-columns:36px minmax(0,1fr) auto;
  gap:7px;padding:9px;min-height:92px;align-content:center;}
 .ef-class-card-status{grid-column:2/-1;}.ef-class-card-arrow{grid-column:3;grid-row:1;}
 .ef-register-preview-document{padding:5px;}}
`;
