"use client";

/**
 * app/components/role-portals/shell/PortalExplore.tsx
 * --------------------------------------------------------------------------
 * ELEEVEON EXPLORE
 * --------------------------------------------------------------------------
 *
 * Explore is the visual module browser used by mobile role portals.
 *
 * It replaces the old mobile sidebar.
 *
 * NAVIGATION MODEL
 * --------------------------------------------------------------------------
 *
 *   Explore
 *      ↓
 *   Category
 *      ↓
 *   Module
 *
 * Example:
 *
 *   Explore
 *      ↓
 *   People
 *      ↓
 *   Students
 *
 * HISTORY
 * --------------------------------------------------------------------------
 * Explore categories participate in the real browser History API.
 *
 * Example URLs:
 *
 *   ?surface=explore
 *   ?surface=explore&category=administration
 *
 * Therefore Android/browser Back can perform:
 *
 *   Students
 *      ↓
 *   People
 *      ↓
 *   Explore
 *
 * without reloading or leaving the PWA.
 */

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  RoleNavItem,
  RoleNavSection,
} from "../RolePortalShell";

import {
  readExploreCategory,
  readPortalSurface,
  writeExploreCategoryHistory,
} from "./portalHistory";

type ExploreNavItem =
  RoleNavItem & {
    exploreLabel?: string;
    exploreImage?: string;
    exploreDescription?: string;
  };

type ExploreNavSection =
  RoleNavSection & {
    key?: string;
    exploreLabel?: string;
    exploreImage?: string;
    exploreDescription?: string;
  };

export interface PortalExploreProps {
  sections: RoleNavSection[];

  homeKey: string;

  activeKey: string;

  /*
   * Retained for PortalMobileNavigation compatibility.
   *
   * Eleeveon Hub is deliberately not rendered inside Explore.
   */
  hubUnreadCount?: number;

  hubHasAttention?: boolean;

  onOpenHub?(): void;

  onNavigate(
    key: string,
  ): void;
}

type SectionVisual = {
  label: string;

  description: string;

  glyph: string;
};

const SECTION_VISUALS:
  Record<
    string,
    SectionVisual
  > = {
  administration: {
    label:
      "People",

    description:
      "Students, teachers and parents",

    glyph:
      "👥",
  },

  people: {
    label:
      "People",

    description:
      "Students, teachers and parents",

    glyph:
      "👥",
  },

  setup: {
    label:
      "Setup",

    description:
      "Academic structures and learning setup",

    glyph:
      "🧩",
  },

  "academic records": {
    label:
      "Records",

    description:
      "Assessment, reports and learner progress",

    glyph:
      "📊",
  },

  "identity & safety": {
    label:
      "Identity & Safety",

    description:
      "Identity, access, visitors and safety",

    glyph:
      "🪪",
  },

  attendance: {
    label:
      "Attendance",

    description:
      "Student and staff attendance",

    glyph:
      "✅",
  },

  communication: {
    label:
      "Communication",

    description:
      "Announcements and messages",

    glyph:
      "💬",
  },

  "calendar & timetable": {
    label:
      "Schedule",

    description:
      "Calendars, classes, exams and resources",

    glyph:
      "📅",
  },

  finance: {
    label:
      "Finance",

    description:
      "Fees, income, expenses and payouts",

    glyph:
      "💳",
  },

  "branch control": {
    label:
      "Branch",

    description:
      "Settings, access and local controls",

    glyph:
      "⚙️",
  },

  "school control": {
    label:
      "School",

    description:
      "School settings, users and controls",

    glyph:
      "🏫",
  },
};

function normalizedTitle(
  value: string,
) {
  return String(
    value || "",
  )
    .trim()
    .toLowerCase();
}

function sectionKey(
  section:
    ExploreNavSection,
) {
  return (
    section.key ||

    normalizedTitle(
      section.title,
    )
      .replace(
        /[^a-z0-9]+/g,
        "-",
      )
      .replace(
        /^-|-$/g,
        "",
      ) ||

    "section"
  );
}

