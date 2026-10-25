"use client";

/**
 * app/branch-admin/modules/IdentityCredentials.tsx
 * --------------------------------------------------------------------------
 * ELEEVEON IDENTITY CREDENTIALS — PHASE 10
 *
 * Smart credential workflow:
 * - choose a subject type;
 * - search/filter real branch people;
 * - save the selected record's existing UUID as subjectId;
 * - use the shared identity credential library for issuance and lifecycle;
 * - show readable subject names instead of raw UUIDs.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  db,
  type Class,
  type IdentityCredential,
  type IdentityCredentialDesignSetting,
  type IdentityCredentialEvent,
  type IdentityCredentialStatus,
  type IdentityCredentialType,
  type IdentitySubjectType,
  type Organization,
  type Parent,
  type Student,
  type StudentEnrollment,
  type StudentParent,
  type Teacher,
  type VisitorProfile,
} from "../../lib/db/db";

import {SyncStatus } from "../../lib/constants/syncStatus";

import {
  activateCredential,
  issueCredential,
  expireCredential,
  reactivateCredential,
  revokeCredential,
  suspendCredential,
} from "../../lib/identity/credential";

import { getDeviceId } from "../../lib/sync/syncConfig";
import { softDeleteLocal } from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useEntityMediaUrls } from "../../hooks/useEntityMediaUrls";
import { PermissionGate } from "../../components/shared/PermissionGate";

import {
  CredentialCard,
  CredentialDetailsSheet,
  type CredentialAction,
} from "../../components/identity/credentials";

import {
  IdentitySubjectPicker,
} from "../../components/identity/shared";

import type {
  IdentitySubjectOption,
} from "../../components/identity/types";

import IdentityCredentialPreview from "./identity/IdentityCredentialPreview";
import { useIdentityCardPresentation, chooseIdentityCardDesign } from "./identity/identityCardPresentation";
import IdentityCredentialPrintSheet, {
  type PrintableCredential,
} from "./identity/IdentityCredentialPrintSheet";

type ViewMode = "cards" | "table" | "analytics";
type ToastTone = "success" | "error" | "info";
type StatusFilter =
  | "all"
  | IdentityCredentialStatus;

type WorkspaceSession = {
  membership?: Record<string, unknown> | null;
  schoolId?: string | null;
  branchId?: string | null;
};

type SubjectTypeFilter =
  | "all"
  | IdentitySubjectType;

type CredentialFormState = {
  subjectType: IdentitySubjectType;
  subjectId: string;
  credentialType: IdentityCredentialType;
  status: IdentityCredentialStatus;
  label: string;
  serialNumber: string;
  validFrom: string;
  expiresAt: string;
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

const SUBJECT_TYPES: IdentitySubjectType[] = [
  "student",
  "teacher",
  "staff",
  "parent",
  "guardian",
  "visitor",
];

const CREDENTIAL_TYPES: IdentityCredentialType[] = [
  "qr_code",
  "nfc_card",
  "rfid_card",
  "fingerprint",
  "face_profile",
  "student_id",
  "staff_id",
  "parent_pass",
  "visitor_pass",
  "mobile_pass",
];

const SERIAL_NUMBER_TYPES = new Set<IdentityCredentialType>([
  "nfc_card",
  "rfid_card",
]);

const GENERATED_REFERENCE_TYPES = new Set<IdentityCredentialType>([
  "qr_code",
  "student_id",
  "staff_id",
  "parent_pass",
  "visitor_pass",
  "mobile_pass",
]);

const STATUS_OPTIONS: IdentityCredentialStatus[] = [
  "pending",
  "active",
  "suspended",
  "expired",
  "revoked",
  "replaced",
];

const idOf = (value: unknown) =>
  value === undefined || value === null
    ? ""
    : String(value).trim();

const sameId = (a: unknown, b: unknown) =>
  idOf(a) === idOf(b);

const lower = (value: unknown) =>
  String(value || "").trim().toLowerCase();

const humanize = (value: unknown) => {
  const text = String(value || "").trim();

  if (!text) return "Not set";

  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

function storageValue(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return (
      window.localStorage.getItem(key) ||
      window.sessionStorage.getItem(key)
    );
  } catch {
    return null;
  }
}

function storedJson<T>(key: string): T | null {
  const raw = storageValue(key);

  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function firstId(...values: unknown[]) {
  for (const value of values) {
    const id = idOf(value);

    if (id && id !== "0") return id;
  }

  return "";
}

function formatDate(value?: number | string | null) {
  if (!value) return "Not recorded";

  const parsed =
    typeof value === "number"
      ? value
      : new Date(value).getTime();

  if (!Number.isFinite(parsed)) return "Not recorded";

  return new Intl.DateTimeFormat("en-GH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function inputDate(value?: number | string | null) {
  if (!value) return "";

  const date = new Date(
    typeof value === "number" ? value : value,
  );

  if (Number.isNaN(date.getTime())) return "";

  const pad = (number: number) =>
    String(number).padStart(2, "0");

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

function toTimestamp(value: string) {
  if (!value) return null;

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : null;
}

function defaultForm(): CredentialFormState {
  return {
    subjectType: "student",
    subjectId: "",
    credentialType: "qr_code",
    status: "pending",
    label: "",
    serialNumber: "",
    validFrom: inputDate(Date.now()),
    expiresAt: "",
  };
}

function safeRecordMediaValue(value?: string | null) {
  const media = String(value || "").trim();

  if (!media) return undefined;
  if (media.startsWith("blob:")) return undefined;
  if (media.startsWith("data:image/")) return undefined;

  return media;
}

function isActiveRecord(row: {
  active?: boolean;
  status?: string;
  isDeleted?: boolean;
}) {
  if (row.isDeleted || row.active === false) return false;

  return ![
    "inactive",
    "graduated",
    "transferred",
    "withdrawn",
    "blocked",
    "deleted",
  ].includes(lower(row.status));
}

export default function IdentityCredentials() {
  const router = useRouter();
  const revision = useDataRevision();
  const { loading, setLoading } = useBackgroundLoader();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const {
    settings,
    loading: settingsLoading,
  } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const { activeMembership } = useActiveMembership();

  const openWorkspace = useMemo(
    () => storedJson<WorkspaceSession>(OPEN_WORKSPACE_KEY),
    [],
  );

  const storedMembership = useMemo(
    () =>
      storedJson<Record<string, unknown>>(
        "activeMembership",
      ),
    [],
  );

  const membership = (
    openWorkspace?.membership ||
    activeMembership ||
    storedMembership ||
    {}
  ) as Record<string, unknown>;

  const schoolId = firstId(
    activeSchoolId,
    (activeSchool as { id?: unknown } | null)?.id,
    (settings as { schoolId?: unknown } | null)?.schoolId,
    openWorkspace?.schoolId,
    membership.schoolId,
    (membership.school as { id?: unknown } | undefined)?.id,
    storageValue("activeSchoolId"),
  );

  const branchId = firstId(
    activeBranchId,
    (activeBranch as { id?: unknown } | null)?.id,
    (settings as { branchId?: unknown } | null)?.branchId,
    openWorkspace?.branchId,
    membership.branchId,
    membership.schoolBranchId,
    (membership.branch as { id?: unknown } | undefined)?.id,
    storageValue("activeBranchId"),
  );

  const userId = firstId(
    membership.userId,
    membership.appUserId,
    membership.memberId,
  );

  // useAccount().accountId is typed as string | null.
  // Resolve it once so identity mutation helpers receive the required string.
  const resolvedAccountId = firstId(accountId);

  const primary =
    settings?.primaryColor ||
    "var(--primary-color, #2563eb)";

  const permissionValues = useMemo(() => {
    const raw = membership.permissions;

    if (Array.isArray(raw)) {
      return raw.map(String);
    }

    if (raw && typeof raw === "object") {
      return Object.entries(raw)
        .filter(([, allowed]) => Boolean(allowed))
        .map(([permission]) => permission);
    }

    return [];
  }, [membership.permissions]);

  const role = lower(membership.role);

  const roleCanManage = [
    "owner",
    "super_admin",
    "admin",
    "branch_admin",
  ].includes(role);

  const roleCanView =
    roleCanManage ||
    ["teacher", "accountant"].includes(role);

  const canView =
    roleCanView ||
    permissionValues.some((permission) =>
      [
        "identity.view",
        "identity.read",
        "identity.manage",
        "identity_credentials.view",
        "identity_credentials.read",
        "identity_credentials.manage",
        "credential.read",
      ].includes(permission),
    );

  const canEdit =
    roleCanManage ||
    permissionValues.some((permission) =>
      [
        "identity.manage",
        "identity_credentials.manage",
        "identity_credentials.write",
        "credential.issue",
      ].includes(permission),
    );

  const [credentials, setCredentials] = useState<
    IdentityCredential[]
  >([]);

  const [events, setEvents] = useState<
    IdentityCredentialEvent[]
  >([]);

  const [credentialDesigns, setCredentialDesigns] = useState<
    IdentityCredentialDesignSetting[]
  >([]);

  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [studentParents, setStudentParents] = useState<
    StudentParent[]
  >([]);
  const [visitors, setVisitors] = useState<
    VisitorProfile[]
  >([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [organizations, setOrganizations] = useState<
    Organization[]
  >([]);
  const [enrollments, setEnrollments] = useState<
    StudentEnrollment[]
  >([]);

  const resolvedStudentMediaById = useEntityMediaUrls({
    accountId,
    ownerTable: "students",
    rows: students,
    fields: [
      { fieldKey: "photo", mediaIdKey: "photoMediaId" },
      { fieldKey: "coverPhoto", mediaIdKey: "coverPhotoMediaId" },
    ],
  });

  const resolvedTeacherMediaById = useEntityMediaUrls({
    accountId,
    ownerTable: "teachers",
    rows: teachers,
    fields: [
      { fieldKey: "photo", mediaIdKey: "photoMediaId" },
      { fieldKey: "coverPhoto", mediaIdKey: "coverPhotoMediaId" },
    ],
  });

  const resolvedParentMediaById = useEntityMediaUrls({
    accountId,
    ownerTable: "parents",
    rows: parents,
    fields: [
      { fieldKey: "photo", mediaIdKey: "photoMediaId" },
      { fieldKey: "coverPhoto", mediaIdKey: "coverPhotoMediaId" },
    ],
  });

  const [viewMode, setViewMode] =
    useState<ViewMode>("cards");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");
  const [subjectTypeFilter, setSubjectTypeFilter] =
    useState<SubjectTypeFilter>("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printSelection, setPrintSelection] = useState<
    "selected" | "filtered"
  >("selected");

  const [selectedCredential, setSelectedCredential] =
    useState<IdentityCredential | null>(null);

  const [editingCredential, setEditingCredential] =
    useState<IdentityCredential | null>(null);

  const [form, setForm] =
    useState<CredentialFormState>(defaultForm());

  const [subjectSearchType, setSubjectSearchType] =
    useState<IdentitySubjectType>("student");

  const [studentClassFilter, setStudentClassFilter] =
    useState("all");

  const [organizationFilter, setOrganizationFilter] =
    useState("all");

  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  const sameTenant = (row: {
    accountId?: string | null;
    schoolId?: string | null;
    branchId?: string | null;
    isDeleted?: boolean;
  }) =>
    (!row.accountId || sameId(row.accountId, accountId)) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const notify = (
    tone: ToastTone,
    message: string,
  ) => {
    setToast({ tone, message });

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        setToast((current) =>
          current?.message === message ? null : current,
        );
      }, 4200);
    }
  };

  const clearData = () => {
    setCredentials([]);
    setEvents([]);
    setCredentialDesigns([]);
    setStudents([]);
    setTeachers([]);
    setParents([]);
    setStudentParents([]);
    setVisitors([]);
    setClasses([]);
    setOrganizations([]);
    setEnrollments([]);
  };

  const load = async () => {
    if (
      !authenticated ||
      !accountId ||
      !schoolId ||
      !branchId ||
      !canView
    ) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        credentialRows,
        eventRows,
        designRows,
        studentRows,
        teacherRows,
        parentRows,
        studentParentRows,
        visitorRows,
        classRows,
        organizationRows,
        enrollmentRows,
      ] = await Promise.all([
        db.identityCredentials.toArray(),
        db.identityCredentialEvents.toArray(),
        db.identityCredentialDesignSettings.toArray(),
        db.students.toArray(),
        db.teachers.toArray(),
        db.parents.toArray(),
        db.studentParents.toArray(),
        db.visitorProfiles.toArray(),
        db.classes.toArray(),
        db.organizations.toArray(),
        db.studentEnrollments.toArray(),
      ]);

      setCredentials(
        credentialRows
          .filter((row) => sameTenant(row))
          .sort(
            (a, b) =>
              Number(b.updatedAt || 0) -
              Number(a.updatedAt || 0),
          ),
      );

      setEvents(
        eventRows
          .filter((row) => sameTenant(row))
          .sort(
            (a, b) =>
              Number(b.occurredAt || 0) -
              Number(a.occurredAt || 0),
          ),
      );

      setCredentialDesigns(
        designRows
          .filter((row) => sameTenant(row))
          .filter((row) => row.active !== false)
          .sort(
            (a, b) =>
              Number(Boolean(b.isDefault)) -
                Number(Boolean(a.isDefault)) ||
              Number(b.updatedAt || 0) -
                Number(a.updatedAt || 0),
          ),
      );

      setStudents(
        studentRows.filter((row) => sameTenant(row)),
      );

      setTeachers(
        teacherRows.filter((row) => sameTenant(row)),
      );

      setParents(
        parentRows.filter((row) => sameTenant(row)),
      );

      setStudentParents(
        studentParentRows.filter((row) => sameTenant(row)),
      );

      setVisitors(
        visitorRows.filter((row) => sameTenant(row)),
      );

      setClasses(
        classRows.filter((row) => sameTenant(row)),
      );

      setOrganizations(
        organizationRows.filter((row) => sameTenant(row)),
      );

      setEnrollments(
        enrollmentRows.filter((row) => sameTenant(row)),
      );
    } catch (error) {
      console.error(
        "Failed to load Identity Credentials:",
        error,
      );

      clearData();
      notify(
        "error",
        "Failed to load identity credentials.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
    } else if (!schoolId || !branchId) {
      router.replace("/account");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    schoolId,
    branchId,
    router,
  ]);

  useEffect(() => {
    if (
      accountLoading ||
      settingsLoading ||
      contextLoading
    ) {
      return;
    }

    void load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    settingsLoading,
    contextLoading,
    revision,
    canView,
  ]);

  const classById = useMemo(
    () =>
      new Map(
        classes.map((item) => [idOf(item.id), item]),
      ),
    [classes],
  );

  const organizationById = useMemo(
    () =>
      new Map(
        organizations.map((item) => [
          idOf(item.id),
          item,
        ]),
      ),
    [organizations],
  );

  const currentEnrollmentByStudentId = useMemo(() => {
    const map = new Map<string, StudentEnrollment>();

    enrollments
      .filter(
        (item) =>
          !item.isDeleted &&
          lower(item.status) === "active",
      )
      .forEach((item) => {
        map.set(idOf(item.studentId), item);
      });

    return map;
  }, [enrollments]);

  const guardianParentIds = useMemo(() => {
    const ids = new Set<string>();

    studentParents
      .filter(
        (link) =>
          !link.isDeleted &&
          lower(link.relationship) === "guardian",
      )
      .forEach((link) => ids.add(idOf(link.parentId)));

    parents
      .filter(
        (parent) =>
          lower(parent.relationship) === "guardian",
      )
      .forEach((parent) => ids.add(idOf(parent.id)));

    return ids;
  }, [studentParents, parents]);

  const subjectOptions = useMemo<
    IdentitySubjectOption[]
  >(() => {
    const studentOptions = students.map((student) => {
      const enrollment =
        currentEnrollmentByStudentId.get(idOf(student.id));

      const classId = firstId(
        student.currentClassId,
        enrollment?.classId,
      );

      const className =
        classById.get(classId)?.name || "No class";

      const organizationName =
        organizationById.get(idOf(student.organizationId))
          ?.name || null;

      return {
        id: idOf(student.id),
        subjectType: "student" as const,
        name: student.fullName,
        reference:
          student.admissionNumber || idOf(student.id),
        subtitle: [
          className,
          organizationName,
          humanize(student.status || "active"),
        ]
          .filter(Boolean)
          .join(" · "),
        imageUrl:
          resolvedStudentMediaById[idOf(student.id)]?.photo ||
          safeRecordMediaValue(student.photo) ||
          null,
        active: isActiveRecord(student),
      };
    });

    const teacherOptions = teachers.map((teacher) => ({
      id: idOf(teacher.id),
      subjectType: "teacher" as const,
      name: teacher.fullName,
      reference:
        teacher.email ||
        teacher.phone ||
        idOf(teacher.id),
      subtitle: [
        humanize(teacher.role),
        organizationById.get(
          idOf(teacher.organizationId),
        )?.name,
      ]
        .filter(Boolean)
        .join(" · "),
      imageUrl:
        resolvedTeacherMediaById[idOf(teacher.id)]?.photo ||
        safeRecordMediaValue(teacher.photo) ||
        null,
      active: isActiveRecord(teacher),
    }));

    const staffOptions = teachers.map((teacher) => ({
      id: idOf(teacher.id),
      subjectType: "staff" as const,
      name: teacher.fullName,
      reference:
        teacher.email ||
        teacher.phone ||
        idOf(teacher.id),
      subtitle: [
        humanize(teacher.role),
        "School staff",
      ].join(" · "),
      imageUrl:
        resolvedTeacherMediaById[idOf(teacher.id)]?.photo ||
        safeRecordMediaValue(teacher.photo) ||
        null,
      active: isActiveRecord(teacher),
    }));

    const parentOptions = parents.map((parent) => ({
      id: idOf(parent.id),
      subjectType: "parent" as const,
      name: parent.fullName,
      reference:
        parent.phone ||
        parent.email ||
        idOf(parent.id),
      subtitle: [
        humanize(parent.relationship || "parent"),
        parent.occupation,
      ]
        .filter(Boolean)
        .join(" · "),
      imageUrl:
        resolvedParentMediaById[idOf(parent.id)]?.photo ||
        safeRecordMediaValue(parent.photo) ||
        null,
      active: !parent.isDeleted,
    }));

    const guardianOptions = parents
      .filter((parent) =>
        guardianParentIds.has(idOf(parent.id)),
      )
      .map((parent) => ({
        id: idOf(parent.id),
        subjectType: "guardian" as const,
        name: parent.fullName,
        reference:
          parent.phone ||
          parent.email ||
          idOf(parent.id),
        subtitle: [
          "Guardian",
          parent.occupation,
        ]
          .filter(Boolean)
          .join(" · "),
        imageUrl:
          resolvedParentMediaById[idOf(parent.id)]?.photo ||
          safeRecordMediaValue(parent.photo) ||
          null,
        active: !parent.isDeleted,
      }));

    const visitorOptions = visitors.map((visitor) => ({
      id: idOf(visitor.id),
      subjectType: "visitor" as const,
      name: visitor.fullName,
      reference:
        visitor.phone ||
        visitor.email ||
        idOf(visitor.id),
      subtitle: [
        visitor.organizationName,
        visitor.blocked ? "Blocked" : "Visitor",
      ]
        .filter(Boolean)
        .join(" · "),
      imageUrl: null,
      active:
        !visitor.isDeleted &&
        visitor.active !== false &&
        !visitor.blocked,
    }));

    return [
      ...studentOptions,
      ...teacherOptions,
      ...staffOptions,
      ...parentOptions,
      ...guardianOptions,
      ...visitorOptions,
    ].filter((option) => option.id);
  }, [
    students,
    teachers,
    parents,
    visitors,
    guardianParentIds,
    classById,
    organizationById,
    currentEnrollmentByStudentId,
    resolvedStudentMediaById,
    resolvedTeacherMediaById,
    resolvedParentMediaById,
  ]);

  const subjectByKey = useMemo(() => {
    const map = new Map<string, IdentitySubjectOption>();

    subjectOptions.forEach((subject) => {
      map.set(
        `${subject.subjectType}:${subject.id}`,
        subject,
      );
    });

    return map;
  }, [subjectOptions]);

  const selectedSubject = useMemo(
    () =>
      subjectByKey.get(
        `${form.subjectType}:${form.subjectId}`,
      ) || null,
    [subjectByKey, form.subjectType, form.subjectId],
  );

  const availableSubjects = useMemo(() => {
    return subjectOptions.filter((subject) => {
      if (subject.subjectType !== subjectSearchType) {
        return false;
      }

      if (!subject.active) return false;

      if (
        subjectSearchType === "student" &&
        studentClassFilter !== "all"
      ) {
        const student = students.find((item) =>
          sameId(item.id, subject.id),
        );

        const enrollment =
          currentEnrollmentByStudentId.get(subject.id);

        const classId = firstId(
          student?.currentClassId,
          enrollment?.classId,
        );

        if (!sameId(classId, studentClassFilter)) {
          return false;
        }
      }

      if (
        organizationFilter !== "all" &&
        ["student", "teacher", "staff"].includes(
          subjectSearchType,
        )
      ) {
        const entity =
          subjectSearchType === "student"
            ? students.find((item) =>
                sameId(item.id, subject.id),
              )
            : teachers.find((item) =>
                sameId(item.id, subject.id),
              );

        if (
          !sameId(
            entity?.organizationId,
            organizationFilter,
          )
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    subjectOptions,
    subjectSearchType,
    studentClassFilter,
    organizationFilter,
    students,
    teachers,
    currentEnrollmentByStudentId,
  ]);

  const credentialRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return credentials.filter((credential) => {
      if (
        statusFilter !== "all" &&
        credential.status !== statusFilter
      ) {
        return false;
      }

      if (
        subjectTypeFilter !== "all" &&
        credential.subjectType !== subjectTypeFilter
      ) {
        return false;
      }

      if (!query) return true;

      const subject = subjectByKey.get(
        `${credential.subjectType}:${credential.subjectId}`,
      );

      return [
        subject?.name,
        subject?.reference,
        subject?.subtitle,
        credential.label,
        credential.credentialReference,
        credential.serialNumber,
        credential.credentialType,
        credential.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    credentials,
    search,
    statusFilter,
    subjectTypeFilter,
    subjectByKey,
  ]);

  const selectedCredentialSubject = useMemo(() => {
    if (!selectedCredential) return null;

    return (
      subjectByKey.get(
        `${selectedCredential.subjectType}:${selectedCredential.subjectId}`,
      ) || null
    );
  }, [selectedCredential, subjectByKey]);

  const selectedCredentialEvents = useMemo(() => {
    if (!selectedCredential) return [];

    return events.filter((event) =>
      sameId(event.credentialId, selectedCredential.id),
    );
  }, [events, selectedCredential]);

  const { branding, designs: liveCredentialDesigns, academicYear: identityAcademicYear } = useIdentityCardPresentation({
    accountId, schoolId, branchId,
    school: activeSchool as Record<string, any> | null,
    branch: activeBranch as Record<string, any> | null,
  });

  const defaultCredentialDesign = useMemo(
    () =>
      ({
        name: "Default Identity Card",
        templateKey: "modern_clean",
        orientation: "landscape",
        sides: "front_and_back",
        primaryColor:
          typeof primary === "string" && primary.startsWith("#")
            ? primary
            : "#2563eb",
        secondaryColor: "#172554",
        backgroundColor: "#ffffff",
        textColor: "#111827",
        mutedTextColor: "#64748b",
        borderColor:
          typeof primary === "string" && primary.startsWith("#")
            ? primary
            : "#2563eb",
        borderStyle: "solid",
        borderRadiusPx: 16,
        showSchoolLogo: true,
        showBranchLogo: true,
        showSchoolName: true,
        showBranchName: true,
        showPhoto: true,
        photoShape: "rounded",
        showQrCode: true,
        qrPosition: "front_right",
        qrSize: "medium",
        showCredentialReference: true,
        showExpiryDate: true,
        visibleFields: {
          fullName: true,
          admissionNumber: true,
          className: true,
        },
        footerText: "Official school identity credential",
        active: true,
      }) as Partial<IdentityCredentialDesignSetting>,
    [primary],
  );

  const designForCredential = (
    credential?: Partial<IdentityCredential> | null,
  ): Partial<IdentityCredentialDesignSetting> => {
    const available = liveCredentialDesigns.length ? liveCredentialDesigns : credentialDesigns;
    const subjectType = String(credential?.subjectType || "student");
    const credentialType = String(credential?.credentialType || "qr_code");
    return available.length
      ? chooseIdentityCardDesign(available, subjectType, credentialType)
      : { ...defaultCredentialDesign, visibleFields: {
          ...defaultCredentialDesign.visibleFields,
          admissionNumber: subjectType === "student",
          staffNumber: subjectType === "teacher" || subjectType === "staff",
          className: subjectType === "student",
        }};
  };

  const printableCredentials = useMemo<PrintableCredential[]>(() => {
    const source =
      printSelection === "selected" && selectedCredential
        ? [selectedCredential]
        : credentialRows;

    return source.reduce<PrintableCredential[]>(
      (result, credential) => {
        const subject = subjectByKey.get(
          `${credential.subjectType}:${credential.subjectId}`,
        );

        if (!subject) return result;

        const student =
          credential.subjectType === "student"
            ? students.find((item) =>
                sameId(item.id, credential.subjectId),
              )
            : null;

        const teacher =
          ["teacher", "staff"].includes(credential.subjectType)
            ? teachers.find((item) =>
                sameId(item.id, credential.subjectId),
              )
            : null;

        const parent =
          ["parent", "guardian"].includes(credential.subjectType)
            ? parents.find((item) =>
                sameId(item.id, credential.subjectId),
              )
            : null;

        const enrollment = student
          ? currentEnrollmentByStudentId.get(idOf(student.id))
          : null;

        const className = student
          ? classById.get(
              firstId(
                student.currentClassId,
                enrollment?.classId,
              ),
            )?.name || null
          : null;

        const printable: PrintableCredential = {
          credential,
          subject: {
            fullName: subject.name,
            admissionNumber:
              student?.admissionNumber ||
              (credential.subjectType === "student"
                ? subject.reference
                : null),
            staffNumber: teacher
              ? String((teacher as any).staffNumber || (teacher as any).employeeNumber || (teacher as any).employeeId || subject.reference || "")
              : null,
            className,
            academicYear: identityAcademicYear,
            gender: (student as any)?.gender || (teacher as any)?.gender || (parent as any)?.gender || null,
            dateOfBirth: (student as any)?.dateOfBirth || (teacher as any)?.dateOfBirth || (parent as any)?.dateOfBirth || null,
            emergencyPhone: (student as any)?.emergencyPhone || (student as any)?.parentPhone ||
              (student as any)?.relativePhone || (teacher as any)?.relativePhone || null,
            organizationName:
              organizationById.get(
                idOf(
                  student?.organizationId ||
                    teacher?.organizationId,
                ),
              )?.name || null,
            phone:
              teacher?.phone ||
              parent?.phone ||
              null,
            photoUrl: subject.imageUrl || null,
          },
        };

        result.push(printable);
        return result;
      },
      [],
    );
  }, [
    printSelection,
    selectedCredential,
    credentialRows,
    subjectByKey,
    students,
    teachers,
    parents,
    currentEnrollmentByStudentId,
    classById,
    organizationById,
    identityAcademicYear,
  ]);

  const counts = useMemo(() => {
    return {
      total: credentials.length,
      active: credentials.filter(
        (item) => item.status === "active",
      ).length,
      pending: credentials.filter(
        (item) => item.status === "pending",
      ).length,
      suspended: credentials.filter(
        (item) => item.status === "suspended",
      ).length,
      expired: credentials.filter(
        (item) => item.status === "expired",
      ).length,
      revoked: credentials.filter(
        (item) => item.status === "revoked",
      ).length,
      subjects: new Set(
        credentials.map(
          (item) =>
            `${item.subjectType}:${item.subjectId}`,
        ),
      ).size,
    };
  }, [credentials]);

  const activeFilterCount = [
    statusFilter !== "all" ? statusFilter : "",
    subjectTypeFilter !== "all"
      ? subjectTypeFilter
      : "",
  ].filter(Boolean).length;

  function openCreate() {
    if (!canEdit) return;

    const next = defaultForm();

    setEditingCredential(null);
    setForm(next);
    setSubjectSearchType(next.subjectType);
    setStudentClassFilter("all");
    setOrganizationFilter("all");
    setFormOpen(true);
  }

  function openEdit(credential: IdentityCredential) {
    if (!canEdit) return;

    setEditingCredential(credential);
    setForm({
      subjectType: credential.subjectType,
      subjectId: credential.subjectId,
      credentialType: credential.credentialType,
      status: credential.status,
      label: credential.label || "",
      serialNumber: credential.serialNumber || "",
      validFrom: inputDate(credential.validFrom),
      expiresAt: inputDate(credential.expiresAt),
    });

    setSubjectSearchType(credential.subjectType);
    setStudentClassFilter("all");
    setOrganizationFilter("all");
    setSelectedCredential(null);
    setFormOpen(true);
  }

  const formNeedsSerialNumber = SERIAL_NUMBER_TYPES.has(
    form.credentialType,
  );

  const credentialGenerationHint = useMemo(() => {
    if (form.credentialType === "qr_code") {
      return "The credential reference, QR payload and token hash will be generated automatically.";
    }

    if (formNeedsSerialNumber) {
      return "Enter or scan the serial number printed on the physical card. Its credential reference will still be generated automatically.";
    }

    if (
      form.credentialType === "fingerprint" ||
      form.credentialType === "face_profile"
    ) {
      return "The credential record will be created now. The biometric identifier should later be supplied by the enrollment device.";
    }

    if (GENERATED_REFERENCE_TYPES.has(form.credentialType)) {
      return "The credential reference will be generated automatically.";
    }

    return null;
  }, [form.credentialType, formNeedsSerialNumber]);

  async function saveCredential() {
    if (!canEdit) {
      notify(
        "error",
        "You do not have permission to issue credentials.",
      );
      return;
    }

    if (!resolvedAccountId || !schoolId || !branchId) {
      notify(
        "error",
        "The active account, school or branch could not be resolved.",
      );
      return;
    }

    if (!form.subjectId || !selectedSubject) {
      notify(
        "error",
        "Select the person or entity receiving this credential.",
      );
      return;
    }

    if (formNeedsSerialNumber && !form.serialNumber.trim()) {
      notify(
        "error",
        "Enter or scan the physical card serial number.",
      );
      return;
    }

    if (
      credentials.some(
        (credential) =>
          credential.id !== editingCredential?.id &&
          credential.subjectType === form.subjectType &&
          sameId(
            credential.subjectId,
            form.subjectId,
          ) &&
          credential.credentialType ===
            form.credentialType &&
          ![
            "revoked",
            "expired",
            "replaced",
          ].includes(credential.status),
      )
    ) {
      notify(
        "error",
        `${selectedSubject.name} already has a current ${humanize(
          form.credentialType,
        )} credential.`,
      );
      return;
    }

    try {
      setSaving(true);

      if (editingCredential) {
        await db.identityCredentials.update(
          editingCredential.id,
          {
            label: form.label.trim() || null,
            serialNumber: formNeedsSerialNumber
              ? form.serialNumber.trim() || null
              : null,
            updatedAt: Date.now(),
            version:
              Number(editingCredential.version || 0) + 1,
            deviceId: getDeviceId(),
            updatedByDeviceId: getDeviceId(),
            synced: SyncStatus.PENDING,
          },
        );

        notify(
          "success",
          "Credential updated successfully.",
        );
      } else {
        await issueCredential(
          {
            accountId: resolvedAccountId,
            schoolId,
            branchId,
            deviceId: getDeviceId(),
            userId: userId || null,
          },
          {
            subjectType: form.subjectType,
            subjectId: form.subjectId,
            credentialType: form.credentialType,
            label: form.label.trim() || null,
            serialNumber: formNeedsSerialNumber
              ? form.serialNumber.trim()
              : null,
            validFrom: toTimestamp(form.validFrom),
            expiresAt: toTimestamp(form.expiresAt),
            status: form.status,
            allowMultiple: false,
            replaceExisting: false,
          },
        );

        notify(
          "success",
          `${selectedSubject.name}'s credential was created.`,
        );
      }

      setFormOpen(false);
      await load();
    } catch (error) {
      console.error(error);

      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to save the credential.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCredentialAction(
    action: CredentialAction,
    credential: IdentityCredential,
  ) {
    if (!canEdit) return;

    if (!resolvedAccountId || !schoolId || !branchId) {
      notify(
        "error",
        "The active account, school or branch could not be resolved.",
      );
      return;
    }

    const context = {
      accountId: resolvedAccountId,
      schoolId,
      branchId,
      deviceId: getDeviceId(),
      userId: userId || null,
    };

    try {
      if (action === "activate") {
        await activateCredential(context, credential.id);
      } else if (action === "suspend") {
        await suspendCredential(
          context,
          credential.id,
          "Suspended by branch administrator",
        );
      } else if (action === "reactivate") {
        await reactivateCredential(
          context,
          credential.id,
        );
      } else if (action === "revoke") {
        await revokeCredential(
          context,
          credential.id,
          "Revoked by branch administrator",
        );
      } else if (action === "expire") {
        await expireCredential(context, credential.id);
      }

      setSelectedCredential(null);
      await load();

      notify(
        "success",
        `Credential ${humanize(action).toLowerCase()} action completed.`,
      );
    } catch (error) {
      console.error(error);

      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Credential action failed.",
      );
    }
  }

  async function removeCredential(
    credential: IdentityCredential,
  ) {
    if (!canEdit) return;

    try {
      await softDeleteLocal(
        "identityCredentials",
        credential.id,
      );

      setSelectedCredential(null);
      await load();

      notify("success", "Credential removed.");
    } catch (error) {
      console.error(error);
      notify("error", "Failed to remove credential.");
    }
  }

  if (
    accountLoading ||
    contextLoading ||
    settingsLoading ||
    loading
  ) {
    return (
      <RouteState
        primary={primary}
        title="Opening Identity Credentials..."
        text="Loading credentials and eligible identity subjects."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <RouteState
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before opening identity credentials."
      />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <RouteState
        primary={primary}
        title="No branch workspace selected"
        text="Select the correct branch workspace and reopen this module."
      />
    );
  }

  return (
    <PermissionGate
      allowed={canView}
      fallback={
        <RouteState
          primary={primary}
          title="Access restricted"
          text="Your active membership does not allow you to view identity credentials."
        />
      }
    >
      <main
        className="ba-page"
        style={
          {
            "--ba-primary": primary,
          } as React.CSSProperties
        }
      >
        <style>{css}</style>

        {toast ? (
          <section className={`toast ${toast.tone}`}>
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)}>
              ×
            </button>
          </section>
        ) : null}

        <section className="toolbar">
          <button
            className={`dot ${
              counts.active
                ? "green"
                : counts.total
                  ? "orange"
                  : "gray"
            }`}
            onClick={() => setStatusOpen(true)}
            aria-label="Open credential status"
          />

          <label className="search">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search names, references or credentials..."
            />
          </label>

          <button
            className="add"
            onClick={openCreate}
            disabled={!canEdit}
          >
            +
          </button>

          <button
            className={`icon ${
              activeFilterCount ? "active" : ""
            }`}
            onClick={() => setFilterOpen(true)}
            aria-label="Open filters"
          >
            <SliderIcon />
            {activeFilterCount ? (
              <b>{activeFilterCount}</b>
            ) : null}
          </button>

          <button
            className="icon"
            onClick={() => setMoreOpen(true)}
            aria-label="Open more"
          >
            ⋯
          </button>
        </section>

        {activeFilterCount ? (
          <section className="chips">
            {subjectTypeFilter !== "all" ? (
              <span>
                {humanize(subjectTypeFilter)}
              </span>
            ) : null}

            {statusFilter !== "all" ? (
              <span>{humanize(statusFilter)}</span>
            ) : null}
          </section>
        ) : null}

        {viewMode === "analytics" ? (
          <section className="analytics">
            <Metric label="Credentials" value={counts.total} />
            <Metric
              label="Credentialed Subjects"
              value={counts.subjects}
            />
            <Metric label="Active" value={counts.active} />
            <Metric label="Pending" value={counts.pending} />
            <Metric
              label="Suspended"
              value={counts.suspended}
            />
            <Metric label="Expired" value={counts.expired} />
            <Metric label="Revoked" value={counts.revoked} />
          </section>
        ) : viewMode === "table" ? (
          <section className="table-card">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      Identity Credentials (
                      {credentialRows.length})
                    </th>
                    <th>Subject</th>
                    <th>Credential</th>
                    <th>Reference</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {credentialRows.map((credential) => {
                    const subject =
                      subjectByKey.get(
                        `${credential.subjectType}:${credential.subjectId}`,
                      ) || null;

                    return (
                      <tr key={credential.id}>
                        <td>
                          <strong>
                            {subject?.name ||
                              credential.label ||
                              "Unknown subject"}
                          </strong>
                          <br />
                          <small>
                            {subject?.subtitle ||
                              humanize(
                                credential.subjectType,
                              )}
                          </small>
                        </td>
                        <td>
                          {humanize(
                            credential.subjectType,
                          )}
                        </td>
                        <td>
                          {humanize(
                            credential.credentialType,
                          )}
                        </td>
                        <td>
                          {credential.credentialReference ||
                            credential.serialNumber ||
                            "—"}
                        </td>
                        <td>
                          <span
                            className={`badge ${credential.status}`}
                          >
                            {humanize(
                              credential.status,
                            )}
                          </span>
                        </td>
                        <td>
                          {formatDate(
                            credential.updatedAt,
                          )}
                        </td>
                        <td>
                          <button
                            className="table-action"
                            onClick={() =>
                              setSelectedCredential(
                                credential,
                              )
                            }
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="list">
            {credentialRows.map((credential) => (
              <CredentialCard
                key={credential.id}
                credential={credential}
                subject={
                  subjectByKey.get(
                    `${credential.subjectType}:${credential.subjectId}`,
                  ) || null
                }
                onOpen={setSelectedCredential}
              />
            ))}
          </section>
        )}

        {!credentialRows.length ? (
          <section className="empty">
            <i>⌁</i>
            <h3>No credentials found</h3>
            <p>
              No credential matches the current search and
              filters. Use the plus button to issue one.
            </p>
          </section>
        ) : null}

        {filterOpen ? (
          <Sheet
            title="Credential Filters"
            text="Narrow credentials by subject and lifecycle status."
            onClose={() => setFilterOpen(false)}
          >
            <div className="form-grid">
              <Field label="Subject Type">
                <select
                  value={subjectTypeFilter}
                  onChange={(event) =>
                    setSubjectTypeFilter(
                      event.target
                        .value as SubjectTypeFilter,
                    )
                  }
                >
                  <option value="all">
                    All subjects
                  </option>
                  {SUBJECT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {humanize(type)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Status">
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target
                        .value as StatusFilter,
                    )
                  }
                >
                  <option value="all">
                    All statuses
                  </option>
                  {STATUS_OPTIONS.map((status) => (
                    <option
                      key={status}
                      value={status}
                    >
                      {humanize(status)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="footer">
              <button
                onClick={() => {
                  setSubjectTypeFilter("all");
                  setStatusFilter("all");
                }}
              >
                Clear
              </button>
              <button
                className="primary"
                onClick={() => setFilterOpen(false)}
              >
                Apply
              </button>
            </div>
          </Sheet>
        ) : null}

        {moreOpen ? (
          <Sheet
            title="More"
            text="Change the view or perform credential actions."
            onClose={() => setMoreOpen(false)}
          >
            <section className="more-section">
              <span>View</span>

              <div className="more-grid">
                {(
                  [
                    "cards",
                    "table",
                    "analytics",
                  ] as ViewMode[]
                ).map((mode) => (
                  <button
                    key={mode}
                    className={
                      viewMode === mode ? "active" : ""
                    }
                    onClick={() => {
                      setViewMode(mode);
                      setMoreOpen(false);
                    }}
                  >
                    <strong>{humanize(mode)}</strong>
                    <small>
                      {mode === "cards"
                        ? "Readable credential cards"
                        : mode === "table"
                          ? "Dense desktop records"
                          : "Credential lifecycle totals"}
                    </small>
                  </button>
                ))}
              </div>
            </section>

            <section className="more-section">
              <span>Actions</span>

              <div className="actions">
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    openCreate();
                  }}
                >
                  Issue Credential
                </button>

                <button
                  onClick={async () => {
                    setMoreOpen(false);
                    await load();
                  }}
                >
                  Refresh
                </button>

                <button
                  disabled={!credentialRows.length}
                  onClick={() => {
                    setPrintSelection("filtered");
                    setPrintOpen(true);
                    setMoreOpen(false);
                  }}
                >
                  Print Visible Credentials
                </button>
              </div>
            </section>
          </Sheet>
        ) : null}

        {statusOpen ? (
          <Sheet
            title="Credential Status"
            text="Current branch credential summary."
            onClose={() => setStatusOpen(false)}
          >
            <div className="status-list">
              <StatusLine
                label="All credentials"
                value={counts.total}
              />
              <StatusLine
                label="Credentialed subjects"
                value={counts.subjects}
              />
              <StatusLine
                label="Active"
                value={counts.active}
              />
              <StatusLine
                label="Pending"
                value={counts.pending}
              />
              <StatusLine
                label="Suspended"
                value={counts.suspended}
              />
              <StatusLine
                label="Expired"
                value={counts.expired}
              />
              <StatusLine
                label="Revoked"
                value={counts.revoked}
              />
            </div>
          </Sheet>
        ) : null}

        {formOpen ? (
          <div
            className="backdrop"
            onMouseDown={() => setFormOpen(false)}
          >
            <section
              className="modal"
              onMouseDown={(event) =>
                event.stopPropagation()
              }
            >
              <div className="sheet-head">
                <div>
                  <h2>
                    {editingCredential
                      ? "Edit Credential"
                      : "Issue Credential"}
                  </h2>
                  <p>
                    {editingCredential
                      ? "Update the label or physical card serial. Reissue the credential to change its generated identity details."
                      : "Select a real person. Their existing UUID is saved and credential details are generated automatically."}
                  </p>
                </div>

                <button
                  onClick={() => setFormOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className="form-grid">
                <Field label="Subject Type">
                  <select
                    value={subjectSearchType}
                    disabled={Boolean(editingCredential)}
                    onChange={(event) => {
                      const type =
                        event.target
                          .value as IdentitySubjectType;

                      setSubjectSearchType(type);
                      setForm((current) => ({
                        ...current,
                        subjectType: type,
                        subjectId: "",
                      }));
                      setStudentClassFilter("all");
                      setOrganizationFilter("all");
                    }}
                  >
                    {SUBJECT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {humanize(type)}
                      </option>
                    ))}
                  </select>
                </Field>

                {subjectSearchType === "student" ? (
                  <Field label="Class">
                    <select
                      value={studentClassFilter}
                      onChange={(event) =>
                        setStudentClassFilter(
                          event.target.value,
                        )
                      }
                    >
                      <option value="all">
                        All classes
                      </option>
                      {classes
                        .filter(isActiveRecord)
                        .sort((a, b) =>
                          a.name.localeCompare(b.name),
                        )
                        .map((item) => (
                          <option
                            key={item.id}
                            value={item.id}
                          >
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                ) : null}

                {[
                  "student",
                  "teacher",
                  "staff",
                ].includes(subjectSearchType) ? (
                  <Field label="Organization">
                    <select
                      value={organizationFilter}
                      onChange={(event) =>
                        setOrganizationFilter(
                          event.target.value,
                        )
                      }
                    >
                      <option value="all">
                        All organizations
                      </option>
                      {organizations
                        .filter(isActiveRecord)
                        .sort((a, b) =>
                          a.name.localeCompare(b.name),
                        )
                        .map((item) => (
                          <option
                            key={item.id}
                            value={item.id}
                          >
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                ) : null}

                <div className="full subject-picker">
                  <div className="picker-label">
                    <span>Select Subject</span>
                    <small>
                      {availableSubjects.length} eligible
                    </small>
                  </div>

                  <IdentitySubjectPicker
                    subjects={availableSubjects}
                    subjectType={subjectSearchType}
                    value={form.subjectId}
                    disabled={Boolean(editingCredential)}
                    onChange={(subject) => {
                      setForm((current) => ({
                        ...current,
                        subjectType:
                          subject?.subjectType ||
                          subjectSearchType,
                        subjectId: subject?.id || "",
                      }));
                    }}
                  />
                </div>

                {selectedSubject ? (
                  <div className="full selected-subject">
                    <span>Selected</span>
                    <strong>{selectedSubject.name}</strong>
                    <small>
                      {humanize(
                        selectedSubject.subjectType,
                      )}
                      {" · "}
                      {selectedSubject.reference ||
                        "Existing record"}
                    </small>
                  </div>
                ) : null}

                <Field label="Credential Type">
                  <select
                    value={form.credentialType}
                    disabled={Boolean(editingCredential)}
                    onChange={(event) => {
                      const credentialType =
                        event.target.value as IdentityCredentialType;

                      setForm((current) => ({
                        ...current,
                        credentialType,
                        serialNumber: SERIAL_NUMBER_TYPES.has(
                          credentialType,
                        )
                          ? current.serialNumber
                          : "",
                      }));
                    }}
                  >
                    {CREDENTIAL_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {humanize(type)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Initial Status">
                  <select
                    value={form.status}
                    disabled={Boolean(editingCredential)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status:
                          event.target
                            .value as IdentityCredentialStatus,
                      }))
                    }
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option
                        key={status}
                        value={status}
                      >
                        {humanize(status)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Label">
                  <input
                    value={form.label}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                    placeholder="e.g. Main student QR"
                  />
                </Field>

                {formNeedsSerialNumber ? (
                  <Field label="Serial Number">
                    <input
                      value={form.serialNumber}
                      required
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          serialNumber: event.target.value,
                        }))
                      }
                      placeholder="Enter or scan the physical card serial"
                    />
                  </Field>
                ) : null}

                {credentialGenerationHint ? (
                  <div className="full credential-generation-hint">
                    <strong>Generated automatically</strong>
                    <small>{credentialGenerationHint}</small>
                  </div>
                ) : null}

                <Field label="Valid From">
                  <input
                    type="datetime-local"
                    value={form.validFrom}
                    disabled={Boolean(editingCredential)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        validFrom: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="Expires At">
                  <input
                    type="datetime-local"
                    value={form.expiresAt}
                    disabled={Boolean(editingCredential)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        expiresAt: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              <div className="footer">
                <button
                  onClick={() => setFormOpen(false)}
                >
                  Cancel
                </button>

                <button
                  className="primary"
                  onClick={saveCredential}
                  disabled={
                    saving ||
                    !form.subjectId ||
                    !selectedSubject
                  }
                >
                  {saving
                    ? "Saving..."
                    : editingCredential
                      ? "Save Changes"
                      : "Issue Credential"}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {previewOpen && selectedCredential ? (
          <Sheet
            title="Credential Preview"
            text="The saved branch design is applied without changing the credential reference or QR payload."
            onClose={() => setPreviewOpen(false)}
            className="credential-preview-sheet"
          >
            <div className="credential-preview-canvas">
              <IdentityCredentialPreview
              design={designForCredential(
                selectedCredential,
              )}
              credential={selectedCredential}
              subject={
                printableCredentials.find(
                  (item) =>
                    item.credential.id ===
                    selectedCredential.id,
                )?.subject
              }
              branding={branding}
            />
            </div>
            <div className="footer">
              <button
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </button>
              <button
                className="primary"
                onClick={() => {
                  setPrintSelection("selected");
                  setPrintOpen(true);
                }}
              >
                Print
              </button>
            </div>
          </Sheet>
        ) : null}

        <IdentityCredentialPrintSheet
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          design={designForCredential(
            printSelection === "selected"
              ? selectedCredential
              : printableCredentials[0]?.credential as
                  | IdentityCredential
                  | undefined,
          )}
          branding={branding}
          credentials={printableCredentials}
          designForCredential={designForCredential}
          title={
            printSelection === "selected"
              ? "Print Credential"
              : "Print Visible Credentials"
          }
        />

        <CredentialDetailsSheet
          open={Boolean(selectedCredential)}
          credential={selectedCredential}
          subject={selectedCredentialSubject}
          events={selectedCredentialEvents}
          onClose={() => setSelectedCredential(null)}
          onAction={
            canEdit
              ? handleCredentialAction
              : undefined
          }
        />

        {selectedCredential && canEdit ? (
          <div className="floating-actions">
            <button
              onClick={() => setPreviewOpen(true)}
            >
              Preview Card
            </button>
            <button
              onClick={() => {
                setPrintSelection("selected");
                setPrintOpen(true);
              }}
            >
              Print
            </button>
            <button
              onClick={() =>
                openEdit(selectedCredential)
              }
            >
              Edit
            </button>
            <button
              className="danger"
              onClick={() =>
                void removeCredential(
                  selectedCredential,
                )
              }
            >
              Remove
            </button>
          </div>
        ) : null}
      </main>
    </PermissionGate>
  );
}

function SliderIcon() {
  return (
    <svg
      className="slider"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Sheet({
  title,
  text,
  children,
  onClose,
  className = "",
}: {
  title: string;
  text: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      className="backdrop"
      onMouseDown={onClose}
    >
      <section
        className={`sheet ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>

          <button onClick={onClose}>×</button>
        </div>

        {children}
      </section>
    </div>
  );
}

function StatusLine({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RouteState({
  primary,
  title,
  text,
}: {
  primary: string;
  title: string;
  text: string;
}) {
  return (
    <main
      className="ba-page"
      style={
        {
          "--ba-primary": primary,
        } as React.CSSProperties
      }
    >
      <style>{css}</style>

      <section className="state">
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

const css = `
.ba-page{
  --ba-border:color-mix(in srgb,var(--foreground,#172033) 12%,transparent);
  --ba-muted:color-mix(in srgb,var(--foreground,#172033) 62%,transparent);
  --ba-soft:color-mix(in srgb,var(--foreground,#172033) 5%,transparent);
  color:var(--foreground,#172033);
  display:grid;
  gap:9px;
  padding:clamp(8px,1.8vw,16px);
  min-width:0;
}
.toolbar{
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto auto auto;
  align-items:center;
  gap:5px;
}
.dot{
  width:10px;
  height:10px;
  border:0;
  border-radius:50%;
  padding:0;
  background:#94a3b8;
  box-shadow:0 0 0 3px color-mix(in srgb,currentColor 12%,transparent);
  cursor:pointer;
}
.dot.green{background:#22c55e}
.dot.orange{background:#f59e0b}
.search{
  height:37px;
  display:flex;
  align-items:center;
  gap:7px;
  padding:0 9px;
  border:1px solid var(--ba-border);
  border-radius:11px;
  background:var(--background,#fff);
  min-width:0;
}
.search span{font-size:18px;opacity:.55}
.search input{
  width:100%;
  min-width:0;
  border:0;
  outline:0;
  background:transparent;
  color:inherit;
  font:inherit;
  font-size:11px;
}
.add,.icon{
  height:37px;
  border:1px solid var(--ba-border);
  border-radius:10px;
  background:var(--background,#fff);
  color:inherit;
  font:inherit;
  font-weight:850;
  cursor:pointer;
}
.add{
  padding:0 12px;
  color:var(--ba-primary);
}
.icon{
  width:37px;
  display:grid;
  place-items:center;
  position:relative;
  font-size:17px;
}
.icon.active{
  color:var(--ba-primary);
  border-color:color-mix(in srgb,var(--ba-primary) 35%,transparent);
}
.icon b{
  position:absolute;
  right:-5px;
  top:-5px;
  min-width:16px;
  height:16px;
  padding:0 3px;
  display:grid;
  place-items:center;
  border-radius:99px;
  background:var(--ba-primary);
  color:#fff;
  font-size:8px;
}
.slider{
  width:17px;
  height:17px;
  fill:none;
  stroke:currentColor;
  stroke-width:1.8;
  stroke-linecap:round;
}
.chips{
  display:flex;
  gap:5px;
  flex-wrap:wrap;
}
.chips span{
  padding:4px 8px;
  border:1px solid var(--ba-border);
  border-radius:99px;
  background:var(--background,#fff);
  color:var(--ba-muted);
  font-size:8px;
  font-weight:750;
}
.list{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,315px),1fr));
  gap:7px;
}
.table-card{
  border:1px solid var(--ba-border);
  border-radius:12px;
  overflow:hidden;
  background:var(--background,#fff);
}
.scroll{overflow:auto}
.scroll table{
  width:100%;
  min-width:850px;
  border-collapse:collapse;
  font-size:8.7px;
}
.scroll th,.scroll td{
  padding:8px;
  text-align:left;
  border-bottom:1px solid var(--ba-border);
}
.scroll th{
  color:var(--ba-muted);
  font-size:7.8px;
  text-transform:uppercase;
}
.table-action{
  border:1px solid var(--ba-border);
  border-radius:7px;
  background:transparent;
  color:var(--ba-primary);
  padding:5px 7px;
  font-size:7.5px;
  font-weight:850;
}
.badge{
  display:inline-flex;
  padding:3px 7px;
  border-radius:99px;
  background:var(--ba-soft);
  color:var(--ba-muted);
  font-size:7.5px;
  font-weight:850;
}
.badge.active{
  background:color-mix(in srgb,#22c55e 10%,transparent);
  color:#15803d;
}
.badge.pending,.badge.suspended{
  background:color-mix(in srgb,#f59e0b 10%,transparent);
  color:#b45309;
}
.badge.expired,.badge.revoked,.badge.replaced{
  background:color-mix(in srgb,#ef4444 10%,transparent);
  color:#b91c1c;
}
.analytics{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(130px,1fr));
  gap:7px;
}
.metric{
  padding:10px;
  border:1px solid var(--ba-border);
  border-radius:11px;
  background:var(--background,#fff);
  display:grid;
  gap:3px;
}
.metric span{
  font-size:7.8px;
  color:var(--ba-muted);
  font-weight:850;
  text-transform:uppercase;
}
.metric strong{
  font-size:17px;
  color:var(--ba-primary);
}
.empty,.state{
  min-height:210px;
  display:grid;
  place-items:center;
  align-content:center;
  gap:5px;
  padding:22px;
  border:1px dashed var(--ba-border);
  border-radius:14px;
  text-align:center;
}
.empty h3,.state h2{
  font-size:13px;
  margin:0;
}
.empty p,.state p{
  font-size:9px;
  color:var(--ba-muted);
  margin:0;
  max-width:430px;
  line-height:1.55;
}
.empty i{
  font-size:25px;
  font-style:normal;
}
.toast{
  position:sticky;
  top:7px;
  z-index:60;
  display:flex;
  justify-content:space-between;
  gap:8px;
  padding:9px 10px;
  border:1px solid var(--ba-border);
  border-radius:10px;
  background:var(--background,#fff);
  font-size:8.7px;
  font-weight:750;
}
.toast.success{
  border-color:color-mix(in srgb,#22c55e 38%,transparent);
}
.toast.error{
  border-color:color-mix(in srgb,#ef4444 38%,transparent);
}
.toast button{
  border:0;
  background:transparent;
  color:inherit;
}
.backdrop{
  position:fixed;
  inset:0;
  z-index:100;
  display:grid;
  place-items:end center;
  padding:8px;
  background:rgba(15,23,42,.58);
}
.sheet,.modal{
  width:min(610px,100%);
  max-height:92vh;
  overflow:auto;
  box-sizing:border-box;
  padding:12px;
  border:1px solid var(--ba-border);
  border-radius:20px 20px 12px 12px;
  background:var(--background,#fff);
  color:var(--foreground,#172033);
}
.modal{width:min(760px,100%)}
.credential-preview-sheet{
  width:min(1200px,calc(100vw - 16px));
  max-width:none;
}

.credential-preview-canvas{
  width:100%;
  min-width:0;
  overflow-x:auto;
  overflow-y:visible;
  padding:24px;
  display:flex;
  justify-content:center;
  align-items:flex-start;
  box-sizing:border-box;
}

.credential-preview-canvas > *{
  flex:0 0 auto;
}

.sheet-head{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:9px;
  padding-bottom:9px;
  border-bottom:1px solid var(--ba-border);
}
.sheet-head h2{
  margin:0;
  font-size:13px;
}
.sheet-head p{
  margin:2px 0 0;
  font-size:8.3px;
  color:var(--ba-muted);
}
.sheet-head button{
  width:29px;
  height:29px;
  border:1px solid var(--ba-border);
  border-radius:8px;
  background:transparent;
  color:inherit;
  font-size:16px;
}
.form-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:8px;
  padding-top:10px;
}
.field{
  display:grid;
  gap:4px;
  min-width:0;
}
.field>span,.picker-label>span{
  font-size:7.8px;
  color:var(--ba-muted);
  font-weight:850;
  text-transform:uppercase;
}
.field input,.field select,.field textarea,
.subject-picker input{
  width:100%;
  box-sizing:border-box;
  padding:9px;
  border:1px solid var(--ba-border);
  border-radius:9px;
  background:var(--background,#fff);
  color:inherit;
  font:inherit;
  font-size:9px;
}
.full{grid-column:1/-1}
.subject-picker{
  display:grid;
  gap:7px;
  padding:9px;
  border:1px solid var(--ba-border);
  border-radius:11px;
}
.picker-label{
  display:flex;
  justify-content:space-between;
  gap:8px;
}
.picker-label small{
  color:var(--ba-muted);
  font-size:7.8px;
}
.subject-picker button{
  color:inherit;
}
.selected-subject{
  display:grid;
  gap:2px;
  padding:9px;
  border-radius:10px;
  background:color-mix(in srgb,var(--ba-primary) 8%,transparent);
  border:1px solid color-mix(in srgb,var(--ba-primary) 20%,transparent);
}
.selected-subject span{
  color:var(--ba-muted);
  font-size:7px;
  font-weight:900;
  text-transform:uppercase;
}
.selected-subject strong{font-size:10px}
.selected-subject small{
  color:var(--ba-muted);
  font-size:8px;
}
.footer{
  display:flex;
  justify-content:flex-end;
  gap:7px;
  padding-top:11px;
}
.footer button{
  padding:8px 12px;
  border:1px solid var(--ba-border);
  border-radius:9px;
  background:transparent;
  color:inherit;
  font-size:8.5px;
  font-weight:850;
}
.footer .primary{
  border-color:var(--ba-primary);
  background:var(--ba-primary);
  color:#fff;
}
.more-section{
  display:grid;
  gap:7px;
  padding:10px 0;
}
.more-section>span{
  font-size:7.8px;
  color:var(--ba-muted);
  font-weight:900;
  text-transform:uppercase;
}
.more-grid,.actions{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:7px;
}
.more-grid button,.actions button{
  display:grid;
  gap:2px;
  min-height:37px;
  padding:8px;
  border:1px solid var(--ba-border);
  border-radius:9px;
  background:transparent;
  color:inherit;
  text-align:left;
  font-size:8.5px;
  font-weight:750;
}
.more-grid button.active{
  border-color:color-mix(in srgb,var(--ba-primary) 40%,transparent);
  background:color-mix(in srgb,var(--ba-primary) 8%,transparent);
}
.more-grid small{
  font-size:7.3px;
  color:var(--ba-muted);
}
.status-list{
  display:grid;
  padding-top:6px;
}
.status-list div{
  display:flex;
  justify-content:space-between;
  gap:10px;
  padding:8px 1px;
  border-bottom:1px solid var(--ba-border);
  font-size:8.7px;
}
.status-list span{color:var(--ba-muted)}
.status-list strong{color:var(--ba-primary)}
.floating-actions{
  position:fixed;
  right:16px;
  bottom:16px;
  z-index:120;
  display:flex;
  gap:6px;
}
.floating-actions button{
  padding:8px 11px;
  border:1px solid var(--ba-border);
  border-radius:9px;
  background:var(--background,#fff);
  color:var(--ba-primary);
  font-size:8.5px;
  font-weight:900;
  box-shadow:0 10px 28px rgba(15,23,42,.16);
}
.danger{color:#b91c1c!important}
@media(max-width:640px){
  .ba-page{padding:7px}
  .toolbar{gap:4px}
  .search,.add,.icon{height:35px}
  .icon{width:35px}
  .form-grid,.more-grid,.actions{
    grid-template-columns:1fr;
  }
  .credential-preview-sheet{
    width:calc(100vw - 12px);
  }
  .credential-preview-canvas{
    justify-content:flex-start;
    padding:16px;
  }
}
`;
