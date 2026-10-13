/**
 * Game facts the landing page and first-time sign-in explain, kept in one place so the copy can't drift from
 * the contracts. Kept free of React so the numbers can be tested.
 */

/** contracts/src/CloutPoints.sol: STARTER_GRANT, REFILL_GRANT, REFILL_THRESHOLD, REFILL_COOLDOWN. */
export const STARTER_POINTS = 1_000;
export const REFILL_POINTS = 250;
export const REFILL_BELOW = 50;

/** Hype Sprints the keeper opens (resolver/src/resolve.ts `--sprints`). */
export const SPRINT_MINUTES = 30;

/**
 * What a winning stake pays back, mirroring `_payout` in contracts/src/CloutMarket.sol: your stake back plus
 * your share of the losing side, in proportion to your stake on the winning side (integer division, as on-chain).
 */
export function payoutFor(stake: number, winningPool: number, losingPool: number): number {
  if (winningPool <= 0) return stake;
  return stake + Math.floor((stake * losingPool) / winningPool);
}

/** The worked example both pages show. `winningPool` already includes your stake. */
export const PAYOUT_EXAMPLE = { stake: 100, yesPool: 400, noPool: 600 } as const;
export const PAYOUT_EXAMPLE_RESULT = payoutFor(PAYOUT_EXAMPLE.stake, PAYOUT_EXAMPLE.yesPool, PAYOUT_EXAMPLE.noPool);

/** Only same-site paths are followed after sign-in, so `?next=` can't send anyone off-site. */
export function safeNext(next: string | null | undefined, fallback = "/markets"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next === "/signin" || next.startsWith("/signin?") || next.startsWith("/signin/")) return fallback;
  return next;
}
