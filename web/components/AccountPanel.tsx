"use client";

import { explorerAddress, explorerTx, NETWORK_LABEL } from "@/lib/chain";
import { formatPoints } from "@/lib/markets";
import { KeysPanel } from "./KeysPanel";
import { PersonasPanel } from "./PersonasPanel";
import { SetupNotice, SignInPanel } from "./WalletButton";
import { forgetThisDevice, useWallet } from "./WalletProvider";

export function AccountPanel() {
  const w = useWallet();
  if (w.status !== "ready" || !w.address) {
    return (
      <div className="mx-auto max-w-md pt-10">
        <SignInPanel />
      </div>
    );
  }
  const s = w.session;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card p-6">
        <p className="text-sm text-muted">Signed in as</p>
        <p className="text-2xl font-black">{w.handle || "caller"}</p>
        <a className="break-all font-mono text-sm text-accent-2" href={explorerAddress(w.address)} target="_blank">
          {w.address}
        </a>
        <p className="mt-4 text-4xl font-black">
          {formatPoints(w.points)} <span className="text-base font-semibold text-muted">points</span>
        </p>
        <div className="mt-4 empty:hidden">
          <SetupNotice />
        </div>
      </div>

      {s && (
        <div className="card space-y-2 p-6 text-sm">
          <p className="font-bold">Signing session</p>
          <p className="text-muted">
            One passkey prompt opened a scoped session: calls to CloutCall contracts on {NETWORK_LABEL} sign instantly,
            up to <b className="text-text">{s.budget} points</b> at risk, until{" "}
            <b className="text-text">{new Date(s.expiresAt).toLocaleTimeString()}</b>. Anything beyond that asks for
            your passkey again. Until then the key is kept encrypted on this device so a reload doesn&apos;t sign you
            out; it&apos;s deleted when the session ends or you sign out.
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent" style={{ width: `${Math.min(100, (s.spent / s.budget) * 100)}%` }} />
          </div>
          <p className="text-xs text-muted">
            {s.spent} / {s.budget} points used this session
          </p>
        </div>
      )}

      <PersonasPanel />

      <KeysPanel />

      {w.lastTx && (
        <div className="card p-6 text-sm">
          <p className="font-bold">Last transaction</p>
          <p className="text-muted">
            {w.lastTx.label} — confirmed in <b className="text-yes">{w.lastTx.ms}ms</b> (block{" "}
            {w.lastTx.block.toString()}){" "}
            {explorerTx(w.lastTx.hash) && (
              <a className="text-accent-2 underline" href={explorerTx(w.lastTx.hash)} target="_blank">
                view
              </a>
            )}
          </p>
        </div>
      )}

      <div className="card space-y-3 p-6 text-sm">
        <p className="font-bold">Your account lives on-chain</p>
        <p className="text-muted">
          Nothing secret outlives your signing session on this device. Clear site data or open CloutCall on another
          device with the same synced passkey and your account, points and history come straight back from the chain.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={w.signOut}>
            Sign out
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              forgetThisDevice();
              w.signOut();
              location.reload();
            }}
          >
            Forget this device
          </button>
        </div>
      </div>
    </div>
  );
}
