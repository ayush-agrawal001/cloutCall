/** Unit tests for sealed-call salts and commitments (run: npx tsx --test tests/sealed.test.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address } from "viem";
import { Side } from "../lib/markets";
import { commitmentFor, legacySaltFor, openSealedCall, saltFor, sealedKeyFromPrf } from "../lib/sealed";

const CHAIN = 10143;
const MARKET: Address = "0x604044904e1cC70FC9CcD7c19d36E046367c08ee";
const MAIN: Address = "0x1111111111111111111111111111111111111111";
const PERSONA: Address = "0x2222222222222222222222222222222222222222";
const prf = new Uint8Array(32).fill(7);
const key = () => sealedKeyFromPrf(new Uint8Array(prf));

test("two personas of one passkey derive different salts on the same market", async () => {
  const k = await key();
  const a = await saltFor(k, 5n, MAIN, CHAIN, MARKET);
  const b = await saltFor(k, 5n, PERSONA, CHAIN, MARKET);
  assert.notEqual(a, b);
  // Address case must not change the salt (the session and the contract disagree on checksums).
  assert.equal(await saltFor(k, 5n, MAIN.toUpperCase().replace("0X", "0x") as Address, CHAIN, MARKET), a);
  // A revealed salt from one persona doesn't open the other persona's commitment.
  const personaCommit = commitmentFor(5n, PERSONA, Side.No, b, CHAIN, MARKET);
  for (const side of [Side.Yes, Side.No] as const) {
    assert.notEqual(commitmentFor(5n, PERSONA, side, a, CHAIN, MARKET), personaCommit);
  }
});

test("new salts never reuse the legacy shared salt", async () => {
  const k = await key();
  const legacy = await legacySaltFor(k, 5n, CHAIN, MARKET);
  assert.notEqual(await saltFor(k, 5n, MAIN, CHAIN, MARKET), legacy);
  assert.notEqual(await saltFor(k, 5n, PERSONA, CHAIN, MARKET), legacy);
});

test("a sealed call opens only for its own market, player and passkey", async () => {
  const k = await key();
  const salt = await saltFor(k, 5n, MAIN, CHAIN, MARKET);
  const c = commitmentFor(5n, MAIN, Side.Yes, salt, CHAIN, MARKET);
  assert.deepEqual(await openSealedCall(k, 5n, MAIN, c, CHAIN, MARKET), { side: Side.Yes, salt });
  assert.equal(await openSealedCall(k, 6n, MAIN, c, CHAIN, MARKET), null);
  assert.equal(await openSealedCall(k, 5n, PERSONA, c, CHAIN, MARKET), null);
  assert.equal(await openSealedCall(k, 5n, MAIN, c, CHAIN, "0x000000000000000000000000000000000000dEaD"), null);
  const other = await sealedKeyFromPrf(new Uint8Array(32).fill(9));
  assert.equal(await openSealedCall(other, 5n, MAIN, c, CHAIN, MARKET), null);
});

test("a commitment made with the legacy salt can still be opened and revealed", async () => {
  const k = await key();
  const legacy = await legacySaltFor(k, 5n, CHAIN, MARKET);
  const c = commitmentFor(5n, MAIN, Side.No, legacy, CHAIN, MARKET);
  // The reveal must send the legacy salt, since that is what the contract will hash.
  assert.deepEqual(await openSealedCall(k, 5n, MAIN, c, CHAIN, MARKET), { side: Side.No, salt: legacy });
});

test("an invalid reveal (wrong side or salt) never matches the commitment", async () => {
  const k = await key();
  const salt = await saltFor(k, 5n, MAIN, CHAIN, MARKET);
  const c = commitmentFor(5n, MAIN, Side.Yes, salt, CHAIN, MARKET);
  assert.notEqual(commitmentFor(5n, MAIN, Side.No, salt, CHAIN, MARKET), c);
  assert.notEqual(commitmentFor(5n, MAIN, Side.Yes, `0x${"00".repeat(32)}`, CHAIN, MARKET), c);
});
