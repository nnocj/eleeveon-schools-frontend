"use client";

/**
 * app/teacher/modules/TeacherDashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON TEACHER HOME
 * ---------------------------------------------------------
 * - Portal Highlights first
 * - No hero text
 * - No dashboard search card
 * - No quick actions
 * - Compact classroom information
 * - One document scroll
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
};

const OPEN_WORKSPACE_KEY =
  "eleeveon_open_workspace";

const DEFAULT_HERO_SLIDES: HeroSlide[] = [
  {
    id: "pathways-to-possibility",
    type: "image",
    src: "/pathways-to-possibility.png",
    durationSeconds: 7,
  },
  {
    id: "building-the-future",
    type: "image",
    src: "/building-the-future.png",
    durationSeconds: 7,
  },
  {
    id: "knowledge-in-motion",
    type: "image",
    src: "/knowledge-in-motion.png",
    durationSeconds: 7,
  },
];

const TABLE_NAMES = [
  "schools",
  "branches",
  "teachers",
  "classes",
  "classTeachers",
  "classSubjects",
  "subjects",
  "studentEnrollments",
  "attendance",
  "teacherAttendance",
  "assessmentEntries",
  "announcements",
  "calendarEvents",
  "scheduleSessions",
  "payrollItems",
  "staffPaymentRecords",
  "portalHighlights",
  "mediaAssets",
] as const;

function clean(
  value: unknown,
) {
  return value ===
    null ||
    value ===
      undefined
    ? ""
    : String(
        value,
      ).trim();
}

function text(
  value: unknown,
  fallback = "",
) {
  return (
    clean(
      value,
    ) ||
    fallback
  );
}

function sameId(
  a: unknown,
  b: unknown,
) {
  const left =
    clean(a);

  const right =
    clean(b);

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

function idOf(
  row?: AnyRow | null,
) {
  return (
    row?.id ??
    row?.localId ??
    row?.cloudId ??
    row?.payload?.id
  );
}

function active(
  row?: AnyRow | null,
) {
  if (
    !row ||
    row.isDeleted === true ||
    row.active === false
  ) {
    return false;
  }

  return ![
    "deleted",
    "archived",
    "inactive",
    "disabled",
    "cancelled",
  ].includes(
    clean(
      row.status,
    ).toLowerCase(),
  );
}

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
      localStorage.getItem(
        key,
      ) ||
      sessionStorage.getItem(
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
    safeRead(key);

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

async function safeArray(
  tableName: string,
): Promise<AnyRow[]> {
  const table =
    (db as any)[
      tableName
    ];

  return table?.toArray
    ? table.toArray()
    : [];
}

function todayKey() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}

function dateLabel(
  value: unknown,
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

  return new Intl.DateTimeFormat(
    undefined,
    {
      month: "short",
      day: "numeric",
    },
  ).format(date);
}

function mediaUrl(
  media: AnyRow[],
  mediaId: unknown,
) {
  const asset =
    media.find(
      (
        item,
      ) =>
        sameId(
          idOf(item),
          mediaId,
        ),
    );

  return text(
    asset?.publicUrl ||
      asset?.remoteUrl ||
      asset?.previewDataUrl ||
      asset?.thumbnailDataUrl ||
      asset?.localObjectUrl,
  );
}

function buildHeroSlides(
  highlights: AnyRow[],
  media: AnyRow[],
) {
  const now =
    Date.now();

  const slides =
    highlights
      .filter(
        active,
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

          if (
            !audiences.some(
              (
                value: string,
              ) =>
                [
                  "all",
                  "teacher",
                  "teachers",
                  "staff",
                ].includes(
                  value,
                ),
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

          if (
            n(
              row.startAt,
            ) >
            now
          ) {
            return false;
          }

          if (
            n(
              row.endAt,
            ) &&
            n(
              row.endAt,
            ) <
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
          HeroSlide | null => {
          const type =
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

          return {
            id:
              clean(
                idOf(row),
              ) ||
              `teacher-highlight-${index}`,
            type,
            src,
            poster:
              mediaUrl(
                media,
                row.posterMediaAssetId,
              ) ||
              text(
                row.fallbackImageUrl,
              ) ||
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
          };
        },
      )
      .filter(
        (
          item,
        ): item is HeroSlide =>
          Boolean(item),
      );

  return slides.length
    ? slides
    : DEFAULT_HERO_SLIDES;
}

function PortalHero({
  slides,
}: {
  slides: HeroSlide[];
}) {
  const [
    index,
    setIndex,
  ] =
    useState(0);

  const slide =
    slides[
      index %
        Math.max(
          1,
          slides.length,
        )
    ];

  useEffect(() => {
    if (
      !slide ||
      slides.length <= 1 ||
      slide.type ===
        "video"
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () =>
          setIndex(
            (
              current,
            ) =>
              (
                current +
                1
              ) %
              slides.length,
          ),
        slide.durationSeconds *
          1000,
      );

    return () =>
      clearTimeout(
        timer,
      );
  }, [
    slide,
    slides.length,
  ]);

  if (!slide) {
    return null;
  }

  return (
    <section className="td-hero">
      {slide.type ===
      "video" ? (
        <video
          src={slide.src}
          poster={
            slide.poster
          }
          autoPlay
          muted
          playsInline
          onEnded={() =>
            setIndex(
              (
                current,
              ) =>
                (
                  current +
                  1
                ) %
                slides.length,
            )
          }
        />
      ) : (
        <img
          src={slide.src}
          alt=""
        />
      )}

      {slides.length >
      1 ? (
        <div className="td-dots">
          {slides.map(
            (
              item,
              i,
            ) => (
              <button
                key={
                  item.id
                }
                type="button"
                className={
                  i ===
                  index
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setIndex(
                    i,
                  )
                }
                aria-label={`Show slide ${
                  i + 1
                }`}
              />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}

export default function TeacherDashboard({
  navigate,
  navSections,
}: RouteProps) {
  void navSections;

  const router =
    useRouter();

  const revision =
    useDataRevision();

  const {
    loading,
    setLoading,
  } =
    useBackgroundLoader();

  const {
    accountId,
    authenticated,
    loading:
      accountLoading,
    user,
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
  } =
    useActiveBranch();

  const {
    activeMembership,
  } =
    useActiveMembership();

  const primary =
    settings?.primaryColor ||
    "var(--primary-color,#2563eb)";

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
      !accountLoading &&
      (
        !authenticated ||
        !accountId
      )
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
              table,
            ) => [
              table,
              await safeArray(
                table,
              ),
            ] as const,
          ),
        );

      setRowsByTable(
        Object.fromEntries(
          loaded,
        ),
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
    revision,
    accountLoading,
    settingsLoading,
  ]);

  const resolved =
    useMemo(() => {
      const open =
        safeJson<AnyRow>(
          OPEN_WORKSPACE_KEY,
        );

      const membership =
        open?.membership ||
        activeMembership ||
        safeJson<AnyRow>(
          "activeMembership",
        );

      const schoolId =
        clean(
          open?.schoolId ||
            membership?.schoolId ||
            activeSchoolId ||
            (settings as AnyRow)
              ?.schoolId,
        );

      const branchId =
        clean(
          open?.branchId ||
            membership?.branchId ||
            activeBranchId ||
            (settings as AnyRow)
              ?.branchId,
        );

      const teacherId =
        clean(
          open?.teacherId ||
            open?.teacherLocalId ||
            membership?.teacherId ||
            membership?.teacherLocalId ||
            safeRead(
              "activeTeacherId",
            ),
        );

      const teachers =
        (
          rowsByTable.teachers ||
          []
        ).filter(
          active,
        );

      const teacher =
        teachers.find(
          (
            row,
          ) =>
            teacherId &&
            sameId(
              idOf(row),
              teacherId,
            ),
        ) ||
        teachers.find(
          (
            row,
          ) =>
            sameId(
              row.email,
              (user as AnyRow)
                ?.email,
            ),
        ) ||
        null;

      return {
        schoolId,
        branchId,
        teacherId:
          clean(
            idOf(
              teacher,
            ) ||
              teacherId,
          ),
      };
    }, [
      rowsByTable.teachers,
      activeMembership,
      activeSchoolId,
      activeBranchId,
      settings,
      user,
    ]);

  const scoped =
    useMemo(() => {
      const result:
        Record<
          string,
          AnyRow[]
        > = {};

      Object.entries(
        rowsByTable,
      ).forEach(
        ([
          key,
          records,
        ]) => {
          result[key] =
            records.filter(
              (
                row,
              ) => {
                if (
                  !active(
                    row,
                  )
                ) {
                  return false;
                }

                if (
                  row.accountId &&
                  accountId &&
                  !sameId(
                    row.accountId,
                    accountId,
                  )
                ) {
                  return false;
                }

                if (
                  row.schoolId &&
                  resolved.schoolId &&
                  !sameId(
                    row.schoolId,
                    resolved.schoolId,
                  )
                ) {
                  return false;
                }

                if (
                  row.branchId &&
                  resolved.branchId &&
                  !sameId(
                    row.branchId,
                    resolved.branchId,
                  )
                ) {
                  return false;
                }

                return true;
              },
            );
        },
      );

      return result;
    }, [
      rowsByTable,
      accountId,
      resolved.schoolId,
      resolved.branchId,
    ]);

  const teacherData =
    useMemo(() => {
      const teacherId =
        resolved.teacherId;

      const classSubjects =
        (
          scoped.classSubjects ||
          []
        ).filter(
          (
            row,
          ) =>
            teacherId &&
            sameId(
              row.teacherId,
              teacherId,
            ),
        );

      const classTeachers =
        (
          scoped.classTeachers ||
          []
        ).filter(
          (
            row,
          ) =>
            teacherId &&
            sameId(
              row.teacherId,
              teacherId,
            ),
        );

      const classIds =
        new Set(
          [
            ...classSubjects,
            ...classTeachers,
          ]
            .map(
              (
                row,
              ) =>
                clean(
                  row.classId,
                ),
            )
            .filter(
              Boolean,
            ),
        );

      const subjectIds =
        new Set(
          classSubjects
            .map(
              (
                row,
              ) =>
                clean(
                  row.subjectId,
                ),
            )
            .filter(
              Boolean,
            ),
        );

      const classes =
        (
          scoped.classes ||
          []
        ).filter(
          (
            row,
          ) =>
            classIds.has(
              clean(
                idOf(row),
              ),
            ),
        );

      const subjects =
        (
          scoped.subjects ||
          []
        ).filter(
          (
            row,
          ) =>
            subjectIds.has(
              clean(
                idOf(row),
              ),
            ),
        );

      const enrollments =
        (
          scoped.studentEnrollments ||
          []
        ).filter(
          (
            row,
          ) =>
            classIds.has(
              clean(
                row.classId,
              ),
            ),
        );

      const today =
        todayKey();

      const attendance =
        (
          scoped.attendance ||
          []
        ).filter(
          (
            row,
          ) =>
            classIds.has(
              clean(
                row.classId,
              ),
            ) &&
            text(
              row.date ||
                row.createdAt,
            ).startsWith(
              today,
            ),
        );

      const present =
        attendance.filter(
          (
            row,
          ) =>
            text(
              row.status,
            ).toLowerCase() ===
            "present",
        ).length;

      const attendancePercent =
        attendance.length
          ? Math.round(
              (
                present /
                attendance.length
              ) *
                100,
            )
          : 0;

      const events =
        (
          scoped.calendarEvents ||
          []
        )
          .filter(
            active,
          )
          .slice(
            0,
            2,
          );

      const announcements =
        (
          scoped.announcements ||
          []
        )
          .filter(
            active,
          )
          .slice(
            0,
            2,
          );

      return {
        subjects:
          subjects.length,
        classes:
          classes.length,
        students:
          new Set(
            enrollments
              .map(
                (
                  row,
                ) =>
                  clean(
                    row.studentId,
                  ),
              )
              .filter(
                Boolean,
              ),
          ).size,
        attendancePercent,
        attendance:
          attendance.length,
        assessmentEntries:
          (
            scoped.assessmentEntries ||
            []
          ).filter(
            (
              row,
            ) =>
              !teacherId ||
              sameId(
                row.teacherId,
                teacherId,
              ) ||
              subjectIds.has(
                clean(
                  row.subjectId,
                ),
              ),
          ).length,
        sessions:
          (
            scoped.scheduleSessions ||
            []
          ).filter(
            (
              row,
            ) =>
              !teacherId ||
              sameId(
                row.teacherId,
                teacherId,
              ) ||
              classIds.has(
                clean(
                  row.classId,
                ),
              ),
          ).length,
        announcements,
        events,
      };
    }, [
      scoped,
      resolved.teacherId,
    ]);

  const heroSlides =
    useMemo(
      () =>
        buildHeroSlides(
          scoped.portalHighlights ||
            [],
          scoped.mediaAssets ||
            [],
        ),
      [
        scoped.portalHighlights,
        scoped.mediaAssets,
      ],
    );

  function openRoute(
    key: string,
  ) {
    if (navigate) {
      navigate(key);
      return;
    }

    try {
      window.dispatchEvent(
        new CustomEvent(
          "eleeveon:portal-route",
          {
            detail: {
              key,
            },
          },
        ),
      );
    } catch {}
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
      />
    );
  }

  return (
    <main
      className="td-page"
      style={
        {
          "--td-primary":
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
      />

      <section className="td-metrics">
        <button
          type="button"
          onClick={() =>
            openRoute(
              "studentAttendance",
            )
          }
        >
          <span>
            Attendance
          </span>

          <strong>
            {
              teacherData.attendancePercent
            }
            %
          </strong>

          <small>
            {
              teacherData.attendance
            }{" "}
            recorded today
          </small>
        </button>

        <button
          type="button"
          onClick={() =>
            openRoute(
              "assessmentEntry",
            )
          }
        >
          <span>
            Assessment
          </span>

          <strong>
            {
              teacherData.assessmentEntries
            }
          </strong>

          <small>
            score entries
          </small>
        </button>
      </section>

      <section className="td-grid">
        <article className="td-card">
          <header>
            <div>
              <span>
                Teaching
              </span>

              <h2>
                My workload
              </h2>
            </div>
          </header>

          <div className="td-work-grid">
            <button
              type="button"
              onClick={() =>
                openRoute(
                  "mySubjects",
                )
              }
            >
              <strong>
                {
                  teacherData.subjects
                }
              </strong>
              <span>
                Subjects
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                openRoute(
                  "myClasses",
                )
              }
            >
              <strong>
                {
                  teacherData.classes
                }
              </strong>
              <span>
                Classes
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                openRoute(
                  "teacherTimetable",
                )
              }
            >
              <strong>
                {
                  teacherData.sessions
                }
              </strong>
              <span>
                Sessions
              </span>
            </button>
          </div>
        </article>

        <article className="td-card">
          <header>
            <div>
              <span>
                Learners
              </span>
              <h2>
                Students
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                openRoute(
                  "myClasses",
                )
              }
            >
              Classes
            </button>
          </header>

          <strong className="td-big">
            {
              teacherData.students
            }
          </strong>

          <p>
            learners across your assigned classes
          </p>
        </article>

        <article className="td-card">
          <header>
            <div>
              <span>
                School updates
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

          <div className="td-list">
            {teacherData.announcements.map(
              (
                item,
                index,
              ) => (
                <button
                  type="button"
                  className="td-row"
                  key={
                    clean(
                      idOf(
                        item,
                      ),
                    ) ||
                    index
                  }
                  onClick={() =>
                    openRoute(
                      "announcements",
                    )
                  }
                >
                  <span>
                    📣
                  </span>

                  <div>
                    <strong>
                      {text(
                        item.title,
                        "Announcement",
                      )}
                    </strong>

                    <small>
                      {text(
                        item.body ||
                          item.message ||
                          item.description,
                        "Open to read",
                      )}
                    </small>
                  </div>
                </button>
              ),
            )}

            {!teacherData
              .announcements
              .length ? (
              <MiniEmpty
                text="No announcements."
              />
            ) : null}
          </div>
        </article>

        <article className="td-card">
          <header>
            <div>
              <span>
                Schedule
              </span>
              <h2>
                Upcoming
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                openRoute(
                  "teacherTimetable",
                )
              }
            >
              Timetable
            </button>
          </header>

          <div className="td-list">
            {teacherData.events.map(
              (
                event,
                index,
              ) => (
                <button
                  type="button"
                  className="td-row"
                  key={
                    clean(
                      idOf(
                        event,
                      ),
                    ) ||
                    index
                  }
                  onClick={() =>
                    openRoute(
                      "calendar",
                    )
                  }
                >
                  <span>
                    🗓️
                  </span>

                  <div>
                    <strong>
                      {text(
                        event.title ||
                          event.name,
                        "School event",
                      )}
                    </strong>

                    <small>
                      {dateLabel(
                        event.startAt ||
                          event.startDate ||
                          event.date,
                      )}
                    </small>
                  </div>
                </button>
              ),
            )}

            {!teacherData
              .events
              .length ? (
              <MiniEmpty
                text="No upcoming items."
              />
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}

function MiniEmpty({
  text: body,
}: {
  text: string;
}) {
  return (
    <div className="td-empty">
      {body}
    </div>
  );
}

function State({
  primary,
}: {
  primary: string;
}) {
  return (
    <main
      className="td-page"
      style={
        {
          "--td-primary":
            primary,
        } as React.CSSProperties
      }
    >
      <style>
        {css}
      </style>

      <section className="td-state">
        <div className="td-spinner" />
        <h2>
          Opening teacher home...
        </h2>
      </section>
    </main>
  );
}

const css = `
@keyframes tdSpin {
  to { transform: rotate(360deg); }
}

.td-page {
  width: 100%;
  height: auto !important;
  min-height: 0 !important;
  overflow: visible !important;
  padding: 8px 8px calc(76px + env(safe-area-inset-bottom,0px));
  background: var(--bg,#f7f8fb);
  color: var(--text,#111827);
}

.td-page,
.td-page * {
  box-sizing: border-box;
  min-width: 0;
}

.td-page button {
  font: inherit;
  cursor: pointer;
}

.td-hero {
  position: relative;
  height: clamp(290px,47vw,390px);
  overflow: hidden;
  border-radius: 25px;
  background: #0f172a;
  box-shadow: 0 14px 34px rgba(15,23,42,.08);
}

.td-hero img,
.td-hero video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.td-dots {
  position: absolute;
  left: 50%;
  bottom: 11px;
  display: flex;
  gap: 6px;
  transform: translateX(-50%);
}

.td-dots button {
  width: 7px;
  height: 7px;
  padding: 0;
  border: 0;
  border-radius: 99px;
  background: rgba(255,255,255,.5);
}

.td-dots button.active {
  width: 20px;
  background: #fff;
}

.td-metrics,
.td-grid {
  display: grid;
  gap: 9px;
  margin-top: 9px;
}

.td-metrics {
  grid-template-columns: repeat(2,minmax(0,1fr));
}

.td-metrics button,
.td-card {
  border: 1px solid var(--border,rgba(15,23,42,.09));
  background: var(--card-bg,var(--surface,#fff));
  color: inherit;
  box-shadow: 0 8px 22px rgba(15,23,42,.045);
}

.td-metrics button {
  min-height: 92px;
  padding: 12px;
  border-radius: 20px;
  text-align: left;
}

.td-metrics span,
.td-metrics strong,
.td-metrics small {
  display: block;
}

.td-metrics span {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.td-metrics strong {
  margin-top: 5px;
  font-size: 28px;
  line-height: 1;
}

.td-metrics small {
  margin-top: 5px;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.td-card {
  padding: 13px;
  border-radius: 22px;
}

.td-card header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.td-card header span {
  color: var(--muted,#64748b);
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .09em;
}

.td-card h2 {
  margin: 2px 0 0;
  font-size: 16px;
}

.td-card header button {
  border: 0;
  border-radius: 999px;
  padding: 6px 9px;
  background: color-mix(in srgb,var(--td-primary) 9%,transparent);
  color: var(--td-primary);
  font-size: 10px;
  font-weight: 900;
}

.td-work-grid {
  display: grid;
  grid-template-columns: repeat(3,minmax(0,1fr));
  gap: 7px;
}

.td-work-grid button {
  min-height: 74px;
  border: 0;
  border-radius: 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 6%,transparent);
  color: inherit;
}

.td-work-grid strong,
.td-work-grid span {
  display: block;
}

.td-work-grid strong {
  font-size: 22px;
}

.td-work-grid span {
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 9px;
  font-weight: 850;
}

.td-big {
  display: block;
  font-size: 32px;
  letter-spacing: -.05em;
}

.td-card > p {
  margin: 4px 0 0;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.td-list {
  display: grid;
  gap: 6px;
}

.td-row {
  display: grid;
  grid-template-columns: 36px minmax(0,1fr);
  gap: 9px;
  align-items: center;
  width: 100%;
  border: 0;
  padding: 8px;
  border-radius: 15px;
  background: color-mix(in srgb,var(--muted,#64748b) 5%,transparent);
  color: inherit;
  text-align: left;
}

.td-row > span {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: color-mix(in srgb,var(--td-primary) 10%,transparent);
}

.td-row strong,
.td-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.td-row strong {
  font-size: 12px;
}

.td-row small {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.td-empty {
  padding: 18px 8px;
  text-align: center;
  color: var(--muted,#64748b);
  font-size: 11px;
}

.td-state {
  min-height: 280px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
}

.td-spinner {
  width: 36px;
  height: 36px;
  border: 4px solid color-mix(in srgb,var(--td-primary) 16%,transparent);
  border-top-color: var(--td-primary);
  border-radius: 999px;
  animation: tdSpin .8s linear infinite;
}

.td-state h2 {
  margin: 0;
  font-size: 17px;
}

.td-page,
.app-content,
.app-content-inner,
.shell-portal-content,
.shell-content-background {
  height: auto !important;
  max-height: none !important;
  min-height: 0 !important;
  overflow-y: visible !important;
}

html {
  overflow-y: auto !important;
}

body {
  overflow-y: visible !important;
}

@media (min-width:720px) {
  .td-page {
    padding: 12px 12px 24px;
  }

  .td-grid {
    grid-template-columns: repeat(2,minmax(0,1fr));
  }

  .td-hero {
    height: 370px;
  }
}

@media (min-width:1100px) {
  .td-page {
    max-width: 1180px;
    margin: 0 auto;
  }
}
`;