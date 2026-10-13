"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AI_NAME } from "@/lib/aiConfig";
import { AGENT_ADDRESS, explorerAddress, houseBotNumber } from "@/lib/chain";
import { formatPoints, shortAddress } from "@/lib/markets";
import { fetchStandings, winRate, type Standing } from "@/lib/portfolio";
import { signed } from "./CallHistory";
import { PixelAvatar, PixelIcon } from "./Pixel";
import { useWallet } from "./WalletProvider";

const isAgent = (a: string) => !!AGENT_ADDRESS && a.toLowerCase() === AGENT_ADDRESS.toLowerCase();

/**
 * Standings by total points (on hand + riding on open calls + winnings not yet collected), so a player with
 * everything in play isn't shown as broke. House liquidity bots aren't ranked.
 */
export function Leaderboard() {
  const w = useWallet();
  const [rows, setRows] = useState<Standing[]>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetchStandings((a) => !!houseBotNumber(a))
        .then((r) => live && (setRows(r), setFailed(false)))
        .catch(() => live && setFailed(true));
    load();
    const t = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  if (!rows) {
    return (
      <div className="space-y-2" aria-busy>
        <div className="card h-64 animate-pulse" />
        {failed && <p className="text-sm text-muted">Can&apos;t reach Monad right now. Retrying…</p>}
      </div>
    );
  }
  if (rows.length === 0) return <p className="card p-6 text-muted">No callers yet. Make the first call.</p>;

  return (
    <div className="space-y-2">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-line bg-surface-2 text-left font-mono text-[10px] tracking-[0.14em] text-muted">
            <tr>
              <th className="w-12 px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">CALLER</th>
              <th className="px-3 py-2.5 text-right">POINTS</th>
              <th className="px-3 py-2.5 text-right">RECORD</th>
              <th className="hidden px-3 py-2.5 text-right sm:table-cell">WIN RATE</th>
              <th className="px-3 py-2.5 text-right">NET</th>
              <th className="hidden px-3 py-2.5 text-right md:table-cell">IN PLAY</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((r, i) => {
              const me = w.address?.toLowerCase() === r.address.toLowerCase();
              const ai = isAgent(r.address);
              const rate = winRate(r);
              return (
                <tr key={r.address} className={`border-t border-line first:border-t-0 ${me ? "bg-lime/10" : ""}`}>
                  <td className="px-3 py-3">
                    <span
                      className={`grid h-7 w-7 place-items-center border font-mono text-xs font-semibold ${
                        i < 3 ? "border-ink bg-lime text-ink" : "border-line text-muted"
                      }`}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2.5">
                      <PixelAvatar seed={r.address} size={28} />
                      <span className="min-w-0">
                        {ai ? (
                          <Link
                            href="/cloutbot"
                            className="flex items-center gap-1.5 font-bold text-text no-underline hover:underline"
                          >
                            <PixelIcon name="bot" size={12} /> {AI_NAME}{" "}
                            <span className="font-mono text-[10px] text-muted">AI</span>
                          </Link>
                        ) : (
                          <span className="font-bold">{me ? "You" : shortAddress(r.address)}</span>
                        )}
                        <a
                          href={explorerAddress(r.address)}
                          target="_blank"
                          rel="noreferrer"
                          className="block font-mono text-[10px] text-muted no-underline hover:text-text"
                        >
                          {shortAddress(r.address)} ↗
                        </a>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-base font-bold tabular-nums">{formatPoints(r.total)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {r.wins}–{r.losses}
                  </td>
                  <td className="hidden px-3 py-3 text-right font-mono tabular-nums sm:table-cell">
                    {rate === null ? "—" : `${Math.round(rate * 100)}%`}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-mono tabular-nums ${
                      r.net > 0n ? "text-yes" : r.net < 0n ? "text-no" : "text-muted"
                    }`}
                  >
                    {signed(r.net)}
                  </td>
                  <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-muted md:table-cell">
                    {formatPoints(r.atStake)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Points = on hand + riding on calls that haven&apos;t settled + winnings not yet collected. Record and net count
        settled calls (refunds don&apos;t count). Read live from the CloutCall contracts on Monad; house liquidity bots
        aren&apos;t ranked.
      </p>
    </div>
  );
}
