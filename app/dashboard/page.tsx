"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";

// ================= MODULES =================
import Students from "./students";
import Teachers from "./teachers";
import Classes from "./classes";
import Subjects from "./subjects";
import Assignments from "./assignments";
import Scores from "./scores";
import Reports from "./reports";
import Fees from "./fees";
import Promotion from "./promotion";
import StudentAttendance from "./student-attendance";
import TeacherAttendance from "./teacher-attendance";
import Settings from "./settings";

// 🔥 NEW DASHBOARD HOME
import DashboardHome from "./dashboardHome";

// ================= STYLES =================
import {
  layout,
  sidebarStyles,
  sidebarHeaderStyles,
} from "./styles/dashboard.styles";

// ================= TABS =================
const TABS = [
  { key: "students", label: "Students" },
  { key: "teachers", label: "Teachers" },
  { key: "classes", label: "Classes" },
  { key: "subjects", label: "Subjects" },
  { key: "assignments", label: "Assignments" },
  { key: "scores", label: "Scores" },
  { key: "reports", label: "Reports" },
  { key: "promotion", label: "Promotion" },
  { key: "fees", label: "Fees" },
  { key: "student-attendance", label: "Student Attendance" },
  { key: "teacher-attendance", label: "Teacher Attendance" },
];

// ================= ROUTES =================
const ROUTES: Record<string, any> = {
  dashboard: DashboardHome,
  students: Students,
  teachers: Teachers,
  classes: Classes,
  subjects: Subjects,
  assignments: Assignments,
  scores: Scores,
  reports: Reports,
  promotion: Promotion,
  fees: Fees,
  "student-attendance": StudentAttendance,
  "teacher-attendance": TeacherAttendance,
  settings: Settings,
};

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  ...Object.fromEntries(TABS.map((t) => [t.key, t.label])),
  settings: "Settings",
};

export default function Dashboard() {
  const [tab, setTab] = useState<string>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isMobile, setIsMobile] = useState(false);

  const [settings, setSettings] = useState<any>(null);

  // ================= LOAD SETTINGS =================
  useEffect(() => {
    const load = async () => {
      const data = await db.settings.toArray();
      setSettings(data[0] ?? null);
    };
    load();
  }, []);

  // ================= APPLY GLOBAL FONT FAMILY =================
  useEffect(() => {
    if (!settings?.fontFamily) return;

    document.documentElement.style.setProperty(
      "--font-family",
      settings.fontFamily
    );
  }, [settings?.fontFamily]);

  // ================= ACTIVE COMPONENT =================
  const ActiveComponent = useMemo(() => {
    return ROUTES[tab] ?? DashboardHome;
  }, [tab]);

  const activeLabel = LABELS[tab] ?? "Dashboard";

  // ================= RESPONSIVE CHECK =================
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);

    check();
    window.addEventListener("resize", check);

    return () => window.removeEventListener("resize", check);
  }, []);

  // ================= NAVIGATION =================
  const navigate = (key: string) => {
    setTab(key);

    if (isMobile) {
      setSidebarOpen(false);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  // ================= RESIZE SIDEBAR =================
  const startResize = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const newWidth =
        startWidth + (moveEvent.clientX - startX);

      if (newWidth > 180 && newWidth < 420) {
        setSidebarWidth(newWidth);
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const styles = sidebarStyles({
    width: sidebarWidth,
    isMobile,
    open: sidebarOpen,
  });

  return (
    <div
      style={{
        ...layout.container,
        fontFamily: "var(--font-family, system-ui)",
      }}
    >
      {isMobile && sidebarOpen && (
        <div
          style={styles.overlay}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ================= SIDEBAR ================= */}
      <aside style={styles.aside}>
        <div
          style={{
            ...sidebarHeaderStyles.container,
            cursor: "pointer",
          }}
          onClick={() => navigate("dashboard")}
        >
          {settings?.logo && (
            <img
              src={settings.logo}
              style={sidebarHeaderStyles.logo}
            />
          )}

          <div style={sidebarHeaderStyles.text}>
            <h3 style={{ margin: 0 }}>
              {settings?.schoolName || "My School"}
            </h3>
            <small>{settings?.location}</small>
          </div>
        </div>

        {/* NAV */}
        <nav style={styles.nav}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => navigate(t.key)}
              style={styles.button(tab === t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {!isMobile && (
          <div
            style={styles.resizeHandle}
            onMouseDown={startResize}
          />
        )}
      </aside>

      {/* ================= MAIN ================= */}
      <main style={layout.main}>
        <div style={layout.topbar}>
          {isMobile && (
            <button
              style={layout.hamburger(isMobile)}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              ☰
            </button>
          )}

          <h2 style={{ margin: 0, flex: 1 }}>
            {activeLabel}
          </h2>

          <button
            onClick={() => navigate("settings")}
            style={layout.settingsIcon(tab === "settings")}
          >
            ⚙
          </button>
        </div>

        <ActiveComponent navigate={navigate} />
      </main>
    </div>
  );
}