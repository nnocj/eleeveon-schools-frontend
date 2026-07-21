/**
 * app/branch-admin/layout.tsx
 * --------------------------------------------------------------------------
 * Branch Admin route layout.
 *
 * Global providers remain in app/providers.tsx. This layout only applies the
 * shared Branch Admin visual tokens so every module follows the selected
 * branch primary colour without mounting duplicate runtime providers.
 */

import type { ReactNode } from "react";

export default function BranchAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="branch-admin-theme">{children}</div>;
}
