"use client";

import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/**
 * One passkey, many keys.
 *
 * The passkey's WebAuthn PRF is evaluated under separate, versioned salts ("namespaces"). Each
 * namespace yields an unrelated 32-byte secret, so compromising one use never exposes another:
 *
 *   wallet        default mera salt → BIP-39 → m/44'/60'/0'/0/0   (Monad EOA, MetaMask-compatible)
 *   sealed-calls  sha256("cloutcall/sealed-calls/v1")           (HMAC key for commit-reveal salts)
 *
 * Nothing secret is ever persisted: only the credential id and transports live in localStorage, and
 * every key is re-derived from the passkey on demand, on any device that has the passkey synced.
 */

const CREDENTIAL_KEY = "cloutcall.credential.v1";

export const WALLET_PATH = "m/44'/60'/0'/0/0";

export function rpId() {
  return window.location.hostname;
}

export function loadCredential(): PasskeyCredentialMetadata | undefined {
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY);
    return raw ? (JSON.parse(raw) as PasskeyCredentialMetadata) : undefined;
  } catch {
    return undefined;
  }
}

function saveCredential(c: PasskeyCredentialMetadata) {
  try {
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify({ credentialId: c.credentialId, transports: c.transports }));
  } catch {
    /* private mode: the passkey still works via the discoverable prompt */
  }
}

export function forgetCredential() {
  try {
    localStorage.removeItem(CREDENTIAL_KEY);
  } catch {}
}

/** BIP-39/BIP-44 derivation from the PRF output (same as the mera guide, MetaMask-compatible). */
export function deriveEvmPrivateKey(prfOutput: Uint8Array, path = WALLET_PATH): Uint8Array {
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const key = HDKey.fromMasterSeed(seed).derive(path).privateKey;
  seed.fill(0);
  if (!key) throw new Error("derivation failed");
  return key;
}

function sessionFromPrf(prfOutput: Uint8Array): Secp256k1SigningSession {
  const privateKey = deriveEvmPrivateKey(prfOutput);
  try {
    return createSecp256k1SigningSession({ privateKey });
  } finally {
    privateKey.fill(0);
    prfOutput.fill(0);
  }
}

/** First visit: create a passkey (one Face ID / Touch ID prompt) and open a signing session. */
export async function createAccount(handle: string) {
  const res = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "CloutCall" },
    user: { name: handle, displayName: handle },
  });
  saveCredential(res);
  return { session: sessionFromPrf(new Uint8Array(res.prfOutput)), credentialId: res.credentialId };
}

/** Returning visit: one passkey prompt rebuilds the exact same account, on any device. */
export async function signIn() {
  const credential = loadCredential();
  const res = await getPasskeyPrfOutput({ rpId: rpId(), credential });
  saveCredential({ credentialId: res.credentialId, transports: credential?.transports });
  return { session: sessionFromPrf(new Uint8Array(res.prfOutput)), credentialId: res.credentialId };
}

export async function sha256(bytes: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

/** Evaluate the passkey PRF under a dedicated namespace salt. */
export async function prfForNamespace(namespace: string) {
  const prfSalt = await sha256(new TextEncoder().encode(namespace));
  const res = await getPasskeyPrfOutput({ rpId: rpId(), credential: loadCredential(), prfSalt });
  return new Uint8Array(res.prfOutput);
}

export function describeMeraError(e: unknown): string {
  if (isMeraError(e)) {
    switch (e.code) {
      case "PRF_UNAVAILABLE":
        return "This passkey provider doesn't support PRF. Use iCloud Keychain (Safari/iOS), Google Password Manager (Chrome/Android) or 1Password.";
      case "PASSKEY_OPERATION_FAILED":
        return "Passkey prompt was cancelled or failed. Try again.";
      case "CRYPTO_UNAVAILABLE":
        return "Passkeys need a secure (https) page.";
      case "SESSION_ENDED":
        return "Your session ended. Sign in again with your passkey.";
      default:
        return e.message;
    }
  }
  return e instanceof Error ? e.message : String(e);
}
