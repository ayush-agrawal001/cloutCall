"use client";

import Link from "next/link";
import { AI_NAME, type AiPick } from "@/lib/ai";
import { formatViews, phaseOf, Side, type Market } from "@/lib/markets";

/** The AI rival's on-chain call, with a one-tap way to bet against it. */
export function AiRivalCard({
  market,
  pick,
  dueling,
  onDuel,
}: {
  market: Market;
  pick: AiPick | null;
  dueling: boolean;
  onDuel: () => void;
}) {
  const phase = phaseOf(market);
  if (!pick) {
    return phase === "open" ? (
      <div className="card p-5 text-sm text-muted">🤖 {AI_NAME} is still analyzing this upload…</div>
    ) : null;
  }
  const yes = pick.side === Side.Yes;
  const settled = phase === "resolved";
  const aiRight = settled && market.outcome === pick.side;
  return (
    <div className={`card space-y-3 p-5 ${dueling ? "border-accent" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="font-bold">🤖 {AI_NAME} says</p>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted">{pick.model}</span>
      </div>
      <p className="text-3xl font-black">
        <span className={yes ? "text-yes" : "text-no"}>{yes ? "YES" : "NO"}</span>{" "}
        <span className="text-base font-semibold text-muted">· {pick.confidence}% sure</span>
      </p>
      <p className="text-sm">&ldquo;{pick.reasoning}&rdquo;</p>
      <p className="text-xs text-muted">
        Predicts {formatViews(pick.predictedViews)} views · pick and stake recorded on-chain before calls closed ·{" "}
        <Link href="/cloutbot" className="underline">
          all {AI_NAME} calls
        </Link>
      </p>
      {settled ? (
        <p className={`rounded-xl p-3 text-sm font-semibold ${aiRight ? "bg-no/10 text-no" : "bg-yes/10 text-yes"}`}>
          {aiRight ? `${AI_NAME} called it. Humans: 0, AI: 1.` : `${AI_NAME} got it wrong — humans win this one.`}
        </p>
      ) : (
        phase === "open" && (
          <button className={`btn w-full ${dueling ? "btn-accent" : "btn-ghost"}`} onClick={onDuel}>
            {dueling ? "⚔️ Dueling CloutBot" : `Think the AI is wrong? Take ${yes ? "NO" : "YES"}`}
          </button>
        )
      )}
    </div>
  );
}
