/**
 * Pure rules for the liquidity bots (src/liquidity.ts), kept separate so they can be unit tested.
 *
 * The bots are house market makers, not fake players: they read the same public stats as everyone, price a
 * market from the video's pace, and lean toward whichever side is short of its fair share so both sides
 * always have points to win. Their addresses are published (NEXT_PUBLIC_HOUSE_BOTS) and labelled in the app.
 */
import { keccak256, toHex, type Hex } from "viem";

/** Bot i's private key: keccak256(seed ‖ i). One secret in .env recreates every bot. */
export function botKey(seed: Hex, index: number): Hex {
  return keccak256(`${seed}${toHex(index, { size: 4 }).slice(2)}` as Hex);
}

export type PaceInput = {
  views: number;
  threshold: number;
  hoursSincePublish: number;
  hoursToResolve: number;
};

/**
 * Probability the video reaches its target, from its lifetime pace decayed the same way sprint targets are
 * set (logic.sprintThreshold): views per hour × hours left × 0.8 against the gap still to cover.
 */
export function fairYes({ views, threshold, hoursSincePublish, hoursToResolve }: PaceInput, decay = 0.8): number {
  if (views >= threshold) return 0.97;
  if (hoursToResolve <= 0) return 0.03;
  const perHour = views / Math.max(0.25, hoursSincePublish);
  const expected = Math.max(1, perHour * hoursToResolve * decay);
  const gap = threshold - views;
  const p = 1 / (1 + Math.exp(-2.2 * Math.log(expected / gap)));
  return Math.min(0.9, Math.max(0.1, p));
}

/**
 * The side a bot takes. Most of the time it fills whichever side holds less than its fair share of the pool
 * (that keeps both sides funded and the odds near fair). Otherwise it follows its own read of `fair`.
 * `rand` is injected so tests are deterministic.
 */
export function pickSide(fair: number, yesPool: number, noPool: number, rand: () => number): "YES" | "NO" {
  const total = yesPool + noPool;
  const follow = () => (rand() < fair ? "YES" : "NO");
  if (total === 0) return follow();
  if (yesPool === 0) return "YES";
  if (noPool === 0) return "NO";
  if (rand() < 0.3) return follow();
  return yesPool / total < fair ? "YES" : "NO";
}

/** A modest stake: 20–120 points in steps of 5, never more than `balance` minus a 10-point cushion. */
export function stakeSize(balance: number, rand: () => number, min = 20, max = 120): number {
  const want = min + Math.floor((rand() * (max - min)) / 5) * 5;
  return Math.max(0, Math.min(want, balance - 10));
}
