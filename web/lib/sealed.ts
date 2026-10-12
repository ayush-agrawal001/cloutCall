"use client";

import { encodeAbiParameters, keccak256, toHex, type Address, type Hex } from "viem";
import { CHAIN_ID, MARKET_ADDRESS } from "./chain";
import { Side, type SideValue } from "./markets";
import { prfForNamespace } from "./mera";

/**
 * Sealed calls — a non-wallet key from the same passkey.
 *
 * The passkey PRF is evaluated under its own namespace salt, then HKDF turns that secret into a
 * non-extractable HMAC key. Each market's commit-reveal salt is HMAC(key, chain:contract:market).
 *
 * Derivation (not encryption) is the right tool here: there is no ciphertext to store or lose. The
 * pick is hidden on-chain behind a commitment, and the same passkey re-derives the salt on any
 * device, so a player can see and reveal their sealed call from a phone they never used before.
 */
export const SEALED_NAMESPACE = "cloutcall/sealed-calls/v1";
const HKDF_INFO = "cloutcall sealed-call salt key v1";

let unlocked: CryptoKey | null = null;

export function isSealedKeyUnlocked() {
  return unlocked !== null;
}

export function lockSealedKey() {
  unlocked = null;
}

/** Turns a namespace PRF output into the sealed-call HMAC key (pure; used directly in tests). */
export async function sealedKeyFromPrf(prf: Uint8Array): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey("raw", prf as BufferSource, "HKDF", false, ["deriveKey"]);
  prf.fill(0);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(HKDF_INFO) },
    ikm,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
}

/** One passkey prompt per session unlocks sealed calls. */
export async function unlockSealedKey(): Promise<CryptoKey> {
  if (unlocked) return unlocked;
  unlocked = await sealedKeyFromPrf(await prfForNamespace(SEALED_NAMESPACE));
  return unlocked;
}

async function hmac(key: CryptoKey, msg: string): Promise<Hex> {
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return toHex(new Uint8Array(sig));
}

export function saltFor(key: CryptoKey, marketId: bigint, chainId = CHAIN_ID, market: Address = MARKET_ADDRESS) {
  return hmac(key, `${chainId}:${market.toLowerCase()}:${marketId}`);
}

/** Short public fingerprint so a player can confirm two devices derive the same key. */
export async function sealedKeyFingerprint(key: CryptoKey) {
  return (await hmac(key, "fingerprint"))
    .slice(2, 14)
    .toUpperCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

/** Mirrors CloutMarket.sealedCommitment. */
export function commitmentFor(
  marketId: bigint,
  player: Address,
  side: SideValue,
  salt: Hex,
  chainId = CHAIN_ID,
  market: Address = MARKET_ADDRESS,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint8" },
        { type: "bytes32" },
      ],
      [BigInt(chainId), market, marketId, player, side, salt],
    ),
  );
}

/** Recovers which side a sealed commitment hides, using only the passkey-derived key. */
export async function openSealedCall(key: CryptoKey, marketId: bigint, player: Address, commitment: Hex) {
  const salt = await saltFor(key, marketId);
  for (const side of [Side.Yes, Side.No] as const) {
    if (commitmentFor(marketId, player, side, salt).toLowerCase() === commitment.toLowerCase()) return { side, salt };
  }
  return null;
}
