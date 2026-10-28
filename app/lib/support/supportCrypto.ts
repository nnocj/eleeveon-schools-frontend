"use client";
/**
 * EXPERIMENTAL E2EE v1. WebCrypto P-256 ECDH/HKDF/AES-256-GCM, ECDSA P-256 signatures.
 * Not a Double Ratchet/Signal implementation. No perfect forward secrecy; independent
 * device-fingerprint verification remains essential. Never fall back to plaintext.
 */
export const ENCRYPTED_PREFIX = "ELEEVEON_E2EE_V1:";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const STORE_NAME = "eleeveon-support-keys-v1";
const KEY_STORE = "deviceKeys";

export type PublicSupportDevice = {
  id: string;
  userId: string;
  accountId: string;
  encryptionPublicJwk: JsonWebKey;
  signingPublicJwk: JsonWebKey;
  fingerprint: string;
};
type StoredDevice = { id: string; accountId: string; userId: string; encryptionKey: CryptoKeyPair; signingKey: CryptoKeyPair };
export type SupportAttachmentManifest = {
  name: string; mimeType: string; kind: "image" | "audio" | "video" | "document";
  sizeBytes: number; key: string; iv: string;
};
export type ClearSupportPayload = { body: string; subject?: string; attachment?: SupportAttachmentManifest };
type Envelope = {
  v: 1; conversationId: string; messageId: string; fromDeviceId: string;
  iv: string; ciphertext: string;
  keys: { deviceId: string; publicKey: JsonWebKey; salt: string; iv: string; ciphertext: string }[];
  signature: string;
};

function requireCrypto() {
  if (typeof crypto === "undefined" || !crypto.subtle || typeof indexedDB === "undefined") {
    throw new Error("Encrypted chat needs WebCrypto and IndexedDB on a secure HTTPS connection.");
  }
}
function bytes(buffer: ArrayBuffer | Uint8Array): Uint8Array {
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
}
function b64(input: ArrayBuffer | Uint8Array): string {
  const source = bytes(input);
  let str = "";
  for (let i = 0; i < source.length; i += 4096) str += String.fromCharCode(...source.subarray(i, i + 4096));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function un64(input: string): Uint8Array {
  const str = atob(input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - input.length % 4) % 4));
  return Uint8Array.from(str, char => char.charCodeAt(0));
}
function encoded(input: string) { return encoder.encode(input); }
function rand(n: number) { return crypto.getRandomValues(new Uint8Array(n)); }
function toBuf(array: Uint8Array): ArrayBuffer { return array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength) as ArrayBuffer; }

function openDatabase(): Promise<IDBDatabase> {
  requireCrypto();
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORE_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(KEY_STORE)) req.result.createObjectStore(KEY_STORE, { keyPath: "id" }); };
    req.onerror = () => reject(req.error || new Error("Private key storage failed"));
    req.onsuccess = () => resolve(req.result);
  });
}
async function retrieve(id: string): Promise<StoredDevice | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(KEY_STORE, "readonly").objectStore(KEY_STORE).get(id);
      req.onsuccess = () => resolve(req.result as StoredDevice | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}
