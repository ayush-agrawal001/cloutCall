"use client";

import { useState } from "react";
import { PERSONA_BRANCH } from "@/lib/mera";
import { shortAddress } from "@/lib/markets";
import { useWallet } from "./WalletProvider";

/** Unlinkable caller identities from one passkey — for group chats, leagues or just calling anonymously. */
export function PersonasPanel() {
  const w = useWallet();
  const [name, setName] = useState("");
  const busy = w.status === "connecting" || w.status === "funding";

  return (
    <div className="card space-y-4 p-6 text-sm">
      <div>
        <p className="font-bold">🕶️ Personas</p>
        <p className="text-muted">
          Call under a different name without linking it to your main account. Each persona is its own address, derived
          from the same passkey on a separate key branch (<code>{PERSONA_BRANCH}/…</code>) — nothing on-chain connects
          them. Type the same name on any device to get the same persona back.
        </p>
      </div>
      <p>
        Now playing as <b className="text-accent-2">{w.persona ? `🕶️ ${w.persona}` : "your main account"}</b>
        {w.address && <span className="font-mono text-xs text-muted"> · {shortAddress(w.address)}</span>}
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.replace(/[^\w.-]/g, "").slice(0, 20))}
          placeholder="persona name, e.g. office-league"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 outline-none focus:border-accent"
        />
        <button className="btn btn-accent px-4 py-2" disabled={!name || busy} onClick={() => w.switchPersona(name)}>
          {busy ? "…" : "Switch"}
        </button>
      </div>
      {(w.personas.length > 0 || w.persona) && (
        <div className="flex flex-wrap gap-2">
          {w.persona && (
            <button className="btn btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => w.signIn()}>
              ← Main account
            </button>
          )}
          {w.personas
            .filter((p) => p !== w.persona)
            .map((p) => (
              <button
                key={p}
                className="btn btn-ghost px-3 py-1.5 text-xs"
                disabled={busy}
                onClick={() => w.switchPersona(p)}
              >
                🕶️ {p}
              </button>
            ))}
        </div>
      )}
      <p className="text-xs text-muted">
        Each switch is one passkey tap. Persona names are remembered on this device only as a convenience — they are not
        secrets, and losing them loses nothing.
      </p>
    </div>
  );
}
