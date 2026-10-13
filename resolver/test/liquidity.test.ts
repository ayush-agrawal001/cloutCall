import assert from "node:assert/strict";
import { test } from "node:test";
import { botKey, fairYes, pickSide, stakeSize } from "../src/liquidity-logic";

const seed = "0x1111111111111111111111111111111111111111111111111111111111111111";
const fixed = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

test("botKey is deterministic and distinct per index", () => {
  assert.equal(botKey(seed, 0), botKey(seed, 0));
  assert.notEqual(botKey(seed, 0), botKey(seed, 1));
  assert.match(botKey(seed, 3), /^0x[0-9a-f]{64}$/);
});

test("fairYes follows the pace and stays away from certainty", () => {
  const base = { views: 100_000, hoursSincePublish: 10, hoursToResolve: 0.5 };
  // 10K/hour × 0.5h × 0.8 = 4K expected
  assert.ok(Math.abs(fairYes({ ...base, threshold: 104_000 }) - 0.5) < 0.01, "on the line ≈ coin flip");
  assert.ok(fairYes({ ...base, threshold: 101_000 }) > 0.8, "small gap → likely YES");
  assert.ok(fairYes({ ...base, threshold: 150_000 }) <= 0.1, "huge gap → likely NO");
  assert.equal(fairYes({ ...base, threshold: 90_000 }), 0.97, "already past the target");
  assert.equal(fairYes({ ...base, threshold: 150_000, hoursToResolve: 0 }), 0.03);
});

test("pickSide funds empty sides and leans toward the side short of its fair share", () => {
  assert.equal(pickSide(0.5, 0, 100, fixed(0.9)), "YES");
  assert.equal(pickSide(0.5, 100, 0, fixed(0.9)), "NO");
  // 20% of the pool is YES but fair is 60% → add YES (0.9 ≥ 0.3 so it balances rather than follows)
  assert.equal(pickSide(0.6, 20, 80, fixed(0.9)), "YES");
  assert.equal(pickSide(0.6, 90, 10, fixed(0.9)), "NO");
  // empty market → its own read
  assert.equal(pickSide(0.7, 0, 0, fixed(0.5)), "YES");
  assert.equal(pickSide(0.3, 0, 0, fixed(0.5)), "NO");
});

test("stakeSize stays within range and keeps a cushion", () => {
  for (const r of [0, 0.33, 0.99]) {
    const s = stakeSize(1_000, () => r);
    assert.ok(s >= 20 && s <= 120 && s % 5 === 0, String(s));
  }
  assert.equal(
    stakeSize(40, () => 0.99),
    30,
  );
  assert.ok(stakeSize(15, () => 0) < 10, "too poor to call");
});
