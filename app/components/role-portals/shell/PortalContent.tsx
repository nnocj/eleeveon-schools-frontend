
"use client";

/**
 * app/components/role-portals/shell/PortalContent.tsx
 * ---------------------------------------------------------
 * ELEEVEON PORTAL CONTENT
 *
 * Shared content host for all role portals.
 *
 * - Keeps the existing Eleeveon background
 * - Keeps the existing texture/noise layer
 * - Preserves the active module component tree
 * - Loads shared portal viewport/overlay boundaries
 * - Uses the document scrollbar for normal pages
 *
 * No changes to authentication, role resolution,
 * navigation, workspace context or module data.
 */

import type { ReactNode } from "react";

import {
  EleeveonBackground,
  EleeveonNoise,
} from "../../design";

import "./PortalOverlayBoundaries.css";

export interface PortalContentProps {
  children: ReactNode;
  className?: string;
}

export default function PortalContent({
  children,
  className,
}: PortalContentProps) {
  return (
    <section
      className={[
        "app-content",
        "shell-portal-content",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-portal-content="true"
    >
      <EleeveonBackground
        pattern="dots"
        glow
        className="shell-content-background"
      >
        <EleeveonNoise opacity={0.018} />

        <div
          className="app-content-inner"
          data-portal-module-boundary="true"
        >
          {children}
        </div>
      </EleeveonBackground>
    </section>
  );
}
