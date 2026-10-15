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

/** Layout fitting uses content samples rather than equal-width columns. */
function columnWidthMm(column: BranchPrintColumn, rows: BranchPrintRow[]): number {
  const samples = rows.slice(0, 120).map(row => asText(row[column.key]).trim())
    .filter(Boolean).filter(v => v !== "—");
  const lengths = samples.map(v => Math.max(...v.split(/\s+/).map(part => part.length), 0))
    .sort((a, b) => a - b);
  const full = samples.map(v => v.length).sort((a,b) => a-b);
  const word85 = lengths[Math.floor((lengths.length-1) * .85)] || 0;
  const full72 = full[Math.floor((full.length-1) * .72)] || 0;
  const header = column.label.length;
  const hasImage = rows.some(row => {
    const c = row[column.key];
    return Boolean(c && typeof c === "object" && imageURL(c.image));
  });
  // Headers may wrap. A numeric/statistic column should not borrow the space
  // of a name, phone, or address column.
  const shortHeader = header > 14 ? Math.ceil(header / 2) : header;
  const textChars = Math.max(shortHeader, word85, Math.min(28, full72 * .66));
  const nominal = 5.8 + textChars * 1.22;
  const min = hasImage ? 32 : (samples.every(v => /^[-+\d.,%/ ]+$/.test(v)) && samples.length ? 11 : 12);
  return Math.max(min, Math.min(hasImage ? 50 : 44, nominal));
}

type PrintLayout = {
  landscape: boolean;
  widthMm: number;
  groups: { columns: BranchPrintColumn[]; widthsMm: number[]; totalWidthMm: number }[];
  fontPt: number;
};

/** Try the ENTIRE table before falling back to horizontal column groups. */
function chooseLayout(options: BranchTablePrintOptions, columns: BranchPrintColumn[]): PrintLayout {
  const rawWidths = columns.map(c => columnWidthMm(c, options.rows));
  const rawTotal = rawWidths.reduce((a,b) => a+b, 0);
  const portraitWidth = 194; // A4 210mm, 8mm margins
  const landscapeWidth = 281; // A4 297mm, 8mm margins
  const forcedLandscape = options.orientation === "landscape";
  const forcedPortrait = options.orientation === "portrait";
  const landscape = forcedLandscape || (!forcedPortrait && rawTotal > portraitWidth * 1.12);
  const available = landscape ? landscapeWidth : portraitWidth;
  // Compact, yet legible: reduce excess space before deciding to split columns.
  // Wrapping a long value is preferable to spreading one table across sheets.
  const minCompression = .77;
  const minTextPt = 7.7;
  const pageFactor = Math.min(1, available / Math.max(1, rawTotal));
  if (pageFactor >= minCompression) {
    const widthsMm = rawWidths.map(w => w * pageFactor);
    const fontPt = Math.max(minTextPt, (landscape ? 8.8 : 9.1) * pageFactor);
    return { landscape, widthMm: available,
      groups: [{columns, widthsMm, totalWidthMm: widthsMm.reduce((a,b)=>a+b,0)}], fontPt };
  }
  const groups: PrintLayout["groups"] = [];
  const lead = columns[0];
  const leadWidth = Math.min(rawWidths[0] || 35, 47);
  let current = [lead];
  let currentWidths = [leadWidth];
  let used = leadWidth;
  for (let i=1; i<columns.length; i++) {
    const col = columns[i];
    const width = rawWidths[i];
    if (used + width > available && current.length > 1) {
      groups.push({columns:current, widthsMm:currentWidths, totalWidthMm:used});
      current = [lead]; currentWidths = [leadWidth]; used = leadWidth;
    }
    // One very long column is allowed to wrap instead of overflowing the page.
    const fitted = Math.min(width, available - Math.min(used, leadWidth));
    current.push(col); currentWidths.push(fitted); used += fitted;
  }
  groups.push({columns:current, widthsMm:currentWidths, totalWidthMm:used});
  return { landscape, widthMm:available, groups, fontPt:landscape ? 8.6 : 9 };
}

