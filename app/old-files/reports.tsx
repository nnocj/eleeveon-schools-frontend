/*"use client";

import React, { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

import {
  db,
  TermType,
  ReportCardItem,
  Attendance,
} from "../lib/db";

import { getRemark } from "../lib/calculations/grading";
import { useSettings } from "../context/settings-context";

import { reportStyles as S } from "./styles/reportStyles";

type TabType = "student" | "class";

const TERMS: TermType[] = [
  "Term 1",
  "Term 2",
  "Term 3",
];

type SafeReportItem = ReportCardItem & {
  id: number;
};

export default function Reports() {
  const { settings } = useSettings();

  const printRef =
    useRef<HTMLDivElement>(null);

  const [tab, setTab] =
    useState<TabType>("student");

  const [students, setStudents] =
    useState<any[]>([]);

  const [classes, setClasses] =
    useState<any[]>([]);

  const [items, setItems] = useState<
    SafeReportItem[]
  >([]);

  const [attendance, setAttendance] =
    useState<Attendance[]>([]);

  const [years, setYears] = useState<
    string[]
  >([]);

  // ================= STUDENT FILTERS =================
  const [studentId, setStudentId] =
    useState<number | null>(null);

  const [studentYear, setStudentYear] =
    useState("");

  const [studentTerm, setStudentTerm] =
    useState<TermType | "">("");

  // ================= CLASS FILTERS =================
  const [classId, setClassId] =
    useState<number | null>(null);

  const [classYear, setClassYear] =
    useState("");

  const [classTerm, setClassTerm] =
    useState<TermType | "">("");

  // =====================================================
  // APPLY FONT + PRIMARY COLOR
  // =====================================================
  useEffect(() => {
    if (!settings) return;

    document.documentElement.style.setProperty(
      "--font-family",
      settings.fontFamily ||
        "Arial, sans-serif"
    );

    document.documentElement.style.setProperty(
      "--primary-color",
      settings.primaryColor ||
        "#2f6fed"
    );
  }, [settings]);

  // =====================================================
  // LOAD DATA
  // =====================================================
  useEffect(() => {
    (async () => {
      const [st, cl, rc, att] =
        await Promise.all([
          db.students.toArray(),
          db.classes.toArray(),
          db.reportCardItems.toArray(),
          db.attendance.toArray(),
        ]);

      setStudents(st);

      setClasses(cl);

      setItems(
        rc.filter(
          r => r.id !== undefined
        ) as SafeReportItem[]
      );

      setAttendance(att);

      setYears([
        ...new Set(
          rc.map(r => r.academicYear)
        ),
      ]);
    })();
  }, []);

  // =====================================================
  // SCHOOL INFO
  // =====================================================
  const school = {
    name:
      settings?.schoolName ||
      "School Name",

    motto:
      settings?.motto ||
      "Knowledge is Power",

    logo: settings?.logo,
  };

  // =====================================================
  // PDF EXPORT
  // =====================================================
  const handleExportPDF = async () => {
    const element = printRef.current;

    if (!element) return;

    const cards =
      element.querySelectorAll(
        ".report-card"
      );

    if (!cards.length) {
      alert("No report cards available.");
      return;
    }

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    for (
      let i = 0;
      i < cards.length;
      i++
    ) {
      const card =
        cards[i] as HTMLElement;

      const canvas =
        await html2canvas(card, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });

      const imgData =
        canvas.toDataURL("image/png");

      const pdfWidth = 210;

      const pdfHeight = 297;

      const imgWidth = pdfWidth - 20;

      const imgHeight =
        (canvas.height * imgWidth) /
        canvas.width;

      if (i > 0) {
        pdf.addPage();
      }

      pdf.addImage(
        imgData,
        "PNG",
        10,
        10,
        imgWidth,
        Math.min(
          imgHeight,
          pdfHeight - 20
        )
      );
    }

    pdf.save("report-cards.pdf");
  };

  // =====================================================
  // WEIGHTED SCORES
  // =====================================================
  const getWeightedCA = (
    ca: number
  ) => {
    return Number(
      ((ca / 60) * 50).toFixed(1)
    );
  };

  const getWeightedExam = (
    exam: number
  ) => {
    return Number(
      ((exam / 100) * 50).toFixed(1)
    );
  };

  const getWeightedTotal = (
    ca: number,
    exam: number
  ) => {
    return Number(
      (
        getWeightedCA(ca) +
        getWeightedExam(exam)
      ).toFixed(1)
    );
  };

  // =====================================================
  // ATTENDANCE
  // =====================================================
  const getAttendance = (
    studentId: number,
    year: string,
    term: TermType
  ) => {
    const records =
      attendance.filter(
        a =>
          a.studentId === studentId &&
          a.academicYear === year &&
          a.term === term
      );

    const total = records.length;

    const present = records.filter(
      a => a.status === "present"
    ).length;

    return {
      total,
      present,

      percent: total
        ? Math.round(
            (present / total) * 100
          )
        : 0,
    };
  };

  // =====================================================
  // SUBJECT POSITIONS
  // =====================================================
  const getSubjectPositions = (
    classId: number,
    subjectId: number,
    year: string,
    term: TermType
  ) => {
    const scores = items
      .filter(
        r =>
          r.classId === classId &&
          r.subjectId === subjectId &&
          r.academicYear === year &&
          r.term === term
      )
      .map(r => ({
        studentId: r.studentId,

        total: getWeightedTotal(
          Number(r.ca || 0),
          Number(r.exam || 0)
        ),
      }))
      .sort(
        (a, b) => b.total - a.total
      );

    return scores.map((s, i) => ({
      studentId: s.studentId,
      position: i + 1,
    }));
  };

  // =====================================================
  // CLASS RANKINGS
  // =====================================================
  const getClassRankings = (
    classId: number,
    year: string,
    term: TermType
  ) => {
    const filtered = items.filter(
      r =>
        r.classId === classId &&
        r.academicYear === year &&
        r.term === term
    );

    const grouped: Record<
      number,
      number
    > = {};

    filtered.forEach(r => {
      const total =
        getWeightedTotal(
          Number(r.ca || 0),
          Number(r.exam || 0)
        );

      grouped[r.studentId] =
        (grouped[r.studentId] || 0) +
        total;
    });

    const ranked = Object.entries(
      grouped
    )
      .map(([studentId, total]) => ({
        studentId: Number(studentId),
        total,
      }))
      .sort(
        (a, b) => b.total - a.total
      );

    return ranked.map((r, i) => ({
      studentId: r.studentId,
      total: r.total,
      position: i + 1,
    }));
  };

  // =====================================================
  // REPORT CARD
  // =====================================================
  const renderCard = (
    student: any,
    data: any[],
    className: string,
    year: string,
    term: TermType,
    classId: number
  ) => {
    const rankings =
      getClassRankings(
        classId,
        year,
        term
      );

    const classPosition =
      rankings.find(
        r =>
          r.studentId === student.id
      )?.position || "-";

    const overallTotal =
      rankings.find(
        r =>
          r.studentId === student.id
      )?.total || 0;

    const att = getAttendance(
      student.id,
      year,
      term
    );

    return (
      <div
        key={`${student.id}-${classId}-${term}-${year}`}
        className="report-card"
        style={S.reportCard}
      >
        {/* HEADER *//*}
        <div style={S.schoolHeader}>
          {school.logo && (
            <img
              src={school.logo}
              alt="logo"
              style={S.logo}
            />
          )}

          <div style={S.schoolName}>
            {school.name}
          </div>

          <div style={S.motto}>
            {school.motto}
          </div>
        </div>

        {/* META *//*}
        <div style={S.metaRow}>
          <span>
            <b>Student:</b>{" "}
            {student.fullName}
          </span>

          <span>
            <b>
              {className} | {term} |{" "}
              {year}
            </b>
          </span>
        </div>

        {/* TABLE *//*}
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>
                Subject
              </th>

              <th style={S.th}>
                CA
                <br />
                (50%)
              </th>

              <th style={S.th}>
                Exam
                <br />
                (50%)
              </th>

              <th style={S.th}>
                Total
              </th>

              <th style={S.th}>
                Grade
              </th>

              <th style={S.th}>
                Remark
              </th>

              <th style={S.th}>
                Pos
              </th>
            </tr>
          </thead>

          <tbody>
            {data.map(r => {
              const weightedCA =
                getWeightedCA(
                  Number(r.ca || 0)
                );

              const weightedExam =
                getWeightedExam(
                  Number(r.exam || 0)
                );

              const total =
                getWeightedTotal(
                  Number(r.ca || 0),
                  Number(r.exam || 0)
                );

              const posMap =
                getSubjectPositions(
                  classId,
                  r.subjectId,
                  year,
                  term
                );

              const pos =
                posMap.find(
                  p =>
                    p.studentId ===
                    r.studentId
                )?.position || "-";

              return (
                <tr
                  key={`${r.id}-${r.subjectId}`}
                >
                  <td style={S.td}>
                    {r.subjectName}
                  </td>

                  <td style={S.td}>
                    {weightedCA}
                  </td>

                  <td style={S.td}>
                    {weightedExam}
                  </td>

                  <td style={S.td}>
                    {total}
                  </td>

                  <td style={S.td}>
                    {r.grade}
                  </td>

                  <td style={S.td}>
                    {getRemark(
                      r.grade
                    )}
                  </td>

                  <td style={S.td}>
                    {pos}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* SUMMARY *//*
        <div style={S.summaryGrid}>
          {/* CARD 1 *//*}
          <div style={S.summaryCard}>
            <div style={S.summaryRow}>
              <span
                style={S.summaryLabel}
              >
                Overall Total
              </span>

              <span
                style={S.summaryValue}
              >
                {overallTotal.toFixed(
                  1
                )}
              </span>
            </div>

            <div
              style={S.summaryRowLast}
            >
              <span
                style={S.summaryLabel}
              >
                Class Position
              </span>

              <span
                style={S.summaryValue}
              >
                {classPosition}
              </span>
            </div>
          </div>

          {/* CARD 2 *//*}
         /* <div style={S.summaryCard}>
            <div style={S.summaryRow}>
              <span
                style={S.summaryLabel}
              >
                Attendance
              </span>

              <span
                style={S.summaryValue}
              >
                {att.present}/
                {att.total}
              </span>
            </div>

            <div
              style={S.summaryRowLast}
            >
              <span
                style={S.summaryLabel}
              >
                Percentage
              </span>

              <span
                style={S.summaryValue}
              >
                {att.percent}%
              </span>
            </div>
          </div>
        </div>

        {/* REMARKS *//*}
        <div style={S.remarkBox}>
          <b>
            Class Teacher’s Remark:
          </b>

          <p>
            ________________________________
          </p>

          <p>
            Signature:
            __________________
          </p>
        </div>

        <div style={S.remarkBox}>
          <b>
            Head Teacher’s Remark:
          </b>

          <p>
            ________________________________
          </p>

          <p>
            Signature:
            __________________
          </p>
        </div>
      </div>
    );
  };

  // =====================================================
  // STUDENT VIEW
  // =====================================================
  const renderStudent = () => {
    if (!studentId) return null;

    const student =
      students.find(
        s => s.id === studentId
      );

    if (!student) return null;

    const filtered = items.filter(
      r =>
        r.studentId === studentId &&
        (!studentYear ||
          r.academicYear ===
            studentYear) &&
        (!studentTerm ||
          r.term === studentTerm)
    );

    const grouped: any = {};

    filtered.forEach(r => {
      grouped[r.academicYear] ??= {};

      grouped[r.academicYear][
        r.classId
      ] ??= {};

      grouped[r.academicYear][
        r.classId
      ][r.term] ??= [];

      grouped[r.academicYear][
        r.classId
      ][r.term].push(r);
    });

    return (
      <div
        className="print-area"
        style={S.printArea}
      >
        {Object.entries(grouped).map(
          ([year, classObj]) => (
            <React.Fragment
              key={`year-${year}`}
            >
              {Object.entries(
                classObj as any
              ).map(
                ([cid, termObj]) => (
                  <React.Fragment
                    key={`class-${cid}`}
                  >
                    {Object.entries(
                      termObj as any
                    ).map(
                      (
                        [
                          term,
                          data,
                        ]: any
                      ) => {
                        const className =
                          classes.find(
                            c =>
                              c.id ===
                              Number(cid)
                          )?.name || "";

                        return (
                          <React.Fragment
                            key={`term-${term}-${cid}-${year}`}
                          >
                            {renderCard(
                              student,
                              data,
                              className,
                              year,
                              term as TermType,
                              Number(cid)
                            )}
                          </React.Fragment>
                        );
                      }
                    )}
                  </React.Fragment>
                )
              )}
            </React.Fragment>
          )
        )}
      </div>
    );
  };

  // =====================================================
  // CLASS VIEW
  // =====================================================
  const renderClass = () => {
    if (!classId || !classTerm)
      return null;

    const classStudents =
      students.filter(
        s => s.classId === classId
      );

    return (
      <div
        className="print-area"
        style={S.printArea}
      >
        {classStudents.map(student => {
          const data = items.filter(
            r =>
              r.studentId ===
                student.id &&
              r.classId === classId &&
              (!classYear ||
                r.academicYear ===
                  classYear) &&
              r.term === classTerm
          );

          if (!data.length)
            return null;

          return (
            <React.Fragment
              key={`student-${student.id}`}
            >
              {renderCard(
                student,
                data,
                classes.find(
                  c =>
                    c.id === classId
                )?.name || "",
                classYear,
                classTerm as TermType,
                classId
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // =====================================================
  // UI
  // =====================================================
  return (
    <div style={S.page}>
      <h1 style={S.title}>
        Reports
      </h1>

      <button
        onClick={handleExportPDF}
        style={S.exportBtn}
      >
        Export / Download PDF
      </button>

      {/* TABS *//*}
      <div style={S.tabs}>
        <button
          style={
            tab === "student"
              ? S.activeTab
              : S.tabBtn
          }
          onClick={() =>
            setTab("student")
          }
        >
          Student
        </button>

        <button
          style={
            tab === "class"
              ? S.activeTab
              : S.tabBtn
          }
          onClick={() =>
            setTab("class")
          }
        >
          Class
        </button>
      </div>

      {/* STUDENT FILTERS *//*}
      {tab === "student" && (
        <div style={S.filters}>
          <select
            style={S.select}
            onChange={e =>
              setStudentId(
                Number(
                  e.target.value
                )
              )
            }
          >
            <option>
              Select Student
            </option>

            {students.map(s => (
              <option
                key={`student-option-${s.id}`}
                value={s.id}
              >
                {s.fullName}
              </option>
            ))}
          </select>

          <select
            style={S.select}
            onChange={e =>
              setStudentYear(
                e.target.value
              )
            }
          >
            <option>Year</option>

            {years.map(y => (
              <option
                key={`year-${y}`}
              >
                {y}
              </option>
            ))}
          </select>

          <select
            style={S.select}
            onChange={e =>
              setStudentTerm(
                e.target
                  .value as TermType
              )
            }
          >
            <option>Term</option>

            {TERMS.map(t => (
              <option
                key={`term-${t}`}
              >
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

     /* {/* CLASS FILTERS *//*}
      {tab === "class" && (
        <div style={S.filters}>
          <select
            style={S.select}
            onChange={e =>
              setClassId(
                Number(
                  e.target.value
                )
              )
            }
          >
            <option>
              Select Class
            </option>

            {classes.map(c => (
              <option
                key={`class-option-${c.id}`}
                value={c.id}
              >
                {c.name}
              </option>
            ))}
          </select>

          <select
            style={S.select}
            onChange={e =>
              setClassYear(
                e.target.value
              )
            }
          >
            <option>Year</option>

            {years.map(y => (
              <option
                key={`class-year-${y}`}
              >
                {y}
              </option>
            ))}
          </select>

          <select
            style={S.select}
            onChange={e =>
              setClassTerm(
                e.target
                  .value as TermType
              )
            }
          >
            <option>Term</option>

            {TERMS.map(t => (
              <option
                key={`class-term-${t}`}
              >
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      <div ref={printRef}>
        {tab === "student" &&
          renderStudent()}

        {tab === "class" &&
          renderClass()}
      </div>
    </div>
  );
}*/