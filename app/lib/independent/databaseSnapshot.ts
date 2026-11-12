import { encodeIDB, type SchoolArchive, type TableArchive } from "./archive";

function requestResult<T>(req: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error || new Error("IndexedDB read failed")); }); }
function transactionFinished(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error || new Error("IndexedDB snapshot aborted")); tx.onerror = () => reject(tx.error || new Error("IndexedDB snapshot failed")); }); }

/** Reads all stores from ONE readonly IndexedDB transaction, then serializes after transaction close. */
export async function captureSchoolDatabase(databaseName: string): Promise<SchoolArchive> {
  if (!databaseName || !indexedDB) throw new Error("A local IndexedDB database is required");
  if (typeof indexedDB.databases === "function") {
    const known = await indexedDB.databases();
    if (!known.some(db => db.name === databaseName)) throw new Error("Local school database does not exist");
  }
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(databaseName);
    req.onupgradeneeded = () => { req.transaction?.abort(); reject(new Error("Refusing to create a missing school database")); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Unable to open local school database"));
    req.onblocked = () => reject(new Error("Database is blocked by another session"));
  });
  try {
    const names = Array.from(db.objectStoreNames);
    if (!names.length) throw new Error("Cannot back up an empty database schema");
    const tx = db.transaction(names, "readonly");
    const done = transactionFinished(tx);
    const reads = names.map(async name => {
      const store = tx.objectStore(name);
      const [keys, values] = await Promise.all([requestResult(store.getAllKeys()), requestResult(store.getAll())]);
      if (keys.length !== values.length) throw new Error(`Inconsistent snapshot in ${name}`);
      return { name, keyPath: store.keyPath, autoIncrement: store.autoIncrement, keys, values };
    });
    const raw = await Promise.all(reads);
    await done;
    const tables: TableArchive[] = [];
    for (const table of raw) {
      const rows = [];
      for (let i = 0; i < table.keys.length; i++) rows.push({ key: await encodeIDB(table.keys[i]), value: await encodeIDB(table.values[i]) });
      tables.push({ name: table.name, keyPath: table.keyPath, autoIncrement: table.autoIncrement, rows });
    }
    return { format: "eleeveon-independent-snapshot", version: 1, createdAt: new Date().toISOString(), database: databaseName, indexedDBVersion: db.version, tables,
      notes: ["Full local IndexedDB store snapshot including mediaBlobs if stored in IndexedDB", "Does not include external native files or uploaded server-only media", "Restore requires separate validated restore workflow"] };
  } finally { db.close(); }
}
