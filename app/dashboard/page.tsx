"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";

// ================= MODULES =================
import Branches from "./branches";
import Organizations from "./organizations";
import Students from "./students";
import Teachers from "./teachers";
import Parents from "./parents";
import Classes from "./classes";
import Subjects from "./subjects";
import Assignments from "./assignments";
import AcademicConfiguration from "./academicConfiguration";
import AssessmentComponents from "./assessmentComponent";
import AssessmentEntries from "./assessmentEntries";
import Reports from "./reports/pageOriginal";
import Fees from "./fees";
import Income from "./incomes";
import Expenses from "./expenses";
import Promotion from "./promotion";
import StudentAttendance from "./student-attendance";
import TeacherAttendance from "./teacher-attendance";
import Settings from "./settings";

// 🔥 NEW FUTURE MODULES
import DashboardHome from "./dashboardHome";

// ================= STYLES =================
import {
  layout,
  sidebarStyles,
  sidebarHeaderStyles,
} from "./styles/dashboard.styles";

// ================= ROUTES =================
const ROUTES: Record<string, any> = {
  dashboard: DashboardHome,

  // ACADEMICS
  branches: Branches, // 🔥 ADD THIS
  organizations: Organizations, // 🔥 ADD THIS
  academicConfiguration: AcademicConfiguration, // 🔥 ADD THIS
  assessmentComponents: AssessmentComponents, // 🔥 ADD THIS
  assessmentEntries: AssessmentEntries,
  students: Students,
  teachers: Teachers,
  parents: Parents,
  classes: Classes,
  subjects: Subjects,
  assignments: Assignments,
  reports: Reports,
  promotion: Promotion,

  // ATTENDANCE
  "student-attendance": StudentAttendance,
  "teacher-attendance": TeacherAttendance,

  // FINANCE
  fees: Fees,
  income: Income,
  expenses: Expenses,
  // SETTINGS
  settings: Settings,
};

// ================= SIDEBAR GROUPS =================
const NAV_SECTIONS = [
  {
    title: "Overview",
    items: [
      {
        key: "dashboard",
        label: "Dashboard",
        icon: "🏠",
      },
    ],
  },

  {
    title: "Academic Structure",
    items: [
      {
        key: "branches",
        label: "Branches",
        icon: "🏫",
      },

      {
        key: "organizations",
        label: "Organizations",
        icon: "🏛",
      },

      {
        key: "classes",
        label: "Classes",
        icon: "🏷",
      },

      {
        key: "subjects",
        label: "Subjects",
        icon: "📘",
      },

      {
        key: "assignments",
        label: "Assignments",
        icon: "🧩",
      },
    ],
  },

  {
    title: "People",
    items: [
      {
        key: "students",
        label: "Students",
        icon: "🧑‍🎓",
      },

      {
        key: "teachers",
        label: "Teachers",
        icon: "👨‍🏫",
      },

      {
        key: "parents",
        label: "Parents",
        icon: "👨‍👩‍👧",
      },
    ],
  },

  {
    title: "Assessment",
    items: [
      

      {
        key: "academicConfiguration",
        label: "Academic Config",
        icon: "🎯",
      },

      {
        key: "assessmentComponents",
        label: "Assessment Compo",
        icon: "⚙",
      },

      {
        key: "assessmentEntries",
        label: "Assessment Entries",
        icon: "📝",
      },

      {
        key: "reports",
        label: "Reports",
        icon: "📄",
      },

      {
        key: "promotion",
        label: "Promotion",
        icon: "🚀",
      },

    ],
  },

  {
    title: "Attendance",
    items: [
      {
        key: "student-attendance",
        label: "Student Attendance",
        icon: "📅",
      },

      {
        key: "teacher-attendance",
        label: "Teacher Attendance",
        icon: "🕒",
      },
    ],
  },

  {
    title: "Finance",
    items: [
      {
        key: "fees",
        label: "Fees",
        icon: "💳",
      },

      {
        key: "income",
        label: "Income",
        icon: "📈",
      },

      {
        key: "expenses",
        label: "Expenses",
        icon: "📉",
      },
    ],
  },

  {
    title: "Administration",
    items: [
      {
        key: "settings",
        label: "Settings",
        icon: "⚙",
      },
    ],
  },
];

// ================= LABELS =================
const LABELS: Record<string, string> = {};

NAV_SECTIONS.forEach(section => {
  section.items.forEach(item => {
    LABELS[item.key] = item.label;
  });
});

