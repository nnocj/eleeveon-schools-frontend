"use client";

/**
 * app/branch-admin/modules/BranchAdminDashboard.tsx
 * ---------------------------------------------------------
 * BRANCH ADMIN HOME — COMPACT MOBILE-FIRST HOME
 * ---------------------------------------------------------
 *
 * Home now has one clear responsibility:
 * show what matters now.
 *
 * Navigation responsibilities live elsewhere:
 *
 * - Header Search = find anything quickly
 * - Library       = discover everything available
 * - Screens       = return to recent/open work
 *
 * Therefore Home contains:
 *
 * 1. Portal Highlights / Hero
 * 2. Student attendance %
 * 3. Teacher attendance %
 * 4. Upcoming events
 * 5. Announcements
 *
 * Removed from Home:
 *
 * - Dashboard search bar
 * - Student shortcut
 * - Attendance shortcut
 * - Assessment shortcut
 * - Reports shortcut
 * - Recent activity
 *
 * SCROLL OWNERSHIP:
 *
 * The dashboard must NEVER create a second page-level
 * vertical scroll context. The browser/document owns the
 * page scroll. Dashboard containers remain height:auto and
 * overflow-y:visible.
 */

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  useAccount,
} from "../../context/account-context";

import {
  useSettings,
} from "../../context/settings-context";

import {
  useActiveBranch,
} from "../../context/active-branch-context";

import {
  useActiveMembership,
} from "../../context/active-membership-context";

import {
  db,
} from "../../lib/db/db";

import type {
  RoleNavSection,
} from "../../components/role-portals/RolePortalShell";

import {
  useDataRevision,
} from "../../hooks/useDataRevision";

import {
  useBackgroundLoader,
} from "../../hooks/useBackgroundLoader";

import {
  ActivityFeed,
  CalendarPreview,
  DashboardBackground,
  DashboardSection,
  DashboardWidget,
  DashboardWidgets,
  WelcomeHero,
} from "../../components/dashboard";

import {
  AttendanceIcon,
  TeacherIcon,
} from "../../components/icons";

// ======================================================
// TYPES
// ======================================================

type AnyRow =
  Record<string, any>;

type RouteProps = {
  navigate?: (
    key: string,
  ) => void;

  navSections?:
    RoleNavSection[];
};

type HeroSlide = {
  id: string;

  type:
    | "image"
    | "video";

  src: string;

  poster?: string;

  title?: string;
  subtitle?: string;

  durationSeconds:
    number;

  transition:
    | "fade"
    | "slide";

  actionType?: string;
  actionLabel?: string;
  actionValue?: string;
};

// ======================================================
// ONLY LOAD DATA HOME ACTUALLY NEEDS
// ======================================================

const TABLE_NAMES = [
  "schools",
  "branches",
  "appUsers",

  "students",
  "teachers",
  "classes",

  "attendance",
  "teacherAttendance",

  "announcements",
  "calendarEvents",

  "portalHighlights",
  "mediaAssets",
] as const;

const OPEN_WORKSPACE_KEY =
  "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?:
    AnyRow |
    null;

  membershipId?:
    string |
    null;

  role?:
    string |
    null;

  schoolId?:
    string |
    null;

  branchId?:
    string |
    null;

  teacherId?:
    string |
    null;

  studentId?:
    string |
    null;

  parentId?:
    string |
    null;

  memberName?:
    string |
    null;

  fullName?:
    string |
    null;

  userName?:
    string |
    null;

  openedAt?:
    number;
};

// ======================================================
// SAFE STORAGE
// ======================================================

function safeRead(
  key: string,
) {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  try {
    return (
      window.localStorage.getItem(
        key,
      ) ||
      window.sessionStorage.getItem(
        key,
      )
    );
  } catch {
    return null;
  }
}

