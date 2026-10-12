"use client";

import { useEffect, useState } from "react";
import { AI_ENABLED, AI_NAME, fetchAiPick } from "@/lib/ai";
import { fetchMarkets, Side, Status } from "@/lib/markets";
import { PixelIcon } from "./Pixel";

type Score = { aiW: number; aiL: number; crowdW: number; crowdL: number; live: number };

/** Scoreboard of the AI rival vs the crowd's majority call, computed from settled markets on-chain. */
export function HumansVsAi() {
  const [score, setScore] = useState<Score>();

  useEffect(() => {
    if (!AI_ENABLED) return;
    let live = true;
    const load = async () => {
      const markets = await fetchMarkets(0, 100);
      const picks = await Promise.all(markets.map((m) => fetchAiPick(m.id).catch(() => null)));
      const s: Score = { aiW: 0, aiL: 0, crowdW: 0, crowdL: 0, live: 0 };
      markets.forEach((m, i) => {
        const pick = picks[i];
        if (!pick) return;
        if (m.status === Status.Open) return void s.live++;
        if (m.status !== Status.Resolved) return;
        if (pick.side === m.outcome) s.aiW++;
        else s.aiL++;
        if (m.yesPool === m.noPool) return;
        const crowd = m.yesPool > m.noPool ? Side.Yes : Side.No;
        if (crowd === m.outcome) s.crowdW++;
        else s.crowdL++;
      });
      if (live) setScore(s);
    };
    load().catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  if (!AI_ENABLED || !score) return null;
  const pct = (w: number, l: number) => (w + l ? `${Math.round((w / (w + l)) * 100)}%` : "—");
  return (
    <div className="@container card">
      <div className="grid @md:grid-cols-[1fr_auto_1fr]">
        <div className="p-4">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            <PixelIcon name="bot" size={12} /> {AI_NAME} · Kimi
          </p>
          <p className="mt-1 text-4xl font-bold tracking-[-0.05em]">
            {score.aiW}–{score.aiL}{" "}
            <span className="font-mono text-sm font-medium tracking-normal text-muted">
              {pct(score.aiW, score.aiL)}
            </span>
          </p>
        </div>
        <p className="grid place-items-center border-y border-line bg-ink px-4 py-1 font-pixel text-lg text-lime @md:border-x @md:border-y-0">
          VS
        </p>
        <div className="p-4 @md:text-right">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted @md:justify-end">
            <PixelIcon name="user" size={12} /> The crowd
          </p>
          <p className="mt-1 text-4xl font-bold tracking-[-0.05em]">
            {score.crowdW}–{score.crowdL}{" "}
            <span className="font-mono text-sm font-medium tracking-normal text-muted">
              {pct(score.crowdW, score.crowdL)}
            </span>
          </p>
        </div>
      </div>
      <p className="border-t border-line p-4 text-sm text-muted">
        Can humans predict virality better than an AI? {AI_NAME} stakes points on every market and posts its reasoning
        on-chain before calls close. {score.live > 0 && `${score.live} live duels open right now.`}
      </p>
    </div>
  );
}
