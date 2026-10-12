/**
 * Humans vs AI on a local chain: the AI rival stakes YES and journals its pick, a human duels it with NO
 * from the "take the other side" flow, the market settles NO, and the indexer credits the human.
 *   (needs anvil with DeployExtras, `npm run dev`, and the local Envio indexer)
 */
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { createTestClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { journalAbi, marketAbi, pointsAbi } from "../lib/abi";
import {
  AGENT_ADDRESS,
  ENVIO_URL,
  JOURNAL_ADDRESS,
  MARKET_ADDRESS,
  POINTS_ADDRESS,
  publicClient,
  RPC_URL,
} from "../lib/chain";
import { Side } from "../lib/markets";
import { deriveEvmPrivateKey } from "../lib/mera";
import { ScopedSession } from "../lib/session";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const ADMIN: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const AGENT: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // anvil #1
const test = createTestClient({ chain: foundry, mode: "anvil", transport: http(RPC_URL) });
const wallet = (k: Hex) =>
  createWalletClient({ account: privateKeyToAccount(k), chain: foundry, transport: http(RPC_URL) });
const done = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });

async function gql<T>(query: string): Promise<T> {
  const r = await fetch(ENVIO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return ((await r.json()) as { data: T }).data;
}

async function main() {
  if (privateKeyToAccount(AGENT).address !== AGENT_ADDRESS) throw new Error("AGENT_ADDRESS mismatch");
  const admin = wallet(ADMIN);
  const agent = wallet(AGENT);
  const now = (await publicClient.getBlock()).timestamp;
  await done(
    await admin.writeContract({
      address: MARKET_ADDRESS,
      abi: marketAbi,
      functionName: "createMarket",
      args: ["dQw4w9WgXcQ", 9_000_000_000n, 1_700_000_000n, now + 600n, now + 900n],
    }),
  );
  const id =
    (await publicClient.readContract({ address: MARKET_ADDRESS, abi: marketAbi, functionName: "marketCount" })) - 1n;

  const claimed = await publicClient.readContract({
    address: POINTS_ADDRESS,
    abi: pointsAbi,
    functionName: "claimedStarter",
    args: [AGENT_ADDRESS!],
  });
  if (!claimed)
    await done(await agent.writeContract({ address: POINTS_ADDRESS, abi: pointsAbi, functionName: "claimStarter" }));
  await done(
    await agent.writeContract({
      address: MARKET_ADDRESS,
      abi: marketAbi,
      functionName: "call",
      args: [id, Side.Yes, 100n, "0x0000000000000000000000000000000000000000"],
    }),
  );
  await done(
    await agent.writeContract({
      address: JOURNAL_ADDRESS!,
      abi: journalAbi,
      functionName: "record",
      args: [id, Side.Yes, 8000, 9_100_000_000n, "kimi-k2.6", "Smoke: steady pace."],
    }),
  );
  console.log(`AI called YES on #${id} and journaled it ✓`);

  const human = new ScopedSession(
    createSecp256k1SigningSession({ privateKey: deriveEvmPrivateKey(crypto.getRandomValues(new Uint8Array(32))) }),
  );
  await fetch(`${BASE}/api/drip`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: human.address }),
  });
  await human.write({ address: POINTS_ADDRESS, abi: pointsAbi, functionName: "claimStarter", args: [] });
  await human.write(
    { address: MARKET_ADDRESS, abi: marketAbi, functionName: "call", args: [id, Side.No, 100n, AGENT_ADDRESS] },
    100,
  );
  console.log("human took NO against the AI ✓");

  await test.increaseTime({ seconds: 901 });
  await test.mine({ blocks: 1 });
  await done(
    await admin.writeContract({
      address: MARKET_ADDRESS,
      abi: marketAbi,
      functionName: "resolve",
      args: [id, 1_800_000_000n],
    }),
  );
  console.log("settled NO ✓");

  if (!ENVIO_URL) return console.log("AI SMOKE OK (indexer not configured, skipped)");
  type R = {
    AgentPick: { result: string }[];
    HumansVsAi: { aiLosses: number; humansBeatAi: number }[];
    Player: { beatAi: number }[];
  };
  let data: R | undefined;
  for (let i = 0; i < 30; i++) {
    data = await gql<R>(
      `{ AgentPick(where: {id: {_eq: "${id}-${AGENT_ADDRESS!.toLowerCase()}"}}) { result }
         HumansVsAi { aiLosses humansBeatAi }
         Player(where: {id: {_eq: "${human.address.toLowerCase()}"}}) { beatAi } }`,
    );
    if (data.AgentPick[0]?.result === "wrong") break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (data?.AgentPick[0]?.result !== "wrong" || data.Player[0]?.beatAi !== 1 || !data.HumansVsAi[0]?.humansBeatAi) {
    throw new Error(`indexer did not score the duel: ${JSON.stringify(data)}`);
  }
  console.log(
    `indexer: AI pick marked wrong, human.beatAi = 1, global humansBeatAi = ${data.HumansVsAi[0].humansBeatAi} ✓`,
  );
  human.end();
  console.log("AI SMOKE OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
