"use client";

/**
 * app/owner/invoices.tsx
 * ---------------------------------------------------------
 * OWNER — INVOICES
 * Golden compact rewrite
 * ---------------------------------------------------------
 *
 * Data behavior preserved:
 * - Requires authenticated account.
 * - Loads invoices from /billing/invoices.
 * - Caches live invoices locally.
 * - Falls back to local IndexedDB invoices when live server is unavailable.
 * - Keeps create/update invoice behavior.
 * - Keeps auto total calculation from subtotal - discount + tax.
 *
 * UI upgrade:
 * - Removed the large hero/header block.
 * - Removed large context/safety cards.
 * - Removed large always-visible summary cards.
 * - Uses the Golden compact pattern:
 *   - search + add + filter + more top row
 *   - compact active filter chips
 *   - invoices shown as compact StudentEnrollment-style rows
 *   - table and analytics available from More sheet
 *   - invoice editor uses compact bottom sheet
 *
 * Theme safety:
 * - All cards, notes, form fields, buttons, chips, table headers, sheets and empty states use theme variables.
 * - Dark mode visibility is handled using var(--card-bg), var(--surface), var(--text), var(--muted), var(--border), and color-mix.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { apiRequest } from "../lib/platformApi";
import { db } from "../lib/db";

type ViewMode = "cards" | "table" | "analytics";
type StatusFilter = "all" | "draft" | "issued" | "part_paid" | "paid" | "overdue" | "void";

type Invoice = {
  id?: string;
  accountId?: string;
  subscriptionId?: string | null;
  invoiceNumber?: string;
  currency?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  amountPaid?: number;
  balance?: number;
  status?: string;
  issueDate?: string;
  dueDate?: string | null;
  paidAt?: string | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type FormState = {
  id?: string;
  invoiceNumber: string;
  currency: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  status: "draft" | "issued" | "overdue" | "void";
  dueDate: string;
  note: string;
};

const DEFAULT_FORM: FormState = {
  invoiceNumber: "",
  currency: "GHS",
  subtotal: "",
  discount: "0",
  tax: "0",
  total: "",
  status: "draft",
  dueDate: "",
  note: "",
};

function normalizeArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.invoices)) return payload.invoices;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function money(amount?: number, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: currency || "GHS",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function safeDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function normalizeStatus(status?: string) {
  return String(status || "draft").toLowerCase();
}

function statusTone(status?: string): "green" | "red" | "blue" | "gray" | "orange" | "purple" {
  const value = normalizeStatus(status);
  if (value === "paid") return "green";
  if (["void", "cancelled"].includes(value)) return "red";
  if (["overdue", "part_paid"].includes(value)) return "orange";
  if (value === "issued") return "blue";
  if (value === "draft") return "gray";
  return "purple";
}

function invoiceBalance(invoice: Invoice) {
  return invoice.balance ?? Math.max(Number(invoice.total || 0) - Number(invoice.amountPaid || 0), 0);
}

function getTable<T = any>(...names: string[]): any {
  const anyDb = db as any;
  for (const name of names) {
    if (anyDb[name]) return anyDb[name];
  }
  return null;
}

async function tableToArray<T = any>(...names: string[]): Promise<T[]> {
  const table = getTable<T>(...names);
  return table?.toArray ? table.toArray() : [];
}

async function cacheInvoicesLocally(rows: Invoice[]) {
  const table = getTable<Invoice>("invoices");
  if (!table?.put) return;

  for (const row of rows) {
    if (!row?.id) continue;
    try {
      await table.put(row);
    } catch {
      // Cache failure should not block billing work.
    }
  }
}

function makePayload(form: FormState) {
  const subtotal = Number(form.subtotal || 0);
  const discount = Number(form.discount || 0);
  const tax = Number(form.tax || 0);
  const total = Number(form.total || subtotal - discount + tax);

  return {
    invoiceNumber: form.invoiceNumber.trim(),
    currency: form.currency.trim() || "GHS",
    subtotal,
    discount,
    tax,
    total,
    status: form.status,
    dueDate: form.dueDate || undefined,
    note: form.note.trim() || undefined,
  };
}

export default function InvoicesPage() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  async function load() {
    if (!authenticated || !accountId) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setNotice("");

      try {
        const remote = await apiRequest<any>("/billing/invoices");
        const rows = normalizeArray(remote) as Invoice[];
        setInvoices(rows);
        await cacheInvoicesLocally(rows);
      } catch {
        const localRows = await tableToArray<Invoice>("invoices");
        setInvoices(localRows.filter((row) => !row.accountId || row.accountId === accountId));
        setNotice("Live billing server was not available, so this page is showing the latest invoice data saved on this device.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId]);

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const status = normalizeStatus(invoice.status);
      if (statusFilter !== "all" && status !== statusFilter) return false;

      if (!query) return true;

      return `${invoice.invoiceNumber || ""} ${invoice.status || ""} ${invoice.currency || ""} ${invoice.total || ""} ${invoice.note || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [invoices, search, statusFilter]);

  const summary = useMemo(() => {
    const total = invoices.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const paid = invoices.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0);
    const balance = invoices.reduce((sum, row) => sum + invoiceBalance(row), 0);
    const currency = invoices[0]?.currency || "GHS";

    return {
      invoices: invoices.length,
      total,
      paid,
      balance,
      currency,
      paidCount: invoices.filter((row) => normalizeStatus(row.status) === "paid").length,
      unpaidCount: invoices.filter((row) => !["paid", "void", "cancelled"].includes(normalizeStatus(row.status))).length,
      overdueCount: invoices.filter((row) => normalizeStatus(row.status) === "overdue").length,
    };
  }, [invoices]);

  const statusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const invoice of invoices) {
      const status = normalizeStatus(invoice.status);
      map.set(status, (map.get(status) || 0) + 1);
    }

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [invoices]);

  const activeFilterCount = statusFilter === "all" ? 0 : 1;

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (["subtotal", "discount", "tax"].includes(String(key))) {
        const subtotal = Number(key === "subtotal" ? value : next.subtotal || 0);
        const discount = Number(key === "discount" ? value : next.discount || 0);
        const tax = Number(key === "tax" ? value : next.tax || 0);
        next.total = String(Math.max(subtotal - discount + tax, 0));
      }

      return next;
    });

    setMessage("");
  }

  function openCreate() {
    setForm({
      ...DEFAULT_FORM,
      invoiceNumber: `INV-${Date.now()}`,
    });
    setMessage("");
    setDrawerOpen(true);
  }

  function openEdit(invoice: Invoice) {
    const paid = normalizeStatus(invoice.status) === "paid";

    setForm({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber || "",
      currency: invoice.currency || "GHS",
      subtotal: String(invoice.subtotal || 0),
      discount: String(invoice.discount || 0),
      tax: String(invoice.tax || 0),
      total: String(invoice.total || 0),
      status: paid ? "issued" : (normalizeStatus(invoice.status) as FormState["status"]) || "draft",
      dueDate: invoice.dueDate ? String(invoice.dueDate).slice(0, 10) : "",
      note: invoice.note || "",
    });

    setMessage(
      paid
        ? "This invoice is already paid. You can review it, but do not manually change paid status here."
        : ""
    );

    setDrawerOpen(true);
  }

  function validate() {
    if (!form.invoiceNumber.trim()) return "Invoice number is required.";
    if (!form.subtotal.trim()) return "Subtotal is required.";
    if (!form.total.trim()) return "Total is required.";
    if (Number(form.total) < 0) return "Total cannot be negative.";
    return "";
  }

  async function saveInvoice() {
    const error = validate();
    if (error) {
      setMessage(error);
      return;
    }

    try {
      setSaving(true);

      const payload = makePayload(form);

      const response = form.id
        ? await apiRequest<any>(`/billing/invoices/${encodeURIComponent(form.id)}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          } as any)
        : await apiRequest<any>("/billing/invoices", {
            method: "POST",
            body: JSON.stringify(payload),
          } as any);

      await cacheInvoicesLocally([response as Invoice]);
      setDrawerOpen(false);
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Invoice could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (accountLoading || settingsLoading || loading) {
    return (
      <main className="ba-page invoices-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <div className="ba-spinner" />
          <h2>Opening invoices...</h2>
          <p>Loading owner invoices and billing balances.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page invoices-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ba-search-card" aria-label="Invoices search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            placeholder="Search invoices..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search invoices"
          />
        </label>

        <button type="button" className="ba-add-inline" onClick={openCreate} aria-label="Create invoice" title="New invoice">
          +
        </button>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open invoice filters"
          title="Filters"
        >
          ☷
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">
          ⋯
        </button>
      </section>

      {notice ? (
        <section className="ba-slim-notice">
          <span className="status-dot-mini orange" />
          <p>{notice}</p>
        </section>
      ) : null}

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active invoice filters">
          <button type="button" onClick={() => setStatusFilter("all")}>
            Status: {statusFilter} ×
          </button>
        </section>
      )}

      {viewMode === "analytics" && (
        <section className="analytics-grid">
          <Breakdown title="Invoice Status Breakdown" items={statusBreakdown} total={summary.invoices} />
        </section>
      )}

      {viewMode === "table" && (
        <section className="ba-table-card">
          <div className="ba-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Invoices ({filteredInvoices.length})</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id || invoice.invoiceNumber}>
                    <td>
                      <strong>{invoice.invoiceNumber || "Invoice"}</strong>
                      <span>{invoice.note || "No note"}</span>
                    </td>
                    <td>{money(invoice.total, invoice.currency)}</td>
                    <td>{money(invoice.amountPaid, invoice.currency)}</td>
                    <td>{money(invoiceBalance(invoice), invoice.currency)}</td>
                    <td><Chip tone={statusTone(invoice.status)}>{invoice.status || "draft"}</Chip></td>
                    <td>{safeDate(invoice.dueDate)}</td>
                    <td><button className="table-action" onClick={() => openEdit(invoice)}>Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filteredInvoices.length && <div className="ba-empty-table">No invoice matches the selected filters.</div>}
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredInvoices.map((invoice) => {
            const balance = invoiceBalance(invoice);

            return (
              <button
                key={invoice.id || invoice.invoiceNumber}
                type="button"
                className="invoice-row"
                onClick={() => openEdit(invoice)}
              >
                <span className="invoice-avatar">🧾</span>

                <span className="invoice-main">
                  <strong>{invoice.invoiceNumber || "Invoice"}</strong>
                  <small>
                    {money(invoice.total, invoice.currency)} · Paid {money(invoice.amountPaid, invoice.currency)}
                  </small>
                  <em>
                    Balance {money(balance, invoice.currency)} · Due {safeDate(invoice.dueDate)}
                  </em>
                </span>

                <span className="invoice-side">
                  <span className={`status-dot-mini ${statusTone(invoice.status)}`} />
                  <i>⋯</i>
                </span>
              </button>
            );
          })}

          {!filteredInvoices.length && <EmptyCard text="No invoice matches the selected filters." />}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          clearFilters={() => setStatusFilter("all")}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          setViewMode={(mode) => {
            setViewMode(mode);
            setMoreOpen(false);
          }}
          summary={summary}
          filteredCount={filteredInvoices.length}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onCreate={() => {
            setMoreOpen(false);
            openCreate();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {drawerOpen && (
        <InvoiceSheet
          form={form}
          message={message}
          saving={saving}
          updateForm={updateForm}
          saveInvoice={saveInvoice}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </main>
  );
}

function FilterSheet({
  statusFilter,
  setStatusFilter,
  clearFilters,
  onClose,
}: {
  statusFilter: StatusFilter;
  setStatusFilter: (value: StatusFilter) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Filter invoices by current billing status.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">All invoices</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="part_paid">Part paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="void">Void</option>
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={clearFilters}>Clear</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  viewMode,
  setViewMode,
  summary,
  filteredCount,
  onRefresh,
  onCreate,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  summary: {
    invoices: number;
    total: number;
    paid: number;
    balance: number;
    currency: string;
    paidCount: number;
    unpaidCount: number;
    overdueCount: number;
  };
  filteredCount: number;
  onRefresh: () => void | Promise<void>;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>Invoices</h2>
            <p>{filteredCount} of {summary.invoices} invoice record(s) shown.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="invoice-insights">
          <span><b>{money(summary.total, summary.currency)}</b>Total</span>
          <span><b>{money(summary.paid, summary.currency)}</b>Paid</span>
          <span><b>{money(summary.balance, summary.currency)}</b>Balance</span>
          <span><b>{summary.overdueCount}</b>Overdue</span>
        </div>

        <div className="ba-menu-list">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            <span>☰</span>
            <b>List view</b>
            <small>Compact invoice rows</small>
          </button>

          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            <span>☷</span>
            <b>Table view</b>
            <small>Dense laptop invoice records</small>
          </button>

          <button type="button" className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>
            <span>◔</span>
            <b>Analytics</b>
            <small>Status breakdown</small>
          </button>

          <button type="button" onClick={onCreate}>
            <span>+</span>
            <b>New invoice</b>
            <small>Create a billing-owned invoice record</small>
          </button>

          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload invoice data</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function InvoiceSheet({
  form,
  message,
  saving,
  updateForm,
  saveInvoice,
  onClose,
}: {
  form: FormState;
  message: string;
  saving: boolean;
  updateForm: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  saveInvoice: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop detail-layer" role="dialog" aria-modal="true">
      <section className="ba-sheet detail-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>{form.id ? "Review Invoice" : "New Invoice"}</h2>
            <p>Billing-owned invoice record.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close invoice editor">✕</button>
        </div>

        {message ? <section className="ba-slim-notice error"><span className="status-dot-mini red" /><p>{message}</p></section> : null}

        <section className="safety-note">
          <strong>Important payment rule</strong>
          <span>Do not manually mark an invoice as paid here. Paid status should come from confirmed payment records.</span>
        </section>

        <div className="ba-form compact">
          <label>
            <span>Invoice Number</span>
            <input value={form.invoiceNumber} onChange={(event) => updateForm("invoiceNumber", event.target.value)} />
          </label>

          <label>
            <span>Currency</span>
            <input value={form.currency} onChange={(event) => updateForm("currency", event.target.value)} />
          </label>

          <label>
            <span>Subtotal</span>
            <input type="number" value={form.subtotal} onChange={(event) => updateForm("subtotal", event.target.value)} />
          </label>

          <label>
            <span>Discount</span>
            <input type="number" value={form.discount} onChange={(event) => updateForm("discount", event.target.value)} />
          </label>

          <label>
            <span>Tax</span>
            <input type="number" value={form.tax} onChange={(event) => updateForm("tax", event.target.value)} />
          </label>

          <label>
            <span>Total</span>
            <input type="number" value={form.total} onChange={(event) => updateForm("total", event.target.value)} />
          </label>

          <label>
            <span>Status</span>
            <select value={form.status} onChange={(event) => updateForm("status", event.target.value as FormState["status"])}>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="overdue">Overdue</option>
              <option value="void">Void</option>
            </select>
          </label>

          <label>
            <span>Due Date</span>
            <input type="date" value={form.dueDate} onChange={(event) => updateForm("dueDate", event.target.value)} />
          </label>

          <label className="wide">
            <span>Note</span>
            <textarea value={form.note} onChange={(event) => updateForm("note", event.target.value)} />
          </label>
        </div>

        <div className="ba-sheet-actions sticky">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" disabled={saving} onClick={saveInvoice}>
            {saving ? "Saving..." : "Save Invoice"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">🧾</div>
      <h3>No records found</h3>
      <p>{text}</p>
    </section>
  );
}

function Breakdown({
  title,
  items,
  total,
}: {
  title: string;
  items: { name: string; count: number }[];
  total: number;
}) {
  return (
    <section className="analytics-card">
      <div className="section-mini-head">
        <strong>{title}</strong>
        <small>{items.length} group(s)</small>
      </div>

      <div className="breakdown-list">
        {items.map((item) => (
          <article key={item.name} className="breakdown-row">
            <div>
              <strong>{item.name}</strong>
              <small>{item.count} invoice(s)</small>
            </div>
            <span>{item.count}</span>
            <div className="bar-track">
              <i style={{ width: `${total ? Math.round((item.count / total) * 100) : 0}%` }} />
            </div>
          </article>
        ))}

        {!items.length && <EmptyCard text={`No ${title.toLowerCase()} available.`} />}
      </div>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}

.ba-page{
  --ease:cubic-bezier(.2,.8,.2,1);
  min-height:100dvh;
  width:100%;
  max-width:100%;
  min-width:0;
  padding:calc(8px * var(--local-density-scale,1));
  padding-bottom:max(40px,env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),
    var(--bg,#f7f8fb);
  color:var(--text,#111827);
  font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);
  font-size:var(--font-size,14px);
  overflow-x:hidden;
}

.ba-page *,
.ba-page *::before,
.ba-page *::after{
  box-sizing:border-box;
  min-width:0;
}

.ba-page button,
.ba-page input,
.ba-page select,
.ba-page textarea{
  font:inherit;
  max-width:100%;
}

.ba-page button{
  -webkit-tap-highlight-color:transparent;
}

.ba-page input,
.ba-page select,
.ba-page textarea{
  width:100%;
  min-height:44px;
  border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));
  border-radius:16px;
  padding:0 12px;
  background:var(--input-bg,var(--surface,#fff));
  color:var(--input-text,var(--text,#111827));
  outline:none;
  font-weight:750;
}

.ba-page textarea{
  min-height:86px;
  resize:vertical;
  padding-top:10px;
}

.ba-state,
.ba-search-card,
.ba-slim-notice,
.invoice-row,
.ba-table-card,
.analytics-card,
.breakdown-row,
.ba-empty,
.ba-sheet,
.safety-note{
  background:var(--card-bg,var(--surface,#fff));
  border:1px solid var(--border,rgba(0,0,0,.10));
  box-shadow:0 12px 28px rgba(15,23,42,.045);
}

.ba-state{
  min-height:min(420px,calc(100dvh - 32px));
  width:min(520px,100%);
  margin:0 auto;
  display:grid;
  place-items:center;
  align-content:center;
  gap:10px;
  padding:22px;
  border-radius:28px;
  text-align:center;
}

.ba-spinner{
  width:38px;
  height:38px;
  border-radius:999px;
  border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);
  border-top-color:var(--ba-primary);
  animation:spin .8s linear infinite;
}

.ba-state h2{
  margin:0;
  font-size:22px;
  font-weight:1000;
  letter-spacing:-.04em;
}

.ba-state p{
  margin:0;
  color:var(--muted,#64748b);
  font-size:13px;
  line-height:1.6;
}

.ba-search-card{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto auto auto;
  gap:8px;
  align-items:center;
  padding:8px;
  border-radius:24px;
}

.ba-search{
  min-width:0;
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:8px;
  min-height:44px;
  padding:0 11px;
  border-radius:18px;
  background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);
}

.ba-search span{
  color:var(--muted,#64748b);
  font-size:17px;
  font-weight:1000;
}

.ba-search input{
  min-height:42px;
  border:0;
  padding:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
  font-size:14px;
}

.ba-add-inline,
.ba-filter-button,
.ba-icon-button{
  min-width:42px;
  height:42px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  display:grid;
  place-items:center;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
  font-size:15px;
  font-weight:1000;
  cursor:pointer;
  box-shadow:0 10px 22px rgba(15,23,42,.045);
}

.ba-add-inline{
  border-color:var(--ba-primary);
  background:var(--ba-primary);
  color:#fff;
  font-size:18px;
}

.ba-filter-button{
  position:relative;
  color:var(--ba-primary);
  background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));
}

.ba-filter-button.active{
  background:var(--ba-primary);
  color:#fff;
  border-color:var(--ba-primary);
}

.ba-filter-button b{
  position:absolute;
  top:-4px;
  right:-4px;
  min-width:19px;
  height:19px;
  display:grid;
  place-items:center;
  border-radius:999px;
  background:#ef4444;
  color:#fff;
  font-size:10px;
  border:2px solid var(--card-bg,#fff);
}

.ba-icon-button{
  width:42px;
  font-size:18px;
}

.ba-slim-notice{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:9px;
  margin-top:8px;
  border-radius:17px;
  padding:8px 10px;
  color:color-mix(in srgb,var(--text,#111827) 76%,#b45309 24%);
  background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 88%,#f59e0b 12%);
  border-color:color-mix(in srgb,var(--border,rgba(0,0,0,.10)) 72%,#f59e0b 28%);
}

.ba-slim-notice.error{
  color:color-mix(in srgb,var(--text,#111827) 76%,#ef4444 24%);
  background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 88%,#ef4444 12%);
  border-color:color-mix(in srgb,var(--border,rgba(0,0,0,.10)) 72%,#ef4444 28%);
}

.ba-slim-notice p{
  margin:0;
  font-size:11px;
  line-height:1.35;
  font-weight:850;
}

.ba-filter-chips{
  display:flex;
  gap:7px;
  overflow-x:auto;
  padding:8px 1px 0;
  scrollbar-width:none;
  -ms-overflow-style:none;
}

.ba-filter-chips::-webkit-scrollbar{display:none}

.ba-filter-chips button{
  flex:0 0 auto;
  min-height:31px;
  border:0;
  border-radius:999px;
  padding:0 10px;
  background:color-mix(in srgb,var(--ba-primary) 11%,transparent);
  color:var(--ba-primary);
  font-size:11px;
  font-weight:950;
  white-space:nowrap;
  cursor:pointer;
}

.ba-list,
.analytics-grid,
.breakdown-list{
  display:grid;
  gap:7px;
  margin-top:10px;
}

.invoice-row{
  width:100%;
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;
  gap:8px;
  padding:8px;
  border-radius:18px;
  color:var(--text,#111827);
  text-align:left;
  cursor:pointer;
}

.invoice-avatar{
  width:34px;
  height:34px;
  display:grid;
  place-items:center;
  border-radius:14px;
  background:linear-gradient(135deg,var(--ba-primary),rgba(15,23,42,.9));
  color:#fff;
  font-size:15px;
  box-shadow:0 8px 18px rgba(15,23,42,.10);
}

.invoice-main{
  display:grid;
  gap:1px;
  min-width:0;
}

.invoice-main strong,
.invoice-main small,
.invoice-main em{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.invoice-main strong{
  font-size:13px;
  font-weight:1000;
  line-height:1.15;
}

.invoice-main small,
.invoice-main em{
  color:var(--muted,#64748b);
  font-size:10.5px;
  font-style:normal;
  font-weight:800;
  line-height:1.22;
}

.invoice-side{
  display:flex;
  align-items:center;
  gap:6px;
}

.invoice-side i{
  color:var(--muted,#64748b);
  font-style:normal;
  font-size:17px;
  font-weight:1000;
}

.status-dot-mini{
  width:8px;
  height:8px;
  border-radius:999px;
  background:var(--muted,#64748b);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--muted,#64748b) 12%,transparent);
}

.status-dot-mini.green{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.13)}
.status-dot-mini.red{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.13)}
.status-dot-mini.orange{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.15)}
.status-dot-mini.blue{background:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.13)}
.status-dot-mini.purple{background:#9333ea;box-shadow:0 0 0 3px rgba(147,51,234,.13)}
.status-dot-mini.gray{background:var(--muted,#64748b)}

.ba-chip{
  display:inline-flex;
  align-items:center;
  min-height:24px;
  padding:0 9px;
  border-radius:999px;
  font-size:11px;
  font-weight:950;
  text-transform:capitalize;
}

.ba-chip.green{background:rgba(34,197,94,.11);color:#15803d}
.ba-chip.red{background:rgba(239,68,68,.1);color:#dc2626}
.ba-chip.blue{background:rgba(37,99,235,.1);color:#1d4ed8}
.ba-chip.orange{background:rgba(245,158,11,.12);color:#b45309}
.ba-chip.purple{background:rgba(124,58,237,.1);color:#6d28d9}
.ba-chip.gray{background:rgba(100,116,139,.1);color:#64748b}

.ba-table-card{
  margin-top:10px;
  padding:10px;
  border-radius:24px;
}

.ba-table-scroll{
  overflow-x:auto;
  border-radius:18px;
  border:1px solid var(--border,rgba(0,0,0,.08));
}

.ba-table-scroll table{
  width:100%;
  min-width:780px;
  border-collapse:collapse;
}

.ba-table-scroll th,
.ba-table-scroll td{
  padding:10px;
  text-align:left;
  border-bottom:1px solid var(--border,rgba(0,0,0,.08));
  vertical-align:top;
  font-size:12px;
}

.ba-table-scroll th{
  color:var(--muted,#64748b);
  font-size:11px;
  font-weight:950;
  text-transform:uppercase;
  letter-spacing:.06em;
  background:color-mix(in srgb,var(--ba-primary) 5%,var(--card-bg,var(--surface,#fff)));
}

.ba-table-scroll td strong,
.ba-table-scroll td span{
  display:block;
}

.ba-table-scroll td span{
  margin-top:3px;
  color:var(--muted,#64748b);
  font-size:11px;
}

.table-action{
  min-height:32px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  padding:0 10px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
  font-size:11px;
  font-weight:950;
  cursor:pointer;
}

.ba-empty-table{
  padding:22px;
  text-align:center;
  color:var(--muted,#64748b);
  font-weight:850;
}

.analytics-grid{
  grid-template-columns:1fr;
}

.analytics-card{
  padding:10px;
  border-radius:22px;
}

.section-mini-head{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap:10px;
  margin-bottom:8px;
}

.section-mini-head strong{
  font-size:13px;
  font-weight:1000;
}

.section-mini-head small{
  color:var(--muted,#64748b);
  font-size:10px;
  font-weight:850;
}

.breakdown-row{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:8px;
  padding:9px;
  border-radius:17px;
}

.breakdown-row strong,
.breakdown-row small{
  display:block;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.breakdown-row strong{
  font-size:12px;
  font-weight:1000;
  text-transform:capitalize;
}

.breakdown-row small{
  margin-top:2px;
  color:var(--muted,#64748b);
  font-size:10px;
  font-weight:850;
}

.breakdown-row > span{
  font-size:12px;
  font-weight:1000;
}

.bar-track{
  grid-column:1/-1;
  height:8px;
  border-radius:999px;
  background:color-mix(in srgb,var(--muted,#64748b) 16%,transparent);
  overflow:hidden;
}

.bar-track i{
  display:block;
  height:100%;
  border-radius:inherit;
  background:var(--ba-primary);
}

.ba-empty{
  display:grid;
  place-items:center;
  align-content:center;
  gap:8px;
  min-height:180px;
  padding:18px;
  border-radius:24px;
  text-align:center;
  border-style:dashed;
}

.ba-empty-icon{
  width:50px;
  height:50px;
  display:grid;
  place-items:center;
  border-radius:20px;
  background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));
  font-size:24px;
}

.ba-empty h3{
  margin:0;
  font-size:17px;
  font-weight:1000;
}

.ba-empty p{
  margin:0;
  color:var(--muted,#64748b);
  font-size:12px;
  line-height:1.5;
}

.ba-sheet-backdrop{
  position:fixed;
  inset:0;
  z-index:80;
  background:rgba(2,6,23,.46);
  display:grid;
  align-items:end;
  padding:10px;
}

.ba-sheet{
  width:min(540px,100%);
  max-height:92dvh;
  overflow-y:auto;
  margin:0 auto;
  border-radius:28px 28px 20px 20px;
  padding:14px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
}

.ba-sheet.small{
  width:min(440px,100%);
}

.detail-sheet{
  width:min(720px,100%);
}

.ba-sheet-head{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:12px;
  margin-bottom:12px;
}

.ba-sheet-head h2{
  margin:0;
  font-size:20px;
  font-weight:1000;
  letter-spacing:-.04em;
  overflow-wrap:anywhere;
}

.ba-sheet-head p{
  margin:3px 0 0;
  color:var(--muted,#64748b);
  font-size:12px;
  font-weight:750;
  line-height:1.45;
}

.ba-sheet-head button{
  width:38px;
  height:38px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
  font-weight:1000;
  cursor:pointer;
}

.ba-form{
  display:grid;
  grid-template-columns:1fr;
  gap:9px;
}

.ba-form label{
  display:grid;
  gap:5px;
  min-width:0;
}

.ba-form label.wide{
  grid-column:1/-1;
}

.ba-form span{
  color:var(--muted,#64748b);
  font-size:11px;
  font-weight:950;
}

.ba-sheet-actions{
  display:flex;
  justify-content:flex-end;
  flex-wrap:wrap;
  gap:8px;
  margin-top:12px;
}

.ba-sheet-actions.sticky{
  position:sticky;
  bottom:-14px;
  padding-top:10px;
  background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 76%,transparent);
}

.ba-sheet-actions button{
  min-height:40px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  padding:0 14px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
  font-size:12px;
  font-weight:950;
  cursor:pointer;
}

.ba-sheet-actions button.primary{
  border-color:var(--ba-primary);
  background:var(--ba-primary);
  color:#fff;
}

.invoice-insights{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:7px;
  margin-bottom:10px;
}

.invoice-insights span{
  display:grid;
  gap:2px;
  padding:9px;
  border-radius:16px;
  background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);
  color:var(--muted,#64748b);
  font-size:10px;
  font-weight:850;
}

.invoice-insights b{
  color:var(--text,#111827);
  font-size:12px;
  font-weight:1000;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.ba-menu-list{
  display:grid;
  gap:8px;
  margin-top:10px;
}

.ba-menu-list button{
  width:100%;
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  grid-template-rows:auto auto;
  column-gap:10px;
  text-align:left;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:18px;
  padding:10px;
  background:color-mix(in srgb,var(--muted,#64748b) 5%,transparent);
  color:var(--text,#111827);
  cursor:pointer;
}

.ba-menu-list button.active{
  border-color:var(--ba-primary);
  background:color-mix(in srgb,var(--ba-primary) 11%,transparent);
}

.ba-menu-list span{
  grid-row:1 / span 2;
  width:32px;
  height:32px;
  border-radius:13px;
  display:grid;
  place-items:center;
  background:color-mix(in srgb,var(--ba-primary) 12%,transparent);
  color:var(--ba-primary);
  font-weight:1000;
}

.ba-menu-list b{
  font-size:13px;
  font-weight:1000;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.ba-menu-list small{
  color:var(--muted,#64748b);
  font-size:10px;
  font-weight:800;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.safety-note{
  display:grid;
  gap:3px;
  margin-bottom:10px;
  padding:10px;
  border-radius:18px;
  background:color-mix(
    in srgb,
    var(--card-bg,var(--surface,#fff)) 88%,
    var(--ba-primary) 12%
  );
  border:1px solid var(--border,rgba(0,0,0,.10));
  color:var(--text,#111827);
  box-shadow:0 12px 28px rgba(15,23,42,.045);
}

.safety-note strong{
  color:var(--text,#111827);
  font-size:12px;
  font-weight:1000;
}

.safety-note span{
  color:color-mix(in srgb,var(--text,#111827) 74%,var(--muted,#64748b) 26%);
  font-size:11px;
  line-height:1.45;
  font-weight:800;
}

:global(html[data-theme="dark"]) .safety-note,
:global(html.dark) .safety-note{
  background:color-mix(
    in srgb,
    var(--card-bg,var(--surface,#111827)) 84%,
    var(--ba-primary) 16%
  );
  border-color:var(--border,rgba(255,255,255,.16));
  color:var(--text,#fff);
}

:global(html[data-theme="dark"]) .safety-note strong,
:global(html.dark) .safety-note strong{
  color:var(--text,#fff);
}

:global(html[data-theme="dark"]) .safety-note span,
:global(html.dark) .safety-note span{
  color:color-mix(in srgb,var(--text,#fff) 82%,var(--muted,rgba(255,255,255,.72)) 18%);
}

@media(min-width:680px){
  .ba-page{
    padding:calc(12px * var(--local-density-scale,1));
  }

  .ba-list{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }

  .invoice-row{
    min-height:68px;
  }

  .analytics-grid{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }

  .ba-form.compact{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
}

@media(min-width:1040px){
  .ba-list{
    grid-template-columns:repeat(3,minmax(0,1fr));
  }
}

@media(min-width:1280px){
  .ba-list{
    grid-template-columns:repeat(4,minmax(0,1fr));
  }

  .invoice-row{
    min-height:64px;
  }
}

@media(max-width:520px){
  .ba-search-card{
    gap:6px;
    padding:7px;
    border-radius:22px;
  }

  .invoice-insights{
    grid-template-columns:1fr;
  }
}
`;
