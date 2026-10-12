"use client";

import Link from "next/link";
import { useVideoMeta } from "@/lib/useVideoMeta";
import { formatPoints, formatViews, phaseOf, Side, thumbnail, timeLeft, yesShare, type Market } from "@/lib/markets";

export function PhaseBadge({ market }: { market: Market }) {
  const phase = phaseOf(market);
  const styles: Record<string, string> = {
    open: "bg-yes/15 text-yes",
    revealing: "bg-warn/15 text-warn",
    resolved: "bg-accent/20 text-accent-2",
    voided: "bg-line text-muted",
  };
  const label =
    phase === "open"
      ? `Closes in ${timeLeft(market.closeTime)}`
      : phase === "revealing"
        ? `Settles in ${timeLeft(market.resolveTime)}`
        : phase === "resolved"
          ? market.outcome === Side.Yes
            ? "Settled · YES"
            : "Settled · NO"
          : "Voided";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[phase]}`}>{label}</span>;
}

export function PoolBar({ market }: { market: Market }) {
  const yes = yesShare(market);
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="bg-yes transition-all duration-500" style={{ width: `${yes * 100}%` }} />
        <div className="bg-no transition-all duration-500" style={{ width: `${(1 - yes) * 100}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span className="text-yes">YES {Math.round(yes * 100)}%</span>
        {market.sealedPool > 0n && <span>🔒 {formatPoints(market.sealedPool)} sealed</span>}
        <span className="text-no">NO {Math.round((1 - yes) * 100)}%</span>
      </div>
    </div>
  );
}

export function MarketCard({ market }: { market: Market }) {
  const meta = useVideoMeta(market.videoId);
  const gain = market.threshold > market.baselineViews ? market.threshold - market.baselineViews : 0n;
  return (
    <Link href={`/m/${market.id}`} className="card group block overflow-hidden transition hover:border-accent/60">
      <div className="relative aspect-video overflow-hidden bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnail(market.videoId)}
          alt=""
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute left-3 top-3">
          <PhaseBadge market={market} />
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="line-clamp-2 font-semibold leading-snug">{meta?.title ?? "Loading video…"}</p>
          <p className="mt-0.5 text-xs text-muted">{meta?.author ?? " "}</p>
        </div>
        <p className="text-sm">
          Hits <span className="font-bold text-accent-2">{formatViews(market.threshold)}</span> views by{" "}
          {new Date(Number(market.resolveTime) * 1000).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          ?
          {gain > 0n && <span className="text-muted"> (+{formatViews(gain)})</span>}
        </p>
        <PoolBar market={market} />
      </div>
    </Link>
  );
}
