/** Pure settlement math mirroring CloutMarket._payout, shared by handlers and tests. */

export type Pools = { yesPool: bigint; noPool: bigint; sealedPool: bigint };
export type Stake = { yes: bigint; no: bigint; sealedStake: bigint; revealed: boolean };
export type Outcome = "YES" | "NO";

export function staked(p: Stake) {
  return p.yes + p.no + (p.revealed ? 0n : p.sealedStake);
}

export function payout(m: Pools, outcome: Outcome, p: Stake) {
  const winPool = outcome === "YES" ? m.yesPool : m.noPool;
  const losePool = (outcome === "YES" ? m.noPool : m.yesPool) + m.sealedPool;
  if (winPool === 0n) return p.yes + p.no;
  const winStake = outcome === "YES" ? p.yes : p.no;
  return winStake + (winStake * losePool) / winPool;
}

export function result(profit: bigint): "win" | "loss" | "push" {
  return profit > 0n ? "win" : profit < 0n ? "loss" : "push";
}

/** A win on a side the crowd priced under 30% at settlement. */
export function isUpset(m: Pools, outcome: Outcome) {
  const total = m.yesPool + m.noPool;
  if (total === 0n) return false;
  const winPool = outcome === "YES" ? m.yesPool : m.noPool;
  return winPool * 100n < total * 30n;
}

export const sideName = (s: bigint) => (s === 1n ? "YES" : s === 2n ? "NO" : "NONE");
export const ZERO = "0x0000000000000000000000000000000000000000";
