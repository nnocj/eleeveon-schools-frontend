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

  hubUnreadCount?: number;
  hubHasAttention?: boolean;

  onNavigate(key: string): void;
  onOpenHub?(): void;
}

type SectionVisual = {
  label: string;
  description: string;
  glyph: string;
};

const SECTION_VISUALS: Record<string, SectionVisual> = {
  administration: {
    label: "People",
    description: "Students, teachers and parents",
    glyph: "👥",
  },

  people: {
    label: "People",
    description: "Students, teachers and parents",
    glyph: "👥",
  },

  setup: {
    label: "Setup",
    description: "Academic structures and learning setup",
    glyph: "🧩",
  },

  "academic records": {
    label: "Records",
    description: "Assessment, reports and learner progress",
    glyph: "📊",
  },

  "identity & safety": {
    label: "Identity & Safety",
    description: "Identity, access, visitors and safety",
    glyph: "🪪",
  },

  attendance: {
    label: "Attendance",
    description: "Student and staff attendance",
    glyph: "✅",
  },

  communication: {
    label: "Communication",
    description: "Announcements and messages",
    glyph: "💬",
  },

  "calendar & timetable": {
    label: "Schedule",
    description: "Calendars, classes, exams and resources",
    glyph: "📅",
  },

  finance: {
    label: "Finance",
    description: "Fees, income, expenses and payouts",
    glyph: "💳",
  },

  "branch control": {
    label: "Branch",
    description: "Settings, access and local controls",
    glyph: "⚙️",
  },

  "school control": {
    label: "School",
    description: "School settings, users and controls",
    glyph: "🏫",
  },
};