function sectionVisual(
  section:
    ExploreNavSection,
): SectionVisual {
  const normalized =
    normalizedTitle(
      section.title,
    );

  const known =
    SECTION_VISUALS[
      normalized
    ];

  if (known) {
    return {
      label:
        section.exploreLabel ||
        known.label,

      description:
        section.exploreDescription ||
        known.description,

      glyph:
        section.items
          ?.[0]
          ?.icon ||
        known.glyph,
    };
  }

  return {
    label:
      section.exploreLabel ||
      section.title,

    description:
      section.exploreDescription ||
      `${
        section.items
          ?.length ||
        0
      } tools`,

    glyph:
      section.items
        ?.[0]
        ?.icon ||
      "◫",
  };
}

function itemLabel(
  item:
    ExploreNavItem,
) {
  return (
    item.exploreLabel ||
    item.label
  );
}

function VisualCover({
  image,
  glyph,
  alt,
}: {
  image?: string;

  glyph: string;

  alt: string;
}) {
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );

  return (
    <div
      className="portal-explore-cover"
      aria-hidden="true"
    >
      {image &&
      !failed ? (
        <img
          src={
            image
          }
          alt=""
          onError={() =>
            setFailed(
              true,
            )
          }
        />
      ) : (
        <>
          <div className="portal-explore-cover-glow" />

          <span
            title={
              alt
            }
            className="portal-explore-glyph"
          >
            {
              glyph
            }
          </span>
        </>
      )}
    </div>
  );
}

