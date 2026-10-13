"use client";

import type { Address } from "viem";
import { CHAIN_ID } from "./chain";

/**
 * Keeps a player signed in across reloads without weakening the session scope.
 *
 *  - The signing session (the wallet key, its expiry and points budget) is kept only until the session
 *    expires. The key is encrypted with an AES-GCM key that is generated non-extractable and stored as a
 *    CryptoKey in IndexedDB, so the raw key never sits in storage and the wrapping key can't be read out.
 *  - Who is signed in (the public address and persona name) is remembered for a week. After the signing
 *    session expires the player still sees their account; their next call asks for the passkey again.
 *
 * Sign-out deletes both. Every storage call fails soft: blocked storage just means signing in again.
 */

const DB = "cloutcall";
const STORE = "session";
const WRAP_ID = "wrap";
const SESSION_ID = "current";
const ACCOUNT_KEY = "cloutcall.account.v1";
export const REMEMBER_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

export type SavedSessionInfo = { address: Address; expiresAt: number; budget: number; spent: number };
type SessionRecord = SavedSessionInfo & { chainId: number; iv: Uint8Array; ct: ArrayBuffer };
type Account = { chainId: number; address: Address; persona: string; until: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function wrapKey(): Promise<CryptoKey> {
  const existing = await tx<CryptoKey | undefined>("readonly", (s) => s.get(WRAP_ID));
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await tx("readwrite", (s) => s.put(key, WRAP_ID));
  return key;
}

/** Stores the session encrypted. Always zeroes `privateKey`, saved or not. */
export async function saveSession(privateKey: Uint8Array, info: SavedSessionInfo): Promise<void> {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await wrapKey(), privateKey as BufferSource);
    const record: SessionRecord = { ...info, chainId: CHAIN_ID, iv, ct };
    await tx("readwrite", (s) => s.put(record, SESSION_ID));
  } catch {
    /* no IndexedDB (private mode, blocked storage): the session just won't survive a reload */
  } finally {
    privateKey.fill(0);
  }
}

/** The saved session, if it's still valid for this network. The caller must zero `privateKey`. */
export async function loadSession(): Promise<{ privateKey: Uint8Array; info: SavedSessionInfo } | null> {
  try {
    const r = await tx<SessionRecord | undefined>("readonly", (s) => s.get(SESSION_ID));
    if (!r) return null;
    if (r.chainId !== CHAIN_ID || Date.now() >= r.expiresAt) {
      await clearSession();
      return null;
    }
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: r.iv as BufferSource }, await wrapKey(), r.ct);
    return {
      privateKey: new Uint8Array(plain),
      info: { address: r.address, expiresAt: r.expiresAt, budget: r.budget, spent: r.spent },
    };
  } catch {
    return null;
  }
}

/** Records points put at risk, so a reload can't reset the session budget. */
export async function updateSessionSpent(address: Address, spent: number): Promise<void> {
  try {
    const r = await tx<SessionRecord | undefined>("readonly", (s) => s.get(SESSION_ID));
    if (!r || r.address !== address) return;
    await tx("readwrite", (s) => s.put({ ...r, spent }, SESSION_ID));
  } catch {}
}

export async function clearSession(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(SESSION_ID));
  } catch {}
}

export function rememberAccount(address: Address, persona: string) {
  try {
    const a: Account = { chainId: CHAIN_ID, address, persona, until: Date.now() + REMEMBER_ACCOUNT_MS };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a));
  } catch {}
}

/** Who was signed in on this device, if it's recent and on this network. */
export function loadAccount(): Pick<Account, "address" | "persona"> | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Account;
    if (a.chainId !== CHAIN_ID || Date.now() >= a.until || !/^0x[0-9a-fA-F]{40}$/.test(a.address)) {
      localStorage.removeItem(ACCOUNT_KEY);
      return null;
    }
    return { address: a.address, persona: a.persona ?? "" };
  } catch {
    return null;
  }
}

export function forgetAccount() {
  try {
    localStorage.removeItem(ACCOUNT_KEY);
  } catch {}
}
