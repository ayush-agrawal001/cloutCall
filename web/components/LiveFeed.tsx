"use client";

import { useEffect, useState } from "react";
import { recentEvents, watchMarketEvents, type MarketEvent } from "@/lib/live";
import { ActivityFeed } from "./ActivityFeed";
import { useWallet } from "./WalletProvider";

/** Every CloutMarket event across all markets, streamed with Monad commit states. */
export function LiveFeed({ limit = 8 }: { limit?: number }) {
  const w = useWallet();
  const [events, setEvents] = useState<MarketEvent[]>([]);

  useEffect(() => {
    const upsert = (e: MarketEvent) =>
      setEvents((prev) => {
        const i = prev.findIndex((p) => p.key === e.key);
        if (i >= 0) {
          const next = [...prev];
          next[i] = { ...prev[i], commitState: e.commitState };
          return next;
        }
        return [e, ...prev].slice(0, 50);
      });
    recentEvents()
      .then((h) =>
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.key));
          return [...prev, ...h.reverse().filter((e) => !seen.has(e.key))].slice(0, 50);
        }),
      )
      .catch(() => {});
    return watchMarketEvents(upsert);
  }, []);

  return (
    <ActivityFeed
      events={events}
      me={w.address}
      limit={limit}
      showMarket
      empty="Quiet on-chain for the last ~30 seconds. Calls appear here the moment their block is proposed."
    />
  );
}
