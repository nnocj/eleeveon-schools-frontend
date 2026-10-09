"use client";

import {
  useMemo,
  useState,
} from "react";

import type {
  RoleNavItem,
  RoleNavSection,
} from "../RolePortalShell";

type LibraryNavItem = RoleNavItem & {
  libraryLabel?: string;
  libraryImage?: string;
  libraryDescription?: string;
};

type LibraryNavSection = RoleNavSection & {
  key?: string;
  libraryLabel?: string;
  libraryImage?: string;
  libraryDescription?: string;
};

export interface PortalLibraryProps {
  sections: RoleNavSection[];
  homeKey: string;
  activeKey: string;

  /*
   * Kept in the interface for backward compatibility with
   * PortalMobileNavigation.
   *
   * Hub is no longer rendered inside Library.
   */
  hubUnreadCount?: number;
  hubHasAttention?: boolean;
  onOpenHub?(): void;

  onNavigate(key: string): void;
}

type SectionVisual = {
  label: string;
  description: string;
  glyph: string;
};

const SECTION_VISUALS: Record<
  string,
  SectionVisual
> = {
  administration: {
    label: "People",
    description:
      "Students, teachers and parents",
    glyph: "👥",
  },

  people: {
    label: "People",
    description:
      "Students, teachers and parents",
    glyph: "👥",
  },

  setup: {
    label: "Setup",
    description:
      "Academic structures and learning setup",
    glyph: "🧩",
  },

  "academic records": {
    label: "Records",
    description:
      "Assessment, reports and learner progress",
    glyph: "📊",
  },

  "identity & safety": {
    label: "Identity & Safety",
    description:
      "Identity, access, visitors and safety",
    glyph: "🪪",
  },

  attendance: {
    label: "Attendance",
    description:
      "Student and staff attendance",
    glyph: "✅",
  },

  communication: {
    label: "Communication",
    description:
      "Announcements and messages",
    glyph: "💬",
  },

  "calendar & timetable": {
    label: "Schedule",
    description:
      "Calendars, classes, exams and resources",
    glyph: "📅",
  },

  finance: {
    label: "Finance",
    description:
      "Fees, income, expenses and payouts",
    glyph: "💳",
  },

  "branch control": {
    label: "Branch",
    description:
      "Settings, access and local controls",
    glyph: "⚙️",
  },

  "school control": {
    label: "School",
    description:
      "School settings, users and controls",
    glyph: "🏫",
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
  section: LibraryNavSection,
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
  section: LibraryNavSection,
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
        section.libraryLabel ||
        known.label,

      description:
        section.libraryDescription ||
        known.description,

      glyph:
        section.items?.[0]
          ?.icon ||
        known.glyph,
    };
  }

  return {
    label:
      section.libraryLabel ||
      section.title,

    description:
      section.libraryDescription ||
      `${
        section.items?.length ||
        0
      } tools`,

    glyph:
      section.items?.[0]
        ?.icon ||
      "◫",
  };
}

function itemLabel(
  item: LibraryNavItem,
) {
  return (
    item.libraryLabel ||
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
  ] = useState(false);

  return (
    <div
      className="portal-library-cover"
      aria-hidden="true"
    >
      {image &&
      !failed ? (
        <img
          src={image}
          alt=""
          onError={() =>
            setFailed(
              true,
            )
          }
        />
      ) : (
        <>
          <div className="portal-library-cover-glow" />

          <span
            title={alt}
            className="portal-library-glyph"
          >
            {glyph}
          </span>
        </>
      )}
    </div>
  );
}

