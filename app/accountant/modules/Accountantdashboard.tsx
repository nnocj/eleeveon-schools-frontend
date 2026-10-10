"use client";

/**
 * app/accountant/modules/Accountantdashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON ACCOUNTANT HOME
 * ---------------------------------------------------------
 * - Portal Highlights first
 * - No dashboard search strip
 * - No hero text
 * - No quick-action strip
 * - Compact financial overview
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
  "schools",
  "branches",
  "studentFeeInvoices",
  "studentFeeInvoiceItems",
  "studentFeePayments",
  "payments",
  "paymentTransactions",
  "paymentSettlements",
  "incomes",
  "expenses",
  "announcements",
  "calendarEvents",
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
    "cancelled",
    "void",
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
    const result =
      clean(value);

    if (result) {
      return result;
    }
  }

  return "";
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
                "accountant",
                "finance",
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
              `accountant-highlight-${index}`,
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
    <section className="ad-hero">
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
        <div className="ad-dots">
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
              />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}

export default function Accountantdashboard({
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
    activeMembership,
  } =
    useActiveMembership();

  const primary =
    settings?.primaryColor ||
    "var(--primary-color,#2563eb)";

  const open =
    useMemo(
      () =>
        safeJson<AnyRow>(
          OPEN_WORKSPACE_KEY,
        ),
      [],
    );

  const membership =
    open?.membership ||
    activeMembership ||
    safeJson<AnyRow>(
      "activeMembership",
    );

  const schoolId =
    firstId(
      open?.schoolId,
      membership?.schoolId,
      activeSchoolId,
      (activeSchool as AnyRow)
        ?.id,
      (settings as AnyRow)
        ?.schoolId,
    );

  const branchId =
    firstId(
      open?.branchId,
      membership?.branchId,
      activeBranchId,
      (activeBranch as AnyRow)
        ?.id,
      (settings as AnyRow)
        ?.branchId,
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
    accountLoading,
    settingsLoading,
  ]);

  const rows =
    rowsByTable;

  const summary =
    useMemo(() => {
      const invoices =
        (
          rows.studentFeeInvoices ||
          []
        ).filter(
          activeRow,
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
          ...(
            rows.paymentTransactions ||
            []
          ),
        ].filter(
          activeRow,
        );

      const incomes =
        (
          rows.incomes ||
          []
        ).filter(
          activeRow,
        );

      const expenses =
        (
          rows.expenses ||
          []
        ).filter(
          activeRow,
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

      const paymentTotal =
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

      const incomeTotal =
        incomes.reduce(
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

      const expenseTotal =
        expenses.reduce(
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
        invoices:
          invoices.length,
        payments:
          payments.length,
        incomes:
          incomes.length,
        expenses:
          expenses.length,
        invoiceTotal,
        paymentTotal,
        incomeTotal,
        expenseTotal,
        outstanding:
          Math.max(
            0,
            invoiceTotal -
              paymentTotal,
          ),
        balance:
          incomeTotal +
          paymentTotal -
          expenseTotal,
        currency:
          text(
            payments[0]
              ?.currency ||
              payments[0]
                ?.currencyCode ||
              invoices[0]
                ?.currencyCode ||
              incomes[0]
                ?.currencyCode,
            "GHS",
          ),
      };
    }, [
      rows,
    ]);

  const recent =
    useMemo(() => {
      const records = [
        ...(
          rows.studentFeeInvoices ||
          []
        ).map(
          (
            row,
          ) => ({
            ...row,
            _kind:
              "Invoice",
            _icon:
              "🧾",
            _date:
              row.updatedAt ||
              row.createdAt ||
              row.dueDate,
            _title:
              text(
                row.invoiceNumber ||
                  row.reference,
                "Invoice",
              ),
          }),
        ),
        ...(
          rows.studentFeePayments ||
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
            _date:
              row.paidAt ||
              row.updatedAt ||
              row.createdAt,
            _title:
              money(
                row.amount ||
                  row.total,
                row.currencyCode ||
                  summary.currency,
              ),
          }),
        ),
        ...(
          rows.expenses ||
          []
        ).map(
          (
            row,
          ) => ({
            ...row,
            _kind:
              "Expense",
            _icon:
              "📉",
            _date:
              row.date ||
              row.updatedAt ||
              row.createdAt,
            _title:
              text(
                row.title ||
                  row.description ||
                  row.category,
                "Expense",
              ),
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
          4,
        );
    }, [
      rows,
      summary.currency,
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
          .slice(
            0,
            2,
          ),
      [
        rows.announcements,
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
      />
    );
  }

  return (
    <main
      className="ad-page"
      style={
        {
          "--ad-primary":
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

      <section className="ad-metrics">
        <button
          type="button"
          onClick={() =>
            openRoute(
              "payments",
            )
          }
        >
          <span>
            Payments
          </span>
          <strong>
            {money(
              summary.paymentTotal,
              summary.currency,
            )}
          </strong>
          <small>
            {
              summary.payments
            }{" "}
            record(s)
          </small>
        </button>

        <button
          type="button"
          onClick={() =>
            openRoute(
              "fees",
            )
          }
        >
          <span>
            Outstanding
          </span>
          <strong>
            {money(
              summary.outstanding,
              summary.currency,
            )}
          </strong>
          <small>
            {
              summary.invoices
            }{" "}
            invoice(s)
          </small>
        </button>
      </section>

      <section className="ad-grid">
        <article className="ad-card">
          <header>
            <div>
              <span>
                Finance
              </span>
              <h2>
                Cash movement
              </h2>
            </div>
          </header>

          <div className="ad-finance-grid">
            <button
              onClick={() =>
                openRoute(
                  "income",
                )
              }
            >
              <strong>
                {money(
                  summary.incomeTotal,
                  summary.currency,
                )}
              </strong>
              <span>
                Income
              </span>
            </button>

            <button
              onClick={() =>
                openRoute(
                  "expenses",
                )
              }
            >
              <strong>
                {money(
                  summary.expenseTotal,
                  summary.currency,
                )}
              </strong>
              <span>
                Expenses
              </span>
            </button>
          </div>
        </article>

        <article className="ad-card">
          <header>
            <div>
              <span>
                Position
              </span>
              <h2>
                Net balance
              </h2>
            </div>

            <button
              onClick={() =>
                openRoute(
                  "financeReports",
                )
              }
            >
              Reports
            </button>
          </header>

          <strong className="ad-big">
            {money(
              summary.balance,
              summary.currency,
            )}
          </strong>

          <p>
            based on currently available local financial records
          </p>
        </article>

        <article className="ad-card">
          <header>
            <div>
              <span>
                Latest
              </span>
              <h2>
                Finance activity
              </h2>
            </div>
          </header>

          <div className="ad-list">
            {recent.map(
              (
                item,
                index,
              ) => (
                <button
                  type="button"
                  className="ad-row"
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
                        "Expense"
                        ? "expenses"
                        : item._kind ===
                            "Payment"
                          ? "payments"
                          : "fees",
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
                text="No recent finance activity."
              />
            ) : null}
          </div>
        </article>

        <article className="ad-card">
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
              onClick={() =>
                openRoute(
                  "announcements",
                )
              }
            >
              View all
            </button>
          </header>

          <div className="ad-list">
            {announcements.map(
              (
                item,
                index,
              ) => (
                <button
                  className="ad-row"
                  type="button"
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
                          item.message,
                        "Open to read",
                      )}
                    </small>
                  </div>
                </button>
              ),
            )}

            {!announcements.length ? (
              <MiniEmpty
                text="No announcements."
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
    <div className="ad-empty">
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
      className="ad-page"
      style={
        {
          "--ad-primary":
            primary,
        } as React.CSSProperties
      }
    >
      <style>
        {css}
      </style>

      <section className="ad-state">
        <div className="ad-spinner" />
        <h2>
          Opening accountant home...
        </h2>
      </section>
    </main>
  );
}

const css = `
@keyframes adSpin {
  to { transform: rotate(360deg); }
}

.ad-page {
  width: 100%;
  height: auto !important;
  min-height: 0 !important;
  overflow: visible !important;
  padding: 8px 8px calc(76px + env(safe-area-inset-bottom,0px));
  background: var(--bg,#f7f8fb);
  color: var(--text,#111827);
}

.ad-page,
.ad-page * {
  box-sizing: border-box;
  min-width: 0;
}

.ad-page button {
  font: inherit;
  cursor: pointer;
}

.ad-hero {
  position: relative;
  height: clamp(290px,47vw,390px);
  overflow: hidden;
  border-radius: 25px;
  background: #0f172a;
  box-shadow: 0 14px 34px rgba(15,23,42,.08);
}

.ad-hero img,
.ad-hero video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ad-dots {
  position: absolute;
  left: 50%;
  bottom: 11px;
  display: flex;
  gap: 6px;
  transform: translateX(-50%);
}

.ad-dots button {
  width: 7px;
  height: 7px;
  padding: 0;
  border: 0;
  border-radius: 99px;
  background: rgba(255,255,255,.5);
}

.ad-dots button.active {
  width: 20px;
  background: #fff;
}

.ad-metrics,
.ad-grid {
  display: grid;
  gap: 9px;
  margin-top: 9px;
}

.ad-metrics {
  grid-template-columns: repeat(2,minmax(0,1fr));
}

.ad-metrics button,
.ad-card {
  border: 1px solid var(--border,rgba(15,23,42,.09));
  background: var(--card-bg,var(--surface,#fff));
  color: inherit;
  box-shadow: 0 8px 22px rgba(15,23,42,.045);
}

.ad-metrics button {
  min-height: 94px;
  padding: 12px;
  border-radius: 20px;
  text-align: left;
}

.ad-metrics span,
.ad-metrics strong,
.ad-metrics small {
  display: block;
}

.ad-metrics span {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.ad-metrics strong {
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: clamp(17px,4.8vw,25px);
  line-height: 1;
  letter-spacing: -.04em;
}

.ad-metrics small {
  margin-top: 6px;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.ad-card {
  padding: 13px;
  border-radius: 22px;
}

.ad-card header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.ad-card header span {
  color: var(--muted,#64748b);
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .09em;
}

.ad-card h2 {
  margin: 2px 0 0;
  font-size: 16px;
}

.ad-card header button {
  border: 0;
  border-radius: 999px;
  padding: 6px 9px;
  background: color-mix(in srgb,var(--ad-primary) 9%,transparent);
  color: var(--ad-primary);
  font-size: 10px;
  font-weight: 900;
}

.ad-finance-grid {
  display: grid;
  grid-template-columns: repeat(2,minmax(0,1fr));
  gap: 7px;
}

.ad-finance-grid button {
  min-height: 78px;
  border: 0;
  border-radius: 16px;
  padding: 10px;
  background: color-mix(in srgb,var(--muted,#64748b) 6%,transparent);
  color: inherit;
  text-align: left;
}

.ad-finance-grid strong,
.ad-finance-grid span {
  display: block;
}

.ad-finance-grid strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 17px;
}

.ad-finance-grid span {
  margin-top: 5px;
  color: var(--muted,#64748b);
  font-size: 9px;
}

.ad-big {
  display: block;
  font-size: 28px;
  letter-spacing: -.05em;
}

.ad-card > p {
  margin: 5px 0 0;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.ad-list {
  display: grid;
  gap: 6px;
}

.ad-row {
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

.ad-row > span {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: color-mix(in srgb,var(--ad-primary) 10%,transparent);
}

.ad-row strong,
.ad-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ad-row strong {
  font-size: 12px;
}

.ad-row small {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 10px;
}

.ad-empty {
  padding: 18px 8px;
  text-align: center;
  color: var(--muted,#64748b);
  font-size: 11px;
}

.ad-state {
  min-height: 280px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
}

.ad-spinner {
  width: 36px;
  height: 36px;
  border: 4px solid color-mix(in srgb,var(--ad-primary) 16%,transparent);
  border-top-color: var(--ad-primary);
  border-radius: 999px;
  animation: adSpin .8s linear infinite;
}

.ad-state h2 {
  margin: 0;
  font-size: 17px;
}

.ad-page,
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
  .ad-page {
    padding: 12px 12px 24px;
  }

  .ad-grid {
    grid-template-columns: repeat(2,minmax(0,1fr));
  }

  .ad-hero {
    height: 370px;
  }
}

@media (min-width:1100px) {
  .ad-page {
    max-width: 1180px;
    margin: 0 auto;
  }
}
`;