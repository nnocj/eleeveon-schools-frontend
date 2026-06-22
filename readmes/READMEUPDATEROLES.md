# Role Portal First Files

Drop these files into your `app/` folder.

What is included:

- `app/components/role-portals/RolePortalShell.tsx`
- `app/developer/page.tsx` and modules
- `app/school-admin/page.tsx` and modules
- `app/branch-admin/page.tsx` and modules
- `app/accountant/page.tsx` and modules
- `app/teacher/page.tsx` and modules
- `app/student/page.tsx` and modules
- `app/parent/page.tsx` and modules
- updated `app/lib/auth/roleRedirect.ts` with `developer` role support

These files preserve the mobile-first shell style of your old dashboard, but they do not import from `app/dashboard/*`.

The module files are safe first-stage placeholders. Replace each placeholder module later with the real role-limited implementation.
