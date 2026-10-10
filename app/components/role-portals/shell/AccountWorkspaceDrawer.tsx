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

  memberImage?:
    string |
    null;

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
   * Kept only because RolePortalShell still supplies them.
   *
   * System and Access is no longer rendered here.
   */
  onOpenStatus(): void;

  onSelectRole(): void;

  onLogout(): void;
}

// ======================================================
// INITIALS
// ======================================================

function initials(
  name: string,
) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(
      0,
      2,
    )
    .map(
      (
        part,
      ) =>
        part[0] ??
        "",
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
}: {
  src?:
    string |
    null;

  name:
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
      className="drawer-account-photo"
      aria-label={`${name} profile image`}
    >
      {showImage ? (
        <img
          src={
            src ||
            ""
          }
          alt=""
          onError={() =>
            setFailed(
              true,
            )
          }
        />
      ) : (
        <span className="drawer-account-photo-fallback">
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
        strokeWidth="1.7"
        strokeDasharray="2 3"
      />
    </svg>
  );
}

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
   * Still accepted so RolePortalShell remains unchanged.
   */
  void onOpenStatus;
  void onSelectRole;
  void online;
  void realtimeConnected;

  // ====================================================
  // DRAWER SCROLL OWNERSHIP
  // ====================================================
  //
  // While this drawer is open:
  //
  // document = locked
  // drawer   = scrollable
  //
  // When closed:
  //
  // document = normal
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
        html.style
          .overflow,

      htmlOverflowY:
        html.style
          .overflowY,

      bodyOverflow:
        body.style
          .overflow,

      bodyOverflowY:
        body.style
          .overflowY,

      htmlOverscroll:
        html.style
          .overscrollBehavior,

      bodyOverscroll:
        body.style
          .overscrollBehavior,
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

    return () => {
      html.style.overflow =
        previous
          .htmlOverflow;

      html.style.overflowY =
        previous
          .htmlOverflowY;

      html.style.overscrollBehavior =
        previous
          .htmlOverscroll;

      body.style.overflow =
        previous
          .bodyOverflow;

      body.style.overflowY =
        previous
          .bodyOverflowY;

      body.style.overscrollBehavior =
        previous
          .bodyOverscroll;
    };
  }, [
    open,
  ]);

  const handleHub =
    () => {
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
        size="14rem"
        opacity={
          0.035
        }
      />

      <BrandPattern
        variant="network"
        opacity={
          0.008
        }
      />

      <BrandTexture
        texture="grain"
        intensity={
          0.18
        }
        decorative
        className="shell-drawer-texture"
      />

      <div className="compact-drawer-inner">
        {/* ===============================================
         * MEMBER PROFILE
         * =============================================== */}

        <header className="compact-drawer-head">
          <div className="compact-drawer-identity">
            <DrawerProfileImage
              src={
                memberImage
              }
              name={
                memberName
              }
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
            className="compact-drawer-close"
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
         * =============================================== */}

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
         * CURRENT WORKSPACE REMOVED
         * =============================================== */}

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
         * OPTIONAL UNLOCKED CONTEXT
         * =============================================== */}

        {!lockedContext ? (
          <AccountSection
            title="School context"
            className="compact-context-section"
          >
            <div className="compact-context-grid">
              <label className="account-context-field">
                <span>
                  <SchoolIcon
                    size="sm"
                  />

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
                  <WorkspaceIcon
                    size="sm"
                  />

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
         * =============================================== */}

        <Button
          variant="danger"
          fullWidth
          onClick={
            onLogout
          }
          className="compact-account-logout"
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
// STYLES
// ======================================================

const css = `
/*
 * =====================================================
 * DRAWER POSITION
 * =====================================================
 *
 * PortalHeader remains visible.
 *
 * Drawer begins immediately underneath it.
 */

.context-drawer.compact-account-drawer {
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

  right:
    0 !important;

  bottom:
    0 !important;

  height:
    auto !important;

  max-height:
    none !important;

  /*
   * Similar visual foundation to SyncStatusSheet:
   * neutral application background + clear cards.
   */
  background:
    var(
      --eds-bg,
      var(
        --bg,
        #f5f7fb
      )
    ) !important;

  color:
    var(
      --eds-text,
      var(
        --text,
        #273449
      )
    ) !important;

  border-left:
    1px solid
    var(
      --eds-divider,
      var(
        --border,
        rgba(15,23,42,.08)
      )
    ) !important;

  box-shadow:
    -16px 0 40px
    rgba(15,23,42,.14) !important;

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
 * Fixed header remains visually above drawer.
 */

.portal-fixed-header {
  z-index:
    70 !important;
}

/*
 * Mobile:
 *
 * stop the drawer above Home / Library / Screens.
 */

@media (
  max-width: 979px
) {
  .context-drawer.compact-account-drawer {
    bottom:
      calc(
        64px +
        env(
          safe-area-inset-bottom,
          0px
        )
      ) !important;
  }
}

/*
 * Desktop installed window overlay does not render
 * PortalHeader, therefore remove the local 48px reservation.
 */

@media (
  display-mode:
    window-controls-overlay
) {
  .context-drawer.compact-account-drawer {
    top:
      var(
        --eds-shell-top-offset,
        0px
      ) !important;
  }
}

/*
 * =====================================================
 * DRAWER INNER
 * =====================================================
 */

.compact-drawer-inner {
  position:
    relative;

  z-index:
    2;

  min-height:
    100%;

  display:
    flex;

  flex-direction:
    column;

  gap:
    14px;

  padding:
    14px;

  padding-bottom:
    max(
      18px,
      env(
        safe-area-inset-bottom,
        0px
      )
    );
}

/*
 * =====================================================
 * PROFILE HEADER
 * =====================================================
 */

.compact-drawer-head {
  position:
    relative !important;

  top:
    auto !important;

  width:
    100%;

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap:
    12px;

  margin:
    0;

  padding:
    2px 0
    14px;

  background:
    transparent !important;

  border-bottom:
    1px solid
    var(
      --eds-divider,
      var(
        --border,
        rgba(15,23,42,.08)
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
    12px;
}

.drawer-account-photo {
  width:
    56px;

  height:
    56px;

  display:
    grid;

  place-items:
    center;

  overflow:
    hidden;

  border:
    1px solid
    color-mix(
      in srgb,
      var(
        --eds-primary,
        #2563eb
      ) 25%,
      var(
        --eds-border,
        rgba(15,23,42,.09)
      )
    );

  border-radius:
    18px;

  background:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        #2563eb
      ) 8%,
      var(
        --eds-surface,
        #ffffff
      )
    );

  box-shadow:
    0 5px 16px
    rgba(15,23,42,.08);
}

.drawer-account-photo
img {
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

  max-width:
    none !important;
}

.drawer-account-photo-fallback {
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
      #2563eb
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
      var(
        --text,
        #273449
      )
    );

  font-size:
    16px;

  font-weight:
    900;
}

.compact-drawer-member-copy
small {
  margin-top:
    4px;

  color:
    var(
      --eds-text-muted,
      var(
        --muted,
        #66728a
      )
    );

  font-size:
    11px;

  font-weight:
    650;
}

.compact-drawer-close {
  width:
    44px;

  height:
    44px;

  flex:
    0 0 44px;

  display:
    grid;

  place-items:
    center;

  border:
    1px solid
    var(
      --eds-border,
      rgba(15,23,42,.09)
    );

  border-radius:
    15px;

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
      #273449
    );

  font-size:
    22px;

  cursor:
    pointer;

  box-shadow:
    0 3px 12px
    rgba(15,23,42,.04);
}

/*
 * =====================================================
 * HUB
 * =====================================================
 */

.drawer-hub-strip {
  width:
    100%;

  min-height:
    66px;

  display:
    grid;

  grid-template-columns:
    44px
    minmax(0, 1fr)
    auto;

  align-items:
    center;

  gap:
    11px;

  border:
    1px solid
    color-mix(
      in srgb,
      var(
        --eds-primary,
        #2563eb
      ) 28%,
      var(
        --eds-border,
        rgba(15,23,42,.08)
      )
    );

  border-radius:
    20px;

  padding:
    10px;

  background:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        #2563eb
      ) 5%,
      var(
        --eds-surface,
        #ffffff
      )
    );

  color:
    inherit;

  text-align:
    left;

  cursor:
    pointer;

  box-shadow:
    0 4px 14px
    rgba(15,23,42,.045);
}

.drawer-hub-icon {
  width:
    44px;

  height:
    44px;

  display:
    grid;

  place-items:
    center;

  border-radius:
    14px;

  background:
    var(
      --eds-primary,
      #2563eb
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
      #273449
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
      #66728a
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
      #66728a
    );

  font-size:
    22px;

  font-weight:
    500;
}

/*
 * =====================================================
 * ACCOUNT SECTION HEADING
 * =====================================================
 */

.compact-account-drawer
.account-drawer-section {
  gap:
    9px;
}

.compact-account-drawer
.account-drawer-section
> header {
  min-height:
    28px;

  padding:
    0 3px;
}

.compact-account-drawer
.account-drawer-section
> header
span {
  color:
    var(
      --eds-text-muted,
      #66728a
    );

  font-size:
    9px;

  font-weight:
    900;

  letter-spacing:
    .06em;

  text-transform:
    uppercase;
}

/*
 * =====================================================
 * WORKSPACE CARDS
 * =====================================================
 *
 * Neutral styling mirrors System Status:
 *
 * light background
 * dark text
 * muted secondary text
 * subtle border
 * brand colour only for state/accent
 */

.compact-account-drawer
.workspace-list {
  display:
    grid;

  gap:
    9px;
}

.compact-account-drawer
.workspace-list
button {
  width:
    100%;

  min-width:
    0;

  min-height:
    72px;

  display:
    grid;

  grid-template-columns:
    46px
    minmax(0, 1fr)
    auto;

  grid-template-rows:
    auto auto;

  align-items:
    center;

  column-gap:
    11px;

  border:
    1px solid
    var(
      --eds-border,
      rgba(15,23,42,.09)
    ) !important;

  border-radius:
    20px !important;

  padding:
    10px !important;

  background:
    var(
      --eds-surface,
      var(
        --surface,
        #ffffff
      )
    ) !important;

  color:
    var(
      --eds-text,
      #273449
    ) !important;

  box-shadow:
    0 4px 14px
    rgba(15,23,42,.045) !important;
}

.compact-account-drawer
.workspace-list
button:hover {
  background:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        #2563eb
      ) 3%,
      var(
        --eds-surface,
        #ffffff
      )
    ) !important;
}

.compact-account-drawer
.workspace-list
button.active {
  border-color:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        #2563eb
      ) 48%,
      var(
        --eds-border,
        rgba(15,23,42,.09)
      )
    ) !important;

  background:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        #2563eb
      ) 7%,
      var(
        --eds-surface,
        #ffffff
      )
    ) !important;

  box-shadow:
    0 4px 16px
    color-mix(
      in srgb,
      var(
        --eds-primary,
        #2563eb
      ) 7%,
      transparent
    ) !important;
}

/*
 * Workspace image/icon.
 */

.compact-account-drawer
.workspace-avatar {
  grid-row:
    span 2;

  width:
    46px !important;

  height:
    46px !important;

  display:
    grid;

  place-items:
    center;

  overflow:
    hidden;

  border-radius:
    14px !important;

  background:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        #2563eb
      ) 8%,
      var(
        --eds-surface,
        #ffffff
      )
    ) !important;
}

.compact-account-drawer
.workspace-avatar
img {
  width:
    100% !important;

  height:
    100% !important;

  max-width:
    none !important;

  display:
    block;

  object-fit:
    cover !important;

  object-position:
    center;
}

.compact-account-drawer
.workspace-list
strong {
  color:
    var(
      --eds-text-strong,
      #273449
    ) !important;

  font-size:
    12px !important;

  font-weight:
    850 !important;
}

.compact-account-drawer
.workspace-list
small {
  color:
    var(
      --eds-text-muted,
      #66728a
    ) !important;

  font-size:
    9px !important;

  font-weight:
    650 !important;
}

.compact-account-drawer
.workspace-list
b {
  grid-row:
    span 2;

  min-width:
    72px;

  min-height:
    34px;

  display:
    grid;

  place-items:
    center;

  border-radius:
    999px !important;

  padding:
    0 12px !important;

  background:
    color-mix(
      in srgb,
      var(
        --eds-primary,
        #2563eb
      ) 8%,
      var(
        --eds-surface,
        #ffffff
      )
    ) !important;

  color:
    var(
      --eds-primary,
      #2563eb
    ) !important;

  font-size:
    9px !important;

  font-weight:
    850 !important;
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

.compact-account-drawer
.account-context-field {
  color:
    var(
      --eds-text-muted,
      #66728a
    );
}

.compact-account-drawer
.account-context-field
select {
  background:
    var(
      --eds-surface,
      #ffffff
    );

  color:
    var(
      --eds-text-strong,
      #273449
    );

  border-color:
    var(
      --eds-border,
      rgba(15,23,42,.09)
    );
}

/*
 * =====================================================
 * LOGOUT
 * =====================================================
 */

.compact-account-logout {
  margin-top:
    auto !important;

  min-height:
    48px;

  border-radius:
    17px !important;

  background:
    color-mix(
      in srgb,
      #ef4444 8%,
      var(
        --eds-surface,
        #ffffff
      )
    ) !important;

  color:
    #dc2626 !important;

  border:
    1px solid
    rgba(239,68,68,.12) !important;

  box-shadow:
    none !important;
}
`;