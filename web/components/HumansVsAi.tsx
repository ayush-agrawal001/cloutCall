"use client";

import { useEffect, useState } from "react";
import { AI_ENABLED, AI_NAME, fetchAiPick } from "@/lib/ai";
import { fetchMarkets, Side, Status } from "@/lib/markets";

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
    <div className="card grid gap-4 p-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted">🤖 {AI_NAME} · Kimi</p>
        <p className="text-3xl font-black">
          {score.aiW}–{score.aiL} <span className="text-base text-muted">{pct(score.aiW, score.aiL)}</span>
        </p>
      </div>
      <p className="text-center text-lg font-black text-accent-2">VS</p>
      <div className="sm:text-right">
        <p className="text-xs uppercase tracking-wider text-muted">👥 The crowd</p>
        <p className="text-3xl font-black">
          {score.crowdW}–{score.crowdL} <span className="text-base text-muted">{pct(score.crowdW, score.crowdL)}</span>
        </p>
      </div>
      <p className="text-sm text-muted sm:col-span-3">
        Can humans predict virality better than an AI? {AI_NAME} stakes points on every market and posts its reasoning
        on-chain before calls close. {score.live > 0 && `${score.live} live duels open right now.`}
      </p>
    </div>
  );
}
