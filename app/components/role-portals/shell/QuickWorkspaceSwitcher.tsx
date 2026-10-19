"use client";

/**
 * app/components/role-portals/shell/QuickWorkspaceSwitcher.tsx
 * Display names come from the shared roleDisplay.ts utility.
 * Internal membership roles remain unchanged for authorization and routing.
 */

import { useEffect, useState } from "react";

import type { UserMembership } from "../../../lib/auth/roleRedirect";
import { displayRoleLabel } from "../../../lib/auth/roleDisplay";

import type { WorkspaceDisplayIdentityMap } from "../../../lib/workspaces/useWorkspaceDisplayNames";
import {
  workspaceDetailLabel,
  workspaceProfileImage,
  workspaceScopeLabel,
} from "../../../lib/workspaces/useWorkspaceDisplayNames";

export interface QuickWorkspaceSwitcherProps {
  memberships: UserMembership[];
  selectedMembership?: UserMembership | null;
  identities: WorkspaceDisplayIdentityMap;
  switchingMembershipId?: string | null;

  membershipKey(membership: UserMembership): string;
  sameMembership(left: UserMembership, right?: UserMembership | null): boolean;

  // Retained for compatibility with existing AccountWorkspaceDrawer callers.
  // Role labels rendered here always use displayRoleLabel instead.
  roleLabel(role: string): string;
  roleIcon(role: string): string;

  onSwitchMembership(membership: UserMembership): void;
}

function WorkspaceThumbnail({
  image,
  label,
  fallback,
  active,
}: {
  image?: string | null;
  label: string;
  fallback: string;
  active: boolean;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [image]);

  const showImage = Boolean(image) && !failed;

  return (
    <span
      className={[
        "workspace-avatar",
        "workspace-thumbnail",
        active && "active",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${label} image`}
    >
      {showImage ? (
        <img
          src={image || ""}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="workspace-thumbnail-fallback" aria-hidden="true">
          {fallback}
        </span>
      )}

      <span
        className={[
          "workspace-thumbnail-status",
          active ? "current" : "available",
        ].join(" ")}
        aria-hidden="true"
      />
    </span>
  );
}

export default function QuickWorkspaceSwitcher({
  memberships,
  selectedMembership,
  identities,
  switchingMembershipId,
  membershipKey,
  sameMembership,
  roleIcon,
  onSwitchMembership,
}: QuickWorkspaceSwitcherProps) {
  return (
    <div className="workspace-list shell-workspace-switcher compact-workspace-switcher">
      {memberships.map((membership) => {
        const id = membershipKey(membership);
        const active = sameMembership(membership, selectedMembership);
        const switching = switchingMembershipId === id;

        const image = workspaceProfileImage(membership, identities);
        const scope = workspaceScopeLabel(membership, identities);
        const detail = workspaceDetailLabel(membership, identities);
        const visibleRole = displayRoleLabel(membership.role);

        return (
          <button
            key={id}
            type="button"
            className={active ? "active" : ""}
            onClick={() => onSwitchMembership(membership)}
            disabled={Boolean(switchingMembershipId)}
          >
            <WorkspaceThumbnail
              image={image}
              label={visibleRole}
              fallback={roleIcon(membership.role)}
              active={active}
            />

            <span className="workspace-switch-copy">
              <strong>{visibleRole}</strong>
              <small title={`${scope} · ${detail}`}>
                {scope}
                {detail && detail !== "Workspace access" ? ` · ${detail}` : ""}
              </small>
            </span>

            <b>{switching ? "..." : active ? "Current" : "Open"}</b>
          </button>
        );
      })}
    </div>
  );
}
