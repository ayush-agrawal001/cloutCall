import type { Address } from "viem";
import { marketAbi } from "./abi";
import { MARKET_ADDRESS, publicClient } from "./chain";

export const Side = { None: 0, Yes: 1, No: 2 } as const;
export type SideValue = (typeof Side)[keyof typeof Side];

export const Status = { Open: 0, Resolved: 1, Voided: 2 } as const;

export type Market = {
  id: bigint;
  videoId: string;
  creator: Address;
  threshold: bigint;
  baselineViews: bigint;
  closeTime: bigint;
  resolveTime: bigint;
  finalViews: bigint;
  status: number;
  outcome: number;
  yesPool: bigint;
  noPool: bigint;
  sealedPool: bigint;
};

export type Phase = "open" | "revealing" | "resolved" | "voided";

export function phaseOf(m: Market, nowSec = Math.floor(Date.now() / 1000)): Phase {
  if (m.status === Status.Resolved) return "resolved";
  if (m.status === Status.Voided) return "voided";
  return nowSec < Number(m.closeTime) ? "open" : "revealing";
}

export async function fetchMarkets(offset = 0, limit = 30): Promise<Market[]> {
  const [page, ids] = await publicClient.readContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "getMarkets",
    args: [BigInt(offset), BigInt(limit)],
  });
  return page.map((m, i) => ({ ...m, id: ids[i] }));
}

export async function fetchMarket(id: bigint): Promise<Market> {
  const m = await publicClient.readContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "getMarket",
    args: [id],
  });
  return { ...m, id };
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function formatViews(v: bigint | number) {
  return compact.format(Number(v));
}

export function formatPoints(v: bigint | number) {
  return new Intl.NumberFormat("en").format(Number(v));
}

/** Implied YES probability from the parimutuel pools (50% when empty). */
export function yesShare(m: Pick<Market, "yesPool" | "noPool">) {
  const total = Number(m.yesPool + m.noPool);
  return total === 0 ? 0.5 : Number(m.yesPool) / total;
}

/** Payout multiple a new caller would get on `side`, ignoring their own stake's dilution. */
export function multiple(m: Pick<Market, "yesPool" | "noPool" | "sealedPool">, side: SideValue) {
  const win = Number(side === Side.Yes ? m.yesPool : m.noPool);
  const lose = Number(side === Side.Yes ? m.noPool : m.yesPool) + Number(m.sealedPool);
  if (win === 0) return lose > 0 ? Infinity : 2;
  return 1 + lose / win;
}

export function timeLeft(targetSec: bigint | number, nowSec = Math.floor(Date.now() / 1000)) {
  let s = Number(targetSec) - nowSec;
  if (s <= 0) return "now";
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function thumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
