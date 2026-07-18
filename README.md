Ordered fix plan

The fixes should be completed in this order because theme readiness, role switching, and Branch Admin data consistency depend on one another.

Phase 1 — Define role appearance scopes

Create:

app/lib/theme/appearanceScope.ts

This file becomes the single authority for deciding which settings source a role may use.

export type AppearanceScope =
  | "platform"
  | "account"
  | "school"
  | "branch";

Recommended mapping:

developer         → platform
platform_team     → platform

owner             → account
super_admin       → account

admin             → school
school_admin      → school

branch_admin      → branch
teacher           → branch
student           → branch
parent            → branch
accountant        → branch

It should also expose helpers such as:

appearanceScopeForRole(role)
requiresSchoolAppearance(role)
requiresBranchAppearance(role)

This must be completed first so every later provider uses the same rules.

Phase 2 — Build explicit scoped-theme application and cleanup

Create:

app/lib/theme/applyScopedAppearance.ts

This file should own all writes to global CSS variables and document attributes.

Functions:

clearScopedAppearance()
applyPlatformAppearance()
applyAccountAppearance()
applySchoolAppearance()
applyBranchAppearance()

Before applying a new scope, always clear the previous one:

clearScopedAppearance();
applyBranchAppearance(settings);

Clear variables such as:

--primary-color
--dashboard-primary
--branch-primary
--font-family
--font-size
--card-radius
--surface

Also clear scope markers:

data-appearance-scope
data-role
data-account-id
data-school-id
data-branch-id

This phase fixes the leakage problem where a branch colour remains active after switching to Owner or Developer.

Phase 3 — Make workspace bootstrap return exact settings

Update:

app/lib/sync/workspaceBootstrap.ts
backend/src/sync/sync.service.ts

The backend bootstrap response should explicitly return:

{
  account,
  school,
  branch,
  schoolBranchSettings,
  requiredTables,
  completed,
  revision,
}

The frontend should commit the records to Dexie first and then return the exact committed settings row:

{
  settings,
  school,
  branch,
  completedAt,
  revision,
}

It should also persist a scoped cache:

accountId + schoolId + branchId

Never store branch settings as an unscoped global object.

Phase 4 — Rebuild SettingsContext as role-aware

Update:

app/context/settings-context.tsx

The current context must stop treating branch settings as universally applicable.

Recommended state:

type SettingsContextValue = {
  effectiveSettings: unknown | null;
  effectiveScope: AppearanceScope;

  platformSettings: unknown | null;
  accountSettings: unknown | null;
  schoolSettings: unknown | null;
  branchSettings: unknown | null;

  ready: boolean;
  loading: boolean;

  loadedFor: {
    role: string;
    accountId?: string;
    schoolId?: number;
    branchId?: number;
  } | null;

  refreshSettings(): Promise<void>;
  hydrateSettingsForMembership(
    membership: UserMembership,
  ): Promise<void>;
};

Resolution must depend on the active role:

platform role → platform settings only
owner role    → account settings
school role   → school settings
branch role   → branch settings

A cached branch row may remain in memory, but it must not become effectiveSettings while Owner is active.

Phase 5 — Rebuild ThemeContext around exact applied scope

Update:

app/context/theme-context.tsx

ThemeContext should no longer just expose a theme object and generic loading flag.

It should expose:

{
  theme,
  ready,
  effectiveScope,

  appliedFor: {
    role: string;
    accountId?: string;
    schoolId?: number;
    branchId?: number;
  } | null;

  applyForMembership(
    membership: UserMembership,
  ): Promise<void>;

  resetAppearance(): void;
}

When the active role changes:

clear old scoped appearance
→ determine new scope
→ load valid settings
→ apply new appearance
→ record appliedFor
→ mark ready

Theme readiness must require an exact match.

For Branch Admin:

role matches
accountId matches
schoolId matches
branchId matches
scope is branch

For Owner:

role matches
accountId matches
scope is account
branch does not matter
Phase 6 — Make membership switching atomic

Update:

app/context/active-membership-context.tsx
app/select-role/page.tsx

The role-switch sequence should become:

start role transition
→ clear previous scoped theme
→ set active membership
→ set active school and branch
→ bootstrap required workspace
→ hydrate role-appropriate settings
→ apply target appearance
→ verify appearance matches target role
→ navigate

For Owner or Developer:

no branch bootstrap required
→ clear branch theme
→ apply account/platform theme
→ navigate

For Branch Admin:

bootstrap branch workspace
→ hydrate exact schoolBranchSettings
→ apply branch theme
→ navigate

The target portal must not open until the target appearance has been applied.

Phase 7 — Add a workspace-appearance readiness runtime

Create:

app/components/PortalAppearanceRuntime.tsx

Responsibilities:

observe active membership changes;
determine the expected appearance scope;
apply the correct settings;
clear stale branch appearance;
recover appearance after reload;
react to Branch Settings changes;
expose first-entry readiness.

Mount it globally in:

app/providers.tsx

This component should be responsible for applying appearance outside the Branch Settings editor itself.

Branch Settings edits the settings; the runtime applies them.

Phase 8 — Correct provider order

Update:

app/providers.tsx

Recommended dependency order:

DatabaseBootstrap
└── AccountProvider
    └── ActiveBranchProvider
        └── ActiveMembershipProvider
            └── SettingsProvider
                └── ThemeProvider
                    └── PortalAppearanceRuntime
                        └── RealtimeProvider
                            └── SyncBootstrapProvider

