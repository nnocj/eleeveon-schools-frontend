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
  workspaceDetailLabel,
  workspaceScopeLabel,
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
import WorkspaceStatusBadge from "./WorkspaceStatusBadge";

import {
  SchoolIcon,
  SettingsIcon,
  SyncIcon,
  WorkspaceIcon,
} from "../../icons";

export interface AccountWorkspaceDrawerProps {
  open: boolean;

  memberName: string;
  memberRole: string;
  memberImage?: string | null;

  selectedMembership?: UserMembership | null;

  memberships:
    UserMembership[];

  identities:
    WorkspaceDisplayIdentityMap;

  switchingMembershipId?: string | null;

  schoolId?: string | null;
  branchId?: string | null;

  schools?: Array<{
    id: string;
    name: string;
  }>;

  branches?: Array<{
    id: string;
    name: string;
  }>;

  lockedContext?: boolean;

  online: boolean;
  realtimeConnected: boolean;

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

  onOpenStatus(): void;

  onSelectRole(): void;

  onLogout(): void;
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

function DrawerProfileImage({
  src,
  name,
  active = false,
  className = "",
}: {
  src?: string | null;
  name: string;
  active?: boolean;
  className?: string;
}) {
  const [
    failed,
    setFailed,
  ] =
    useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage =
    Boolean(src) &&
    !failed;

  return (
    <span
      className={[
        "drawer-profile-image",

        active &&
          "active",

        className,
      ]
        .filter(Boolean)
        .join(" ")}
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

      {active ? (
        <span
          className="drawer-profile-status"
          aria-label="Current workspace"
        />
      ) : null}
    </span>
  );
}

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
  const currentScope =
    selectedMembership
      ? workspaceScopeLabel(
          selectedMembership,
          identities,
        )
      : "Account workspace";

  const currentDetail =
    selectedMembership
      ? workspaceDetailLabel(
          selectedMembership,
          identities,
        )
      : "";

  const meaningfulDetail =
    currentDetail &&
    currentDetail !==
      "Workspace access" &&
    currentDetail !==
      currentScope
      ? currentDetail
      : "";

