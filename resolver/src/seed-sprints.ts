/**
 * Hype Sprints: short markets on uploads from the last few hours, where view velocity is highest.
 *   npm run seed-sprints -- [--count 4] [--region US] [--max-age 12h] [--close 10m] [--resolve 30m]
 */
import { parseArgs } from "node:util";
import { load, requireYoutubeKey } from "./config";
import { parseDuration } from "./logic";
import { seedSprints } from "./sprints";

const { values } = parseArgs({
  options: {
    count: { type: "string", default: "4" },
    region: { type: "string", default: "US" },
    "max-age": { type: "string", default: "12h" },
    close: { type: "string", default: "10m" },
    resolve: { type: "string", default: "30m" },
  },
});

const cfg = load();
if (!cfg.wallet) throw new Error("Set RESOLVER_PRIVATE_KEY");
const opened = await seedSprints(cfg, requireYoutubeKey(cfg.youtubeKey), {
  count: Number(values.count),
  region: values.region!,
  maxAgeSec: parseDuration(values["max-age"]!),
  closeIn: parseDuration(values.close!),
  resolveIn: parseDuration(values.resolve!),
});
for (const o of opened) console.log(`⚡ #${o.id} ${o.title}: ${o.views} → ${o.threshold} in ${values.resolve}`);
if (opened.length === 0) console.log("No fresh uploads found in the trending chart.");