Important requirements:

SettingsProvider must know the active membership and selected workspace.
ThemeProvider must receive the resolved effective settings.
PortalAppearanceRuntime must run before portal content renders.
Realtime and sync should not become the source of initial appearance readiness.
Phase 9 — Add exact readiness gating to RolePortalShell

Update:

app/components/role-portals/RolePortalShell.tsx

The shell should calculate:

const expectedScope =
  appearanceScopeForRole(activeRole);

Then verify:

const appearanceMatchesRole =
  theme.ready &&
  theme.effectiveScope === expectedScope &&
  theme.appliedFor?.role === activeRole;

For branch roles, also require matching school and branch IDs.

Before the portal has rendered once:

appearance not ready
→ show Preparing workspace

After the portal is already visible:

background settings refresh
→ keep current page visible

Use a ref such as:

const renderedWorkspaceRef =
  useRef<string | null>(null);

This prevents the recurring “Opening…” flicker.

Phase 10 — Correct Branch Settings save propagation

Update:

app/branch-admin/modules/Branchsettings.tsx
app/lib/events/dataEvents.ts
app/lib/sync/syncEvents.ts

Saving Branch Settings should do:

update schoolBranchSettings in Dexie
→ publish changedTables: ["schoolBranchSettings"]
→ SettingsContext reloads exact active row
→ ThemeContext reapplies branch appearance
→ schedule sync

The Branch Settings page should not be the only component capable of applying the colour.

Acceptance flow:

save new branch colour
→ whole branch portal changes immediately
→ switch to Owner
→ owner theme replaces branch theme
→ switch back
→ saved branch colour restores immediately
Phase 11 — Separate local personal preferences

Create or update:

app/lib/theme/localPortalAppearance.ts
app/components/LocalAppearanceRuntime.tsx
app/components/role-portals/LocalSettings.tsx

Local Settings should control only device-specific preferences:

light/dark/system override
density
motion
personal font-size override

It must not control:

branch primary colour
branch logo
branch branding
shared branch font

Recommended precedence:

branch/account/platform branding
+
local device display override

For example:

finalAppearanceMode =
  localMode === "system"
    ? branchOrPlatformDefaultMode
    : localMode;

This can be completed after the shared branch theme is stable.

Phase 12 — Validate role transitions

Before rebuilding more pages, test these transitions:

Branch Admin → Owner
Owner → Branch Admin
Branch Admin A → Branch Admin B
Teacher → Owner
Developer → Branch Admin
Branch Admin → Developer
School Admin → Branch Admin
Branch Admin → School Admin

For every transition verify:

no previous colour flash
no previous logo
no previous branch font
correct settings before portal opens
correct school/branch data
no unnecessary broad resync

This is the completion gate for the appearance foundation.

Phase 13 — Standardize the Branch Admin data foundation

Once appearance is stable, update every Branch Admin page to use:

useBranchWorkspaceScope()
useBranchTableRevision()
createLocal()
updateLocal()
softDeleteLocal()

Remove:

manual localStorage workspace resolution
unscoped Dexie reads
duplicate settings lookups
page-specific theme loading

Recommended first module batch:

Organizations
Students
Teachers
Parents
Classes
Subjects
Academic Structures
Assessment Structures
Class Subjects
Curriculum Setup
Phase 14 — Standardize Branch Admin media

All image-bearing pages must use:

saveImageAsset()
commitMediaAssetsToOwner()
useEntityMediaUrls()
softDeleteOwnerFieldAssets()

Rules:

no Base64
no direct Blob URL in entity rows
no loose media owner attachment
no duplicate page-wide media resolver

Media acceptance tests:

save image
reload
switch page
switch role
switch device
remove image
sync removal
Phase 15 — Rebuild remaining Branch Admin modules

Proceed in this order:

Academic setup
Enrollment
Assessment
Attendance
Scheduling
Communication
Reports
Finance
Dashboard

The dashboard must be rebuilt last so it consumes the exact selectors used by the destination pages.

Recommended delivery batches
Batch 1 — Scope and appearance foundation
appearanceScope.ts
applyScopedAppearance.ts
workspaceBootstrap.ts
settings-context.tsx
theme-context.tsx
Batch 2 — Role switching and first portal entry
active-membership-context.tsx
select-role/page.tsx
PortalAppearanceRuntime.tsx
providers.tsx
RolePortalShell.tsx
Batch 3 — Live Branch Settings propagation
Branchsettings.tsx
dataEvents.ts
syncEvents.ts
Batch 4 — Personal appearance separation
localPortalAppearance.ts
LocalAppearanceRuntime.tsx
LocalSettings.tsx
Batch 5 — Core Branch Admin modules
Organizations
Students
Teachers
Parents
Classes
Subjects
Academic Structures
Assessment Structures
Class Subjects
Curriculum Setup
Batch 6 — Remaining portal modules
Academic
Assessment
Attendance
Scheduling
Communication
Reports
Finance
Dashboard
Final success condition

The system is correct when all of these work:

Branch Admin selected
→ exact branch settings loaded
→ branch colour applied
→ branch portal opens

Branch Admin → Owner
→ branch appearance cleared
→ account/platform appearance applied
→ Owner opens with no branch styling

Owner → Branch Admin
→ cached branch appearance restored
→ Branch Admin opens with no default flash

Branch Settings colour saved
→ current branch portal changes immediately
→ other role scopes remain unaffected