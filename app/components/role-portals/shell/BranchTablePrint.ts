/**
 * Eleeveon Schools — Branch Admin A4 data-table printer.
 *
 * Intentionally separate from Student Reports, Broadsheets, Remarks and the
 * Attendance register's official export/print engines.
 *
 * - Prints the currently filtered data set, even while the UI shows cards.
 * - A4 portrait for narrow tables, landscape for wider tables.
 * - Wide tables become consecutive readable column groups, repeating the
 *   identity/name column on each group instead of shrinking text to 5pt.
 * - Long tables continue automatically on additional A4 sheets.
 * - No Edit/Delete/action column, application chrome, modals or background.
 */

export type BranchPrintCell =
  | string
  | number
  | boolean
  | null
  | undefined
  | { text: string | number | boolean | null | undefined; detail?: string; image?: string };

export type BranchPrintColumn = { key: string; label: string };
export type BranchPrintRow = Record<string, BranchPrintCell>;
export type BranchTablePrintOptions = {
  title: string;
  subtitle?: string;
  columns: BranchPrintColumn[];
  rows: BranchPrintRow[];
  orientation?: "auto" | "portrait" | "landscape";
};

const escapeHTML = (raw: unknown): string =>
  String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const asText = (cell: BranchPrintCell): string => {
  if (cell && typeof cell === "object") return String(cell.text ?? "");
  if (typeof cell === "boolean") return cell ? "Yes" : "No";
  return String(cell ?? "");
};

const imageURL = (raw: unknown): string => {
  const value = String(raw || "").trim();
  return /^(https?:\/\/|blob:|data:image\/(png|jpeg|webp|gif);base64,)/i.test(value)
    ? value : "";
};

const renderCell = (cell: BranchPrintCell): string => {
  const data = cell && typeof cell === "object" ? cell : { text: cell };
  const text = escapeHTML(asText(cell).trim() || "—");
  const detail = "detail" in data && data.detail
    ? `<small>${escapeHTML(data.detail)}</small>` : "";
  const src = "image" in data ? imageURL(data.image) : "";
  const picture = src ? `<img src="${escapeHTML(src)}" alt="" />` : "";
  return `<span class="cell-content">${picture}<span>${text}${detail}</span></span>`;
};

/**
 * A rough typography budget is more predictable than an arbitrary font scale:
 * a wide table is printed as side-by-side column groups, not tiny text.
 */
function columnCost(column: BranchPrintColumn, rows: BranchPrintRow[]): number {
  const lengths = rows.slice(0, 55).map((row) => asText(row[column.key]).length)
    .sort((a, b) => a - b);
  const percentile = lengths[Math.floor(lengths.length * 0.8)] || 0;
  return Math.max(11, Math.min(28, Math.max(column.label.length, percentile) + 2));
}

function columnGroups(
  columns: BranchPrintColumn[], rows: BranchPrintRow[], landscape: boolean,
): BranchPrintColumn[][] {
  if (columns.length <= 1) return [columns];
  const lead = columns[0];
  const budget = landscape ? 108 : 69;
  const maxColumns = landscape ? 7 : 5;
  const firstCost = Math.min(30, Math.max(18, columnCost(lead, rows)));
  const results: BranchPrintColumn[][] = [];
  let group: BranchPrintColumn[] = [lead];
  let currentCost = firstCost;

  for (const col of columns.slice(1)) {
    const cost = columnCost(col, rows);
    if (group.length > 1 && (group.length >= maxColumns || currentCost + cost > budget)) {
      results.push(group);
      group = [lead];
      currentCost = firstCost;
    }
    group.push(col);
    currentCost += cost;
  }
  results.push(group);
  return results;
}

