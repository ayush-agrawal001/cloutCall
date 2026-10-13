import type { load } from "./config";
import { sprintThreshold } from "./logic";
import { openMarket, readAllMarkets } from "./markets";
import { getTrending } from "./youtube";

type Cfg = ReturnType<typeof load>;
/** `region` may list several comma-separated YouTube regions (e.g. "US,IN,GB"); their trending charts are merged. */
export type SprintOptions = {
  count: number;
  region: string;
  maxAgeSec: number;
  closeIn: number;
  resolveIn: number;
  /** Per-sprint timing (i = position in this batch); overrides closeIn/resolveIn so sprints don't all settle together. */
  window?: (i: number) => { closeIn: number; resolveIn: number };
};

/** Sprints are markets that settle within two hours of now. */
export const SPRINT_MAX_SEC = 2 * 3600;

export async function openSprintCount(cfg: Cfg) {
  const now = (await cfg.publicClient.getBlock()).timestamp;
  const markets = await readAllMarkets(cfg.publicClient, cfg.market);
  const open = markets.filter((m) => m.status === 0 && m.resolveTime > now && m.resolveTime - now <= BigInt(SPRINT_MAX_SEC));
  return { count: open.length, videos: new Set(open.map((m) => m.videoId)) };
}

export async function seedSprints(cfg: Cfg, apiKey: string, o: SprintOptions) {
  const { videos } = await openSprintCount(cfg);
  const regions = o.region.split(",").map((r) => r.trim().toUpperCase()).filter(Boolean);
  const byId = new Map<string, Awaited<ReturnType<typeof getTrending>>[number]>();
  for (const r of regions) for (const v of await getTrending(r, 50, apiKey)) byId.set(v.id, v);
  const fresh = [...byId.values()]
    .map((v) => ({ v, ageSec: (Date.now() - Date.parse(v.publishedAt)) / 1000 }))
    .filter(({ v, ageSec }) => ageSec > 0 && ageSec <= o.maxAgeSec && !videos.has(v.id))
    .sort((a, b) => a.ageSec - b.ageSec)
    .slice(0, o.count);

  const opened = [];
  for (const [i, { v, ageSec }] of fresh.entries()) {
    const { closeIn, resolveIn } = o.window?.(i) ?? o;
    const threshold = sprintThreshold(v.views, ageSec / 3600, resolveIn / 3600);
    const { id } = await openMarket(cfg.publicClient, cfg.wallet!, cfg.market, {
      videoId: v.id,
      threshold,
      baseline: v.views,
      closeIn,
      resolveIn,
    });
    opened.push({ id, title: v.title, views: v.views, threshold, minutes: resolveIn / 60 });
  }
  return opened;
}
