"use client";

import { isMeraError } from "@category-labs/mera";
import { useState } from "react";
import { describeMeraError, WALLET_PATH } from "@/lib/mera";
import { SEALED_NAMESPACE, sealedKeyFingerprint, unlockSealedKey } from "@/lib/sealed";
import { useWallet } from "./WalletProvider";

/** "One passkey, many keys": every key CloutCall derives, and what it is (and isn't) used for. */
export function KeysPanel() {
  const w = useWallet();
  const [fp, setFp] = useState<string>();
  const [err, setErr] = useState<string>();

  async function unlock() {
    setErr(undefined);
    try {
      setFp(await sealedKeyFingerprint(await unlockSealedKey()));
    } catch (e) {
      setErr(isMeraError(e) ? describeMeraError(e) : String(e));
    }
  }

  return (
    <div className="card space-y-4 p-6 text-sm">
      <div>
        <p className="font-bold">One passkey, many keys</p>
        <p className="text-muted">
          Your passkey&apos;s PRF is evaluated under separate namespaces. Each yields an unrelated secret, so the key
          that signs transactions can never reveal your sealed picks, and vice versa.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-surface-2 p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Key 1 · Monad wallet</p>
          <p className="mt-1 break-all font-mono text-xs">{w.address}</p>
          <p className="mt-2 text-xs text-muted">
            mera default namespace → BIP-39 → <code>{WALLET_PATH}</code>. Signs CloutCall transactions inside a scoped
            session. MetaMask-compatible derivation.
          </p>
        </div>
        <div className="rounded-xl bg-surface-2 p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Key 2 · Sealed calls</p>
          <p className="mt-1 font-mono text-xs">{fp ? `fingerprint ${fp}` : "locked"}</p>
          <p className="mt-2 text-xs text-muted">
            Namespace <code>{SEALED_NAMESPACE}</code> → HKDF → non-extractable HMAC key. Derives each market&apos;s
            commit-reveal salt. Never signs, never leaves memory, never stored.
          </p>
          {!fp && (
            <button className="btn btn-ghost mt-3 w-full py-2 text-xs" onClick={unlock}>
              Unlock with passkey
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted">
        Cross-device check: sign in on another device with the same synced passkey — the address and fingerprint match,
        and your sealed picks open there too.
      </p>
      {err && <p className="text-no">{err}</p>}
    </div>
  );
}
