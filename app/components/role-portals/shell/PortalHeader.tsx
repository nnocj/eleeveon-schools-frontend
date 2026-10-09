"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useWindowChrome,
} from "../../../context/window-chrome-context";

import type {
  PortalSearchResult,
} from "./PortalSearchBridge";

export interface PortalHeaderProps {
  activeLabel: string;
  workspaceLabel: string;

  memberName: string;
  memberRole: string;
  memberImage?: string | null;
  memberMeta: string;

  online: boolean;
  realtimeConnected: boolean;
  initialSyncDone: boolean;
  realtimeStatus: string;

  sidebarHidden: boolean;

  onToggleSidebar(): void;
  onOpenStatus(): void;
  onOpenAccount(): void;
}

function initials(
  name: string,
) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part[0] ?? "",
    )
    .join("")
    .toUpperCase();
}

function HeaderAvatar({
  image,
  name,
}: {
  image?: string | null;
  name: string;
}) {
  const [
    failed,
    setFailed,
  ] =
    useState(false);

  useEffect(() => {
    setFailed(false);
  }, [image]);

  return (
    <span className="header-account-avatar">
      {image &&
      !failed ? (
        <img
          src={image}
          alt=""
          onError={() =>
            setFailed(true)
          }
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="10.8"
        cy="10.8"
        r="6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="m15.5 15.5 4.4 4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function PortalHeader({
  activeLabel,
  workspaceLabel,

  memberName,
  memberRole,
  memberImage,
  memberMeta,

  online,
  realtimeConnected,
  initialSyncDone,
  realtimeStatus,

  onToggleSidebar,
  onOpenStatus,
  onOpenAccount,
}: PortalHeaderProps) {
  const {
    overlayVisible,
  } =
    useWindowChrome();

  const [
    searchOpen,
    setSearchOpen,
  ] =
    useState(false);

  const [
    query,
    setQuery,
  ] =
    useState("");

  const [
    results,
    setResults,
  ] =
    useState<
      PortalSearchResult[]
    >([]);

  const inputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  /**
   * Receive search results from PortalSearchBridge.
   */
  useEffect(() => {
    const handleResults =
      (
        event: Event,
      ) => {
        const custom =
          event as CustomEvent<{
            results?: PortalSearchResult[];
          }>;

        setResults(
          Array.isArray(
            custom.detail
              ?.results,
          )
            ? custom.detail
                .results
            : [],
        );
      };

    window.addEventListener(
      "eleeveon:portal-search-results",
      handleResults,
    );

    return () => {
      window.removeEventListener(
        "eleeveon:portal-search-results",
        handleResults,
      );
    };
  }, []);

  /**
   * Send the current query to the role navigation bridge.
   */
  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(
        "eleeveon:portal-search-query",
        {
          detail: {
            query,
          },
        },
      ),
    );
  }, [
    query,
    searchOpen,
  ]);

  /**
   * Automatically focus the search input.
   */
  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const timer =
      window.setTimeout(
        () =>
          inputRef.current?.focus(),
        0,
      );

    return () =>
      window.clearTimeout(
        timer,
      );
  }, [searchOpen]);

  if (
    overlayVisible
  ) {
    return null;
  }

  const statusClass =
    !online
      ? "warn"
      : realtimeConnected
        ? "live"
        : initialSyncDone
          ? "ok"
          : "warn";

  const statusTitle =
    !online
      ? "Offline — using local data"
      : realtimeConnected
        ? "Live updates connected"
        : initialSyncDone
          ? `Synced — realtime ${realtimeStatus}`
          : "Sync needs attention";

  const closeSearch =
    () => {
      setSearchOpen(
        false,
      );

      setQuery("");

      setResults([]);
    };

  const openSearch =
    () => {
      setSearchOpen(
        true,
      );
    };

  const openResult =
    (
      key: string,
    ) => {
      window.dispatchEvent(
        new CustomEvent(
          "eleeveon:portal-search-open",
          {
            detail: {
              key,
            },
          },
        ),
      );

      closeSearch();
    };

  const handleStatus =
    () => {
      closeSearch();
      onOpenStatus();
    };

  const handleAccount =
    () => {
      closeSearch();
      onOpenAccount();
    };

  return (
    <>
      <header
        className="app-header eds-header-surface eds-glass-subtle portal-fixed-header"
        data-window-overlay="fallback"
      >
        {/*
         * Desktop keeps the sidebar toggle.
         * Mobile uses Home / Library / Screens.
         */}
        {!searchOpen ? (
          <button
            className="icon-btn primary portal-header-sidebar-toggle"
            onClick={
              onToggleSidebar
            }
            type="button"
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
        ) : null}

        {searchOpen ? (
          <div className="portal-header-search-box">
            <span className="portal-header-search-leading">
              <SearchIcon />
            </span>

            <input
              ref={
                inputRef
              }
              value={
                query
              }
              onChange={(
                event,
              ) =>
                setQuery(
                  event.target
                    .value,
                )
              }
              placeholder="Search this portal"
              aria-label="Search this portal"
              onKeyDown={(
                event,
              ) => {
                if (
                  event.key ===
                  "Escape"
                ) {
                  closeSearch();
                  return;
                }

                if (
                  event.key ===
                    "Enter" &&
                  results[0]
                ) {
                  openResult(
                    results[0]
                      .key,
                  );
                }
              }}
            />

            <button
              type="button"
              className="portal-search-close"
              onClick={
                closeSearch
              }
              aria-label="Close search"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="header-title">
            <strong>
              {activeLabel}
            </strong>

            <span>
              {workspaceLabel}
            </span>
          </div>
        )}

        {!searchOpen ? (
          <button
            type="button"
            className="icon-btn portal-header-search-button"
            onClick={
              openSearch
            }
            aria-label="Search portal"
            title="Search"
          >
            <SearchIcon />
          </button>
        ) : null}

        <button
          type="button"
          className={`sync-dot-btn header-status ${statusClass}`}
          onClick={
            handleStatus
          }
          aria-label="Open system status"
          title={
            statusTitle
          }
        >
          <span />
        </button>

        <button
          type="button"
          className="header-account-button"
          onClick={
            handleAccount
          }
          aria-label="Open account and workspace menu"
          title={
            memberMeta
          }
        >
          <HeaderAvatar
            image={
              memberImage
            }
            name={
              memberName
            }
          />

          <span className="header-account-copy">
            <strong>
              {memberName}
            </strong>

            <small>
              {memberRole}
            </small>
          </span>
        </button>
      </header>

      {searchOpen &&
      query.trim() ? (
        <section
          className="portal-header-search-results"
          aria-label="Search results"
        >
          {results.length ? (
            results.map(
              (item) => (
                <button
                  type="button"
                  key={
                    item.key
                  }
                  onClick={() =>
                    openResult(
                      item.key,
                    )
                  }
                >
                  <span className="portal-search-result-icon">
                    {item.icon ||
                      "⌕"}
                  </span>

                  <span className="portal-search-result-copy">
                    <strong>
                      {
                        item.label
                      }
                    </strong>

                    <small>
                      {
                        item.group
                      }
                    </small>
                  </span>

                  <b
                    aria-hidden="true"
                  >
                    ›
                  </b>
                </button>
              ),
            )
          ) : (
            <div className="portal-search-empty">
              No matching portal item.
            </div>
          )}
        </section>
      ) : null}

      <style>
        {css}
      </style>
    </>
  );
}

