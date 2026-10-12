/** Account setup paths (run: npx tsx --test tests/onboarding.test.ts). No chain or server needed. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { runOnboarding, SetupError, type DripResult, type OnboardingDeps } from "../lib/onboarding";
import { TxRevertedError, TxStatusUnknownError } from "../lib/tx";

const HASH = `0x${"ab".repeat(32)}` as const;

/** A fake account: tracks drips, claims and the on-chain `claimedStarter` flag. */
function account(opts: { drips?: DripResult[]; balance?: bigint; claimed?: boolean; claim?: () => Promise<void> }) {
  const state = { claimed: opts.claimed ?? false, claimCalls: 0, dripCalls: 0, waited: [] as bigint[], slept: 0 };
  const drips = [...(opts.drips ?? [{ status: 200, funded: true, blockNumber: "42" }])];
  const deps: OnboardingDeps = {
    requestDrip: async () => (state.dripCalls++, drips.length > 1 ? drips.shift()! : drips[0]),
    getBalance: async () => opts.balance ?? 0n,
    waitForDrip: async (b) => void state.waited.push(b),
    hasClaimedStarter: async () => state.claimed,
    claimStarter:
      opts.claim ??
      (async () => {
        state.claimCalls++;
        state.claimed = true;
      }),
    sleep: async () => void state.slept++,
  };
  return { deps, state };
}

const rejectsWith = (p: Promise<unknown>, re: RegExp) =>
  assert.rejects(p, (e: unknown) => e instanceof SetupError && re.test(e.message));

test("new account: drip, wait for it, claim once", async () => {
  const { deps, state } = account({});
  assert.equal(await runOnboarding(deps), "claimed");
  assert.deepEqual(state.waited, [42n]);
  assert.equal(state.claimCalls, 1);
});

test("already claimed: nothing is sent", async () => {
  const { deps, state } = account({ claimed: true, drips: [{ status: 200, funded: false }] });
  assert.equal(await runOnboarding(deps), "already-claimed");
  assert.equal(state.claimCalls, 0);
});

test("HTTP 429 with no gas stops before claiming, with a clear reason", async () => {
  const { deps, state } = account({ drips: [{ status: 429, error: "too many new accounts" }] });
  await rejectsWith(runOnboarding(deps), /Too many new accounts/);
  assert.equal(state.claimCalls, 0);
  const cooldown = account({ drips: [{ status: 429, error: "slow down" }] });
  await rejectsWith(runOnboarding(cooldown.deps), /a few minutes ago/);
});

test("drip failure is fine when the account already has gas", async () => {
  const { deps, state } = account({ drips: [{ status: 429, error: "too many new accounts" }], balance: 10n ** 17n });
  assert.equal(await runOnboarding(deps), "claimed");
  assert.equal(state.claimCalls, 1);
});

test("a busy drip is retried once; an unconfigured or crashed drip is not", async () => {
  const busy = account({
    drips: [
      { status: 503, error: "drip busy, retry" },
      { status: 200, funded: true, blockNumber: "7" },
    ],
  });
  assert.equal(await runOnboarding(busy.deps), "claimed");
  assert.equal(busy.state.dripCalls, 2);

  const off = account({ drips: [{ status: 503, error: "drip not configured" }] });
  await rejectsWith(runOnboarding(off.deps), /isn't set up/);
  assert.equal(off.state.dripCalls, 1);

  // An empty sponsor wallet makes the route throw; the client sees a non-JSON 500.
  const empty = account({ drips: [{ status: 500, error: "HTTP 500" }] });
  await rejectsWith(runOnboarding(empty.deps), /sponsor wallet may be empty/);
});

test("a reverted claim is a failure, never a finished setup", async () => {
  const { deps } = account({
    claim: async () => {
      throw new TxRevertedError(HASH);
    },
  });
  await rejectsWith(runOnboarding(deps), /failed on-chain/);
});

test("an unconfirmed claim that actually landed counts; one that didn't is reported honestly", async () => {
  const landed = account({});
  landed.deps.claimStarter = async () => {
    landed.state.claimed = true; // it reached the chain…
    throw new TxStatusUnknownError(HASH); // …but the response was lost
  };
  assert.equal(await runOnboarding(landed.deps), "claimed");

  const pending = account({
    claim: async () => {
      throw new TxStatusUnknownError(HASH);
    },
  });
  await rejectsWith(runOnboarding(pending.deps), /isn't confirmed yet/);
});

test("a claim that 'succeeds' without the on-chain flag is not trusted", async () => {
  const { deps } = account({ claim: async () => {} });
  await rejectsWith(runOnboarding(deps), /didn't arrive/);
});

test("retrying after a temporary failure finishes setup, and never claims twice", async () => {
  const { deps, state } = account({
    drips: [
      { status: 429, error: "too many new accounts" },
      { status: 200, funded: true, blockNumber: "9" },
      { status: 200, funded: false },
    ],
  });
  await rejectsWith(runOnboarding(deps), /Too many new accounts/);
  assert.equal(await runOnboarding(deps), "claimed"); // Retry setup
  assert.equal(await runOnboarding(deps), "already-claimed"); // e.g. signing in again after a refresh
  assert.equal(state.claimCalls, 1);
});
