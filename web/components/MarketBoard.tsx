"use client";

/* eslint-disable @next/next/no-img-element -- YouTube thumbnails; next/image would need remote config */
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAiPick } from "@/lib/ai";
import { allMarkets } from "@/lib/portfolio";
import {
  clockTime,
  countdown,
  formatPoints,
  formatViewsFine,
  groupMarkets,
  multiple,
  Side,
  Status,
  thumbnail,
  type Market,
  type SideValue,
} from "@/lib/markets";
import { useLiveViews } from "@/lib/useLiveViews";
import { useVideoMeta } from "@/lib/useVideoMeta";
import { isSprint } from "./PacePanel";
import { PixelIcon } from "./Pixel";

type Tab = "open" | "settling" | "settled";
const RESULTS_PAGE = 12;

/** A one-second clock, read only in the browser (0 during prerender, before any market has loaded). */
function subscribeClock(cb: () => void) {
  const t = setInterval(cb, 1000);
  return () => clearInterval(t);
}
const nowSec = () => Math.floor(Date.now() / 1000);
function useNow() {
  return useSyncExternalStore(subscribeClock, nowSec, () => 0);
}

/** The markets page: what you can call now, what's waiting on its result, and what already settled. */
export function MarketBoard() {
  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [failing, setFailing] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);
  const [shown, setShown] = useState(RESULTS_PAGE);
  const now = useNow();

  useEffect(() => {
    let live = true;
    const load = () =>
      allMarkets()
        .then((m) => live && (setMarkets(m), setFailing(false)))
        .catch(() => live && setFailing(true));
    load();
    const t = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  if (!markets) {
    return (
      <div aria-busy className="space-y-4">
        <div className="h-12 animate-pulse border border-line bg-surface" />
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-[420px] animate-pulse" />
          ))}
        </div>
        {failing && <p className="text-sm text-muted">Can&apos;t reach Monad right now. Retrying…</p>}
      </div>
    );
  }

  const board = groupMarkets(markets, now);
  const active: Tab = tab ?? (board.open.length ? "open" : board.settling.length ? "settling" : "settled");
  const tabs: { id: Tab; label: string; count: number; hint: string }[] = [
    { id: "open", label: "Open for calls", count: board.open.length, hint: "Make your call before the clock runs out" },
    {
      id: "settling",
      label: "Settling",
      count: board.settling.length,
      hint: "Calls closed; waiting for the final count",
    },
    { id: "settled", label: "Results", count: board.settled.length, hint: "Settled markets, newest first" },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Markets" className="grid grid-cols-3 border border-line bg-surface">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              id={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex min-h-[52px] flex-col items-start justify-center gap-0.5 border-r border-line px-3 text-left last:border-r-0 sm:flex-row sm:items-center sm:gap-2 sm:px-4 ${
                on ? "bg-lime text-ink" : "hover:bg-[var(--soft)]"
              }`}
            >
              <span className="text-sm font-bold leading-tight">{t.label}</span>
              <span
                className={`border px-1.5 font-mono text-[11px] ${on ? "border-ink bg-ink text-lime" : "border-line text-muted"}`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>
      <p className="font-mono text-[11px] tracking-[0.08em] text-muted">
        {tabs.find((t) => t.id === active)!.hint.toUpperCase()}
        {failing && " · RECONNECTING…"}
      </p>

      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === "open" &&
          (board.open.length ? (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {board.open.map((m) => (
                <OpenCard key={m.id.toString()} market={m} now={now} />
              ))}
            </div>
          ) : (
            <Empty
              title="No markets are taking calls right now"
              body="New markets open as others settle, usually within a few minutes. Meanwhile, watch the ones settling."
              action={
                board.settling.length ? { label: "See what's settling", onClick: () => setTab("settling") } : undefined
              }
            />
          ))}

        {active === "settling" &&
          (board.settling.length ? (
            <ul className="card divide-y divide-[var(--line)]">
              {board.settling.map((m) => (
                <SettlingRow key={m.id.toString()} market={m} now={now} />
              ))}
            </ul>
          ) : (
            <Empty title="Nothing is waiting on a result" body="Markets move here once their calls close." />
          ))}

        {active === "settled" &&
          (board.settled.length ? (
            <>
              <ul className="card divide-y divide-[var(--line)]">
                {board.settled.slice(0, shown).map((m) => (
                  <ResultRow key={m.id.toString()} market={m} />
                ))}
              </ul>
              {board.settled.length > shown && (
                <button
                  type="button"
                  className="btn btn-ghost mt-3 w-full py-2.5 text-sm"
                  onClick={() => setShown((n) => n + RESULTS_PAGE)}
                >
                  Show more results
                </button>
              )}
            </>
          ) : (
            <Empty title="No results yet" body="Settled markets and their final view counts show up here." />
          ))}
      </div>
    </div>
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="card flex flex-col items-start gap-2 p-6">
      <p className="font-bold">{title}</p>
      <p className="max-w-[56ch] text-sm text-muted">{body}</p>
      {action && (
        <button type="button" className="btn btn-ghost mt-1 px-4 py-2 text-sm" onClick={action.onClick}>
          {action.label} <PixelIcon name="arrow" size={12} />
        </button>
      )}
    </div>
  );
}

/** Views since the market opened, toward the target. */
function TargetProgress({ market, views }: { market: Market; views: number | null }) {
  const base = Number(market.baselineViews);
  const target = Number(market.threshold);
  const now = views ?? base;
  const pct = target > base ? Math.min(100, Math.max(0, ((now - base) / (target - base)) * 100)) : 100;
  const hit = now >= target;
  return (
    <div>
      <div aria-hidden className="relative h-2 border border-line bg-surface-2">
        <div className={`h-full ${hit ? "bg-yes" : "bg-cyan"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between gap-2 font-mono text-[11px] text-muted">
        <span>{views === null ? `OPENED AT ${formatViewsFine(base)}` : `NOW ${formatViewsFine(now)}`}</span>
        <span className={hit ? "text-yes" : ""}>
          {hit ? "TARGET HIT" : `${formatViewsFine(Math.max(0, target - now))} TO GO`}
        </span>
      </div>
    </div>
  );
}

