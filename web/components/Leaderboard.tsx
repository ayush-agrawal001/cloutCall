"use client";

import { useEffect, useState } from "react";
import { marketAbi } from "@/lib/abi";
import { ENVIO_URL, explorerAddress, MARKET_ADDRESS, publicClient } from "@/lib/chain";
import { formatPoints, shortAddress } from "@/lib/markets";
import { useWallet } from "./WalletProvider";

export type Row = {
  address: `0x${string}`;
  points: bigint;
  calls?: number;
  wins?: number;
  streak?: number;
  bestStreak?: number;
  duelsWon?: number;
  upsets?: number;
};

/** On-chain fallback: every player's current points straight from the contracts. */
async function onchainRows(): Promise<Row[]> {
  const [players, balances] = await publicClient.readContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "getPlayers",
    args: [0n, 500n],
  });
  return players.map((address, i) => ({ address, points: balances[i] }));
}

type EnvioPlayer = {
  id: string;
  calls: number;
  settled: number;
  wins: number;
  streak: number;
  bestStreak: number;
  duelsWon: number;
  upsetsCalled: number;
};

/** Derived stats (win rate, streaks, duels, upsets) from the Envio HyperIndex indexer. */
async function envioStats(): Promise<Map<string, EnvioPlayer>> {
  if (!ENVIO_URL) return new Map();
  const res = await fetch(ENVIO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "{ Player(limit: 500) { id calls settled wins streak bestStreak duelsWon upsetsCalled } }",
    }),
  });
  const json = (await res.json()) as { data?: { Player: EnvioPlayer[] } };
  return new Map((json.data?.Player ?? []).map((p) => [p.id.toLowerCase(), p]));
}

export function Leaderboard() {
  const w = useWallet();
  const [rows, setRows] = useState<Row[]>();
  const [err, setErr] = useState<string>();

  useEffect(() => {
    const load = () =>
      Promise.all([onchainRows(), envioStats().catch(() => new Map<string, EnvioPlayer>())])
        .then(([chain, stats]) =>
          setRows(
            chain
              .map((r) => {
                const s = stats.get(r.address.toLowerCase());
                return s
                  ? {
                      ...r,
                      calls: s.settled,
                      wins: s.wins,
                      streak: s.streak,
                      bestStreak: s.bestStreak,
                      duelsWon: s.duelsWon,
                      upsets: s.upsetsCalled,
                    }
                  : r;
              })
              .sort((a, b) => Number(b.points - a.points)),
          ),
        )
        .catch((e: Error) => setErr(e.message));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  if (err && !rows) return <p className="card p-6 text-no">{err}</p>;
  if (!rows) return <div className="card h-64 animate-pulse" />;
  if (rows.length === 0) return <p className="card p-6 text-muted">No callers yet. Make the first call.</p>;

  const rich = rows.some((r) => r.calls !== undefined);
  return (
    <div className="space-y-2">
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Caller</th>
              <th className="px-4 py-3 text-right">Points</th>
              {rich && <th className="hidden px-4 py-3 text-right sm:table-cell">Win rate</th>}
              {rich && <th className="hidden px-4 py-3 text-right sm:table-cell">Best streak</th>}
              {rich && <th className="hidden px-4 py-3 text-right md:table-cell">Duels won</th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((r, i) => {
              const me = w.address?.toLowerCase() === r.address.toLowerCase();
              return (
                <tr key={r.address} className={`border-t border-line ${me ? "bg-accent/10" : ""}`}>
                  <td className="px-4 py-3 font-bold">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                  <td className="px-4 py-3 font-mono">
                    <a href={explorerAddress(r.address)} target="_blank" className="hover:text-accent-2">
                      {me ? "You" : shortAddress(r.address)}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{formatPoints(r.points)}</td>
                  {rich && (
                    <td className="hidden px-4 py-3 text-right sm:table-cell">
                      {r.calls ? `${Math.round(((r.wins ?? 0) / r.calls) * 100)}%` : "—"}
                    </td>
                  )}
                  {rich && <td className="hidden px-4 py-3 text-right sm:table-cell">{r.bestStreak ?? 0}🔥</td>}
                  {rich && <td className="hidden px-4 py-3 text-right md:table-cell">{r.duelsWon ?? 0}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Points read live from CloutCall contracts on Monad
        {rich ? " · win rate, streaks and duels indexed by Envio HyperIndex" : ""}.
      </p>
    </div>
  );
}
