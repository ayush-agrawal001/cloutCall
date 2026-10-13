"use client";

import { useEffect, useState } from "react";
import { marketAbi } from "@/lib/abi";
import { AI_ENABLED, AI_NAME, fetchAiPick } from "@/lib/ai";
import { AGENT_ADDRESS, HOUSE_BOTS, MARKET_ADDRESS, publicClient } from "@/lib/chain";
import { fetchMarkets, Side, Status, type Market } from "@/lib/markets";
import { PixelIcon } from "./Pixel";

type Score = { aiW: number; aiL: number; crowdW: number; crowdL: number; live: number };

/** Accounts that aren't people: the AI itself and the house liquidity bots. */
const NOT_PEOPLE = [...(AGENT_ADDRESS ? [AGENT_ADDRESS.toLowerCase()] : []), ...HOUSE_BOTS] as `0x${string}`[];
/** Settled markets never change, so each one's human pools are read once. */
const humanPools = new Map<bigint, { yes: bigint; no: bigint }>();

/** The YES/NO points staked by people only, so "the crowd" never includes the AI or the bots. */
async function peoplePools(m: Market) {
  const cached = humanPools.get(m.id);
  if (cached) return cached;
  let yes = m.yesPool;
  let no = m.noPool;
  for (const player of NOT_PEOPLE) {
    const p = await publicClient.readContract({
      address: MARKET_ADDRESS,
      abi: marketAbi,
      functionName: "positionOf",
      args: [m.id, player],
    });
    yes -= p.yes;
    no -= p.no;
  }
  const out = { yes, no };
  humanPools.set(m.id, out);
  return out;
}

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
      for (const [i, m] of markets.entries()) {
        const pick = picks[i];
        if (!pick) continue;
        if (m.status === Status.Open) {
          s.live++;
          continue;
        }
        if (m.status !== Status.Resolved) continue;
        if (pick.side === m.outcome) s.aiW++;
        else s.aiL++;
        const people = await peoplePools(m);
        if (people.yes === people.no) continue;
        const crowd = people.yes > people.no ? Side.Yes : Side.No;
        if (crowd === m.outcome) s.crowdW++;
        else s.crowdL++;
      }
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
        Can humans predict virality better than an AI? When it is running, {AI_NAME} stakes points on open markets and
        posts its reasoning on-chain before calls close. {score.live > 0 && `${score.live} live duels open right now.`}
      </p>
    </div>
  );
}
