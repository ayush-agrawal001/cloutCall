/**
 * End-to-end market flow on a local anvil chain, exercising the same client code the app uses:
 * passkey-derived accounts (simulated PRF) → sealed call + duel call → cross-device reveal →
 * resolution → claim.
 *
 *   scripts/dev-local.sh && npm run dev   (another shell)
 *   npx tsx --env-file=.env.local tests/market.smoke.ts
 */
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { createTestClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { marketAbi, pointsAbi } from "../lib/abi";
import { MARKET_ADDRESS, POINTS_ADDRESS, publicClient, RPC_URL } from "../lib/chain";
import { Side } from "../lib/markets";
import { deriveEvmPrivateKey } from "../lib/mera";
import { commitmentFor, openSealedCall, saltFor, sealedKeyFromPrf } from "../lib/sealed";
import { ScopedSession } from "../lib/session";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const test = createTestClient({ chain: foundry, mode: "anvil", transport: http(RPC_URL) });

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function player(name: string) {
  const walletPrf = crypto.getRandomValues(new Uint8Array(32));
  const sealedPrf = crypto.getRandomValues(new Uint8Array(32));
  const s = new ScopedSession(createSecp256k1SigningSession({ privateKey: deriveEvmPrivateKey(walletPrf) }));
  await fetch(`${BASE}/api/drip`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: s.address }),
  });
  await s.write({ address: POINTS_ADDRESS, abi: pointsAbi, functionName: "claimStarter", args: [] });
  console.log(`${name}: ${s.address}`);
  return { s, sealedPrf };
}

const points = (a: Address) =>
  publicClient.readContract({ address: POINTS_ADDRESS, abi: pointsAbi, functionName: "balanceOf", args: [a] });

async function main() {
  const alice = await player("alice");
  const bob = await player("bob");

  // Open a market (the resolver/anvil account creates it).
  const admin = createWalletClient({
    account: privateKeyToAccount(ANVIL_KEY),
    chain: foundry,
    transport: http(RPC_URL),
  });
  const now = (await publicClient.getBlock()).timestamp;
  const hash = await admin.writeContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "createMarket",
    args: ["dQw4w9WgXcQ", 2_000_000_000n, 1_700_000_000n, now + 600n, now + 900n],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  const id =
    (await publicClient.readContract({ address: MARKET_ADDRESS, abi: marketAbi, functionName: "marketCount" })) - 1n;
  console.log("market", id);

  // Alice seals YES using her sealed-calls namespace key.
  const aliceKey = await sealedKeyFromPrf(new Uint8Array(alice.sealedPrf));
  const salt = await saltFor(aliceKey, id);
  const commitment = commitmentFor(id, alice.s.address, Side.Yes, salt);
  const onchain = await publicClient.readContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "sealedCommitment",
    args: [id, alice.s.address, Side.Yes, salt],
  });
  assert(onchain === commitment, "client commitment matches contract");
  const sealedTx = await alice.s.write(
    {
      address: MARKET_ADDRESS,
      abi: marketAbi,
      functionName: "commitCall",
      args: [id, commitment, 300n, "0x0000000000000000000000000000000000000000"],
    },
    300,
  );
  console.log(`alice sealed a call in ${sealedTx.ms}ms`);

  // Bob takes the other side from Alice's duel link.
  const bobTx = await bob.s.write(
    { address: MARKET_ADDRESS, abi: marketAbi, functionName: "call", args: [id, Side.No, 200n, alice.s.address] },
    200,
  );
  console.log(`bob called NO vs alice in ${bobTx.ms}ms`);

  // "New device": re-derive the sealed key from the same passkey PRF and open the pick.
  const freshKey = await sealedKeyFromPrf(new Uint8Array(alice.sealedPrf));
  const opened = await openSealedCall(freshKey, id, alice.s.address, commitment);
  assert(opened?.side === Side.Yes, "sealed pick recovered on a fresh device");
  console.log("cross-device open ✓");

  await test.increaseTime({ seconds: 601 });
  await test.mine({ blocks: 1 });
  await alice.s.write({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "revealCall",
    args: [id, opened.side, opened.salt],
  });
  console.log("alice revealed ✓");

  await test.increaseTime({ seconds: 300 });
  await test.mine({ blocks: 1 });
  const r = await admin.writeContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "resolve",
    args: [id, 2_100_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: r });
  console.log("resolved YES ✓");

  const before = await points(alice.s.address);
  await alice.s.write({ address: MARKET_ADDRESS, abi: marketAbi, functionName: "claim", args: [id] });
  const after = await points(alice.s.address);
  assert(after - before === 500n, `alice wins 300 + 200 = 500 (got ${after - before})`);
  assert((await points(bob.s.address)) === 800n, "bob lost 200");
  console.log("claim paid 500 ✓");
  console.log("MARKET SMOKE OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