async function persist(data: StoredDevice): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KEY_STORE, "readwrite");
      tx.objectStore(KEY_STORE).put(data);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function deviceFingerprint(encryption: JsonWebKey, signing: JsonWebKey): Promise<string> {
  requireCrypto();
  const material = `${encryption.x}.${encryption.y}|${signing.x}.${signing.y}`;
  const hash = bytes(await crypto.subtle.digest("SHA-256", encoded(material)));
  return Array.from(hash.slice(0, 16), item => item.toString(16).padStart(2, "0")).join("").match(/.{1,4}/g)!.join(" ").toUpperCase();
}
const inFlightDevices = new Map<string, Promise<StoredDevice>>();
export async function ensureOwnDevice(accountId: string, userId: string) {
  requireCrypto();
  if (!accountId || !userId) throw new Error("Sign in before enabling encrypted support.");
  const operation = `${accountId}:${userId}`;
  const running = inFlightDevices.get(operation);
  if (running) return running;
  const task = (async () => {
    const ref = `eleeveon-support-device:${accountId}:${userId}`;
    let id = localStorage.getItem(ref);
    if (id) {
      const existing = await retrieve(id);
      if (existing?.accountId === accountId && existing.userId === userId) return existing;
      // IMPORTANT: never silently generate replacement keys for an existing device identifier.
      throw new Error("Your local encryption keys are missing. Chat history on this device cannot be recovered. Use a previously enrolled device or explicitly reset your device enrollment.");
    }
    const encryptionKey = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const signingKey = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    id = crypto.randomUUID();
    const data: StoredDevice = { id, accountId, userId, encryptionKey, signingKey };
    await persist(data);
    localStorage.setItem(ref, id);
    return data;
  })();
  inFlightDevices.set(operation, task);
  try { return await task; } finally { inFlightDevices.delete(operation); }
}
export async function ownPublicDevice(accountId: string, userId: string) {
  const own = await ensureOwnDevice(accountId, userId);
  const [encryptionPublicJwk, signingPublicJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", own.encryptionKey.publicKey),
    crypto.subtle.exportKey("jwk", own.signingKey.publicKey),
  ]);
  return { id: own.id, encryptionPublicJwk, signingPublicJwk, fingerprint: await deviceFingerprint(encryptionPublicJwk, signingPublicJwk) };
}
async function deriveWrap(key: CryptoKey, peer: CryptoKey, salt: Uint8Array, context: string) {
  const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, key, 256);
  const hkdf = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: toBuf(salt), info: encoded(`eleeveon-support-v1|${context}`) }, hkdf, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encryptPayload(accountId: string, userId: string, conversationId: string, messageId: string, data: ClearSupportPayload, recipients: PublicSupportDevice[]) {
  const sender = await ensureOwnDevice(accountId, userId);
  const distinct = [...new Map(recipients.map(r => [r.id, r])).values()];
  if (!distinct.some(r => r.id === sender.id)) throw new Error("Your device is missing from the recipient key directory. Reload encryption keys.");
  if (!distinct.some(r => r.userId !== userId)) throw new Error("No other participant has enrolled an encryption key yet. Ask Eleeveon support to enable encrypted chat.");
  const keyRaw = rand(32);
  const contentKey = await crypto.subtle.importKey("raw", toBuf(keyRaw), "AES-GCM", false, ["encrypt"]);
  const iv = rand(12);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toBuf(iv), additionalData: encoded(`${conversationId}|${messageId}`), tagLength: 128 }, contentKey, encoded(JSON.stringify(data)));
  const keys: Envelope["keys"] = [];
  for (const recipient of distinct) {
    const peer = await crypto.subtle.importKey("jwk", recipient.encryptionPublicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const salt = rand(32);
    const wrapIv = rand(12);
    const wrapKey = await deriveWrap(ephemeral.privateKey, peer, salt, `${conversationId}|${messageId}|${recipient.id}`);
    const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toBuf(wrapIv), tagLength: 128 }, wrapKey, toBuf(keyRaw));
    keys.push({ deviceId: recipient.id, publicKey: await crypto.subtle.exportKey("jwk", ephemeral.publicKey), salt: b64(salt), iv: b64(wrapIv), ciphertext: b64(wrapped) });
  }
  const unsigned = { v: 1 as const, conversationId, messageId, fromDeviceId: sender.id, iv: b64(iv), ciphertext: b64(cipher), keys };
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, sender.signingKey.privateKey, encoded(JSON.stringify(unsigned)));
  return ENCRYPTED_PREFIX + b64(encoded(JSON.stringify({ ...unsigned, signature: b64(signature) })));
}
export function encryptedEnvelope(value: string) { return value.startsWith(ENCRYPTED_PREFIX); }
export function parseEnvelope(value: string): Envelope {
  if (!encryptedEnvelope(value)) throw new Error("This message is not end-to-end encrypted.");
  let envelope: Envelope;
  try { envelope = JSON.parse(decoder.decode(un64(value.slice(ENCRYPTED_PREFIX.length)))); }
  catch { throw new Error("Invalid encrypted message format."); }
  if (envelope.v !== 1 || !Array.isArray(envelope.keys) || !envelope.signature || !envelope.fromDeviceId) throw new Error("Unsupported or damaged encrypted message.");
  return envelope;
}
export async function decryptPayload(accountId: string, userId: string, conversationId: string, messageId: string, value: string, known: PublicSupportDevice[], historyKey?: SupportHistoryKeyRecord) {
  const own = await ensureOwnDevice(accountId, userId);
  const envelope = parseEnvelope(value);
  if (envelope.conversationId !== conversationId || envelope.messageId !== messageId) throw new Error("Encrypted message identity does not match.");
  const origin = known.find(item => item.id === envelope.fromDeviceId);
  if (!origin) throw new Error("The sender's device key is unknown or was removed. Verify the sender before viewing this message.");
  const verificationKey = await crypto.subtle.importKey("jwk", origin.signingPublicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const { signature, ...unsigned } = envelope;
  const authentic = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verificationKey, toBuf(un64(signature)), encoded(JSON.stringify(unsigned)));
  if (!authentic) throw new Error("Sender signature verification failed. The message may have been tampered with.");
  const keyEnvelope = envelope.keys.find(item => item.deviceId === own.id);
  let rawKey: ArrayBuffer;
  if (keyEnvelope) {
    const ephemeral = await crypto.subtle.importKey("jwk", keyEnvelope.publicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const wrapKey = await deriveWrap(own.encryptionKey.privateKey, ephemeral, un64(keyEnvelope.salt), `${conversationId}|${messageId}|${own.id}`);
    rawKey = await crypto.subtle.decrypt({ name: "AES-GCM", iv: toBuf(un64(keyEnvelope.iv)), tagLength: 128 }, wrapKey, toBuf(un64(keyEnvelope.ciphertext)));
  } else if (historyKey) {
    rawKey = await historicalContentKey(accountId, userId, conversationId, messageId, historyKey, known);
  } else {
    throw new Error("This historical message needs key transfer from your original device.");
  }
  const contentKey = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: toBuf(un64(envelope.iv)), additionalData: encoded(`${conversationId}|${messageId}`), tagLength: 128 }, contentKey, toBuf(un64(envelope.ciphertext)));
  return JSON.parse(decoder.decode(clear)) as ClearSupportPayload;
}
export async function encryptAttachment(conversationId: string, messageId: string, file: File): Promise<{ file: File; manifest: SupportAttachmentManifest }> {
  requireCrypto();
  const keyRaw = rand(32); const iv = rand(12);
  const key = await crypto.subtle.importKey("raw", toBuf(keyRaw), "AES-GCM", false, ["encrypt"]);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toBuf(iv), additionalData: encoded(`${conversationId}|${messageId}|attachment`) }, key, await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const kind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : mimeType.startsWith("audio/") ? "audio" : "document";
  return { file: new File([cipher], "encrypted.bin", { type: "application/octet-stream" }), manifest: { name: file.name, mimeType, kind, sizeBytes: file.size, key: b64(keyRaw), iv: b64(iv) } };
}
export async function decryptAttachment(conversationId: string, messageId: string, url: string, manifest: SupportAttachmentManifest): Promise<string> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not download the encrypted attachment.");
  const blob = await response.arrayBuffer();
  if (blob.byteLength > 101 * 1024 * 1024) throw new Error("This encrypted file exceeds the 100 MB demonstration limit. Download a smaller video.");
  const key = await crypto.subtle.importKey("raw", toBuf(un64(manifest.key)), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: toBuf(un64(manifest.iv)), additionalData: encoded(`${conversationId}|${messageId}|attachment`) }, key, blob);
  // Documents are served for download only, not interpreted as HTML/script.
  return URL.createObjectURL(new Blob([plain], { type: manifest.kind === "document" ? "application/octet-stream" : manifest.mimeType }));
}
export function readTrust(accountId: string, userId: string): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(`eleeveon-support-trust:${accountId}:${userId}`) || "{}"); } catch { return {}; }
}
export function saveTrust(accountId: string, userId: string, devices: PublicSupportDevice[]) {
  if (typeof localStorage === "undefined") throw new Error("Cannot store trusted fingerprints on this device.");
  const previous = readTrust(accountId, userId);
  for (const device of devices) previous[device.id] = device.fingerprint;
  localStorage.setItem(`eleeveon-support-trust:${accountId}:${userId}`, JSON.stringify(previous));
}