function normalizedTitle(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function sectionKey(
  section: LibraryNavSection,
) {
  return (
    section.key ||
    normalizedTitle(section.title)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") ||
    "section"
  );
}

function sectionVisual(
  section: LibraryNavSection,
): SectionVisual {
  const normalized =
    normalizedTitle(section.title);

  const known =
    SECTION_VISUALS[normalized];

  if (known) {
    return {
      label:
        section.libraryLabel ||
        known.label,

      description:
        section.libraryDescription ||
        known.description,

      glyph:
        section.items?.[0]?.icon ||
        known.glyph,
    };
  }

  return {
    label:
      section.libraryLabel ||
      section.title,

    description:
      section.libraryDescription ||
      `${section.items?.length || 0} tools`,

    glyph:
      section.items?.[0]?.icon ||
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

function itemDescription(
  item: LibraryNavItem,
) {
  return (
    item.libraryDescription ||
    `Open ${item.label}`
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
      {image && !failed ? (
        <img
          src={image}
          alt=""
          onError={() =>
            setFailed(true)
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

  hubUnreadCount = 0,
  hubHasAttention = false,

  onNavigate,
  onOpenHub,
}: PortalLibraryProps) {
  const [
    selectedSectionKey,
    setSelectedSectionKey,
  ] = useState<string | null>(
    null,
  );

  const librarySections =
    useMemo(
      () =>
        (
          sections as LibraryNavSection[]
        )
          .map((section) => ({
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
          }))
          .filter(
            (section) =>
              section.items.length >
              0,
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
          (section) =>
            sectionKey(section) ===
            selectedSectionKey,
        ) || null,
      [
        librarySections,
        selectedSectionKey,
      ],
    );

  if (selectedSection) {
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
            <p>Library</p>

            <h1>
              {visual.label}
            </h1>

            <span>
              {visual.description}
            </span>
          </div>
        </header>

        <section
          className="portal-library-grid portal-library-item-grid"
          aria-label={`${visual.label} tools`}
        >
          {(
            selectedSection.items as LibraryNavItem[]
          ).map((item) => {
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
                  .filter(Boolean)
                  .join(" ")}
                key={item.key}
                onClick={() =>
                  onNavigate(
                    item.key,
                  )
                }
              >
                <VisualCover
                  image={image}
                  glyph={
                    item.icon ||
                    "◫"
                  }
                  alt={
                    itemLabel(item)
                  }
                />

                <span className="portal-library-card-copy">
                  <strong>
                    {itemLabel(
                      item,
                    )}
                  </strong>

                  /*<small>
                    {itemDescription(
                      item,
                    )}
                  </small>*/
                </span>
              </button>
            );
          })}
        </section>

        <style>{css}</style>
      </main>
    );
  }

  return (
    <main className="portal-library-page">
      <header className="portal-library-page-head root">
        <div>
          <p>Workspace</p>

          <h1>
            Library
          </h1>

          <span>
            Everything available in
            this role, organized by
            purpose.
          </span>
        </div>
      </header>

      {onOpenHub ? (
        <button
          type="button"
          className="portal-library-hub"
          onClick={onOpenHub}
        >
          <span className="portal-library-hub-icon">
            ◎
          </span>

          <span>
            <strong>
              Eleeveon Hub
            </strong>

            <small>
              Notices, messages and support
            </small>
          </span>

          {hubUnreadCount > 0 ||
          hubHasAttention ? (
            <b>
              {hubUnreadCount >
              99
                ? "99+"
                : hubUnreadCount ||
                  "!"}
            </b>
          ) : (
            <i>›</i>
          )}
        </button>
      ) : null}

      <section
        className="portal-library-grid"
        aria-label="Library categories"
      >
        {librarySections.map(
          (section) => {
            const visual =
              sectionVisual(
                section,
              );

            return (
              <button
                type="button"
                className="portal-library-card"
                key={sectionKey(
                  section,
                )}
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
                    {visual.label}
                  </strong>

                  <small>
                    {
                      visual.description
                    }
                  </small>
                </span>
              </button>
            );
          },
        )}
      </section>

      <style>{css}</style>
    </main>
  );
}

const css = `
.portal-library-page {
  width: min(760px, 100%);
  margin: 0 auto;
  padding: 14px 12px 24px;
  color:
    var(
      --eds-text,
      var(--text, #111827)
    );
}

.portal-library-page-head {
  display: grid;
  grid-template-columns:
    40px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  margin-bottom: 14px;
}

.portal-library-page-head.root {
  grid-template-columns: 1fr;
}

.portal-library-page-head p {
  margin: 0;
  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.portal-library-page-head h1 {
  margin: 2px 0 0;
  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );
  font-size: clamp(26px, 7vw, 38px);
  line-height: .96;
  letter-spacing: -.045em;
}

.portal-library-page-head span {
  display: block;
  margin-top: 7px;
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );
  font-size: 12px;
  line-height: 1.5;
  font-weight: 650;
}

.portal-library-back {
  width: 38px;
  height: 38px;
  border:
    1px solid
    var(
      --eds-border,
      var(--border, rgba(0,0,0,.10))
    );
  border-radius: 13px;
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
  font-size: 28px;
  line-height: 1;
}

.portal-library-hub {
  width: 100%;
  min-height: 68px;
  display: grid;
  grid-template-columns:
    42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 9px 11px;
  border:
    1px solid
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
      ) 22%,
      var(
        --eds-border,
        var(--border, rgba(0,0,0,.10))
      )
    );
  border-radius: 18px;
  background:
    linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(
          --eds-primary,
          var(--primary-color, #2563eb)
        ) 10%,
        var(
          --eds-surface,
          var(--surface, #ffffff)
        )
      ),
      var(
        --eds-surface,
        var(--surface, #ffffff)
      )
    );
  color: inherit;
  text-align: left;
}

.portal-library-hub-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
  color: #ffffff;
  font-size: 22px;
  font-weight: 1000;
}

.portal-library-hub > span:nth-child(2) {
  min-width: 0;
}

.portal-library-hub strong,
.portal-library-hub small {
  display: block;
}

.portal-library-hub strong {
  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );
  font-size: 13px;
  font-weight: 900;
}

.portal-library-hub small {
  margin-top: 2px;
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );
  font-size: 10px;
  font-weight: 650;
}

.portal-library-hub b {
  min-width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0 6px;
  border-radius: 999px;
  background:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
  color: #fff;
  font-size: 10px;
}

.portal-library-hub i {
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );
  font-size: 24px;
  font-style: normal;
}

.portal-library-grid {
  display: grid;
  grid-template-columns:
    repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.portal-library-card {
  min-width: 0;
  display: grid;
  gap: 8px;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.portal-library-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1.06;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 17px;
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
    0 8px 22px
    rgba(15,23,42,.07);
}

.portal-library-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portal-library-cover-glow {
  position: absolute;
  width: 72%;
  height: 72%;
  border-radius: 50%;
  background:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
      ) 18%,
      transparent
    );
  filter: blur(22px);
}

.portal-library-glyph {
  position: relative;
  z-index: 1;
  font-size: clamp(44px, 16vw, 76px);
  filter:
    drop-shadow(
      0 9px 13px
      rgba(15,23,42,.12)
    );
}

.portal-library-card-copy {
  min-width: 0;
  display: block;
  padding: 0 1px;
}

.portal-library-card-copy strong,
.portal-library-card-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.portal-library-card-copy strong {
  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );
  font-size: 15px;
  font-weight: 800;
  line-height: 1.16;
}

.portal-library-card-copy small {
  margin-top: 3px;
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );
  font-size: 10px;
  line-height: 1.35;
  font-weight: 650;
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

@media (min-width: 620px) {
  .portal-library-grid {
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
  }
}
`;