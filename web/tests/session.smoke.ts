/**
 * Smoke test for the wallet pipeline without a browser passkey:
 * simulated PRF output → BIP-44 key → mera signing session → scoped session → drip → claimStarter.
 * Run against a local chain:  scripts/dev-local.sh && npm run dev  (another shell), then
 *   npx tsx --env-file=.env.local tests/session.smoke.ts
 */
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { pointsAbi } from "../lib/abi";
import { POINTS_ADDRESS, publicClient } from "../lib/chain";
import { deriveEvmPrivateKey, personaPath } from "../lib/mera";
import { privateKeyToAccount } from "viem/accounts";
import { toHex } from "viem";
import { ScopedSession, SessionScopeError } from "../lib/session";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

async function main() {
  const prf = crypto.getRandomValues(new Uint8Array(32));
  const pk = deriveEvmPrivateKey(new Uint8Array(prf));
  const again = deriveEvmPrivateKey(new Uint8Array(prf));
  if (Buffer.compare(Buffer.from(pk), Buffer.from(again)) !== 0) throw new Error("derivation not deterministic");

  const s = new ScopedSession(createSecp256k1SigningSession({ privateKey: new Uint8Array(pk) }), { budget: 300 });
  console.log("address", s.address);

  const drip = await fetch(`${BASE}/api/drip`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: s.address }),
  }).then((r) => r.json());
  console.log("drip", drip);
  console.log("balance", await publicClient.getBalance({ address: s.address }));

  const res = await s.write({ address: POINTS_ADDRESS, abi: pointsAbi, functionName: "claimStarter", args: [] });
  console.log(`claimStarter confirmed in ${res.ms}ms, block ${res.receipt.blockNumber}`);
  const bal = await publicClient.readContract({
    address: POINTS_ADDRESS,
    abi: pointsAbi,
    functionName: "balanceOf",
    args: [s.address],
  });
  if (bal !== 1000n) throw new Error(`expected 1000 points, got ${bal}`);

  try {
    await s.write({ address: POINTS_ADDRESS, abi: pointsAbi, functionName: "claimRefill", args: [] }, 301);
    throw new Error("budget not enforced");
  } catch (e) {
    if (!(e instanceof SessionScopeError) || e.reason !== "budget") throw e;
    console.log("budget scope enforced ✓");
  }
  try {
    await s.write({
      address: "0x000000000000000000000000000000000000dEaD",
      abi: pointsAbi,
      functionName: "claimStarter",
      args: [],
    });
    throw new Error("target not enforced");
  } catch (e) {
    if (!(e instanceof SessionScopeError) || e.reason !== "target") throw e;
    console.log("target scope enforced ✓");
  }
  // Personas: same passkey PRF + same name → same, separate, unlinkable account.
  const pathA = await personaPath("office-league");
  if (pathA !== (await personaPath(" Office-League "))) throw new Error("persona path not stable");
  const main = privateKeyToAccount(toHex(deriveEvmPrivateKey(prf)));
  const personaA = privateKeyToAccount(toHex(deriveEvmPrivateKey(prf, pathA)));
  const personaB = privateKeyToAccount(toHex(deriveEvmPrivateKey(prf, await personaPath("anon"))));
  if (main.address !== s.address) throw new Error("main path mismatch");
  if (new Set([main.address, personaA.address, personaB.address]).size !== 3) throw new Error("personas collide");
  const ps = new ScopedSession(createSecp256k1SigningSession({ privateKey: deriveEvmPrivateKey(prf, pathA) }));
  await fetch(`${BASE}/api/drip`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: ps.address }),
  });
  await ps.write({ address: POINTS_ADDRESS, abi: pointsAbi, functionName: "claimStarter", args: [] });
  ps.end();
  console.log(`persona ${pathA} → ${personaA.address} plays separately ✓`);

  s.end();
  try {
    await s.write({ address: POINTS_ADDRESS, abi: pointsAbi, functionName: "claimStarter", args: [] });
    throw new Error("ended session still signs");
  } catch (e) {
    if (!(e instanceof SessionScopeError) || e.reason !== "expired") throw e;
    console.log("ended session refuses to sign ✓");
  }
  console.log("SESSION SMOKE OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
