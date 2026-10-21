"use client";

import { useRouter } from "next/navigation";

import {
  useEffect,
  useState,
} from "react";

import { useLocalAppearanceRuntime } from "../../LocalAppearanceRuntime";
import { saveApplyAndAnnounceLocalPortalSettings } from "../../../lib/theme/localPortalAppearance";
import { useAccount } from "../../../context/account-context";
import { useSettings } from "../../../context/settings-context";
import { db } from "../../../lib/db/db";

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

  const router = useRouter();
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false);
  const appearance = useLocalAppearanceRuntime();
  const accountContext = useAccount();
  const settingsContext = useSettings();
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [appearanceError, setAppearanceError] = useState("");

  useEffect(() => {
    if (!open) {
      setWorkspaceSwitcherOpen(false);
      setAppearanceError("");
    }
  }, [open]);

  const selectAppearance = async (mode: "light" | "dark" | "system") => {
    if (appearanceSaving) return;
    setAppearanceError("");

    // Only mutate the private key after the signed-in AppUser is identified.
    const userId = String(accountContext.user?.id ?? "").trim();
    if (!userId) {
      setAppearanceError("Your profile is still loading. Please try again.");
      return;
    }

    const workspaceSettings = settingsContext.effectiveSettings as Record<string, any> | null;
    const sharedDefaultMode = String(
      workspaceSettings?.appearanceMode || workspaceSettings?.theme || workspaceSettings?.mode || "light",
    );
    const sharedPrimaryColor = String(
      workspaceSettings?.primaryColor ||
      (typeof document !== "undefined"
        ? getComputedStyle(document.documentElement).getPropertyValue("--primary-color").trim()
        : "") || "#2f6fed",
    );

    // Colour remains the school's; only this user's mode is saved.
    saveApplyAndAnnounceLocalPortalSettings(
      appearance.storageKey,
      { ...appearance.settings, appearanceMode: mode },
      {
        sharedDefaultMode,
        sharedPrimaryColor,
        sharedFontSize: workspaceSettings?.fontSize,
      },
    );
    setAppearanceSaving(true);
    try {
      const existing = await db.appUsers.get(userId);
      if (existing) {
        // Offline AppUser cache. Server-side preference sync remains a separate concern.
        await db.appUsers.update(userId, { preferredTheme: mode });
      }
    } catch {
      // Retain the immediate working appearance, but communicate cache failure.
      setAppearanceError("Appearance changed, but the user preference could not be saved to the local user record.");
    } finally {
      setAppearanceSaving(false);
    }
  };

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
          <button type="button" className="compact-drawer-identity drawer-identity-profile-link" onClick={() => { onClose(); router.push("/profile"); }} aria-label="Open my profile">
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
          </button>

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
         * WORKSPACES
         * =============================================== */}

        {memberships.length > 1 ? (
          <AccountSection title="Workspaces" meta={`${memberships.length}`} className="compact-workspaces-section">
            <button
              type="button"
              className="drawer-compact-switch-trigger"
              aria-expanded={workspaceSwitcherOpen}
              onClick={() => setWorkspaceSwitcherOpen((value) => !value)}
            >
              <span className="drawer-compact-switch-icon" aria-hidden="true">⇄</span>
              <span className="drawer-compact-switch-copy">
                <strong>{workspaceSwitcherOpen ? "Choose a workspace" : "Switch workspace"}</strong>
                <small>{workspaceSwitcherOpen ? "Select another available role or school" : `${memberRole} · ${memberships.length} available`}</small>
              </span>
              <span className="drawer-compact-switch-chevron" aria-hidden="true">{workspaceSwitcherOpen ? "⌃" : "⌄"}</span>
            </button>
            {workspaceSwitcherOpen && (
              <div className="drawer-compact-switch-panel">
                <QuickWorkspaceSwitcher
                  memberships={memberships}
                  selectedMembership={selectedMembership}
                  identities={identities}
                  switchingMembershipId={switchingMembershipId}
                  membershipKey={membershipKey}
                  sameMembership={sameMembership}
                  roleLabel={roleLabel}
                  roleIcon={roleIcon}
                  onSwitchMembership={(membership) => {
                    setWorkspaceSwitcherOpen(false);
                    onSwitchMembership(membership);
                  }}
                />
              </div>
            )}
          </AccountSection>
        ) : null}

        <AccountSection title="Appearance" className="compact-appearance-section">
          <div className="drawer-appearance-choices" role="group" aria-label="Personal appearance">
            {([
              { value: "light", label: "Light", icon: "☀" },
              { value: "dark", label: "Dark", icon: "☾" },
              { value: "system", label: "Default", icon: "◐" },
            ] as const).map((choice) => (
              <button
                key={choice.value}
                type="button"
                className={`drawer-appearance-choice ${appearance.settings.appearanceMode === choice.value ? "is-selected" : ""}`}
                aria-pressed={appearance.settings.appearanceMode === choice.value}
                disabled={appearanceSaving}
                onClick={() => void selectAppearance(choice.value)}
              >
                <span aria-hidden="true">{choice.icon}</span>
                <small>{choice.label}</small>
              </button>
            ))}
          </div>
          {appearanceError && <p className="drawer-appearance-error" role="status">{appearanceError}</p>}
        </AccountSection>

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
.drawer-identity-profile-link{border:0;padding:0;background:transparent;color:inherit;text-align:left;cursor:pointer;max-width:100%;border-radius:12px;}
.drawer-identity-profile-link:hover .compact-drawer-member-copy strong{text-decoration:underline;text-underline-offset:3px;}
.drawer-identity-profile-link:focus-visible{outline:3px solid var(--primary-color,#2563eb);outline-offset:3px;}

.drawer-open-profile{display:grid;grid-template-columns:32px minmax(0,1fr) 14px;align-items:center;gap:10px;width:100%;padding:12px;border:1px solid var(--eds-border,var(--border,#d9dee8));border-radius:14px;background:var(--eds-surface,var(--surface,#fff));color:var(--eds-text,var(--text,#172033));text-align:left;cursor:pointer}.drawer-open-profile strong,.drawer-open-profile small{display:block}.drawer-open-profile small{font-size:11px;color:var(--eds-text-muted,var(--muted,#64748b));margin-top:2px}.drawer-open-profile:focus-visible{outline:3px solid var(--primary-color,#2563eb);outline-offset:2px}

.drawer-compact-switch-trigger { width:100%; display:flex; align-items:center; gap:11px; padding:12px; border:1px solid var(--eds-border,var(--border,#d9dee8)); border-radius:16px; background:var(--eds-surface,var(--surface,#fff)); color:var(--eds-text,var(--text,#172033)); text-align:left; cursor:pointer; }
.drawer-compact-switch-icon {display:grid;place-items:center;width:36px;height:36px;flex-shrink:0;border-radius:11px;background:color-mix(in srgb,var(--primary-color,#2563eb) 10%,var(--eds-surface,#fff));color:var(--primary-color,#2563eb);font-size:22px;}
.drawer-compact-switch-copy {flex:1;min-width:0;display:grid;gap:3px;}
.drawer-compact-switch-copy strong {font-size:13px;font-weight:800;}
.drawer-compact-switch-copy small {font-size:11px;color:var(--eds-text-muted,var(--muted,#64748b));}
.drawer-compact-switch-chevron {font-size:20px;color:var(--eds-text-muted,var(--muted,#64748b));}
.drawer-compact-switch-panel {padding-top:10px;max-height:min(42vh,360px);overflow-y:auto;overscroll-behavior:contain;}
.drawer-appearance-choices {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
.drawer-appearance-choice {min-height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid var(--eds-border,var(--border,#d9dee8));border-radius:14px;background:var(--eds-surface,var(--surface,#fff));color:var(--eds-text,var(--text,#172033));cursor:pointer;}
.drawer-appearance-choice > span {font-size:21px;line-height:1;}
.drawer-appearance-choice small {font-size:11px;font-weight:750;}
.drawer-appearance-choice.is-selected {border-color:var(--primary-color,#2563eb);box-shadow:inset 0 0 0 1px var(--primary-color,#2563eb);background:color-mix(in srgb,var(--primary-color,#2563eb) 8%,var(--eds-surface,#fff));}
.drawer-appearance-choice:focus-visible,.drawer-compact-switch-trigger:focus-visible {outline:3px solid var(--primary-color,#2563eb);outline-offset:2px;}
.drawer-appearance-error {font-size:11px;color:#b45309;margin:7px 0 0;}

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
