// ======================================================
// FILE 1: app/lib/server/accountProfileStore.ts
// ======================================================

import { promises as fs } from "fs";
import path from "path";

export type AccountProfile = {
  accountId: string;
  ownerName: string;
  businessName: string;
  phone: string;
  email: string;
  address: string;
  createdAt: number;
  updatedAt: number;
};

type ProfileMap = Record<string, AccountProfile>;

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "account-profiles.json");

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({}, null, 2), "utf8");
  }
}

async function readStore(): Promise<ProfileMap> {
  await ensureStore();

  const raw = await fs.readFile(DATA_FILE, "utf8");

  try {
    return JSON.parse(raw || "{}") as ProfileMap;
  } catch {
    return {};
  }
}

async function writeStore(data: ProfileMap) {
  await ensureStore();
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function getAccountProfile(accountId: string) {
  const store = await readStore();
  return store[accountId] || null;
}

export async function upsertAccountProfile(
  accountId: string,
  patch: Partial<Omit<AccountProfile, "accountId" | "createdAt" | "updatedAt">>
) {
  const store = await readStore();
  const now = Date.now();
  const existing = store[accountId];

  const profile: AccountProfile = {
    accountId,
    ownerName: patch.ownerName?.trim() || existing?.ownerName || "",
    businessName: patch.businessName?.trim() || existing?.businessName || "",
    phone: patch.phone?.trim() || existing?.phone || "",
    email: patch.email?.trim() || existing?.email || "",
    address: patch.address?.trim() || existing?.address || "",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  store[accountId] = profile;
  await writeStore(store);

  return profile;
}


