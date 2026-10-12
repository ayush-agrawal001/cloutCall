/**
 * Open markets on what's trending right now, so the feed is always fresh.
 *   npm run seed-trending -- [--region US] [--count 6] [--growth 15] [--close 2h] [--resolve 24h]
 */
import { parseArgs } from "node:util";
import { load, requireYoutubeKey } from "./config";
import { parseDuration, suggestThreshold } from "./logic";
import { openMarket } from "./markets";
import { getTrending } from "./youtube";

const { values } = parseArgs({
  options: {
    region: { type: "string", default: "US" },
    count: { type: "string", default: "6" },
    growth: { type: "string", default: "15" },
    close: { type: "string", default: "2h" },
    resolve: { type: "string", default: "24h" },
  },
});

const cfg = load();
if (!cfg.wallet) throw new Error("Set RESOLVER_PRIVATE_KEY");
const trending = await getTrending(values.region!, Number(values.count), requireYoutubeKey(cfg.youtubeKey));
for (const v of trending.slice(0, Number(values.count))) {
  const threshold = suggestThreshold(v.views, Number(values.growth));
  const { id } = await openMarket(cfg.publicClient, cfg.wallet, cfg.market, {
    videoId: v.id,
    threshold,
    baseline: v.views,
    closeIn: parseDuration(values.close!),
    resolveIn: parseDuration(values.resolve!),
  });
  console.log(`#${id} ${v.channel} — "${v.title}": ${v.views} → ${threshold}`);
}
