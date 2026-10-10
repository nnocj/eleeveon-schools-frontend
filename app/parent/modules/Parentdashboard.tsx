"use client";

/**
 * app/parent/modules/Parentdashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON PARENT HOME
 * ---------------------------------------------------------
 * Simplified portal-home layout:
 * - Portal Highlights first
 * - No dashboard search strip
 * - No greeting/name/motto text over hero
 * - No quick-action strip
 * - Compact family information
 * - Single document scroll
 * - Offline-first Dexie data
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
  "schools",
  "branches",
  "appUsers",
  "parents",
  "students",
  "studentParents",
  "studentEnrollments",
  "classes",
  "attendance",
  "computedResults",
  "reportCards",
  "studentFeeInvoices",
  "studentFeePayments",
  "payments",
  "announcements",
  "calendarEvents",
  "scheduleSessions",
  "portalHighlights",
  "mediaAssets",
] as const;

type OpenWorkspaceSession = {
  membership?:
    AnyRow | null;

  schoolId?:
    string | number | null;

  branchId?:
    string | number | null;

  parentLocalId?:
    string | number | null;
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
  left: unknown,
  right: unknown,
) {
  const a =
    cleanId(left);

  const b =
    cleanId(right);

  return Boolean(
    a &&
    b &&
    a === b,
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
  ].includes(status);
}

function workspaceMembership(
  openWorkspace:
    OpenWorkspaceSession | null,
  activeMembership:
    AnyRow | null,
) {
  return (
    openWorkspace?.membership ||
    activeMembership ||
    safeJson<AnyRow>(
      "activeMembership",
    ) ||
    null
  );
}

function firstId(
  ...values: unknown[]
) {
  for (
    const value
    of values
  ) {
    const parsed =
      cleanId(value);

    if (parsed) {
      return parsed;
    }
  }

  return "";
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

function scoped(
  row: AnyRow,
  accountId?: string | null,
  schoolId?: string,
  branchId?: string,
) {
  if (
    row.isDeleted === true
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

  const rowSchoolId =
    row.schoolId ??
    row.schoolLocalId ??
    row.payload?.schoolId;

  const rowBranchId =
    row.branchId ??
    row.branchLocalId ??
    row.payload?.branchId;

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

function todayKey() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}

function mediaUrl(
  media: AnyRow[],
  mediaId: unknown,
) {
  const id =
    cleanId(mediaId);

  if (!id) {
    return "";
  }

  const asset =
    media.find(
      (row) =>
        sameId(
          idOf(row),
          id,
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
        (row) =>
          row?.metadata?.placement !==
          "gallery",
      )
      .filter(
        (row) => {
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
                  "parent",
                  "parents",
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
            startAt > now
          ) {
            return false;
          }

          if (
            endAt &&
            endAt < now
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
              `parent-highlight-${index}`,
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
          slide,
        ): slide is HeroSlide =>
          Boolean(slide),
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
          slides.length,
          1,
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
      window.clearTimeout(
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
    <section className="pd-hero">
      {slide.type ===
      "video" ? (
        <video
          key={slide.id}
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
          key={slide.id}
          src={slide.src}
          alt=""
        />
      )}

      {slides.length >
      1 ? (
        <div className="pd-hero-dots">
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
                aria-label={`Show slide ${
                  dotIndex +
                  1
                }`}
                onClick={() =>
                  setIndex(
                    dotIndex,
                  )
                }
              />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}

export default function Parentdashboard({
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
    activeParentId,
    activeMembership,
  } =
    useActiveMembership();

  const primary =
    settings?.primaryColor ||
    "var(--primary-color,#2563eb)";

  const openWorkspace =
    useMemo(
      () =>
        safeJson<OpenWorkspaceSession>(
          OPEN_WORKSPACE_KEY,
        ),
      [],
    );

  const membership =
    workspaceMembership(
      openWorkspace,
      activeMembership,
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
      safeRead(
        "activeSchoolId",
      ),
    );

  const branchId =
    firstId(
      openWorkspace?.branchId,
      membership?.branchId,
      membership?.schoolBranchId,
      activeBranchId,
      (activeBranch as AnyRow)
        ?.id,
      (settings as AnyRow)
        ?.branchId,
      safeRead(
        "activeBranchId",
      ),
    );

  const parentId =
    firstId(
      openWorkspace?.parentLocalId,
      membership?.parentLocalId,
      membership?.parentId,
      activeParentId,
      safeRead(
        "activeParentId",
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
              const records =
                await safeArray(
                  tableName,
                );

              return [
                tableName,
                records.filter(
                  (
                    row,
                  ) =>
                    scoped(
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
    parentId,
    accountLoading,
    settingsLoading,
  ]);

  const rows =
    rowsByTable;

  const parent =
    useMemo(
      () =>
        (
          rows.parents ||
          []
        ).find(
          (
            row,
          ) =>
            parentId &&
            sameId(
              idOf(row),
              parentId,
            ),
        ) ||
        null,
      [
        rows.parents,
        parentId,
      ],
    );

  const childLinks =
    useMemo(
      () =>
        (
          rows.studentParents ||
          []
        ).filter(
          (
            row,
          ) =>
            parentId &&
            sameId(
              row.parentId ||
                row.parentLocalId,
              parentId,
            ),
        ),
      [
        rows.studentParents,
        parentId,
      ],
    );

  const children =
    useMemo(() => {
      const students =
        (
          rows.students ||
          []
        ).filter(
          activeRow,
        );

      const ids =
        new Set(
          childLinks
            .map(
              (
                row,
              ) =>
                cleanId(
                  row.studentId ||
                    row.studentLocalId,
                ),
            )
            .filter(
              Boolean,
            ),
        );

      if (
        ids.size
      ) {
        return students.filter(
          (
            row,
          ) =>
            ids.has(
              cleanId(
                idOf(row),
              ),
            ),
        );
      }

      const email =
        parent?.email ||
        membership?.parentEmail;

      const phone =
        parent?.phone ||
        membership?.parentPhone;

      return students.filter(
        (
          row,
        ) =>
          Boolean(
            (
              email &&
              sameId(
                row.parentEmail,
                email,
              )
            ) ||
              (
                phone &&
                sameId(
                  row.parentPhone,
                  phone,
                )
              ),
          ),
      );
    }, [
      rows.students,
      childLinks,
      parent,
      membership,
    ]);

  const childIds =
    useMemo(
      () =>
        new Set(
          children
            .map(
              (
                row,
              ) =>
                cleanId(
                  idOf(row),
                ),
            )
            .filter(
              Boolean,
            ),
        ),
      [
        children,
      ],
    );

  const summary =
    useMemo(() => {
      const attendance =
        (
          rows.attendance ||
          []
        ).filter(
          (
            row,
          ) =>
            childIds.has(
              cleanId(
                row.studentId,
              ),
            ),
        );

      const today =
        todayKey();

      const todayRows =
        attendance.filter(
          (
            row,
          ) =>
            text(
              row.date ||
                row.createdAt,
            ).startsWith(
              today,
            ),
        );

      const present =
        todayRows.filter(
          (
            row,
          ) =>
            text(
              row.status,
            ).toLowerCase() ===
            "present",
        ).length;

      const attendancePercent =
        todayRows.length
          ? Math.round(
              (
                present /
                todayRows.length
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
            childIds.has(
              cleanId(
                row.studentId,
              ),
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
            childIds.has(
              cleanId(
                row.studentId,
              ),
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
            childIds.has(
              cleanId(
                row.studentId,
              ),
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
        children:
          children.length,

        attendancePercent,

        present,

        attendanceRecorded:
          todayRows.length,

        results:
          results.length,

        averageScore,

        invoices:
          count(
            invoices,
          ),

        payments:
          count(
            payments,
          ),

        paidTotal,

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
      childIds,
      children.length,
    ]);

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
        title="Opening parent home..."
      />
    );
  }

  return (
    <main
      className="pd-page"
      style={
        {
          "--pd-primary":
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

      <section className="pd-metric-grid">
        <button
          type="button"
          className="pd-metric"
          onClick={() =>
            openRoute(
              "childAttendance",
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
            present today
          </small>
        </button>

        <button
          type="button"
          className="pd-metric"
          onClick={() =>
            openRoute(
              "childResults",
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

      <section className="pd-grid">
        <article className="pd-card">
          <header>
            <div>
              <span>
                Family
              </span>
              <h2>
                My children
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                openRoute(
                  "children",
                )
              }
            >
              View all
            </button>
          </header>

          <div className="pd-list">
            {children
              .slice(
                0,
                3,
              )
              .map(
                (
                  child,
                  index,
                ) => (
                  <button
                    type="button"
                    className="pd-row"
                    key={
                      cleanId(
                        idOf(
                          child,
                        ),
                      ) ||
                      index
                    }
                    onClick={() =>
                      openRoute(
                        "children",
                      )
                    }
                  >
                    <span className="pd-avatar">
                      {text(
                        child.fullName ||
                          child.name,
                        "C",
                      )
                        .slice(
                          0,
                          1,
                        )
                        .toUpperCase()}
                    </span>

                    <span>
                      <strong>
                        {text(
                          child.fullName ||
                            child.name,
                          "Student",
                        )}
                      </strong>

                      <small>
                        {text(
                          child.className,
                          "Open student profile",
                        )}
                      </small>
                    </span>

                    <i>
                      ›
                    </i>
                  </button>
                ),
              )}

            {!children.length ? (
              <MiniEmpty
                text="No linked children found."
              />
            ) : null}
          </div>
        </article>

        <article className="pd-card pd-fees">
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
                  "childFees",
                )
              }
            >
              Open
            </button>
          </header>

          <strong className="pd-big-number">
            {money(
              summary.feeBalance,
              summary.currency,
            )}
          </strong>

          <p>
            {summary.feeBalance
              ? "Outstanding balance"
              : "Account currently clear"}
          </p>

          <div className="pd-inline-stats">
            <span>
              <b>
                {
                  summary.invoices
                }
              </b>
              Invoices
            </span>

            <span>
              <b>
                {
                  summary.payments
                }
              </b>
              Payments
            </span>
          </div>
        </article>

        <article className="pd-card">
          <header>
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

          <div className="pd-list">
            {announcements.map(
              (
                item,
                index,
              ) => (
                <button
                  type="button"
                  key={
                    cleanId(
                      idOf(
                        item,
                      ),
                    ) ||
                    index
                  }
                  className="pd-row compact"
                  onClick={() =>
                    openRoute(
                      "announcements",
                    )
                  }
                >
                  <span className="pd-icon">
                    📣
                  </span>

                  <span>
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
                        "Open to read",
                      )}
                    </small>
                  </span>

                  <i>
                    ›
                  </i>
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

        <article className="pd-card">
          <header>
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

          <div className="pd-list">
            {events.map(
              (
                event,
                index,
              ) => (
                <button
                  type="button"
                  className="pd-row compact"
                  key={
                    cleanId(
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
                  <span className="pd-icon">
                    🗓️
                  </span>

                  <span>
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
                  </span>

                  <i>
                    ›
                  </i>
                </button>
              ),
            )}

            {!events.length ? (
              <MiniEmpty
                text="No upcoming events."
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
    <div className="pd-empty">
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
      className="pd-page"
      style={
        {
          "--pd-primary":
            primary,
        } as React.CSSProperties
      }
    >
      <style>
        {css}
      </style>

      <section className="pd-state">
        <div className="pd-spinner" />
        <h2>
          {title}
        </h2>
      </section>
    </main>
  );
}

const css = `
@keyframes pdSpin {
  to {
    transform: rotate(360deg);
  }
}

.pd-page {
  width: 100%;
  height: auto !important;
  min-height: 0 !important;
  overflow: visible !important;
  padding: 8px 8px calc(76px + env(safe-area-inset-bottom, 0px));
  color: var(--text, #111827);
  background: var(--bg, #f7f8fb);
}

.pd-page,
.pd-page * {
  box-sizing: border-box;
  min-width: 0;
}

.pd-page button {
  font: inherit;
  cursor: pointer;
}

.pd-hero {
  position: relative;
  width: 100%;
  height: clamp(290px, 47vw, 390px);
  overflow: hidden;
  border-radius: 25px;
  background:
    color-mix(
      in srgb,
      var(--pd-primary) 12%,
      #0f172a
    );
  box-shadow: 0 14px 34px rgba(15,23,42,.08);
}

.pd-hero img,
.pd-hero video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.pd-hero-dots {
  position: absolute;
  left: 50%;
  bottom: 11px;
  z-index: 3;
  display: flex;
  gap: 6px;
  transform: translateX(-50%);
}

.pd-hero-dots button {
  width: 7px;
  height: 7px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255,255,255,.52);
}

.pd-hero-dots button.active {
  width: 20px;
  background: #fff;
}

.pd-metric-grid,
.pd-grid {
  display: grid;
  gap: 9px;
  margin-top: 9px;
}

.pd-metric-grid {
  grid-template-columns: repeat(2, minmax(0,1fr));
}

.pd-metric,
.pd-card {
  border:
    1px solid
    var(--border, rgba(15,23,42,.09));
  background:
    var(--card-bg, var(--surface,#fff));
  color: inherit;
  box-shadow:
    0 8px 22px rgba(15,23,42,.045);
}

.pd-metric {
  min-height: 92px;
  padding: 12px;
  border-radius: 20px;
  text-align: left;
}

.pd-metric > span,
.pd-metric > strong,
.pd-metric > small {
  display: block;
}

.pd-metric > span {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.pd-metric > strong {
  margin-top: 5px;
  font-size: 28px;
  line-height: 1;
  letter-spacing: -.05em;
}

.pd-metric > small {
  margin-top: 5px;
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 750;
}

.pd-card {
  padding: 13px;
  border-radius: 22px;
}

.pd-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 9px;
}

.pd-card header span {
  display: block;
  color: var(--muted,#64748b);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .09em;
  text-transform: uppercase;
}

.pd-card h2 {
  margin: 2px 0 0;
  font-size: 16px;
  letter-spacing: -.03em;
}

.pd-card header button {
  border: 0;
  border-radius: 999px;
  padding: 6px 9px;
  background:
    color-mix(
      in srgb,
      var(--pd-primary) 9%,
      transparent
    );
  color: var(--pd-primary);
  font-size: 10px;
  font-weight: 900;
}

.pd-list {
  display: grid;
  gap: 6px;
}

.pd-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 8px;
  border: 0;
  border-radius: 15px;
  background:
    color-mix(
      in srgb,
      var(--muted,#64748b) 5%,
      transparent
    );
  color: inherit;
  text-align: left;
}

.pd-avatar,
.pd-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background:
    color-mix(
      in srgb,
      var(--pd-primary) 10%,
      transparent
    );
}

.pd-avatar {
  color: var(--pd-primary);
  font-weight: 1000;
}

.pd-row strong,
.pd-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pd-row strong {
  font-size: 12px;
}

.pd-row small {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.pd-row i {
  color: var(--muted,#64748b);
  font-style: normal;
  font-size: 18px;
}

.pd-big-number {
  display: block;
  font-size: 27px;
  line-height: 1;
  letter-spacing: -.05em;
}

.pd-fees p {
  margin: 5px 0 0;
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 750;
}

.pd-inline-stats {
  display: grid;
  grid-template-columns: repeat(2,minmax(0,1fr));
  gap: 7px;
  margin-top: 12px;
}

.pd-inline-stats span {
  padding: 9px;
  border-radius: 14px;
  background:
    color-mix(
      in srgb,
      var(--muted,#64748b) 6%,
      transparent
    );
  color: var(--muted,#64748b);
  font-size: 9px;
  font-weight: 800;
}

.pd-inline-stats b {
  display: block;
  margin-bottom: 2px;
  color: var(--text,#111827);
  font-size: 15px;
}

.pd-empty {
  padding: 18px 8px;
  text-align: center;
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
}

.pd-state {
  min-height: 280px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
}

.pd-spinner {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border:
    4px solid
    color-mix(
      in srgb,
      var(--pd-primary) 16%,
      transparent
    );
  border-top-color: var(--pd-primary);
  animation: pdSpin .8s linear infinite;
}

.pd-state h2 {
  margin: 0;
  font-size: 17px;
}

/*
 * Single document scroll ownership.
 */
.pd-page,
.app-content,
.app-content-inner,
.shell-portal-content,
.shell-content-background {
  height: auto !important;
  max-height: none !important;
  min-height: 0 !important;
  overflow-y: visible !important;
  overscroll-behavior-y: auto !important;
}

html {
  overflow-y: auto !important;
}

body {
  overflow-y: visible !important;
}

@media (min-width: 720px) {
  .pd-page {
    padding: 12px 12px 24px;
  }

  .pd-grid {
    grid-template-columns:
      repeat(2,minmax(0,1fr));
  }

  .pd-hero {
    height: 370px;
  }
}

@media (min-width: 1100px) {
  .pd-page {
    max-width: 1180px;
    margin: 0 auto;
  }
}
`;