export default function PortalExplore({
  sections,
  homeKey,
  activeKey,
  onNavigate,
}: PortalExploreProps) {
  const exploreSections =
    useMemo(
      () =>
        (
          sections as
            ExploreNavSection[]
        )
          .map(
            (section) => ({
              ...section,

              items:
                (
                  section.items ||
                  []
                ).filter(
                  (item) =>
                    item.key !==
                    homeKey,
                ),
            }),
          )
          .filter(
            (section) =>
              section.items
                .length >
              0,
          ),
      [
        sections,
        homeKey,
      ],
    );

  /**
   * Restore the selected category from browser history.
   *
   * If the URL contains a stale/unknown category, Explore safely falls
   * back to its root instead.
   */
  const [
    selectedSectionKey,
    setSelectedSectionKey,
  ] =
    useState<
      string | null
    >(
      () => {
        if (
          typeof window ===
          "undefined"
        ) {
          return null;
        }

        if (
          readPortalSurface() !==
          "explore"
        ) {
          return null;
        }

        return (
          readExploreCategory() ||
          null
        );
      },
    );

  const selectedSection =
    useMemo(
      () =>
        exploreSections.find(
          (section) =>
            sectionKey(
              section,
            ) ===
            selectedSectionKey,
        ) ||
        null,
      [
        exploreSections,
        selectedSectionKey,
      ],
    );

  /**
   * Browser / Android Back and Forward restore the Explore category.
   */
  useEffect(() => {
    const handlePopState =
      () => {
        if (
          readPortalSurface() !==
          "explore"
        ) {
          return;
        }

        const category =
          readExploreCategory();

        const exists =
          category
            ? exploreSections.some(
                (section) =>
                  sectionKey(
                    section,
                  ) ===
                  category,
              )
            : false;

        setSelectedSectionKey(
          exists
            ? category
            : null,
        );
      };

    window.addEventListener(
      "popstate",
      handlePopState,
    );

    return () => {
      window.removeEventListener(
        "popstate",
        handlePopState,
      );
    };
  }, [
    exploreSections,
  ]);

  /**
   * If an old/stale category exists in the URL but is no longer available,
   * normalize Explore back to the root without adding another history entry.
   */
  useEffect(() => {
    if (
      !selectedSectionKey
    ) {
      return;
    }

    const exists =
      exploreSections.some(
        (section) =>
          sectionKey(
            section,
          ) ===
          selectedSectionKey,
      );

    if (exists) {
      return;
    }

    setSelectedSectionKey(
      null,
    );

    writeExploreCategoryHistory({
      category:
        null,

      mode:
        "replace",
    });
  }, [
    exploreSections,
    selectedSectionKey,
  ]);

  const openSection =
    (
      key: string,
    ) => {
      if (
        selectedSectionKey ===
        key
      ) {
        return;
      }

      setSelectedSectionKey(
        key,
      );

      writeExploreCategoryHistory({
        category:
          key,
      });
    };

  /**
   * The visible Back button should use the SAME browser history stack as the
   * Android/browser Back button.
   *
   * Therefore it calls history.back() rather than directly mutating state.
   */
  const backFromSection =
    () => {
      if (
        typeof window ===
        "undefined"
      ) {
        setSelectedSectionKey(
          null,
        );

        return;
      }

      window.history.back();
    };

  if (
    selectedSection
  ) {
    const visual =
      sectionVisual(
        selectedSection,
      );

    return (
      <main className="portal-explore-page">
        <header className="portal-explore-page-head">
          <button
            type="button"
            className="portal-explore-back"
            onClick={
              backFromSection
            }
            aria-label="Back to Explore"
          >
            ‹
          </button>

          <div>
            <p>
              Explore
            </p>

            <h1>
              {
                visual.label
              }
            </h1>

            <span>
              {
                visual.description
              }
            </span>
          </div>
        </header>

        <section
          className="portal-explore-grid portal-explore-item-grid"
          aria-label={`${visual.label} tools`}
        >
          {(
            selectedSection.items as
              ExploreNavItem[]
          ).map(
            (item) => (
              <button
                type="button"
                className={[
                  "portal-explore-card",

                  item.key ===
                    activeKey &&
                    "active",
                ]
                  .filter(
                    Boolean,
                  )
                  .join(
                    " ",
                  )}
                key={
                  item.key
                }
                onClick={() =>
                  onNavigate(
                    item.key,
                  )
                }
              >
                <VisualCover
                  image={
                    item.exploreImage
                  }
                  glyph={
                    item.icon ||
                    "◫"
                  }
                  alt={
                    itemLabel(
                      item,
                    )
                  }
                />

                <span className="portal-explore-card-copy">
                  <strong>
                    {itemLabel(
                      item,
                    )}
                  </strong>
                </span>
              </button>
            ),
          )}
        </section>

        <style>
          {css}
        </style>
      </main>
    );
  }

  return (
    <main className="portal-explore-page portal-explore-root">
      <section
        className="portal-explore-grid"
        aria-label="Explore categories"
      >
        {exploreSections.map(
          (section) => {
            const visual =
              sectionVisual(
                section,
              );

            const key =
              sectionKey(
                section,
              );

            return (
              <button
                type="button"
                className="portal-explore-card"
                key={
                  key
                }
                onClick={() =>
                  openSection(
                    key,
                  )
                }
              >
                <VisualCover
                  image={
                    section.exploreImage
                  }
                  glyph={
                    visual.glyph
                  }
                  alt={
                    visual.label
                  }
                />

                <span className="portal-explore-card-copy">
                  <strong>
                    {
                      visual.label
                    }
                  </strong>
                </span>
              </button>
            );
          },
        )}
      </section>

      <style>
        {css}
      </style>
    </main>
  );
}

