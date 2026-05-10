// ======================================================
// FILE: lib/engine/resultsEngine.ts (NORMALIZED FIXED)
// ======================================================

import { db } from "../db";
import { prepareSyncData } from "../sync/syncUtils";

export class ResultsEngine {
  // ======================================================
  // MAIN COMPUTE ENGINE
  // ======================================================

  static async computeResults(params: any) {
    try {
      const [
        allStudents,
        entries,
        components,
        structures,
        items,
        gradingSystems,
        gradeRules,
        existingResults,
      ] = await Promise.all([
        db.students.toArray(),
        db.assessmentEntries.toArray(),
        db.assessmentComponents.toArray(),
        db.assessmentStructures.toArray(),
        db.assessmentStructureItems.toArray(),
        db.gradingSystems.toArray(),
        db.gradeRules.toArray(),
        db.computedResults.toArray(),
      ]);

      // ======================================================
      // COMPONENT RESOLUTION
      // ======================================================

      const component = components.find(
        (c) =>
          c.branchId === params.branchId &&
          c.classId === params.classId &&
          c.subjectId === params.subjectId &&
          c.academicPeriodId === params.academicPeriodId &&
          c.active &&
          !c.isDeleted
      );

      if (!component) {
        throw new Error("Assessment component not configured.");
      }

      const gradingSystemId =
        params.gradingSystemId || component.gradingSystemId;

      const assessmentStructureId =
        params.assessmentStructureId || component.assessmentStructureId;

      // ======================================================
      // STRUCTURE + RULES
      // ======================================================

      const structureItems = items.filter(
        (i) =>
          i.assessmentStructureId === assessmentStructureId &&
          i.active &&
          !i.isDeleted
      );

      const rules = gradeRules
        .filter(
          (r) =>
            r.gradingSystemId === gradingSystemId &&
            r.active &&
            !r.isDeleted
        )
        .sort((a, b) => b.maxScore - a.maxScore);

      // ======================================================
      // FILTER STUDENTS (NO SHADOWING BUG FIXED)
      // ======================================================

      const students = allStudents.filter(
        (s) =>
          s.branchId === params.branchId &&
          s.currentClassId === params.classId &&
          !s.isDeleted
      );

      // ======================================================
      // RESULT BUFFER
      // ======================================================

      const results: any[] = [];

      // ======================================================
      // MAIN LOOP
      // ======================================================

      for (const student of students) {
        const studentEntries = entries.filter(
          (e) =>
            e.studentId === student.id &&
            e.subjectId === params.subjectId &&
            e.academicPeriodId === params.academicPeriodId &&
            !e.isDeleted
        );

        // ======================================================
        // BREAKDOWN COMPUTATION
        // ======================================================

        const breakdown = structureItems.map((item) => {
          const entry = studentEntries.find(
            (e) => e.assessmentStructureItemId === item.id
          );

          const score = Number(entry?.score ?? 0);

          const normalized = item.maxScore
            ? score / item.maxScore
            : 0;

          const weightedScore =
            normalized * Number(item.weight ?? 0);

          return {
            itemId: item.id!,
            score,
            weight: item.weight,
            weightedScore: Number(weightedScore.toFixed(2)),
          };
        });

        // ======================================================
        // TOTALS (FIXED SEMANTIC ERROR)
        // ======================================================

        const total = breakdown.reduce(
          (sum, b) => sum + b.weightedScore,
          0
        );

        const totalWeight = structureItems.reduce(
          (sum, i) => sum + Number(i.weight ?? 0),
          0
        );

        const percentage =
          totalWeight > 0 ? (total / totalWeight) * 100 : 0;

        // ======================================================
        // GRADE RESOLUTION
        // ======================================================

        const gradeRule = rules.find(
          (r) =>
            percentage >= r.minScore &&
            percentage <= r.maxScore
        );

        // ======================================================
        // EXISTING RESULT LOOKUP
        // ======================================================

        const existing = existingResults.find(
          (r) =>
            r.studentId === student.id &&
            r.subjectId === params.subjectId &&
            r.academicPeriodId === params.academicPeriodId &&
            !r.isDeleted
        );

        // ======================================================
        // PAYLOAD (NORMALIZED SINGLE SOURCE)
        // ======================================================

        const payload = {
          branchId: params.branchId,
          organizationId: params.organizationId,

          academicStructureId: params.academicStructureId,
          academicPeriodId: params.academicPeriodId,

          gradingSystemId,

          studentId: student.id!,
          classId: params.classId,
          subjectId: params.subjectId,

          total,
          average: total,
          percentage,

          grade: gradeRule?.grade || "F",
          remark: gradeRule?.remark || "",
          gpa: gradeRule?.gpa || 0,

          position: 0,

          published: params.publish ?? false,
          locked: params.lock ?? false,
        };

        // ======================================================
        // UPDATE / INSERT
        // ======================================================

        if (existing && params.overwrite && !existing.locked) {
          await db.computedResults.update(existing.id!, {
            ...payload,
            updatedAt: Date.now(),
          });
        }

        if (!existing) {
          await db.computedResults.add(
            prepareSyncData(payload)
          );
        }

        // ======================================================
        // RESPONSE
        // ======================================================

        results.push({
          student,
          ...payload,
          entries: breakdown,
        });
      }

      // ======================================================
      // RESPONSE
      // ======================================================

      return {
        success: true,
        computed: results.length,
        failed: 0,
        results,
      };
    } catch (error: any) {
      return {
        success: false,
        computed: 0,
        failed: 1,
        results: [],
        message: error?.message || "Unknown error",
      };
    }
  }
}