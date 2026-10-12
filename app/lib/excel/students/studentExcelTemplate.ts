/**
 * app/lib/excel/students/studentExcelTemplate.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — STUDENT TEMPLATE
 * --------------------------------------------------------------------------
 *
 * Builds a human-friendly student spreadsheet template.
 *
 * The template is intentionally simple:
 * - schools can fill it directly;
 * - it matches the student import aliases;
 * - no internal database IDs are exposed;
 * - class is represented using a readable class name/code.
 */

import type {
  ExcelExportWorkbook,
} from "../excelTypes";

import {
  downloadExcelWorkbook,
} from "../excelWorkbook";

export interface StudentExcelTemplateOptions {
  fileName?: string;

  schoolName?: string;
  branchName?: string;

  academicStructureName?: string;
  academicPeriodName?: string;

  className?: string;

  /**
   * Include class columns when the sheet may contain multiple classes.
   */
  includeClassColumns?: boolean;

  /**
   * Include a sample student row.
   */
  includeExampleRow?: boolean;
}

type StudentTemplateRow = {
  fullName: string;
  admissionNumber: string;
  gender: string;
  dateOfBirth: string;
  age: string;

  parentName: string;
  parentPhone: string;
  parentEmail: string;

  address: string;

  className: string;
  classCode: string;

  status: string;
};

function safeFilePart(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export function buildStudentExcelTemplate(
  options: StudentExcelTemplateOptions = {},
): ExcelExportWorkbook {
  const {
    schoolName,
    branchName,
    academicStructureName,
    academicPeriodName,
    className,
    includeClassColumns = true,
    includeExampleRow = true,
  } = options;

  const preambleRows: Array<
    Array<string | number | boolean | Date | null | undefined>
  > = [
    ["ELEEVEON STUDENT IMPORT TEMPLATE"],
  ];

  if (schoolName) {
    preambleRows.push(["School", schoolName]);
  }

  if (branchName) {
    preambleRows.push(["Branch", branchName]);
  }

  if (academicStructureName) {
    preambleRows.push([
      "Academic Structure",
      academicStructureName,
    ]);
  }

  if (academicPeriodName) {
    preambleRows.push([
      "Academic Period",
      academicPeriodName,
    ]);
  }

  if (className) {
    preambleRows.push(["Selected Class", className]);
  }

  preambleRows.push([
    "Instructions",
    "Keep the first header row unchanged where possible. Student Name is required. Admission Number is strongly recommended.",
  ]);

  const columns = [
    {
      key: "fullName",
      header: "Student Name",
      width: 28,
    },
    {
      key: "admissionNumber",
      header: "Admission Number",
      width: 18,
    },
    {
      key: "gender",
      header: "Gender",
      width: 12,
    },
    {
      key: "dateOfBirth",
      header: "Date of Birth",
      width: 16,
    },
    {
      key: "age",
      header: "Age",
      width: 10,
    },
    {
      key: "parentName",
      header: "Parent / Guardian Name",
      width: 26,
    },
    {
      key: "parentPhone",
      header: "Parent Phone",
      width: 18,
    },
    {
      key: "parentEmail",
      header: "Parent Email",
      width: 28,
    },
    {
      key: "address",
      header: "Address",
      width: 30,
    },
    ...(includeClassColumns
      ? [
          {
            key: "className",
            header: "Class",
            width: 18,
          },
          {
            key: "classCode",
            header: "Class Code",
            width: 14,
          },
        ]
      : []),
    {
      key: "status",
      header: "Status",
      width: 12,
    },
  ];

  const rows: StudentTemplateRow[] = includeExampleRow
    ? [
        {
          fullName: "Ama Mensah",
          admissionNumber: "ST001",
          gender: "Female",
          dateOfBirth: "2012-05-14",
          age: "",
          parentName: "Akosua Mensah",
          parentPhone: "0240000000",
          parentEmail: "",
          address: "Dansoman, Accra",
          className:
            includeClassColumns && !className
              ? "JHS 1A"
              : "",
          classCode: "",
          status: "active",
        },
      ]
    : [];

  const fileBase = [
    "Eleeveon Students",
    schoolName,
    branchName,
    className,
  ]
    .map(safeFilePart)
    .filter(Boolean)
    .join(" - ");

  return {
    fileName:
      options.fileName ||
      `${fileBase || "Eleeveon Students"}.xlsx`,

    sheets: [
      {
        name: "Students",
        preambleRows,
        preambleSpacing: 1,
        freezeHeader: true,
        columns,
        rows,
      },
    ],
  };
}

export async function downloadStudentExcelTemplate(
  options: StudentExcelTemplateOptions = {},
) {
  const workbook = buildStudentExcelTemplate(options);

  return await Promise.resolve(
    downloadExcelWorkbook(workbook),
  );
}