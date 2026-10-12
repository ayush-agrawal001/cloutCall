/**
 * Settles due markets with live YouTube view counts. Runs forever (every 30s) unless --once.
 * Chainlink CRE (../cre) can settle the same markets trust-minimized via CloutMarket.onReport;
 * this keeper is the simple path and a fallback.
 */
import { parseArgs } from "node:util";
import { marketAbi } from "./abi";
import { load, requireYoutubeKey } from "./config";
import { decide } from "./logic";
import { readAllMarkets } from "./markets";
import { getStats } from "./youtube";
import { openSprintCount, seedSprints } from "./sprints";

const { values } = parseArgs({
  options: {
    once: { type: "boolean", default: false },
    every: { type: "string", default: "30" },
    // Keep this many Hype Sprints open, seeding fresh uploads when below.
    sprints: { type: "string", default: "0" },
  },
});

const cfg = load();
if (!cfg.wallet) throw new Error("Set RESOLVER_PRIVATE_KEY");
const apiKey = requireYoutubeKey(cfg.youtubeKey);

async function topUpSprints() {
  const want = Number(values.sprints);
  if (!want) return;
  const { count } = await openSprintCount(cfg);
  if (count >= want) return;
  const opened = await seedSprints(cfg, apiKey, {
    count: want - count,
    region: "US",
    maxAgeSec: 12 * 3600,
    closeIn: 10 * 60,
    resolveIn: 30 * 60,
  });
  for (const o of opened) console.log(`⚡ opened sprint #${o.id}: ${o.title} → ${o.threshold}`);
}

async function tick() {
  await topUpSprints().catch((e) => console.error("sprint seeding failed:", e instanceof Error ? e.message : e));
  const now = (await cfg.publicClient.getBlock()).timestamp;
  const due = (await readAllMarkets(cfg.publicClient, cfg.market)).filter((m) => m.status === 0 && m.resolveTime <= now);
  if (due.length === 0) return;
  const stats = await getStats([...new Set(due.map((m) => m.videoId))], apiKey);
  const views = new Map([...stats].map(([id, s]) => [id, s.views]));
  for (const a of decide(due, views, now)) {
    const hash = await cfg.wallet!.writeContract({
      address: cfg.market,
      abi: marketAbi,
      functionName: a.kind === "resolve" ? "resolve" : "voidMarket",
      args: a.kind === "resolve" ? [a.id, a.views] : [a.id],
      account: cfg.wallet!.account!,
      chain: cfg.chain,
    } as never);
    await cfg.publicClient.waitForTransactionReceipt({ hash });
    console.log(
      a.kind === "resolve" ? `resolved #${a.id} at ${a.views} views (${hash})` : `voided #${a.id}: ${a.reason} (${hash})`,
    );
  }
}

do {
  try {
    await tick();
  } catch (e) {
    console.error("tick failed:", e instanceof Error ? e.message : e);
  }
  if (values.once) break;
  await new Promise((r) => setTimeout(r, Number(values.every) * 1000));
} while (true);
