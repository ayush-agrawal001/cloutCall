/**
 * Open a market on any YouTube video using its live view count.
 *   npm run create-market -- <url|id> [--growth 20] [--target 1500000] [--close 1h] [--resolve 24h]
 */
import { parseArgs } from "node:util";
import { load, requireYoutubeKey } from "./config";
import { parseDuration, suggestThreshold } from "./logic";
import { openMarket } from "./markets";
import { getStats, parseVideoId } from "./youtube";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    growth: { type: "string", default: "20" },
    target: { type: "string" },
    close: { type: "string", default: "1h" },
    resolve: { type: "string", default: "24h" },
  },
});

const cfg = load();
const videoId = parseVideoId(positionals[0] ?? "");
if (!videoId) throw new Error("usage: create-market <youtube url or id>");
if (!cfg.wallet) throw new Error("Set RESOLVER_PRIVATE_KEY");

const stats = (await getStats([videoId], requireYoutubeKey(cfg.youtubeKey))).get(videoId);
if (!stats) throw new Error(`Video ${videoId} not found or not public`);
const threshold = values.target ? BigInt(values.target) : suggestThreshold(stats.views, Number(values.growth));
const closeIn = parseDuration(values.close!);
const resolveIn = parseDuration(values.resolve!);

const { id, hash } = await openMarket(cfg.publicClient, cfg.wallet, cfg.market, {
  videoId,
  threshold,
  baseline: stats.views,
  closeIn,
  resolveIn,
});
console.log(`Opened market #${id}: "${stats.title}" — ${stats.views} views now, target ${threshold}`);
console.log(`tx ${hash}`);