/** A server-relayed, signed rewrap of ONE historical symmetric message key. */
export type SupportHistoryKeyRecord = {
  linkId: string;
  messageId: string;
  sourceDeviceId: string;
  wrappedKey: {
    v: 1;
    algorithm: "ECDH-P256-AES-GCM";
    ephemeralPublicJwk: JsonWebKey;
    iv: string;
    ciphertext: string;
  };
  signature: string;
};

const HISTORY_AAD = (conversationId: string, messageId: string, deviceId: string) =>
  `eleeveon-hub-history-v1|${conversationId}|${messageId}|${deviceId}`;

/** Deterministic, domain-separated HKDF salt so wrapping needs no additional public metadata. */
async function historyWrapKey(secret: CryptoKey, peer: CryptoKey, conversationId: string, messageId: string, targetId: string): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, secret, 256);
  const hkdf = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const salt = await crypto.subtle.digest("SHA-256", encoded(HISTORY_AAD(conversationId, messageId, targetId)));
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: encoded("eleeveon-hub-history-content-key-v1") },
    hkdf, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Authenticate the ORIGINAL sender before transferring or using a message key. */
async function checkedEnvelope(value: string, conversationId: string, messageId: string, known: PublicSupportDevice[]): Promise<Envelope> {
  const envelope = parseEnvelope(value);
  if (envelope.conversationId !== conversationId || envelope.messageId !== messageId) throw new Error("Encrypted message identity mismatch.");
  const sender = known.find(d => d.id === envelope.fromDeviceId);
  if (!sender) throw new Error("The message signer is not available in the device directory.");
  const key = await crypto.subtle.importKey("jwk", sender.signingPublicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const { signature, ...unsigned } = envelope;
  if (!await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, toBuf(un64(signature)), encoded(JSON.stringify(unsigned))))
    throw new Error("Original message signature is invalid.");
  return envelope;
}

