# Eleeveon Developer Portal Upgrade Notes

This package preserves the uploaded `app/developer` structure and keeps all existing module file names.

## Preserved
- `page.tsx` route keys and module imports
- All existing major modules
- Legacy alias files such as `Datahealth.tsx`, `Errorlogs.tsx`, `Supporttickets.tsx`, `Syncdiagnostics.tsx`

## Upgraded
- Developer page copy and navigation labels for clearer layman-friendly wording
- Allowed roles now include `developer` and `platform_team`
- Legacy alias files are now full wrapper components, not one-line placeholders
- Added `developerPlatformEndpoints.ts` as a central endpoint map for the upgraded platform schema

## Design intent
The original large module implementations were preserved to avoid losing working UI and logic.
This package is therefore intentionally close in size to the submitted developer folder, not a thin rewrite.
