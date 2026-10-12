"use client";

import { useEffect, useState } from "react";
import { marketAbi } from "@/lib/abi";
import { MARKET_ADDRESS } from "@/lib/chain";
import { phaseOf, Side, type Market, type SideValue } from "@/lib/markets";
import { isSealedKeyUnlocked, openSealedCall, unlockSealedKey } from "@/lib/sealed";
import { describeTxError } from "@/lib/tx";
import { describeMeraError } from "@/lib/mera";
import { isMeraError } from "@category-labs/mera";
import { useWallet } from "./WalletProvider";

type Pos = { sealedStake: bigint; commitment: `0x${string}`; revealed: boolean };

/** Shows and reveals the player's sealed call using only their passkey — works on any device. */
export function RevealPanel({ market, pos, onRevealed }: { market: Market; pos?: Pos; onRevealed?: () => void }) {
  const w = useWallet();
  const [pick, setPick] = useState<{ side: SideValue; salt: `0x${string}` } | null>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const phase = phaseOf(market);

  const hasSealed = !!pos && pos.commitment !== `0x${"0".repeat(64)}` && !pos.revealed;

  useEffect(() => {
    // If the sealed key is already unlocked this session, show the pick without another prompt.
    if (!hasSealed || !w.address || !isSealedKeyUnlocked()) return;
    unlockSealedKey()
      .then((k) => openSealedCall(k, market.id, w.address!, pos!.commitment))
      .then(setPick)
      .catch(() => {});
  }, [hasSealed, w.address, market.id, pos]);

  if (!hasSealed || !w.address || (phase !== "open" && phase !== "revealing")) return null;

  async function unlock() {
    setErr(undefined);
    try {
      const k = await unlockSealedKey();
      const found = await openSealedCall(k, market.id, w.address!, pos!.commitment);
      setPick(found);
      if (!found) setErr("This passkey didn't make this sealed call.");
      return found;
    } catch (e) {
      setErr(isMeraError(e) ? describeMeraError(e) : String(e));
      return null;
    }
  }

  async function reveal() {
    setBusy(true);
    setErr(undefined);
    try {
      const found = pick ?? (await unlock());
      if (!found) return;
      await w.write(`Revealed sealed ${found.side === Side.Yes ? "YES" : "NO"}`, {
        address: MARKET_ADDRESS,
        abi: marketAbi,
        functionName: "revealCall",
        args: [market.id, found.side, found.salt],
      });
      onRevealed?.();
    } catch (e) {
      setErr(describeTxError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`card space-y-3 p-5 ${phase === "revealing" ? "border-warn" : ""}`}>
      <p className="font-bold">🔒 Your sealed call</p>
      {pick ? (
        <p className="text-sm">
          Your pick:{" "}
          <b className={pick.side === Side.Yes ? "text-yes" : "text-no"}>{pick.side === Side.Yes ? "YES" : "NO"}</b>{" "}
          <span className="text-muted">— derived from your passkey, never stored.</span>
        </p>
      ) : (
        <button className="btn btn-ghost w-full" onClick={unlock}>
          Show my pick (passkey)
        </button>
      )}
      {phase === "revealing" ? (
        <>
          <p className="text-sm text-warn">
            Calls are closed. Reveal before settlement or your stake goes to the winners.
          </p>
          <button className="btn btn-accent w-full" disabled={busy} onClick={reveal}>
            {busy ? "Revealing…" : "Reveal now"}
          </button>
        </>
      ) : (
        <p className="text-xs text-muted">
          Reveal after calls close. Rivals only see that you sealed {Number(pos!.sealedStake)} points.
        </p>
      )}
      {err && <p className="text-sm text-no">{err}</p>}
    </div>
  );
}
