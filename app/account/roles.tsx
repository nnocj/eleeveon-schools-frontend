// ======================================================
// FILE 5: app/account/roles.tsx
// ======================================================

"use client";

import React from "react";
import { useSettings } from "../context/settings-context";

const roles = [
  { role: "super_admin", title: "Owner / Super Admin", icon: "👑", scope: "All schools and branches", text: "Can manage account, subscription, schools, branches, users, sync, and all modules." },
  { role: "admin", title: "School Admin", icon: "🏫", scope: "Assigned school", text: "Can manage school operations but should not control account-wide billing or owner settings." },
  { role: "branch_admin", title: "Branch Admin", icon: "🏢", scope: "Assigned branch", text: "Can manage daily branch records, people, classes, attendance, assessments, and finance if allowed." },
  { role: "teacher", title: "Teacher", icon: "👨‍🏫", scope: "Assigned classes/subjects", text: "Can manage attendance, assessment entries, course outline, remarks and teaching records." },
  { role: "student", title: "Student", icon: "🧑‍🎓", scope: "Own student record", text: "Can view academic progress, reports, attendance, fees and school communication." },
  { role: "parent", title: "Parent", icon: "👨‍👩‍👧", scope: "Linked children", text: "Can view children, reports, fees, attendance, payment status and school updates." },
  { role: "accountant", title: "Accountant", icon: "💼", scope: "Finance modules", text: "Can manage fees, payments, incomes, expenses and financial reports where allowed." },
];

export default function RolesPage() {
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  return (
    <main className="roles-page" style={{ "--roles-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="roles-hero"><p>Access Model</p><h2>Roles</h2><span>These roles are the foundation for showing each user only what belongs to them.</span></section>
      <section className="roles-grid">{roles.map((r) => <article key={r.role} className="role-card"><div className="role-icon">{r.icon}</div><div><h3>{r.title}</h3><span>{r.role}</span><p>{r.text}</p><b>{r.scope}</b></div></article>)}</section>
    </main>
  );
}

const css = `
.roles-page{display:grid;gap:10px;color:var(--text,#0f172a)}.roles-hero,.role-card{background:var(--surface,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 14px 34px rgba(15,23,42,.055);border-radius:24px}.roles-hero{padding:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--roles-primary) 12%,#fff),#fff 65%)}.roles-hero p{margin:0;color:var(--roles-primary);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.roles-hero h2{margin:3px 0 0;font-size:clamp(24px,8vw,36px);font-weight:1000;letter-spacing:-.06em}.roles-hero span{display:block;margin-top:5px;color:#64748b;font-size:13px;line-height:1.5;font-weight:750}.roles-grid{display:grid;gap:8px}.role-card{padding:13px;display:flex;gap:12px}.role-icon{width:46px;height:46px;flex:0 0 auto;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--roles-primary) 12%,#fff);font-size:24px}.role-card h3{margin:0;font-size:16px;font-weight:1000}.role-card span{display:inline-flex;margin-top:4px;border-radius:999px;background:rgba(37,99,235,.1);color:var(--roles-primary);padding:5px 8px;font-size:10px;font-weight:950;text-transform:uppercase}.role-card p{margin:8px 0 0;color:#64748b;font-size:13px;line-height:1.5}.role-card b{display:block;margin-top:8px;font-size:12px}@media(min-width:760px){.roles-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:1120px){.roles-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;


