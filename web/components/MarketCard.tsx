"use client";

import Link from "next/link";
import { useAiPick } from "@/lib/ai";
import { isSprint } from "./PacePanel";
import { PixelIcon } from "./Pixel";
import { useVideoMeta } from "@/lib/useVideoMeta";
import { formatPoints, formatViews, phaseOf, Side, thumbnail, timeLeft, yesShare, type Market } from "@/lib/markets";

export function PhaseBadge({ market }: { market: Market }) {
  const phase = phaseOf(market);
  const styles: Record<string, string> = {
    open: "bg-lime text-ink",
    revealing: "bg-[#ff7a00] text-ink",
    resolved: "bg-cyan text-ink",
    voided: "bg-[#c9c6ce] text-ink",
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
  return (
    <span
      className={`border border-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${styles[phase]}`}
    >
      {label}
    </span>
  );
}

export function PoolBar({ market }: { market: Market }) {
  const yes = yesShare(market);
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden border border-line bg-surface-2">
        <div className="bg-yes transition-all duration-500" style={{ width: `${yes * 100}%` }} />
        <div className="bg-no transition-all duration-500" style={{ width: `${(1 - yes) * 100}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted">
        <span className="text-yes">YES {Math.round(yes * 100)}%</span>
        {market.sealedPool > 0n && (
          <span className="flex items-center gap-1">
            <PixelIcon name="lock" size={10} /> {formatPoints(market.sealedPool)} sealed
          </span>
        )}
        <span className="text-no">NO {Math.round((1 - yes) * 100)}%</span>
      </div>
    </div>
  );
}

export function MarketCard({ market }: { market: Market }) {
  const meta = useVideoMeta(market.videoId);
  const ai = useAiPick(market.id);
  const gain = market.threshold > market.baselineViews ? market.threshold - market.baselineViews : 0n;
  return (
    <Link href={`/m/${market.id}`} className="card lift group block text-text no-underline">
      <div className="glitch scanlines aspect-video border-b border-line bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbnail(market.videoId)} alt="" className="h-full w-full object-cover" />
        <div className="absolute left-2 top-2 z-10 flex gap-1.5">
          <PhaseBadge market={market} />
          {isSprint(market) && (
            <span className="flex items-center gap-1 border border-ink bg-[#ffe600] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-ink">
              <PixelIcon name="bolt" size={10} /> SPRINT
            </span>
          )}
        </div>
        {ai && (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 bg-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#f5f5f5]">
            <PixelIcon name="bot" size={10} label="CloutBot" />
            <span className={ai.side === Side.Yes ? "text-lime" : "text-magenta"}>
              {ai.side === Side.Yes ? "YES" : "NO"}
            </span>
            {ai.confidence}%
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="line-clamp-2 font-bold leading-snug tracking-[-0.015em]">{meta?.title ?? "Loading video…"}</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{meta?.author ?? " "}</p>
        </div>
        <p className="text-sm">
          Hits <span className="font-bold text-accent-2">{formatViews(market.threshold)}</span> views by{" "}
          {new Date(Number(market.resolveTime) * 1000).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          ?{gain > 0n && <span className="text-muted"> (+{formatViews(gain)})</span>}
        </p>
        <PoolBar market={market} />
      </div>
    </Link>
  );
}
