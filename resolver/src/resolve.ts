/**
 * Settles due markets with live YouTube view counts. Runs forever (every 30s) unless --once.
 * Chainlink CRE (../cre) can settle the same markets trust-minimized via CloutMarket.onReport;
 * this keeper is the simple path and a fallback.
 */
import { parseArgs } from "node:util";
import { formatEther, parseEther } from "viem";
import { marketAbi } from "./abi";
import { load, requireYoutubeKey } from "./config";
import { decide, staggeredWindow } from "./logic";
import { readAllMarkets } from "./markets";
import { getStats } from "./youtube";
import { openSprintCount, seedSprints } from "./sprints";

const { values } = parseArgs({
  options: {
    once: { type: "boolean", default: false },
    every: { type: "string", default: "30" },
    // Keep this many Hype Sprints open, seeding fresh uploads when below.
    sprints: { type: "string", default: "0" },
    // Trending charts to pick sprint videos from, and how fresh an upload must be.
    regions: { type: "string", default: "US" },
    "max-age": { type: "string", default: "12" }, // hours
    // Sprint lengths in minutes, cycled so sprints settle (and reopen) at different times.
    durations: { type: "string", default: "20,30,40,50,60" },
    // Stop opening sprints below this much MON so the keeper can always settle the ones already open.
    reserve: { type: "string", default: "0.1" },
  },
});

const cfg = load();
if (!cfg.wallet) throw new Error("Set RESOLVER_PRIVATE_KEY");
const apiKey = requireYoutubeKey(cfg.youtubeKey);

let lowGasLogged = false;
/** How many sprints this keeper has opened, so lengths keep cycling across passes. */
let sprintsOpened = 0;
const durations = values.durations!.split(",").map(Number).filter((n) => n > 0);

async function topUpSprints() {
  const want = Number(values.sprints);
  if (!want) return;
  const balance = await cfg.publicClient.getBalance({ address: cfg.wallet!.account!.address });
  if (balance < parseEther(values.reserve!)) {
    if (!lowGasLogged) console.error(`⛽ ${formatEther(balance)} MON left: not opening new sprints until topped up`);
    lowGasLogged = true;
    return;
  }
  lowGasLogged = false;
  const { count } = await openSprintCount(cfg);
  if (count >= want) return;
  const opened = await seedSprints(cfg, apiKey, {
    count: want - count,
    region: values.regions!,
    maxAgeSec: Number(values["max-age"]) * 3600,
    closeIn: 25 * 60,
    resolveIn: 30 * 60,
    window: (i) => staggeredWindow(sprintsOpened + i, durations),
  });
  sprintsOpened += opened.length;
  for (const o of opened) console.log(`⚡ opened sprint #${o.id} (${o.minutes} min): ${o.title} → ${o.threshold}`);
}

async function tick() {
  await topUpSprints().catch((e) => console.error("sprint seeding failed:", e instanceof Error ? e.message : e));
  const now = (await cfg.publicClient.getBlock()).timestamp;
  const due = (await readAllMarkets(cfg.publicClient, cfg.market)).filter((m) => m.status === 0 && m.resolveTime <= now);
  if (due.length === 0) return;
  const stats = await getStats([...new Set(due.map((m) => m.videoId))], apiKey);
  const views = new Map([...stats].map(([id, s]) => [id, s.views]));
  for (const a of decide(due, views, now)) {
    // One market failing (e.g. already settled by another keeper or CRE) must not block the rest.
    try {
      const hash = await cfg.wallet!.writeContract({
        address: cfg.market,
        abi: marketAbi,
        functionName: a.kind === "resolve" ? "resolve" : "voidMarket",
        args: a.kind === "resolve" ? [a.id, a.views] : [a.id],
        account: cfg.wallet!.account!,
        chain: cfg.chain,
      } as never);
      const r = await cfg.publicClient.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error(`reverted (${hash})`);
      console.log(
        a.kind === "resolve" ? `resolved #${a.id} at ${a.views} views (${hash})` : `voided #${a.id}: ${a.reason} (${hash})`,
      );
    } catch (e) {
      console.error(`#${a.id} ${a.kind} failed:`, e instanceof Error ? e.message : e);
    }
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