  const handleHub =
    () => {
      onClose();

      window.setTimeout(
        () =>
          openEleeveonHub(),
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
        .filter(Boolean)
        .join(" ")}
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
        {/* =================================================
         * MEMBER IDENTITY
         * ================================================= */}

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

        {/* =================================================
         * ELEEVEON HUB
         * ================================================= */}

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

        {/* =================================================
         * CURRENT WORKSPACE
         * ================================================= */}

        <section className="compact-current-access">
          <span className="compact-current-access-copy">
            <small>
              Current workspace
            </small>

            <strong
              title={
                currentScope
              }
            >
              {currentScope}
            </strong>

            {meaningfulDetail ? (
              <em
                title={
                  meaningfulDetail
                }
              >
                {meaningfulDetail}
              </em>
            ) : null}
          </span>

          <WorkspaceStatusBadge
            online={
              online
            }
            realtimeConnected={
              realtimeConnected
            }
          />
        </section>

        {/* =================================================
         * WORKSPACE SWITCHING
         * ================================================= */}

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

        {/* =================================================
         * SCHOOL / BRANCH CONTEXT
         * ================================================= */}

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
                    (school) => (
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
                    (branch) => (
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

        {/* =================================================
         * SYSTEM AND ACCESS
         * ================================================= */}

        <AccountSection
          title="System and access"
          className="compact-actions-section"
        >
          <section className="compact-account-actions">
            <button
              type="button"
              onClick={
                onOpenStatus
              }
            >
              <span className="compact-action-icon">
                <SyncIcon size="sm" />
              </span>

              <span className="compact-action-copy">
                <strong>
                  System status
                </strong>

                <small>
                  Connection and sync
                </small>
              </span>

              <b
                aria-hidden="true"
              >
                ›
              </b>
            </button>

            <button
              type="button"
              onClick={
                onSelectRole
              }
            >
              <span className="compact-action-icon">
                <SettingsIcon size="sm" />
              </span>

              <span className="compact-action-copy">
                <strong>
                  Select role
                </strong>

                <small>
                  All access points
                </small>
              </span>

              <b
                aria-hidden="true"
              >
                ›
              </b>
            </button>
          </section>
        </AccountSection>

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

const css = `
/* =====================================================
 * DRAWER CONTENT
 * ===================================================== */

.compact-drawer-inner {
  gap:
    12px;
}

/* =====================================================
 * MEMBER PROFILE
 * ===================================================== */

.compact-drawer-head {
  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap:
    12px;

  padding-bottom:
    12px;
}

.compact-drawer-identity {
  min-width:
    0;

  display:
    grid;

  grid-template-columns:
    54px
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
    54px !important;

  height:
    54px !important;

  flex:
    0 0 54px;

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
        var(--primary-color, #2563eb) 12%,
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

/* =====================================================
 * ELEEVEON HUB STRIP
 * ===================================================== */

.drawer-hub-strip {
  width:
    100%;

  min-height:
    60px;

  display:
    grid;

  grid-template-columns:
    40px
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
    40px;

  height:
    40px;

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

.drawer-hub-icon svg {
  width:
    22px;

  height:
    22px;
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

/* =====================================================
 * CURRENT WORKSPACE
 * ===================================================== */

.compact-current-access {
  width:
    100%;

  min-width:
    0;

  display:
    grid;

  grid-template-columns:
    minmax(0, 1fr)
    auto;

  align-items:
    center;

  gap:
    10px;

  padding:
    11px 12px;

  border:
    1px solid
    var(
      --eds-border,
      var(--border, rgba(0,0,0,.09))
    );

  border-radius:
    17px;

  background:
    color-mix(
      in srgb,
      var(
        --eds-surface,
        var(--surface, #ffffff)
      ) 96%,
      var(
        --eds-primary,
        #2563eb
      )
    );
}

.compact-current-access-copy {
  min-width:
    0;

  display:
    block;
}

.compact-current-access-copy
small,
.compact-current-access-copy
strong,
.compact-current-access-copy
em {
  display:
    block;

  min-width:
    0;

  overflow:
    hidden;

  text-overflow:
    ellipsis;
}

.compact-current-access-copy
small {
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    8px;

  font-weight:
    850;

  letter-spacing:
    .065em;

  text-transform:
    uppercase;
}

.compact-current-access-copy
strong {
  margin-top:
    4px;

  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    );

  font-size:
    13px;

  line-height:
    1.35;

  font-weight:
    900;
}

.compact-current-access-copy
em {
  margin-top:
    3px;

  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    10px;

  line-height:
    1.35;

  font-style:
    normal;
}

/* =====================================================
 * CONTEXT SELECTORS
 * ===================================================== */

.compact-context-grid {
  display:
    grid;

  gap:
    8px;
}

/* =====================================================
 * SYSTEM AND ACCESS
 * ===================================================== */

.compact-account-actions {
  display:
    grid;

  gap:
    4px;
}

.compact-account-actions
> button {
  width:
    100%;

  min-width:
    0;

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
    9px;

  border:
    0;

  border-radius:
    14px;

  padding:
    7px 8px;

  background:
    transparent;

  color:
    inherit;

  text-align:
    left;

  cursor:
    pointer;
}

.compact-account-actions
> button:hover {
  background:
    var(
      --eds-primary-softer,
      color-mix(
        in srgb,
        var(--primary-color, #2563eb) 7%,
        transparent
      )
    );
}

.compact-action-icon {
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
    var(
      --eds-primary-softer,
      color-mix(
        in srgb,
        var(--primary-color, #2563eb) 8%,
        transparent
      )
    );

  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    );
}

.compact-action-copy {
  min-width:
    0;
}

.compact-action-copy
strong,
.compact-action-copy
small {
  display:
    block;

  overflow:
    hidden;

  text-overflow:
    ellipsis;
}

.compact-action-copy
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

.compact-action-copy
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

.compact-account-actions
> button
> b {
  color:
    var(
      --eds-text-muted,
      var(--muted, #64748b)
    );

  font-size:
    20px;

  font-weight:
    500;
}

/* =====================================================
 * LOGOUT
 * ===================================================== */

.compact-account-logout {
  margin-top:
    4px;
}
`;