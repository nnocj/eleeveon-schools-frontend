// ======================================================
// FILE: lib/engine/reportEngine.ts (NORMALIZED + FIXED)
// ======================================================

import { db } from "../db";
import { prepareSyncData } from "../sync/syncUtils";
import { ComputedResult, Subject, Student, Class } from "../db";

// ======================================================
// TYPES
// ======================================================

export interface GenerateReportParams {
  branchId: number;
  organizationId?: number;

  academicStructureId: number;
  academicPeriodId: number;

  classId: number;
  studentId?: number;

  publish?: boolean;
}

export interface SubjectReportRow {
  subjectId: number;
  subjectName: string;

  teacherId?: number;
  teacherName?: string;

  total: number;
  average: number;
  percentage: number;

  grade: string;
  remark?: string;
  gpa: number;

  subjectPosition: number;
}

export interface AttendanceSummary {
  totalDays: number;
  present: number;
  absent: number;
  late: number;
  attendancePercent: number;
}

export interface StudentReport {
  student: Student;
  classRecord: Class | undefined;

  total: number;
  average: number;
  overallPercentage: number;

  attendance: AttendanceSummary;

  subjects: SubjectReportRow[];

  reportCardId?: number;
}

// ======================================================
// ENGINE
// ======================================================

export class ReportEngine {
  static async generateReports(
    params: GenerateReportParams
  ): Promise<{
    success: boolean;
    generated: number;
    failed: number;
    reports: StudentReport[];
  }> {
    try {
      // ======================================================
      // LOAD DATA
      // ======================================================

      const [
        students,
        classes,
        subjects,
        computedResults,
        attendances,
        reportCards,
      ] = await Promise.all([
        db.students.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.computedResults.toArray(),
        db.attendance.toArray(),
        db.reportCards.toArray(),
      ]);

      // ======================================================
      // CONTEXT RESOLUTION
      // ======================================================

      const classRecord = classes.find(
        (c) => c.id === params.classId && !c.isDeleted
      );

      const studentsInClass = students.filter(
        (s) =>
          s.branchId === params.branchId &&
          s.currentClassId === params.classId &&
          !s.isDeleted
      );

      const classResults = computedResults.filter(
        (r) =>
          r.branchId === params.branchId &&
          r.classId === params.classId &&
          r.academicStructureId === params.academicStructureId &&
          r.academicPeriodId === params.academicPeriodId &&
          !r.isDeleted
      );

      // ======================================================
      // GROUP BY STUDENT
      // ======================================================

      const grouped = new Map<number, ComputedResult[]>();

      for (const r of classResults) {
        const key = r.studentId;
        const list = grouped.get(key) || [];
        list.push(r);
        grouped.set(key, list);
      }

      const reports: StudentReport[] = [];

      // ======================================================
      // BUILD REPORTS
      // ======================================================

      for (const student of studentsInClass) {
        const results = grouped.get(student.id!) || [];

        // ------------------------------------------------------
        // SUBJECT BREAKDOWN (FIXED + CLEAN)
        // ------------------------------------------------------

        const subjectRows: SubjectReportRow[] = results.map((r) => {
          const subject = subjects.find(
            (s) => s.id === r.subjectId && !s.isDeleted
          );

          const total = Number(r.total ?? 0);
          const average = Number(r.average ?? 0);
          const percentage = Number(r.percentage ?? 0);

          return {
            subjectId: r.subjectId,
            subjectName: subject?.name || "Unknown",

            teacherId: undefined,
            teacherName: undefined,

            total,
            average,
            percentage,

            grade: r.grade ?? "F",
            remark: r.remark ?? "",
            gpa: Number(r.gpa ?? 0),

            subjectPosition: r.position ?? 0,
          };
        });

        // ------------------------------------------------------
        // TOTALS
        // ------------------------------------------------------

        const total = results.reduce(
          (sum, r) => sum + Number(r.total ?? 0),
          0
        );

        const average =
          results.length > 0 ? total / results.length : 0;

        const overallPercentage =
          results.length > 0
            ? results.reduce(
                (sum, r) => sum + Number(r.percentage ?? 0),
                0
              ) / results.length
            : 0;

        // ------------------------------------------------------
        // ATTENDANCE
        // ------------------------------------------------------

        const attendanceRecords = attendances.filter(
          (a) =>
            a.branchId === params.branchId &&
            a.studentId === student.id &&
            a.classId === params.classId &&
            !a.isDeleted
        );

        const present = attendanceRecords.filter(
          (a) => a.status === "present"
        ).length;

        const late = attendanceRecords.filter(
          (a) => a.status === "late"
        ).length;

        const absent = attendanceRecords.filter(
          (a) => a.status === "absent"
        ).length;

        const attendancePercent =
          attendanceRecords.length > 0
            ? (present / attendanceRecords.length) * 100
            : 0;

        // ------------------------------------------------------
        // REPORT CARD (UPSERT SAFE)
        // ------------------------------------------------------

        let reportCard = reportCards.find(
          (r) =>
            r.studentId === student.id &&
            r.classId === params.classId &&
            !r.isDeleted
        );

        let reportCardId = reportCard?.id;

        if (!reportCard) {
          reportCardId = await db.reportCards.add(
            prepareSyncData({
              branchId: params.branchId,
              studentId: student.id!,
              classId: params.classId,

              academicStructureId: params.academicStructureId,
              academicPeriodId: params.academicPeriodId,

              total,
              average,
              attendancePercent,

              published: params.publish ?? false,
            })
          );
        }

        // ------------------------------------------------------
        // FINAL PUSH
        // ------------------------------------------------------

        reports.push({
          student,
          classRecord,

          total,
          average,
          overallPercentage,

          attendance: {
            totalDays: attendanceRecords.length,
            present,
            absent,
            late,
            attendancePercent,
          },

          subjects: subjectRows,

          reportCardId,
        });
      }

      // ======================================================
      // RESPONSE
      // ======================================================

      return {
        success: true,
        generated: reports.length,
        failed: 0,
        reports,
      };
    } catch (error: any) {
      return {
        success: false,
        generated: 0,
        failed: 1,
        reports: [],
      };
    }
  }
}