/** Pure decision logic, shared by the resolver loop and covered by unit tests. */

export type OnchainMarket = {
  id: bigint;
  videoId: string;
  threshold: bigint;
  baselineViews?: bigint;
  closeTime?: bigint;
  resolveTime: bigint;
  status: number; // 0 open, 1 resolved, 2 voided
};

export type Action = { kind: "resolve"; id: bigint; views: bigint } | { kind: "void"; id: bigint; reason: string };

/** What to do with each market that is due, given the latest view counts. */
export function decide(markets: OnchainMarket[], views: Map<string, bigint>, nowSec: bigint): Action[] {
  const actions: Action[] = [];
  for (const m of markets) {
    if (m.status !== 0 || m.resolveTime > nowSec) continue;
    const v = views.get(m.videoId);
    if (v === undefined) actions.push({ kind: "void", id: m.id, reason: "video unavailable (deleted or private)" });
    else actions.push({ kind: "resolve", id: m.id, views: v });
  }
  return actions;
}

/**
 * A fair-feeling target: current views grown by the expected rate for the window, rounded to 2
 * significant figures so it reads well on a card ("1.4M").
 */
export function suggestThreshold(currentViews: bigint, growthPct: number): bigint {
  const raw = (currentViews * BigInt(Math.round((100 + growthPct) * 100))) / 10_000n;
  const digits = raw.toString().length;
  if (digits <= 2) return raw > currentViews ? raw : currentViews + 1n;
  const unit = 10n ** BigInt(digits - 2);
  const rounded = ((raw + unit / 2n) / unit) * unit;
  return rounded > currentViews ? rounded : currentViews + unit;
}

export function parseDuration(s: string): number {
  const m = s.match(/^(\d+)(s|m|h|d)$/);
  if (!m) throw new Error(`bad duration "${s}" (use e.g. 30m, 6h, 1d)`);
  return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as "s" | "m" | "h" | "d"];
}

/**
 * Target for a short "sprint" market on a fresh upload: current views plus the views expected over the
 * window at the upload's average pace so far, discounted for decay. Rounded to a readable number at the
 * scale of the expected gain, so it lands near a coin flip rather than a sure thing.
 */
export function sprintThreshold(views: bigint, hoursSincePublish: number, windowHours: number, decay = 0.8): bigint {
  const pacePerHour = Number(views) / Math.max(0.25, hoursSincePublish);
  const gain = Math.max(100, pacePerHour * windowHours * decay);
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(gain)) - 1);
  return BigInt(Math.round((Number(views) + gain) / unit) * unit);
}
