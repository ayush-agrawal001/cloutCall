/**
 * Creator mode end-to-end on a local chain (Google sign-in is the one step simulated here):
 * passkey account signs a link request → /api/creator/start returns a Google URL with signed state →
 * verifier attests on-chain → /api/creator/uploads lists the channel's uploads → creator hosts a market
 * from their session → market is recognised as creator-hosted.
 *   (needs anvil, `npm run dev`, and resolver/test/e2e/mock-apis.mjs running)
 */
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { parseEventLogs } from "viem";
import { marketAbi, pointsAbi, registryAbi } from "../lib/abi";
import { MARKET_ADDRESS, POINTS_ADDRESS, publicClient, REGISTRY_ADDRESS } from "../lib/chain";
import { linkMessage } from "../lib/creatorLink";
import { deriveEvmPrivateKey } from "../lib/mera";
import { attestOnchain, readState } from "../lib/server/creator";
import { ScopedSession } from "../lib/session";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const post = (path: string, body: unknown) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

async function main() {
  const s = new ScopedSession(
    createSecp256k1SigningSession({ privateKey: deriveEvmPrivateKey(crypto.getRandomValues(new Uint8Array(32))) }),
  );
  await post("/api/drip", { address: s.address });
  await s.write({ address: POINTS_ADDRESS, abi: pointsAbi, functionName: "claimStarter", args: [] });

  const message = linkMessage(s.address, new Date().toISOString(), crypto.randomUUID());
  const start = (await post("/api/creator/start", {
    address: s.address,
    message,
    signature: await s.signLinkMessage(message),
  })) as {
    url?: string;
    error?: string;
  };
  if (!start.url) throw new Error(`start failed: ${start.error}`);
  const state = new URL(start.url).searchParams.get("state")!;
  if (readState(state) !== s.address) throw new Error("state does not carry the address");
  console.log("link request signed by passkey session → Google URL with signed state ✓");

  try {
    await s.signLinkMessage("transfer all my stuff");
    throw new Error("session signed an arbitrary message");
  } catch (e) {
    if ((e as Error).message.includes("arbitrary")) throw e;
    console.log("session refuses non-link messages ✓");
  }

  // Simulates the Google callback's result for the mock channel.
  await attestOnchain(s.address, "UCmockchannel0000000000", "Mock Channel");
  const channel = await publicClient.readContract({
    address: REGISTRY_ADDRESS!,
    abi: registryAbi,
    functionName: "channelOf",
    args: [s.address],
  });
  if (channel !== "UCmockchannel0000000000") throw new Error("attestation missing");
  console.log("channel attested on-chain ✓");

  const up = (await fetch(`${BASE}/api/creator/uploads?address=${s.address}`).then((r) => r.json())) as {
    uploads?: { id: string; views: number }[];
    error?: string;
  };
  if (!up.uploads?.length) throw new Error(`no uploads: ${up.error}`);
  console.log(`uploads listed: ${up.uploads.map((u) => u.id).join(", ")} ✓`);

  const u = up.uploads[0];
  const now = (await publicClient.getBlock()).timestamp;
  const res = await s.write({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "createMarket",
    args: [u.id, BigInt(Math.ceil(u.views * 1.25)), BigInt(u.views), now + 1200n, now + 3600n],
  });
  const [created] = parseEventLogs({ abi: marketAbi, eventName: "MarketCreated", logs: res.receipt.logs });
  const views = (await fetch(`${BASE}/api/views/${u.id}`).then((r) => r.json())) as { channelId: string };
  if (created.args.creator !== s.address || views.channelId !== channel)
    throw new Error("not recognised as creator-hosted");
  console.log(`creator hosted market #${created.args.marketId} in ${res.ms}ms → badge condition holds ✓`);
  s.end();
  console.log("CREATOR SMOKE OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
