"use client";

/**
 * app/accountant/page.tsx
 * Accountant = one main Finance tab, exactly matching Branch Admin's
 * Fees (Term Notices & Tracking / Fee Records), Expenses and Payroll views.
 * Uses the same branch modules so documents and data entry stay consistent.
 * Existing accountant modules are retained as non-navigation legacy routes.
 */
import React from "react";
import RolePortalShell, { type RoleNavSection } from "../components/role-portals/RolePortalShell";
import { ACCOUNTANT_ROLES } from "../lib/auth/roleRedirect";
import WorkspaceSubtabs from "../components/role-portals/WorkspaceSubtabs";

// Identical components to Branch Admin Finance. Server permissions remain enforced.
import BranchFees from "../branch-admin/modules/Fees";
import TermFeesRequirements from "../branch-admin/modules/finance/TermFeesRequirements";
import BranchExpenses from "../branch-admin/modules/Expenses";
import BranchPayroll from "../branch-admin/modules/Payroll";

// Preserve old route targets if an existing accountant module navigates to them.
import Fees from "./modules/Fees";
import Payments from "./modules/Payments";
import Income from "./modules/Income";
import Expenses from "./modules/Expenses";
import Balances from "./modules/Balances";
import Financereports from "./modules/Financereports";
import Announcements from "./modules/Announcements";
import Messages from "./modules/Messages";
import Calendar from "./modules/Calendar";

type RouteProps = { navigate: (key: string) => void };
type FinanceView = "fees" | "expenses" | "payroll";
type FeesView = "term" | "records";

function AccountantFinanceWorkspace(props: RouteProps) {
  const [view, setView] = React.useState<FinanceView>("fees");
  const [feesView, setFeesView] = React.useState<FeesView>("term");
  const Current: React.ComponentType<RouteProps> =
    view === "expenses" ? BranchExpenses :
    view === "payroll" ? BranchPayroll : BranchFees;

  return (
    <div className="ba-workspace-wrapper ba-finance-workspace" style={{ width: "100%", minWidth: 0 }}>
      <WorkspaceSubtabs<FinanceView>
        value={view} onChange={setView} ariaLabel="Finance views"
        tabs={[
          { key: "fees", label: "Fees" },
          { key: "expenses", label: "Expenses" },
          { key: "payroll", label: "Payroll" },
        ]}
      />
      {view === "fees" ? (
        <div className="ba-finance-fees-pane" style={{ width: "100%", minWidth: 0 }}>
          <WorkspaceSubtabs<FeesView>
            secondary
            value={feesView} onChange={setFeesView} ariaLabel="Fee tools"
            tabs={[
              { key: "term", label: "Term Notices & Tracking" },
              { key: "records", label: "Fee Records" },
            ]}
          />
          {feesView === "term" ? <TermFeesRequirements /> : <BranchFees {...props} />}
        </div>
      ) : (
        <Current {...props} />
      )}
    </div>
  );
}

export const NAV_SECTIONS: RoleNavSection[] = [{
  title: "Workspaces", defaultOpen: true,
  items: [{ key: "financeWorkspace", label: "Finance", icon: "💰" }],
}];

const ROUTES: Record<string, React.ComponentType<RouteProps>> = {
  financeWorkspace: AccountantFinanceWorkspace,
  // Old accountant routes are still available to existing internal navigate calls;
  // they do not appear as extra main tabs.
  fees: Fees,
  payments: Payments,
  income: Income,
  expenses: Expenses,
  balances: Balances,
  financeReports: Financereports,
  announcements: Announcements,
  messages: Messages,
  calendar: Calendar,
};

export default function AccountantPage() {
  return (
    <RolePortalShell
      portalTitle="Accountant Portal"
      portalSubtitle="Finance workspace"
      homeKey="financeWorkspace"
      allowedRoles={ACCOUNTANT_ROLES}
      navSections={NAV_SECTIONS}
      navigationMode="branch-workspace"
      routes={ROUTES}
      lockedContext={true}
      requireSchool={true}
      requireBranch={false}
    />
  );
}