function payoutLabel(m: Market, side: SideValue) {
  const x = multiple(m, side);
  return Number.isFinite(x) ? `×${x.toFixed(x < 10 ? 2 : 1)}` : "takes all";
}

/** Who has staked what, or an honest "no calls yet" instead of a made-up 50/50. */
function Odds({ market }: { market: Market }) {
  const yes = Number(market.yesPool);
  const no = Number(market.noPool);
  const total = yes + no;
  if (total === 0) {
    return (
      <p className="border border-dashed border-line px-3 py-2 text-xs text-muted">
        No calls yet. The first call sets the odds.
        {market.sealedPool > 0n && ` ${formatPoints(market.sealedPool)} pts sealed.`}
      </p>
    );
  }
  return (
    <div>
      <div aria-hidden className="flex h-2 overflow-hidden border border-line">
        <div className="bg-yes" style={{ width: `${(yes / total) * 100}%` }} />
        <div className="bg-no" style={{ width: `${(no / total) * 100}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between gap-2 font-mono text-[11px]">
        <span>
          <span className="text-yes">YES {payoutLabel(market, Side.Yes)}</span>{" "}
          <span className="text-muted">· {formatPoints(yes)}</span>
        </span>
        <span>
          <span className="text-muted">{formatPoints(no)} ·</span>{" "}
          <span className="text-no">NO {payoutLabel(market, Side.No)}</span>
        </span>
      </div>
    </div>
  );
}

function OpenCard({ market, now }: { market: Market; now: number }) {
  const meta = useVideoMeta(market.videoId);
  const live = useLiveViews(market.videoId);
  const ai = useAiPick(market.id);
  const href = `/m/${market.id}`;
  const secsLeft = Number(market.closeTime) - now;
  const urgent = secsLeft <= 60;
  return (
    <article className="card flex min-w-0 flex-col">
      <Link href={href} className="glitch scanlines relative block aspect-[16/8] border-b border-line bg-black">
        <img src={thumbnail(market.videoId)} alt="" className="h-full w-full object-cover" />
        <span className="absolute left-2 top-2 z-10 flex gap-1.5">
          {isSprint(market) && (
            <span className="flex items-center gap-1 border border-ink bg-[#ffe600] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink">
              <PixelIcon name="bolt" size={10} /> SPRINT
            </span>
          )}
        </span>
        {ai && (
          <span className="absolute right-2 top-2 z-10 flex items-center gap-1.5 bg-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#f5f5f5]">
            <PixelIcon name="bot" size={10} label="CloutBot" />
            AI SAYS{" "}
            <span className={ai.side === Side.Yes ? "text-lime" : "text-magenta"}>
              {ai.side === Side.Yes ? "YES" : "NO"}
            </span>
          </span>
        )}
        <span
          className={`absolute bottom-2 left-2 z-10 flex items-center gap-2 border border-ink px-2 py-1 font-mono text-[11px] font-semibold text-ink ${
            urgent ? "bg-magenta" : "bg-lime"
          }`}
        >
          CALLS CLOSE <span className="text-sm tabular-nums">{countdown(market.closeTime, now)}</span>
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <Link href={href} className="line-clamp-2 font-bold leading-snug tracking-[-0.015em] text-text no-underline">
            {meta?.title ?? "Loading video…"}
          </Link>
          <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            {meta?.author ?? " "}
          </p>
        </div>
        <p className="text-[15px] leading-snug">
          Reach <b>{formatViewsFine(market.threshold)}</b> views by <b>{clockTime(market.resolveTime)}</b>?
        </p>
        <TargetProgress market={market} views={live?.views ?? null} />
        <Odds market={market} />
        <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
          <Link href={`${href}?side=yes`} className="btn btn-yes py-2.5 text-sm no-underline">
            YES, it hits
          </Link>
          <Link href={`${href}?side=no`} className="btn btn-no py-2.5 text-sm no-underline">
            NO, it flops
          </Link>
        </div>
      </div>
    </article>
  );
}

function RowShell({ market, children }: { market: Market; children: React.ReactNode }) {
  const meta = useVideoMeta(market.videoId);
  return (
    <li>
      <Link
        href={`/m/${market.id}`}
        className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 p-3 text-text no-underline hover:bg-[var(--soft)] sm:grid-cols-[112px_minmax(0,1fr)_auto]"
      >
        <span className="relative block aspect-video overflow-hidden border border-line bg-black">
          <img src={thumbnail(market.videoId)} alt="" className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0">
          <span className="line-clamp-1 font-bold leading-snug">{meta?.title ?? "Loading video…"}</span>
          <span className="mt-0.5 block font-mono text-[11px] text-muted">
            TARGET {formatViewsFine(market.threshold)} ·{" "}
            {formatPoints(market.yesPool + market.noPool + market.sealedPool)} PTS STAKED
          </span>
        </span>
        {children}
      </Link>
    </li>
  );
}

function SettlingRow({ market, now }: { market: Market; now: number }) {
  const live = useLiveViews(market.videoId);
  const hit = live && live.views >= Number(market.threshold);
  return (
    <RowShell market={market}>
      <span className="col-span-2 flex flex-wrap items-center gap-2 font-mono text-[11px] sm:col-span-1 sm:flex-col sm:items-end">
        <span className="border border-ink bg-[#ff7a00] px-1.5 py-0.5 font-semibold text-ink">
          {Number(market.resolveTime) > now ? `SETTLES IN ${countdown(market.resolveTime, now)}` : "SETTLING NOW"}
        </span>
        {live && (
          <span className={hit ? "text-yes" : "text-muted"}>
            NOW {formatViewsFine(live.views)}
            {hit ? " · TARGET HIT" : ""}
          </span>
        )}
      </span>
    </RowShell>
  );
}

function ResultRow({ market }: { market: Market }) {
  const voided = market.status === Status.Voided;
  const yes = market.outcome === Side.Yes;
  return (
    <RowShell market={market}>
      <span className="col-span-2 flex flex-wrap items-center gap-2 font-mono text-[11px] sm:col-span-1 sm:flex-col sm:items-end">
        {voided ? (
          <span className="border border-line px-1.5 py-0.5 text-muted">CANCELLED · REFUNDED</span>
        ) : (
          <span className={`border border-ink px-1.5 py-0.5 font-semibold text-ink ${yes ? "bg-lime" : "bg-magenta"}`}>
            {yes ? "YES WON" : "NO WON"}
          </span>
        )}
        {!voided && <span className="text-muted">FINAL {formatViewsFine(market.finalViews)}</span>}
      </span>
    </RowShell>
  );
}
