"use client";

/**
 * Shared branch expense / income workspace.
 * Replaces no database fields and makes no schema changes.
 * Academic terms filter existing transactions by configured inclusive dates.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { useDataRevision } from "../../hooks/useDataRevision";
import { useRegisterBranchWorkspaceToolbar } from "../../components/role-portals/shell/BranchWorkspaceToolbar";
import { printBranchTable } from "../../components/role-portals/shell/BranchTablePrint";
import { createLocal, listActiveLocal, softDeleteLocal, updateLocal } from "../../lib/sync/syncUtils";
import { FINANCE_CURRENCIES, getFinanceCurrency, formatFinanceMoney } from "./finance/financeCurrency";
import { AcademicFinancePeriodBar, useFinanceAcademicPeriod } from "./finance/useFinanceAcademicPeriod";

type AnyRow = Record<string, any>;
type Kind = "expenses" | "incomes";
type View = "cards" | "table" | "analytics";
type PaymentMethod = "cash" | "momo" | "bank" | "card";
type FormState = {
  id: string; title: string; description: string; amount: string; date: string;
  paymentMethod: PaymentMethod; source: string; organizationId: string;
  paidTo: string; approvedBy: string; receivedBy: string;
  referenceNumber: string; receiptNumber: string; currencyCode: string;
};
const EXPENSE_CATEGORIES = [
  ["utilities", "Utilities", "💡"], ["salary", "Salary", "🧾"],
  ["transport", "Transport", "🚌"], ["feeding", "Feeding", "🍲"],
  ["maintenance", "Maintenance", "🛠️"], ["procurement", "Procurement", "📦"],
  ["events", "Events", "🎪"], ["academic", "Academic", "📚"],
  ["administration", "Administration", "🗂️"], ["technology", "Technology", "💻"],
  ["marketing", "Marketing", "📣"], ["security", "Security", "🛡️"],
  ["other", "Other", "📌"],
] as const;
const INCOME_SOURCES = [
  ["fees_related", "Fees Related", "💵"], ["donation", "Donation", "🎁"],
  ["admission", "Admission", "📄"], ["service", "Service", "🧾"],
  ["canteen", "Canteen", "🍲"], ["transport", "Transport", "🚌"],
  ["uniform", "Uniform", "👕"], ["other", "Other", "💰"],
] as const;
const str = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => {
  const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0;
};
const validMoney = (value: unknown) => Math.max(0, Math.round(number(value) * 100) / 100);
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const money = (value: unknown, code: string) => formatFinanceMoney(number(value), code);
const randomReceipt = () => `INC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
function dateLabel(value: unknown): string {
  if (!value) return "Not set";
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? "Not set" : new Intl.DateTimeFormat("en-GH", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(d);
}
function safeStorage(key: string): string {
  if (typeof window === "undefined") return "";
  try { return window.localStorage.getItem(key) || window.sessionStorage.getItem(key) || ""; }
  catch { return ""; }
}
function openWorkspace(): AnyRow | null {
  try { return JSON.parse(safeStorage("eleeveon_open_workspace")) as AnyRow; }
  catch { return null; }
}
function idOf(value: unknown): string {
  if (value && typeof value === "object") {
    const o = value as AnyRow;
    return str(o.id ?? o.localId ?? o.cloudId ?? o.payload?.id);
  }
  return str(value);
}
function inBranch(row: AnyRow, account: string, school: string, branch: string) {
  return row && row.isDeleted !== true && row.active !== false &&
    (!row.accountId || idOf(row.accountId) === account) &&
    idOf(row.schoolId) === school && idOf(row.branchId) === branch;
}
function pickName(row?: AnyRow | null) {
  return str(row?.fullName || row?.name || row?.title || row?.label) || "Unnamed";
}
function defaultForm(kind: Kind, currency: string): FormState {
  return { id:"", title:"", description:"", amount:"", date:isoToday(),
    paymentMethod:"cash", source:"other", organizationId:"", paidTo:"", approvedBy:"",
    receivedBy:"", referenceNumber:"", receiptNumber:kind === "incomes" ? randomReceipt():"",
    currencyCode:currency };
}
function FinanceLedgerModule({kind}: {kind: Kind}) {
  const income = kind === "incomes";
  const noun = income ? "Income" : "Expense";
  const plural = income ? "Incomes" : "Expenses";
  const router = useRouter();
  const revision = useDataRevision();
  const {accountId, authenticated, loading: accountLoading} = useAccount();
  const {settings, loading: settingsLoading} = useSettings();
  const {activeMembership} = useActiveMembership() as any;
  const {activeSchoolId, activeBranchId, activeSchool, activeBranch} = useActiveBranch();
  const session = useMemo(() => openWorkspace(), []);
  const account = str(accountId);
  const school = idOf(session?.schoolId) || idOf(session?.membership?.schoolId) ||
    idOf(session?.membership?.school?.id) || idOf(activeMembership?.schoolId) ||
    idOf(activeMembership?.school?.id) || idOf(activeSchoolId) ||
    idOf(activeSchool?.id) || idOf(settings?.schoolId) || safeStorage("activeSchoolId");
  const branch = idOf(session?.branchId) || idOf(session?.membership?.branchId) ||
    idOf(session?.membership?.schoolBranchId) || idOf(session?.membership?.branch?.id) ||
    idOf(activeMembership?.branchId) || idOf(activeMembership?.schoolBranchId) ||
    idOf(activeMembership?.branch?.id) || idOf(activeBranchId) ||
    idOf(activeBranch?.id) || idOf(settings?.branchId) || safeStorage("activeBranchId");
  const primary = str(settings?.primaryColor) || "#2563eb";
  const academicScope = useFinanceAcademicPeriod({ accountId: account, schoolId:school, branchId:branch, settings, revision });
  const [records, setRecords] = useState<AnyRow[]>([]);
  const [organizations, setOrganizations] = useState<AnyRow[]>([]);
  const [currencySettings, setCurrencySettings] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{message:string;error?:boolean} | null>(null);
  const [view, setView] = useState<View>("cards");
  const viewChosen = useRef(false);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("GHS");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<AnyRow|null>(null);
  const [form, setForm] = useState<FormState>(() => defaultForm(kind,"GHS"));
  const sources: ReadonlyArray<readonly [string, string, string]> = income ? INCOME_SOURCES : EXPENSE_CATEGORIES;
  const sourceLabel = (source: unknown) => sources.find(item => item[0] === source)?.[1] || "Other";
  const sourceIcon = (source: unknown) => sources.find(item => item[0] === source)?.[2] || "📌";

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !account) router.replace("/login");
  }, [accountLoading, authenticated, account, router]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 980px)");
    const choose = () => { if (!viewChosen.current) setView(media.matches ? "table" : "cards"); };
    choose();
    media.addEventListener?.("change",choose);
    return () => media.removeEventListener?.("change",choose);
  }, []);

  const load = useCallback(async () => {
    if (!authenticated || !account || !school || !branch) { setLoading(false); return; }
    setLoading(true);
    try {
      const [rows, orgs, currencies] = await Promise.all([
        listActiveLocal<AnyRow>(kind as any),
        listActiveLocal<AnyRow>("organizations" as any),
        listActiveLocal<AnyRow>("schoolCurrencySettings" as any),
      ]);
      setRecords((rows || []).filter(row => inBranch(row,account,school,branch)));
      setOrganizations((orgs || []).filter(row => inBranch(row,account,school,branch))
        .sort((a,b) => pickName(a).localeCompare(pickName(b))));
      setCurrencySettings((currencies || []).filter(row => inBranch(row,account,school,branch)));
    } catch (error) { console.error(`Failed loading ${kind}`,error);
      setNotice({message:`Unable to load ${kind}.`,error:true}); }
    finally { setLoading(false); }
  }, [kind, authenticated, account, school, branch]);
  useEffect(() => { if (!accountLoading && !settingsLoading) void load(); },
    [load, revision, accountLoading, settingsLoading, activeMembership?.role]);
  const preferredCurrency = useMemo(() => {
    const row = currencySettings.find(row => row.defaultForIncomeExpense) ||
      currencySettings.find(row => row.active !== false) || currencySettings[0];
    return str(row?.currencyCode || records[0]?.currencyCode) || "GHS";
  }, [currencySettings,records]);
  useEffect(() => { setCurrencyFilter(v => v === "GHS" ? preferredCurrency : v); }, [preferredCurrency]);
  const organizationMap = useMemo(() => new Map(organizations.map(row => [idOf(row),pickName(row)])), [organizations]);
  const displayed = useMemo(() => {
    const q = query.toLocaleLowerCase().trim();
    return records.filter(row => academicScope.matchesDate(row.date || row.createdAt))
      .filter(row => sourceFilter === "all" || str(income ? row.source : row.expenseSourceType) === sourceFilter)
      .filter(row => methodFilter === "all" || str(row.paymentMethod) === methodFilter)
      .filter(row => organizationFilter === "all" || idOf(row.organizationId) === organizationFilter)
      .filter(row => currencyFilter === "all" || str(row.currencyCode || preferredCurrency).toUpperCase() === currencyFilter)
      .filter(row => !q || [row.title,row.description,row.source,row.expenseSourceType,
        row.paidTo,row.receivedBy,row.approvedBy,row.referenceNumber,row.receiptNumber,
        organizationMap.get(idOf(row.organizationId))].join(" ").toLowerCase().includes(q))
      .sort((a,b) => {
        const d = (row:AnyRow) => new Date(row.date || row.updatedAt || row.createdAt || 0).getTime() || 0;
        return d(b)-d(a);
      });
  }, [records, academicScope.filterSignature, sourceFilter,methodFilter,
      organizationFilter,currencyFilter,preferredCurrency,query,organizationMap,income]);
  const currencies = useMemo(() => [...new Set(displayed.map(row => str(row.currencyCode || preferredCurrency)))],
    [displayed,preferredCurrency]);
  const mixedCurrencies = currencies.length > 1;
  const totalByCurrency = useMemo(() => currencies.map(code => ({
    code,total:displayed.filter(row => str(row.currencyCode || preferredCurrency) === code)
      .reduce((sum,row) => sum + number(row.amount),0),
  })), [currencies, displayed, preferredCurrency]);
  const sum = (filter: (row:AnyRow)=>boolean) => displayed
    .filter(row => str(row.currencyCode || preferredCurrency) ===
      (currencyFilter === "all" ? preferredCurrency : currencyFilter))
    .filter(filter).reduce((total,row)=>total+number(row.amount),0);
  const summaryCode = currencyFilter === "all" ? preferredCurrency : currencyFilter;
  const total = sum(()=>true);
  const grouped = sources.map(([source,label,icon])=>({source,label,icon,
    count:displayed.filter(row => str(income ? row.source : row.expenseSourceType) === source).length,
    amount:sum(row => str(income ? row.source : row.expenseSourceType) === source),
  })).filter(row=>row.count>0);
  const methodAmounts = (["cash","momo","bank","card"] as const).map(method=>({
    method,amount:sum(row=>str(row.paymentMethod)===method)
  }));
  const setField = (key: keyof FormState, value: string) => setForm(old => ({...old,[key]:value}));
  function edit(row?:AnyRow) {
    const code = str(row?.currencyCode) || preferredCurrency;
    setNotice(null);
    setForm(row ? {
      id:idOf(row), title:str(row.title), description:str(row.description),
      amount:str(row.amount), date:str(row.date) || isoToday(),
      paymentMethod:(row.paymentMethod || "cash") as PaymentMethod,
      source:str(income ? row.source : row.expenseSourceType) || "other",
      organizationId:idOf(row.organizationId),paidTo:str(row.paidTo),
      approvedBy:str(row.approvedBy),receivedBy:str(row.receivedBy),
      referenceNumber:str(row.referenceNumber),receiptNumber:str(row.receiptNumber),currencyCode:code,
    } : defaultForm(kind,preferredCurrency));
    setSelectedRow(null);
    setEditorOpen(true);
  }
  async function save() {
    if (!account || !school || !branch) {setNotice({message:"Choose a school and branch.",error:true});return;}
    if (!str(form.title)) {setNotice({message:"Enter a title.",error:true});return;}
    if (!(number(form.amount)>0)) {setNotice({message:"Enter a valid amount.",error:true});return;}
    if (!form.date) {setNotice({message:"Select a date.",error:true});return;}
    setBusy(true);
    try {
      const payload:AnyRow = {
        accountId:account,schoolId:school,branchId:branch,
        organizationId:idOf(form.organizationId)||undefined,
        title:form.title.trim(), description:form.description.trim(),
        amount:validMoney(form.amount),paymentMethod:form.paymentMethod,date:form.date,
        referenceNumber:form.referenceNumber.trim(),receiptNumber:form.receiptNumber.trim() ||
          (income ? randomReceipt() : ""),currencyCode:form.currencyCode,
        currencySymbol:getFinanceCurrency(form.currencyCode).symbol,
        active:true,isDeleted:false,
        ...(income ? {source:form.source,receivedBy:form.receivedBy.trim()} :
          {expenseSourceType:form.source,paidTo:form.paidTo.trim(),approvedBy:form.approvedBy.trim()}),
      };
      if (form.id) await updateLocal(kind as any,form.id,payload);
      else await createLocal(kind as any,payload);
      setEditorOpen(false);
      setNotice({message:`${noun} ${form.id?"updated":"saved"}.`});
      await load();
    } catch(error) {console.error(error);setNotice({message:`Could not save ${noun.toLowerCase()}.`,error:true});}
    finally {setBusy(false);}
  }
  async function remove(row:AnyRow) {
    const key = idOf(row);
    if (!key || !window.confirm(`Delete ${noun.toLowerCase()} ${str(row.title)||"record"}?`)) return;
    try {await softDeleteLocal(kind as any,key);setSelectedRow(null);
      setNotice({message:`${noun} deleted.`});await load();}
    catch(error) {console.error(error);setNotice({message:`Could not delete ${noun.toLowerCase()}.`,error:true});}
  }
  const printRecords = () => printBranchTable({
    title:`Branch ${noun} Records`,
    subtitle:`${displayed.length} ${kind} · ${academicScope.label} · Selected branch`,
    columns:[
      {key:"date",label:"Date"},{key:"title",label:noun},
      {key:"source",label:income?"Source":"Category"},{key:"method",label:"Method"},
      {key:"person",label:income?"Received By":"Paid To"},{key:"amount",label:"Amount"},
    ],
    rows:displayed.map(row => ({
      date:dateLabel(row.date),title:row.title || noun,
      source:sourceLabel(income ? row.source : row.expenseSourceType),
      method:row.paymentMethod || "Cash",
      person:income ? row.receivedBy || "Not recorded" : row.paidTo || "Not recorded",
      amount:money(row.amount,row.currencyCode||preferredCurrency),
    })),
  });
  useRegisterBranchWorkspaceToolbar("financeWorkspace",{
    add:()=>edit(),search:setQuery,filter:()=>setFilterOpen(true),
    more:()=>setMoreOpen(true),print:printRecords,
  });
  useEffect(() => {
    if (!(filterOpen||moreOpen||editorOpen||selectedRow)) return;
    const previousBody=document.body.style.overflow;
    const previousHtml=document.documentElement.style.overflow;
    document.body.style.overflow="hidden";
    document.documentElement.style.overflow="hidden";
    return ()=>{document.body.style.overflow=previousBody;document.documentElement.style.overflow=previousHtml;};
  },[filterOpen,moreOpen,editorOpen,selectedRow]);
  const actions = (row:AnyRow) => <div className="fl-actions">
    {income && <button type="button" onClick={()=>setSelectedRow(row)}>View</button>}
    <button type="button" onClick={()=>edit(row)}>Edit</button>
    <button type="button" className="danger" onClick={()=>void remove(row)}>Delete</button>
  </div>;
  const field = (label:string, child:React.ReactNode, wide=false) =>
    <label className={wide?"wide":""}><span>{label}</span>{child}</label>;
  const input = (key:keyof FormState, props:React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <input {...props} value={form[key]} onChange={e=>setField(key,e.target.value)} />;
  const select = (key:keyof FormState, choices:Array<{value:string;label:string}>) =>
    <select value={form[key]} onChange={e=>setField(key,e.target.value)}>
      {choices.map(row=><option key={row.value} value={row.value}>{row.label}</option>)}
    </select>;
  const paymentChoices = (["cash","momo","bank","card"] as const)
    .map(value=>({value,label:value==="momo"?"Mobile Money":value[0].toUpperCase()+value.slice(1)}));
  const formError = notice?.error && editorOpen ? notice.message : null;
  const portal = typeof document !== "undefined" ? document.body : null;
  if (accountLoading || settingsLoading || loading) return <main className="fl-page" style={{"--fl-primary":primary} as React.CSSProperties}>
    <style>{styles}</style><div className="fl-state">Opening {plural.toLowerCase()}…</div></main>;
  if (!authenticated || !account) return <main className="fl-page"><div className="fl-state">Sign in to manage branch finances.</div></main>;
  if (!school || !branch) return <main className="fl-page"><div className="fl-state">Choose a school and branch workspace.</div></main>;

  return <main className="fl-page" style={{"--fl-primary":primary} as React.CSSProperties}>
    <style>{styles}</style>
    <AcademicFinancePeriodBar scope={academicScope} title={plural} hint={`Filter: change term · +: ${income?"record income":"record expense"}`} />
    {notice && !(editorOpen&&notice.error) && <div className={`fl-toast ${notice.error?"error":""}`} role="status">
      {notice.message}<button type="button" onClick={()=>setNotice(null)} aria-label="Dismiss">×</button></div>}
    {(sourceFilter!=="all"||methodFilter!=="all"||organizationFilter!=="all"||currencyFilter!==preferredCurrency||query) &&
      <div className="fl-chips">
        {sourceFilter!=="all"&&<button onClick={()=>setSourceFilter("all")}>{sourceLabel(sourceFilter)} ×</button>}
        {methodFilter!=="all"&&<button onClick={()=>setMethodFilter("all")}>{methodFilter} ×</button>}
        {organizationFilter!=="all"&&<button onClick={()=>setOrganizationFilter("all")}>{organizationMap.get(organizationFilter)||"Organization"} ×</button>}
        {currencyFilter!==preferredCurrency&&<button onClick={()=>setCurrencyFilter(preferredCurrency)}>{currencyFilter} ×</button>}
        {query&&<button onClick={()=>setQuery("")}>Search ×</button>}
      </div>}
    {view==="analytics" && <section className="fl-analytics" aria-label={`${plural} analytics`}>
      {mixedCurrencies && <p className="fl-currency-note">Multiple currencies. Totals are kept separate, without conversion.</p>}
      {(mixedCurrencies ? totalByCurrency.map(row=>({title:`${row.code} total`,amount:row.total,code:row.code})) :
        [{title:`Total ${plural.toLowerCase()}`,amount:total,code:summaryCode},
        ...methodAmounts.map(row=>({title:row.method==="momo"?"Mobile Money":row.method,amount:row.amount,code:summaryCode}))])
        .map(row=><article className="fl-metric" key={row.title}><small>{row.title}</small>
          <strong>{money(row.amount,row.code)}</strong><span>{displayed.length} records shown</span></article>)}
      {!mixedCurrencies&&<article className="fl-metric full"><small>{income?"By income source":"By category"}</small>
        {grouped.map(row=><div key={row.source} className="fl-metric-row"><span>{row.icon} {row.label}</span><b>{money(row.amount,summaryCode)}</b></div>)}
        {!grouped.length&&<p>No records in this period.</p>}</article>}
    </section>}
    {view==="table" && <section className="fl-table-card"><div className="fl-table-scroll">
      <table><thead><tr><th>{plural} ({displayed.length})</th>
        <th>{income?"Source":"Category"}</th><th>Organization</th><th>Amount</th>
        <th>Method</th><th>{income?"Received By":"Paid To"}</th>
        <th>Date</th><th>Reference</th><th>Actions</th></tr></thead>
      <tbody>{displayed.map(row=><tr key={idOf(row)}><td><strong>{str(row.title)||noun}</strong>
          <small>{str(row.description)}</small></td>
        <td>{sourceIcon(income?row.source:row.expenseSourceType)} {sourceLabel(income?row.source:row.expenseSourceType)}</td>
        <td>{organizationMap.get(idOf(row.organizationId))||"General branch"}</td>
        <td><b>{money(row.amount,row.currencyCode||preferredCurrency)}</b></td><td>{str(row.paymentMethod)||"Cash"}</td>
        <td>{str(income?row.receivedBy:row.paidTo)||"Not set"}</td><td>{dateLabel(row.date)}</td>
        <td>{str(row.receiptNumber||row.referenceNumber)||"Not set"}</td><td>{actions(row)}</td></tr>)}</tbody></table>
      {!displayed.length&&<div className="fl-empty">No {kind} found for this period. Use Filter to view another term or + to add a record.</div>}
    </div></section>}
    {view==="cards"&&<section className="fl-cards">
      {displayed.map(row=><article className="fl-card" key={idOf(row)}>
        <div className="fl-avatar">{sourceIcon(income?row.source:row.expenseSourceType)}</div>
        <div className="fl-card-main"><strong>{str(row.title)||noun}</strong>
          <small>{sourceLabel(income?row.source:row.expenseSourceType)} · {organizationMap.get(idOf(row.organizationId))||"General branch"}</small>
          <small>{dateLabel(row.date)} · {str(income?row.receivedBy:row.paidTo)||"Not specified"}</small></div>
        <div className="fl-card-bottom"><b>{money(row.amount,row.currencyCode||preferredCurrency)}</b>
          <span>{str(row.paymentMethod)||"Cash"}</span>{actions(row)}</div></article>)}
      {!displayed.length&&<div className="fl-empty">No {kind} for {academicScope.label}. Use Filter for other terms, or + to add a record.</div>}
    </section>}
    {portal&&(filterOpen||moreOpen||editorOpen||selectedRow)&&createPortal(
      <div className="fl-modal-host" style={{"--fl-primary":primary} as React.CSSProperties}>
        <style>{styles}</style>
        {filterOpen&&<div className="fl-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setFilterOpen(false)}}>
          <section className="fl-sheet" role="dialog" aria-modal="true" aria-label={`${plural} filters`}>
            <div className="fl-head"><div><h2>Filters</h2><small>Choose the academic period and other filters.</small></div>
              <button onClick={()=>setFilterOpen(false)} aria-label="Close">×</button></div>
            <div className="fl-form-grid">
              {field("Academic period",<select value={academicScope.selectedKey} onChange={e=>academicScope.setSelectedKey(e.target.value)}>
                <option value="all">All dates</option>{academicScope.options.map(option=><option key={option.key} value={option.key}>
                  {option.structure} · {option.period}</option>)}</select>,true)}
              {field(income?"Source":"Category",<select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}>
                <option value="all">All {income?"sources":"categories"}</option>{sources.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>)}
              {field("Payment method",<select value={methodFilter} onChange={e=>setMethodFilter(e.target.value)}>
                <option value="all">All methods</option>{paymentChoices.map(row=><option key={row.value} value={row.value}>{row.label}</option>)}</select>)}
              {field("Currency",<select value={currencyFilter} onChange={e=>setCurrencyFilter(e.target.value)}>
                <option value="all">All currencies (separate totals)</option>{FINANCE_CURRENCIES.map(row=><option key={row.code} value={row.code}>{row.name} ({row.code})</option>)}</select>)}
              {field("Organization",<select value={organizationFilter} onChange={e=>setOrganizationFilter(e.target.value)}>
                <option value="all">All organizations</option>{organizations.map(row=><option key={idOf(row)} value={idOf(row)}>{pickName(row)}</option>)}</select>,true)}
            </div>
            <div className="fl-footer"><button onClick={()=>{academicScope.reset();setSourceFilter("all");setMethodFilter("all");setOrganizationFilter("all");setCurrencyFilter(preferredCurrency);}}>Reset</button>
              <button className="primary" onClick={()=>setFilterOpen(false)}>Apply</button></div>
          </section></div>}
        {moreOpen&&<div className="fl-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setMoreOpen(false)}}>
          <section className="fl-sheet narrow" role="dialog" aria-modal="true" aria-label="More options">
            <div className="fl-head"><div><h2>More</h2><small>Views and finance actions</small></div><button onClick={()=>setMoreOpen(false)}>×</button></div>
            <div className="fl-menu">
              {(["cards","table","analytics"] as View[]).map(mode=><button key={mode} className={mode===view?"active":""} onClick={()=>{viewChosen.current=true;setView(mode);setMoreOpen(false)}}>
                {mode==="cards"?"☰":mode==="table"?"☷":"◔"} · {mode[0].toUpperCase()+mode.slice(1)} view</button>)}
              <button onClick={()=>{setMoreOpen(false);edit()}}>+ New {noun.toLowerCase()}</button>
              <button onClick={()=>{setMoreOpen(false);void load()}}>↻ Refresh records</button>
            </div>
          </section></div>}
        {editorOpen&&<div className="fl-overlay drawer-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditorOpen(false)}}>
          <section className="fl-sheet fl-drawer" role="dialog" aria-modal="true" aria-label={`Edit ${noun}`}>
            <div className="fl-head"><div><small>{form.id?"Edit":"New"} {noun}</small>
              <h2>Branch {noun}</h2><small>{form.amount?money(form.amount,form.currencyCode):`Record ${income?"non-fee income":"branch spending"}`}</small></div>
              <button type="button" onClick={()=>setEditorOpen(false)} aria-label="Close">×</button></div>
            {formError&&<p className="fl-form-error" role="alert">{formError}</p>}
            <div className="fl-form-grid">
              {field("Title",input("title",{placeholder:income?"Donation, Canteen...":"Electricity, chalk..."}))}
              {field("Amount",input("amount",{type:"number",min:"0.01",step:"0.01",placeholder:"0"}))}
              {field(income?"Source":"Category",select("source",sources.map(([value,label])=>({value,label}))))}
              {field("Payment method",select("paymentMethod",paymentChoices))}
              {field("Date",input("date",{type:"date"}))}
              {field("Organization",select("organizationId",[{value:"",label:income?"No organization":"General branch"},
                ...organizations.map(row=>({value:idOf(row),label:pickName(row)}))]))}
              {income?field("Received by",input("receivedBy")):field("Paid to / Vendor",input("paidTo"))}
              {!income&&field("Approved by",input("approvedBy"))}
              {field("Reference number",input("referenceNumber"))}
              {field("Receipt number",input("receiptNumber"))}
              {field("Currency",<select value={form.currencyCode} onChange={e=>setField("currencyCode",e.target.value)}>
                {FINANCE_CURRENCIES.map(row=><option key={row.code} value={row.code}>{row.name} ({row.code})</option>)}
                {!FINANCE_CURRENCIES.some(row=>row.code===form.currencyCode)&&<option value={form.currencyCode}>{form.currencyCode}</option>}
              </select>)}
              {field("Description",<textarea value={form.description} onChange={e=>setField("description",e.target.value)} placeholder="Optional details for audit and reporting"/>,true)}
            </div>
            <div className="fl-footer"><button onClick={()=>setEditorOpen(false)}>Cancel</button>
              <button className="primary" onClick={()=>void save()} disabled={busy}>{busy?"Saving…":`Save ${noun}`}</button></div>
          </section></div>}
        {selectedRow&&income&&<div className="fl-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedRow(null)}}>
          <section className="fl-sheet" role="dialog" aria-modal="true" aria-label="Income details">
            <div className="fl-head"><div><h2>{str(selectedRow.title)||"Income"}</h2>
              <small>{sourceLabel(selectedRow.source)} · {dateLabel(selectedRow.date)}</small></div>
              <button onClick={()=>setSelectedRow(null)}>×</button></div>
            <div className="fl-detail"><strong>{money(selectedRow.amount,selectedRow.currencyCode||preferredCurrency)}</strong>
              {[["Method",selectedRow.paymentMethod],["Received by",selectedRow.receivedBy],
                ["Receipt",selectedRow.receiptNumber],["Reference",selectedRow.referenceNumber],
                ["Organization",organizationMap.get(idOf(selectedRow.organizationId))],
                ["Description",selectedRow.description]].map(([label,value])=><div key={label}><small>{label}</small><b>{str(value)||"Not set"}</b></div>)}
            </div>
            <div className="fl-footer"><button onClick={()=>setSelectedRow(null)}>Close</button>
              <button onClick={()=>edit(selectedRow)}>Edit</button><button className="danger" onClick={()=>void remove(selectedRow)}>Delete</button></div>
          </section></div>}
      </div>,portal)}
  </main>;
}

const styles = `
.fl-page,.fl-modal-host{--fl-bg:var(--card-bg,var(--surface,#fff));--fl-text:var(--text,#182235);--fl-muted:var(--muted,#64748b);--fl-border:var(--border,#d4dae3);color:var(--fl-text);font:13px/1.45 var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif)}
.fl-page{width:100%;min-width:0;padding:4px 5px 20px;background:transparent;}
.fl-page *,.fl-modal-host *{box-sizing:border-box;min-width:0;}
.fl-page button,.fl-modal-host button,.fl-modal-host select,.fl-modal-host input,.fl-modal-host textarea{font:inherit;cursor:pointer;}
.fl-state{padding:24px;text-align:center;color:var(--fl-muted)}
.fl-toast{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:8px 0;background:color-mix(in srgb,var(--fl-primary) 10%,var(--fl-bg));border:1px solid var(--fl-border);border-radius:10px;padding:9px 12px;font-weight:700;}
.fl-toast.error,.fl-form-error{color:#b91c1c;background:color-mix(in srgb,#dc2626 8%,var(--fl-bg));}
.fl-toast button{background:none;border:0;color:inherit;font-size:19px;}
.fl-chips{display:flex;gap:5px;overflow-x:auto;padding:6px 0;}.fl-chips button{flex:0 0 auto;white-space:nowrap;border:0;border-radius:20px;padding:5px 9px;background:color-mix(in srgb,var(--fl-primary) 11%,var(--fl-bg));color:var(--fl-primary);font-size:11px;}
.fl-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:8px;}
.fl-card,.fl-table-card,.fl-metric,.fl-empty{background:color-mix(in srgb,var(--fl-bg) 93%,var(--fl-text) 7%);border:1px solid color-mix(in srgb,var(--fl-border) 85%,var(--fl-text) 15%);border-radius:13px;box-shadow:none;}
.fl-card{display:grid;grid-template-columns:39px minmax(0,1fr);align-items:start;gap:8px;padding:10px;}
.fl-avatar{height:39px;width:39px;display:grid;place-items:center;border-radius:11px;background:color-mix(in srgb,var(--fl-primary) 11%,var(--fl-bg));font-size:19px;}
.fl-card-main{display:grid;gap:2px;}.fl-card-main strong{font-weight:850;font-size:13px;overflow-wrap:anywhere}.fl-card-main small{color:var(--fl-muted);font-size:10.5px;overflow-wrap:anywhere}
.fl-card-bottom{grid-column:1/-1;display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
.fl-card-bottom>b{margin-right:auto;font-size:12px;white-space:nowrap}.fl-card-bottom>span{padding:4px 7px;border-radius:7px;background:color-mix(in srgb,var(--fl-primary) 11%,var(--fl-bg));font-size:10px;text-transform:capitalize;}
.fl-actions{display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.fl-actions button{min-height:29px;border:1px solid var(--fl-border);border-radius:7px;padding:4px 8px;background:var(--fl-bg);color:var(--fl-text);font-weight:750;font-size:10.5px;}
.fl-actions button.danger,.fl-footer button.danger{color:#b91c1c;border-color:color-mix(in srgb,#dc2626 20%,var(--fl-border));}
.fl-table-card{padding:5px;margin-top:8px;width:100%;overflow:visible;}.fl-table-scroll{overflow-x:auto;border-radius:10px;-webkit-overflow-scrolling:touch;}.fl-table-scroll table{width:100%;min-width:920px;border-collapse:collapse;text-align:left;}
.fl-table-scroll th,.fl-table-scroll td{padding:9px 8px;border-bottom:1px solid var(--fl-border);vertical-align:top;text-align:left;font-size:11.5px;}.fl-table-scroll th{position:sticky;top:0;z-index:1;color:var(--fl-text);background:color-mix(in srgb,var(--fl-bg) 84%,var(--fl-text) 16%);font-size:11px;}.fl-table-scroll tbody tr:nth-child(even){background:color-mix(in srgb,var(--fl-bg) 92%,var(--fl-text) 8%);}.fl-table-scroll td small{display:block;color:var(--fl-muted);margin-top:3px;}
.fl-empty{padding:25px 12px;text-align:center;color:var(--fl-muted);font-size:12px;grid-column:1/-1;}
.fl-analytics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:9px;}.fl-metric{padding:13px;}.fl-metric small,.fl-metric span{color:var(--fl-muted);font-size:11px;display:block;}.fl-metric strong{font-size:clamp(17px,2.2vw,27px);display:block;overflow-wrap:anywhere;margin:6px 0;}.fl-metric.full{grid-column:span 2;}.fl-metric-row{display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--fl-border);padding:7px 0;font-size:11px;}.fl-currency-note{grid-column:1/-1;color:var(--fl-muted);font-size:11px;margin:0;}
.fl-modal-host{position:fixed;inset:0;width:0;height:0;pointer-events:none;z-index:50000;}
.fl-overlay{position:fixed;inset:0;width:100vw;height:100dvh;z-index:50001;display:grid;place-items:center;padding:14px;pointer-events:auto;background:rgba(15,23,42,.52);backdrop-filter:blur(10px);}
.fl-sheet{width:min(700px,100%);max-height:calc(100dvh - 28px);overflow-y:auto;border-radius:16px;padding:15px;background:var(--fl-bg);color:var(--fl-text);box-shadow:0 30px 80px rgba(0,0,0,.23);overscroll-behavior:contain;}
.fl-sheet.narrow{width:min(480px,100%)}.fl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px;}.fl-head h2{font-size:19px;margin:0;}.fl-head small{font-size:11px;color:var(--fl-muted);}.fl-head>button{flex:0 0 34px;width:34px;height:34px;border:1px solid var(--fl-border);background:var(--fl-bg);border-radius:50%;color:var(--fl-text);font-size:18px;}
.fl-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}.fl-form-grid label{display:grid;gap:5px;min-width:0}.fl-form-grid label.wide{grid-column:1/-1}.fl-form-grid label>span{font-size:10.5px;font-weight:800;color:var(--fl-muted);text-transform:uppercase;letter-spacing:.04em;}
.fl-form-grid input,.fl-form-grid select,.fl-form-grid textarea{width:100%;height:42px;min-height:42px;border-radius:8px;border:1px solid var(--fl-border);background:var(--input-bg,var(--fl-bg));color:var(--input-text,var(--fl-text));padding:9px 10px;outline:none;font-size:13px;}
.fl-form-grid textarea{height:88px;resize:vertical;}.fl-form-grid input:focus,.fl-form-grid select:focus,.fl-form-grid textarea:focus{border-color:var(--fl-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--fl-primary) 13%,transparent);}
.fl-footer{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;position:sticky;bottom:-15px;padding:12px 0 2px;margin-top:14px;background:var(--fl-bg);}.fl-footer button{min-height:38px;border:1px solid var(--fl-border);background:var(--fl-bg);color:var(--fl-text);border-radius:8px;padding:7px 14px;font-weight:800;}.fl-footer button.primary{background:var(--fl-primary);color:#fff;border-color:var(--fl-primary);}.fl-footer button:disabled{opacity:.55;cursor:wait}.fl-form-error{padding:9px 10px;border-radius:8px;font-size:12px;font-weight:700;}
.fl-menu{display:grid;gap:6px;}.fl-menu button{border:1px solid var(--fl-border);border-radius:9px;background:var(--fl-bg);color:var(--fl-text);padding:13px;text-align:left;font-weight:750;}.fl-menu button.active{background:color-mix(in srgb,var(--fl-primary) 9%,var(--fl-bg));border-color:var(--fl-primary);}
.fl-detail>strong{font-size:23px;margin-bottom:8px;display:block;}.fl-detail>div{padding:9px;background:color-mix(in srgb,var(--fl-bg) 92%,var(--fl-text) 8%);border-radius:8px;margin-bottom:6px;}.fl-detail small{display:block;color:var(--fl-muted);font-size:11px;}.fl-detail b{font-size:12px;overflow-wrap:anywhere;}
.fl-drawer{width:min(670px,100%);max-height:100dvh;height:100dvh;border-radius:0;}.fl-overlay.drawer-overlay{padding:0;place-items:stretch end;}
@media(max-width:1030px){.fl-cards{grid-template-columns:repeat(2,minmax(0,1fr));}.fl-analytics{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:639px){.fl-page{padding:3px 4px 12px;}.fl-cards{grid-template-columns:1fr;gap:7px;}.fl-analytics{grid-template-columns:1fr;}.fl-metric.full{grid-column:1/-1;}.fl-overlay{padding:0;place-items:stretch;}.fl-sheet{width:100vw;height:100dvh;max-height:100dvh;border-radius:0;padding:calc(13px + env(safe-area-inset-top)) 12px calc(12px + env(safe-area-inset-bottom));}.fl-form-grid{grid-template-columns:1fr;}.fl-footer{display:grid;grid-template-columns:1fr;}.fl-footer button{width:100%;}}
`;

export default function IncomesPage() {
  return <FinanceLedgerModule kind="incomes" />;
}
