"use client";

/* eslint-disable @next/next/no-img-element -- YouTube thumbnails */
import Link from "next/link";
import type { ReactNode } from "react";
import { clockTime, formatPoints, formatViewsFine, thumbnail } from "@/lib/markets";
import type { CallRecord, CallRow, CallStatus } from "@/lib/portfolio";
import { winRate } from "@/lib/portfolio";
import { useVideoMeta } from "@/lib/useVideoMeta";

const STATUS: Record<CallStatus, { label: string; cls: string }> = {
  open: { label: "OPEN", cls: "border-ink bg-lime text-ink" },
  settling: { label: "SETTLING", cls: "border-ink bg-[#ff7a00] text-ink" },
  won: { label: "WON", cls: "border-ink bg-lime text-ink" },
  lost: { label: "LOST", cls: "border-ink bg-magenta text-ink" },
  refunded: { label: "REFUNDED", cls: "border-line text-muted" },
};

export function signed(v: bigint) {
  return `${v > 0n ? "+" : v < 0n ? "−" : ""}${formatPoints(v < 0n ? -v : v)}`;
}

/** Calls, record and net points in one strip. */
export function RecordStrip({ record, extra }: { record: CallRecord; extra?: ReactNode }) {
  const rate = winRate(record);
  const cells: [string, ReactNode][] = [
    ["CALLS", record.calls],
    ["RECORD", `${record.wins}–${record.losses}`],
    ["WIN RATE", rate === null ? "—" : `${Math.round(rate * 100)}%`],
    [
      "NET POINTS",
      <span key="n" className={record.net > 0n ? "text-yes" : record.net < 0n ? "text-no" : ""}>
        {signed(record.net)}
      </span>,
    ],
    ["IN PLAY", formatPoints(record.atStake)],
  ];
  return (
    <div className="card grid grid-cols-2 sm:grid-cols-5">
      {cells.map(([k, v]) => (
        <div key={k} className="border-b border-r border-line p-3 last:border-r-0 sm:border-b-0">
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted">{k}</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums tracking-[-0.02em]">{v}</p>
        </div>
      ))}
      {extra}
    </div>
  );
}

/** One call: the market, the side and stake, and what happened. `children` adds a detail line (e.g. AI reasoning). */
export function CallItem({ row, action, children }: { row: CallRow; action?: ReactNode; children?: ReactNode }) {
  const meta = useVideoMeta(row.market.videoId);
  const s = STATUS[row.status];
  const settled = row.status === "won" || row.status === "lost" || row.status === "refunded";
  return (
    <li className="p-3">
      <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[104px_minmax(0,1fr)_auto]">
        <Link
          href={`/m/${row.market.id}`}
          className="relative block aspect-video overflow-hidden border border-line bg-black"
        >
          <img src={thumbnail(row.market.videoId)} alt="" className="h-full w-full object-cover" />
        </Link>
        <div className="min-w-0">
          <Link
            href={`/m/${row.market.id}`}
            className="line-clamp-1 font-bold leading-snug text-text no-underline hover:underline"
          >
            {meta?.title ?? "Loading video…"}
          </Link>
          <p className="mt-0.5 font-mono text-[11px] text-muted">
            #{row.market.id.toString()} · TARGET {formatViewsFine(row.market.threshold)} BY{" "}
            {clockTime(row.market.resolveTime)}
            {settled && row.market.finalViews > 0n && ` · FINAL ${formatViewsFine(row.market.finalViews)}`}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <span
              className={`border px-1.5 py-0.5 font-semibold ${
                row.side === "YES"
                  ? "border-ink bg-lime text-ink"
                  : row.side === "NO"
                    ? "border-ink bg-magenta text-ink"
                    : "border-line"
              }`}
            >
              {row.side === "SEALED" ? "🔒 SEALED" : row.side}
            </span>
            <span className="text-muted">{formatPoints(row.staked)} PTS</span>
          </p>
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-2 font-mono text-[11px] sm:col-span-1 sm:flex-col sm:items-end">
          <span className={`border px-1.5 py-0.5 font-semibold ${s.cls}`}>{s.label}</span>
          {settled && (
            <span className={row.net > 0n ? "text-yes" : row.net < 0n ? "text-no" : "text-muted"}>
              {signed(row.net)} PTS{row.collectable ? " · UNCOLLECTED" : ""}
            </span>
          )}
          {action}
        </div>
      </div>
      {children}
    </li>
  );
}