const css = `
/* =====================================================
 * FIXED PORTAL HEADER
 * ===================================================== */

.portal-fixed-header {
  position:
    fixed !important;

  top:
    var(
      --eds-shell-top-offset,
      0px
    ) !important;

  left:
    var(
      --portal-content-left,
      0px
    );

  right:
    0;

  width:
    auto !important;

  min-height:
    var(
      --portal-header-height,
      48px
    );

  z-index:
    70 !important;
}

/*
 * Fixed header is removed from normal document flow.
 * Reserve its height before page content begins.
 */
.app-main {
  padding-top:
    var(
      --portal-header-height,
      48px
    );
}

/* =====================================================
 * SEARCH BUTTON
 * ===================================================== */

.portal-header-search-button svg,
.portal-header-search-box svg {
  width:
    19px;

  height:
    19px;
}

.portal-header-search-box {
  flex:
    1;

  min-width:
    0;

  height:
    38px;

  display:
    grid;

  grid-template-columns:
    26px
    minmax(0, 1fr)
    30px;

  align-items:
    center;

  gap:
    3px;

  padding:
    0 4px
    0 9px;

  border:
    1px solid
    var(
      --eds-border,
      var(--border, rgba(0,0,0,.10))
    );

  border-radius:
    14px;

  background:
    var(
      --eds-surface,
      var(--surface, #ffffff)
    );

  box-shadow:
    inset 0 1px 0
    rgba(255,255,255,.04);
}

.portal-header-search-leading {
  display:
    grid;

  place-items:
    center;

  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );
}

.portal-header-search-box input {
  width:
    100%;

  min-width:
    0;

  border:
    0;

  outline:
    0;

  background:
    transparent;

  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );

  font:
    inherit;

  font-size:
    12px;
}

.portal-header-search-box input::placeholder {
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );
}

.portal-search-close {
  width:
    30px;

  height:
    30px;

  display:
    grid;

  place-items:
    center;

  border:
    0;

  border-radius:
    10px;

  background:
    transparent;

  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    20px;

  cursor:
    pointer;
}

/* =====================================================
 * SEARCH RESULTS
 * ===================================================== */

.portal-header-search-results {
  position:
    fixed;

  top:
    calc(
      var(
        --eds-shell-top-offset,
        0px
      )
      +
      var(
        --portal-header-height,
        48px
      )
      +
      6px
    );

  right:
    8px;

  width:
    min(
      430px,
      calc(
        100vw -
        var(
          --portal-content-left,
          0px
        )
        -
        16px
      )
    );

  max-height:
    min(
      62dvh,
      520px
    );

  overflow-y:
    auto;

  z-index:
    90;

  padding:
    6px;

  border:
    1px solid
    var(
      --eds-border,
      var(--border, rgba(0,0,0,.10))
    );

  border-radius:
    17px;

  background:
    var(
      --eds-surface,
      var(--surface, #ffffff)
    );

  box-shadow:
    0 20px 50px
    rgba(15,23,42,.18);
}

.portal-header-search-results
> button {
  width:
    100%;

  min-height:
    54px;

  display:
    grid;

  grid-template-columns:
    36px
    minmax(0, 1fr)
    auto;

  align-items:
    center;

  gap:
    8px;

  border:
    0;

  border-radius:
    12px;

  padding:
    7px;

  background:
    transparent;

  color:
    inherit;

  text-align:
    left;

  cursor:
    pointer;
}

.portal-header-search-results
> button:hover {
  background:
    var(
      --eds-primary-softer,
      color-mix(
        in srgb,
        var(
          --primary-color,
          #2563eb
        ) 7%,
        transparent
      )
    );
}

.portal-search-result-icon {
  width:
    36px;

  height:
    36px;

  display:
    grid;

  place-items:
    center;

  border-radius:
    11px;

  background:
    color-mix(
      in srgb,
      var(
        --primary-color,
        #2563eb
      ) 10%,
      transparent
    );

  font-size:
    17px;
}

.portal-search-result-copy {
  min-width:
    0;
}

.portal-search-result-copy
strong,
.portal-search-result-copy
small {
  display:
    block;

  overflow:
    hidden;

  white-space:
    nowrap;

  text-overflow:
    ellipsis;
}

.portal-search-result-copy
strong {
  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );

  font-size:
    12px;

  font-weight:
    850;
}

.portal-search-result-copy
small {
  margin-top:
    2px;

  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    9px;
}

.portal-header-search-results
> button
> b {
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    20px;
}

.portal-search-empty {
  padding:
    18px;

  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  text-align:
    center;

  font-size:
    11px;
}

/* =====================================================
 * MOBILE
 * ===================================================== */

@media (
  max-width: 979px
) {
  .portal-fixed-header {
    left:
      0 !important;

    right:
      0 !important;

    width:
      100% !important;
  }

  .portal-header-sidebar-toggle {
    display:
      none !important;
  }

  .app-header {
    gap:
      6px;
  }

  .app-header
  .header-title {
    min-width:
      0;
  }

  .portal-header-search-results {
    left:
      8px;

    right:
      8px;

    width:
      auto;
  }
}

/* =====================================================
 * VERY SMALL PHONE
 * ===================================================== */

@media (
  max-width: 420px
) {
  .portal-header-search-button {
    width:
      34px !important;

    height:
      34px !important;

    border-radius:
      13px !important;
  }

  .portal-header-search-box {
    height:
      36px;
  }
}
`;