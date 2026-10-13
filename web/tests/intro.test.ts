/** Landing / sign-in explainer facts (run: npx tsx --test tests/intro.test.ts). No browser, chain or server needed. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  PAYOUT_EXAMPLE,
  PAYOUT_EXAMPLE_RESULT,
  payoutFor,
  REFILL_BELOW,
  REFILL_POINTS,
  safeNext,
  STARTER_POINTS,
} from "../lib/intro";

const points = readFileSync(new URL("../../contracts/src/CloutPoints.sol", import.meta.url), "utf8");
const constant = (name: string) => Number(points.match(new RegExp(`${name} = ([\\d_]+)`))?.[1].replaceAll("_", ""));

test("explained amounts match CloutPoints.sol", () => {
  assert.equal(STARTER_POINTS, constant("STARTER_GRANT"));
  assert.equal(REFILL_POINTS, constant("REFILL_GRANT"));
  assert.equal(REFILL_BELOW, constant("REFILL_THRESHOLD"));
});

test("payout mirrors CloutMarket._payout", () => {
  assert.equal(PAYOUT_EXAMPLE_RESULT, 250);
  assert.equal(payoutFor(PAYOUT_EXAMPLE.stake, PAYOUT_EXAMPLE.yesPool, PAYOUT_EXAMPLE.noPool), 250);
  assert.equal(payoutFor(100, 300, 0), 100, "no losers: stake back");
  assert.equal(payoutFor(100, 0, 500), 100, "nobody won: stake back");
  assert.equal(payoutFor(1, 3, 1), 1, "integer division rounds down");
});

test("safeNext only follows same-site paths", () => {
  assert.equal(safeNext(null), "/markets");
  assert.equal(safeNext("/m/7"), "/m/7");
  assert.equal(safeNext("/d/3?side=no"), "/d/3?side=no");
  for (const bad of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/signin",
    "/signin?new=1",
  ]) {
    assert.equal(safeNext(bad), "/markets", bad);
  }
});
