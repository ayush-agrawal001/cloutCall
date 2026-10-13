/**
 * Call history and standings, read from contract state (Monad RPCs only serve ~100 blocks of logs, so events
 * can't reach back far enough). Every position is read in batched Multicall3 calls, and results are worked out
 * with the same formula as CloutMarket._payout. The pure parts are exported for tests.
 */
import type { Address } from "viem";
import { journalAbi, marketAbi } from "./abi";
import { AGENT_ADDRESS, JOURNAL_ADDRESS, MARKET_ADDRESS, publicClient } from "./chain";
import { fetchMarkets, phaseOf, Side, Status, type Market, type SideValue } from "./markets";

export type Position = {
  yes: bigint;
  no: bigint;
  sealedStake: bigint;
  commitment: `0x${string}`;
  revealed: boolean;
  claimed: boolean;
};

export type CallStatus = "open" | "settling" | "won" | "lost" | "refunded";

export type CallRow = {
  market: Market;
  /** Everything at risk, including an unrevealed sealed call. */
  staked: bigint;
  /** The side(s) called; "sealed" while a sealed call is unrevealed. */
  side: "YES" | "NO" | "BOTH" | "SEALED";
  status: CallStatus;
  /** What the market pays this player once settled (0 for a loss). */
  payout: bigint;
  /** payout − staked once settled. */
  net: bigint;
  claimed: boolean;
  /** Settled, owed something, not collected yet. */
  collectable: boolean;
};

const ZERO = `0x${"0".repeat(64)}` as const;

/** Mirrors CloutMarket._staked. */
export function stakedIn(p: Position): bigint {
  return p.yes + p.no + (p.revealed ? 0n : p.sealedStake);
}

/** Mirrors CloutMarket._payout. */
export function payoutOf(m: Market, p: Position): bigint {
  if (m.status === Status.Voided) return stakedIn(p);
  if (m.status !== Status.Resolved) return 0n;
  const revealed = p.yes + p.no;
  const winPool = m.outcome === Side.Yes ? m.yesPool : m.noPool;
  const losePool = (m.outcome === Side.Yes ? m.noPool : m.yesPool) + m.sealedPool;
  if (winPool === 0n) return revealed;
  const winStake = m.outcome === Side.Yes ? p.yes : p.no;
  return winStake + (winStake * losePool) / winPool;
}

/** One row of a player's history, or null when they never staked in this market. */
export function callRow(m: Market, p: Position, nowSec = Math.floor(Date.now() / 1000)): CallRow | null {
  const staked = stakedIn(p);
  if (staked === 0n) return null;
  const sealedOpen = !p.revealed && p.sealedStake > 0n && p.commitment !== ZERO;
  const side =
    sealedOpen && p.yes + p.no === 0n ? "SEALED" : p.yes > 0n && p.no > 0n ? "BOTH" : p.yes > 0n ? "YES" : "NO";
  const phase = phaseOf(m, nowSec);
  if (phase === "open" || phase === "revealing") {
    return {
      market: m,
      staked,
      side,
      status: phase === "open" ? "open" : "settling",
      payout: 0n,
      net: 0n,
      claimed: false,
      collectable: false,
    };
  }
  const payout = payoutOf(m, p);
  const status: CallStatus =
    phase === "voided" ? "refunded" : payout > staked ? "won" : payout < staked ? "lost" : "refunded";
  return {
    market: m,
    staked,
    side,
    status,
    payout,
    net: payout - staked,
    claimed: p.claimed,
    collectable: !p.claimed && payout > 0n,
  };
}

export type CallRecord = {
  calls: number;
  wins: number;
  losses: number;
  net: bigint;
  atStake: bigint;
  uncollected: bigint;
};

export function recordOf(rows: CallRow[]): CallRecord {
  const r: CallRecord = { calls: rows.length, wins: 0, losses: 0, net: 0n, atStake: 0n, uncollected: 0n };
  for (const row of rows) {
    if (row.status === "won") r.wins++;
    if (row.status === "lost") r.losses++;
    if (row.status === "open" || row.status === "settling") r.atStake += row.staked;
    else r.net += row.net;
    if (row.collectable) r.uncollected += row.payout;
  }
  return r;
}

export function winRate(r: Pick<CallRecord, "wins" | "losses">) {
  return r.wins + r.losses ? r.wins / (r.wins + r.losses) : null;
}

let marketsCache: { at: number; promise: Promise<Market[]> } | undefined;

