"use client";

import {
  useEffect,
  useState,
} from "react";

import type {
  UserMembership,
} from "../../../lib/auth/roleRedirect";

import type {
  WorkspaceDisplayIdentityMap,
} from "../../../lib/workspaces/useWorkspaceDisplayNames";

import {
  Button,
} from "../../ui";

import {
  BrandGlow,
  BrandPattern,
  BrandTexture,
} from "../../branding";

import AccountSection from "./AccountSection";
import QuickWorkspaceSwitcher from "./QuickWorkspaceSwitcher";

import {
  SchoolIcon,
  WorkspaceIcon,
} from "../../icons";

// ======================================================
// PROPS
// ======================================================

export interface AccountWorkspaceDrawerProps {
  open: boolean;

  memberName: string;
  memberRole: string;
  memberImage?: string | null;

  selectedMembership?:
    UserMembership |
    null;

  memberships:
    UserMembership[];

  identities:
    WorkspaceDisplayIdentityMap;

  switchingMembershipId?:
    string |
    null;

  schoolId?:
    string |
    null;

  branchId?:
    string |
    null;

  schools?: Array<{
    id: string;
    name: string;
  }>;

  branches?: Array<{
    id: string;
    name: string;
  }>;

  lockedContext?:
    boolean;

  online:
    boolean;

  realtimeConnected:
    boolean;

  membershipKey(
    membership:
      UserMembership,
  ): string;

  sameMembership(
    left:
      UserMembership,

    right?:
      UserMembership |
      null,
  ): boolean;

  roleLabel(
    role: string,
  ): string;

  roleIcon(
    role: string,
  ): string;

  onClose(): void;

  onSwitchMembership(
    membership:
      UserMembership,
  ): void;

  onSchoolChange(
    schoolId:
      string |
      null,
  ): void;

  onBranchChange(
    branchId:
      string |
      null,
  ): void;

  /*
   * Kept for RolePortalShell backwards compatibility.
   *
   * System and Access has intentionally been removed
   * from this drawer.
   */
  onOpenStatus(): void;

  onSelectRole(): void;

  onLogout(): void;
}

// ======================================================
// HELPERS
// ======================================================

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

// ======================================================
// PROFILE IMAGE
// ======================================================

function DrawerProfileImage({
  src,
  name,
  className = "",
}: {
  src?:
    string |
    null;

  name:
    string;

  className?:
    string;
}) {
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );

  useEffect(() => {
    setFailed(
      false,
    );
  }, [
    src,
  ]);

  const showImage =
    Boolean(
      src,
    ) &&
    !failed;

  return (
    <span
      className={[
        "drawer-profile-image",
        className,
      ]
        .filter(
          Boolean,
        )
        .join(
          " ",
        )}
      aria-label={`${name} profile image`}
    >
      {showImage ? (
        <img
          src={
            src || ""
          }
          alt=""
          onError={() =>
            setFailed(
              true,
            )
          }
        />
      ) : (
        <span
          className="drawer-profile-fallback"
          aria-hidden="true"
        >
          {initials(
            name,
          )}
        </span>
      )}
    </span>
  );
}

// ======================================================
// HUB ICON
// ======================================================

function HubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <circle
        cx="12"
        cy="12"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="2 3"
      />
    </svg>
  );
}

// ======================================================
// HUB EVENT
// ======================================================

function openEleeveonHub() {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      "eleeveon:open-hub",
    ),
  );
}

// ======================================================
// DRAWER
// ======================================================

