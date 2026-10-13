/**
 * Liquidity bots: a few house accounts that take sides on open markets so a player always finds points on
 * both sides to win. Each round, up to --per-round bots join markets they haven't called yet, priced from the
 * video's live pace (see liquidity-logic.ts). They collect their own winnings so their points recycle.
 *
 * The bots are disclosed, not disguised: put the addresses from --status into NEXT_PUBLIC_HOUSE_BOTS and the
 * app labels them, leaves them out of the leaderboard ranking and out of the crowd's score against the AI.
 *
 *   npm run bots -- --status                      # bot addresses, MON and points
 *   npm run bots -- --fund 0.3 --from AGENT_PRIVATE_KEY   # split 0.3 MON across the bots, then exit
 *   npm run bots                                  # loop (every 40s, ≤3 calls a round, ≤2 bots a market)
 *   npm run bots -- --once --dry-run              # one round, print what would be sent
 */
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createWalletClient, formatEther, http, parseEther, type Address, type Hex, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { marketAbi, pointsAbi } from "./abi";
import { load, requireYoutubeKey } from "./config";
import { botKey, fairYes, pickSide, stakeSize } from "./liquidity-logic";
import { readAllMarkets } from "./markets";
import { getStats, type VideoStats } from "./youtube";

const { values } = parseArgs({
  options: {
    count: { type: "string", default: "4" },
    every: { type: "string", default: "40" },
    "per-round": { type: "string", default: "3" },
    // Two bots are enough to fund both sides; each call costs ~0.01 MON of gas.
    "per-market": { type: "string", default: "2" },
    once: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    status: { type: "boolean", default: false },
    fund: { type: "string" },
    from: { type: "string" },
  },
});

const MIN_GAS = parseEther("0.02"); // below this a bot sits out
const CALL_BUFFER_SEC = 20n; // don't start a call this close to calls closing
const cfg = load();
const rpc = (cfg.publicClient.transport as { url?: string }).url;
const client = cfg.publicClient;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The public testnet RPC allows ~15 requests a second per IP (shared with the keeper); space reads out. */
const pace = () => sleep(90);

/** Retries a request the RPC rejected for rate limiting, backing off a little more each time. */
async function retry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const limited = /limited|429|Too Many/i.test(e instanceof Error ? e.message : String(e));
      if (!limited || i >= tries) throw e;
      await sleep(800 * i);
    }
  }
}

/** One secret recreates every bot; made on first run and kept in the git-ignored root .env. */
function seed(): Hex {
  const existing = process.env.BOTS_SEED as Hex | undefined;
  if (existing) return existing;
  const fresh = `0x${randomBytes(32).toString("hex")}` as Hex;
  appendFileSync(
    join(import.meta.dirname, "..", "..", ".env"),
    `\n# Liquidity bot keys derive from this (npm run bots)\nBOTS_SEED=${fresh}\n`,
  );
  console.log("Created BOTS_SEED in .env (git-ignored).");
  return fresh;
}

type Bot = { n: number; address: Address; wallet: WalletClient };
const s = seed();
const bots: Bot[] = Array.from({ length: Number(values.count) }, (_, i) => {
  const account = privateKeyToAccount(botKey(s, i));
  return {
    n: i + 1,
    address: account.address,
    wallet: createWalletClient({ account, chain: cfg.chain, transport: http(rpc) }),
  };
});

const read = async <T>(address: Address, abi: unknown, functionName: string, args: unknown[] = []): Promise<T> => {
  await pace();
  return retry(() => client.readContract({ address, abi, functionName, args } as never) as Promise<T>);
};

