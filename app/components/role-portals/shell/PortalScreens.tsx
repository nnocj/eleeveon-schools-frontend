"use client";

import type {
  PortalScreen,
} from "./usePortalScreens";

export interface PortalScreensProps {
  screens: PortalScreen[];

  activeKey: string;

  onOpenScreen(
    routeKey: string,
  ): void;

  onRemoveScreen(
    routeKey: string,
  ): void;

  onClearScreens(): void;

  onAddScreen(): void;
}

function timeLabel(
  value: number,
) {
  if (!value) {
    return "";
  }

  const diff =
    Date.now() - value;

  if (diff < 60_000) {
    return "Just now";
  }

  if (diff < 3_600_000) {
    return `${Math.max(
      1,
      Math.floor(
        diff / 60_000,
      ),
    )}m ago`;
  }

  if (diff < 86_400_000) {
    return `${Math.max(
      1,
      Math.floor(
        diff / 3_600_000,
      ),
    )}h ago`;
  }

  return new Date(
    value,
  ).toLocaleDateString();
}

export default function PortalScreens({
  screens,
  activeKey,

  onOpenScreen,
  onRemoveScreen,
  onClearScreens,
  onAddScreen,
}: PortalScreensProps) {
  return (
    <main className="portal-screens-page">
      <header className="portal-screens-head">
        <div>
          <p>
            Workspace
          </p>

          <h1>
            Screens
          </h1>

          <span>
            Return to the places you
            have been working in.
          </span>
        </div>

        {screens.length > 0 ? (
          <button
            type="button"
            onClick={
              onClearScreens
            }
          >
            Clear
          </button>
        ) : null}
      </header>

      {screens.length ? (
        <section className="portal-screens-list">
          {screens.map(
            (screen) => (
              <article
                key={
                  screen.routeKey
                }
                className={[
                  "portal-screen-card",

                  screen.routeKey ===
                    activeKey &&
                    "active",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <button
                  type="button"
                  className="portal-screen-open"
                  onClick={() =>
                    onOpenScreen(
                      screen.routeKey,
                    )
                  }
                >
                  <span className="portal-screen-icon">
                    ▣
                  </span>

                  <span className="portal-screen-copy">
                    <strong>
                      {
                        screen.label
                      }
                    </strong>

                    <small>
                      {
                        screen.group
                      }

                      {" · "}

                      {timeLabel(
                        screen.lastVisitedAt,
                      )}
                    </small>
                  </span>

                  <span className="portal-screen-arrow">
                    ›
                  </span>
                </button>

                <button
                  type="button"
                  className="portal-screen-close"
                  onClick={() =>
                    onRemoveScreen(
                      screen.routeKey,
                    )
                  }
                  aria-label={`Close ${screen.label}`}
                >
                  ×
                </button>
              </article>
            ),
          )}
        </section>
      ) : (
        <section className="portal-screens-empty">
          <div>
            ▣
          </div>

          <h2>
            No screens yet
          </h2>

          <p>
            Open something from the
            Library and it will appear
            here for quick access.
          </p>
        </section>
      )}

      <button
        type="button"
        className="portal-screens-add"
        onClick={
          onAddScreen
        }
      >
        <span>
          ＋
        </span>

        Add another screen
      </button>

      <style>{css}</style>
    </main>
  );
}

const css = `
.portal-screens-page {
  width: min(720px, 100%);
  margin: 0 auto;
  padding: 14px 12px 26px;
  color:
    var(
      --eds-text,
      var(--text, #111827)
    );
}

.portal-screens-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.portal-screens-head p {
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

.portal-screens-head h1 {
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

.portal-screens-head span {
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

.portal-screens-head > button {
  border: 0;
  border-radius: 999px;
  padding: 8px 11px;
  background:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
      ) 9%,
      transparent
    );
  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
  font-size: 10px;
  font-weight: 850;
}

.portal-screens-list {
  display: grid;
  gap: 9px;
}

.portal-screen-card {
  position: relative;
  display: grid;
  grid-template-columns:
    minmax(0, 1fr) 38px;
  align-items: stretch;
  overflow: hidden;
  border:
    1px solid
    var(
      --eds-border,
      var(--border, rgba(0,0,0,.09))
    );
  border-radius: 17px;
  background:
    var(
      --eds-surface,
      var(--surface, #ffffff)
    );
  box-shadow:
    0 7px 18px
    rgba(15,23,42,.055);
}

.portal-screen-card.active {
  border-color:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
      ) 38%,
      var(
        --eds-border,
        transparent
      )
    );
}

.portal-screen-open {
  min-width: 0;
  min-height: 66px;
  display: grid;
  grid-template-columns:
    40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  border: 0;
  padding: 8px 8px 8px 10px;
  background: transparent;
  color: inherit;
  text-align: left;
}

.portal-screen-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background:
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
    );
  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
  font-size: 19px;
}

.portal-screen-copy {
  min-width: 0;
}

.portal-screen-copy strong,
.portal-screen-copy small {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.portal-screen-copy strong {
  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );
  font-size: 13px;
  font-weight: 850;
}

.portal-screen-copy small {
  margin-top: 3px;
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );
  font-size: 9px;
  font-weight: 650;
}

.portal-screen-arrow {
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );
  font-size: 22px;
}

.portal-screen-close {
  width: 38px;
  border: 0;
  border-left:
    1px solid
    var(
      --eds-divider,
      var(--border, rgba(0,0,0,.08))
    );
  background: transparent;
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );
  font-size: 22px;
}

.portal-screens-empty {
  display: grid;
  place-items: center;
  padding: 42px 18px;
  text-align: center;
  border:
    1px dashed
    var(
      --eds-border,
      var(--border, rgba(0,0,0,.12))
    );
  border-radius: 22px;
  background:
    color-mix(
      in srgb,
      var(
        --eds-surface,
        var(--surface, #ffffff)
      ) 82%,
      transparent
    );
}

.portal-screens-empty > div {
  width: 60px;
  height: 60px;
  display: grid;
  place-items: center;
  border-radius: 20px;
  background:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
      ) 10%,
      transparent
    );
  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
  font-size: 27px;
}

.portal-screens-empty h2 {
  margin: 13px 0 0;
  font-size: 18px;
}

.portal-screens-empty p {
  max-width: 330px;
  margin: 7px 0 0;
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );
  font-size: 11px;
  line-height: 1.55;
}

.portal-screens-add {
  width: 100%;
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
  border:
    1px solid
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
      ) 25%,
      var(
        --eds-border,
        var(--border, rgba(0,0,0,.09))
      )
    );
  border-radius: 16px;
  background:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
      ) 7%,
      var(
        --eds-surface,
        var(--surface, #ffffff)
      )
    );
  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
  font-size: 12px;
  font-weight: 850;
}

.portal-screens-add span {
  font-size: 19px;
}
`;