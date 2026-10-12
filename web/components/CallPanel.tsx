"use client";

import { useState } from "react";
import type { Address } from "viem";
import { marketAbi } from "@/lib/abi";
import { explorerTx, MARKET_ADDRESS, NETWORK_LABEL } from "@/lib/chain";
import { formatPoints, formatViews, multiple, phaseOf, Side, type Market, type SideValue } from "@/lib/markets";
import { commitmentFor, saltFor, unlockSealedKey } from "@/lib/sealed";
import { describeTxError } from "@/lib/tx";
import { duelPath, duelText } from "@/lib/share";
import { useVideoMeta } from "@/lib/useVideoMeta";
import { ShareCard } from "./ShareCard";
import { SignInPanel } from "./WalletButton";
import { useWallet } from "./WalletProvider";

const PRESETS = [25, 50, 100, 250];

export type CallResult = { side: SideValue; amount: number; ms: number; hash: string; sealed: boolean };

export function CallPanel({
  market,
  rival,
  suggestedSide,
  hasSealed = false,
  onCalled,
}: {
  market: Market;
  rival?: Address;
  suggestedSide?: SideValue;
  /** One sealed call per market per player. */
  hasSealed?: boolean;
  onCalled?: (r: CallResult) => void;
}) {
  const w = useWallet();
  const [side, setSide] = useState<SideValue>(suggestedSide ?? Side.Yes);
  const [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [done, setDone] = useState<CallResult>();
  const [sealed, setSealed] = useState(false);
  const meta = useVideoMeta(market.videoId);

  if (phaseOf(market) !== "open") return null;
  if (w.status !== "ready") return <SignInPanel />;

  const payout = Math.floor(amount * multiple(market, side));
  const tooMuch = BigInt(amount) > w.points;

  async function submit() {
    setBusy(true);
    setErr(undefined);
    const rivalArg = rival ?? "0x0000000000000000000000000000000000000000";
    try {
      if (sealed && !hasSealed) {
        // Second PRF namespace of the same passkey → per-market salt; only the hash goes on-chain.
        const key = await unlockSealedKey();
        const commitment = commitmentFor(market.id, w.address!, side, await saltFor(key, market.id));
        const res = await w.write(
          `Sealed a call · ${amount} pts`,
          {
            address: MARKET_ADDRESS,
            abi: marketAbi,
            functionName: "commitCall",
            args: [market.id, commitment, BigInt(amount), rivalArg],
          },
          amount,
        );
        const r = { side, amount, ms: res.ms, hash: res.receipt.transactionHash, sealed: true };
        setDone(r);
        onCalled?.(r);
        return;
      }
      const res = await w.write(
        `Called ${side === Side.Yes ? "YES" : "NO"} · ${amount} pts`,
        {
          address: MARKET_ADDRESS,
          abi: marketAbi,
          functionName: "call",
          args: [market.id, side, BigInt(amount), rivalArg],
        },
        amount,
      );
      const r = { side, amount, ms: res.ms, hash: res.receipt.transactionHash, sealed: false };
      setDone(r);
      onCalled?.(r);
    } catch (e) {
      setErr(describeTxError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <p className="font-bold">Make your call</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          className={`btn ${side === Side.Yes ? "btn-yes" : "btn-ghost"} py-4 text-lg`}
          onClick={() => setSide(Side.Yes)}
        >
          YES, it hits
        </button>
        <button
          className={`btn ${side === Side.No ? "btn-no" : "btn-ghost"} py-4 text-lg`}
          onClick={() => setSide(Side.No)}
        >
          NO, it flops
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            className={`btn px-4 py-2 text-sm ${amount === p ? "btn-accent" : "btn-ghost"}`}
            onClick={() => setAmount(p)}
          >
            {p}
          </button>
        ))}
        <input
          type="number"
          min={10}
          max={10000}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))}
          className="w-24 rounded-full border border-line bg-surface-2 px-4 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${
          sealed ? "border-accent bg-accent/10" : "border-line"
        } ${hasSealed ? "opacity-50" : ""}`}
      >
        <input
          type="checkbox"
          className="mt-1 accent-[var(--accent)]"
          checked={sealed && !hasSealed}
          disabled={hasSealed}
          onChange={(e) => setSealed(e.target.checked)}
        />
        <span>
          <b>Seal it 🔒</b>{" "}
          <span className="text-muted">
            {hasSealed
              ? "You already have a sealed call here."
              : "Hide your side until calls close so nobody can copy you. Your passkey reveals it later, from any device."}
          </span>
        </span>
      </label>
      <p className="text-sm text-muted">
        Win ≈ <b className="text-text">{Number.isFinite(payout) ? formatPoints(payout) : "the whole pot"}</b> pts if
        right · you have {formatPoints(w.points)}
      </p>
      <button className="btn btn-accent w-full py-4 text-lg" disabled={busy || amount < 10 || tooMuch} onClick={submit}>
        {busy
          ? "Calling…"
          : tooMuch
            ? "Not enough points"
            : sealed && !hasSealed
              ? `Seal ${side === Side.Yes ? "YES" : "NO"} for ${amount}`
              : `Call ${side === Side.Yes ? "YES" : "NO"} for ${amount}`}
      </button>
      {err && <p className="rounded-xl bg-no/10 p-3 text-sm text-no">{err}</p>}
      {done && (
        <div className="pop rounded-xl border border-yes/40 bg-yes/10 p-4 text-sm">
          <p className="text-lg font-black text-yes">
            ⚡ {done.sealed ? "Sealed" : "Confirmed"} in {done.ms}ms
          </p>
          <p className="text-muted">
            Final on {NETWORK_LABEL}.{" "}
            {explorerTx(done.hash) && (
              <a className="underline" href={explorerTx(done.hash)} target="_blank">
                View transaction
              </a>
            )}
          </p>
        </div>
      )}
      {done && w.address && (
        <ShareCard
          heading="Dare a friend to take the other side"
          path={duelPath({
            marketId: market.id,
            from: w.address,
            handle: w.handle,
            side: done.sealed ? undefined : done.side,
            sealed: done.sealed,
            ms: done.ms,
          })}
          text={duelText({
            title: meta?.title ?? "this video",
            target: formatViews(market.threshold),
            side: done.side,
            sealed: done.sealed,
            ms: done.ms,
          })}
        />
      )}
    </div>
  );
}