async function originalContentKey(accountId: string, userId: string, conversationId: string, messageId: string, envelope: Envelope): Promise<ArrayBuffer> {
  const own = await ensureOwnDevice(accountId, userId);
  const wrap = envelope.keys.find(e => e.deviceId === own.id);
  if (!wrap) throw new Error("This trusted device cannot decrypt the historical message key.");
  const ephemeral = await crypto.subtle.importKey("jwk", wrap.publicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const aes = await deriveWrap(own.encryptionKey.privateKey, ephemeral, un64(wrap.salt), `${conversationId}|${messageId}|${own.id}`);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: toBuf(un64(wrap.iv)), tagLength: 128 }, aes, toBuf(un64(wrap.ciphertext)));
}

export async function signHubDeviceProof(accountId: string, userId: string, value: string): Promise<string> {
  const own = await ensureOwnDevice(accountId, userId);
  return b64(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, own.signingKey.privateKey, encoded(value)));
}

/** Run on the APPROVING source device, one message at a time. Never send rawKey to the server. */
export async function makeHistoricalKeyTransfer(accountId: string, userId: string, linkId: string,
  conversationId: string, messageId: string, ciphertext: string,
  devices: PublicSupportDevice[], target: PublicSupportDevice) {
  const own = await ensureOwnDevice(accountId, userId);
  if (own.id === target.id || target.userId !== userId || target.accountId !== accountId)
    throw new Error("The target is not another device for this signed-in user.");
  const signerId = parseEnvelope(ciphertext).fromDeviceId;
  const signer = devices.find(d => d.id === signerId);
  if (!signer || readTrust(accountId,userId)[signerId] !== signer.fingerprint)
    throw new Error("The original sender fingerprint has not been verified.");
  const original = await checkedEnvelope(ciphertext, conversationId, messageId, devices);
  const raw = await originalContentKey(accountId, userId, conversationId, messageId, original);
  const peer = await crypto.subtle.importKey("jwk", target.encryptionPublicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const wrap = await historyWrapKey(ephemeral.privateKey, peer, conversationId, messageId, target.id);
  const iv = rand(12);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toBuf(iv), additionalData: encoded(HISTORY_AAD(conversationId, messageId, target.id)), tagLength: 128 }, wrap, raw);
  const wrappedKey = { v: 1 as const, algorithm: "ECDH-P256-AES-GCM" as const,
    ephemeralPublicJwk: await crypto.subtle.exportKey("jwk", ephemeral.publicKey), iv: b64(iv), ciphertext: b64(wrapped) };
  const signedItem = JSON.stringify({ v: 1, linkId, sourceDeviceId: own.id, targetDeviceId: target.id,
    conversationId, messageId, wrappedKey });
  const signature = await signHubDeviceProof(accountId, userId, signedItem);
  return { conversationId, messageId, wrappedKey, signature };
}

/** Run on the NEW device. Require pinned identity and the backend's signed record. */
async function historicalContentKey(accountId: string, userId: string, conversationId: string,
  messageId: string, record: SupportHistoryKeyRecord, known: PublicSupportDevice[]): Promise<ArrayBuffer> {
  const own = await ensureOwnDevice(accountId, userId);
  const source = known.find(d => d.id === record.sourceDeviceId);
  if (!source || readTrust(accountId, userId)[source.id] !== source.fingerprint)
    throw new Error("Verify your original device fingerprint in Hub Settings to unlock this message.");
  if (record.messageId !== messageId || record.wrappedKey.v !== 1 || record.wrappedKey.algorithm !== "ECDH-P256-AES-GCM")
    throw new Error("Invalid historical key record.");
  const signedItem = JSON.stringify({ v: 1, linkId: record.linkId, sourceDeviceId: record.sourceDeviceId,
    targetDeviceId: own.id, conversationId, messageId, wrappedKey: record.wrappedKey });
  const signer = await crypto.subtle.importKey("jwk", source.signingPublicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, signer,
    toBuf(un64(record.signature)), encoded(signedItem));
  if (!valid) throw new Error("Historical key signature verification failed.");
  const ephemeral = await crypto.subtle.importKey("jwk", record.wrappedKey.ephemeralPublicJwk,
    { name: "ECDH", namedCurve: "P-256" }, false, []);
  const wrap = await historyWrapKey(own.encryptionKey.privateKey, ephemeral, conversationId, messageId, own.id);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: toBuf(un64(record.wrappedKey.iv)),
    additionalData: encoded(HISTORY_AAD(conversationId, messageId, own.id)), tagLength: 128 },
    wrap, toBuf(un64(record.wrappedKey.ciphertext)));
}
