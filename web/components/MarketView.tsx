"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { marketAbi } from "@/lib/abi";
import { MARKET_ADDRESS, publicClient } from "@/lib/chain";
import { recentEvents, watchMarketEvents, type MarketEvent } from "@/lib/live";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  clockTime,
  countdown,
  fetchMarket,
  formatPoints,
  formatViewsExact,
  multiple,
  phaseOf,
  Side,
  thumbnail,
  type Market,
  type SideValue,
} from "@/lib/markets";
import { useLiveViews } from "@/lib/useLiveViews";
import { useVideoMeta } from "@/lib/useVideoMeta";
import { describeTxError } from "@/lib/tx";
import { ActivityFeed } from "./ActivityFeed";
import { CallPanel, type CallResult } from "./CallPanel";
import { RevealPanel } from "./RevealPanel";
import { AiRivalCard } from "./AiRivalCard";
import { isSprint, PacePanel } from "./PacePanel";
import { PixelIcon } from "./Pixel";
import { useAiPick } from "@/lib/ai";
import { useCreatorBadge } from "@/lib/useCreatorBadge";
import { AGENT_ADDRESS } from "@/lib/chain";
import { ShareCard } from "./ShareCard";
import { duelPath, winText } from "@/lib/share";
import { useWallet } from "./WalletProvider";

type Position = {
  yes: bigint;
  no: bigint;
  sealedStake: bigint;
  commitment: `0x${string}`;
  revealed: boolean;
  claimed: boolean;
};

