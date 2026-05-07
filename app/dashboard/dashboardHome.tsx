"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/db";

export default function DashboardHome({
  navigate,
}: {
  navigate: (key: string) => void;
}) {
  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    classes: 0,
    fees: 0,
  });

  const [insight, setInsight] = useState({
    unpaidStudents: 0,
  });

  useEffect(() => {
    const load = async () => {
      const [students, teachers, classes, payments] = await Promise.all([
        db.students.count(),
        db.teachers.count(),
        db.classes.count(),
        db.payments.toArray(),
      ]);

      const totalFees = payments.reduce((sum, p) => sum + p.amount, 0);

      // 🔥 SIMPLE INSIGHT (expand later)
      const unpaidStudents = Math.max(0, students - payments.length);

      setStats({ students, teachers, classes, fees: totalFees });
      setInsight({ unpaidStudents });
    };

    load();
  }, []);

  const actions = [
    { label: "➕ Add Student", route: "students" },
    { label: "📝 Record Scores", route: "scores" },
    { label: "📄 Generate Reports", route: "reports" },
    { label: "🚀 Promote Class", route: "promotion" },
    { label: "📅 Take Attendance", route: "student-attendance" },
  ];

  const card = {
    padding: 18,
    borderRadius: 12,
    background: "var(--surface)",
    border: "1px solid rgba(0,0,0,0.06)",
  } as React.CSSProperties;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* HERO */}
      <div style={{ ...card }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <p style={{ opacity: 0.7, marginTop: 6 }}>
          Monitor performance, manage records, and take action quickly.
        </p>
      </div>

      {/* STATS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
        }}
      >
        {[
          { label: "Students", value: stats.students },
          { label: "Teachers", value: stats.teachers },
          { label: "Classes", value: stats.classes },
          { label: "Fees Collected", value: `₵${stats.fees}` },
        ].map((item) => (
          <div key={item.label} style={card}>
            <h2 style={{ margin: 0 }}>{item.value}</h2>
            <small style={{ opacity: 0.7 }}>{item.label}</small>
          </div>
        ))}
      </div>

      {/* INSIGHTS */}
      <div style={{ ...card }}>
        <h3 style={{ marginTop: 0 }}>Insights</h3>
        <p style={{ margin: 0 }}>
          ⚠ {insight.unpaidStudents} students may have unpaid fees.
        </p>
      </div>

      {/* QUICK ACTIONS */}
      <div style={{ ...card }}>
        <h3 style={{ marginTop: 0 }}>Quick Actions</h3>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.route)}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                cursor: "pointer",

                border: "1px solid var(--primary-color)",
                background: "var(--surface)",
                color: "var(--text)",

                fontSize: 14,
                transition: "0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--primary-color)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--surface)";
                e.currentTarget.style.color = "var(--text)";
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* GUIDE */}
      <div style={{ ...card }}>
        <h3 style={{ marginTop: 0 }}>Getting Started</h3>
        <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
          <li>Start by adding students and assigning them to classes</li>
          <li>Record scores and generate reports each term</li>
          <li>Track attendance daily</li>
          <li>Use promotion at the end of the term</li>
        </ul>
      </div>
    </div>
  );
}