/** Eleeveon Independent: encrypted archive format v1. No secrets are stored in the file. */
export type Encoded = unknown;
export type TableArchive = { name: string; keyPath: string | string[] | null; autoIncrement: boolean; rows: { key: Encoded; value: Encoded }[] };
export type SchoolArchive = {
  format: "eleeveon-independent-snapshot";
  version: 1;
  createdAt: string;
  database: string;
  indexedDBVersion: number;
  tables: TableArchive[];
  notes: string[];
};
export type EncryptedArchive = {
  format: "eleeveon-independent-encrypted";
  version: 1;
  cipher: "AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  payload: string;
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 310_000;
const b64 = (bytes: Uint8Array): string => {
  let result = "";
  for (let i = 0; i < bytes.length; i += 0x8000) result += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(result);
};
const unb64 = (text: string): Uint8Array => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const bytesOf = (v: ArrayBuffer | ArrayBufferView): Uint8Array => v instanceof ArrayBuffer
  ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);

/** This codec preserves Blob/Date/binary types otherwise destroyed by JSON.stringify. */
export async function encodeIDB(value: unknown, seen = new WeakSet<object>()): Promise<Encoded> {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "undefined") return { __eleeveonType: "undefined" };
  if (typeof value === "bigint") return { __eleeveonType: "bigint", value: String(value) };
  if (typeof value !== "object") throw new Error(`Cannot archive value of type ${typeof value}`);
  if (seen.has(value)) throw new Error("Circular IndexedDB record cannot be safely archived");
  if (value instanceof Date) return { __eleeveonType: "date", value: value.toISOString() };
  if (value instanceof Blob) return { __eleeveonType: "blob", mime: value.type, data: b64(new Uint8Array(await value.arrayBuffer())) };
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const view = bytesOf(value as ArrayBuffer | ArrayBufferView);
    return { __eleeveonType: "bytes", ctor: value instanceof ArrayBuffer ? "ArrayBuffer" : value.constructor.name, data: b64(view) };
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) return await Promise.all(value.map(v => encodeIDB(v, seen)));
    if (value instanceof Map) return { __eleeveonType: "map", entries: await Promise.all([...value].map(async ([k,v]) => [await encodeIDB(k, seen), await encodeIDB(v, seen)])) };
    if (value instanceof Set) return { __eleeveonType: "set", values: await Promise.all([...value].map(v => encodeIDB(v, seen))) };
    const out: Record<string, Encoded> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "__eleeveonType") throw new Error("Reserved archive property in record");
      out[k] = await encodeIDB(v, seen);
    }
    return out;
  } finally { seen.delete(value); }
}

async function keyFromPassphrase(passphrase: string, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  if (passphrase.length < 12) throw new Error("Backup passphrase must contain at least 12 characters");
  const raw = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS }, raw, { name: "AES-GCM", length: 256 }, false, [usage]);
}
export async function encryptSchoolArchive(snapshot: SchoolArchive, passphrase: string): Promise<EncryptedArchive> {
  if (!crypto?.subtle) throw new Error("Secure WebCrypto is required for encrypted backups");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPassphrase(passphrase, salt, "encrypt");
  const plaintext = encoder.encode(JSON.stringify(snapshot));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { format: "eleeveon-independent-encrypted", version: 1, cipher: "AES-256-GCM", kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), payload: b64(new Uint8Array(encrypted)) };
}
export async function decryptSchoolArchive(archive: EncryptedArchive, passphrase: string): Promise<SchoolArchive> {
  if (archive?.format !== "eleeveon-independent-encrypted" || archive.version !== 1 || archive.iterations !== ITERATIONS) throw new Error("Unsupported Eleeveon encrypted backup format");
  const key = await keyFromPassphrase(passphrase, unb64(archive.salt), "decrypt");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(archive.iv) }, key, unb64(archive.payload));
  const snapshot = JSON.parse(decoder.decode(plaintext)) as SchoolArchive;
  if (snapshot.format !== "eleeveon-independent-snapshot" || snapshot.version !== 1 || !Array.isArray(snapshot.tables)) throw new Error("Invalid decrypted school archive");
  return snapshot;
}
