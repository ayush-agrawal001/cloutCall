import { Side, type SideValue } from "./markets";

export type DuelParams = {
  marketId: bigint;
  from: `0x${string}`;
  handle?: string;
  side?: SideValue;
  sealed?: boolean;
  ms?: number;
  /** Points won, for result cards. */
  won?: bigint | number;
};

export function cleanHandle(h: string | undefined | null) {
  return (h ?? "").replace(/[^\w.-]/g, "").slice(0, 20);
}

export function duelPath(p: DuelParams) {
  const q = new URLSearchParams({ vs: p.from });
  if (p.handle) q.set("h", cleanHandle(p.handle));
  if (p.sealed) q.set("sealed", "1");
  else if (p.side) q.set("side", String(p.side));
  if (p.ms) q.set("ms", String(p.ms));
  if (p.won) q.set("won", String(p.won));
  return `/d/${p.marketId}?${q}`;
}

export function ogPath(q: Record<string, string | number | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") s.set(k, String(v));
  return `/api/og?${s}`;
}

export function sideLabel(side?: SideValue) {
  return side === Side.Yes ? "YES" : side === Side.No ? "NO" : "?";
}

export function duelText(opts: { title: string; target: string; side?: SideValue; sealed?: boolean; ms?: number }) {
  const call = opts.sealed ? "sealed my call 🔒" : `called ${sideLabel(opts.side)}`;
  const speed = opts.ms ? ` Final in ${opts.ms}ms on @monad.` : "";
  return `I ${call} on "${opts.title}" hitting ${opts.target} views.${speed} Think I'm wrong? Take the other side 👇`;
}

export function winText(opts: { title: string; won: string; side?: SideValue }) {
  return `Called it ✅ ${sideLabel(opts.side)} on "${opts.title}" — +${opts.won} pts on CloutCall. Who's next? 👇`;
}

export function xIntent(text: string, url: string) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function linkedInShare(url: string) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}
