"use client";

/**
 * app/branch-admin/modules/BranchAdminDashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH ADMIN HOME
 * ---------------------------------------------------------
 *
 * Golden Standard branch home.
 *
 * Design:
 * - Portal Highlights lead the dashboard.
 * - Same hero height/proportion as Teacher Dashboard.
 * - Hero is visual only: no greeting, user name, school name,
 *   branch name, motto or statistics over the image.
 * - Portal Highlights take precedence over default public images.
 * - Default public hero rotation:
 *     /pathways-to-possibility.png
 *     /building-the-future.png
 *     /knowledge-in-motion.png
 * - No local dashboard search bar. Portal header owns search.
 * - No quick-action strip. Explore owns module discovery.
 * - Two compact attendance percentage cards.
 * - Compact Upcoming and Announcements sections.
 * - One document/window scroll.
 * - Branch scoped, offline-first and theme safe.
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

  durationSeconds: number;

  transition:
    | "fade"
    | "slide";

  actionType?: string;

  actionLabel?: string;

  actionValue?: string;
};

const OPEN_WORKSPACE_KEY =
  "eleeveon_open_workspace";

const DEFAULT_HERO_SLIDES: HeroSlide[] = [
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

const TABLE_NAMES = [
  "schools",
  "branches",
  "appUsers",

  "students",
  "teachers",
  "parents",
  "classes",
  "studentEnrollments",

  "attendance",
  "teacherAttendance",

  "announcements",
  "calendarEvents",

  "portalHighlights",
  "mediaAssets",
] as const;

type OpenWorkspaceSession = {
  membership?:
    AnyRow | null;

  membershipId?:
    string | null;

  role?:
    string | null;

  schoolId?:
    string | number | null;

  branchId?:
    string | number | null;

  teacherLocalId?:
    string | number | null;

  studentLocalId?:
    string | number | null;

  parentLocalId?:
    string | number | null;

  memberName?:
    string | null;

  fullName?:
    string | null;

  userName?:
    string | null;

  openedAt?:
    number;
};

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
  OpenWorkspaceSession | null {
  return safeJson<OpenWorkspaceSession>(
    OPEN_WORKSPACE_KEY,
  );
}

function readStoredActiveMembership():
  AnyRow | null {
  return safeJson<AnyRow>(
    "activeMembership",
  );
}

function cleanId(
  value: unknown,
) {
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

function firstId(
  ...values: unknown[]
) {
  for (
    const value
    of values
  ) {
    const parsed =
      cleanId(
        value,
      );

    if (parsed) {
      return parsed;
    }
  }

  return "";
}

function sameId(
  a: unknown,
  b: unknown,
) {
  const left =
    cleanId(
      a,
    );

  const right =
    cleanId(
      b,
    );

  return Boolean(
    left &&
    right &&
    left === right,
  );
}

function n(
  value: unknown,
) {
  const parsed =
    Number(
      value ?? 0,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function text(
  value: unknown,
  fallback = "",
) {
  return (
    String(
      value ?? "",
    ).trim() ||
    fallback
  );
}

function idOf(
  row?: AnyRow | null,
) {
  return (
    row?.id ??
    row?.localId ??
    row?.cloudId ??
    row?.payload?.id ??
    row?.payload?.localId
  );
}

function activeRow(
  row?: AnyRow | null,
) {
  if (
    !row ||
    row.isDeleted === true ||
    row.active === false
  ) {
    return false;
  }

  const status =
    text(
      row.status,
    ).toLowerCase();

  return ![
    "deleted",
    "archived",
    "inactive",
    "disabled",
    "withdrawn",
    "cancelled",
  ].includes(
    status,
  );
}

function workspaceMembership(
  openWorkspace?:
    OpenWorkspaceSession | null,

  activeMembership?:
    AnyRow | null,
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
      OpenWorkspaceSession | null;

    activeMembership?:
      AnyRow | null;

    activeSchoolId?:
      unknown;

    activeSchool?:
      AnyRow | null;

    settings?:
      AnyRow | null;
  },
) {
  const membership =
    workspaceMembership(
      args.openWorkspace,
      args.activeMembership,
    );

  return firstId(
    args.openWorkspace
      ?.schoolId,

    membership
      ?.schoolId,

    membership
      ?.school
      ?.id,

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
      OpenWorkspaceSession | null;

    activeMembership?:
      AnyRow | null;

    activeBranchId?:
      unknown;

    activeBranch?:
      AnyRow | null;

    settings?:
      AnyRow | null;
  },
) {
  const membership =
    workspaceMembership(
      args.openWorkspace,
      args.activeMembership,
    );

  return firstId(
    args.openWorkspace
      ?.branchId,

    membership
      ?.branchId,

    membership
      ?.schoolBranchId,

    membership
      ?.branch
      ?.id,

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

function sameAccount(
  row: AnyRow,
  accountId?:
    string | null,
) {
  return (
    row &&
    row.isDeleted !== true &&
    (
      !row.accountId ||
      !accountId ||
      sameId(
        row.accountId,
        accountId,
      )
    )
  );
}

function branchScoped(
  row: AnyRow,
  accountId?:
    string | null,
  schoolId?:
    string | null,
  branchId?:
    string | null,
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
    row.schoolLocalId ??
    row.payload
      ?.schoolId;

  const rowBranchId =
    row.branchId ??
    row.branchLocalId ??
    row.payload
      ?.branchId;

  if (
    schoolId &&
    rowSchoolId &&
    !sameId(
      rowSchoolId,
      schoolId,
    )
  ) {
    return false;
  }

  if (
    branchId &&
    rowBranchId &&
    !sameId(
      rowBranchId,
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

  return table
    ?.toArray
    ? table.toArray()
    : [];
}

function count(
  rows: AnyRow[],
) {
  return rows.filter(
    activeRow,
  ).length;
}

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
    | number
    | string
    | null,
) {
  if (!value) {
    return "Not set";
  }

  const date =
    new Date(
      value as any,
    );

  if (
    !Number.isFinite(
      date.getTime(),
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
          "numeric",
      },
    ).format(
      date,
    );
  } catch {
    return "Not set";
  }
}

function mediaUrl(
  media: AnyRow[],
  mediaId: unknown,
) {
  const targetId =
    cleanId(
      mediaId,
    );

  if (
    !targetId
  ) {
    return "";
  }

  const asset =
    media.find(
      (
        row,
      ) =>
        sameId(
          idOf(
            row,
          ),
          targetId,
        ),
    );

  return text(
    asset
      ?.publicUrl ||
      asset
        ?.remoteUrl ||
      asset
        ?.localObjectUrl ||
      asset
        ?.previewDataUrl ||
      asset
        ?.thumbnailDataUrl,
  );
}

function isBranchAudience(
  row: AnyRow,
) {
  const audiences =
    Array.isArray(
      row.audiences,
    )
      ? row.audiences.map(
          (
            value: unknown,
          ) =>
            text(
              value,
            ).toLowerCase(),
        )
      : [
          text(
            row.audience ||
              row.portal ||
              row.role ||
              "all",
          ).toLowerCase(),
        ];

  return audiences.some(
    (
      value: string,
    ) =>
      [
        "all",
        "branch_admin",
        "branch-admin",
        "branch admin",
        "admin",
      ].includes(
        value,
      ),
  );
}

function buildHeroSlides(
  highlights: AnyRow[],
  media: AnyRow[],
) {
  const now =
    Date.now();

  const highlightSlides =
    highlights
      .filter(
        activeRow,
      )

      /*
       * Gallery-only media should stay in the Portal Gallery.
       * It should not automatically become a dashboard hero.
       */
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
          if (
            !isBranchAudience(
              row,
            )
          ) {
            return false;
          }

          const status =
            text(
              row.status,
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
            n(
              row.startAt,
            );

          const endAt =
            n(
              row.endAt,
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
            a.displayOrder ??
              a.order,
          ) -
          n(
            b.displayOrder ??
              b.order,
          ),
      )

      .map(
        (
          row,
          index,
        ):
          HeroSlide | null => {
          const type:
            "image" | "video" =
            text(
              row.mediaType,
            ).toLowerCase() ===
            "video"
              ? "video"
              : "image";

          const src =
            mediaUrl(
              media,
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

          if (!src) {
            return null;
          }

          const poster =
            mediaUrl(
              media,
              row.posterMediaAssetId,
            ) ||
            text(
              row.fallbackImageUrl,
            );

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
        ): row is HeroSlide =>
          Boolean(
            row,
          ),
      );

  /*
   * School-created Portal Highlights always win.
   *
   * Only when there are no active highlights do we rotate
   * the three Eleeveon defaults from /public.
   */
  return highlightSlides
    .length
    ? highlightSlides
    : DEFAULT_HERO_SLIDES;
}

