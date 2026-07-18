# Eleeveon Schools Phase 6 + 7 Reactive Module Upgrade

- 49 data-loading modules upgraded.
- 58 presentation/template TSX files preserved unchanged because they do not own Dexie loading.
- UI, CRUD, filters, media behavior, printing, reports, finance logic, and styles remain in their original files.

Copy the `app/` tree over your frontend `app/` tree.

The new global observer is created once per browser tab. Each upgraded module
adds `dataRevision` to its existing load effect dependency list.

See `reactive-upgrade-report.json` for the exact modified file list.
