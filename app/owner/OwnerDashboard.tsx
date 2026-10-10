"use client";

/**
 * app/owner/OwnerDashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON OWNER HOME
 * ---------------------------------------------------------
 * Account-wide portal home.
 *
 * - Portal Highlights first
 * - No greeting/name/account-name hero text
 * - No dashboard search strip
 * - No quick-action row
 * - Compact ownership overview
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
} from "../context/account-context";

import {
  useSettings,
} from "../context/settings-context";

import {
  db,
} from "../lib/db";

import type {
  RoleNavSection,
} from "../components/role-portals/RolePortalShell";

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
  "users",
  "accountUsers",
  "userMemberships",
  "memberships",
  "announcements",
  "messageThreads",
  "invoices",
  "appPayments",
  "payments",
  "accountSubscriptions",
  "subscriptionPlans",
  "syncConflicts",
  "portalHighlights",
  "mediaAssets",
] as const;

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
    "blocked",
    "suspended",
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

function rowName(
  row?: AnyRow | null,
) {
  return text(
    row?.name ||
      row?.fullName ||
      row?.title ||
      row?.email,
    "Unnamed",
  );
}

function mediaUrl(
  media: AnyRow[],
  id: unknown,
) {
  const asset =
    media.find(
      (
        row,
      ) =>
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

          return audiences.some(
            (
              value: string,
            ) =>
              [
                "all",
                "owner",
                "super_admin",
                "super-admin",
              ].includes(
                value,
              ),
          );
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
              `owner-highlight-${index}`,
            type,
            src,
            poster:
              mediaUrl(
                media,
                row.posterMediaAssetId,
              ) ||
              undefined,
            durationSeconds:
              Math.max(
                3,
                n(
                  row.durationSeconds ||
                    7,
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
    <section className="od-hero">
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
        <div className="od-dots">
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
              />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}

export default function OwnerDashboardPage({
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
    useAccount() as any;

  const {
    settings,
    loading:
      settingsLoading,
  } =
    useSettings();

  const primary =
    settings?.primaryColor ||
    "var(--primary-color,#2563eb)";

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
                  ) =>
                    !row.accountId ||
                    sameId(
                      row.accountId,
                      accountId,
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
    accountLoading,
    settingsLoading,
  ]);

  const rows =
    rowsByTable;

  const summary =
    useMemo(() => {
      const schools =
        (
          rows.schools ||
          []
        ).filter(
          activeRow,
        );

      const branches =
        (
          rows.branches ||
          []
        ).filter(
          activeRow,
        );

      const users =
        (
          rows.appUsers ||
          rows.users ||
          rows.accountUsers ||
          []
        ).filter(
          activeRow,
        );

      const memberships =
        (
          rows.userMemberships ||
          rows.memberships ||
          []
        ).filter(
          activeRow,
        );

      const uniqueUsers =
        new Set(
          [
            ...users.map(
              (
                row,
              ) =>
                clean(
                  row.id ||
                    row.userId ||
                    row.email,
                ),
            ),
            ...memberships.map(
              (
                row,
              ) =>
                clean(
                  row.userId ||
                    row.appUserId ||
                    row.email,
                ),
            ),
          ].filter(
            Boolean,
          ),
        ).size;

      const invoices =
        (
          rows.invoices ||
          []
        ).filter(
          activeRow,
        );

      const payments =
        [
          ...(
            rows.appPayments ||
            []
          ),
          ...(
            rows.payments ||
            []
          ),
        ].filter(
          activeRow,
        );

      const subscriptions =
        (
          rows.accountSubscriptions ||
          []
        ).filter(
          activeRow,
        );

      const plans =
        (
          rows.subscriptionPlans ||
          []
        ).filter(
          activeRow,
        );

      const subscription =
        subscriptions
          .slice()
          .sort(
            (
              a,
              b,
            ) =>
              n(
                b.updatedAt ||
                  b.createdAt,
              ) -
              n(
                a.updatedAt ||
                  a.createdAt,
              ),
          )[0];

      const plan =
        plans.find(
          (
            row,
          ) =>
            sameId(
              idOf(row),
              subscription?.planId,
            ),
        );

      const totalPaid =
        payments
          .filter(
            (
              row,
            ) =>
              [
                "paid",
                "success",
                "succeeded",
                "completed",
              ].includes(
                text(
                  row.status,
                ).toLowerCase(),
              ),
          )
          .reduce(
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

      const conflicts =
        (
          rows.syncConflicts ||
          []
        ).filter(
          (
            row,
          ) =>
            ![
              "resolved",
              "closed",
              "ignored",
            ].includes(
              text(
                row.status,
                "open",
              ).toLowerCase(),
            ),
        ).length;

      return {
        schools:
          schools.length,
        branches:
          branches.length,
        users:
          uniqueUsers,
        invoices:
          invoices.length,
        payments:
          payments.length,
        totalPaid,
        conflicts,
        planName:
          text(
            plan?.name ||
              subscription?.planName,
            "No plan",
          ),
        subscriptionStatus:
          text(
            subscription?.status,
            "Not set",
          ),
        currency:
          text(
            plan?.currency ||
              subscription?.currency ||
              payments[0]
                ?.currency,
            "GHS",
          ),
      };
    }, [
      rows,
    ]);

  const schools =
    useMemo(
      () =>
        (
          rows.schools ||
          []
        )
          .filter(
            activeRow,
          )
          .slice(
            0,
            3,
          ),
      [
        rows.schools,
      ],
    );

  const recent =
    useMemo(() => {
      const records = [
        ...(
          rows.announcements ||
          []
        ).map(
          (
            row,
          ) => ({
            ...row,
            _kind:
              "Announcement",
            _icon:
              "📣",
            _title:
              text(
                row.title,
                "Announcement",
              ),
            _date:
              row.sentAt ||
              row.updatedAt ||
              row.createdAt,
          }),
        ),
        ...(
          rows.payments ||
          []
        ).map(
          (
            row,
          ) => ({
            ...row,
            _kind:
              "Payment",
            _icon:
              "💳",
            _title:
              money(
                row.amount ||
                  row.total,
                row.currency ||
                  summary.currency,
              ),
            _date:
              row.paidAt ||
              row.updatedAt ||
              row.createdAt,
          }),
        ),
      ];

      return records
        .filter(
          activeRow,
        )
        .sort(
          (
            a,
            b,
          ) =>
            new Date(
              b._date ||
                0,
            ).getTime() -
            new Date(
              a._date ||
                0,
            ).getTime(),
        )
        .slice(
          0,
          3,
        );
    }, [
      rows,
      summary.currency,
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
      className="od-page"
      style={
        {
          "--od-primary":
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

      <section className="od-metrics">
        <button
          type="button"
          onClick={() =>
            openRoute(
              "schools",
            )
          }
        >
          <span>
            Schools
          </span>

          <strong>
            {
              summary.schools
            }
          </strong>

          <small>
            {
              summary.branches
            }{" "}
            branches
          </small>
        </button>

        <button
          type="button"
          onClick={() =>
            openRoute(
              "users",
            )
          }
        >
          <span>
            Users
          </span>

          <strong>
            {
              summary.users
            }
          </strong>

          <small>
            account-wide
          </small>
        </button>
      </section>

      <section className="od-grid">
        <article className="od-card">
          <header>
            <div>
              <span>
                Institution
              </span>
              <h2>
                Schools
              </h2>
            </div>

            <button
              onClick={() =>
                openRoute(
                  "schools",
                )
              }
            >
              Manage
            </button>
          </header>

          <div className="od-list">
            {schools.map(
              (
                school,
                index,
              ) => {
                const schoolId =
                  idOf(
                    school,
                  );

                const branchCount =
                  (
                    rows.branches ||
                    []
                  ).filter(
                    (
                      row,
                    ) =>
                      activeRow(
                        row,
                      ) &&
                      sameId(
                        row.schoolId,
                        schoolId,
                      ),
                  ).length;

                return (
                  <button
                    type="button"
                    className="od-row"
                    key={
                      clean(
                        schoolId,
                      ) ||
                      index
                    }
                    onClick={() =>
                      openRoute(
                        "schools",
                      )
                    }
                  >
                    <span>
                      🏫
                    </span>

                    <div>
                      <strong>
                        {rowName(
                          school,
                        )}
                      </strong>

                      <small>
                        {
                          branchCount
                        }{" "}
                        branch(es)
                      </small>
                    </div>
                  </button>
                );
              },
            )}

            {!schools.length ? (
              <MiniEmpty
                text="No schools yet."
              />
            ) : null}
          </div>
        </article>

        <article className="od-card">
          <header>
            <div>
              <span>
                Subscription
              </span>
              <h2>
                Account plan
              </h2>
            </div>

            <button
              onClick={() =>
                openRoute(
                  "subscription",
                )
              }
            >
              Open
            </button>
          </header>

          <strong className="od-big">
            {
              summary.planName
            }
          </strong>

          <p>
            {
              summary.subscriptionStatus
            }
          </p>

          <div className="od-inline">
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
                {money(
                  summary.totalPaid,
                  summary.currency,
                )}
              </b>
              Paid
            </span>
          </div>
        </article>

        <article className="od-card">
          <header>
            <div>
              <span>
                System
              </span>
              <h2>
                Sync health
              </h2>
            </div>

            <button
              onClick={() =>
                openRoute(
                  "sync",
                )
              }
            >
              Inspect
            </button>
          </header>

          <strong className="od-big">
            {summary.conflicts
              ? "Attention"
              : "Healthy"}
          </strong>

          <p>
            {summary.conflicts
              ? `${summary.conflicts} unresolved conflict(s)`
              : "No unresolved sync conflicts"}
          </p>
        </article>

        <article className="od-card">
          <header>
            <div>
              <span>
                Recent
              </span>
              <h2>
                Account activity
              </h2>
            </div>
          </header>

          <div className="od-list">
            {recent.map(
              (
                item,
                index,
              ) => (
                <button
                  type="button"
                  className="od-row"
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
                      item._kind ===
                        "Payment"
                        ? "payments"
                        : "ownerAnnouncements",
                    )
                  }
                >
                  <span>
                    {
                      item._icon
                    }
                  </span>

                  <div>
                    <strong>
                      {
                        item._title
                      }
                    </strong>

                    <small>
                      {
                        item._kind
                      }{" "}
                      ·{" "}
                      {dateLabel(
                        item._date,
                      )}
                    </small>
                  </div>
                </button>
              ),
            )}

            {!recent.length ? (
              <MiniEmpty
                text="No recent account activity."
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
    <div className="od-empty">
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
      className="od-page"
      style={
        {
          "--od-primary":
            primary,
        } as React.CSSProperties
      }
    >
      <style>
        {css}
      </style>

      <section className="od-state">
        <div className="od-spinner" />
        <h2>
          Opening owner home...
        </h2>
      </section>
    </main>
  );
}

const css = `
@keyframes odSpin {
  to { transform: rotate(360deg); }
}

.od-page {
  width: 100%;
  height: auto !important;
  min-height: 0 !important;
  overflow: visible !important;
  padding: 8px 8px calc(76px + env(safe-area-inset-bottom,0px));
  background: var(--bg,#f7f8fb);
  color: var(--text,#111827);
}

.od-page,
.od-page * {
  box-sizing: border-box;
  min-width: 0;
}

.od-page button {
  font: inherit;
  cursor: pointer;
}

.od-hero {
  position: relative;
  height: clamp(290px,47vw,390px);
  overflow: hidden;
  border-radius: 25px;
  background: #0f172a;
  box-shadow: 0 14px 34px rgba(15,23,42,.08);
}

.od-hero img,
.od-hero video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.od-dots {
  position: absolute;
  left: 50%;
  bottom: 11px;
  display: flex;
  gap: 6px;
  transform: translateX(-50%);
}

.od-dots button {
  width: 7px;
  height: 7px;
  padding: 0;
  border: 0;
  border-radius: 99px;
  background: rgba(255,255,255,.5);
}

.od-dots button.active {
  width: 20px;
  background: #fff;
}

.od-metrics,
.od-grid {
  display: grid;
  gap: 9px;
  margin-top: 9px;
}

.od-metrics {
  grid-template-columns: repeat(2,minmax(0,1fr));
}

.od-metrics button,
.od-card {
  border: 1px solid var(--border,rgba(15,23,42,.09));
  background: var(--card-bg,var(--surface,#fff));
  color: inherit;
  box-shadow: 0 8px 22px rgba(15,23,42,.045);
}

.od-metrics button {
  min-height: 92px;
  padding: 12px;
  border-radius: 20px;
  text-align: left;
}

.od-metrics span,
.od-metrics strong,
.od-metrics small {
  display: block;
}

.od-metrics span {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.od-metrics strong {
  margin-top: 5px;
  font-size: 28px;
  line-height: 1;
}

.od-metrics small {
  margin-top: 5px;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.od-card {
  padding: 13px;
  border-radius: 22px;
}

.od-card header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.od-card header span {
  color: var(--muted,#64748b);
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .09em;
}

.od-card h2 {
  margin: 2px 0 0;
  font-size: 16px;
}

.od-card header button {
  border: 0;
  border-radius: 999px;
  padding: 6px 9px;
  background: color-mix(in srgb,var(--od-primary) 9%,transparent);
  color: var(--od-primary);
  font-size: 10px;
  font-weight: 900;
}

.od-list {
  display: grid;
  gap: 6px;
}

.od-row {
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

.od-row > span {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: color-mix(in srgb,var(--od-primary) 10%,transparent);
}

.od-row strong,
.od-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.od-row strong {
  font-size: 12px;
}

.od-row small {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.od-big {
  display: block;
  overflow-wrap: anywhere;
  font-size: 28px;
  line-height: 1;
  letter-spacing: -.05em;
}

.od-card > p {
  margin: 6px 0 0;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.od-inline {
  display: grid;
  grid-template-columns: repeat(2,minmax(0,1fr));
  gap: 7px;
  margin-top: 13px;
}

.od-inline span {
  padding: 9px;
  border-radius: 14px;
  background: color-mix(in srgb,var(--muted,#64748b) 6%,transparent);
  color: var(--muted,#64748b);
  font-size: 9px;
}

.od-inline b {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 3px;
  color: var(--text,#111827);
  font-size: 14px;
}

.od-empty {
  padding: 18px 8px;
  text-align: center;
  color: var(--muted,#64748b);
  font-size: 11px;
}

.od-state {
  min-height: 280px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
}

.od-spinner {
  width: 36px;
  height: 36px;
  border: 4px solid color-mix(in srgb,var(--od-primary) 16%,transparent);
  border-top-color: var(--od-primary);
  border-radius: 999px;
  animation: odSpin .8s linear infinite;
}

.od-state h2 {
  margin: 0;
  font-size: 17px;
}

.od-page,
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
  .od-page {
    padding: 12px 12px 24px;
  }

  .od-grid {
    grid-template-columns: repeat(2,minmax(0,1fr));
  }

  .od-hero {
    height: 370px;
  }
}

@media (min-width:1100px) {
  .od-page {
    max-width: 1180px;
    margin: 0 auto;
  }
}
`;