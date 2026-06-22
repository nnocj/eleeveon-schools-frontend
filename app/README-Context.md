# Eleeveon Schools Context Upgrade

Drop this `context` folder into `app/context`.

What changed:
- Kept existing provider/hook names stable.
- AccountProvider now clears local storage safely and handles missing `/auth/me` account payload more gracefully.
- ActiveMembershipProvider now normalizes `teacherLocalId`, `studentLocalId`, and `parentLocalId` to numbers to prevent `string | number | null` TypeScript errors.
- SyncBootstrapProvider now remains backward-compatible while exposing extra state for the upgraded sync platform: conflicts, device registration, and platform-cache refresh status.
- Settings, ActiveBranch, and Theme providers are preserved to avoid breaking current pages.

Recommended provider order:
```tsx
<AccountProvider>
  <SettingsProvider>
    <ActiveBranchProvider>
      <ActiveMembershipProvider>
        <SyncBootstrapProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </SyncBootstrapProvider>
      </ActiveMembershipProvider>
    </ActiveBranchProvider>
  </SettingsProvider>
</AccountProvider>
```

If your current layout already has a working order, keep it unless you see a provider dependency error.
