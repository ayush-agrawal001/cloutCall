import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEther, type Address } from "viem";
import { MIN_TRANSFER, planRebalance, TRANSFER_FEE, type WalletState } from "../src/gas-logic";

const w = (name: string, balance: string, target: string): WalletState => ({
  name,
  address: `0x${name.padStart(40, "0")}` as Address,
  balance: parseEther(balance),
  target: parseEther(target),
});

test("moves spare MON to the wallets under target, most important first", () => {
  const keeper = w("1", "0.6", "2");
  const agent = w("2", "4.97", "1");
  const drip = w("3", "0.45", "0.5");
  const plan = planRebalance([keeper, agent, drip]);
  assert.deepEqual(plan[0], { from: agent.address, to: keeper.address, amount: parseEther("1.4") });
  assert.equal(plan[1].to, drip.address);
  assert.equal(plan[1].amount, parseEther("0.05"));
});

test("a donor never drops below its own target (plus fees)", () => {
  const keeper = w("1", "0", "5");
  const agent = w("2", "2", "1");
  const plan = planRebalance([keeper, agent]);
  const sent = plan.reduce((s, t) => s + t.amount, 0n);
  assert.equal(sent, parseEther("1") - TRANSFER_FEE);
});

test("nothing to do when everyone is at target or nobody has spare", () => {
  assert.deepEqual(planRebalance([w("1", "2", "2"), w("2", "1", "1")]), []);
  assert.deepEqual(planRebalance([w("1", "0.1", "2"), w("2", "0.2", "1")]), []);
  // Tiny gaps aren't worth a transaction.
  const gap = parseEther("2") - MIN_TRANSFER / 2n;
  assert.deepEqual(planRebalance([{ ...w("1", "0", "2"), balance: gap }, w("2", "5", "1")]), []);
});
