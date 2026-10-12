// Writes .env.local from ../deployments/<chainId>.json. Usage: node scripts/sync-env.mjs 10143
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chainId = process.argv[2] ?? "10143";
const dep = JSON.parse(readFileSync(join(root, "..", "deployments", `${chainId}.json`), "utf8"));
const envPath = join(root, ".env.local");

const keep = existsSync(envPath)
  ? readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l && !/^NEXT_PUBLIC_(CHAIN_ID|MARKET_ADDRESS|POINTS_ADDRESS|START_BLOCK)=/.test(l))
  : [];
const lines = [
  `NEXT_PUBLIC_CHAIN_ID=${dep.chainId}`,
  `NEXT_PUBLIC_MARKET_ADDRESS=${dep.market}`,
  `NEXT_PUBLIC_POINTS_ADDRESS=${dep.points}`,
  `NEXT_PUBLIC_START_BLOCK=${dep.startBlock}`,
  ...keep,
];
writeFileSync(envPath, lines.join("\n") + "\n");
console.log(`wrote .env.local for chain ${chainId}`);