const css = `
.portal-explore-page {
  width:
    min(
      860px,
      100%
    );

  margin:
    0 auto;

  padding:
    12px 8px
    24px;

  color:
    var(
      --eds-text,
      var(
        --text,
        #111827
      )
    );
}

.portal-explore-root {
  padding-top:
    8px;
}

.portal-explore-page-head {
  display:
    grid;

  grid-template-columns:
    38px
    minmax(
      0,
      1fr
    );

  align-items:
    start;

  gap:
    9px;

  margin-bottom:
    12px;
}

.portal-explore-page-head p {
  margin:
    0;

  color:
    var(
      --eds-primary,
      var(
        --primary-color,
        #2563eb
      )
    );

  font-size:
    9px;

  font-weight:
    900;

  letter-spacing:
    .08em;

  text-transform:
    uppercase;
}

.portal-explore-page-head h1 {
  margin:
    2px 0 0;

  color:
    var(
      --eds-text-strong,
      var(
        --text,
        #111827
      )
    );

  font-size:
    clamp(
      24px,
      6vw,
      36px
    );

  line-height:
    .98;

  letter-spacing:
    -.045em;
}

.portal-explore-page-head span {
  display:
    block;

  margin-top:
    5px;

  color:
    var(
      --eds-text-muted,
      var(
        --muted,
        #64748b
      )
    );

  font-size:
    11px;

  line-height:
    1.45;

  font-weight:
    650;
}

.portal-explore-back {
  width:
    36px;

  height:
    36px;

  border:
    1px solid
    var(
      --eds-border,
      var(
        --border,
        rgba(
          0,
          0,
          0,
          .10
        )
      )
    );

  border-radius:
    12px;

  background:
    var(
      --eds-surface,
      var(
        --surface,
        #ffffff
      )
    );

  color:
    var(
      --eds-text-strong,
      var(
        --text,
        #111827
      )
    );

  font-size:
    27px;

  line-height:
    1;

  cursor:
    pointer;
}

.portal-explore-grid {
  display:
    grid;

  grid-template-columns:
    repeat(
      3,
      minmax(
        0,
        1fr
      )
    );

  gap:
    10px 8px;
}

.portal-explore-card {
  min-width:
    0;

  display:
    grid;

  align-content:
    start;

  gap:
    6px;

  border:
    0;

  padding:
    0;

  background:
    transparent;

  color:
    inherit;

  text-align:
    left;

  cursor:
    pointer;
}

.portal-explore-cover {
  position:
    relative;

  width:
    100%;

  aspect-ratio:
    1 / 1.03;

  display:
    grid;

  place-items:
    center;

  overflow:
    hidden;

  border-radius:
    14px;

  border:
    1px solid
    var(
      --eds-border,
      var(
        --border,
        rgba(
          0,
          0,
          0,
          .08
        )
      )
    );

  background:
    linear-gradient(
      145deg,

      color-mix(
        in srgb,
        var(
          --eds-primary,
          var(
            --primary-color,
            #2563eb
          )
        ) 13%,
        var(
          --eds-surface,
          var(
            --surface,
            #ffffff
          )
        )
      ),

      color-mix(
        in srgb,
        var(
          --eds-bg,
          var(
            --bg,
            #f7f8fb
          )
        ) 84%,
        var(
          --eds-surface,
          var(
            --surface,
            #ffffff
          )
        )
      )
    );

  box-shadow:
    0 5px 15px
    rgba(
      15,
      23,
      42,
      .065
    );
}

.portal-explore-cover img {
  width:
    100%;

  height:
    100%;

  display:
    block;

  object-fit:
    cover;
}

.portal-explore-cover-glow {
  position:
    absolute;

  width:
    72%;

  height:
    72%;

  border-radius:
    50%;

  background:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(
          --primary-color,
          #2563eb
        )
      ) 18%,
      transparent
    );

  filter:
    blur(
      18px
    );
}

.portal-explore-glyph {
  position:
    relative;

  z-index:
    1;

  font-size:
    clamp(
      30px,
      11vw,
      64px
    );

  filter:
    drop-shadow(
      0 7px 10px
      rgba(
        15,
        23,
        42,
        .10
      )
    );
}

.portal-explore-card-copy {
  min-width:
    0;

  display:
    block;

  padding:
    0 2px;
}

.portal-explore-card-copy strong {
  display:
    block;

  overflow:
    hidden;

  text-overflow:
    ellipsis;

  color:
    var(
      --eds-text-strong,
      var(
        --text,
        #111827
      )
    );

  font-size:
    12px;

  font-weight:
    800;

  line-height:
    1.2;
}

.portal-explore-card.active
.portal-explore-cover {
  border-color:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(
          --primary-color,
          #2563eb
        )
      ) 55%,
      var(
        --eds-border,
        transparent
      )
    );

  box-shadow:
    0 0 0 2px
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(
          --primary-color,
          #2563eb
        )
      ) 14%,
      transparent
    );
}

@media (
  min-width:
    520px
) {
  .portal-explore-grid {
    grid-template-columns:
      repeat(
        4,
        minmax(
          0,
          1fr
        )
      );

    gap:
      12px 10px;
  }

  .portal-explore-card-copy strong {
    font-size:
      13px;
  }
}

@media (
  min-width:
    760px
) {
  .portal-explore-grid {
    grid-template-columns:
      repeat(
        5,
        minmax(
          0,
          1fr
        )
      );
  }
}
`;