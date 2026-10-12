import { TxRevertedError, TxStatusUnknownError } from "./tx";

/**
 * New-account setup: sponsored gas from /api/drip, then the one-time starter grant.
 *
 * Kept free of React and network globals so every failure path can be tested. Safe to run again after
 * any failure: the starter claim is only sent while `claimedStarter` is false (and the contract rejects a
 * second claim anyway), and setup never stakes points.
 */

export type DripResult = { status: number; funded?: boolean; blockNumber?: string; error?: string };

/** A setup failure with a message meant for the player. */
export class SetupError extends Error {}

export type OnboardingDeps = {
  requestDrip: () => Promise<DripResult>;
  getBalance: () => Promise<bigint>;
  /** Waits out Monad's balance lag after a drip lands in `block`. */
  waitForDrip: (block: bigint) => Promise<void>;
  hasClaimedStarter: () => Promise<boolean>;
  /** Sends claimStarter and resolves once it is confirmed successful; throws otherwise. */
  claimStarter: () => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
};

export function dripFailureMessage(d: DripResult): string {
  if (d.status === 429 && d.error === "too many new accounts") {
    return "Too many new accounts have joined from your network in the last hour, so gas can't be sponsored yet. Try again later.";
  }
  if (d.status === 429) return "Gas was sent to this account a few minutes ago. Try again shortly.";
  if (d.error === "drip not configured") return "Gas sponsorship isn't set up on this server.";
  if (d.status === 503) return "The gas sponsor is busy. Try again in a moment.";
  return "Couldn't sponsor gas right now (the sponsor wallet may be empty). Try again later.";
}

function claimFailureMessage(e: unknown): string {
  if (e instanceof TxStatusUnknownError) {
    return "Your starter-points transaction was sent but isn't confirmed yet. Wait a moment, then retry; it can't claim twice.";
  }
  if (e instanceof TxRevertedError) return "Claiming your starter points failed on-chain. Retry setup.";
  return "Couldn't claim your starter points. Retry setup.";
}

/** Returns "claimed" when this run granted the starter points, "already-claimed" when they were already there. */
export async function runOnboarding(deps: OnboardingDeps): Promise<"claimed" | "already-claimed"> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let drip = await deps.requestDrip();
  // The drip wallet serializes sends; one quick retry covers a busy moment.
  if (drip.status === 503 && drip.error !== "drip not configured") {
    await sleep(1500);
    drip = await deps.requestDrip();
  }
  const dripOk = drip.status >= 200 && drip.status < 300 && !drip.error;
  if (drip.funded && drip.blockNumber) await deps.waitForDrip(BigInt(drip.blockNumber));
  else if (!dripOk && (await deps.getBalance()) === 0n) throw new SetupError(dripFailureMessage(drip));

  if (await deps.hasClaimedStarter()) return "already-claimed";

  try {
    await deps.claimStarter();
  } catch (e) {
    // The claim may have landed even though the send reported a problem (e.g. a dropped connection).
    if (await deps.hasClaimedStarter().catch(() => false)) return "claimed";
    throw new SetupError(claimFailureMessage(e));
  }
  // Only a confirmed on-chain grant counts as done.
  if (!(await deps.hasClaimedStarter())) throw new SetupError("Your starter points didn't arrive. Retry setup.");
  return "claimed";
}