export default function Dashboard() {
  const [tab, setTab] =
    useState<string>("dashboard");

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [sidebarWidth, setSidebarWidth] =
    useState(300);

  const [isMobile, setIsMobile] =
    useState(false);

  const [settings, setSettings] =
    useState<any>(null);

  // ================= LOAD SETTINGS =================
  useEffect(() => {
    const load = async () => {
      const data =
        await db.settings.toArray();

      setSettings(data[0] ?? null);
    };

    load();
  }, []);

  // ================= APPLY FONT =================
  useEffect(() => {
    if (!settings?.fontFamily) return;

    document.documentElement.style.setProperty(
      "--font-family",
      settings.fontFamily
    );
  }, [settings?.fontFamily]);

  // ================= ACTIVE PAGE =================
  const ActiveComponent = useMemo(() => {
    return ROUTES[tab] ?? DashboardHome;
  }, [tab]);

  const activeLabel =
    LABELS[tab] ?? "Dashboard";

  // ================= RESPONSIVE =================
  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
    };

    check();

    window.addEventListener(
      "resize",
      check
    );

    return () =>
      window.removeEventListener(
        "resize",
        check
      );
  }, []);

  // ================= NAVIGATION =================
  const navigate = (key: string) => {
    setTab(key);

    if (isMobile) {
      setSidebarOpen(false);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  // ================= SIDEBAR RESIZE =================
  const startResize = (
    e: React.MouseEvent
  ) => {
    const startX = e.clientX;

    const startWidth = sidebarWidth;

    const onMove = (
      moveEvent: MouseEvent
    ) => {
      const newWidth =
        startWidth +
        (moveEvent.clientX - startX);

      if (newWidth >= 240 && newWidth <= 420) {
        setSidebarWidth(newWidth);
      }
    };

    const onUp = () => {
      window.removeEventListener(
        "mousemove",
        onMove
      );

      window.removeEventListener(
        "mouseup",
        onUp
      );
    };

    window.addEventListener(
      "mousemove",
      onMove
    );

    window.addEventListener(
      "mouseup",
      onUp
    );
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
        fontFamily:
          "var(--font-family, system-ui)",
      }}
    >
      {/* ================= MOBILE OVERLAY ================= */}
      {isMobile && sidebarOpen && (
        <div
          style={styles.overlay}
          onClick={() =>
            setSidebarOpen(false)
          }
        />
      )}

      {/* ================= SIDEBAR ================= */}
      <aside style={styles.aside}>
        {/* ================= HEADER ================= */}
        <div
          style={{
            ...sidebarHeaderStyles.container,
            marginBottom: 22,
          }}
          onClick={() =>
            navigate("dashboard")
          }
        >
          {settings?.logo ? (
            <img
              src={settings.logo}
              alt="School Logo"
              style={
                sidebarHeaderStyles.logo
              }
            />
          ) : (
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                display: "grid",
                placeItems: "center",
                background:
                  "var(--primary-color)",
                color: "#fff",
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              🎓
            </div>
          )}

          <div
            style={
              sidebarHeaderStyles.text
            }
          >
            <h3
              style={{
                margin: 0,
                fontSize: 18,
              }}
            >
              {settings?.schoolName ||
                "Eleeveon"}
            </h3>

            <small
              style={{
                opacity: 0.7,
                fontSize: 12,
              }}
            >
              {settings?.address ||
                "School Management System"}
            </small>
          </div>
        </div>

        {/* ================= NAVIGATION ================= */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            paddingBottom: 50,
          }}
        >
          {NAV_SECTIONS.map(section => (
            <div key={section.title}>
              {/* SECTION TITLE */}
              <div
                style={
                  styles.sectionTitle
                }
              >
                {section.title}
              </div>

              {/* ITEMS */}
              <nav style={styles.nav}>
                {section.items.map(item => {
                  const active =
                    tab === item.key;

                  return (
                    <button
                      key={item.key}
                      onClick={() =>
                        navigate(
                          item.key
                        )
                      }
                      style={{
                        ...styles.button(
                          active
                        ),

                        justifyContent:
                          "flex-start",

                        fontWeight: active
                          ? 700
                          : 500,

                        position:
                          "relative",

                        overflow:
                          "hidden",
                      }}
                    >
                      {/* ACTIVE BAR */}
                      {active && (
                        <div
                          style={{
                            position:
                              "absolute",

                            left: 0,
                            top: 8,
                            bottom: 8,

                            width: 4,

                            borderRadius: 999,

                            background:
                              "#fff",
                          }}
                        />
                      )}

                      {/* ICON */}
                      <span
                        style={{
                          fontSize: 18,
                          width: 24,
                          textAlign:
                            "center",
                        }}
                      >
                        {item.icon}
                      </span>

                      {/* LABEL */}
                      <span>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* ================= RESIZE HANDLE ================= */}
        {!isMobile && (
          <div
            style={styles.resizeHandle}
            onMouseDown={startResize}
          />
        )}
      </aside>

      {/* ================= MAIN ================= */}
      <main style={layout.main}>
        {/* ================= TOPBAR ================= */}
        <div
          style={{
            ...layout.topbar,
            marginBottom: 24,
          }}
        >
          {/* MOBILE MENU */}
          {isMobile && (
            <button
              style={layout.hamburger(
                isMobile
              )}
              onClick={() =>
                setSidebarOpen(
                  !sidebarOpen
                )
              }
            >
              ☰
            </button>
          )}

          {/* PAGE TITLE */}
          <div style={{ flex: 1 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 26,
                fontWeight: 800,
              }}
            >
              {activeLabel}
            </h2>

            <div
              style={{
                fontSize: 13,
                opacity: 0.65,
                marginTop: 3,
              }}
            >
              {settings?.schoolName ||
                "School Management"}
            </div>
          </div>

          {/* SETTINGS */}
          <button
            onClick={() =>
              navigate("settings")
            }
            style={layout.settingsIcon(
              tab === "settings"
            )}
          >
            ⚙
          </button>
        </div>

        {/* ================= PAGE CONTENT ================= */}
        <div
          style={{
            minHeight: "100%",
          }}
        >
          <ActiveComponent
            navigate={navigate}
          />
        </div>
      </main>
    </div>
  );
}