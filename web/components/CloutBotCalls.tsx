"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AI_ENABLED, AI_NAME } from "@/lib/aiConfig";
import { AGENT_ADDRESS, explorerAddress } from "@/lib/chain";
import { formatPoints, formatViewsFine, Side } from "@/lib/markets";
import { fetchAiHistory, recordOf, type AiCallRow } from "@/lib/portfolio";
import { CallItem, RecordStrip } from "./CallHistory";
import { PixelIcon } from "./Pixel";

/** Short model name for a chip, e.g. "openrouter/nvidia/nemotron-3-super-120b-a12b:free" → "nemotron-3-super-120b-a12b". */
function modelLabel(model: string) {
  const last = model.split("/").pop() ?? model;
  return last.replace(/:free$/, "");
}

/** Every CloutBot pick with its reasoning, how sure it was, its forecast, and how it turned out. */
export function CloutBotCalls() {
  const [rows, setRows] = useState<AiCallRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!AI_ENABLED) return;
    let live = true;
    const load = () =>
      fetchAiHistory()
        .then((r) => live && (setRows(r), setFailed(false)))
        .catch(() => live && setFailed(true));
    load();
    const t = setInterval(load, 20_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  if (!AI_ENABLED) {
    return <p className="card p-6 text-muted">{AI_NAME} isn&apos;t set up on this deployment.</p>;
  }

  const record = rows && recordOf(rows);
  const settled = rows?.filter((r) => r.right !== null) ?? [];
  const right = settled.filter((r) => r.right).length;
  const models = new Map<string, number>();
  for (const r of rows ?? []) models.set(modelLabel(r.pick.model), (models.get(modelLabel(r.pick.model)) ?? 0) + 1);

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-muted">
          <PixelIcon name="bot" size={12} /> AI RIVAL
        </p>
        <h1 className="text-[40px] font-bold uppercase leading-[0.9] tracking-[-0.055em]">{AI_NAME}&apos;s calls</h1>
        <p className="max-w-[64ch] text-[15px] leading-relaxed text-muted">
          Every pick {AI_NAME} has made. Each one was staked with its own points and written to the AgentJournal
          contract on Monad, with its reasoning, before calls closed, so none of it can be changed afterwards.
          {AGENT_ADDRESS && (
            <>
              {" "}
              <a href={explorerAddress(AGENT_ADDRESS)} target="_blank" rel="noreferrer" className="underline">
                See its account on the explorer
              </a>
              .
            </>
          )}
        </p>
      </header>

      {!rows || !record ? (
        <div className="space-y-2" aria-busy>
          <div className="card h-[74px] animate-pulse" />
          <div className="card h-64 animate-pulse" />
          {failed && <p className="text-sm text-muted">Can&apos;t reach Monad right now. Retrying…</p>}
        </div>
      ) : rows.length === 0 ? (
        <p className="card p-6 text-muted">No picks yet. {AI_NAME} only plays while its agent is running.</p>
      ) : (
        <>
          <RecordStrip record={record} />
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted">
            <span>
              CALLED THE RESULT {right}/{settled.length} TIMES
            </span>
            <span aria-hidden>·</span>
            <span>MODELS:</span>
            {[...models].map(([m, n]) => (
              <span key={m} className="border border-line px-1.5 py-0.5">
                {m} ×{n}
              </span>
            ))}
            <Link href="/leaderboard" className="ml-auto text-muted no-underline hover:text-text">
              HUMANS VS AI SCOREBOARD →
            </Link>
          </div>
          <ul className="card divide-y divide-[var(--line)]">
            {rows.map((r) => (
              <CallItem key={r.market.id.toString()} row={r}>
                <div className="mt-2.5 border-l-2 border-line pl-3 sm:ml-[116px]">
                  <p className="text-sm leading-relaxed">&ldquo;{r.pick.reasoning}&rdquo;</p>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
                    <span>
                      PICKED{" "}
                      <b className={r.pick.side === Side.Yes ? "text-yes" : "text-no"}>
                        {r.pick.side === Side.Yes ? "YES" : "NO"}
                      </b>{" "}
                      · {r.pick.confidence}% SURE
                    </span>
                    <span>
                      FORECAST {formatViewsFine(r.pick.predictedViews)}
                      {r.market.finalViews > 0n && ` · ACTUAL ${formatViewsFine(r.market.finalViews)}`}
                    </span>
                    <span>STAKED {formatPoints(r.staked)}</span>
                    <span>{modelLabel(r.pick.model).toUpperCase()}</span>
                    <span>
                      {new Date(Number(r.pick.recordedAt) * 1000).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                </div>
              </CallItem>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