function printableHTML(options: BranchTablePrintOptions): string {
  const columns = options.columns.filter((c) => c.key && !/^actions?$/i.test(c.label.trim()));
  const landscape = options.orientation === "landscape" ||
    (options.orientation !== "portrait" && columns.length > 5);
  const groups = columnGroups(columns, options.rows, landscape);
  const timestamp = new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date());

  const parts = groups.map((group, index) => {
    const caption = groups.length > 1 ? ` · Columns ${index + 1} of ${groups.length}` : "";
    const heading = group.map((col) => `<th scope="col">${escapeHTML(col.label)}</th>`).join("");
    const entries = options.rows.map((row, i) =>
      `<tr>${group.map((col) => `<td>${renderCell(row[col.key])}</td>`).join("")}</tr>`,
    ).join("");
    return `<section class="print-section ${index ? "continued" : ""}">
      <header><div><h1>${escapeHTML(options.title)}${escapeHTML(caption)}</h1>
      ${options.subtitle ? `<p>${escapeHTML(options.subtitle)}</p>` : ""}</div>
      <div class="meta">${options.rows.length} record${options.rows.length === 1 ? "" : "s"}<br>${escapeHTML(timestamp)}</div></header>
      <table><thead><tr>${heading}</tr></thead><tbody>${entries ||
        `<tr><td colspan="${group.length}" class="no-data">No matching records</td></tr>`}</tbody></table>
      <p class="section-note">${groups.length > 1
        ? `Part ${index + 1} of ${groups.length} · First column repeated for reference`
        : ""}</p>
    </section>`;
  });

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHTML(options.title)} — Eleeveon Schools</title>
  <style>
    @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 11mm 10mm 13mm; }
    *,*::before,*::after{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#1f2937;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-size:${landscape ? "9.2" : "9.6"}pt;line-height:1.35}
    .screen-actions{display:flex;position:sticky;top:0;z-index:2;gap:12px;align-items:center;justify-content:space-between;padding:12px 16px;background:#152237;color:#fff}
    .screen-actions p{margin:0;font-size:12px}.screen-actions button{background:#fff;color:#152237;border:0;padding:9px 17px;border-radius:7px;font-weight:700;cursor:pointer}
    main{padding:12px;max-width:1400px;margin:auto}
    .print-section{break-before:auto;page-break-before:auto}
    .print-section.continued{break-before:page;page-break-before:always}
    header{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;border-bottom:1.5px solid #334155;padding-bottom:8px;margin-bottom:11px}
    h1{font-size:14pt;letter-spacing:-.2px;margin:0;font-weight:750;color:#172333}
    header p{font-size:9pt;color:#475569;margin:4px 0 0}
    .meta{text-align:right;font-size:8pt;color:#475569;line-height:1.5;white-space:nowrap}
    table{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #cbd5e1}
    thead{display:table-header-group}
    tbody tr{break-inside:avoid;page-break-inside:avoid}
    th,td{overflow-wrap:anywhere;word-break:normal;vertical-align:top;text-align:left;border-bottom:1px solid #d3dae4;border-right:1px solid #e2e8f0;padding:${landscape ? "5px 6px" : "6px 7px"}}
    th{background:#e9eef4;color:#172333;text-transform:none;font-size:8.6pt;font-weight:700;line-height:1.28}
    tbody tr:nth-child(even) td{background:#f6f8fb}
    .cell-content{display:flex;gap:5px;align-items:flex-start}
    .cell-content img{width:22px;height:22px;object-fit:cover;border-radius:4px;flex:0 0 22px}
    .cell-content span{min-width:0;overflow-wrap:anywhere}
    .cell-content small{display:block;color:#64748b;font-size:7.6pt;margin-top:1px}
    .no-data{text-align:center;padding:18px;color:#64748b}
    .section-note{font-size:8pt;color:#64748b;margin:6px 0 0}
    @media screen{body{background:#eef1f5}main{background:#fff;box-shadow:0 10px 40px #0001;min-height:80vh;margin:24px auto;padding:24px}.print-section.continued{margin-top:32px;padding-top:16px;border-top:2px dashed #cbd5e1}}
    @media print{.screen-actions{display:none!important}main{padding:0;margin:0;box-shadow:none}.print-section.continued{margin-top:0;padding:0;border:0} .section-note{break-after:avoid} a{text-decoration:none;color:inherit}}
  </style></head><body>
  <div class="screen-actions"><p>A4 ${landscape ? "landscape" : "portrait"} · ${options.rows.length} rows · ${groups.length} column group${groups.length === 1 ? "" : "s"}</p>
  <div><button type="button" onclick="window.print()">Print / Save as PDF</button> <button type="button" onclick="window.close()">Close</button></div></div>
  <main>${parts.join("")}</main></body></html>`;
}

/** Opens a clean print preview immediately from the user's Print click. */
export function printBranchTable(options: BranchTablePrintOptions): boolean {
  if (typeof window === "undefined" || typeof document === "undefined" || !options.columns.length) return false;
  const html = printableHTML(options);
  const popup = window.open("", "_blank");
  if (popup) {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    // Trigger the system print dialog after the new document is ready. The
    // on-screen Print button remains available if the browser blocks auto-print.
    const launch = () => {
      const images = Array.from(popup.document.images);
      const ready = Promise.all(images.map((img) => img.complete
        ? Promise.resolve()
        : new Promise<void>((done) => {
            img.addEventListener("load", () => done(), { once: true });
            img.addEventListener("error", () => done(), { once: true });
          })));
      Promise.race([ready, new Promise<void>((done) => popup.setTimeout(done, 1800))])
        .then(() => { if (!popup.closed) popup.print(); });
    };
    if (popup.document.readyState === "complete") launch();
    else popup.addEventListener("load", launch, { once: true });
    return true;
  }

  // Pop-up-restricted PWAs: print from an isolated, off-screen document.
  const frame = document.createElement("iframe");
  frame.title = `${options.title} A4 print`;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) { frame.remove(); return false; }
  const remove = () => { if (frame.isConnected) frame.remove(); };
  frame.onload = () => {
    const target = frame.contentWindow;
    if (!target) { remove(); return; }
    target.onafterprint = remove;
    target.focus();
    target.print();
    window.setTimeout(remove, 60000);
  };
  doc.open(); doc.write(html); doc.close();
  return true;
}

/**
 * Fallback for future Setup editors or other module tables not yet migrated to
 * a typed print adapter. Only currently visible, on-screen table data is used.
 */
export function printVisibleBranchTable(title: string): boolean {
  if (typeof document === "undefined") return false;
  const root = document.querySelector(".role-shell.branch-workspace-layout .app-content") ||
    document.querySelector(".ba-workspace-wrapper") || document.body;
  const tables = Array.from(root.querySelectorAll<HTMLTableElement>("table"));
  const table = tables.find((element) =>
    element.getClientRects().length > 0 &&
    !element.closest('[role="dialog"],.ba-modal,.ba-sheet,.excel-import-overlay,.excel-export-overlay,[data-print-exclude]'),
  );
  if (!table) return false;
  const headers = Array.from(table.querySelectorAll("thead tr:first-child th"));
  if (!headers.length) return false;
  const included = headers.map((node, i) => ({ node, i }))
    .filter(({node}) => !/^\s*(actions?|controls?)\s*$/i.test(node.textContent || "") &&
      !node.hasAttribute("data-print-exclude"));
  if (!included.length) return false;
  const cellText = (element: Element): string => {
    const copy = element.cloneNode(true) as HTMLElement;
    const originals = Array.from(element.querySelectorAll("input,select,textarea"));
    const clones = Array.from(copy.querySelectorAll("input,select,textarea"));
    clones.forEach((field, index) => {
      const original = originals[index] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const replacement = document.createElement("span");
      replacement.textContent = original?.type === "checkbox"
        ? ((original as HTMLInputElement).checked ? "Yes" : "No")
        : (original?.value || "—");
      field.replaceWith(replacement);
    });
    copy.querySelectorAll("button,svg,[data-print-exclude]").forEach((node) => node.remove());
    return (copy.innerText || copy.textContent || "").replace(/\s+/g, " ").trim();
  };
  const columns = included.map(({node,i}) => ({ key: `c${i}`, label: cellText(node) || `Column ${i + 1}` }));
  const rows: BranchPrintRow[] = Array.from(table.querySelectorAll("tbody tr"))
    .filter((tr) => !tr.hasAttribute("data-print-exclude"))
    .map((tr) => {
      const cells = Array.from(tr.children).filter((child) => child.tagName === "TD" || child.tagName === "TH");
      const row: BranchPrintRow = {};
      included.forEach(({i}) => { row[`c${i}`] = cells[i] ? cellText(cells[i]) : ""; });
      return row;
    });
  return printBranchTable({ title, columns, rows });
}
