"use client";

import React, { useEffect, useState } from "react";
import { db } from "../lib/db";

export default function SyncBackupPage() {
  const [isOnline, setIsOnline] = useState(true);
  const [counts, setCounts] = useState({
    schools: 0,
    branches: 0,
    students: 0,
    teachers: 0,
    payments: 0,
  });

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);

    update();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      const [schools, branches, students, teachers, payments] =
        await Promise.all([
          db.schools.toArray(),
          db.branches.toArray(),
          db.students.toArray(),
          db.teachers.toArray(),
          db.payments.toArray(),
        ]);

      setCounts({
        schools: schools.filter((row) => !row.isDeleted).length,
        branches: branches.filter((row) => !row.isDeleted).length,
        students: students.filter((row) => !row.isDeleted).length,
        teachers: teachers.filter((row) => !row.isDeleted).length,
        payments: payments.filter((row) => !row.isDeleted).length,
      });
    };

    load();
  }, []);

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const badge: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 11px",
    borderRadius: 999,
    background: isOnline ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
    color: isOnline ? "#16a34a" : "#dc2626",
    fontSize: 12,
    fontWeight: 900,
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>
          Sync & Backup
        </h2>
        <p style={{ marginTop: 6, opacity: 0.68, fontWeight: 650 }}>
          Monitor offline mode, local records and future cloud sync readiness.
        </p>

        <div style={{ marginTop: 12 }}>
          <span style={badge}>
            ● {isOnline ? "Online - Sync Ready" : "Offline - Local Mode"}
          </span>
        </div>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
          gap: 14,
        }}
      >
        {Object.entries(counts).map(([key, value]) => (
          <div key={key} style={card}>
            <div style={{ opacity: 0.68, fontSize: 12, fontWeight: 850 }}>
              {key.toUpperCase()}
            </div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950 }}>
              {value}
            </div>
          </div>
        ))}
      </section>

      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 950 }}>
          Future Sync Pipeline
        </h3>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {[
            "Prepare local data for upload",
            "Detect unsynced records",
            "Cloud backup",
            "Restore from backup",
            "Device-to-cloud sync history",
          ].map((item) => (
            <div
              key={item}
              style={{
                padding: 14,
                borderRadius: 16,
                background: "rgba(0,0,0,0.025)",
                fontWeight: 850,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}