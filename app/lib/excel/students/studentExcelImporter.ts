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

import { resolveAdmissionNumber } from "../../students/admissionNumbers";

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
    idOf(value.localId)
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

/** Never infer a permanent student UUID from a name or admission number. */
async function resolveStudentAfterCreate(
  returnedValue: unknown,
  _args: {
    accountId: string;
    schoolId: string;
    branchId: string;
    admissionNumber?: string;
    fullName: string;
  },
) {
  const id = createdId(returnedValue);
  if (!id || !(await db.students.get(id))) {
    throw new Error(
      "Student was saved but createLocal did not return a verifiable permanent UUID. " +
      "Review the student locally before retrying; do not import the same row again blindly.",
    );
  }
  return id;
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

/** Re-check live Dexie state; a preview can become stale before confirmation. */
async function findCurrentAdmissionOwner(
  context: StudentExcelImportContext,
  number: string,
  excludingId?: string,
): Promise<Student | undefined> {
  const key = number.trim().toUpperCase();
  if (!key) return undefined;
  const students = await db.students.where("branchId").equals(context.branchId).toArray();
  return students.find((student) =>
    !student.isDeleted &&
    student.accountId === context.accountId &&
    student.schoolId === context.schoolId &&
    student.id !== excludingId &&
    String(student.admissionNumber || "").trim().toUpperCase() === key,
  );
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

      if (existing && row.duplicate?.reason === "name" && duplicateStrategy === "update") {
        throw new Error(
          "An exact name match is not enough to update a student. " +
          "Use a matching admission number or resolve this row manually."
        );
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

        const current = await db.students.get(studentId);
        if (!current || current.isDeleted || current.accountId !== context.accountId ||
            current.schoolId !== context.schoolId || current.branchId !== context.branchId) {
          throw new Error("Student changed or is outside the selected workspace.");
        }
        // An import must never silently replace an established admission identity.
        const incomingNumber = String(row.data.admissionNumber || "").trim();
        const established = String(current.admissionNumber || "").trim();
        if (incomingNumber && established &&
            incomingNumber.toUpperCase() !== established.toUpperCase()) {
          throw new Error("The imported admission number differs from the student's existing number.");
        }
        if (incomingNumber && await findCurrentAdmissionOwner(context, incomingNumber, studentId)) {
          throw new Error("Admission number already belongs to another student.");
        }
        if (!incomingNumber) delete payload.admissionNumber;
        if (established) payload.admissionNumber = established;
        // An existing server-confirmed identity remains confirmed.
        delete payload.admissionNumberConfirmed;
        delete payload.admissionNumberProvisional;
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

        // Resolve automatic/manual/hybrid numbering exactly like the student form.
        // Automatic values are provisional until /sync/push confirms them.
        const admission = await resolveAdmissionNumber({
          accountId: context.accountId,
          schoolId: context.schoolId,
          branchId: context.branchId,
          supplied: row.data.admissionNumber,
        });
        payload.admissionNumber = admission.admissionNumber;
        payload.admissionNumberProvisional = admission.provisional;
        payload.admissionNumberConfirmed = false;
        if (admission.admissionNumber &&
            await findCurrentAdmissionOwner(context, admission.admissionNumber)) {
          throw new Error("Admission number already belongs to another student.");
        }

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
        const savedStudent = await db.students.get(studentId);
        if (savedStudent?.currentClassId !== resolvedClassId) {
          await updateLocal(
            "students",
            studentId,
            { currentClassId: resolvedClassId } as Partial<Student>,
          );
        }
      }

      results.push({
        rowNumber:
          row.rowNumber,

        action,

        studentId,

        fullName:
          row.data.fullName,

        admissionNumber:
          (await db.students.get(studentId))?.admissionNumber,

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
