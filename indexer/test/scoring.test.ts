import assert from "node:assert/strict";
import { test } from "node:test";
import { isUpset, payout, result, staked } from "../src/scoring";

const pools = { yesPool: 400n, noPool: 200n, sealedPool: 0n };

test("payout mirrors the contract's parimutuel split", () => {
  const alice = { yes: 300n, no: 0n, sealedStake: 0n, revealed: false };
  assert.equal(payout(pools, "YES", alice), 450n);
  assert.equal(payout(pools, "NO", alice), 0n);
  assert.equal(result(payout(pools, "YES", alice) - staked(alice)), "win");
});

test("unrevealed sealed stakes are lost and go to winners", () => {
  const m = { yesPool: 100n, noPool: 100n, sealedPool: 300n };
  const sealed = { yes: 0n, no: 0n, sealedStake: 300n, revealed: false };
  const bob = { yes: 100n, no: 0n, sealedStake: 0n, revealed: false };
  assert.equal(staked(sealed), 300n);
  assert.equal(payout(m, "YES", sealed), 0n);
  assert.equal(payout(m, "YES", bob), 500n);
});

test("nobody right means refunds (push)", () => {
  const m = { yesPool: 0n, noPool: 300n, sealedPool: 0n };
  const p = { yes: 0n, no: 300n, sealedStake: 0n, revealed: false };
  assert.equal(result(payout(m, "YES", p) - staked(p)), "push");
});

test("upsets are wins on a side priced under 30%", () => {
  assert.equal(isUpset({ yesPool: 20n, noPool: 80n, sealedPool: 0n }, "YES"), true);
  assert.equal(isUpset({ yesPool: 40n, noPool: 60n, sealedPool: 0n }, "YES"), false);
});
