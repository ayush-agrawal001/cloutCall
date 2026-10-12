/**
 * CloutBot — the AI rival. For every open market it hasn't called yet, it reads the video's live
 * signals, asks Kimi for a calibrated prediction, stakes points on that side and writes its pick and
 * reasoning to AgentJournal before calls close. Humans then duel it on the same market.
 *
 *   npm run agent            # loop every 60s
 *   npm run agent -- --once  # single pass
 *   npm run agent -- --dry-run   # print picks, send nothing
 */
import { parseArgs } from "node:util";
import type { Address } from "viem";
import { journalAbi, marketAbi, pointsAbi } from "./abi";
import { load, requireYoutubeKey } from "./config";
import { askKimi, KIMI_MODEL, stakeFor, type MarketContext } from "./kimi";
import { readAllMarkets } from "./markets";
import { getStats } from "./youtube";

const { values } = parseArgs({
  options: {
    once: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    every: { type: "string", default: "60" },
  },
});

const cfg = load();
const apiKey = requireYoutubeKey(cfg.youtubeKey);
if (!cfg.kimiKey) throw new Error("Set KIMI_API_KEY (https://platform.moonshot.ai)");
if (!cfg.journal) throw new Error("No journal address in deployments — run DeployExtras first");
if (!cfg.agentWallet && !values["dry-run"]) throw new Error("Set AGENT_PRIVATE_KEY");
const agent = cfg.agentWallet?.account?.address as Address | undefined;
const journal = cfg.journal;

async function send(functionName: string, address: Address, abi: unknown, args: unknown[]) {
  const hash = await cfg.agentWallet!.writeContract({
    address,
    abi,
    functionName,
    args,
    account: cfg.agentWallet!.account!,
    chain: cfg.chain,
  } as never);
  const r = await cfg.publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
  return hash;
}

async function ensurePoints(need: number) {
  if (!agent) return;
  const read = (fn: string, args: unknown[] = [agent]) =>
    cfg.publicClient.readContract({ address: cfg.points, abi: pointsAbi, functionName: fn, args } as never) as Promise<
      bigint | boolean
    >;
  if (!(await read("claimedStarter"))) await send("claimStarter", cfg.points, pointsAbi, []);
  if (((await read("balanceOf")) as bigint) < BigInt(need)) {
    try {
      await send("claimRefill", cfg.points, pointsAbi, []);
    } catch {
      /* refill on cooldown; stake will shrink below */
    }
  }
  return (await read("balanceOf")) as bigint;
}

async function tick() {
  const now = (await cfg.publicClient.getBlock()).timestamp;
  const open = (await readAllMarkets(cfg.publicClient, cfg.market)).filter(
    (m) => m.status === 0 && Number(m.resolveTime - now) > 0 && Number((m.closeTime ?? 0n) - now) > 90,
  );
  const todo = [];
  for (const m of open) {
    if (!agent) {
      todo.push(m);
      continue;
    }
    const pick = (await cfg.publicClient.readContract({
      address: journal,
      abi: journalAbi,
      functionName: "pickOf",
      args: [m.id, agent],
    })) as { recordedAt: bigint };
    if (pick.recordedAt === 0n) todo.push(m);
  }
  if (todo.length === 0) return;

  const stats = await getStats([...new Set(todo.map((m) => m.videoId))], apiKey);
  for (const m of todo) {
    const s = stats.get(m.videoId);
    if (!s) continue;
    const ctx: MarketContext = {
      title: s.title,
      channel: s.channel,
      hoursSincePublish: Math.max(0.01, (Date.now() - Date.parse(s.publishedAt)) / 3.6e6),
      views: Number(s.views),
      likes: Number(s.likes),
      comments: Number(s.comments),
      threshold: Number(m.threshold),
      hoursToResolve: Number(m.resolveTime - now) / 3600,
    };
    const call = await askKimi(ctx, cfg.kimiKey!);
    const side = call.side === "YES" ? 1 : 2;
    let stake = stakeFor(call.confidence);
    console.log(`#${m.id} "${s.title.slice(0, 50)}" → ${call.side} ${call.confidence}% (${stake} pts): ${call.reasoning}`);
    if (values["dry-run"]) continue;

    const balance = (await ensurePoints(stake)) ?? 0n;
    stake = Math.min(stake, Number(balance));
    if (stake < 10) {
      console.log("  skipped: agent is out of points");
      continue;
    }
    await send("call", cfg.market, marketAbi, [m.id, side, BigInt(stake), "0x0000000000000000000000000000000000000000"]);
    const hash = await send("record", journal, journalAbi, [
      m.id,
      side,
      call.confidence * 100,
      BigInt(call.predictedViews),
      KIMI_MODEL,
      call.reasoning,
    ]);
    console.log(`  staked + journaled (${hash})`);
  }
}

do {
  try {
    await tick();
  } catch (e) {
    console.error("agent tick failed:", e instanceof Error ? e.message : e);
  }
  if (values.once || values["dry-run"]) break;
  await new Promise((r) => setTimeout(r, Number(values.every) * 1000));
} while (true);
