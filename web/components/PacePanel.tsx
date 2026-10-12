"use client";

import { useEffect, useState } from "react";
import { formatViews, phaseOf, type Market } from "@/lib/markets";

type Sample = { t: number; views: number };

export function isSprint(m: Pick<Market, "closeTime" | "resolveTime">) {
  return Number(m.resolveTime - m.closeTime) <= 3600;
}

function perMinute(a: Sample, b: Sample) {
  return ((b.views - a.views) / (b.t - a.t)) * 60_000;
}

/** Live view count vs the pace the target needs, with a sparkline. Polls the shared 30s cache. */
export function PacePanel({ market }: { market: Market }) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const phase = phaseOf(market);
  const active = phase === "open" || phase === "revealing";

  useEffect(() => {
    if (!active) return;
    let live = true;
    const load = () =>
      fetch(`/api/views/${market.videoId}`)
        .then(async (r) => {
          if (!r.ok) throw new Error();
          const v = (await r.json()) as { views: number; at: number };
          if (!live) return;
          setSamples((prev) =>
            prev.length && prev[prev.length - 1].views === v.views
              ? prev
              : [...prev, { t: v.at, views: v.views }].slice(-60),
          );
        })
        .catch(() => live && setUnavailable(true));
    load();
    const t = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [active, market.videoId]);

  if (!active || unavailable || samples.length === 0) return null;

  const now = samples[samples.length - 1];
  const target = Number(market.threshold);
  const minutesLeft = Math.max(0, (Number(market.resolveTime) * 1000 - now.t) / 60_000);
  const gap = Math.max(0, target - now.views);
  const needed = minutesLeft > 0 ? gap / minutesLeft : Infinity;
  const recent = samples.length >= 2 ? perMinute(samples[Math.max(0, samples.length - 6)], now) : null;
  const projected = recent !== null ? now.views + recent * minutesLeft : null;
  const onPace = gap === 0 || (recent !== null && recent >= needed);

  // Sparkline from the samples we've seen, with the target as a dashed line.
  const W = 300;
  const H = 70;
  const lo = Math.min(...samples.map((s) => s.views), Number(market.baselineViews));
  const hi = Math.max(target, now.views);
  const y = (v: number) => H - 6 - ((v - lo) / Math.max(1, hi - lo)) * (H - 12);
  const t0 = samples[0].t;
  const span = Math.max(1, now.t - t0);
  const pts = samples.map((s) => `${((s.t - t0) / span) * W},${y(s.views)}`).join(" ");

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-bold">
          <span className="live-dot" /> Live pace
        </p>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${onPace ? "bg-yes/15 text-yes" : "bg-no/15 text-no"}`}
        >
          {gap === 0 ? "Target hit" : recent === null ? "Measuring…" : onPace ? "On pace for YES" : "Behind pace"}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none" aria-hidden>
        <line
          x1="0"
          x2={W}
          y1={y(target)}
          y2={y(target)}
          stroke="var(--accent-2)"
          strokeDasharray="4 4"
          strokeWidth="1"
        />
        {samples.length > 1 && <polyline points={pts} fill="none" stroke="var(--yes)" strokeWidth="2" />}
      </svg>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-surface-2 p-2">
          <p className="text-muted">Now</p>
          <p className="text-base font-bold">{formatViews(now.views)}</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <p className="text-muted">Needs / min</p>
          <p className="text-base font-bold">{Number.isFinite(needed) ? formatViews(Math.ceil(needed)) : "—"}</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <p className="text-muted">Doing / min</p>
          <p className="text-base font-bold">{recent === null ? "…" : formatViews(Math.max(0, Math.round(recent)))}</p>
        </div>
      </div>
      {projected !== null && (
        <p className="text-xs text-muted">
          At this pace it settles around <b className="text-text">{formatViews(Math.round(projected))}</b> views vs a
          target of {formatViews(target)}. Public counters refresh about every 30s.
        </p>
      )}
    </div>
  );
}
