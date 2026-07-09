"use client";

/**
 * app/page.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOL MANAGEMENT HOME PAGE
 * ---------------------------------------------------------
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { db } from "./lib/db";
import { useSettings } from "./context/settings-context";
import { useActiveBranch } from "./context/active-branch-context";

export default function HomePage() {
  const router = useRouter();
  const { settings } = useSettings();

  const {
    activeSchool,
    activeBranch,
    activeSchoolId,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const primary = settings?.primaryColor || "#2f6fed";

  const [isOnline, setIsOnline] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const [counts, setCounts] = useState({
    schools: 0,
    branches: 0,
    students: 0,
    teachers: 0,
    classes: 0,
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
    const check = () => setIsMobile(window.innerWidth < 760);

    check();
    window.addEventListener("resize", check);

    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [schools, branches, students, teachers, classes] =
          await Promise.all([
            db.schools.toArray(),
            db.branches.toArray(),
            db.students.toArray(),
            db.teachers.toArray(),
            db.classes.toArray(),
          ]);

        setCounts({
          schools: schools.filter((row) => !row.isDeleted).length,
          branches: branches.filter((row) => !row.isDeleted).length,
          students: students.filter((row) => !row.isDeleted).length,
          teachers: teachers.filter((row) => !row.isDeleted).length,
          classes: classes.filter((row) => !row.isDeleted).length,
        });
      } catch (error) {
        console.error("Failed to load home counts:", error);
      }
    };

    load();
  }, []);

  const schoolName =
    activeSchool?.name ||
    settings?.schoolName ||
    "Eleeveon School Management";

  const branchName = activeBranch?.name || "No active branch selected";

  const logo =
    (activeSchool as any)?.logo ||
    (activeBranch as any)?.logo ||
    settings?.logo ||
    "";

  const heroImage =
    settings?.dashboardHeroImage ||
    settings?.dashboardBannerImage ||
    (activeSchool as any)?.bannerImage ||
    (activeBranch as any)?.bannerImage ||
    "";

  const contextReady = !!activeSchoolId && !!activeBranchId;

  const quickStats = useMemo(
    () => [
      { label: "Schools", value: counts.schools, icon: "🏫" },
      { label: "Branches", value: counts.branches, icon: "🏢" },
      { label: "Students", value: counts.students, icon: "🧑‍🎓" },
      { label: "Teachers", value: counts.teachers, icon: "👨‍🏫" },
      { label: "Classes", value: counts.classes, icon: "🏷" },
    ],
    [counts]
  );

  const modules = [
    {
      title: "Account Setup",
      text: "Create schools, manage branches, owner settings, subscription and account users.",
      icon: "🧭",
    },
    {
      title: "Branch Dashboard",
      text: "Enter one selected school branch for students, teachers, classes and daily operations.",
      icon: "📊",
    },
    {
      title: "Academic Engine",
      text: "Configure structures, periods, class subjects, grading systems and assessment rules.",
      icon: "🎯",
    },
    {
      title: "Report Publishing",
      text: "Generate report cards, broadsheets, remarks and branded academic records.",
      icon: "📄",
    },
  ];

  const page: React.CSSProperties = {
    minHeight: "100vh",
    background:
      settings?.theme === "dark"
        ? "var(--bg)"
        : "linear-gradient(135deg, #f7f8fb 0%, #eef3ff 55%, #ffffff 100%)",
    color: "var(--text)",
    fontFamily: "var(--font-family, system-ui)",
    padding: isMobile ? 12 : 20,
    boxSizing: "border-box",
  };

  const shell: React.CSSProperties = {
    maxWidth: 1180,
    margin: "0 auto",
    display: "grid",
    gap: isMobile ? 14 : 20,
  };

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: isMobile ? 22 : 26,
    boxShadow: "0 18px 46px rgba(15,23,42,0.08)",
  };

  const button: React.CSSProperties = {
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    background: primary,
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 16px 28px rgba(0,0,0,0.18)",
    width: isMobile ? "100%" : "auto",
  };

  const ghostButton: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: 16,
    padding: "14px 18px",
    background: "rgba(255,255,255,0.70)",
    color: "#111827",
    fontWeight: 900,
    cursor: "pointer",
    width: isMobile ? "100%" : "auto",
  };

  const badge = (
    tone: "green" | "red" | "blue" | "gray" | "orange"
  ): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "7px 11px",
      borderRadius: 999,
      background: tones.bg,
      color: tones.color,
      fontSize: 12,
      fontWeight: 900,
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    };
  };

  return (
    <main style={page}>
      <div style={shell}>
        {/* TOP BAR */}
        <header
          style={{
            display: "flex",
            alignItems: isMobile ? "stretch" : "center",
            justifyContent: "space-between",
            gap: 14,
            flexDirection: isMobile ? "column" : "row",
            padding: "6px 2px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 18,
                background: logo ? `url(${logo}) center/cover` : primary,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 950,
                fontSize: 20,
                boxShadow: "0 12px 26px rgba(0,0,0,0.14)",
                flex: "0 0 48px",
              }}
            >
              {!logo && "E"}
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 950,
                  fontSize: 18,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {schoolName}
              </div>

              <div
                style={{
                  opacity: 0.66,
                  fontSize: 13,
                  fontWeight: 700,
                  lineHeight: 1.4,
                }}
              >
                Offline-first school management workspace
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: isMobile ? "flex-start" : "flex-end",
            }}
          >
            <span style={badge(isOnline ? "green" : "red")}>
              ● {isOnline ? "Online" : "Offline"}
            </span>

            <span style={badge(contextReady ? "blue" : "orange")}>
              {contextReady ? branchName : "Setup Needed"}
            </span>
          </div>
        </header>

        {/* HERO */}
        <section
          style={{
            ...card,
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "minmax(0, 1.08fr) minmax(320px, 0.92fr)",
          }}
        >
          <div
            style={{
              padding: isMobile ? 20 : 30,
              display: "grid",
              alignContent: "center",
              gap: isMobile ? 14 : 18,
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={badge("blue")}>School-first</span>
              <span style={badge("green")}>Branch-aware</span>
              <span style={badge("orange")}>PWA Ready</span>
            </div>

            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: isMobile ? 39 : "clamp(40px, 6vw, 64px)",
                  lineHeight: isMobile ? 1.02 : 0.96,
                  letterSpacing: isMobile ? -1.4 : -2.2,
                  fontWeight: 950,
                }}
              >
                Manage learning, assessments and reports from one place.
              </h1>

              <p
                style={{
                  margin: "16px 0 0",
                  maxWidth: 620,
                  opacity: 0.74,
                  fontSize: isMobile ? 14 : 16,
                  lineHeight: 1.65,
                  fontWeight: 650,
                }}
              >
                A configurable institutional system for schools that need
                student records, attendance, finance, curriculum, assessment,
                report publishing and branch-aware operations.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                flexDirection: isMobile ? "column" : "row",
              }}
            >
              <button
                type="button"
                style={{
                  ...ghostButton,
                  opacity: contextReady ? 1 : 0.65,
                }}
                disabled={!contextReady}
                onClick={() => router.push("/select-role")}
              >
                Enter Dashboard
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={badge(contextReady ? "green" : "orange")}>
                {contextLoading
                  ? "Loading context..."
                  : contextReady
                  ? `Active: ${branchName}`
                  : "Create/select school and branch"}
              </span>

              <span style={badge("gray")}>Local database enabled</span>
            </div>
          </div>

          <div
            style={{
              minHeight: isMobile ? 260 : 430,
              position: "relative",
              background: heroImage
                ? `linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.38)), url(${heroImage}) center/cover`
                : `linear-gradient(135deg, ${primary}, rgba(15,23,42,0.92))`,
              display: "flex",
              alignItems: "flex-end",
              padding: isMobile ? 16 : 24,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                width: "100%",
                borderRadius: 22,
                padding: isMobile ? 15 : 18,
                background: "rgba(255,255,255,0.88)",
                backdropFilter: "blur(10px)",
                color: "#111827",
                boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  opacity: 0.62,
                  textTransform: "uppercase",
                }}
              >
                Active Workspace
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontSize: isMobile ? 21 : 24,
                  fontWeight: 950,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeSchool?.name || "School Setup"}
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontWeight: 750,
                  opacity: 0.72,
                  lineHeight: 1.4,
                }}
              >
                {activeBranch?.name || "Select a branch to begin operations"}
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "repeat(2, minmax(0, 1fr))"
              : "repeat(auto-fit,minmax(170px,1fr))",
            gap: isMobile ? 10 : 14,
          }}
        >
          {quickStats.map((stat) => (
            <div
              key={stat.label}
              style={{
                ...card,
                padding: isMobile ? 14 : 18,
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: 23 }}>{stat.icon}</div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: isMobile ? 24 : 30,
                  fontWeight: 950,
                }}
              >
                {stat.value}
              </div>

              <div
                style={{
                  marginTop: 2,
                  opacity: 0.64,
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </section>

        {/* MODULES */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fit,minmax(240px,1fr))",
            gap: 14,
          }}
        >
          {modules.map((module) => (
            <div
              key={module.title}
              style={{
                ...card,
                padding: isMobile ? 18 : 20,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 18,
                  background: "rgba(47,111,237,0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 23,
                }}
              >
                {module.icon}
              </div>

              <h3
                style={{
                  margin: "14px 0 6px",
                  fontSize: 18,
                  fontWeight: 950,
                }}
              >
                {module.title}
              </h3>

              <p
                style={{
                  margin: 0,
                  opacity: 0.7,
                  lineHeight: 1.55,
                  fontSize: 13,
                  fontWeight: 650,
                }}
              >
                {module.text}
              </p>
            </div>
          ))}
        </section>

        <footer
          style={{
            textAlign: "center",
            opacity: 0.62,
            fontSize: 12,
            fontWeight: 750,
            padding: "10px 0 4px",
            lineHeight: 1.5,
          }}
        >
          Eleeveon School Management System • Built for learning, work and life
        </footer>
      </div>
    </main>
  );
}