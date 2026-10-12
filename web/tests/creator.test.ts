/** Unit tests for creator verification (run: npx tsx --env-file=.env.local --test tests/creator.test.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { linkMessage } from "../lib/creatorLink";
import { channelFromCode, googleAuthUrl, readState, signState, verifyLinkRequest } from "../lib/server/creator";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

test("a fresh, correctly signed link request verifies", async () => {
  const message = linkMessage(acct.address, new Date().toISOString(), "n1");
  const signature = await acct.signMessage({ message });
  assert.equal(await verifyLinkRequest({ address: acct.address, message, signature }), acct.address);
});

test("stale, mismatched or forged link requests are rejected", async () => {
  const old = linkMessage(acct.address, new Date(Date.now() - 11 * 60_000).toISOString(), "n");
  await assert.rejects(
    verifyLinkRequest({ address: acct.address, message: old, signature: await acct.signMessage({ message: old }) }),
  );
  const other = linkMessage("0x000000000000000000000000000000000000dEaD", new Date().toISOString(), "n");
  await assert.rejects(
    verifyLinkRequest({ address: acct.address, message: other, signature: await acct.signMessage({ message: other }) }),
  );
  const msg = linkMessage(acct.address, new Date().toISOString(), "n");
  const forged = await privateKeyToAccount(`0x${"11".repeat(32)}`).signMessage({ message: msg });
  await assert.rejects(verifyLinkRequest({ address: acct.address, message: msg, signature: forged }));
});

test("OAuth state round-trips and resists tampering and expiry", () => {
  const s = signState(acct.address);
  assert.equal(readState(s), acct.address);
  const [p, mac] = s.split(".");
  const evil = Buffer.from(
    JSON.stringify({ a: "0x000000000000000000000000000000000000dEaD", e: Date.now() + 1e6 }),
  ).toString("base64url");
  assert.throws(() => readState(`${evil}.${mac}`));
  assert.throws(() => readState(`${p}.${mac}`, Date.now() + 11 * 60_000));
});

test("Google auth URL asks only for read-only YouTube access", () => {
  const url = new URL(googleAuthUrl("st", "http://localhost:3000"));
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/youtube.readonly");
  assert.equal(url.searchParams.get("state"), "st");
});

test("code exchange reads the signed-in user's own channel", async () => {
  const calls: string[] = [];
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    if (String(url).includes("oauth2.googleapis.com/token"))
      return new Response(JSON.stringify({ access_token: "tok" }));
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer tok");
    return new Response(JSON.stringify({ items: [{ id: "UCabcdefghijklmnop", snippet: { title: "My Channel" } }] }));
  }) as typeof fetch;
  assert.deepEqual(await channelFromCode("code", "http://localhost:3000", fake), {
    channelId: "UCabcdefghijklmnop",
    title: "My Channel",
  });
  assert.match(calls[1], /mine=true/);
});