export function buildBranchTablePrintHTML(options: BranchTablePrintOptions): string {
  const columns = options.columns.filter(c => c.key && !/^actions?$|^controls?$/i.test(c.label.trim())
    && !/^actions?$|^controls?$/i.test(c.key.trim()));
  if (!columns.length) return "";
  const layout = chooseLayout(options, columns);
  const { landscape, groups, fontPt } = layout;
  const timestamp = new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date());
  const parts = groups.map((group,index) => {
    const sectionWidth = Math.min(layout.widthMm, group.totalWidthMm);
    const widths = group.widthsMm.map(w => (w / group.totalWidthMm * sectionWidth));
    const heading = group.columns.map(col => `<th scope="col">${escapeHTML(col.label)}</th>`).join("");
    const entries = options.rows.map(row =>
      `<tr>${group.columns.map(col => `<td>${renderCell(row[col.key])}</td>`).join("")}</tr>`,
    ).join("");
    return `<section class="print-section ${index ? "continued" : ""}">
      <header><div><h1>${escapeHTML(options.title)}${groups.length>1 ? ` · Part ${index+1}/${groups.length}` : ""}</h1>
      ${options.subtitle ? `<p>${escapeHTML(options.subtitle)}</p>` : ""}</div>
      <div class="meta">${options.rows.length} record${options.rows.length===1?"":"s"}<br>${escapeHTML(timestamp)}</div></header>
      <table style="width:${sectionWidth.toFixed(2)}mm"><colgroup>${widths.map(w => `<col style="width:${w.toFixed(2)}mm" />`).join("")}</colgroup>
      <thead><tr>${heading}</tr></thead><tbody>${entries ||
        `<tr><td colspan="${group.columns.length}" class="no-data">No matching records</td></tr>`}</tbody></table>
      ${groups.length>1 ? `<p class="section-note">Column section ${index+1}/${groups.length} · Identity column repeated</p>` : ""}
    </section>`;
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHTML(options.title)} — Eleeveon Schools</title>
  <style>
    @page { size:A4 ${landscape?"landscape":"portrait"}; margin:8mm; }
    *,*::before,*::after{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#1f2937;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-size:${fontPt.toFixed(2)}pt;line-height:1.22}
    .screen-actions{display:flex;position:sticky;top:0;z-index:2;gap:12px;align-items:center;justify-content:space-between;padding:12px 16px;background:#152237;color:#fff}
    .screen-actions p{margin:0;font-size:12px}.screen-actions button{background:#fff;color:#152237;border:0;padding:9px 17px;border-radius:7px;font-weight:700;cursor:pointer}
    main{padding:12px;max-width:1400px;margin:auto}
    .print-section{break-before:auto;page-break-before:auto}
    .print-section.continued{break-before:page;page-break-before:always}
    header{display:flex;justify-content:space-between;align-items:flex-end;gap:15px;border-bottom:1px solid #334155;padding-bottom:5px;margin-bottom:6px}
    h1{font-size:12pt;letter-spacing:-.2px;margin:0;font-weight:700;color:#172333}
    header p{font-size:8pt;color:#475569;margin:2px 0 0}
    .meta{text-align:right;font-size:7pt;color:#475569;line-height:1.35;white-space:nowrap}
    table{border-collapse:collapse;table-layout:fixed;border:1px solid #cbd5e1;max-width:100%}
    thead{display:table-header-group}
    tbody tr{break-inside:avoid;page-break-inside:avoid}
    th,td{overflow-wrap:anywhere;word-break:normal;vertical-align:top;text-align:left;border-bottom:1px solid #d3dae4;border-right:1px solid #e2e8f0;padding:3px 4px}
    th{background:#e9eef4;color:#172333;font-size:${Math.max(7.4,fontPt-.2).toFixed(2)}pt;font-weight:700;line-height:1.23}
    tbody tr:nth-child(even) td{background:#f6f8fb}
    .cell-content{display:flex;gap:4px;align-items:flex-start}
    .cell-content img{width:23px;height:23px;object-fit:cover;border-radius:3px;flex:0 0 23px;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .cell-content span{min-width:0;overflow-wrap:anywhere}
    .cell-content small{display:block;color:#64748b;font-size:7pt;margin-top:1px}
    .no-data{text-align:center;padding:18px;color:#64748b}
    .section-note{font-size:7pt;color:#64748b;margin:5px 0 0}
    @media screen{body{background:#eef1f5}main{background:#fff;box-shadow:0 10px 40px #0001;min-height:80vh;margin:24px auto;padding:24px}.print-section.continued{margin-top:25px;padding-top:12px;border-top:2px dashed #cbd5e1}}
    @media print{.screen-actions{display:none!important}main{padding:0;margin:0;box-shadow:none}.print-section.continued{margin-top:0;padding:0;border:0}a{text-decoration:none;color:inherit}}
  </style></head><body>
  <div class="screen-actions"><p>A4 ${landscape?"landscape":"portrait"} · ${options.rows.length} rows · ${groups.length} column group${groups.length===1?"":"s"} · Photos included when available</p>
  <div><button type="button" onclick="window.print()">Print / Save as PDF</button> <button type="button" onclick="window.close()">Close</button></div></div>
  <main>${parts.join("")}</main></body></html>`;
}

/** Wait for photos to finish decoding before opening print preview. */
async function waitForPrintPhotos(doc: Document): Promise<void> {
  const images = Array.from(doc.images);
  if (!images.length) return;
  await Promise.all(images.map(img => new Promise<void>(resolve => {
    if (img.complete) { resolve(); return; }
    const done = () => { clearTimeout(timeout); resolve(); };
    const timeout = setTimeout(done, 10000);
    img.addEventListener("load", done, {once:true});
    img.addEventListener("error", done, {once:true});
  })));
  await Promise.all(images.map(img => img.complete && img.naturalWidth && img.decode
    ? img.decode().catch(() => undefined) : Promise.resolve()));
}

/** Opens a clean print preview immediately from the user's Print click. */
export function printBranchTable(options: BranchTablePrintOptions): boolean {
  if (typeof window === "undefined" || typeof document === "undefined" || !options.columns.length) return false;
  const html = buildBranchTablePrintHTML(options);
  const popup = window.open("", "_blank");
  if (popup) {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    // Trigger the system print dialog after the new document is ready. The
    // on-screen Print button remains available if the browser blocks auto-print.
    const launch = () => {
      void waitForPrintPhotos(popup.document)
        .then(() => { if (!popup.closed) { popup.focus(); popup.print(); } });
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
    void waitForPrintPhotos(doc).then(() => {
      if (!frame.isConnected) return;
      target.focus();
      target.print();
      window.setTimeout(remove, 60000);
    });
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
      included.forEach(({i}) => {
        const element = cells[i];
        if (!element) { row[`c${i}`] = ""; return; }
        const text = cellText(element);
        const img = element.querySelector("img");
        const image = img?.currentSrc || img?.getAttribute("src") || "";
        // Source-backed images are retained, including resolved media/blob URLs.
        row[`c${i}`] = imageURL(image) ? {text, image} : text;
      });
      return row;
    });
  return printBranchTable({ title, columns, rows });
}
