"use client";

import type { Address } from "viem";
import { explorerTx } from "@/lib/chain";
import type { MarketEvent } from "@/lib/live";
import { formatPoints, formatViews, shortAddress, Side } from "@/lib/markets";

function who(a: unknown, me?: Address) {
  const addr = String(a);
  return me && addr.toLowerCase() === me.toLowerCase() ? "You" : shortAddress(addr);
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
          <b>{who(a.player, me)}</b> sealed a call 🔒 · {formatPoints(a.amount as bigint)} pts
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

export function ActivityFeed({ events, me }: { events: MarketEvent[]; me?: Address }) {
  if (events.length === 0) return <p className="text-sm text-muted">No calls yet — be first.</p>;
  return (
    <ul className="space-y-2">
      {events.slice(0, 25).map((e) => (
        <li
          key={e.key}
          className="pop flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm"
        >
          <span>{describe(e, me)}</span>
          <a
            href={explorerTx(e.txHash)}
            target="_blank"
            className={`shrink-0 font-mono text-xs ${stateStyle[e.commitState] ?? "text-muted"}`}
            title="Monad commit state"
          >
            {e.commitState}
          </a>
        </li>
      ))}
    </ul>
  );
}
