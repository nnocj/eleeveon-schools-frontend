/**
 * app/lib/excel/students/studentExcelImporter.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — STUDENT OFFLINE-FIRST IMPORTER
 * --------------------------------------------------------------------------
 *
 * Responsibilities:
 * - execute an already parsed + validated student import;
 * - create students using createLocal();
 * - optionally update matching students;
 * - optionally create StudentEnrollment;
 * - update Student.currentClassId when appropriate;
 * - preserve Eleeveon's normal offline-first sync path.
 *
 * IMPORTANT:
 * This importer DOES NOT call the backend directly.
 */

import {
  db,
  type Student,
  type StudentEnrollment,
} from "../../db/db";

import {
  createLocal,
  updateLocal,
} from "../../sync/syncUtils";

import type {
  ExcelValidationIssue,
} from "../excelTypes";

import type {
  StudentExcelClassOption,
  StudentExcelExistingEnrollment,
  StudentExcelExistingStudent,
  StudentExcelImportContext,
  StudentExcelImportOptions,
  StudentExcelImportResult,
  StudentExcelImportRowResult,
  StudentExcelPreparedRow,
  StudentExcelValidationResult,
} from "./studentExcelTypes";

function idOf(value: unknown) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const id =
    String(value).trim();

  if (
    !id ||
    id === "0" ||
    id === "null" ||
    id === "undefined"
  ) {
    return "";
  }

  return id;
}

function todayISO() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return !!value &&
    typeof value === "object";
}

/**
 * createLocal() has historically returned slightly different shapes
 * across Eleeveon modules, so student import resolves all supported forms.
 */
function createdId(value: unknown) {
  const direct = idOf(value);

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return direct;
  }

  if (!isObject(value)) {
    return "";
  }

  return (
    idOf(value.id) ||
    idOf(value.localId) ||
    idOf(value.cloudId)
  );
}

function clean(
  value: unknown,
) {
  return String(
    value ?? "",
  ).trim();
}

function sameId(
  a: unknown,
  b: unknown,
) {
  return (
    idOf(a) === idOf(b)
  );
}

function errorIssue(
  rowNumber: number,
  message: string,
): ExcelValidationIssue {
  return {
    code: "student.import_failed",
    message,
    severity: "error",
    rowNumber,
  };
}

async function resolveStudentAfterCreate(
  returnedValue: unknown,
  args: {
    accountId: string;
    schoolId: string;
    branchId: string;
    admissionNumber?: string;
    fullName: string;
  },
) {
  const returnedId =
    createdId(returnedValue);

  if (returnedId) {
    return returnedId;
  }

  const rows =
    await db.students.toArray();

  const admissionNumber =
    clean(
      args.admissionNumber,
    ).toLowerCase();

  const fullName =
    clean(
      args.fullName,
    ).toLowerCase();

  const match = rows
    .filter(
      (row: any) =>
        !row.isDeleted &&
        sameId(
          row.accountId,
          args.accountId,
        ) &&
        sameId(
          row.schoolId,
          args.schoolId,
        ) &&
        sameId(
          row.branchId,
          args.branchId,
        ),
    )
    .find((row: any) => {
      if (
        admissionNumber &&
        clean(
          row.admissionNumber,
        ).toLowerCase() ===
          admissionNumber
      ) {
        return true;
      }

      return (
        fullName &&
        clean(
          row.fullName,
        ).toLowerCase() ===
          fullName
      );
    });

  return idOf(
    (match as any)?.id,
  );
}

function buildStudentPayload(
  row: StudentExcelPreparedRow,
  context: StudentExcelImportContext,
  classId?: string,
): Partial<Student> {
  const record = row.data;

  return {
    accountId:
      context.accountId,

    schoolId:
      context.schoolId,

    branchId:
      context.branchId,

    ...(context.organizationId
      ? {
          organizationId:
            context.organizationId,
        }
      : {}),

    fullName:
      record.fullName,

    admissionNumber:
      record.admissionNumber,

    gender:
      record.gender as any,

    age:
      record.age as any,

    dateOfBirth:
      record.dateOfBirth as any,

    parentName:
      record.parentName,

    parentPhone:
      record.parentPhone,

    parentEmail:
      record.parentEmail,

    address:
      record.address,

    currentClassId:
      classId || undefined,

    status:
      (record.status ||
        "active") as any,

    active: true,

    isDeleted: false,
  } as Partial<Student>;
}

async function loadExistingEnrollments(
  context: StudentExcelImportContext,
): Promise<
  StudentExcelExistingEnrollment[]