function safeJson<T>(
  key: string,
): T | null {
  const raw =
    safeRead(
      key,
    );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(
      raw,
    ) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession():
  OpenWorkspaceSession |
  null {
  return safeJson<OpenWorkspaceSession>(
    OPEN_WORKSPACE_KEY,
  );
}

function readStoredActiveMembership():
  AnyRow |
  null {
  return safeJson<AnyRow>(
    "activeMembership",
  );
}

// ======================================================
// VALUE HELPERS
// ======================================================

function cleanId(
  value: unknown,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(
    value,
  ).trim();
}

function firstPermanentId(
  ...values: unknown[]
): string | null {
  for (
    const value of values
  ) {
    const parsed =
      cleanId(
        value,
      );

    if (
      parsed
    ) {
      return parsed;
    }
  }

  return null;
}

function n(
  value: any,
) {
  const parsed =
    Number(
      value || 0,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function text(
  value: any,
  fallback = "",
) {
  return (
    String(
      value || "",
    ).trim() ||
    fallback
  );
}

function idOf(
  row?: AnyRow,
): string {
  return cleanId(
    row?.id ??
      row?.payload?.id,
  );
}

function activeRow(
  row: AnyRow,
) {
  const status =
    String(
      row?.status ||
        "",
    )
      .trim()
      .toLowerCase();

  return (
    row?.isDeleted !==
      true &&
    row?.active !==
      false &&
    ![
      "deleted",
      "archived",
      "inactive",
      "disabled",
    ].includes(
      status,
    )
  );
}

function count(
  rows: AnyRow[],
) {
  return rows.filter(
    activeRow,
  ).length;
}

// ======================================================
// WORKSPACE HELPERS
// ======================================================

function workspaceMembership(
  openWorkspace?:
    OpenWorkspaceSession |
    null,

  activeMembership?:
    AnyRow |
    null,
) {
  return (
    openWorkspace?.membership ||
    activeMembership ||
    readStoredActiveMembership() ||
    null
  );
}

function selectedSchoolId(
  args: {
    openWorkspace?:
      OpenWorkspaceSession |
      null;

    activeMembership?:
      AnyRow |
      null;

    activeSchoolId?: any;

    activeSchool?:
      AnyRow |
      null;

    settings?:
      AnyRow |
      null;
  },
) {
  const membership =
    workspaceMembership(
      args.openWorkspace,
      args.activeMembership,
    );

  return firstPermanentId(
    args.openWorkspace?.schoolId,

    membership?.schoolId,
    membership?.school?.id,

    args.activeSchoolId,
    args.activeSchool?.id,

    args.settings?.schoolId,

    safeRead(
      "activeSchoolId",
    ),
  );
}

function selectedBranchId(
  args: {
    openWorkspace?:
      OpenWorkspaceSession |
      null;

    activeMembership?:
      AnyRow |
      null;

    activeBranchId?: any;

    activeBranch?:
      AnyRow |
      null;

    settings?:
      AnyRow |
      null;
  },
) {
  const membership =
    workspaceMembership(
      args.openWorkspace,
      args.activeMembership,
    );

  return firstPermanentId(
    args.openWorkspace?.branchId,

    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,

    args.activeBranchId,
    args.activeBranch?.id,

    args.settings?.branchId,

    safeRead(
      "activeBranchId",
    ),
  );
}

// ======================================================
// SCOPE HELPERS
// ======================================================

function sameAccount(
  row: AnyRow,

  accountId?:
    string |
    null,
) {
  return (
    row &&
    row.isDeleted !==
      true &&
    (
      !row.accountId ||
      !accountId ||
      row.accountId ===
        accountId
    )
  );
}

function branchScoped(
  row: AnyRow,

  accountId?:
    string |
    null,

  schoolId?:
    string |
    null,

  branchId?:
    string |
    null,
) {
  if (
    !sameAccount(
      row,
      accountId,
    )
  ) {
    return false;
  }

  const rowSchoolId =
    row.schoolId ??
    row.payload?.schoolId;

  const rowBranchId =
    row.branchId ??
    row.payload?.branchId;

  if (
    schoolId &&
    rowSchoolId &&
    String(
      rowSchoolId,
    ) !==
      String(
        schoolId,
      )
  ) {
    return false;
  }

  if (
    branchId &&
    rowBranchId &&
    String(
      rowBranchId,
    ) !==
      String(
        branchId,
      )
  ) {
    return false;
  }

  return true;
}

async function safeArray<
  T = AnyRow,
>(
  tableName: string,
): Promise<T[]> {
  const table =
    (db as any)[
      tableName
    ];

  return table?.toArray
    ? table.toArray()
    : [];
}

// ======================================================
// DATES
// ======================================================

function todayKey() {
  try {
    return new Date()
      .toISOString()
      .slice(
        0,
        10,
      );
  } catch {
    return "";
  }
}

function dateLabel(
  value?:
    number |
    string |
    null,
) {
  if (!value) {
    return "Not set";
  }

  const time =
    typeof value ===
    "number"
      ? value
      : new Date(
          value,
        ).getTime();

  if (
    !Number.isFinite(
      time,
    )
  ) {
    return "Not set";
  }

  try {
    return new Intl.DateTimeFormat(
      undefined,
      {
        month:
          "short",

        day:
          "2-digit",
      },
    ).format(
      new Date(
        time,
      ),
    );
  } catch {
    return "Not set";
  }
}

// ======================================================
// DASHBOARD
// ======================================================

export default function BranchAdminDashboard({
  navigate,
  navSections,
}: RouteProps) {
  /*
   * Navigation discovery is now owned by Library/Search.
   * Keep this prop for compatibility with page.tsx.
   */
  void navSections;

  const dataRevision =
    useDataRevision();

  const router =
    useRouter();

  const {
    accountId,
    authenticated,

    loading:
      accountLoading,
  } =
    useAccount();

  const {
    settings,

    loading:
      settingsLoading,
  } =
    useSettings();

  const {
    activeSchoolId,
    activeBranchId,

    activeSchool,
    activeBranch,
  } =
    useActiveBranch();

  const {
    activeMembership,
  } =
    useActiveMembership();

  const primary =
    settings?.primaryColor ||
    "var(--primary-color,#2563eb)";

  const openWorkspace =
    useMemo(
      () =>
        readOpenWorkspaceSession(),
      [],
    );

  const schoolId =
    selectedSchoolId({
      openWorkspace,

      activeMembership,

      activeSchoolId,

      activeSchool,

      settings:
        settings as AnyRow,
    });

  const branchId =
    selectedBranchId({
      openWorkspace,

      activeMembership,

      activeBranchId,

      activeBranch,

      settings:
        settings as AnyRow,
    });

  const {
    loading,
    setLoading,
  } =
    useBackgroundLoader();

  const [
    rowsByTable,
    setRowsByTable,
  ] =
    useState<
      Record<
        string,
        AnyRow[]
      >
    >({});

  // ====================================================
  // AUTH
  // ====================================================

  useEffect(() => {
    if (
      accountLoading
    ) {
      return;
    }

    if (
      !authenticated ||
      !accountId
    ) {
      router.replace(
        "/login",
      );
    }
  }, [
    accountLoading,
    authenticated,
    accountId,
    router,
  ]);

  // ====================================================
  // LOAD
  // ====================================================

  async function load() {
    if (
      !authenticated ||
      !accountId
    ) {
      setRowsByTable(
        {},
      );

      setLoading(
        false,
      );

      return;
    }

    setLoading(
      true,
    );

    try {
      const loaded =
        await Promise.all(
          TABLE_NAMES.map(
            async (
              tableName,
            ) => {
              const tableRows =
                await safeArray(
                  tableName,
                );

              return [
                tableName,

                tableRows.filter(
                  (
                    row,
                  ) =>
                    branchScoped(
                      row,
                      accountId,
                      schoolId,
                      branchId,
                    ),
                ),
              ] as const;
            },
          ),
        );

      setRowsByTable(
        Object.fromEntries(
          loaded,
        ),
      );
    } catch (
      error
    ) {
      console.error(
        "Failed to load branch admin home:",
        error,
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  useEffect(() => {
    if (
      accountLoading ||
      settingsLoading
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
    dataRevision,
  ]);

  const rows =
    rowsByTable;

  // ====================================================
  // IDENTITY
  // ====================================================

  const identity =
    useMemo(() => {
      const membership =
        workspaceMembership(
          openWorkspace,
          activeMembership,
        );

      const storedUser =
        safeJson<AnyRow>(
          "currentUser",
        ) ||
        safeJson<AnyRow>(
          "authUser",
        ) ||
        safeJson<AnyRow>(
          "user",
        );

      const possibleBranchIds =
        [
          branchId,

          openWorkspace
            ?.branchId,

          membership
            ?.branchId,

          membership
            ?.schoolBranchId,

          membership
            ?.branch?.id,

          (
            activeBranch as AnyRow
          )?.id,

          (
            settings as AnyRow
          )?.branchId,

          safeRead(
            "activeBranchId",
          ),
        ]
          .map(
            cleanId,
          )
          .filter(
            Boolean,
          );

      const possibleSchoolIds =
        [
          schoolId,

          openWorkspace
            ?.schoolId,

          membership
            ?.schoolId,

          membership
            ?.school?.id,

          (
            activeSchool as AnyRow
          )?.id,

          (
            settings as AnyRow
          )?.schoolId,

          safeRead(
            "activeSchoolId",
          ),
        ]
          .map(
            cleanId,
          )
          .filter(
            Boolean,
          );

      const branchRows =
        (
          rows.branches ||
          []
        ).filter(
          activeRow,
        );

      const schoolRows =
        (
          rows.schools ||
          []
        ).filter(
          activeRow,
        );

      const branch =
        branchRows.find(
          (
            row,
          ) =>
            possibleBranchIds.includes(
              idOf(
                row,
              ),
            ),
        ) ||
        branchRows.find(
          (
            row,
          ) =>
            possibleSchoolIds.includes(
              cleanId(
                row.schoolId,
              ),
            ),
        ) ||
        branchRows[0] ||
        (
          activeBranch as AnyRow
        ) ||
        membership?.branch ||
        null;

      const resolvedSchoolId =
        cleanId(
          branch?.schoolId,
        ) ||
        possibleSchoolIds[0] ||
        "";

      const school =
        schoolRows.find(
          (
            row,
          ) =>
            idOf(
              row,
            ) ===
            resolvedSchoolId,
        ) ||
        schoolRows.find(
          (
            row,
          ) =>
            possibleSchoolIds.includes(
              idOf(
                row,
              ),
            ),
        ) ||
        schoolRows[0] ||
        (
          activeSchool as AnyRow
        ) ||
        membership?.school ||
        null;

      const userId =
        cleanId(
          membership
            ?.userId ||
            membership
              ?.appUserId ||
            openWorkspace
              ?.membership
              ?.userId ||
            storedUser?.id,
        );

      const appUser =
        (
          rows.appUsers ||
          []
        ).find(
          (
            row,
          ) =>
            idOf(
              row,
            ) ===
            userId,
        ) ||
        (
          rows.appUsers ||
          []
        ).find(
          (
            row,
          ) =>
            cleanId(
              row.email,
            ) ===
            cleanId(
              membership
                ?.email,
            ),
        ) ||
        storedUser ||
        membership?.user ||
        membership?.appUser ||
        null;

      return {
        branch,
        school,

        branchName:
          text(
            branch?.name ||
              membership
                ?.branchName ||
              (
                settings as AnyRow
              )?.branchName,
            "Branch",
          ),

        schoolName:
          text(
            school?.name ||
              membership
                ?.schoolName ||
              (
                settings as AnyRow
              )?.schoolName,
            "School",
          ),

        userName:
          text(
            appUser
              ?.fullName ||
              appUser?.name ||
              openWorkspace
                ?.fullName ||
              openWorkspace
                ?.userName ||
              openWorkspace
                ?.memberName ||
              membership
                ?.fullName ||
              membership
                ?.userName ||
              membership?.name,
            "Administrator",
          ),
      };
    }, [
      rows.branches,
      rows.schools,
      rows.appUsers,

      branchId,
      schoolId,

      openWorkspace,
      activeMembership,

      activeBranch,
      activeSchool,

      settings,
    ]);

  // ====================================================
  // SUMMARY
  // ====================================================

  const summary =
    useMemo(() => {
      const today =
        todayKey();

      const students =
        rows.students ||
        [];

      const teachers =
        rows.teachers ||
        [];

      const classes =
        rows.classes ||
        [];

      const studentAttendance =
        rows.attendance ||
        [];

      const teacherAttendance =
        rows.teacherAttendance ||
        [];

      const todayStudents =
        studentAttendance.filter(
          (
            row,
          ) =>
            String(
              row.date ||
                row.createdAt ||
                "",
            ).startsWith(
              today,
            ),
        );

      const todayTeachers =
        teacherAttendance.filter(
          (
            row,
          ) =>
            String(
              row.date ||
                row.createdAt ||
                "",
            ).startsWith(
              today,
            ),
        );

      const studentPresent =
        todayStudents.filter(
          (
            row,
          ) =>
            String(
              row.status ||
                "",
            )
              .trim()
              .toLowerCase() ===
            "present",
        ).length;

      const studentLate =
        todayStudents.filter(
          (
            row,
          ) =>
            String(
              row.status ||
                "",
            )
              .trim()
              .toLowerCase() ===
            "late",
        ).length;

      const teacherPresent =
        todayTeachers.filter(
          (
            row,
          ) => {
            const status =
              String(
                row.status ||
                  "",
              )
                .trim()
                .toLowerCase();

            return (
              [
                "present",
                "late",
                "on_time",
                "on-time",
              ].includes(
                status,
              ) ||
              Boolean(
                row.clockIn,
              )
            );
          },
        ).length;

      return {
        students:
          count(
            students,
          ),

        teachers:
          count(
            teachers,
          ),

        classes:
          count(
            classes,
          ),

        studentPresent,

        studentLate,

        studentAttending:
          studentPresent +
          studentLate,

        teacherPresent,

        branchName:
          identity.branchName,

        schoolName:
          identity.schoolName,
      };
    }, [
      rows.students,
      rows.teachers,
      rows.classes,
      rows.attendance,
      rows.teacherAttendance,
      identity,
    ]);

  const studentAttendancePercentage =
    summary.students > 0
      ? Math.min(
          100,

          Math.round(
            (
              summary.studentAttending /
              summary.students
            ) *
              100,
          ),
        )
      : 0;

  const teacherAttendancePercentage =
    summary.teachers > 0
      ? Math.min(
          100,

          Math.round(
            (
              summary.teacherPresent /
              summary.teachers
            ) *
              100,
          ),
        )
      : 0;

  // ====================================================
  // UPCOMING — KEEP SHORT
  // ====================================================

  const events =
    useMemo(
      () =>
        (
          rows.calendarEvents ||
          []
        )
          .filter(
            activeRow,
          )
          .sort(
            (
              a,
              b,
            ) =>
              n(
                a.startAt ||
                  a.startDate ||
                  a.date,
              ) -
              n(
                b.startAt ||
                  b.startDate ||
                  b.date,
              ),
          )
          .slice(
            0,
            2,
          ),
      [
        rows.calendarEvents,
      ],
    );

  // ====================================================
  // ANNOUNCEMENTS — KEEP SHORT
  // ====================================================

  const announcements =
    useMemo(
      () =>
        (
          rows.announcements ||
          []
        )
          .filter(
            activeRow,
          )
          .sort(
            (
              a,
              b,
            ) =>
              n(
                b.publishAt ||
                  b.sentAt ||
                  b.updatedAt ||
                  b.createdAt,
              ) -
              n(
                a.publishAt ||
                  a.sentAt ||
                  a.updatedAt ||
                  a.createdAt,
              ),
          )
          .slice(
            0,
            2,
          ),
      [
        rows.announcements,
      ],
    );

  // ====================================================
  // HERO / PORTAL HIGHLIGHTS
  // ====================================================

  const heroSlides =
    useMemo<HeroSlide[]>(
      () => {
        const media =
          (
            rows.mediaAssets ||
            []
          ).filter(
            activeRow,
          );

        const now =
          Date.now();

        const mediaUrl =
          (
            mediaId:
              unknown,
          ) => {
            const asset =
              media.find(
                (
                  row,
                ) =>
                  idOf(
                    row,
                  ) ===
                  cleanId(
                    mediaId,
                  ),
              );

            return text(
              asset
                ?.publicUrl ||
                asset
                  ?.remoteUrl ||
                asset
                  ?.storageUrl ||
                asset
                  ?.downloadUrl ||
                asset
                  ?.localObjectUrl ||
                asset
                  ?.previewDataUrl ||
                asset
                  ?.thumbnailDataUrl,
            );
          };

        const highlightSlides =
          (
            rows.portalHighlights ||
            []
          )
            .filter(
              activeRow,
            )

            .filter(
              (
                row,
              ) =>
                row
                  ?.metadata
                  ?.placement !==
                "gallery",
            )

            .filter(
              (
                row,
              ) => {
                const audiences =
                  Array.isArray(
                    row.audiences,
                  )
                    ? row.audiences.map(
                        (
                          value:
                            unknown,
                        ) =>
                          String(
                            value,
                          ).toLowerCase(),
                      )
                    : [
                        String(
                          row.audience ||
                            row.portal ||
                            row.role ||
                            "all",
                        ).toLowerCase(),
                      ];

                if (
                  !audiences.some(
                    (
                      value:
                        string,
                    ) =>
                      [
                        "all",
                        "branch_admin",
                        "branch-admin",
                        "admin",
                      ].includes(
                        value,
                      ),
                  )
                ) {
                  return false;
                }

                const status =
                  String(
                    row.status ||
                      "published",
                  ).toLowerCase();

                if (
                  ![
                    "published",
                    "scheduled",
                    "active",
                  ].includes(
                    status,
                  )
                ) {
                  return false;
                }

                const startAt =
                  Number(
                    row.startAt ||
                      0,
                  );

                const endAt =
                  Number(
                    row.endAt ||
                      0,
                  );

                if (
                  startAt &&
                  startAt >
                    now
                ) {
                  return false;
                }

                if (
                  endAt &&
                  endAt <
                    now
                ) {
                  return false;
                }

                return true;
              },
            )

            .sort(
              (
                a,
                b,
              ) =>
                n(
                  a.displayOrder ||
                    a.order,
                ) -
                n(
                  b.displayOrder ||
                    b.order,
                ),
            )

            .map(
              (
                row,
                index,
              ):
                HeroSlide |
                null => {
                const type =
                  String(
                    row.mediaType ||
                      "",
                  ).toLowerCase() ===
                  "video"
                    ? "video"
                    : "image";

                const src =
                  mediaUrl(
                    row.mediaAssetId,
                  ) ||
                  (
                    type ===
                    "image"
                      ? text(
                          row.fallbackImageUrl,
                        )
                      : ""
                  );

                const poster =
                  mediaUrl(
                    row.posterMediaAssetId,
                  ) ||
                  text(
                    row.fallbackImageUrl,
                  );

                if (
                  !src
                ) {
                  return null;
                }

                return {
                  id:
                    cleanId(
                      idOf(
                        row,
                      ),
                    ) ||
                    `portal-highlight-${index}`,

                  type,

                  src,

                  poster:
                    poster ||
                    undefined,

                  title:
                    text(
                      row.title,
                    ),

                  subtitle:
                    text(
                      row.subtitle ||
                        row.description,
                    ),

                  durationSeconds:
                    Math.max(
                      3,

                      Math.min(
                        30,

                        n(
                          row.durationSeconds ||
                            7,
                        ),
                      ),
                    ),

                  transition:
                    row.transition ===
                    "slide"
                      ? "slide"
                      : "fade",

                  actionType:
                    text(
                      row.actionType,
                    ),

                  actionLabel:
                    text(
                      row.actionLabel,
                    ),

                  actionValue:
                    text(
                      row.actionValue,
                    ),
                };
              },
            )

            .filter(
              (
                row,
              ):
                row is HeroSlide =>
                Boolean(
                  row,
                ),
            );

        /*
         * Real Portal Highlights take priority.
         */
        if (
          highlightSlides.length
        ) {
          return highlightSlides;
        }

        /*
         * Fallback imagery is only used when there is no
         * configured Portal Highlight.
         */
        const fallbackCandidates =
          [
            mediaUrl(
              (
                settings as AnyRow
              )
                ?.dashboardHeroImageMediaId,
            ),

            (
              settings as AnyRow
            )
              ?.dashboardHeroImage,

            mediaUrl(
              identity
                .branch
                ?.bannerImageMediaId,
            ),

            identity
              .branch
              ?.bannerImage,

            mediaUrl(
              identity
                .school
                ?.bannerImageMediaId,
            ),

            identity
              .school
              ?.bannerImage,

            mediaUrl(
              identity
                .branch
                ?.photoMediaId,
            ),

            identity
              .branch
              ?.photo,

            mediaUrl(
              identity
                .school
                ?.photoMediaId,
            ),

            identity
              .school
              ?.photo,
          ]
            .map(
              (
                value,
              ) =>
                text(
                  value,
                ),
            )
            .filter(
              Boolean,
            );

        if (
          !fallbackCandidates[0]
        ) {
          return [];
        }

        return [
          {
            id:
              "dashboard-fallback-image",

            type:
              "image",

            src:
              fallbackCandidates[0],

            durationSeconds:
              7,

            transition:
              "fade",
          },
        ];
      },
      [
        identity,
        rows.mediaAssets,
        rows.portalHighlights,
        settings,
      ],
    );

  const [
    heroSlideIndex,
    setHeroSlideIndex,
  ] =
    useState(
      0,
    );

  const activeHeroSlide =
    heroSlides[
      heroSlideIndex %
        Math.max(
          1,
          heroSlides.length,
        )
    ] ||
    null;

  useEffect(() => {
    if (
      !heroSlides.length
    ) {
      setHeroSlideIndex(
        0,
      );

      return;
    }

    if (
      heroSlideIndex >=
      heroSlides.length
    ) {
      setHeroSlideIndex(
        0,
      );

      return;
    }

    /*
     * Video slides are expected to advance through their
     * playback-end behaviour.
     */
    if (
      activeHeroSlide
        ?.type ===
      "video"
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          setHeroSlideIndex(
            (
              current,
            ) =>
              (
                current +
                1
              ) %
              heroSlides.length,
          );
        },

        (
          activeHeroSlide
            ?.durationSeconds ||
          7
        ) *
          1000,
      );

    return () =>
      window.clearTimeout(
        timer,
      );
  }, [
    activeHeroSlide
      ?.durationSeconds,

    activeHeroSlide
      ?.id,

    activeHeroSlide
      ?.type,

    heroSlideIndex,

    heroSlides.length,
  ]);

  // ====================================================
  // NAVIGATION
  // ====================================================

  function openRoute(
    routeKey: string,
  ) {
    if (
      navigate
    ) {
      navigate(
        routeKey,
      );

      return;
    }

    try {
      window.dispatchEvent(
        new CustomEvent(
          "eleeveon:portal-route",
          {
            detail: {
              key:
                routeKey,
            },
          },
        ),
      );

      window.dispatchEvent(
        new CustomEvent(
          "role-portal:navigate",
          {
            detail: {
              key:
                routeKey,
            },
          },
        ),
      );

      window.dispatchEvent(
        new CustomEvent(
          "portal:navigate",
          {
            detail:
              routeKey,
          },
        ),
      );
    } catch {}
  }

  function advanceHero() {
    if (
      heroSlides.length <=
      1
    ) {
      return;
    }

    setHeroSlideIndex(
      (
        current,
      ) =>
        (
          current +
          1
        ) %
        heroSlides.length,
    );
  }

  function openHeroAction(
    slide:
      HeroSlide,
  ) {
    if (
      !slide.actionType ||
      slide.actionType ===
        "none"
    ) {
      return;
    }

    if (
      slide.actionType ===
        "portal_route" &&
      slide.actionValue
    ) {
      openRoute(
        slide.actionValue,
      );

      return;
    }

    if (
      slide.actionType ===
        "external_url" &&
      slide.actionValue &&
      typeof window !==
        "undefined"
    ) {
      window.open(
        slide.actionValue,
        "_blank",
        "noopener,noreferrer",
      );

      return;
    }

    if (
      slide.actionType ===
      "announcement"
    ) {
      openRoute(
        "announcements",
      );

      return;
    }

    if (
      slide.actionType ===
      "calendar_event"
    ) {
      openRoute(
        "calendar",
      );
    }
  }

  // ====================================================
  // DISPLAY
  // ====================================================

  const branchRecord =
    identity.branch;

  const schoolRecord =
    identity.school;

  const motto =
    text(
      (
        settings as AnyRow
      )?.motto ||
        branchRecord?.motto ||
        schoolRecord?.motto,

      "Learning today. Leading tomorrow.",
    );

  const userName =
    identity.userName;

  const hour =
    new Date()
      .getHours();

  const greeting =
    hour < 12
      ? "Good morning"
      : hour < 17
        ? "Good afternoon"
        : "Good evening";

  const heroStats =
    [
      {
        label:
          "Students",

        value:
          summary.students,
      },

      {
        label:
          "Teachers",

        value:
          summary.teachers,
      },

      {
        label:
          "Classes",

        value:
          summary.classes,
      },
    ];

  // ====================================================
  // STATES
  // ====================================================

  if (
    loading ||
    accountLoading ||
    settingsLoading
  ) {
    return (
      <DashboardBackground
        primaryColor={
          primary
        }
      >
        <section className="eds-dashboard-state">
          <div className="eds-dashboard-state-spinner" />

          <h2>
            Opening branch home...
          </h2>

          <p>
            Preparing highlights,
            attendance and today's
            school information.
          </p>
        </section>
      </DashboardBackground>
    );
  }

  if (
    !authenticated ||
    !accountId
  ) {
    return (
      <DashboardBackground
        primaryColor={
          primary
        }
      >
        <section className="eds-dashboard-state">
          <h2>
            Redirecting to login...
          </h2>

          <p>
            You must sign in before
            viewing the branch home.
          </p>
        </section>
      </DashboardBackground>
    );
  }

  // ====================================================
  // HOME
  // ====================================================

  return (
    <DashboardBackground
      primaryColor={
        primary
      }
    >
      <style>
        {dashboardCss}
      </style>

      <main className="branch-admin-home">
        {/* ===============================================
         * HERO / PORTAL HIGHLIGHTS
         * ===============================================
         *
         * This is now the first visible Home content.
         *
         * The old four-action strip has been removed.
         */}

        <WelcomeHero
          greeting={
            greeting
          }
          name={
            userName
          }
          schoolName={
            summary.schoolName
          }
          branchName={
            summary.branchName
          }
          motto={
            motto
          }
          slide={
            activeHeroSlide
          }
          slides={
            heroSlides
          }
          slideIndex={
            heroSlideIndex
          }
          stats={
            heroStats
          }
          onAdvance={
            advanceHero
          }
          onSlideChange={
            setHeroSlideIndex
          }
          onSlideAction={() => {
            if (
              activeHeroSlide
            ) {
              openHeroAction(
                activeHeroSlide,
              );
            }
          }}
        />

        {/* ===============================================
         * ATTENDANCE
         * =============================================== */}

        <DashboardWidget>
          <DashboardSection
            eyebrow="Today"
            title="Attendance"
          >
            <div className="branch-attendance-summary">
              <button
                type="button"
                className="branch-attendance-card"
                onClick={() =>
                  openRoute(
                    "studentAttendance",
                  )
                }
              >
                <span className="branch-attendance-icon">
                  <AttendanceIcon />
                </span>

                <span className="branch-attendance-copy">
                  <small>
                    Students
                  </small>

                  <strong>
                    {
                      studentAttendancePercentage
                    }
                    %
                  </strong>

                  <em>
                    {
                      summary.studentAttending
                    }
                    {" of "}
                    {
                      summary.students
                    }
                  </em>
                </span>
              </button>

              <button
                type="button"
                className="branch-attendance-card"
                onClick={() =>
                  openRoute(
                    "teacherAttendance",
                  )
                }
              >
                <span className="branch-attendance-icon">
                  <TeacherIcon />
                </span>

                <span className="branch-attendance-copy">
                  <small>
                    Teachers
                  </small>

                  <strong>
                    {
                      teacherAttendancePercentage
                    }
                    %
                  </strong>

                  <em>
                    {
                      summary.teacherPresent
                    }
                    {" of "}
                    {
                      summary.teachers
                    }
                  </em>
                </span>
              </button>
            </div>
          </DashboardSection>
        </DashboardWidget>

        {/* ===============================================
         * SMALL HOME FEED
         * =============================================== */}

        <DashboardWidgets>
          <DashboardWidget>
            <DashboardSection
              eyebrow="School day"
              title="Upcoming"
              action={
                <button
                  type="button"
                  onClick={() =>
                    openRoute(
                      "calendar",
                    )
                  }
                >
                  Calendar
                </button>
              }
            >
              <CalendarPreview
                items={
                  events.map(
                    (
                      event,
                      index,
                    ) => ({
                      id:
                        idOf(
                          event,
                        ) ||
                        String(
                          index,
                        ),

                      date:
                        dateLabel(
                          event.startAt ||
                            event.startDate ||
                            event.date,
                        ),

                      title:
                        text(
                          event.title ||
                            event.name,

                          "School event",
                        ),

                      description:
                        text(
                          event.location ||
                            event.venue,

                          "School calendar",
                        ),

                      onClick:
                        () =>
                          openRoute(
                            "calendar",
                          ),
                    }),
                  )
                }
              />
            </DashboardSection>
          </DashboardWidget>

          <DashboardWidget>
            <DashboardSection
              eyebrow="Notice board"
              title="Announcements"
              action={
                <button
                  type="button"
                  onClick={() =>
                    openRoute(
                      "announcements",
                    )
                  }
                >
                  View all
                </button>
              }
            >
              <ActivityFeed
                items={
                  announcements.map(
                    (
                      item,
                      index,
                    ) => ({
                      id:
                        idOf(
                          item,
                        ) ||
                        String(
                          index,
                        ),

                      title:
                        text(
                          item.title,

                          "Announcement",
                        ),

                      meta:
                        text(
                          item.message ||
                            item.body ||
                            item.content,

                          "Open to read this school update.",
                        ).slice(
                          0,
                          90,
                        ),

                      icon:
                        "📣",

                      onClick:
                        () =>
                          openRoute(
                            "announcements",
                          ),
                    }),
                  )
                }
                emptyText="No announcements published."
              />
            </DashboardSection>
          </DashboardWidget>
        </DashboardWidgets>
      </main>
    </DashboardBackground>
  );
}

// ======================================================
// CSS
// ======================================================

const dashboardCss = `
/*
 * =====================================================
 * HOME LAYOUT
 * =====================================================
 */

.branch-admin-home {
  width:
    100%;

  min-width:
    0;

  max-width:
    1180px;

  margin:
    0 auto;

  display:
    grid;

  gap:
    10px;
}

/*
 * =====================================================
 * ONE AND ONLY ONE PAGE SCROLL
 * =====================================================
 *
 * The RolePortalShell/browser owns vertical scrolling.
 *
 * None of the dashboard wrappers may become another
 * vertical scrolling viewport.
 */

.branch-admin-home,
.eds-dashboard-background,
.eds-dashboard,
.eds-dashboard-inner,
.eds-dashboard-content,
.eds-dashboard-state,
.eds-dashboard-widgets,
.eds-dashboard-widget,
.eds-dashboard-section,
.eds-dashboard-hero,
.eds-welcome-hero {
  height:
    auto !important;

  max-height:
    none !important;

  overflow-y:
    visible !important;

  overscroll-behavior-y:
    auto !important;

  scrollbar-gutter:
    auto !important;
}

/*
 * Also prevent outer portal content wrappers from becoming
 * a second vertical scroller while Home is mounted.
 */

.app-main,
.app-content,
.app-content-inner,
.shell-portal-content,
.shell-content-background {
  height:
    auto !important;

  max-height:
    none !important;

  overflow-y:
    visible !important;
}

/*
 * Horizontal clipping is fine.
 * Vertical clipping/scrolling is not.
 */

.branch-admin-home,
.eds-dashboard-background,
.eds-dashboard,
.eds-dashboard-inner {
  overflow-x:
    clip !important;
}

/*
 * =====================================================
 * HERO
 * =====================================================
 *
 * The four shortcut cards are gone.
 *
 * We use part of that reclaimed space to make Portal
 * Highlights feel more like the Gospel Library feature
 * carousel without letting the hero consume the complete
 * screen.
 */

.branch-admin-home
:is(
  .eds-dashboard-hero,
  .eds-welcome-hero
) {
  width:
    100%;

  min-height:
    clamp(
      420px,
      44dvh,
      560px
    ) !important;

  margin:
    0 !important;
}

/*
 * =====================================================
 * ATTENDANCE
 * =====================================================
 */

.branch-attendance-summary {
  display:
    grid;

  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );

  gap:
    8px;
}

.branch-attendance-card {
  min-width:
    0;

  min-height:
    70px;

  display:
    grid;

  grid-template-columns:
    32px
    minmax(0, 1fr);

  align-items:
    center;

  gap:
    8px;

  border:
    1px solid
    var(
      --eds-border,
      var(--border, rgba(0,0,0,.09))
    );

  border-radius:
    14px;

  padding:
    7px 8px;

  background:
    var(
      --eds-surface,
      var(--surface, #ffffff)
    );

  color:
    inherit;

  text-align:
    left;

  cursor:
    pointer;

  box-shadow:
    0 4px 12px
    rgba(15,23,42,.045);
}

.branch-attendance-icon {
  width:
    32px;

  height:
    32px;

  display:
    grid;

  place-items:
    center;

  border-radius:
    10px;

  background:
    var(
      --eds-primary-softer,
      color-mix(
        in srgb,
        var(
          --primary-color,
          #2563eb
        ) 8%,
        transparent
      )
    );

  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
}

.branch-attendance-icon
svg {
  width:
    18px;

  height:
    18px;
}

.branch-attendance-copy {
  min-width:
    0;
}

.branch-attendance-copy
small,
.branch-attendance-copy
strong,
.branch-attendance-copy
em {
  display:
    block;
}

.branch-attendance-copy
small {
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    8px;

  font-weight:
    850;

  letter-spacing:
    .035em;

  text-transform:
    uppercase;
}

.branch-attendance-copy
strong {
  margin-top:
    2px;

  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );

  font-size:
    21px;

  line-height:
    1;

  font-weight:
    950;
}

.branch-attendance-copy
em {
  margin-top:
    3px;

  overflow:
    hidden;

  white-space:
    nowrap;

  text-overflow:
    ellipsis;

  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    8px;

  font-style:
    normal;

  font-weight:
    650;
}

/*
 * =====================================================
 * WIDGETS
 * =====================================================
 */

.branch-admin-home
.eds-dashboard-widgets {
  gap:
    10px !important;
}

.branch-admin-home
.eds-dashboard-widget {
  min-width:
    0;

  margin:
    0 !important;
}

/*
 * =====================================================
 * MOBILE
 * =====================================================
 */

@media (
  max-width: 699px
) {
  .branch-admin-home {
    gap:
      8px;
  }

  /*
   * Slightly taller than the previous Home hero because
   * the four navigation cards have been removed.
   */
  .branch-admin-home
  :is(
    .eds-dashboard-hero,
    .eds-welcome-hero
  ) {
    min-height:
      clamp(
        490px,
        46dvh,
        590px
      ) !important;
  }

  .branch-attendance-card {
    min-height:
      66px;

    padding:
      6px 7px;
  }

  .branch-attendance-copy
  strong {
    font-size:
      19px;
  }
}
`;