function PortalHero({
  slides,
  onAction,
}: {
  slides:
    HeroSlide[];

  onAction:
    (
      slide:
        HeroSlide,
    ) => void;
}) {
  const [
    index,
    setIndex,
  ] =
    useState(
      0,
    );

  const slide =
    slides[
      index %
        Math.max(
          1,
          slides.length,
        )
    ] ||
    null;

  useEffect(() => {
    if (
      !slide ||
      slides.length <=
        1 ||
      slide.type ===
        "video"
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          setIndex(
            (
              current,
            ) =>
              (
                current +
                1
              ) %
              slides.length,
          );
        },

        (
          slide.durationSeconds ||
          7
        ) *
          1000,
      );

    return () =>
      window.clearTimeout(
        timer,
      );
  }, [
    slide,
    slides.length,
  ]);

  useEffect(() => {
    if (
      index >=
      slides.length
    ) {
      setIndex(
        0,
      );
    }
  }, [
    index,
    slides.length,
  ]);

  if (!slide) {
    return null;
  }

  function advance() {
    if (
      slides.length <=
      1
    ) {
      return;
    }

    setIndex(
      (
        current,
      ) =>
        (
          current +
          1
        ) %
        slides.length,
    );
  }

  return (
    <section
      className={`bd-hero ${
        slide.transition ===
        "slide"
          ? "slide-transition"
          : "fade-transition"
      }`}
    >
      <div
        key={
          slide.id
        }
        className="bd-hero-media"
      >
        {slide.type ===
        "video" ? (
          <video
            src={
              slide.src
            }
            poster={
              slide.poster
            }
            autoPlay
            muted
            playsInline
            preload="metadata"
            onEnded={
              advance
            }
            onError={
              advance
            }
          />
        ) : (
          <img
            src={
              slide.src
            }
            alt=""
          />
        )}
      </div>

      {slide.actionLabel ? (
        <button
          type="button"
          className="bd-hero-action"
          onClick={() =>
            onAction(
              slide,
            )
          }
        >
          {
            slide.actionLabel
          }
        </button>
      ) : null}

      {slides.length >
      1 ? (
        <div
          className="bd-hero-dots"
          aria-label="Portal highlights"
        >
          {slides.map(
            (
              item,
              dotIndex,
            ) => (
              <button
                key={
                  item.id
                }
                type="button"
                className={
                  dotIndex ===
                  index
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setIndex(
                    dotIndex,
                  )
                }
                aria-label={`Show portal highlight ${
                  dotIndex +
                  1
                }`}
              />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}

export default function BranchAdminDashboard({
  navigate,
  navSections,
}: RouteProps) {
  /*
   * Kept in the component signature so this remains a direct
   * drop-in for app/branch-admin/page.tsx.
   *
   * Explore now owns the full module catalogue, so Home does
   * not render navigation modules.
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

  const {
    loading,
    setLoading,
  } =
    useBackgroundLoader();

  const primary =
    settings
      ?.primaryColor ||
    "var(--primary-color,#2563eb)";

  const openWorkspace =
    useMemo(
      () =>
        readOpenWorkspaceSession(),
      [],
    );

  const schoolId =
    selectedSchoolId(
      {
        openWorkspace,

        activeMembership,

        activeSchoolId,

        activeSchool:
          activeSchool as AnyRow,

        settings:
          settings as AnyRow,
      },
    );

  const branchId =
    selectedBranchId(
      {
        openWorkspace,

        activeMembership,

        activeBranchId,

        activeBranch:
          activeBranch as AnyRow,

        settings:
          settings as AnyRow,
      },
    );

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
        "Failed to load branch admin dashboard:",
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

  const summary =
    useMemo(
      () => {
        const today =
          todayKey();

        const students =
          (
            rows.students ||
            []
          ).filter(
            activeRow,
          );

        const teachers =
          (
            rows.teachers ||
            []
          ).filter(
            activeRow,
          );

        const classes =
          (
            rows.classes ||
            []
          ).filter(
            activeRow,
          );

        const studentAttendance =
          (
            rows.attendance ||
            []
          ).filter(
            activeRow,
          );

        const teacherAttendance =
          (
            rows.teacherAttendance ||
            []
          ).filter(
            activeRow,
          );

        const todayStudents =
          studentAttendance.filter(
            (
              row,
            ) =>
              text(
                row.date ||
                  row.attendanceDate ||
                  row.createdAt,
              ).startsWith(
                today,
              ),
          );

        const todayTeachers =
          teacherAttendance.filter(
            (
              row,
            ) =>
              text(
                row.date ||
                  row.attendanceDate ||
                  row.createdAt,
              ).startsWith(
                today,
              ),
          );

        const studentPresent =
          todayStudents.filter(
            (
              row,
            ) => {
              const status =
                text(
                  row.status,
                ).toLowerCase();

              return [
                "present",
                "late",
              ].includes(
                status,
              );
            },
          ).length;

        const studentAbsent =
          todayStudents.filter(
            (
              row,
            ) => {
              const status =
                text(
                  row.status,
                ).toLowerCase();

              return [
                "absent",
                "excused",
              ].includes(
                status,
              );
            },
          ).length;

        const teacherPresent =
          todayTeachers.filter(
            (
              row,
            ) => {
              const status =
                text(
                  row.status,
                ).toLowerCase();

              return (
                [
                  "present",
                  "late",
                  "clocked_in",
                  "clocked-in",
                ].includes(
                  status,
                ) ||
                Boolean(
                  row.clockIn,
                )
              );
            },
          ).length;

        const studentAttendancePercent =
          todayStudents.length
            ? Math.round(
                (
                  studentPresent /
                  todayStudents.length
                ) *
                  100,
              )
            : 0;

        const teacherAttendancePercent =
          todayTeachers.length
            ? Math.round(
                (
                  teacherPresent /
                  todayTeachers.length
                ) *
                  100,
              )
            : 0;

        return {
          students:
            students.length,

          teachers:
            teachers.length,

          classes:
            classes.length,

          studentPresent,

          studentAbsent,

          studentAttendanceRecords:
            todayStudents.length,

          studentAttendancePercent,

          teacherPresent,

          teacherAttendanceRecords:
            todayTeachers.length,

          teacherAttendancePercent,
        };
      },
      [
        rows.students,
        rows.teachers,
        rows.classes,
        rows.attendance,
        rows.teacherAttendance,
      ],
    );

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
              new Date(
                b.publishAt ||
                  b.sentAt ||
                  b.updatedAt ||
                  b.createdAt ||
                  0,
              ).getTime() -
              new Date(
                a.publishAt ||
                  a.sentAt ||
                  a.updatedAt ||
                  a.createdAt ||
                  0,
              ).getTime(),
          )
          .slice(
            0,
            2,
          ),
      [
        rows.announcements,
      ],
    );

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
              new Date(
                a.startAt ||
                  a.startDate ||
                  a.date ||
                  0,
              ).getTime() -
              new Date(
                b.startAt ||
                  b.startDate ||
                  b.date ||
                  0,
              ).getTime(),
          )
          .slice(
            0,
            2,
          ),
      [
        rows.calendarEvents,
      ],
    );

  const heroSlides =
    useMemo(
      () =>
        buildHeroSlides(
          rows.portalHighlights ||
            [],

          (
            rows.mediaAssets ||
            []
          ).filter(
            activeRow,
          ),
        ),
      [
        rows.portalHighlights,
        rows.mediaAssets,
      ],
    );

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
    } catch {
      // RolePortalShell remains the normal navigation owner.
    }
  }

  function openHeroAction(
    slide: HeroSlide,
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
    }
  }

  if (
    loading ||
    accountLoading ||
    settingsLoading
  ) {
    return (
      <State
        primary={
          primary
        }

        title="Opening branch home..."

        text="Preparing attendance, announcements and school activity."
      />
    );
  }

  if (
    !authenticated ||
    !accountId
  ) {
    return (
      <State
        primary={
          primary
        }

        title="Redirecting to login..."

        text="You must sign in before viewing the Branch Admin portal."
      />
    );
  }

  return (
    <main
      className="bd-page"
      style={
        {
          "--bd-primary":
            primary,
        } as React.CSSProperties
      }
    >
      <style>
        {css}
      </style>

      <PortalHero
        slides={
          heroSlides
        }

        onAction={
          openHeroAction
        }
      />

      <section
        className="bd-attendance-grid"
        aria-label="Today's attendance"
      >
        <button
          type="button"
          className="bd-attendance-card"
          onClick={() =>
            openRoute(
              "studentAttendance",
            )
          }
        >
          <div className="bd-attendance-top">
            <span className="bd-attendance-icon">
              🎓
            </span>

            <span className="bd-attendance-label">
              Student attendance
            </span>
          </div>

          <div className="bd-attendance-value">
            <strong>
              {
                summary.studentAttendancePercent
              }
              %
            </strong>

            <span>
              Today
            </span>
          </div>

          <div className="bd-attendance-meta">
            <span>
              <b>
                {
                  summary.studentPresent
                }
              </b>{" "}
              present
            </span>

            <span>
              <b>
                {
                  summary.studentAbsent
                }
              </b>{" "}
              absent
            </span>
          </div>
        </button>

        <button
          type="button"
          className="bd-attendance-card"
          onClick={() =>
            openRoute(
              "teacherAttendance",
            )
          }
        >
          <div className="bd-attendance-top">
            <span className="bd-attendance-icon">
              👨‍🏫
            </span>

            <span className="bd-attendance-label">
              Teacher attendance
            </span>
          </div>

          <div className="bd-attendance-value">
            <strong>
              {
                summary.teacherAttendancePercent
              }
              %
            </strong>

            <span>
              Today
            </span>
          </div>

          <div className="bd-attendance-meta">
            <span>
              <b>
                {
                  summary.teacherPresent
                }
              </b>{" "}
              present
            </span>

            <span>
              <b>
                {
                  summary.teacherAttendanceRecords
                }
              </b>{" "}
              recorded
            </span>
          </div>
        </button>
      </section>

      <section className="bd-content-grid">
        <article className="bd-card">
          <div className="bd-section-head">
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
          </div>

          <div className="bd-stack">
            {events.length ? (
              events.map(
                (
                  event,
                  index,
                ) => (
                  <button
                    key={
                      cleanId(
                        idOf(
                          event,
                        ),
                      ) ||
                      index
                    }
                    type="button"
                    className="bd-event-row"
                    onClick={() =>
                      openRoute(
                        "calendar",
                      )
                    }
                  >
                    <span className="bd-event-date">
                      {dateLabel(
                        event.startAt ||
                          event.startDate ||
                          event.date,
                      )}
                    </span>

                    <span className="bd-event-copy">
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

                    <i>
                      ›
                    </i>
                  </button>
                ),
              )
            ) : (
              <MiniEmpty
                icon="🗓️"
                text="No upcoming events yet."
              />
            )}
          </div>
        </article>

        <article className="bd-card">
          <div className="bd-section-head">
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
          </div>

          <div className="bd-stack">
            {announcements.length ? (
              announcements.map(
                (
                  item,
                  index,
                ) => (
                  <button
                    key={
                      cleanId(
                        idOf(
                          item,
                        ),
                      ) ||
                      index
                    }
                    type="button"
                    className="bd-notice-row"
                    onClick={() =>
                      openRoute(
                        "announcements",
                      )
                    }
                  >
                    <span className="bd-notice-icon">
                      📣
                    </span>

                    <span className="bd-notice-copy">
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
                        )}
                      </small>
                    </span>

                    <i>
                      ›
                    </i>
                  </button>
                ),
              )
            ) : (
              <MiniEmpty
                icon="📣"
                text="No announcements published."
              />
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function MiniEmpty({
  icon,
  text: body,
}: {
  icon: string;

  text: string;
}) {
  return (
    <div className="bd-mini-empty">
      <span>
        {icon}
      </span>

      <p>
        {body}
      </p>
    </div>
  );
}

function State({
  primary,
  title,
  text: body,
}: {
  primary: string;

  title: string;

  text: string;
}) {
  return (
    <main
      className="bd-page"
      style={
        {
          "--bd-primary":
            primary,
        } as React.CSSProperties
      }
    >
      <style>
        {css}
      </style>

      <section className="bd-state">
        <div className="bd-spinner" />

        <h2>
          {title}
        </h2>

        <p>
          {body}
        </p>
      </section>
    </main>
  );
}

const css = `
@keyframes bdSpin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes bdHeroFade {
  from {
    opacity: .32;
  }

  to {
    opacity: 1;
  }
}

@keyframes bdHeroSlide {
  from {
    opacity: .55;
    transform: translateX(3%);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}


/* =========================================================
   PAGE
   ========================================================= */

.bd-page {
  --ease:
    cubic-bezier(.2,.8,.2,1);

  width: 100%;

  height: auto !important;

  min-height: 0 !important;

  max-height: none !important;

  overflow-x: hidden !important;

  overflow-y: visible !important;

  padding:
    8px
    8px
    calc(
      76px +
      env(
        safe-area-inset-bottom,
        0px
      )
    );

  background:
    var(
      --bg,
      #f7f8fb
    );

  color:
    var(
      --text,
      #111827
    );

  font-family:
    var(
      --font-family,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif
    );
}

.bd-page *,
.bd-page *::before,
.bd-page *::after {
  box-sizing:
    border-box;

  min-width:
    0;
}

.bd-page button {
  font:
    inherit;

  cursor:
    pointer;

  -webkit-tap-highlight-color:
    transparent;
}


/* =========================================================
   HERO
   EXACT SAME HEIGHT LANGUAGE AS TEACHER DASHBOARD
   ========================================================= */

.bd-hero {
  position:
    relative;

  width:
    100%;

  height:
    clamp(
      290px,
      47vw,
      390px
    );

  min-height:
    0 !important;

  max-height:
    390px;

  overflow:
    hidden;

  border-radius:
    25px;

  background:
    color-mix(
      in srgb,
      var(
        --bd-primary
      ) 12%,
      #0f172a
    );

  box-shadow:
    0
    14px
    34px
    rgba(
      15,
      23,
      42,
      .08
    );
}

.bd-hero-media {
  position:
    absolute;

  inset:
    0;

  width:
    100%;

  height:
    100%;
}

.bd-hero-media img,
.bd-hero-media video {
  width:
    100%;

  height:
    100%;

  display:
    block;

  object-fit:
    cover;

  object-position:
    center;
}

.bd-hero.fade-transition
.bd-hero-media {
  animation:
    bdHeroFade
    .55s
    ease;
}

.bd-hero.slide-transition
.bd-hero-media {
  animation:
    bdHeroSlide
    .55s
    ease;
}

.bd-hero-action {
  position:
    absolute;

  left:
    14px;

  bottom:
    14px;

  z-index:
    3;

  max-width:
    calc(
      100% -
      100px
    );

  overflow:
    hidden;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;

  min-height:
    34px;

  padding:
    0
    13px;

  border:
    1px
    solid
    rgba(
      255,
      255,
      255,
      .28
    );

  border-radius:
    999px;

  background:
    rgba(
      15,
      23,
      42,
      .45
    );

  color:
    #fff;

  font-size:
    10px;

  font-weight:
    900;

  backdrop-filter:
    blur(
      10px
    );
}

.bd-hero-dots {
  position:
    absolute;

  left:
    50%;

  bottom:
    11px;

  z-index:
    4;

  display:
    flex;

  align-items:
    center;

  gap:
    6px;

  transform:
    translateX(
      -50%
    );
}

.bd-hero-dots button {
  width:
    7px;

  height:
    7px;

  padding:
    0;

  border:
    0;

  border-radius:
    999px;

  background:
    rgba(
      255,
      255,
      255,
      .52
    );

  transition:
    width
    .18s
    ease,
    background
    .18s
    ease;
}

.bd-hero-dots button.active {
  width:
    20px;

  background:
    #fff;
}


/* =========================================================
   ATTENDANCE
   ========================================================= */

.bd-attendance-grid {
  display:
    grid;

  grid-template-columns:
    repeat(
      2,
      minmax(
        0,
        1fr
      )
    );

  gap:
    9px;

  margin-top:
    9px;
}

.bd-attendance-card {
  min-height:
    106px;

  padding:
    12px;

  border:
    1px
    solid
    var(
      --border,
      rgba(
        15,
        23,
        42,
        .09
      )
    );

  border-radius:
    20px;

  background:
    var(
      --card-bg,
      var(
        --surface,
        #fff
      )
    );

  color:
    inherit;

  text-align:
    left;

  box-shadow:
    0
    8px
    22px
    rgba(
      15,
      23,
      42,
      .045
    );
}

.bd-attendance-top {
  display:
    flex;

  align-items:
    center;

  gap:
    7px;
}

.bd-attendance-icon {
  width:
    28px;

  height:
    28px;

  flex:
    0 0 auto;

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
        --bd-primary
      ) 10%,
      transparent
    );

  font-size:
    14px;
}

.bd-attendance-label {
  overflow:
    hidden;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;

  color:
    var(
      --muted,
      #64748b
    );

  font-size:
    9px;

  font-weight:
    900;

  letter-spacing:
    .05em;

  text-transform:
    uppercase;
}

.bd-attendance-value {
  display:
    flex;

  align-items:
    baseline;

  gap:
    6px;

  margin-top:
    8px;
}

.bd-attendance-value strong {
  font-size:
    clamp(
      27px,
      7vw,
      34px
    );

  line-height:
    1;

  font-weight:
    1000;

  letter-spacing:
    -.06em;
}

.bd-attendance-value > span {
  color:
    var(
      --muted,
      #64748b
    );

  font-size:
    9px;

  font-weight:
    850;
}

.bd-attendance-meta {
  display:
    flex;

  flex-wrap:
    wrap;

  gap:
    5px
    10px;

  margin-top:
    7px;

  color:
    var(
      --muted,
      #64748b
    );

  font-size:
    9px;

  font-weight:
    750;
}

.bd-attendance-meta b {
  color:
    var(
      --text,
      #111827
    );

  font-weight:
    950;
}


/* =========================================================
   CONTENT
   ========================================================= */

.bd-content-grid {
  display:
    grid;

  gap:
    9px;

  margin-top:
    9px;
}

.bd-card {
  padding:
    13px;

  border:
    1px
    solid
    var(
      --border,
      rgba(
        15,
        23,
        42,
        .09
      )
    );

  border-radius:
    22px;

  background:
    var(
      --card-bg,
      var(
        --surface,
        #fff
      )
    );

  color:
    inherit;

  box-shadow:
    0
    8px
    22px
    rgba(
      15,
      23,
      42,
      .045
    );
}

.bd-section-head {
  display:
    flex;

  align-items:
    flex-start;

  justify-content:
    space-between;

  gap:
    10px;

  margin-bottom:
    10px;
}

.bd-section-head
> div
> span {
  display:
    block;

  color:
    var(
      --muted,
      #64748b
    );

  font-size:
    9px;

  font-weight:
    900;

  letter-spacing:
    .09em;

  text-transform:
    uppercase;
}

.bd-section-head h2 {
  margin:
    2px
    0
    0;

  font-size:
    16px;

  font-weight:
    1000;

  letter-spacing:
    -.03em;
}

.bd-section-head
> button {
  flex:
    0 0 auto;

  min-height:
    28px;

  padding:
    0
    10px;

  border:
    0;

  border-radius:
    999px;

  background:
    color-mix(
      in srgb,
      var(
        --bd-primary
      ) 9%,
      transparent
    );

  color:
    var(
      --bd-primary
    );

  font-size:
    10px;

  font-weight:
    900;
}

.bd-stack {
  display:
    grid;

  gap:
    6px;
}


/* =========================================================
   UPCOMING
   ========================================================= */

.bd-event-row {
  width:
    100%;

  display:
    grid;

  grid-template-columns:
    auto
    minmax(
      0,
      1fr
    )
    auto;

  align-items:
    center;

  gap:
    9px;

  padding:
    8px;

  border:
    0;

  border-radius:
    15px;

  background:
    color-mix(
      in srgb,
      var(
        --muted,
        #64748b
      ) 5%,
      transparent
    );

  color:
    inherit;

  text-align:
    left;
}

.bd-event-date {
  min-width:
    55px;

  color:
    var(
      --bd-primary
    );

  font-size:
    10px;

  font-weight:
    950;
}

.bd-event-copy {
  min-width:
    0;
}

.bd-event-copy strong,
.bd-event-copy small {
  display:
    block;

  overflow:
    hidden;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

.bd-event-copy strong {
  font-size:
    12px;

  font-weight:
    1000;
}

.bd-event-copy small {
  margin-top:
    2px;

  color:
    var(
      --muted,
      #64748b
    );

  font-size:
    10px;

  font-weight:
    750;
}

.bd-event-row i {
  color:
    var(
      --muted,
      #64748b
    );

  font-size:
    18px;

  font-style:
    normal;
}


/* =========================================================
   ANNOUNCEMENTS
   ========================================================= */

.bd-notice-row {
  width:
    100%;

  display:
    grid;

  grid-template-columns:
    36px
    minmax(
      0,
      1fr
    )
    auto;

  align-items:
    center;

  gap:
    9px;

  padding:
    8px;

  border:
    0;

  border-radius:
    15px;

  background:
    color-mix(
      in srgb,
      var(
        --muted,
        #64748b
      ) 5%,
      transparent
    );

  color:
    inherit;

  text-align:
    left;
}

.bd-notice-icon {
  width:
    36px;

  height:
    36px;

  display:
    grid;

  place-items:
    center;

  border-radius:
    13px;

  background:
    color-mix(
      in srgb,
      var(
        --bd-primary
      ) 10%,
      transparent
    );
}

.bd-notice-copy strong,
.bd-notice-copy small {
  display:
    block;

  overflow:
    hidden;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

.bd-notice-copy strong {
  font-size:
    12px;

  font-weight:
    1000;
}

.bd-notice-copy small {
  margin-top:
    2px;

  color:
    var(
      --muted,
      #64748b
    );

  font-size:
    10px;

  font-weight:
    750;
}

.bd-notice-row i {
  color:
    var(
      --muted,
      #64748b
    );

  font-size:
    18px;

  font-style:
    normal;
}


/* =========================================================
   EMPTY
   ========================================================= */

.bd-mini-empty {
  min-height:
    88px;

  display:
    grid;

  place-items:
    center;

  align-content:
    center;

  gap:
    5px;

  color:
    var(
      --muted,
      #64748b
    );

  text-align:
    center;
}

.bd-mini-empty span {
  font-size:
    23px;
}

.bd-mini-empty p {
  margin:
    0;

  font-size:
    10px;

  font-weight:
    800;
}


/* =========================================================
   LOADING STATE
   ========================================================= */

.bd-state {
  min-height:
    280px;

  display:
    grid;

  place-items:
    center;

  align-content:
    center;

  gap:
    10px;

  padding:
    20px;

  border:
    1px
    solid
    var(
      --border,
      rgba(
        15,
        23,
        42,
        .09
      )
    );

  border-radius:
    22px;

  background:
    var(
      --card-bg,
      var(
        --surface,
        #fff
      )
    );

  text-align:
    center;
}

.bd-spinner {
  width:
    36px;

  height:
    36px;

  border:
    4px
    solid
    color-mix(
      in srgb,
      var(
        --bd-primary
      ) 16%,
      transparent
    );

  border-top-color:
    var(
      --bd-primary
    );

  border-radius:
    999px;

  animation:
    bdSpin
    .8s
    linear
    infinite;
}

.bd-state h2 {
  margin:
    0;

  font-size:
    17px;

  font-weight:
    1000;
}

.bd-state p {
  max-width:
    30rem;

  margin:
    0;

  color:
    var(
      --muted,
      #64748b
    );

  font-size:
    11px;

  line-height:
    1.55;
}


/* =========================================================
   SINGLE DOCUMENT SCROLL

   Dashboard itself does NOT own vertical scrolling.
   RolePortalShell/document remains the single scroll owner.
   ========================================================= */

.bd-page,
.app-main,
.app-content,
.app-content-inner,
.shell-portal-content,
.shell-content-background {
  height:
    auto !important;

  min-height:
    0 !important;

  max-height:
    none !important;

  overflow-y:
    visible !important;

  overscroll-behavior-y:
    auto !important;

  scrollbar-gutter:
    auto !important;
}

html {
  height:
    auto !important;

  min-height:
    100%;

  overflow-x:
    hidden !important;

  overflow-y:
    auto !important;

  scrollbar-gutter:
    auto !important;
}

body {
  height:
    auto !important;

  min-height:
    100%;

  overflow-x:
    hidden !important;

  overflow-y:
    visible !important;
}


/* =========================================================
   TABLET / DESKTOP
   ========================================================= */

@media (
  min-width:
    720px
) {
  .bd-page {
    padding:
      12px
      12px
      24px;
  }

  /*
   * Same as Teacher Dashboard.
   */
  .bd-hero {
    height:
      370px;

    max-height:
      370px;
  }

  .bd-content-grid {
    grid-template-columns:
      repeat(
        2,
        minmax(
          0,
          1fr
        )
      );
  }
}

@media (
  min-width:
    1100px
) {
  .bd-page {
    max-width:
      1180px;

    margin:
      0
      auto;

    padding:
      16px
      16px
      28px;
  }
}


/* =========================================================
   SMALL PHONES
   ========================================================= */

@media (
  max-width:
    480px
) {
  .bd-page {
    padding:
      7px
      7px
      calc(
        76px +
        env(
          safe-area-inset-bottom,
          0px
        )
      );
  }

  /*
   * Do not override the hero with the old 490px+ mobile size.
   * Clamp keeps it in the same family as Teacher Home.
   */
  .bd-hero {
    height:
      clamp(
        290px,
        47vw,
        390px
      );

    min-height:
      0 !important;
  }

  .bd-attendance-card {
    min-height:
      104px;
  }
}


/* =========================================================
   REDUCED MOTION
   ========================================================= */

@media (
  prefers-reduced-motion:
    reduce
) {
  .bd-spinner,
  .bd-hero.fade-transition
  .bd-hero-media,
  .bd-hero.slide-transition
  .bd-hero-media {
    animation:
      none !important;
  }
}
`;