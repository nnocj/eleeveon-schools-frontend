"use client";

/**
 * app/student/modules/Studentdashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON STUDENT HOME
 * ---------------------------------------------------------
 * Simplified learner home:
 * - Portal Highlights first
 * - No page search bar
 * - No hero text
 * - No quick-action strip
 * - Compact attendance/results/assignments
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
  "students",
  "studentEnrollments",
  "classes",
  "subjects",
  "classSubjects",
  "assignments",
  "attendance",
  "computedResults",
  "reportCards",
  "announcements",
  "calendarEvents",
  "scheduleSessions",
  "studentFeeInvoices",
  "studentFeePayments",
  "payments",
  "portalHighlights",
  "mediaAssets",
] as const;

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

function sameId(
  a: unknown,
  b: unknown,
) {
  const left =
    cleanId(a);

  const right =
    cleanId(b);

  return Boolean(
    left &&
    right &&
    left === right,
  );
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

  return ![
    "deleted",
    "archived",
    "inactive",
    "disabled",
    "withdrawn",
  ].includes(
    text(
      row.status,
    ).toLowerCase(),
  );
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

function firstId(
  ...values: unknown[]
) {
  for (
    const value
    of values
  ) {
    const id =
      cleanId(value);

    if (id) {
      return id;
    }
  }

  return "";
}

function count(
  rows: AnyRow[],
) {
  return rows.filter(
    activeRow,
  ).length;
}

function money(
  value: unknown,
  currency = "GHS",
) {
  try {
    return new Intl.NumberFormat(
      undefined,
      {
        style:
          "currency",
        currency,
        maximumFractionDigits:
          0,
      },
    ).format(
      n(value),
    );
  } catch {
    return `${currency} ${n(
      value,
    ).toLocaleString()}`;
  }
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
        row,
      ) =>
        sameId(
          idOf(row),
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
        activeRow,
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
                  "student",
                  "students",
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
              cleanId(
                idOf(row),
              ) ||
              `student-highlight-${index}`,
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
    <section className="sd-hero">
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
        <div className="sd-dots">
          {slides.map(
            (
              item,
              i,
            ) => (
              <button
                type="button"
                key={
                  item.id
                }
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

export default function Studentdashboard({
  navigate,
  navSections,
}: RouteProps) {
  void navSections;

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
    activeStudentId,
    activeMembership,
  } =
    useActiveMembership();

  const primary =
    settings?.primaryColor ||
    "var(--primary-color,#2563eb)";

  const openWorkspace =
    useMemo(
      () =>
        safeJson<AnyRow>(
          OPEN_WORKSPACE_KEY,
        ),
      [],
    );

  const membership =
    openWorkspace?.membership ||
    activeMembership ||
    safeJson<AnyRow>(
      "activeMembership",
    );

  const schoolId =
    firstId(
      openWorkspace?.schoolId,
      membership?.schoolId,
      activeSchoolId,
      (activeSchool as AnyRow)
        ?.id,
      (settings as AnyRow)
        ?.schoolId,
    );

  const branchId =
    firstId(
      openWorkspace?.branchId,
      membership?.branchId,
      activeBranchId,
      (activeBranch as AnyRow)
        ?.id,
      (settings as AnyRow)
        ?.branchId,
    );

  const studentId =
    firstId(
      openWorkspace?.studentLocalId,
      membership?.studentLocalId,
      membership?.studentId,
      activeStudentId,
      safeRead(
        "activeStudentId",
      ),
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

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
              tableName,
            ) => {
              const records =
                await safeArray(
                  tableName,
                );

              return [
                tableName,
                records.filter(
                  (
                    row,
                  ) => {
                    if (
                      row.accountId &&
                      !sameId(
                        row.accountId,
                        accountId,
                      )
                    ) {
                      return false;
                    }

                    if (
                      schoolId &&
                      row.schoolId &&
                      !sameId(
                        row.schoolId,
                        schoolId,
                      )
                    ) {
                      return false;
                    }

                    if (
                      branchId &&
                      row.branchId &&
                      !sameId(
                        row.branchId,
                        branchId,
                      )
                    ) {
                      return false;
                    }

                    return true;
                  },
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
    studentId,
    accountLoading,
    settingsLoading,
  ]);

  const rows =
    rowsByTable;

  const student =
    useMemo(
      () =>
        (
          rows.students ||
          []
        ).find(
          (
            row,
          ) =>
            studentId &&
            sameId(
              idOf(row),
              studentId,
            ),
        ) ||
        null,
      [
        rows.students,
        studentId,
      ],
    );

  const summary =
    useMemo(() => {
      const currentStudentId =
        studentId ||
        cleanId(
          idOf(
            student,
          ),
        );

      const enrollments =
        (
          rows.studentEnrollments ||
          []
        ).filter(
          (
            row,
          ) =>
            !currentStudentId ||
            sameId(
              row.studentId,
              currentStudentId,
            ),
        );

      const enrollment =
        enrollments.find(
          (
            row,
          ) =>
            text(
              row.status,
              "active",
            ).toLowerCase() ===
            "active",
        ) ||
        enrollments[0];

      const classId =
        cleanId(
          enrollment?.classId ||
            student?.currentClassId ||
            student?.classId,
        );

      const classSubjects =
        (
          rows.classSubjects ||
          []
        ).filter(
          (
            row,
          ) =>
            !classId ||
            sameId(
              row.classId,
              classId,
            ),
        );

      const subjectIds =
        new Set(
          classSubjects
            .map(
              (
                row,
              ) =>
                cleanId(
                  row.subjectId,
                ),
            )
            .filter(
              Boolean,
            ),
        );

      const subjects =
        (
          rows.subjects ||
          []
        ).filter(
          (
            row,
          ) =>
            !subjectIds.size ||
            subjectIds.has(
              cleanId(
                idOf(row),
              ),
            ),
        );

      const assignments =
        (
          rows.assignments ||
          []
        ).filter(
          (
            row,
          ) =>
            (
              !row.studentId ||
              sameId(
                row.studentId,
                currentStudentId,
              )
            ) &&
            (
              !row.classId ||
              sameId(
                row.classId,
                classId,
              )
            ),
        );

      const attendance =
        (
          rows.attendance ||
          []
        ).filter(
          (
            row,
          ) =>
            !currentStudentId ||
            sameId(
              row.studentId,
              currentStudentId,
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

      const results =
        (
          rows.computedResults ||
          []
        ).filter(
          (
            row,
          ) =>
            !currentStudentId ||
            sameId(
              row.studentId,
              currentStudentId,
            ),
        );

      const averageScore =
        results.length
          ? Math.round(
              results.reduce(
                (
                  total,
                  row,
                ) =>
                  total +
                  n(
                    row.percentage ||
                      row.average ||
                      row.score ||
                      row.totalScore,
                  ),
                0,
              ) /
                results.length,
            )
          : 0;

      const invoices =
        (
          rows.studentFeeInvoices ||
          []
        ).filter(
          (
            row,
          ) =>
            !currentStudentId ||
            sameId(
              row.studentId,
              currentStudentId,
            ),
        );

      const payments =
        [
          ...(
            rows.studentFeePayments ||
            []
          ),
          ...(
            rows.payments ||
            []
          ),
        ].filter(
          (
            row,
          ) =>
            !row.studentId ||
            sameId(
              row.studentId,
              currentStudentId,
            ),
        );

      const invoiceTotal =
        invoices.reduce(
          (
            total,
            row,
          ) =>
            total +
            n(
              row.total ||
                row.amount ||
                row.netAmount,
            ),
          0,
        );

      const paidTotal =
        payments.reduce(
          (
            total,
            row,
          ) =>
            total +
            n(
              row.amount ||
                row.total,
            ),
          0,
        );

      return {
        subjects:
          subjects.length ||
          subjectIds.size,

        assignments:
          count(
            assignments,
          ),

        pendingAssignments:
          assignments.filter(
            (
              row,
            ) =>
              ![
                "submitted",
                "completed",
                "graded",
              ].includes(
                text(
                  row.status,
                ).toLowerCase(),
              ),
          ).length,

        attendancePercent,

        present,

        attendance:
          count(
            attendance,
          ),

        results:
          count(
            results,
          ),

        averageScore,

        reportCards:
          (
            rows.reportCards ||
            []
          ).filter(
            (
              row,
            ) =>
              !currentStudentId ||
              sameId(
                row.studentId,
                currentStudentId,
              ),
          ).length,

        feeBalance:
          Math.max(
            0,
            invoiceTotal -
              paidTotal,
          ),

        currency:
          text(
            invoices[0]
              ?.currencyCode ||
              payments[0]
                ?.currencyCode,
            "GHS",
          ),
      };
    }, [
      rows,
      student,
      studentId,
    ]);

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
                  a.date ||
                  0,
              ).getTime() -
              new Date(
                b.startAt ||
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
        title="Opening student home..."
      />
    );
  }

  return (
    <main
      className="sd-page"
      style={
        {
          "--sd-primary":
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

      <section className="sd-metrics">
        <button
          type="button"
          onClick={() =>
            openRoute(
              "myAttendance",
            )
          }
        >
          <span>
            Attendance
          </span>
          <strong>
            {
              summary.attendancePercent
            }
            %
          </strong>
          <small>
            {
              summary.present
            }{" "}
            present record(s)
          </small>
        </button>

        <button
          type="button"
          onClick={() =>
            openRoute(
              "myResults",
            )
          }
        >
          <span>
            Results
          </span>
          <strong>
            {
              summary.averageScore ||
              "—"
            }
            {summary.averageScore
              ? "%"
              : ""}
          </strong>
          <small>
            {
              summary.results
            }{" "}
            result record(s)
          </small>
        </button>
      </section>

      <section className="sd-grid">
        <article className="sd-card">
          <header>
            <div>
              <span>
                Learning
              </span>
              <h2>
                My work
              </h2>
            </div>
          </header>

          <div className="sd-work-grid">
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
                  summary.subjects
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
                  "myAssignments",
                )
              }
            >
              <strong>
                {
                  summary.pendingAssignments
                }
              </strong>
              <span>
                Pending
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                openRoute(
                  "myReportCards",
                )
              }
            >
              <strong>
                {
                  summary.reportCards
                }
              </strong>
              <span>
                Reports
              </span>
            </button>
          </div>
        </article>

        <article className="sd-card">
          <header>
            <div>
              <span>
                Account
              </span>
              <h2>
                Fees
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                openRoute(
                  "studentPayments",
                )
              }
            >
              Open
            </button>
          </header>

          <strong className="sd-balance">
            {money(
              summary.feeBalance,
              summary.currency,
            )}
          </strong>

          <p className="sd-muted">
            {summary.feeBalance
              ? "Outstanding balance"
              : "No outstanding balance"}
          </p>
        </article>

        <article className="sd-card">
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

          <div className="sd-list">
            {announcements.map(
              (
                item,
                index,
              ) => (
                <button
                  type="button"
                  className="sd-row"
                  key={
                    cleanId(
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
                          item.content,
                        "Open to read",
                      )}
                    </small>
                  </div>
                </button>
              ),
            )}

            {!announcements.length ? (
              <MiniEmpty
                text="No announcements yet."
              />
            ) : null}
          </div>
        </article>

        <article className="sd-card">
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
                  "calendar",
                )
              }
            >
              Calendar
            </button>
          </header>

          <div className="sd-list">
            {events.map(
              (
                item,
                index,
              ) => (
                <button
                  type="button"
                  className="sd-row"
                  key={
                    cleanId(
                      idOf(
                        item,
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
                        item.title ||
                          item.name,
                        "School event",
                      )}
                    </strong>

                    <small>
                      {dateLabel(
                        item.startAt ||
                          item.date,
                      )}
                    </small>
                  </div>
                </button>
              ),
            )}

            {!events.length ? (
              <MiniEmpty
                text="Nothing upcoming."
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
    <div className="sd-empty">
      {body}
    </div>
  );
}

function State({
  primary,
  title,
}: {
  primary: string;
  title: string;
}) {
  return (
    <main
      className="sd-page"
      style={
        {
          "--sd-primary":
            primary,
        } as React.CSSProperties
      }
    >
      <style>
        {css}
      </style>

      <section className="sd-state">
        <div className="sd-spinner" />
        <h2>
          {title}
        </h2>
      </section>
    </main>
  );
}

const css = `
@keyframes sdSpin {
  to { transform: rotate(360deg); }
}

.sd-page {
  width: 100%;
  height: auto !important;
  min-height: 0 !important;
  overflow: visible !important;
  padding: 8px 8px calc(76px + env(safe-area-inset-bottom,0px));
  background: var(--bg,#f7f8fb);
  color: var(--text,#111827);
}

.sd-page,
.sd-page * {
  box-sizing: border-box;
  min-width: 0;
}

.sd-page button {
  font: inherit;
  cursor: pointer;
}

.sd-hero {
  position: relative;
  height: clamp(290px,47vw,390px);
  overflow: hidden;
  border-radius: 25px;
  background: #0f172a;
  box-shadow: 0 14px 34px rgba(15,23,42,.08);
}

.sd-hero img,
.sd-hero video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sd-dots {
  position: absolute;
  left: 50%;
  bottom: 11px;
  display: flex;
  gap: 6px;
  transform: translateX(-50%);
}

.sd-dots button {
  width: 7px;
  height: 7px;
  padding: 0;
  border: 0;
  border-radius: 99px;
  background: rgba(255,255,255,.5);
}

.sd-dots button.active {
  width: 20px;
  background: #fff;
}

.sd-metrics,
.sd-grid {
  display: grid;
  gap: 9px;
  margin-top: 9px;
}

.sd-metrics {
  grid-template-columns: repeat(2,minmax(0,1fr));
}

.sd-metrics button,
.sd-card {
  border: 1px solid var(--border,rgba(15,23,42,.09));
  background: var(--card-bg,var(--surface,#fff));
  color: inherit;
  box-shadow: 0 8px 22px rgba(15,23,42,.045);
}

.sd-metrics button {
  min-height: 92px;
  padding: 12px;
  border-radius: 20px;
  text-align: left;
}

.sd-metrics span,
.sd-metrics strong,
.sd-metrics small {
  display: block;
}

.sd-metrics span {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.sd-metrics strong {
  margin-top: 5px;
  font-size: 28px;
  line-height: 1;
  letter-spacing: -.05em;
}

.sd-metrics small {
  margin-top: 5px;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.sd-card {
  padding: 13px;
  border-radius: 22px;
}

.sd-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.sd-card header span {
  color: var(--muted,#64748b);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .09em;
  text-transform: uppercase;
}

.sd-card h2 {
  margin: 2px 0 0;
  font-size: 16px;
}

.sd-card header button {
  border: 0;
  border-radius: 999px;
  padding: 6px 9px;
  background: color-mix(in srgb,var(--sd-primary) 9%,transparent);
  color: var(--sd-primary);
  font-size: 10px;
  font-weight: 900;
}

.sd-work-grid {
  display: grid;
  grid-template-columns: repeat(3,minmax(0,1fr));
  gap: 7px;
}

.sd-work-grid button {
  min-height: 74px;
  border: 0;
  border-radius: 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 6%,transparent);
  color: inherit;
}

.sd-work-grid strong,
.sd-work-grid span {
  display: block;
}

.sd-work-grid strong {
  font-size: 22px;
}

.sd-work-grid span {
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 9px;
  font-weight: 850;
}

.sd-balance {
  display: block;
  font-size: 28px;
  letter-spacing: -.05em;
}

.sd-muted {
  margin: 5px 0 0;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.sd-list {
  display: grid;
  gap: 6px;
}

.sd-row {
  width: 100%;
  display: grid;
  grid-template-columns: 36px minmax(0,1fr);
  gap: 9px;
  align-items: center;
  border: 0;
  border-radius: 15px;
  padding: 8px;
  background: color-mix(in srgb,var(--muted,#64748b) 5%,transparent);
  color: inherit;
  text-align: left;
}

.sd-row > span {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: color-mix(in srgb,var(--sd-primary) 10%,transparent);
}

.sd-row strong,
.sd-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sd-row strong {
  font-size: 12px;
}

.sd-row small {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.sd-empty {
  padding: 18px 8px;
  text-align: center;
  color: var(--muted,#64748b);
  font-size: 11px;
}

.sd-state {
  min-height: 280px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
}

.sd-spinner {
  width: 36px;
  height: 36px;
  border: 4px solid color-mix(in srgb,var(--sd-primary) 16%,transparent);
  border-top-color: var(--sd-primary);
  border-radius: 999px;
  animation: sdSpin .8s linear infinite;
}

.sd-state h2 {
  margin: 0;
  font-size: 17px;
}

.sd-page,
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
  .sd-page {
    padding: 12px 12px 24px;
  }

  .sd-grid {
    grid-template-columns: repeat(2,minmax(0,1fr));
  }

  .sd-hero {
    height: 370px;
  }
}

@media (min-width:1100px) {
  .sd-page {
    max-width: 1180px;
    margin: 0 auto;
  }
}
`;