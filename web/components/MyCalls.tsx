"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { marketAbi } from "@/lib/abi";
import { MARKET_ADDRESS } from "@/lib/chain";
import { formatPoints } from "@/lib/markets";
import { fetchHistory, recordOf, type CallRow } from "@/lib/portfolio";
import { describeTxError } from "@/lib/tx";
import { CallItem, RecordStrip } from "./CallHistory";
import { useWallet } from "./WalletProvider";

type Filter = "all" | "active" | "settled";

/** The signed-in player's calls across every market, with their record and a way to collect winnings. */
export function MyCalls() {
  const w = useWallet();
  /** Kept with the account it belongs to, so switching account or persona never shows the old one's calls. */
  const [data, setData] = useState<{ owner: string; rows: CallRow[] }>();
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [collecting, setCollecting] = useState<string>();
  const [err, setErr] = useState<string>();
  const address = w.address;

  const load = useCallback(async () => {
    if (!address) return;
    try {
      const r = await fetchHistory(address);
      setData({ owner: address, rows: r });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    let live = true;
    const poll = () =>
      fetchHistory(address)
        .then((r) => live && (setData({ owner: address, rows: r }), setFailed(false)))
        .catch(() => live && setFailed(true));
    poll();
    const t = setInterval(poll, 20_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [address]);

  if (!address) return null;
  const rows = data?.owner === address ? data.rows : null;

  const collectable = rows?.filter((r) => r.collectable) ?? [];
  const owed = collectable.reduce((s, r) => s + r.payout, 0n);

  async function collect(list: CallRow[]) {
    setErr(undefined);
    for (const r of list) {
      setCollecting(r.market.id.toString());
      try {
        await w.write(`Collected from market #${r.market.id}`, {
          address: MARKET_ADDRESS,
          abi: marketAbi,
          functionName: "claim",
          args: [r.market.id],
        });
      } catch (e) {
        setErr(describeTxError(e));
        break;
      }
    }
    setCollecting(undefined);
    await load();
    await w.refresh();
  }

  const shown = (rows ?? []).filter((r) =>
    filter === "all"
      ? true
      : filter === "active"
        ? r.status === "open" || r.status === "settling"
        : r.status !== "open" && r.status !== "settling",
  );

  return (
    <section id="calls" aria-labelledby="calls-h" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="calls-h" className="text-2xl font-bold tracking-[-0.03em]">
            Your calls
          </h2>
          <p className="text-sm text-muted">Every call this account has made, read from the market contract.</p>
        </div>
        {owed > 0n && (
          <button
            type="button"
            className="btn btn-accent px-4 py-2.5 text-sm"
            disabled={!!collecting}
            onClick={() => collect(collectable)}
          >
            {collecting ? `Collecting #${collecting}…` : `Collect all · ${formatPoints(owed)} pts`}
          </button>
        )}
      </div>
      {err && (
        <p role="alert" className="border border-no bg-no/10 p-3 text-sm text-no">
          {err}
        </p>
      )}

      {!rows ? (
        <div className="space-y-2" aria-busy>
          <div className="card h-[74px] animate-pulse" />
          <div className="card h-48 animate-pulse" />
          {failed && <p className="text-sm text-muted">Can&apos;t reach Monad right now. Retrying…</p>}
        </div>
      ) : rows.length === 0 ? (
        <div className="card space-y-2 p-6">
          <p className="font-bold">No calls yet</p>
          <p className="text-sm text-muted">Your calls show up here with how each one turned out.</p>
          <Link href="/markets" className="btn btn-accent mt-1 px-4 py-2 text-sm no-underline">
            Make your first call
          </Link>
        </div>
      ) : (
        <>
          <RecordStrip record={recordOf(rows)} />
          <div role="tablist" aria-label="Filter calls" className="flex gap-1.5">
            {(["all", "active", "settled"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`border px-3 py-1.5 font-mono text-[11px] tracking-[0.1em] ${
                  filter === f ? "border-ink bg-lime text-ink" : "border-line text-muted hover:text-text"
                }`}
              >
                {f === "all" ? "ALL" : f === "active" ? "IN PLAY" : "SETTLED"}
              </button>
            ))}
          </div>
          <ul className="card divide-y divide-[var(--line)]">
            {shown.length === 0 && <li className="p-4 text-sm text-muted">Nothing here.</li>}
            {shown.map((r) => (
              <CallItem
                key={r.market.id.toString()}
                row={r}
                action={
                  r.collectable && (
                    <button
                      type="button"
                      className="btn btn-accent px-2.5 py-1 text-[11px]"
                      disabled={!!collecting}
                      onClick={() => collect([r])}
                    >
                      {collecting === r.market.id.toString() ? "Collecting…" : `Collect ${formatPoints(r.payout)}`}
                    </button>
                  )
                }
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