export function useMarket(id: bigint) {
  const [market, setMarket] = useState<Market>();
  const [error, setError] = useState<string>();
  const load = useCallback(
    () =>
      fetchMarket(id)
        .then((m) => (setMarket(m), setError(undefined)))
        .catch((e: Error) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);
  return { market, error, reload: load };
}

export function usePosition(id: bigint, market?: Market) {
  const { address, status } = useWallet();
  const [state, setState] = useState<{ owner: Address; pos: Position; claimable: bigint }>();
  const fetchPosition = useCallback(async () => {
    if (!address) return undefined;
    const [p, c] = await Promise.all([
      publicClient.readContract({
        address: MARKET_ADDRESS,
        abi: marketAbi,
        functionName: "positionOf",
        args: [id, address],
      }),
      publicClient.readContract({
        address: MARKET_ADDRESS,
        abi: marketAbi,
        functionName: "claimable",
        args: [id, address],
      }),
    ]);
    return { owner: address, pos: p, claimable: c };
  }, [address, id]);
  const load = useCallback(async () => {
    const next = await fetchPosition().catch(() => undefined); // a failed read keeps the last known position
    if (next) setState(next);
  }, [fetchPosition]);
  useEffect(() => {
    let live = true;
    fetchPosition()
      .then((next) => live && next && setState(next))
      .catch(() => {}); // rate-limited or offline: the next refresh tries again
    return () => {
      live = false;
    };
  }, [fetchPosition, status, market?.status, market?.yesPool, market?.noPool, market?.sealedPool]);
  // Only show data that belongs to the currently signed-in account.
  const mine = state && address && state.owner === address ? state : undefined;
  return { pos: mine?.pos, claimable: mine?.claimable ?? 0n, reload: load };
}

/** A market page opened from a card's YES/NO button (`?side=yes|no`) starts on that side. */
export function MarketFromUrl({ id }: { id: bigint }) {
  const side = useSearchParams().get("side");
  return <MarketView id={id} suggestedSide={side === "no" ? Side.No : side === "yes" ? Side.Yes : undefined} />;
}

export function MarketView({
  id,
  rival,
  suggestedSide,
  banner,
  onCalled,
  children,
}: {
  id: bigint;
  rival?: Address;
  suggestedSide?: SideValue;
  banner?: ReactNode;
  onCalled?: (r: CallResult, m: Market) => void;
  children?: (m: Market, pos?: Position) => ReactNode;
}) {
  const w = useWallet();
  const { market, error, reload } = useMarket(id);
  const { pos, claimable, reload: reloadPos } = usePosition(id, market);
  const meta = useVideoMeta(market?.videoId);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [, tick] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [claimErr, setClaimErr] = useState<string>();
  const [won, setWon] = useState<bigint>();
  const aiPick = useAiPick(id);
  const creatorHosted = useCreatorBadge(market?.creator, market?.videoId);
  const [duelAi, setDuelAi] = useState(false);

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const upsert = (e: MarketEvent) =>
      setEvents((prev) => {
        const i = prev.findIndex((p) => p.key === e.key);
        if (i >= 0) {
          const next = [...prev];
          next[i] = { ...prev[i], commitState: e.commitState };
          return next;
        }
        return [e, ...prev];
      });
    recentEvents()
      .then((h) => setEvents((prev) => [...prev, ...h.filter((e) => e.marketId === id).reverse()]))
      .catch(() => {});
    return watchMarketEvents((e) => {
      if (e.marketId !== id) return;
      upsert(e);
      reload();
    });
  }, [id, reload]);

  if (!market) {
    const notFound = !!error && /UnknownMarket|revert/i.test(error);
    return notFound ? (
      <div className="card space-y-2 p-6">
        <p className="font-bold">Market not found</p>
        <p className="text-sm text-muted">There&apos;s no market #{id.toString()} on this network.</p>
        <Link href="/markets" className="btn btn-ghost mt-2 px-4 py-2 text-sm no-underline">
          All markets
        </Link>
      </div>
    ) : (
      <div aria-busy className="space-y-4">
        <div className="card h-56 animate-pulse" />
        {error && <p className="text-sm text-muted">Can&apos;t reach Monad right now. Retrying…</p>}
      </div>
    );
  }

  const phase = phaseOf(market);
  const staked = pos ? pos.yes + pos.no + (pos.revealed ? 0n : pos.sealedStake) : 0n;

  async function claim() {
    setClaiming(true);
    setClaimErr(undefined);
    try {
      const payout = claimable;
      await w.write(`Collected from market #${id}`, {
        address: MARKET_ADDRESS,
        abi: marketAbi,
        functionName: "claim",
        args: [id],
      });
      const stake = staked;
      if (payout > stake) setWon(payout - stake);
      await reloadPos();
    } catch (e) {
      setClaimErr(describeTxError(e));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link
        href="/markets"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.12em] text-muted no-underline hover:text-text"
      >
        <PixelIcon name="arrow" size={11} className="rotate-180" /> ALL MARKETS
      </Link>
      {banner}
      <QuestionHeader market={market} title={meta?.title} author={meta?.author} creatorHosted={creatorHosted} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0 space-y-5">
          <OddsCard market={market} />
          <LiteVideo videoId={market.videoId} title={meta?.title} />
          <div className="card p-5">
            <p className="mb-3 flex items-center gap-2 font-bold">
              <span className="live-dot" /> Calls on this market
            </p>
            <ActivityFeed events={events} me={w.address} />
          </div>
        </div>

        <div className="order-first min-w-0 space-y-4 lg:sticky lg:top-[90px] lg:order-none">
          {phase === "open" ? (
            <CallPanel
              key={duelAi && aiPick ? "duel-ai" : "default"}
              market={market}
              rival={duelAi && aiPick ? AGENT_ADDRESS : rival}
              suggestedSide={duelAi && aiPick ? (aiPick.side === Side.Yes ? Side.No : Side.Yes) : suggestedSide}
              hasSealed={!!pos && pos.commitment !== `0x${"0".repeat(64)}`}
              onCalled={(r) => {
                reload();
                reloadPos();
                onCalled?.(r, market);
              }}
            />
          ) : (
            <StatusCard market={market} />
          )}
          <RevealPanel
            market={market}
            pos={pos}
            onRevealed={() => {
              reload();
              reloadPos();
            }}
          />
          {pos && staked > 0n && (
            <div className="card space-y-2 p-5 text-sm">
              <p className="font-bold">Your position</p>
              {pos.yes > 0n && <p className="text-yes">YES · {formatPoints(pos.yes)} pts</p>}
              {pos.no > 0n && <p className="text-no">NO · {formatPoints(pos.no)} pts</p>}
              {!pos.revealed && pos.sealedStake > 0n && <p>🔒 Sealed · {formatPoints(pos.sealedStake)} pts</p>}
              {(phase === "resolved" || phase === "voided") &&
                (pos.claimed ? (
                  <p className="text-muted">Collected ✓</p>
                ) : (
                  <button className="btn btn-accent w-full" disabled={claiming} onClick={claim}>
                    {claiming
                      ? "Collecting…"
                      : claimable > 0n
                        ? `Collect ${formatPoints(claimable)} pts`
                        : "Close out position"}
                  </button>
                ))}
              {claimErr && <p className="text-no">{claimErr}</p>}
              {won !== undefined && w.address && (
                <ShareCard
                  heading="You called it — flex on the timeline"
                  path={duelPath({
                    marketId: id,
                    from: w.address,
                    handle: w.handle,
                    side: market.outcome as SideValue,
                    won,
                  })}
                  text={winText({
                    title: meta?.title ?? "this video",
                    won: formatPoints(won),
                    side: market.outcome as SideValue,
                  })}
                />
              )}
            </div>
          )}
          {children?.(market, pos)}
          <AiRivalCard market={market} pick={aiPick} dueling={duelAi} onDuel={() => setDuelAi((d) => !d)} />
          <PacePanel market={market} />
        </div>
      </div>
    </div>
  );
}

