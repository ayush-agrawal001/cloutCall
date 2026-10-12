"use client";

import { useEffect, useState } from "react";
import { fetchMarkets, phaseOf, type Market } from "@/lib/markets";
import { MarketCard } from "./MarketCard";

export function MarketFeed() {
  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetchMarkets(0, 48)
        .then((m) => live && (setMarkets(m), setError(null)))
        .catch((e: Error) => live && setError(e.message));
    load();
    const t = setInterval(load, 4000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  if (error && !markets) {
    return <p className="card p-6 text-sm text-no">Couldn&apos;t reach the market contract: {error}</p>;
  }
  if (!markets) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card aspect-[4/5] animate-pulse" />
        ))}
      </div>
    );
  }
  if (markets.length === 0) {
    return <p className="card p-6 text-sm text-muted">No markets yet. The resolver opens new ones on fresh uploads.</p>;
  }

  const order = { open: 0, revealing: 1, resolved: 2, voided: 3 };
  const sorted = [...markets].sort((a, b) => order[phaseOf(a)] - order[phaseOf(b)]);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((m) => (
        <MarketCard key={m.id.toString()} market={m} />
      ))}
    </div>
  );
}
