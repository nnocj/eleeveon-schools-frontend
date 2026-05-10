"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";
import { useSettings } from "../context/settings-context";

type Props = {
  navigate: (key: string) => void;
};

export default function DashboardHome({
  navigate,
}: Props) {
  const { settings } = useSettings();

  // ================= STATE =================
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    classes: 0,
    subjects: 0,
    branches: 0,
    organizations: 0,

    income: 0,
    expenses: 0,
    feesCollected: 0,

    reports: 0,
    attendanceToday: 0,
  });

  const [insights, setInsights] = useState({
    unpaidStudents: 0,
    absentToday: 0,
    lowAttendance: 0,
  });

  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [recentStudents, setRecentStudents] = useState<any[]>([]);

  // ================= LOAD DASHBOARD =================
  useEffect(() => {
    const load = async () => {
      try {
        const today = new Date()
          .toISOString()
          .split("T")[0];

        const [
          students,
          teachers,
          classes,
          subjects,
          branches,
          organizations,
          payments,
          expenses,
          reportCards,
          attendance,
        ] = await Promise.all([
          db.students.toArray(),
          db.teachers.toArray(),
          db.classes.toArray(),
          db.subjects.toArray(),

          // SAFE FALLBACKS
          "branches" in db
            ? (db as any).branches.toArray()
            : Promise.resolve([]),

          "organizations" in db
            ? (db as any).organizations.toArray()
            : Promise.resolve([]),

          db.payments.toArray(),

          "expenses" in db
            ? (db as any).expenses.toArray()
            : Promise.resolve([]),

          db.reportCards.toArray(),
          db.attendance.toArray(),
        ]);

        // ================= MONEY =================
        const totalFees = payments.reduce(
          (sum: number, p: any) =>
            sum + Number(p.amount || 0),
          0
        );

        const totalExpenses = expenses.reduce(
          (sum: number, e: any) =>
            sum + Number(e.amount || 0),
          0
        );

        // ================= ATTENDANCE =================
        const todayAttendance = attendance.filter(
          (a: any) => a.date === today
        );

        const absentToday = todayAttendance.filter(
          (a: any) => a.status === "absent"
        ).length;

        // ================= UNPAID STUDENTS =================
        const studentsWithPayments = new Set(
          payments.map((p: any) => p.studentId)
        );

        const unpaidStudents = students.filter(
          (s: any) =>
            !studentsWithPayments.has(s.id)
        ).length;

        // ================= LOW ATTENDANCE =================
        const attendanceMap: Record<
          number,
          { present: number; total: number }
        > = {};

        attendance.forEach((a: any) => {
          attendanceMap[a.studentId] ??= {
            present: 0,
            total: 0,
          };

          attendanceMap[a.studentId].total += 1;

          if (a.status === "present") {
            attendanceMap[a.studentId].present += 1;
          }
        });

        const lowAttendance = Object.values(
          attendanceMap
        ).filter((a) => {
          if (!a.total) return false;

          const percent =
            (a.present / a.total) * 100;

          return percent < 60;
        }).length;

        setStats({
          students: students.length,
          teachers: teachers.length,
          classes: classes.length,
          subjects: subjects.length,
          branches: branches.length,
          organizations: organizations.length,

          income: totalFees,
          expenses: totalExpenses,
          feesCollected: totalFees,

          reports: reportCards.length,
          attendanceToday:
            todayAttendance.length,
        });

        setInsights({
          unpaidStudents,
          absentToday,
          lowAttendance,
        });

        setRecentPayments(
          [...payments]
            .sort(
              (a: any, b: any) =>
                b.updatedAt - a.updatedAt
            )
            .slice(0, 5)
        );

        setRecentStudents(
          [...students]
            .sort(
              (a: any, b: any) =>
                b.updatedAt - a.updatedAt
            )
            .slice(0, 5)
        );
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // ================= COLORS =================
  const primary =
    settings?.primaryColor ||
    "#2563eb";

  // ================= STYLES =================
  const card: React.CSSProperties = {
    background: "var(--surface)",
    border:
      "1px solid rgba(0,0,0,0.08)",
    borderRadius: 20,
    padding: 20,
    boxShadow:
      "0 6px 18px rgba(0,0,0,0.04)",
  };

  const sectionTitle: React.CSSProperties = {
    margin: 0,
    marginBottom: 18,
    fontSize: 18,
    fontWeight: 800,
  };

  // ================= QUICK ACTIONS =================
  const quickActions = useMemo(
    () => [
      {
        title: "Add Student",
        icon: "🧑‍🎓",
        route: "students",
      },

      {
        title: "Record Scores",
        icon: "📝",
        route: "scores",
      },

      {
        title: "Generate Reports",
        icon: "📄",
        route: "reports",
      },

      {
        title: "Take Attendance",
        icon: "📅",
        route: "student-attendance",
      },

      {
        title: "Promotion",
        icon: "🚀",
        route: "promotion",
      },

      {
        title: "Fee Collection",
        icon: "💳",
        route: "fees",
      },

      {
        title: "Subjects",
        icon: "📘",
        route: "subjects",
      },

      {
        title: "Teachers",
        icon: "👨‍🏫",
        route: "teachers",
      },
    ],
    []
  );

  // ================= LOADING =================
  if (loading) {
    return (
      <div
        style={{
          padding: 30,
          opacity: 0.7,
        }}
      >
        Loading dashboard...
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      {/* ================= HERO ================= */}
      <div
        style={{
          ...card,

          background: `
            linear-gradient(
              135deg,
              ${primary},
              rgba(37,99,235,0.78)
            )
          `,

          color: "#fff",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* DECORATION */}
        <div
          style={{
            position: "absolute",
            right: -40,
            top: -40,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background:
              "rgba(255,255,255,0.08)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 14,
              opacity: 0.9,
              marginBottom: 8,
            }}
          >
            Welcome back 👋
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 900,
            }}
          >
            {settings?.schoolName ||
              "School Dashboard"}
          </h1>

          <p
            style={{
              marginTop: 10,
              maxWidth: 700,
              lineHeight: 1.6,
              opacity: 0.92,
            }}
          >
            Manage academic records,
            assessments, attendance,
            finances, branches,
            departments, and institutional
            operations from one unified
            system.
          </p>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 18,
            }}
          >
            <button
              onClick={() =>
                navigate("students")
              }
              style={{
                padding:
                  "12px 18px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                background: "#fff",
                color: primary,
              }}
            >
              Add Student
            </button>

            <button
              onClick={() =>
                navigate("reports")
              }
              style={{
                padding:
                  "12px 18px",
                borderRadius: 12,
                border:
                  "1px solid rgba(255,255,255,0.25)",
                cursor: "pointer",
                fontWeight: 700,
                background:
                  "rgba(255,255,255,0.12)",
                color: "#fff",
              }}
            >
              Open Reports
            </button>
          </div>
        </div>
      </div>

      {/* ================= MAIN STATS ================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {[
          {
            label: "Students",
            value: stats.students,
            icon: "🧑‍🎓",
          },

          {
            label: "Teachers",
            value: stats.teachers,
            icon: "👨‍🏫",
          },

          {
            label: "Classes",
            value: stats.classes,
            icon: "🏷",
          },

          {
            label: "Subjects",
            value: stats.subjects,
            icon: "📘",
          },

          {
            label: "Branches",
            value: stats.branches,
            icon: "🏫",
          },

          {
            label: "Departments",
            value: stats.organizations,
            icon: "🏛",
          },

          {
            label: "Reports",
            value: stats.reports,
            icon: "📄",
          },

          {
            label: "Attendance Today",
            value:
              stats.attendanceToday,
            icon: "📅",
          },
        ].map((item) => (
          <div
            key={item.label}
            style={card}
          >
            <div
              style={{
                fontSize: 32,
                marginBottom: 14,
              }}
            >
              {item.icon}
            </div>

            <div
              style={{
                fontSize: 30,
                fontWeight: 900,
                marginBottom: 4,
              }}
            >
              {item.value}
            </div>

            <div
              style={{
                opacity: 0.7,
                fontSize: 14,
              }}
            >
              {item.label}
            </div>
          </div>
        ))}
      </div>

      {/* ================= FINANCIAL ================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 18,
        }}
      >
        <div style={card}>
          <h3 style={sectionTitle}>
            💰 Financial Overview
          </h3>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.7,
                }}
              >
                Total Income
              </div>

              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                }}
              >
                ₵
                {stats.income.toLocaleString()}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.7,
                }}
              >
                Total Expenses
              </div>

              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                }}
              >
                ₵
                {stats.expenses.toLocaleString()}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.7,
                }}
              >
                Balance
              </div>

              <div
                style={{
                  fontSize: 30,
                  fontWeight: 900,
                  color:
                    stats.income -
                      stats.expenses >=
                    0
                      ? "green"
                      : "crimson",
                }}
              >
                ₵
                {(
                  stats.income -
                  stats.expenses
                ).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* ================= INSIGHTS ================= */}
        <div style={card}>
          <h3 style={sectionTitle}>
            📌 Insights
          </h3>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <InsightItem
              icon="⚠"
              label="Students with possible unpaid fees"
              value={
                insights.unpaidStudents
              }
            />

            <InsightItem
              icon="🚫"
              label="Absent students today"
              value={
                insights.absentToday
              }
            />

            <InsightItem
              icon="📉"
              label="Students with low attendance"
              value={
                insights.lowAttendance
              }
            />
          </div>
        </div>
      </div>

      {/* ================= QUICK ACTIONS ================= */}
      <div style={card}>
        <h3 style={sectionTitle}>
          ⚡ Quick Actions
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
          }}
        >
          {quickActions.map((action) => (
            <button
              key={action.title}
              onClick={() =>
                navigate(action.route)
              }
              style={{
                padding: 18,
                borderRadius: 16,
                border:
                  "1px solid rgba(0,0,0,0.08)",

                background:
                  "var(--surface)",

                cursor: "pointer",

                textAlign: "left",

                transition:
                  "0.2s ease",
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  marginBottom: 12,
                }}
              >
                {action.icon}
              </div>

              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                {action.title}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ================= LOWER GRID ================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 18,
        }}
      >
        {/* RECENT STUDENTS */}
        <div style={card}>
          <h3 style={sectionTitle}>
            🧑‍🎓 Recently Added Students
          </h3>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {recentStudents.length ===
            0 ? (
              <div
                style={{
                  opacity: 0.6,
                }}
              >
                No students yet.
              </div>
            ) : (
              recentStudents.map(
                (student) => (
                  <div
                    key={student.id}
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "space-between",

                      paddingBottom:
                        10,

                      borderBottom:
                        "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <div
                      style={{
                        display:
                          "flex",
                        alignItems:
                          "center",
                        gap: 12,
                      }}
                    >
                      {student.photo ? (
                        <img
                          src={
                            student.photo
                          }
                          alt=""
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius:
                              "50%",
                            objectFit:
                              "cover",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius:
                              "50%",
                            background:
                              primary,
                            color:
                              "#fff",

                            display:
                              "grid",

                            placeItems:
                              "center",

                            fontWeight: 700,
                          }}
                        >
                          {student.fullName?.charAt(
                            0
                          )}
                        </div>
                      )}

                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                          }}
                        >
                          {
                            student.fullName
                          }
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.7,
                          }}
                        >
                          {
                            student.studentId
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </div>

        {/* RECENT PAYMENTS */}
        <div style={card}>
          <h3 style={sectionTitle}>
            💳 Recent Payments
          </h3>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {recentPayments.length ===
            0 ? (
              <div
                style={{
                  opacity: 0.6,
                }}
              >
                No payments recorded.
              </div>
            ) : (
              recentPayments.map(
                (payment) => (
                  <div
                    key={payment.id}
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",

                      alignItems:
                        "center",

                      paddingBottom:
                        10,

                      borderBottom:
                        "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                        }}
                      >
                        ₵
                        {Number(
                          payment.amount || 0
                        ).toLocaleString()}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.7,
                        }}
                      >
                        {
                          payment.method
                        }
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.6,
                      }}
                    >
                      {payment.date}
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </div>
      </div>

      {/* ================= GETTING STARTED ================= */}
      <div style={card}>
        <h3 style={sectionTitle}>
          🚀 System Workflow
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
          }}
        >
          {[
            "Create school branches and departments",
            "Set up academic years and term structures",
            "Add classes and subjects",
            "Assign teachers to subjects and classes",
            "Register students and parents",
            "Create assessment structures and score metrics",
            "Take attendance and generate reports",
            "Track fees, income, and expenses",
          ].map((step, index) => (
            <div
              key={step}
              style={{
                border:
                  "1px solid rgba(0,0,0,0.08)",

                borderRadius: 16,
                padding: 16,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius:
                    "50%",

                  background:
                    primary,

                  color: "#fff",

                  display: "grid",
                  placeItems:
                    "center",

                  fontWeight: 800,

                  marginBottom: 12,
                }}
              >
                {index + 1}
              </div>

              <div
                style={{
                  lineHeight: 1.5,
                  fontWeight: 500,
                }}
              >
                {step}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ================= INSIGHT ITEM =================
function InsightItem({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,

        padding: 14,

        borderRadius: 14,

        background:
          "rgba(0,0,0,0.03)",
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,

          background:
            "var(--primary-color)",

          color: "#fff",

          display: "grid",
          placeItems: "center",

          fontWeight: 800,
        }}
      >
        {icon}
      </div>

      <div style={{ flex: 1 }}>
        <div
          style={{
            fontWeight: 700,
          }}
        >
          {value}
        </div>

        <div
          style={{
            fontSize: 13,
            opacity: 0.7,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}