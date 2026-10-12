"use client";

import { Side, shortAddress, type SideValue } from "@/lib/markets";
import { MarketView } from "./MarketView";
import { useWallet } from "./WalletProvider";

export function DuelView({
  id,
  rival,
  handle,
  side,
  sealed,
  won,
}: {
  id: bigint;
  rival?: `0x${string}`;
  handle?: string;
  side?: SideValue;
  sealed?: boolean;
  won?: number;
}) {
  const w = useWallet();
  const who = handle || (rival ? shortAddress(rival) : "A friend");
  const own = !!rival && w.address?.toLowerCase() === rival.toLowerCase();
  const opposite = side === Side.Yes ? Side.No : side === Side.No ? Side.Yes : undefined;

  const banner = (
    <div className="card pop flex items-center gap-4 border-accent/50 p-5">
      <span className="text-4xl">⚔️</span>
      <div>
        <p className="text-lg font-black">
          {own
            ? "This is your duel link — send it to a friend."
            : won
              ? `${who} called this one and won ${won.toLocaleString("en")} pts. Think you can do better?`
              : sealed
                ? `${who} sealed a call on this. Bet against them blind.`
                : `${who} called ${side === Side.Yes ? "YES" : side === Side.No ? "NO" : "it"}. Take the other side?`}
        </p>
        <p className="text-sm text-muted">One tap with Face ID. No wallet, no gas, settles in under a second.</p>
      </div>
    </div>
  );

  return <MarketView id={id} rival={own ? undefined : rival} suggestedSide={opposite} banner={banner} />;
}