export default function PortalLibrary({
  sections,
  homeKey,
  activeKey,
  onNavigate,
}: PortalLibraryProps) {
  const [
    selectedSectionKey,
    setSelectedSectionKey,
  ] = useState<
    string | null
  >(null);

  const librarySections =
    useMemo(
      () =>
        (
          sections as LibraryNavSection[]
        )
          .map(
            (
              section,
            ) => ({
              ...section,

              items:
                (
                  section.items ||
                  []
                ).filter(
                  (
                    item,
                  ) =>
                    item.key !==
                    homeKey,
                ),
            }),
          )
          .filter(
            (
              section,
            ) =>
              section.items
                .length > 0,
          ),
      [
        sections,
        homeKey,
      ],
    );

  const selectedSection =
    useMemo(
      () =>
        librarySections.find(
          (
            section,
          ) =>
            sectionKey(
              section,
            ) ===
            selectedSectionKey,
        ) || null,
      [
        librarySections,
        selectedSectionKey,
      ],
    );

  /*
   * =====================================================
   * OPENED LIBRARY CATEGORY
   * =====================================================
   *
   * Example:
   *
   * Library
   *      ↓
   * People
   *      ↓
   * Students / Teachers / Parents
   */
  if (
    selectedSection
  ) {
    const visual =
      sectionVisual(
        selectedSection,
      );

    return (
      <main className="portal-library-page">
        <header className="portal-library-page-head">
          <button
            type="button"
            className="portal-library-back"
            onClick={() =>
              setSelectedSectionKey(
                null,
              )
            }
            aria-label="Back to Library"
          >
            ‹
          </button>

          <div>
            <p>
              Library
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
          className="portal-library-grid portal-library-item-grid"
          aria-label={`${visual.label} tools`}
        >
          {(
            selectedSection.items as LibraryNavItem[]
          ).map(
            (
              item,
            ) => {
              const image =
                item.libraryImage;

              return (
                <button
                  type="button"
                  className={[
                    "portal-library-card",

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
                      image
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

                  <span className="portal-library-card-copy">
                    <strong>
                      {itemLabel(
                        item,
                      )}
                    </strong>

                    {/*
                     * Item description intentionally hidden.
                     *
                     * Cards currently display:
                     *
                     * image
                     * title
                     */}
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

  /*
   * =====================================================
   * LIBRARY ROOT
   * =====================================================
   *
   * No heading and no Eleeveon Hub card.
   *
   * The user arrives directly at the visual category grid.
   */
  return (
    <main className="portal-library-page portal-library-root">
      <section
        className="portal-library-grid"
        aria-label="Library categories"
      >
        {librarySections.map(
          (
            section,
          ) => {
            const visual =
              sectionVisual(
                section,
              );

            return (
              <button
                type="button"
                className="portal-library-card"
                key={
                  sectionKey(
                    section,
                  )
                }
                onClick={() =>
                  setSelectedSectionKey(
                    sectionKey(
                      section,
                    ),
                  )
                }
              >
                <VisualCover
                  image={
                    section.libraryImage
                  }
                  glyph={
                    visual.glyph
                  }
                  alt={
                    visual.label
                  }
                />

                <span className="portal-library-card-copy">
                  <strong>
                    {
                      visual.label
                    }
                  </strong>

                  {/*
                   * Category description intentionally hidden.
                   *
                   * Cards currently display:
                   *
                   * image
                   * title
                   */}
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
.portal-library-page {
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
      var(--text, #111827)
    );
}

/*
 * Root Library has no heading or Hub,
 * therefore the card grid begins immediately.
 */
.portal-library-root {
  padding-top:
    8px;
}

.portal-library-page-head {
  display:
    grid;

  grid-template-columns:
    38px
    minmax(0, 1fr);

  align-items:
    start;

  gap:
    9px;

  margin-bottom:
    12px;
}

.portal-library-page-head p {
  margin:
    0;

  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
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

.portal-library-page-head h1 {
  margin:
    2px 0 0;

  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
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

.portal-library-page-head span {
  display:
    block;

  margin-top:
    5px;

  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    11px;

  line-height:
    1.45;

  font-weight:
    650;
}

.portal-library-back {
  width:
    36px;

  height:
    36px;

  border:
    1px solid
    var(
      --eds-border,
      var(--border, rgba(0,0,0,.10))
    );

  border-radius:
    12px;

  background:
    var(
      --eds-surface,
      var(--surface, #ffffff)
    );

  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );

  font-size:
    27px;

  line-height:
    1;

  cursor:
    pointer;
}

/*
 * =====================================================
 * LIBRARY CARD GRID
 * =====================================================
 *
 * Phone:
 * 3 cards per row.
 *
 * Medium:
 * 4 cards per row.
 *
 * Larger:
 * 5 cards per row.
 */
.portal-library-grid {
  display:
    grid;

  grid-template-columns:
    repeat(
      3,
      minmax(0, 1fr)
    );

  gap:
    10px 8px;
}

.portal-library-card {
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

.portal-library-cover {
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
      var(--border, rgba(0,0,0,.08))
    );

  background:
    linear-gradient(
      145deg,

      color-mix(
        in srgb,
        var(
          --eds-primary,
          var(--primary-color, #2563eb)
        ) 13%,
        var(
          --eds-surface,
          var(--surface, #ffffff)
        )
      ),

      color-mix(
        in srgb,
        var(
          --eds-bg,
          var(--bg, #f7f8fb)
        ) 84%,
        var(
          --eds-surface,
          var(--surface, #ffffff)
        )
      )
    );

  box-shadow:
    0 5px 15px
    rgba(15,23,42,.065);
}

.portal-library-cover img {
  width:
    100%;

  height:
    100%;

  display:
    block;

  object-fit:
    cover;
}

.portal-library-cover-glow {
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
        var(--primary-color, #2563eb)
      ) 18%,
      transparent
    );

  filter:
    blur(18px);
}

.portal-library-glyph {
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
      rgba(15,23,42,.10)
    );
}

.portal-library-card-copy {
  min-width:
    0;

  display:
    block;

  padding:
    0 2px;
}

.portal-library-card-copy strong {
  display:
    block;

  overflow:
    hidden;

  text-overflow:
    ellipsis;

  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );

  font-size:
    12px;

  font-weight:
    800;

  line-height:
    1.2;
}

.portal-library-card.active
.portal-library-cover {
  border-color:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
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
        var(--primary-color, #2563eb)
      ) 14%,
      transparent
    );
}

/*
 * Slightly wider phone / tablet:
 * show four cards.
 */
@media (
  min-width: 520px
) {
  .portal-library-grid {
    grid-template-columns:
      repeat(
        4,
        minmax(0, 1fr)
      );

    gap:
      12px 10px;
  }

  .portal-library-card-copy strong {
    font-size:
      13px;
  }
}

/*
 * Larger tablet / desktop-sized Library surface:
 * five cards per row.
 */
@media (
  min-width: 760px
) {
  .portal-library-grid {
    grid-template-columns:
      repeat(
        5,
        minmax(0, 1fr)
      );
  }
}
`;