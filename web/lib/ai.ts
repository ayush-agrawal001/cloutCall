"use client";

import { useEffect, useState } from "react";
import { journalAbi } from "./abi";
import { AGENT_ADDRESS, JOURNAL_ADDRESS, publicClient } from "./chain";
import type { SideValue } from "./markets";

export type AiPick = {
  side: SideValue;
  confidence: number; // percent
  predictedViews: bigint;
  recordedAt: bigint;
  model: string;
  reasoning: string;
};

export const AI_ENABLED = !!(JOURNAL_ADDRESS && AGENT_ADDRESS);
export const AI_NAME = "CloutBot";

export async function fetchAiPick(marketId: bigint): Promise<AiPick | null> {
  if (!AI_ENABLED) return null;
  const p = await publicClient.readContract({
    address: JOURNAL_ADDRESS!,
    abi: journalAbi,
    functionName: "pickOf",
    args: [marketId, AGENT_ADDRESS!],
  });
  if (p.recordedAt === 0n) return null;
  return {
    side: p.side as SideValue,
    confidence: Math.round(p.confidenceBps / 100),
    predictedViews: p.predictedViews,
    recordedAt: p.recordedAt,
    model: p.model,
    reasoning: p.reasoning,
  };
}

/** The AI rival's pick for a market, refreshed every 10s until it exists. */
export function useAiPick(marketId: bigint | undefined) {
  const [pick, setPick] = useState<AiPick | null>(null);
  useEffect(() => {
    if (marketId === undefined || !AI_ENABLED) return;
    let live = true;
    let found = false;
    const load = () =>
      fetchAiPick(marketId)
        .then((p) => {
          if (!live) return;
          setPick(p);
          found = !!p;
        })
        .catch(() => {});
    load();
    const t = setInterval(() => !found && load(), 10_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [marketId]);
  return pick;
}
