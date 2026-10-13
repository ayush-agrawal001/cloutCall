"use client";

import Link from "next/link";
import type { Address } from "viem";
import { AGENT_ADDRESS, explorerTx, houseBotNumber } from "@/lib/chain";
import type { MarketEvent } from "@/lib/live";
import { formatPoints, formatViews, shortAddress, Side } from "@/lib/markets";

function who(a: unknown, me?: Address) {
  const addr = String(a);
  if (me && addr.toLowerCase() === me.toLowerCase()) return "You";
  if (AGENT_ADDRESS && addr.toLowerCase() === AGENT_ADDRESS.toLowerCase()) return "CloutBot";
  const bot = houseBotNumber(addr);
  if (bot) return `Liquidity bot ${bot}`;
  return shortAddress(addr);
}

function describe(e: MarketEvent, me?: Address) {
  const a = e.args;
  switch (e.name) {
    case "Called": {
      const yes = Number(a.side) === Side.Yes;
      const rival = a.rival && String(a.rival) !== "0x0000000000000000000000000000000000000000";
      return (
        <>
          <b>{who(a.player, me)}</b> called <b className={yes ? "text-yes" : "text-no"}>{yes ? "YES" : "NO"}</b> ·{" "}
          {formatPoints(a.amount as bigint)} pts{rival && <span className="text-muted"> vs {who(a.rival, me)}</span>}
        </>
      );
    }
    case "SealedCallCommitted":
      return (
        <>
          <b>{who(a.player, me)}</b> sealed a call · {formatPoints(a.amount as bigint)} pts
        </>
      );
    case "SealedCallRevealed": {
      const yes = Number(a.side) === Side.Yes;
      return (
        <>
          <b>{who(a.player, me)}</b> revealed <b className={yes ? "text-yes" : "text-no"}>{yes ? "YES" : "NO"}</b>
        </>
      );
    }
    case "Resolved":
      return (
        <>
          Settled at <b>{formatViews(a.finalViews as bigint)}</b> views →{" "}
          <b className={Number(a.outcome) === Side.Yes ? "text-yes" : "text-no"}>
            {Number(a.outcome) === Side.Yes ? "YES" : "NO"}
          </b>
        </>
      );
    case "Claimed":
      return (
        <>
          <b>{who(a.player, me)}</b> collected {formatPoints(a.payout as bigint)} pts
        </>
      );
    case "Voided":
      return <>Market voided — stakes refunded</>;
    case "MarketCreated":
      return <>Market opened</>;
    default:
      return <>{e.name}</>;
  }
}

const stateStyle: Record<string, string> = {
  Proposed: "text-warn",
  Voted: "text-accent-2",
  Finalized: "text-yes",
  Verified: "text-yes",
  Confirmed: "text-yes",
};

export function ActivityFeed({
  events,
  me,
  limit = 25,
  showMarket = false,
  empty = "No calls yet — be first.",
}: {
  events: MarketEvent[];
  me?: Address;
  limit?: number;
  showMarket?: boolean;
  empty?: string;
}) {
  if (events.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="border-t border-line">
      {events.slice(0, limit).map((e) => (
        <li key={e.key} className="pop flex items-baseline justify-between gap-3 border-b border-line py-2.5 text-sm">
          <span>
            {showMarket && (
              <Link href={`/m/${e.marketId}`} className="mr-1.5 font-mono text-[11px] text-muted hover:text-text">
                #{e.marketId.toString()}
              </Link>
            )}
            {describe(e, me)}
          </span>
          <a
            href={explorerTx(e.txHash)}
            target="_blank"
            className={`shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] ${stateStyle[e.commitState] ?? "text-muted"}`}
            title="Monad commit state"
          >
            {e.commitState}
          </a>
        </li>
      ))}
    </ul>
  );
}
