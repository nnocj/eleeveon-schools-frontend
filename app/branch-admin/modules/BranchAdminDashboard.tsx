"use client";

/**
 * app/branch-admin/modules/BranchAdminDashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH ADMIN HOME
 * ---------------------------------------------------------
 *
 * Compact mobile-first Home inspired by the information
 * hierarchy of apps such as Gospel Library.
 *
 * HOME RESPONSIBILITY
 * ---------------------------------------------------------
 * Home shows what matters now:
 *
 * 1. Portal Highlights
 * 2. Attendance snapshot
 * 3. Upcoming events
 * 4. Announcements
 *
 * Navigation belongs elsewhere:
 *
 * - Header Search = find anything
 * - Library       = discover modules
 * - Screens       = return to opened/recent work
 *
 * HERO
 * ---------------------------------------------------------
 * The hero no longer displays:
 *
 * - greeting
 * - user name
 * - school name
 * - branch name
 * - school motto
 * - student/teacher/class statistics
 *
 * This releases the entire hero area for imagery/video.
 *
 * DEFAULT HERO ASSETS
 * ---------------------------------------------------------
 * Put these exact files in /public:
 *
 * /public/pathways-to-possibility.png
 * /public/building-the-future.png
 * /public/knowledge-in-motion.png
 *
 * Actual Portal Highlights override these defaults.
 *
 * SCROLL OWNERSHIP
 * ---------------------------------------------------------
 * This file intentionally does NOT use DashboardBackground
 * or WelcomeHero.
 *
 * Everything is normal document-flow content.
 * There is no page-level overflow:auto and no 100vh wrapper.
 *
 * The browser/document is the one page scrollbar.
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
// DEFAULT HERO SLIDES
// ======================================================

const DEFAULT_HERO_SLIDES:
  HeroSlide[] = [
    {
      id:
        "pathways-to-possibility",

      type:
        "image",

      src:
        "/pathways-to-possibility.png",

      durationSeconds:
        7,

      transition:
        "fade",
    },

    {
      id:
        "building-the-future",

      type:
        "image",

      src:
        "/building-the-future.png",

      durationSeconds:
        7,

      transition:
        "fade",
    },

    {
      id:
        "knowledge-in-motion",

      type:
        "image",

      src:
        "/knowledge-in-motion.png",

      durationSeconds:
        7,

      transition:
        "fade",
    },
  ];

// ======================================================
// HOME DATA ONLY
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
// STORAGE HELPERS
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
    args.openWorkspace
      ?.schoolId,

    membership
      ?.schoolId,

    membership
      ?.school?.id,

    args.activeSchoolId,

    args.activeSchool
      ?.id,

    args.settings
      ?.schoolId,

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
    args.openWorkspace
      ?.branchId,

    membership
      ?.branchId,

    membership
      ?.schoolBranchId,

    membership
      ?.branch?.id,

    args.activeBranchId,

    args.activeBranch
      ?.id,

    args.settings
      ?.branchId,

    safeRead(
      "activeBranchId",
    ),
  );
}

// ======================================================
// DATA SCOPE
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
// DATE HELPERS
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
// HERO MEDIA
// ======================================================

function HeroMedia({
  slide,
  onEnded,
}: {
  slide:
    HeroSlide;

  onEnded():
    void;
}) {
  if (
    slide.type ===
    "video"
  ) {
    return (
      <video
        key={
          slide.id
        }
        src={
          slide.src
        }
        poster={
          slide.poster
        }
        className="branch-home-hero-media"
        autoPlay
        muted
        playsInline
        preload="metadata"
        onEnded={
          onEnded
        }
      />
    );
  }

  return (
    <img
      key={
        slide.id
      }
      src={
        slide.src
      }
      alt=""
      className="branch-home-hero-media"
    />
  );
}

// ======================================================
// DASHBOARD
// ======================================================

export default function BranchAdminDashboard({
  navigate,
  navSections,
}: RouteProps) {
  /*
   * Kept for compatibility with branch-admin/page.tsx.
   * Module discovery belongs to Library/Search.
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
        schoolRows[0] ||
        (
          activeSchool as AnyRow
        ) ||
        membership?.school ||
        null;

      return {
        branch,
        school,
      };
    }, [
      rows.branches,
      rows.schools,

      branchId,
      schoolId,

      openWorkspace,
      activeMembership,

      activeBranch,
      activeSchool,

      settings,
    ]);

  // ====================================================
  // ATTENDANCE
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

      const presentStudents =
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

      const lateStudents =
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

      const presentTeachers =
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

        studentAttending:
          presentStudents +
          lateStudents,

        teacherPresent:
          presentTeachers,
      };
    }, [
      rows.students,
      rows.teachers,
      rows.attendance,
      rows.teacherAttendance,
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
  // UPCOMING
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
  // ANNOUNCEMENTS
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
  // PORTAL HIGHLIGHTS
  // ====================================================

  const heroSlides =
    useMemo<
      HeroSlide[]
    >(() => {
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
            asset?.publicUrl ||
              asset?.remoteUrl ||
              asset?.storageUrl ||
              asset?.downloadUrl ||
              asset?.localObjectUrl ||
              asset?.previewDataUrl ||
              asset?.thumbnailDataUrl,
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
       * School/platform supplied highlights win.
       *
       * Otherwise use the three bundled Eleeveon defaults.
       */
      return highlightSlides.length
        ? highlightSlides
        : DEFAULT_HERO_SLIDES;
    }, [
      rows.mediaAssets,
      rows.portalHighlights,
      identity,
    ]);

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
  // STATES
  // ====================================================

  if (
    loading ||
    accountLoading ||
    settingsLoading
  ) {
    return (
      <main
        className="branch-home-page"
        style={
          {
            "--branch-home-primary":
              primary,
          } as React.CSSProperties
        }
      >
        <style>
          {css}
        </style>

        <section className="branch-home-state">
          <div className="branch-home-spinner" />

          <strong>
            Opening branch home...
          </strong>

          <span>
            Preparing your dashboard.
          </span>
        </section>
      </main>
    );
  }

  if (
    !authenticated ||
    !accountId
  ) {
    return (
      <main className="branch-home-page">
        <style>
          {css}
        </style>

        <section className="branch-home-state">
          <strong>
            Redirecting to login...
          </strong>
        </section>
      </main>
    );
  }

  // ====================================================
  // HOME
  // ====================================================

  return (
    <main
      className="branch-home-page"
      style={
        {
          "--branch-home-primary":
            primary,
        } as React.CSSProperties
      }
    >
      <style>
        {css}
      </style>

      {/* =================================================
       * HERO
       * ================================================= */}

      {activeHeroSlide ? (
        <>
          <section className="branch-home-hero">
            <HeroMedia
              slide={
                activeHeroSlide
              }
              onEnded={
                advanceHero
              }
            />

            {/*
             * User/school identity text has been removed.
             *
             * Real Portal Highlights may still supply their
             * own editorial title/subtitle/action.
             */}
            {activeHeroSlide.title ||
            activeHeroSlide.subtitle ||
            activeHeroSlide.actionLabel ? (
              <div className="branch-home-highlight-caption">
                {activeHeroSlide.title ? (
                  <strong>
                    {
                      activeHeroSlide.title
                    }
                  </strong>
                ) : null}

                {activeHeroSlide.subtitle ? (
                  <span>
                    {
                      activeHeroSlide.subtitle
                    }
                  </span>
                ) : null}

                {activeHeroSlide.actionLabel &&
                activeHeroSlide.actionType &&
                activeHeroSlide.actionType !==
                  "none" ? (
                  <button
                    type="button"
                    onClick={() =>
                      openHeroAction(
                        activeHeroSlide,
                      )
                    }
                  >
                    {
                      activeHeroSlide.actionLabel
                    }
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          {heroSlides.length >
          1 ? (
            <div
              className="branch-home-hero-dots"
              aria-label="Portal highlights"
            >
              {heroSlides.map(
                (
                  slide,
                  index,
                ) => (
                  <button
                    key={
                      slide.id
                    }
                    type="button"
                    className={
                      index ===
                      heroSlideIndex
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setHeroSlideIndex(
                        index,
                      )
                    }
                    aria-label={`Show highlight ${index + 1}`}
                  />
                ),
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {/* =================================================
       * ATTENDANCE
       * ================================================= */}

      <section className="branch-home-section">
        <header className="branch-home-section-head">
          <span>
            Today
          </span>

          <h2>
            Attendance
          </h2>
        </header>

        <div className="branch-attendance-grid">
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
      </section>

      {/* =================================================
       * UPCOMING
       * ================================================= */}

      <section className="branch-home-section">
        <header className="branch-home-section-head horizontal">
          <div>
            <span>
              School day
            </span>

            <h2>
              Upcoming
            </h2>
          </div>

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
        </header>

        <div className="branch-home-list">
          {events.length ? (
            events.map(
              (
                event,
                index,
              ) => (
                <button
                  type="button"
                  className="branch-home-row"
                  key={
                    idOf(
                      event,
                    ) ||
                    String(
                      index,
                    )
                  }
                  onClick={() =>
                    openRoute(
                      "calendar",
                    )
                  }
                >
                  <span className="branch-home-date">
                    {dateLabel(
                      event.startAt ||
                        event.startDate ||
                        event.date,
                    )}
                  </span>

                  <span className="branch-home-row-copy">
                    <strong>
                      {text(
                        event.title ||
                          event.name,

                        "School event",
                      )}
                    </strong>

                    <small>
                      {text(
                        event.location ||
                          event.venue,

                        "School calendar",
                      )}
                    </small>
                  </span>

                  <b>
                    ›
                  </b>
                </button>
              ),
            )
          ) : (
            <div className="branch-home-empty">
              No upcoming events.
            </div>
          )}
        </div>
      </section>

      {/* =================================================
       * ANNOUNCEMENTS
       * ================================================= */}

      <section className="branch-home-section">
        <header className="branch-home-section-head horizontal">
          <div>
            <span>
              Notice board
            </span>

            <h2>
              Announcements
            </h2>
          </div>

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
        </header>

        <div className="branch-home-list">
          {announcements.length ? (
            announcements.map(
              (
                item,
                index,
              ) => (
                <button
                  type="button"
                  className="branch-home-row"
                  key={
                    idOf(
                      item,
                    ) ||
                    String(
                      index,
                    )
                  }
                  onClick={() =>
                    openRoute(
                      "announcements",
                    )
                  }
                >
                  <span className="branch-home-announcement-icon">
                    📣
                  </span>

                  <span className="branch-home-row-copy">
                    <strong>
                      {text(
                        item.title,

                        "Announcement",
                      )}
                    </strong>

                    <small>
                      {text(
                        item.message ||
                          item.body ||
                          item.content,

                        "Open to read this school update.",
                      ).slice(
                        0,
                        90,
                      )}
                    </small>
                  </span>

                  <b>
                    ›
                  </b>
                </button>
              ),
            )
          ) : (
            <div className="branch-home-empty">
              No announcements published.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
/*
 * =====================================================
 * PAGE
 * =====================================================
 *
 * NO:
 *
 * height: 100vh
 * height: 100dvh
 * overflow-y: auto
 * overflow-y: scroll
 *
 * The document owns scrolling.
 */

.branch-home-page {
  width:
    100%;

  min-width:
    0;

  max-width:
    900px;

  margin:
    0 auto;

  padding:
    8px 8px
    10px;

  display:
    grid;

  gap:
    10px;

  background:
    transparent;

  color:
    var(
      --eds-text,
      var(--text, #111827)
    );

  overflow:
    visible;
}

/*
 * Critical single-scroll ownership.
 *
 * Undo any dashboard/page-level scrolling styles inherited
 * from older dashboard generations.
 */

.branch-home-page,
.branch-home-page *,
.app-content,
.app-content-inner,
.shell-portal-content,
.shell-content-background {
  max-height:
    none;
}

.branch-home-page {
  height:
    auto !important;

  min-height:
    0 !important;

  overflow-y:
    visible !important;
}

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
 * Do not add another min-height:100vh from old dashboard
 * background components because this dashboard no longer
 * uses those components.
 */

.branch-home-page
button {
  font:
    inherit;
}

/*
 * =====================================================
 * HERO
 * =====================================================
 */

.branch-home-hero {
  position:
    relative;

  width:
    100%;

  height:
    clamp(
      420px,
      50dvh,
      570px
    );

  overflow:
    hidden;

  border-radius:
    28px;

  background:
    #0f172a;

  border:
    1px solid
    var(
      --eds-border,
      rgba(0,0,0,.08)
    );

  box-shadow:
    0 12px 32px
    rgba(15,23,42,.10);
}

.branch-home-hero-media {
  position:
    absolute;

  inset:
    0;

  width:
    100% !important;

  height:
    100% !important;

  max-width:
    none !important;

  object-fit:
    cover;

  object-position:
    center;

  display:
    block;
}

/*
 * Only editorial Portal Highlight text appears here.
 *
 * Default Eleeveon slides contain no text overlay.
 */

.branch-home-highlight-caption {
  position:
    absolute;

  left:
    16px;

  right:
    16px;

  bottom:
    16px;

  display:
    grid;

  justify-items:
    start;

  gap:
    5px;

  padding:
    14px;

  border-radius:
    18px;

  background:
    linear-gradient(
      135deg,
      rgba(7,18,36,.80),
      rgba(7,18,36,.55)
    );

  color:
    #ffffff;

  backdrop-filter:
    blur(12px);
}

.branch-home-highlight-caption
strong {
  font-size:
    18px;

  line-height:
    1.15;

  font-weight:
    900;
}

.branch-home-highlight-caption
span {
  font-size:
    11px;

  line-height:
    1.45;

  color:
    rgba(255,255,255,.82);
}

.branch-home-highlight-caption
button {
  min-height:
    34px;

  margin-top:
    4px;

  border:
    0;

  border-radius:
    999px;

  padding:
    0 14px;

  background:
    #ffffff;

  color:
    #111827;

  font-size:
    10px;

  font-weight:
    850;

  cursor:
    pointer;
}

.branch-home-hero-dots {
  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  gap:
    6px;

  min-height:
    18px;
}

.branch-home-hero-dots
button {
  width:
    7px;

  height:
    7px;

  border:
    0;

  border-radius:
    999px;

  padding:
    0;

  background:
    color-mix(
      in srgb,
      var(
        --branch-home-primary,
        #2563eb
      ) 28%,
      transparent
    );

  cursor:
    pointer;

  transition:
    width .18s ease,
    background-color .18s ease;
}

.branch-home-hero-dots
button.active {
  width:
    20px;

  background:
    var(
      --branch-home-primary,
      #2563eb
    );
}

/*
 * =====================================================
 * SECTIONS
 * =====================================================
 */

.branch-home-section {
  min-width:
    0;

  display:
    grid;

  gap:
    10px;

  padding:
    14px;

  border:
    1px solid
    var(
      --eds-border,
      var(--border, rgba(15,23,42,.08))
    );

  border-radius:
    22px;

  background:
    var(
      --eds-surface,
      var(--surface, #ffffff)
    );

  box-shadow:
    0 6px 20px
    rgba(15,23,42,.045);
}

.branch-home-section-head {
  min-width:
    0;
}

.branch-home-section-head.horizontal {
  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap:
    12px;
}

.branch-home-section-head
span {
  display:
    block;

  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    9px;

  font-weight:
    850;

  letter-spacing:
    .07em;

  text-transform:
    uppercase;
}

.branch-home-section-head
h2 {
  margin:
    3px 0 0;

  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );

  font-size:
    20px;

  line-height:
    1.1;

  font-weight:
    850;
}

.branch-home-section-head
> button,
.branch-home-section-head
.horizontal
button {
  flex:
    0 0 auto;

  min-height:
    32px;

  border:
    0;

  border-radius:
    999px;

  padding:
    0 11px;

  background:
    var(
      --eds-primary-softer,
      color-mix(
        in srgb,
        var(
          --branch-home-primary,
          #2563eb
        ) 8%,
        transparent
      )
    );

  color:
    var(
      --branch-home-primary,
      #2563eb
    );

  font-size:
    9px;

  font-weight:
    850;

  cursor:
    pointer;
}

/*
 * =====================================================
 * ATTENDANCE
 * =====================================================
 */

.branch-attendance-grid {
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
      var(--border, rgba(15,23,42,.08))
    );

  border-radius:
    15px;

  padding:
    7px 8px;

  background:
    color-mix(
      in srgb,
      var(
        --eds-bg,
        var(--bg, #f5f7fb)
      ) 70%,
      var(
        --eds-surface,
        #ffffff
      )
    );

  color:
    inherit;

  text-align:
    left;

  cursor:
    pointer;
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
    color-mix(
      in srgb,
      var(
        --branch-home-primary,
        #2563eb
      ) 9%,
      transparent
    );

  color:
    var(
      --branch-home-primary,
      #2563eb
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
 * HOME LISTS
 * =====================================================
 */

.branch-home-list {
  display:
    grid;

  gap:
    6px;
}

.branch-home-row {
  width:
    100%;

  min-width:
    0;

  min-height:
    58px;

  display:
    grid;

  grid-template-columns:
    auto
    minmax(0, 1fr)
    auto;

  align-items:
    center;

  gap:
    9px;

  border:
    0;

  border-radius:
    14px;

  padding:
    8px;

  background:
    color-mix(
      in srgb,
      var(
        --eds-bg,
        var(--bg, #f5f7fb)
      ) 72%,
      var(
        --eds-surface,
        #ffffff
      )
    );

  color:
    inherit;

  text-align:
    left;

  cursor:
    pointer;
}

.branch-home-date {
  min-width:
    56px;

  height:
    38px;

  display:
    grid;

  place-items:
    center;

  border-radius:
    11px;

  background:
    color-mix(
      in srgb,
      var(
        --branch-home-primary,
        #2563eb
      ) 9%,
      transparent
    );

  color:
    var(
      --branch-home-primary,
      #2563eb
    );

  font-size:
    9px;

  font-weight:
    850;
}

.branch-home-announcement-icon {
  width:
    38px;

  height:
    38px;

  display:
    grid;

  place-items:
    center;

  border-radius:
    11px;

  background:
    color-mix(
      in srgb,
      var(
        --branch-home-primary,
        #2563eb
      ) 9%,
      transparent
    );

  font-size:
    17px;
}

.branch-home-row-copy {
  min-width:
    0;
}

.branch-home-row-copy
strong,
.branch-home-row-copy
small {
  display:
    block;

  overflow:
    hidden;

  text-overflow:
    ellipsis;
}

.branch-home-row-copy
strong {
  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );

  font-size:
    11px;

  font-weight:
    850;

  white-space:
    nowrap;
}

.branch-home-row-copy
small {
  margin-top:
    3px;

  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    9px;

  line-height:
    1.35;

  display:
    -webkit-box;

  -webkit-box-orient:
    vertical;

  -webkit-line-clamp:
    2;

  overflow:
    hidden;
}

.branch-home-row
> b {
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    20px;

  font-weight:
    500;
}

.branch-home-empty {
  min-height:
    56px;

  display:
    grid;

  place-items:
    center;

  border-radius:
    14px;

  background:
    color-mix(
      in srgb,
      var(
        --eds-bg,
        #f5f7fb
      ) 72%,
      var(
        --eds-surface,
        #ffffff
      )
    );

  color:
    var(
      --eds-text-muted,
      #64748b
    );

  font-size:
    10px;

  font-weight:
    650;
}

/*
 * =====================================================
 * STATES
 * =====================================================
 */

.branch-home-state {
  min-height:
    220px;

  display:
    grid;

  place-items:
    center;

  align-content:
    center;

  gap:
    8px;

  text-align:
    center;
}

.branch-home-state
strong {
  color:
    var(
      --eds-text-strong,
      #111827
    );

  font-size:
    15px;
}

.branch-home-state
span {
  color:
    var(
      --eds-text-muted,
      #64748b
    );

  font-size:
    10px;
}

.branch-home-spinner {
  width:
    34px;

  height:
    34px;

  border:
    3px solid
    color-mix(
      in srgb,
      var(
        --branch-home-primary,
        #2563eb
      ) 17%,
      transparent
    );

  border-top-color:
    var(
      --branch-home-primary,
      #2563eb
    );

  border-radius:
    999px;

  animation:
    branchHomeSpin
    .8s
    linear
    infinite;
}

@keyframes branchHomeSpin {
  to {
    transform:
      rotate(
        360deg
      );
  }
}

/*
 * =====================================================
 * MOBILE
 * =====================================================
 */

@media (
  max-width: 699px
) {
  .branch-home-page {
    padding:
      6px 6px
      8px;

    gap:
      8px;
  }

  .branch-home-hero {
    /*
     * Larger because the old four quick-action cards are
     * gone and the hero is now primarily visual.
     */
    height:
      clamp(
        440px,
        50dvh,
        580px
      );

    border-radius:
      24px;
  }

  .branch-home-section {
    padding:
      12px;

    border-radius:
      19px;
  }

  .branch-attendance-card {
    min-height:
      66px;
  }
}
`;