> {
  const rows =
    await db.studentEnrollments.toArray();

  return rows
    .filter(
      (row: any) =>
        !row.isDeleted &&
        sameId(
          row.accountId,
          context.accountId,
        ) &&
        sameId(
          row.schoolId,
          context.schoolId,
        ) &&
        sameId(
          row.branchId,
          context.branchId,
        ),
    )
    .map((row: any) => ({
      id: idOf(row.id),

      studentId:
        idOf(row.studentId),

      classId:
        idOf(row.classId),

      academicStructureId:
        idOf(
          row.academicStructureId,
        ),

      academicPeriodId:
        idOf(
          row.academicPeriodId,
        ),

      status:
        row.status,

      isDeleted:
        row.isDeleted,
    }));
}

function enrollmentExists(
  rows: StudentExcelExistingEnrollment[],
  args: {
    studentId: string;
    classId: string;
    academicStructureId: string;
    academicPeriodId: string;
  },
) {
  return rows.some(
    (row) =>
      !row.isDeleted &&
      sameId(
        row.studentId,
        args.studentId,
      ) &&
      sameId(
        row.classId,
        args.classId,
      ) &&
      sameId(
        row.academicStructureId,
        args.academicStructureId,
      ) &&
      sameId(
        row.academicPeriodId,
        args.academicPeriodId,
      ) &&
      String(
        row.status ||
          "active",
      ).toLowerCase() ===
        "active",
  );
}

async function ensureEnrollment(args: {
  studentId: string;
  classId?: string;

  context: StudentExcelImportContext;

  existingEnrollments: StudentExcelExistingEnrollment[];
}) {
  const {
    studentId,
    classId,
    context,
    existingEnrollments,
  } = args;

  if (
    !studentId ||
    !classId ||
    !context.academicStructureId ||
    !context.academicPeriodId
  ) {
    return false;
  }

  if (
    enrollmentExists(
      existingEnrollments,
      {
        studentId,
        classId,

        academicStructureId:
          context.academicStructureId,

        academicPeriodId:
          context.academicPeriodId,
      },
    )
  ) {
    return false;
  }

  const payload: Partial<StudentEnrollment> =
    {
      accountId:
        context.accountId,

      schoolId:
        context.schoolId,

      branchId:
        context.branchId,

      studentId,

      classId,

      academicStructureId:
        context.academicStructureId,

      academicPeriodId:
        context.academicPeriodId,

      startDate:
        context.enrollmentStartDate ||
        todayISO(),

      status: "active",

      isDeleted: false,
    } as Partial<StudentEnrollment>;

  const result =
    await createLocal(
      "studentEnrollments",
      payload as StudentEnrollment,
    );

  const enrollmentId =
    createdId(result);

  existingEnrollments.push({
    id:
      enrollmentId ||
      `pending:${studentId}:${classId}`,

    studentId,
    classId,

    academicStructureId:
      context.academicStructureId,

    academicPeriodId:
      context.academicPeriodId,

    status: "active",

    isDeleted: false,
  });

  return true;
}

export async function getStudentExcelImportReferenceData(
  context: StudentExcelImportContext,
): Promise<{
  students: StudentExcelExistingStudent[];
  classes: StudentExcelClassOption[];
}> {
  const [
    studentRows,
    classRows,
  ] = await Promise.all([
    db.students.toArray(),
    db.classes.toArray(),
  ]);

  const students =
    studentRows
      .filter(
        (row: any) =>
          !row.isDeleted &&
          sameId(
            row.accountId,
            context.accountId,
          ) &&
          sameId(
            row.schoolId,
            context.schoolId,
          ) &&
          sameId(
            row.branchId,
            context.branchId,
          ),
      )
      .map((row: any) => ({
        id: idOf(row.id),

        fullName:
          row.fullName,

        admissionNumber:
          row.admissionNumber,

        schoolId:
          idOf(row.schoolId),

        branchId:
          idOf(row.branchId),

        currentClassId:
          idOf(
            row.currentClassId,
          ),

        active:
          row.active,

        isDeleted:
          row.isDeleted,

        status:
          row.status,
      }));

  const classes =
    classRows
      .filter(
        (row: any) =>
          !row.isDeleted &&
          row.active !== false &&
          sameId(
            row.accountId,
            context.accountId,
          ) &&
          sameId(
            row.schoolId,
            context.schoolId,
          ) &&
          sameId(
            row.branchId,
            context.branchId,
          ),
      )
      .map((row: any) => ({
        id: idOf(row.id),

        name:
          String(
            row.name || "",
          ),

        code:
          row.code
            ? String(row.code)
            : undefined,

        active:
          row.active,

        isDeleted:
          row.isDeleted,
      }));

  return {
    students,
    classes,
  };
}