/** All markets, newest first. Shared for a few seconds, so panels on one page don't each re-read them. */
export function allMarkets(maxAgeMs = 4_000): Promise<Market[]> {
  if (marketsCache && Date.now() - marketsCache.at < maxAgeMs) return marketsCache.promise;
  const promise = (async () => {
    const out: Market[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await fetchMarkets(offset, 100);
      out.push(...page);
      if (page.length < 100) return out;
    }
  })();
  marketsCache = { at: Date.now(), promise };
  promise.catch(() => {
    if (marketsCache?.promise === promise) marketsCache = undefined; // don't cache a failure
  });
  return promise;
}

/** positionOf for every (market, player) pair, in batched Multicall3 calls. */
export async function positions(markets: Market[], players: Address[]): Promise<Map<string, Position>> {
  const pairs = players.flatMap((player) => markets.map((m) => ({ player, m })));
  const res = await publicClient.multicall({
    allowFailure: true,
    batchSize: 16_384,
    contracts: pairs.map(({ player, m }) => ({
      address: MARKET_ADDRESS,
      abi: marketAbi,
      functionName: "positionOf",
      args: [m.id, player],
    })),
  });
  const out = new Map<string, Position>();
  res.forEach((r, i) => {
    if (r.status === "success")
      out.set(`${pairs[i].player.toLowerCase()}:${pairs[i].m.id}`, r.result as unknown as Position);
  });
  return out;
}

export function rowsFor(player: Address, markets: Market[], pos: Map<string, Position>, nowSec?: number) {
  const rows: CallRow[] = [];
  for (const m of markets) {
    const p = pos.get(`${player.toLowerCase()}:${m.id}`);
    const row = p && callRow(m, p, nowSec);
    if (row) rows.push(row);
  }
  return rows;
}

/** One player's full history, newest market first. */
export async function fetchHistory(player: Address) {
  const markets = await allMarkets();
  const pos = await positions(markets, [player]);
  return rowsFor(player, markets, pos);
}

export type AiCallRow = CallRow & {
  pick: {
    side: SideValue;
    confidence: number;
    predictedViews: bigint;
    recordedAt: bigint;
    model: string;
    reasoning: string;
  };
  /** Whether the AI's recorded side matched the outcome (null until settled, or when cancelled). */
  right: boolean | null;
};

/** Every CloutBot pick (from AgentJournal) joined with its stake and result. */
export async function fetchAiHistory(): Promise<AiCallRow[]> {
  if (!AGENT_ADDRESS || !JOURNAL_ADDRESS) return [];
  const markets = await allMarkets();
  const [pos, picks] = await Promise.all([
    positions(markets, [AGENT_ADDRESS]),
    publicClient.multicall({
      allowFailure: true,
      batchSize: 16_384,
      contracts: markets.map((m) => ({
        address: JOURNAL_ADDRESS!,
        abi: journalAbi,
        functionName: "pickOf",
        args: [m.id, AGENT_ADDRESS!],
      })),
    }),
  ]);
  const out: AiCallRow[] = [];
  markets.forEach((m, i) => {
    const r = picks[i];
    if (r.status !== "success") return;
    const p = r.result as unknown as {
      side: number;
      confidenceBps: number;
      predictedViews: bigint;
      recordedAt: bigint;
      model: string;
      reasoning: string;
    };
    if (p.recordedAt === 0n) return;
    const position = pos.get(`${AGENT_ADDRESS!.toLowerCase()}:${m.id}`);
    const row = position && callRow(m, position);
    if (!row) return;
    const settled = m.status === Status.Resolved;
    out.push({
      ...row,
      pick: {
        side: p.side as SideValue,
        confidence: Math.round(p.confidenceBps / 100),
        predictedViews: p.predictedViews,
        recordedAt: p.recordedAt,
        model: p.model,
        reasoning: p.reasoning,
      },
      right: settled ? p.side === m.outcome : null,
    });
  });
  return out;
}

export type Standing = CallRecord & { address: Address; available: bigint; total: bigint };

/**
 * Everyone's standing: points on hand + points riding on unsettled calls + winnings not yet collected, so a
 * player with all their points in play isn't shown as broke. `exclude` drops house bots.
 */
export async function fetchStandings(exclude: (a: Address) => boolean): Promise<Standing[]> {
  const [players, balances] = await publicClient.readContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "getPlayers",
    args: [0n, 500n],
  });
  const people = players.map((a, i) => ({ address: a, available: balances[i] })).filter((p) => !exclude(p.address));
  const markets = await allMarkets();
  const pos = await positions(
    markets,
    people.map((p) => p.address),
  );
  return people
    .map((p) => {
      const r = recordOf(rowsFor(p.address, markets, pos));
      return { ...r, address: p.address, available: p.available, total: p.available + r.atStake + r.uncollected };
    })
    .filter((s) => s.calls > 0 || s.total > 0n)
    .sort((a, b) => (b.total === a.total ? Number(b.net - a.net) : b.total > a.total ? 1 : -1));
}