const STAGES = ["Calls open", "Calls closed", "Settled"] as const;

/** The market's question, where it is in its life, and how far the video has to go. */
function QuestionHeader({
  market,
  title,
  author,
  creatorHosted,
}: {
  market: Market;
  title?: string;
  author?: string;
  creatorHosted: boolean;
}) {
  const phase = phaseOf(market);
  const settled = phase === "resolved" || phase === "voided";
  const live = useLiveViews(market.videoId, !settled);
  const stage = phase === "open" ? 0 : phase === "revealing" ? 1 : 2;
  const base = Number(market.baselineViews);
  const target = Number(market.threshold);
  const views = settled && phase === "resolved" ? Number(market.finalViews) : (live?.views ?? null);
  const pct =
    views === null || target <= base ? 0 : Math.min(100, Math.max(0, ((views - base) / (target - base)) * 100));
  return (
    <header className="card overflow-hidden">
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          {isSprint(market) && (
            <span className="flex items-center gap-1 border border-ink bg-[#ffe600] px-1.5 py-0.5 font-semibold text-ink">
              <PixelIcon name="bolt" size={10} /> HYPE SPRINT
            </span>
          )}
          {creatorHosted && (
            <span className="border border-ink bg-lime px-1.5 py-0.5 font-semibold text-ink">
              ✓ HOSTED BY THE CREATOR
            </span>
          )}
          <span className="min-w-0 truncate text-muted">
            {author ? `${author} · ` : ""}
            {title ?? "Loading video…"}
          </span>
        </div>
        <h1 className="text-[clamp(26px,3.4vw,40px)] font-bold leading-[1.02] tracking-[-0.04em]">
          Will it reach {formatViewsExact(market.threshold)} views by {clockTime(market.resolveTime)}?
        </h1>

        <ol className="grid grid-cols-3 gap-1.5" aria-label="Market timeline">
          {STAGES.map((label, i) => {
            const state = i < stage ? "done" : i === stage ? "now" : "todo";
            const when =
              i === 0
                ? phase === "open"
                  ? `closes in ${countdown(market.closeTime)}`
                  : `closed ${clockTime(market.closeTime)}`
                : i === 1
                  ? phase === "revealing"
                    ? `settles in ${countdown(market.resolveTime)}`
                    : `at ${clockTime(market.closeTime)}`
                  : settled
                    ? phase === "voided"
                      ? "cancelled · refunded"
                      : `${market.outcome === Side.Yes ? "YES" : "NO"} won`
                    : `at ${clockTime(market.resolveTime)}`;
            return (
              <li
                key={label}
                aria-current={state === "now" ? "step" : undefined}
                className={`border px-2.5 py-2 ${
                  state === "now"
                    ? "border-ink bg-lime text-ink"
                    : state === "done"
                      ? "border-line"
                      : "border-dashed border-line text-muted"
                }`}
              >
                <p className="text-xs font-bold sm:text-sm">{label}</p>
                <p className="font-mono text-[10px] tabular-nums sm:text-[11px]">{when}</p>
              </li>
            );
          })}
        </ol>

        <div>
          <div aria-hidden className="h-2.5 border border-line bg-surface-2">
            <div
              className={`h-full ${views !== null && views >= target ? "bg-yes" : "bg-cyan"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px]">
            <div>
              <dt className="text-muted">OPENED AT</dt>
              <dd className="text-sm font-semibold tabular-nums">{formatViewsExact(base)}</dd>
            </div>
            <div className="text-center">
              <dt className="text-muted">{phase === "resolved" ? "FINAL" : "NOW"}</dt>
              <dd className="text-sm font-semibold tabular-nums">{views === null ? "…" : formatViewsExact(views)}</dd>
            </div>
            <div className="text-right">
              <dt className="text-muted">TARGET</dt>
              <dd className="text-sm font-semibold tabular-nums">{formatViewsExact(target)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </header>
  );
}

/** Where the points are and what each side pays a new caller. */
function OddsCard({ market }: { market: Market }) {
  const yes = Number(market.yesPool);
  const no = Number(market.noPool);
  const total = yes + no;
  const pays = (side: SideValue) => {
    const x = multiple(market, side);
    return Number.isFinite(x) ? `pays ×${x.toFixed(2)}` : "takes the whole pot";
  };
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-bold">The pot</p>
        <p className="font-mono text-[11px] text-muted">
          {formatPoints(total + Number(market.sealedPool))} PTS STAKED
          {market.sealedPool > 0n && ` · ${formatPoints(market.sealedPool)} SEALED`}
        </p>
      </div>
      {total === 0 ? (
        <p className="mt-3 border border-dashed border-line px-3 py-2.5 text-sm text-muted">
          {phaseOf(market) === "open"
            ? "No open calls yet. The first call sets the odds; whoever is right splits the other side's points."
            : "Nobody made an open call on this market."}
        </p>
      ) : (
        <>
          <div aria-hidden className="mt-3 flex h-3 overflow-hidden border border-line">
            <div className="bg-yes" style={{ width: `${(yes / total) * 100}%` }} />
            <div className="bg-no" style={{ width: `${(no / total) * 100}%` }} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <p>
              <b className="text-yes">YES</b> · {formatPoints(yes)} pts
              <span className="block font-mono text-[11px] text-muted">{pays(Side.Yes)}</span>
            </p>
            <p className="text-right">
              {formatPoints(no)} pts · <b className="text-no">NO</b>
              <span className="block font-mono text-[11px] text-muted">{pays(Side.No)}</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** What happens next once calls are closed. */
function StatusCard({ market }: { market: Market }) {
  const phase = phaseOf(market);
  if (phase === "revealing") {
    return (
      <div className="card space-y-2 p-5">
        <p className="font-bold">Calls are closed</p>
        <p className="text-sm text-muted">
          At {clockTime(market.resolveTime)} the final view count is posted on Monad and the market settles. Winners
          then collect here.
        </p>
        <p className="font-mono text-2xl font-semibold tabular-nums">{countdown(market.resolveTime)}</p>
        <Link href="/markets" className="btn btn-ghost w-full py-2.5 text-sm no-underline">
          Find a market that&apos;s open
        </Link>
      </div>
    );
  }
  if (phase === "voided") {
    return (
      <div className="card space-y-2 p-5">
        <p className="font-bold">Cancelled — stakes refunded</p>
        <p className="text-sm text-muted">
          This market couldn&apos;t be settled fairly, so every stake can be collected back in full.
        </p>
      </div>
    );
  }
  const yes = market.outcome === Side.Yes;
  return (
    <div className={`border border-ink p-5 text-ink ${yes ? "bg-lime" : "bg-magenta"}`}>
      <p className="font-mono text-[11px] tracking-[0.14em]">SETTLED</p>
      <p className="text-3xl font-bold tracking-[-0.03em]">{yes ? "YES won" : "NO won"}</p>
      <p className="mt-1 text-sm">
        Final count {formatViewsExact(market.finalViews)} views against a target of {formatViewsExact(market.threshold)}
        .
      </p>
    </div>
  );
}

/** A compact preview until the player asks to watch, so the question and the odds stay on top. */
function LiteVideo({ videoId, title }: { videoId: string; title?: string }) {
  const [play, setPlay] = useState(false);
  if (play) {
    return (
      <div className="card overflow-hidden">
        <div className="aspect-video bg-black">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
            title={title ?? "YouTube video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setPlay(true)}
      className="card lift grid w-full grid-cols-[140px_minmax(0,1fr)] items-center gap-4 p-3 text-left sm:grid-cols-[200px_minmax(0,1fr)]"
    >
      <span className="relative block aspect-video overflow-hidden border border-line bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbnail(videoId)} alt="" className="h-full w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-9 w-9 place-items-center border border-ink bg-lime font-mono text-sm text-ink">
            ▶
          </span>
        </span>
      </span>
      <span className="min-w-0">
        <span className="block font-bold">Watch the video</span>
        <span className="mt-0.5 line-clamp-2 text-sm text-muted">{title ?? "YouTube video"}</span>
      </span>
    </button>
  );
}
