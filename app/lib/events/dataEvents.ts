/**
 * app/lib/events/dataEvents.ts
 * --------------------------------------------------------------------------
 * Selective application-wide data revision store.
 *
 * No event is published when changedTables is empty.
 * Listeners may subscribe by table and account.
 * Duplicate events are ignored by eventId.
 */

export type DataChangeSource =
  | "local-write"
  | "sync-pull-completed"
  | "sync-push-completed"
  | "cross-tab"
  | "manual"
  | "unknown";

export type DataChangeMetadata = {
  reason?: string;
  schoolId?: string | null;
  branchId?: string | null;
  localId?: string | null;
  scheduleSync?: boolean;
  [key: string]: unknown;
};

export type DataChangeEvent = {
  type: "DATA_CHANGED";
  eventId: string;
  revision: number;
  at: number;
  source: DataChangeSource;
  originTabId: string;
  accountId?: string | null;
  changedTables: string[];
  metadata?: DataChangeMetadata;
};

export type DataRevisionSelector = {
  accountId?: string | null;
  tables?: readonly string[];
};

type Listener = () => void;

const listeners = new Set<Listener>();
const seenEventIds = new Set<string>();
const tableRevisions = new Map<string, number>();
const accountTableRevisions = new Map<string, number>();

let globalRevision = 0;
let lastEvent: DataChangeEvent | null = null;

const MAX_SEEN_EVENT_IDS = 2000;

export function normalizeChangedTables(
  tables?: readonly string[] | null,
) {
  return [...new Set(
    (tables || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  )].sort();
}

function revisionKey(
  accountId: string | null | undefined,
  tableName: string,
) {
  return `${accountId || "*"}::${tableName}`;
}

function nextRevision(input?: number) {
  globalRevision = Math.max(
    globalRevision + 1,
    Number(input || 0),
    Date.now(),
  );
  return globalRevision;
}

function createEventId() {
  const cryptoApi =
    typeof globalThis !== "undefined"
      ? globalThis.crypto
      : undefined;

  if (cryptoApi && "randomUUID" in cryptoApi) {
    return cryptoApi.randomUUID();
  }

  return `data-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDataEventsTabId() {
  if (typeof window === "undefined") return "server";

  const key = "eleeveon_data_events_tab_id";

  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;

    const created =
      `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    window.sessionStorage.setItem(key, created);
    return created;
  } catch {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function rememberEventId(eventId: string) {
  seenEventIds.add(eventId);

  if (seenEventIds.size <= MAX_SEEN_EVENT_IDS) return;

  const oldest = seenEventIds.values().next().value;
  if (oldest) seenEventIds.delete(oldest);
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error("[data-events] listener failed", error);
    }
  }
}

function applyRevision(event: DataChangeEvent) {
  globalRevision = Math.max(globalRevision, event.revision);
  lastEvent = event;

  for (const tableName of event.changedTables) {
    tableRevisions.set(
      tableName,
      Math.max(tableRevisions.get(tableName) || 0, event.revision),
    );

    const key = revisionKey(event.accountId, tableName);

    accountTableRevisions.set(
      key,
      Math.max(accountTableRevisions.get(key) || 0, event.revision),
    );
  }
}

export function receiveDataEvent(
  input: DataChangeEvent,
): boolean {
  const changedTables =
    normalizeChangedTables(input?.changedTables);

  if (
    !input ||
    input.type !== "DATA_CHANGED" ||
    !input.eventId ||
    changedTables.length === 0 ||
    seenEventIds.has(input.eventId)
  ) {
    return false;
  }

  const event: DataChangeEvent = {
    ...input,
    changedTables,
    revision: nextRevision(input.revision),
    at: Number(input.at || Date.now()),
  };

  rememberEventId(event.eventId);
  applyRevision(event);
  notifyListeners();

  return true;
}

export function publishDataEvent(input: {
  source?: DataChangeSource;
  accountId?: string | null;
  changedTables?: readonly string[];
  eventId?: string;
  revision?: number;
  at?: number;
  originTabId?: string;
  metadata?: DataChangeMetadata;
}): DataChangeEvent | null {
  const changedTables =
    normalizeChangedTables(input.changedTables);

  if (changedTables.length === 0) return null;

  const event: DataChangeEvent = {
    type: "DATA_CHANGED",
    eventId: input.eventId || createEventId(),
    revision: nextRevision(input.revision),
    at: Number(input.at || Date.now()),
    source: input.source || "unknown",
    originTabId:
      input.originTabId || getDataEventsTabId(),
    accountId: input.accountId,
    changedTables,
    metadata: input.metadata,
  };

  return receiveDataEvent(event) ? event : null;
}

export function subscribeToDataRevision(
  listener: Listener,
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getServerDataRevisionSnapshot() {
  return 0;
}

export function getLastDataChangeEvent() {
  return lastEvent;
}

export function getDataRevisionSnapshot(
  selector?: DataRevisionSelector,
) {
  const tables =
    normalizeChangedTables(selector?.tables);

  if (tables.length === 0) {
    return globalRevision;
  }

  let revision = 0;

  for (const tableName of tables) {
    const tableRevision =
      selector?.accountId
        ? Math.max(
            accountTableRevisions.get(
              revisionKey(selector.accountId, tableName),
            ) || 0,
            accountTableRevisions.get(
              revisionKey(null, tableName),
            ) || 0,
          )
        : tableRevisions.get(tableName) || 0;

    revision = Math.max(revision, tableRevision);
  }

  return revision;
}


export function dataEventIncludesTable(
  event: DataChangeEvent | null | undefined,
  tableName: string,
) {
  if (!event) return false;

  const expected =
    String(tableName || "").trim();

  if (!expected) return false;

  return event.changedTables.includes(expected);
}

export function resetDataEventsStore() {
  globalRevision = 0;
  lastEvent = null;
  tableRevisions.clear();
  accountTableRevisions.clear();
  seenEventIds.clear();
  notifyListeners();
}