export async function importValidatedStudents(
  validation: StudentExcelValidationResult,
  context: StudentExcelImportContext,
  options: StudentExcelImportOptions = {},
): Promise<StudentExcelImportResult> {
  const duplicateStrategy =
    options.duplicateStrategy ||
    "skip";

  const createEnrollment =
    options.createEnrollment !==
    false;

  const updateCurrentClass =
    options.updateCurrentClass !==
    false;

  const existingEnrollments =
    createEnrollment
      ? await loadExistingEnrollments(
          context,
        )
      : [];

  const results:
    StudentExcelImportRowResult[] = [];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let enrollmentsCreated = 0;

  for (const row of validation.rows) {
    if (!row.valid) {
      skipped += 1;

      results.push({
        rowNumber:
          row.rowNumber,

        action: "skipped",

        fullName:
          row.data.fullName,

        admissionNumber:
          row.data
            .admissionNumber,

        issues:
          row.issues,
      });

      continue;
    }

    try {
      const resolvedClassId =
        row.classResolution
          ?.resolved
          ? row.classResolution
              .classId
          : context.classId;

      const existing =
        row.duplicate?.matched
          ? row.duplicate.student
          : undefined;

      if (
        existing &&
        duplicateStrategy ===
          "skip"
      ) {
        skipped += 1;

        results.push({
          rowNumber:
            row.rowNumber,

          action:
            "skipped",

          studentId:
            existing.id,

          fullName:
            row.data.fullName,

          admissionNumber:
            row.data
              .admissionNumber,

          issues:
            row.issues,
        });

        continue;
      }

      let studentId = "";

      let action:
        | "created"
        | "updated";

      if (
        existing &&
        duplicateStrategy ===
          "update"
      ) {
        studentId =
          idOf(existing.id);

        const payload =
          buildStudentPayload(
            row,
            context,
            updateCurrentClass
              ? resolvedClassId
              : existing.currentClassId,
          );

        await updateLocal(
          "students",
          studentId,
          payload,
        );

        updated += 1;

        action =
          "updated";
      } else {
        const payload =
          buildStudentPayload(
            row,
            context,
            updateCurrentClass
              ? resolvedClassId
              : undefined,
          );

        const createResult =
          await createLocal(
            "students",
            payload as Student,
          );

        studentId =
          await resolveStudentAfterCreate(
            createResult,
            {
              accountId:
                context.accountId,

              schoolId:
                context.schoolId,

              branchId:
                context.branchId,

              admissionNumber:
                row.data
                  .admissionNumber,

              fullName:
                row.data.fullName,
            },
          );

        if (!studentId) {
          throw new Error(
            `Student "${row.data.fullName}" was created locally but its local ID could not be resolved.`,
          );
        }

        created += 1;

        action =
          "created";
      }

      let enrollmentCreated =
        false;

      if (
        createEnrollment &&
        resolvedClassId
      ) {
        enrollmentCreated =
          await ensureEnrollment({
            studentId,
            classId:
              resolvedClassId,
            context,
            existingEnrollments,
          });

        if (
          enrollmentCreated
        ) {
          enrollmentsCreated += 1;
        }
      }

      /**
       * If the Student was updated/created without the class in the
       * original payload but enrollment resolved a class, keep
       * currentClassId synchronized.
       */
      if (
        updateCurrentClass &&
        resolvedClassId
      ) {
        await updateLocal(
          "students",
          studentId,
          {
            currentClassId:
              resolvedClassId,
          } as Partial<Student>,
        );
      }

      results.push({
        rowNumber:
          row.rowNumber,

        action,

        studentId,

        fullName:
          row.data.fullName,

        admissionNumber:
          row.data
            .admissionNumber,

        enrollmentCreated,

        issues:
          row.issues,
      });
    } catch (error) {
      failed += 1;

      const message =
        error instanceof Error
          ? error.message
          : "Failed to import student.";

      results.push({
        rowNumber:
          row.rowNumber,

        action:
          "failed",

        fullName:
          row.data.fullName,

        admissionNumber:
          row.data
            .admissionNumber,

        issues: [
          ...row.issues,
          errorIssue(
            row.rowNumber,
            message,
          ),
        ],

        error:
          message,
      });
    }
  }

  return {
    totalRows:
      validation.rows.length,

    created,
    updated,
    skipped,
    failed,

    enrollmentsCreated,

    rows: results,
  };
}