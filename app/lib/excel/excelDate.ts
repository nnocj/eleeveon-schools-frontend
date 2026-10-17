/**
 * app/lib/excel/excelDate.ts
 * Shared strict school-date normalization. Deliberately does not use
 * JavaScript's locale-dependent Date.parse() for human-entered dates.
 * Default date convention: Ghana DD/MM/YYYY.
 */
export type SchoolDateResult = {
  status: "valid" | "empty" | "invalid" | "ambiguous";
  iso?: string;
  original: string;
};
const MONTHS: Record<string, number> = {
  jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,
  may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,
  september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12,
};
function validDate(y:number,m:number,d:number): string | undefined {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const date = new Date(Date.UTC(y,m-1,d));
  if(date.getUTCFullYear()!==y || date.getUTCMonth()!==m-1 || date.getUTCDate()!==d) return undefined;
  return `${String(y).padStart(4,"0")}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
function yearNumber(text:string):number { const n=Number(text);return text.length===2 ? (n<=49?2000+n:1900+n):n; }
export function normalizeSchoolDate(value:unknown):SchoolDateResult {
  const original = value instanceof Date ? value.toISOString?.() ?? String(value) : String(value??"").trim();
  if (value === null || value === undefined || original === "") return {status:"empty",original};
  if(value instanceof Date) {
    if(!Number.isFinite(value.getTime())) return {status:"invalid",original};
    const iso=validDate(value.getUTCFullYear(),value.getUTCMonth()+1,value.getUTCDate());
    return iso?{status:"valid",iso,original}:{status:"invalid",original};
  }
  if(typeof value === "number") {
    if(!Number.isFinite(value) || value < 1 || value > 100000) return {status:"invalid",original};
    const day = new Date(Date.UTC(1899,11,30) + Math.floor(value)*86400000);
    const iso=validDate(day.getUTCFullYear(),day.getUTCMonth()+1,day.getUTCDate());
    return iso?{status:"valid",iso,original}:{status:"invalid",original};
  }
  const v=original.replace(/,/g," ").replace(/\s+/g," ").trim();
  let m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if(m){const iso=validDate(+m[1],+m[2],+m[3]);return iso?{status:"valid",iso,original}:{status:"invalid",original};}
  m=/^(\d{1,2})(?:st|nd|rd|th)?[\s/-]+([a-zA-Z]+)[\s/-]+(\d{2}|\d{4})$/i.exec(v);
  if(m){const month=MONTHS[m[2].toLowerCase()];const iso=month?validDate(yearNumber(m[3]),month,+m[1]):undefined;return iso?{status:"valid",iso,original}:{status:"invalid",original};}
  m=/^([a-zA-Z]+)[\s/-]+(\d{1,2})(?:st|nd|rd|th)?[\s/-]+(\d{2}|\d{4})$/i.exec(v);
  if(m){const month=MONTHS[m[1].toLowerCase()];const iso=month?validDate(yearNumber(m[3]),month,+m[2]):undefined;return iso?{status:"valid",iso,original}:{status:"invalid",original};}
  m=/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/.exec(v);
  if(m){
    const day=+m[1],month=+m[2],year=yearNumber(m[3]);
    // Without explicit workbook locale, 06/07/2026 is ambiguous between DMY and MDY.
    // Reject only when BOTH interpretations are possible and differ.
    if(day<=12 && month<=12 && day!==month) return {status:"ambiguous",original};
    const iso=validDate(year,month,day);
    return iso?{status:"valid",iso,original}:{status:"invalid",original};
  }
  return {status:"invalid",original};
}
