"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPoints, shortAddress } from "@/lib/markets";
import { useWallet } from "./WalletProvider";

export function SignInPanel({ compact = false }: { compact?: boolean }) {
  const w = useWallet();
  const [handle, setHandle] = useState(w.handle);
  const busy = w.status === "connecting" || w.status === "funding";

  return (
    <div className={compact ? "space-y-3" : "card space-y-4 p-5"}>
      {!compact && (
        <div>
          <p className="text-lg font-bold">Play with Face ID</p>
          <p className="text-sm text-muted">No wallet, no seed phrase, no gas. Your passkey is your account.</p>
        </div>
      )}
      {!w.hasPasskey && (
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value.replace(/[^\w.-]/g, "").slice(0, 20))}
          placeholder="Pick a handle (e.g. viewcounter)"
          className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 outline-none focus:border-accent"
        />
      )}
      <div className="flex flex-wrap gap-2">
        {w.hasPasskey ? (
          <button className="btn btn-accent flex-1" disabled={busy} onClick={() => w.signIn()}>
            {busy ? "Opening…" : "Sign in with passkey"}
          </button>
        ) : (
          <button className="btn btn-accent flex-1" disabled={busy || !handle} onClick={() => w.create(handle)}>
            {busy
              ? w.status === "funding"
                ? "Setting you up…"
                : "Waiting for passkey…"
              : "Create account with Face ID"}
          </button>
        )}
        <button className="btn btn-ghost" disabled={busy} onClick={() => w.signIn()}>
          {w.hasPasskey ? "Other passkey" : "I have a passkey"}
        </button>
      </div>
      {w.error && (
        <p className="rounded-xl bg-no/10 p-3 text-sm text-no" onClick={w.clearError}>
          {w.error}
        </p>
      )}
    </div>
  );
}

export function WalletButton() {
  const w = useWallet();
  const [open, setOpen] = useState(false);

  if (w.status === "ready" && w.address) {
    return (
      <Link
        href="/me"
        className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm"
      >
        <span className="font-bold text-accent-2">{formatPoints(w.points)} pts</span>
        <span className="text-muted">
          {w.persona ? "🕶️ " : ""}
          {w.handle || shortAddress(w.address)}
        </span>
      </Link>
    );
  }
  return (
    <div className="relative">
      <button className="btn btn-accent px-4 py-1.5 text-sm" onClick={() => setOpen((o) => !o)}>
        {w.status === "connecting" || w.status === "funding" ? "Connecting…" : "Sign in"}
      </button>
      {open && w.status !== "ready" && (
        <div className="card absolute right-0 top-12 z-30 w-80 p-4 shadow-2xl">
          <SignInPanel compact />
        </div>
      )}
    </div>
  );
}