export default function AccountWorkspaceDrawer({
  open,

  memberName,
  memberRole,
  memberImage,

  selectedMembership,
  memberships,
  identities,

  switchingMembershipId,

  schoolId,
  branchId,

  schools = [],
  branches = [],

  lockedContext = false,

  online,
  realtimeConnected,

  membershipKey,
  sameMembership,
  roleLabel,
  roleIcon,

  onClose,
  onSwitchMembership,

  onSchoolChange,
  onBranchChange,

  onOpenStatus,
  onSelectRole,

  onLogout,
}: AccountWorkspaceDrawerProps) {
  /*
   * These props remain in the contract because
   * RolePortalShell already passes them.
   *
   * The visual System and Access section itself has been
   * removed as requested.
   */
  void onOpenStatus;
  void onSelectRole;

  /*
   * Keep these available to QuickWorkspaceSwitcher and
   * future status presentation without changing the shell
   * contract.
   */
  void online;
  void realtimeConnected;
  void selectedMembership;

  // ====================================================
  // LOCK THE PAGE BEHIND THE DRAWER
  // ====================================================
  //
  // Before:
  //
  // drawer scroll
  // +
  // document scroll
  //
  // could both exist at the same time.
  //
  // Now:
  //
  // drawer open  = only drawer scrolls
  // drawer closed = document scrolls normally
  //

  useEffect(() => {
    if (
      !open ||
      typeof document ===
        "undefined"
    ) {
      return;
    }

    const html =
      document.documentElement;

    const body =
      document.body;

    const previous = {
      htmlOverflow:
        html.style.overflow,

      htmlOverflowY:
        html.style.overflowY,

      htmlOverscroll:
        html.style.overscrollBehavior,

      bodyOverflow:
        body.style.overflow,

      bodyOverflowY:
        body.style.overflowY,

      bodyOverscroll:
        body.style.overscrollBehavior,

      bodyTouchAction:
        body.style.touchAction,
    };

    html.style.overflow =
      "hidden";

    html.style.overflowY =
      "hidden";

    html.style.overscrollBehavior =
      "none";

    body.style.overflow =
      "hidden";

    body.style.overflowY =
      "hidden";

    body.style.overscrollBehavior =
      "none";

    body.style.touchAction =
      "none";

    return () => {
      html.style.overflow =
        previous.htmlOverflow;

      html.style.overflowY =
        previous.htmlOverflowY;

      html.style.overscrollBehavior =
        previous.htmlOverscroll;

      body.style.overflow =
        previous.bodyOverflow;

      body.style.overflowY =
        previous.bodyOverflowY;

      body.style.overscrollBehavior =
        previous.bodyOverscroll;

      body.style.touchAction =
        previous.bodyTouchAction;
    };
  }, [
    open,
  ]);

  // ====================================================
  // HUB
  // ====================================================

  const handleHub =
    () => {
      /*
       * Close the drawer first.
       *
       * This restores normal scroll ownership before the
       * Hub route becomes active.
       */
      onClose();

      window.setTimeout(
        () => {
          openEleeveonHub();
        },
        0,
      );
    };

  return (
    <aside
      className={[
        "context-drawer",
        "account-drawer",
        "shell-account-drawer",
        "compact-account-drawer",
        "eds-drawer-surface",
        "eds-account-drawer-surface",

        open &&
          "open",
      ]
        .filter(
          Boolean,
        )
        .join(
          " ",
        )}
      aria-hidden={
        !open
      }
    >
      <BrandGlow
        placement="top-right"
        size="16rem"
        opacity={
          0.07
        }
      />

      <BrandPattern
        variant="network"
        opacity={
          0.018
        }
      />

      <BrandTexture
        texture="grain"
        intensity={
          0.4
        }
        decorative
        className="shell-drawer-texture"
      />

      <div className="shell-drawer-inner compact-drawer-inner">
        {/* ===============================================
         * MEMBER
         * =============================================== */}

        <header className="account-drawer-head compact-drawer-head">
          <div className="account-drawer-identity compact-drawer-identity">
            <DrawerProfileImage
              src={
                memberImage
              }
              name={
                memberName
              }
              className="drawer-account-photo"
            />

            <span className="compact-drawer-member-copy">
              <strong>
                {memberName}
              </strong>

              <small>
                {memberRole}
              </small>
            </span>
          </div>

          <button
            className="icon-btn compact-drawer-close"
            onClick={
              onClose
            }
            type="button"
            aria-label="Close account menu"
          >
            ✕
          </button>
        </header>

        {/* ===============================================
         * ELEEVEON HUB
         * ===============================================
         *
         * Hub replaces the extra information that was
         * competing for space near the top of the drawer.
         */}

        <button
          type="button"
          className="drawer-hub-strip"
          onClick={
            handleHub
          }
        >
          <span className="drawer-hub-icon">
            <HubIcon />
          </span>

          <span className="drawer-hub-copy">
            <strong>
              Eleeveon Hub
            </strong>

            <small>
              Notices, messages, support and updates
            </small>
          </span>

          <b
            aria-hidden="true"
          >
            ›
          </b>
        </button>

        {/* ===============================================
         * CURRENT WORKSPACE STRIP REMOVED
         * ===============================================
         *
         * The old:
         *
         * CURRENT WORKSPACE
         * School · Branch
         * Online
         *
         * card is intentionally no longer rendered.
         */}

        {/* ===============================================
         * WORKSPACES
         * =============================================== */}

        {memberships.length >
        1 ? (
          <AccountSection
            title="Workspaces"
            meta={`${memberships.length}`}
            className="compact-workspaces-section"
          >
            <QuickWorkspaceSwitcher
              memberships={
                memberships
              }
              selectedMembership={
                selectedMembership
              }
              identities={
                identities
              }
              switchingMembershipId={
                switchingMembershipId
              }
              membershipKey={
                membershipKey
              }
              sameMembership={
                sameMembership
              }
              roleLabel={
                roleLabel
              }
              roleIcon={
                roleIcon
              }
              onSwitchMembership={
                onSwitchMembership
              }
            />
          </AccountSection>
        ) : null}

        {/* ===============================================
         * OPTIONAL UNLOCKED SCHOOL CONTEXT
         * ===============================================
         *
         * Branch Admin uses lockedContext=true, so this
         * normally stays hidden there.
         */}

        {!lockedContext ? (
          <AccountSection
            title="School context"
            className="compact-context-section"
          >
            <div className="compact-context-grid">
              <label className="account-context-field">
                <span>
                  <SchoolIcon size="sm" />

                  School
                </span>

                <select
                  value={
                    schoolId ??
                    ""
                  }
                  onChange={(
                    event,
                  ) =>
                    onSchoolChange(
                      event.target
                        .value ||
                        null,
                    )
                  }
                  disabled={
                    !schools.length
                  }
                >
                  <option value="">
                    {schools.length
                      ? "Select school"
                      : "No school found"}
                  </option>

                  {schools.map(
                    (
                      school,
                    ) => (
                      <option
                        key={
                          school.id
                        }
                        value={
                          school.id
                        }
                      >
                        {
                          school.name
                        }
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="account-context-field">
                <span>
                  <WorkspaceIcon size="sm" />

                  Branch
                </span>

                <select
                  value={
                    branchId ??
                    ""
                  }
                  onChange={(
                    event,
                  ) =>
                    onBranchChange(
                      event.target
                        .value ||
                        null,
                    )
                  }
                  disabled={
                    !schoolId ||
                    !branches.length
                  }
                >
                  <option value="">
                    {!schoolId
                      ? "Select school first"
                      : branches.length
                        ? "Select branch"
                        : "No branch found"}
                  </option>

                  {branches.map(
                    (
                      branch,
                    ) => (
                      <option
                        key={
                          branch.id
                        }
                        value={
                          branch.id
                        }
                      >
                        {
                          branch.name
                        }
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
          </AccountSection>
        ) : null}

        {/* ===============================================
         * SYSTEM AND ACCESS REMOVED
         * ===============================================
         *
         * System status remains globally accessible from
         * the fixed header status button.
         *
         * Workspace switching remains above.
         */}

        <Button
          variant="danger"
          fullWidth
          onClick={
            onLogout
          }
          className="account-logout compact-account-logout"
        >
          Logout
        </Button>
      </div>

      <style>
        {css}
      </style>
    </aside>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
/*
 * =====================================================
 * DRAWER POSITION
 * =====================================================
 *
 * This is the main correction visible in your screenshot.
 *
 * Previously:
 *
 * drawer top = 0
 * fixed header = on top of drawer
 *
 * therefore the member identity disappeared behind the
 * fixed header.
 *
 * Now the drawer begins BELOW the fixed portal header.
 */

.compact-account-drawer {
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
    ) !important;

  bottom:
    0 !important;

  height:
    calc(
      100dvh
      -
      var(
        --eds-shell-top-offset,
        0px
      )
      -
      var(
        --portal-header-height,
        48px
      )
    ) !important;

  max-height:
    calc(
      100dvh
      -
      var(
        --eds-shell-top-offset,
        0px
      )
      -
      var(
        --portal-header-height,
        48px
      )
    ) !important;

  /*
   * Drawer itself owns scrolling while open.
   *
   * The useEffect above disables the document scroll.
   */
  overflow-x:
    hidden !important;

  overflow-y:
    auto !important;

  overscroll-behavior:
    contain !important;

  -webkit-overflow-scrolling:
    touch;

  z-index:
    65 !important;
}

/*
 * The fixed header remains above the drawer and visible.
 */
.portal-fixed-header {
  z-index:
    70 !important;
}

/*
 * Installed desktop Window Controls Overlay already
 * replaces PortalHeader, therefore do not reserve another
 * 48px there.
 */
@media (
  display-mode:
    window-controls-overlay
) {
  .compact-account-drawer {
    top:
      var(
        --eds-shell-top-offset,
        0px
      ) !important;

    height:
      calc(
        100dvh
        -
        var(
          --eds-shell-top-offset,
          0px
        )
      ) !important;

    max-height:
      calc(
        100dvh
        -
        var(
          --eds-shell-top-offset,
          0px
        )
      ) !important;
  }
}

/*
 * =====================================================
 * DRAWER CONTENT
 * =====================================================
 */

.compact-drawer-inner {
  min-height:
    100%;

  display:
    flex;

  flex-direction:
    column;

  gap:
    12px;

  padding-bottom:
    max(
      16px,
      env(
        safe-area-inset-bottom,
        0px
      )
    );
}

/*
 * =====================================================
 * MEMBER PROFILE
 * =====================================================
 */

.compact-drawer-head {
  position:
    relative !important;

  top:
    auto !important;

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap:
    12px;

  margin:
    0 !important;

  padding:
    3px 0 12px !important;

  background:
    transparent !important;

  border-bottom:
    1px solid
    var(
      --eds-divider,
      var(
        --border,
        rgba(0,0,0,.08)
      )
    );
}

.compact-drawer-identity {
  min-width:
    0;

  display:
    grid;

  grid-template-columns:
    56px
    minmax(0, 1fr);

  align-items:
    center;

  gap:
    11px;
}

.drawer-profile-image {
  position:
    relative;

  display:
    grid;

  place-items:
    center;

  overflow:
    hidden;
}

.drawer-account-photo {
  width:
    56px !important;

  height:
    56px !important;

  flex:
    0 0 56px;

  border:
    1px solid
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
      ) 30%,
      var(
        --eds-border,
        transparent
      )
    );

  border-radius:
    18px !important;

  background:
    var(
      --eds-primary-soft,
      color-mix(
        in srgb,
        var(
          --primary-color,
          #2563eb
        ) 12%,
        transparent
      )
    );

  box-shadow:
    0 8px 22px
    rgba(15,23,42,.13);
}

.drawer-account-photo img {
  width:
    100%;

  height:
    100%;

  display:
    block;

  object-fit:
    cover;

  object-position:
    center;
}

.drawer-profile-fallback {
  width:
    100%;

  height:
    100%;

  display:
    grid;

  place-items:
    center;

  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );

  font-size:
    17px;

  font-weight:
    850;
}

.compact-drawer-member-copy {
  min-width:
    0;
}

.compact-drawer-member-copy
strong,
.compact-drawer-member-copy
small {
  display:
    block;

  overflow:
    hidden;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

.compact-drawer-member-copy
strong {
  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );

  font-size:
    16px;

  font-weight:
    900;

  letter-spacing:
    -.02em;
}

.compact-drawer-member-copy
small {
  margin-top:
    4px;

  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    11px;

  font-weight:
    650;
}

/*
 * =====================================================
 * ELEEVEON HUB
 * =====================================================
 */

.drawer-hub-strip {
  width:
    100%;

  min-height:
    62px;

  display:
    grid;

  grid-template-columns:
    42px
    minmax(0, 1fr)
    auto;

  align-items:
    center;

  gap:
    10px;

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
        rgba(0,0,0,.09)
      )
    );

  border-radius:
    17px;

  padding:
    9px 10px;

  background:
    linear-gradient(
      135deg,

      color-mix(
        in srgb,
        var(
          --eds-primary,
          var(--primary-color, #2563eb)
        ) 11%,
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

  color:
    inherit;

  text-align:
    left;

  cursor:
    pointer;
}

.drawer-hub-icon {
  width:
    42px;

  height:
    42px;

  display:
    grid;

  place-items:
    center;

  border-radius:
    13px;

  background:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );

  color:
    var(
      --eds-primary-text,
      #ffffff
    );
}

.drawer-hub-icon
svg {
  width:
    23px;

  height:
    23px;
}

.drawer-hub-copy {
  min-width:
    0;
}

.drawer-hub-copy
strong,
.drawer-hub-copy
small {
  display:
    block;

  overflow:
    hidden;

  text-overflow:
    ellipsis;
}

.drawer-hub-copy
strong {
  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );

  font-size:
    13px;

  font-weight:
    900;
}

.drawer-hub-copy
small {
  margin-top:
    3px;

  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    9px;

  line-height:
    1.35;
}

.drawer-hub-strip
> b {
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    21px;

  font-weight:
    500;
}

/*
 * =====================================================
 * WORKSPACES
 * =====================================================
 */

.compact-workspaces-section {
  margin:
    0 !important;
}

/*
 * Improve actual uploaded user/profile images inside
 * workspace cards.
 */

.compact-account-drawer
.workspace-avatar {
  overflow:
    hidden;

  border-radius:
    14px;
}

.compact-account-drawer
.workspace-avatar
img {
  width:
    100% !important;

  height:
    100% !important;

  display:
    block;

  object-fit:
    cover !important;

  object-position:
    center;
}

/*
 * Keep workspace cards compact enough that several roles
 * remain visible without making the drawer unnecessarily
 * long.
 */

.compact-account-drawer
.workspace-list {
  gap:
    8px;
}

.compact-account-drawer
.workspace-list
button {
  min-height:
    64px;
}

/*
 * =====================================================
 * OPTIONAL CONTEXT
 * =====================================================
 */

.compact-context-grid {
  display:
    grid;

  gap:
    8px;
}

/*
 * =====================================================
 * LOGOUT
 * =====================================================
 */

.compact-account-logout {
  margin-top:
    auto !important;
}

/*
 * =====================================================
 * MOBILE
 * =====================================================
 */

@media (
  max-width: 979px
) {
  .compact-account-drawer {
    /*
     * Keep room for the fixed bottom navigation as well.
     *
     * The drawer itself can scroll above it.
     */
    padding-bottom:
      calc(
        10px +
        env(
          safe-area-inset-bottom,
          0px
        )
      );
  }
}
`;