async function send(bot: Bot, address: Address, abi: unknown, functionName: string, args: unknown[]) {
  if (values["dry-run"]) return "dry-run";
  const req = { address, abi, functionName, args, account: bot.wallet.account!, chain: cfg.chain } as never;
  // Monad charges the gas limit, so keep it close to the estimate.
  const gas = ((await retry(() => client.estimateContractGas(req))) * 115n) / 100n;
  const hash = await bot.wallet.writeContract({ ...(req as object), gas } as never);
  const r = await retry(() => client.waitForTransactionReceipt({ hash }));
  if (r.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
  return hash;
}

async function points(bot: Bot) {
  return Number(await read<bigint>(cfg.points, pointsAbi, "balanceOf", [bot.address]));
}

async function status() {
  console.log(`${bots.length} liquidity bots on chain ${cfg.chainId}:`);
  for (const b of bots) {
    await pace();
    const mon = await client.getBalance({ address: b.address });
    console.log(`  bot ${b.n}  ${b.address}  ${Number(formatEther(mon)).toFixed(4)} MON  ${await points(b)} pts`);
  }
  console.log(`\nNEXT_PUBLIC_HOUSE_BOTS=${bots.map((b) => b.address).join(",")}`);
}

async function fund(amount: string, fromEnv: string) {
  const key = process.env[fromEnv] as Hex | undefined;
  if (!key) throw new Error(`--from ${fromEnv}: that variable isn't set in .env`);
  const funder = createWalletClient({ account: privateKeyToAccount(key), chain: cfg.chain, transport: http(rpc) });
  const each = parseEther(amount) / BigInt(bots.length);
  // Check up front so a short wallet fails before any bot is paid, not halfway through.
  const { maxFeePerGas } = await client.estimateFeesPerGas();
  const needed = (each + 21_000n * maxFeePerGas) * BigInt(bots.length);
  const have = await client.getBalance({ address: funder.account.address });
  if (have < needed) {
    throw new Error(
      `${funder.account.address} has ${formatEther(have)} MON but funding ${bots.length} bots needs ~${formatEther(needed)} MON (incl. gas). Top it up or pass a smaller --fund.`,
    );
  }
  console.log(`Sending ${formatEther(each)} MON to each of ${bots.length} bots from ${funder.account.address}…`);
  for (const b of bots) {
    // Monad charges the gas limit, so set it exactly for a plain transfer.
    const hash = await funder.sendTransaction({ to: b.address, value: each, gas: 21_000n });
    await client.waitForTransactionReceipt({ hash });
    console.log(`  bot ${b.n} ← ${formatEther(each)} MON (${hash})`);
  }
}

/** Starter points once, then the daily refill whenever a bot runs low. Both are free for any player. */
async function ensurePoints(bot: Bot) {
  if (!(await read<boolean>(cfg.points, pointsAbi, "claimedStarter", [bot.address]))) {
    await send(bot, cfg.points, pointsAbi, "claimStarter", []);
    console.log(`bot ${bot.n} claimed its starter points`);
  } else if ((await points(bot)) < 50) {
    await send(bot, cfg.points, pointsAbi, "claimRefill", []).then(
      () => console.log(`bot ${bot.n} claimed a refill`),
      () => {}, // on cooldown
    );
  }
  return points(bot);
}

/** Markets each bot has a stake in, so it can collect once they settle. Filled as the bots play. */
const joined = new Map<Address, Set<bigint>>(bots.map((b) => [b.address, new Set()]));
let stats = new Map<string, VideoStats>();
let statsAt = 0;

async function collect(bot: Bot, settled: Set<bigint>) {
  for (const id of joined.get(bot.address)!) {
    if (!settled.has(id)) continue;
    const owed = await read<bigint>(cfg.market, marketAbi, "claimable", [id, bot.address]);
    if (owed > 0n) {
      await send(bot, cfg.market, marketAbi, "claim", [id]);
      console.log(`bot ${bot.n} collected ${owed} pts from #${id}`);
    }
    joined.get(bot.address)!.delete(id);
  }
}

async function round() {
  const now = (await retry(() => client.getBlock())).timestamp;
  const markets = await retry(() => readAllMarkets(client, cfg.market));
  const settled = new Set(markets.filter((m) => m.status !== 0).map((m) => m.id));
  const open = markets.filter((m) => m.status === 0 && (m.closeTime ?? 0n) > now + CALL_BUFFER_SEC);

  if (open.length && Date.now() - statsAt > 120_000) {
    stats = await getStats([...new Set(open.map((m) => m.videoId))], requireYoutubeKey(cfg.youtubeKey));
    statsAt = Date.now();
  }

  // Bots with gas and points, in random order so no single bot always moves first.
  const ready: { bot: Bot; balance: number }[] = [];
  for (const bot of [...bots].sort(() => Math.random() - 0.5)) {
    if (values["dry-run"]) {
      ready.push({ bot, balance: 1_000 }); // nothing is sent, so gas and points don't matter
      continue;
    }
    await pace();
    if ((await retry(() => client.getBalance({ address: bot.address }))) < MIN_GAS) {
      console.log(`bot ${bot.n} is low on MON; fund it with --fund`);
      continue;
    }
    try {
      await collect(bot, settled);
      ready.push({ bot, balance: await ensurePoints(bot) });
    } catch (e) {
      console.error(`bot ${bot.n} setup failed:`, e instanceof Error ? e.message : e);
    }
  }

  let budget = Number(values["per-round"]);
  // Thinnest markets first: they need liquidity most.
  for (const m of [...open].sort((a, b) =>
    Number((a.yesPool ?? 0n) + (a.noPool ?? 0n) - ((b.yesPool ?? 0n) + (b.noPool ?? 0n))),
  )) {
    if (budget <= 0) break;
    const v = stats.get(m.videoId);
    if (!v) continue;
    const fair = fairYes({
      views: Number(v.views),
      threshold: Number(m.threshold),
      hoursSincePublish: (Date.now() - Date.parse(v.publishedAt)) / 3.6e6,
      hoursToResolve: Number(m.resolveTime - now) / 3600,
    });
    let yes = Number(m.yesPool ?? 0n);
    let no = Number(m.noPool ?? 0n);
    let inMarket = 0;
    for (const r of ready) {
      if (budget <= 0 || inMarket >= Number(values["per-market"])) break;
      const pos = await read<{ yes: bigint; no: bigint; sealedStake: bigint }>(cfg.market, marketAbi, "positionOf", [
        m.id,
        r.bot.address,
      ]);
      if (pos.yes + pos.no + pos.sealedStake > 0n) {
        joined.get(r.bot.address)!.add(m.id);
        inMarket++;
        continue; // one call per bot per market
      }
      const stake = stakeSize(r.balance, Math.random);
      if (stake < 10) continue;
      const side = pickSide(fair, yes, no, Math.random);
      try {
        const hash = await send(r.bot, cfg.market, marketAbi, "call", [
          m.id,
          side === "YES" ? 1 : 2,
          BigInt(stake),
          "0x0000000000000000000000000000000000000000",
        ]);
        console.log(
          `bot ${r.bot.n} → #${m.id} ${side} ${stake} pts (fair YES ${Math.round(fair * 100)}%, pools ${yes}/${no}) ${hash}`,
        );
        joined.get(r.bot.address)!.add(m.id);
        r.balance -= stake;
        inMarket++;
        if (side === "YES") yes += stake;
        else no += stake;
        budget--;
      } catch (e) {
        console.error(`bot ${r.bot.n} call on #${m.id} failed:`, e instanceof Error ? e.message : e);
      }
    }
  }
}

if (values.status) {
  await status();
} else if (values.fund) {
  if (!values.from) throw new Error("Say which wallet pays: --from AGENT_PRIVATE_KEY (or another key name in .env)");
  await fund(values.fund, values.from);
  await status();
} else {
  console.log(`${bots.length} liquidity bots, up to ${values["per-round"]} calls every ${values.every}s`);
  do {
    try {
      await round();
    } catch (e) {
      console.error("round failed:", e instanceof Error ? e.message : e);
    }
    if (values.once) break;
    await sleep(Number(values.every) * 1000);
  } while (true);
}
