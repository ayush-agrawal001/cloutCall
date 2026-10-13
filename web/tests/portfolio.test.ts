/** History and standings maths (run: npx tsx --test tests/portfolio.test.ts). No chain needed. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Side, Status, type Market } from "../lib/markets";
import { callRow, payoutOf, recordOf, stakedIn, winRate, type Position } from "../lib/portfolio";

const ZERO = `0x${"0".repeat(64)}` as const;
const market = (over: Partial<Market> = {}): Market => ({
  id: 1n,
  videoId: "aaaaaaaaaaa",
  creator: "0x0000000000000000000000000000000000000001",
  threshold: 1000n,
  baselineViews: 900n,
  closeTime: 100n,
  resolveTime: 200n,
  finalViews: 0n,
  status: Status.Open,
  outcome: Side.None,
  yesPool: 400n,
  noPool: 600n,
  sealedPool: 0n,
  ...over,
});
const pos = (over: Partial<Position> = {}): Position => ({
  yes: 0n,
  no: 0n,
  sealedStake: 0n,
  commitment: ZERO,
  revealed: false,
  claimed: false,
  ...over,
});

test("payout mirrors the contract: stake back plus a share of the losing side", () => {
  const won = market({ status: Status.Resolved, outcome: Side.Yes });
  assert.equal(payoutOf(won, pos({ yes: 100n })), 250n);
  assert.equal(payoutOf(won, pos({ no: 100n })), 0n);
  // Nobody on the winning side: revealed stakes come back.
  assert.equal(payoutOf(market({ status: Status.Resolved, outcome: Side.Yes, yesPool: 0n }), pos({ no: 100n })), 100n);
  // Cancelled: everything at risk comes back, sealed included.
  assert.equal(payoutOf(market({ status: Status.Voided }), pos({ yes: 50n, sealedStake: 30n })), 80n);
});

test("unrevealed sealed stakes count as at risk; revealed ones aren't double-counted", () => {
  assert.equal(stakedIn(pos({ sealedStake: 70n })), 70n);
  assert.equal(stakedIn(pos({ yes: 70n, sealedStake: 70n, revealed: true })), 70n);
});

test("rows say what happened to each call", () => {
  const now = 150;
  assert.equal(callRow(market(), pos(), now), null, "no stake, no row");
  assert.equal(callRow(market({ closeTime: 300n, resolveTime: 400n }), pos({ yes: 10n }), now)?.status, "open");
  assert.equal(callRow(market(), pos({ yes: 10n }), now)?.status, "settling");
  const won = callRow(market({ status: Status.Resolved, outcome: Side.Yes }), pos({ yes: 100n }), now)!;
  assert.deepEqual([won.status, won.payout, won.net, won.collectable], ["won", 250n, 150n, true]);
  const lost = callRow(market({ status: Status.Resolved, outcome: Side.No }), pos({ yes: 100n, claimed: true }), now)!;
  assert.deepEqual([lost.status, lost.net, lost.collectable], ["lost", -100n, false]);
  assert.equal(callRow(market({ status: Status.Voided }), pos({ no: 5n }), now)?.status, "refunded");
  assert.equal(
    callRow(
      market({ closeTime: 300n, resolveTime: 400n }),
      pos({ sealedStake: 9n, commitment: `0x${"1".repeat(64)}` }),
      now,
    )?.side,
    "SEALED",
  );
});

test("a record adds up wins, losses, net points and what's still in play", () => {
  const now = 150;
  const rows = [
    callRow(market({ status: Status.Resolved, outcome: Side.Yes }), pos({ yes: 100n }), now)!,
    callRow(market({ status: Status.Resolved, outcome: Side.No }), pos({ yes: 50n }), now)!,
    callRow(market({ closeTime: 300n, resolveTime: 400n }), pos({ no: 30n }), now)!,
  ];
  const r = recordOf(rows);
  assert.deepEqual([r.calls, r.wins, r.losses, r.net, r.atStake, r.uncollected], [3, 1, 1, 100n, 30n, 250n]);
  assert.equal(winRate(r), 0.5);
  assert.equal(winRate({ wins: 0, losses: 0 }), null);
});
