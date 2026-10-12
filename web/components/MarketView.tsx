"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { marketAbi } from "@/lib/abi";
import { MARKET_ADDRESS, publicClient } from "@/lib/chain";
import { recentEvents, watchMarketEvents, type MarketEvent } from "@/lib/live";
import {
  fetchMarket,
  formatPoints,
  formatViews,
  phaseOf,
  Side,
  timeLeft,
  type Market,
  type SideValue,
} from "@/lib/markets";
import { useVideoMeta } from "@/lib/useVideoMeta";
import { describeTxError } from "@/lib/tx";
import { ActivityFeed } from "./ActivityFeed";
import { CallPanel, type CallResult } from "./CallPanel";
import { PhaseBadge, PoolBar } from "./MarketCard";
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
  const [pos, setPos] = useState<Position>();
  const [claimable, setClaimable] = useState(0n);
  const load = useCallback(async () => {
    if (!address) return setPos(undefined);
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
    setPos(p);
    setClaimable(c);
  }, [address, id]);
  useEffect(() => {
    load();
  }, [load, status, market?.status, market?.yesPool, market?.noPool, market?.sealedPool]);
  return { pos, claimable, reload: load };
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-bold">{children}</p>
    </div>
  );
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

  if (error && !market) return <p className="card p-6 text-no">Market not found ({error}).</p>;
  if (!market) return <div className="card aspect-video animate-pulse" />;

  const phase = phaseOf(market);
  const staked = pos ? pos.yes + pos.no + (pos.revealed ? 0n : pos.sealedStake) : 0n;

  async function claim() {
    setClaiming(true);
    setClaimErr(undefined);
    try {
      await w.write(`Collected from market #${id}`, {
        address: MARKET_ADDRESS,
        abi: marketAbi,
        functionName: "claim",
        args: [id],
      });
      await reloadPos();
    } catch (e) {
      setClaimErr(describeTxError(e));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {banner}
        <div className="card overflow-hidden">
          <div className="aspect-video bg-black">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${market.videoId}`}
              title={meta?.title ?? "YouTube video"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-black leading-tight">{meta?.title ?? "Loading…"}</h1>
                <p className="text-sm text-muted">{meta?.author}</p>
              </div>
              <PhaseBadge market={market} />
            </div>
            <p className="text-2xl font-black">
              Will it hit <span className="text-accent-2">{formatViews(market.threshold)}</span> views?
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Views at open">{formatViews(market.baselineViews)}</Stat>
              <Stat label="Target">{formatViews(market.threshold)}</Stat>
              <Stat label={phase === "open" ? "Calls close" : "Settles"}>
                {phase === "open"
                  ? timeLeft(market.closeTime)
                  : phase === "revealing"
                    ? timeLeft(market.resolveTime)
                    : "done"}
              </Stat>
              <Stat label="Pot">{formatPoints(market.yesPool + market.noPool + market.sealedPool)} pts</Stat>
            </div>
            <PoolBar market={market} />
            {phase === "resolved" && (
              <p className="rounded-xl bg-accent/15 p-3 text-sm">
                Settled at <b>{formatViews(market.finalViews)}</b> views —{" "}
                <b className={market.outcome === Side.Yes ? "text-yes" : "text-no"}>
                  {market.outcome === Side.Yes ? "YES" : "NO"}
                </b>{" "}
                wins.
              </p>
            )}
          </div>
        </div>
        <div className="card p-5">
          <p className="mb-3 flex items-center gap-2 font-bold">
            <span className="live-dot" /> Live calls
          </p>
          <ActivityFeed events={events} me={w.address} />
        </div>
      </div>

      <div className="space-y-4">
        <CallPanel
          market={market}
          rival={rival}
          suggestedSide={suggestedSide}
          onCalled={(r) => {
            reload();
            reloadPos();
            onCalled?.(r, market);
          }}
        />
        {children?.(market, pos)}
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
          </div>
        )}
      </div>
    </div>
  );
}
