# Required integration with Phase 5 sync

The modules are already reactive to Dexie itself, so pullSync writes will cause
visible updates without a manual refresh. The event helpers also support precise
notifications from synchronization and local-write utilities.

Recommended additions:

## pullSync.ts
After a fully completed pull, call:

```ts
publishSyncPullCompleted({
  accountId,
  changedTables: Array.from(changedTables),
});
```

## pushSync.ts
After a successful push, call:

```ts
publishSyncPushCompleted({ accountId });
```

## syncUtils.ts
After createLocal/updateLocal/softDeleteLocal succeeds, call:

```ts
publishLocalWrite({
  accountId: record.accountId,
  changedTables: [tableName],
});
```

These calls improve table-specific diagnostics and cross-tab timing, but the
single global Dexie observer already makes this ZIP functional after copy.
