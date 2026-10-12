"use client";

import { isMeraError } from "@category-labs/mera";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Abi, Address } from "viem";
import { pointsAbi } from "@/lib/abi";
import { POINTS_ADDRESS, publicClient } from "@/lib/chain";
import { createAccount, describeMeraError, forgetCredential, loadCredential, signIn as meraSignIn } from "@/lib/mera";
import { ScopedSession, SessionScopeError, type SessionInfo } from "@/lib/session";
import type { FastReceipt } from "@/lib/tx";
import { describeTxError } from "@/lib/tx";

type Status = "signed-out" | "connecting" | "funding" | "ready";

export type LastTx = { label: string; hash: string; ms: number; block: bigint };

type WalletCtx = {
  status: Status;
  address?: Address;
  handle: string;
  setHandle: (h: string) => void;
  hasPasskey: boolean;
  points: bigint;
  session?: SessionInfo;
  lastTx?: LastTx;
  error?: string;
  clearError: () => void;
  create: (handle: string) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => void;
  /** Sends inside the scoped session; re-prompts the passkey if the call is out of scope. */
  write: (
    label: string,
    req: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
    pointsAtRisk?: number,
  ) => Promise<FastReceipt>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<WalletCtx | null>(null);
const HANDLE_KEY = "cloutcall.handle";

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

async function waitBlocks(from: bigint, n: bigint) {
  // Monad consensus checks balances against state ~3 blocks behind; wait it out after a drip.
  for (let i = 0; i < 20; i++) {
    if ((await publicClient.getBlockNumber({ cacheTime: 0 })) >= from + n) return;
    await new Promise((r) => setTimeout(r, 150));
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const sessionRef = useRef<ScopedSession | null>(null);
  const [status, setStatus] = useState<Status>("signed-out");
  const [address, setAddress] = useState<Address>();
  const [handle, setHandleState] = useState("");
  const [hasPasskey, setHasPasskey] = useState(false);
  const [points, setPoints] = useState(0n);
  const [session, setSession] = useState<SessionInfo>();
  const [lastTx, setLastTx] = useState<LastTx>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    try {
      setHandleState(localStorage.getItem(HANDLE_KEY) ?? "");
    } catch {}
    setHasPasskey(!!loadCredential());
    return () => sessionRef.current?.end();
  }, []);

  const setHandle = useCallback((h: string) => {
    setHandleState(h);
    try {
      localStorage.setItem(HANDLE_KEY, h);
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    const bal = await publicClient.readContract({
      address: POINTS_ADDRESS,
      abi: pointsAbi,
      functionName: "balanceOf",
      args: [s.address],
    });
    setPoints(bal);
    setSession(s.info());
  }, []);

  const send = useCallback(
    async (
      label: string,
      req: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
      pointsAtRisk = 0,
    ) => {
      const s = sessionRef.current;
      if (!s) throw new Error("Sign in first");
      const res = await s.write(req, pointsAtRisk);
      setLastTx({ label, hash: res.receipt.transactionHash, ms: res.ms, block: res.receipt.blockNumber });
      setSession(s.info());
      return res;
    },
    [],
  );

  /** Fund gas if needed, then grant starter points — all without extra prompts. */
  const onboard = useCallback(
    async (s: ScopedSession) => {
      setStatus("funding");
      const drip = await fetch("/api/drip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: s.address }),
      }).then((r) => r.json() as Promise<{ funded?: boolean; blockNumber?: string; error?: string }>);
      if (drip.funded && drip.blockNumber) await waitBlocks(BigInt(drip.blockNumber), 3n);
      else if (drip.error && (await publicClient.getBalance({ address: s.address })) === 0n) {
        throw new Error(`Couldn't sponsor gas: ${drip.error}`);
      }

      const claimed = await publicClient.readContract({
        address: POINTS_ADDRESS,
        abi: pointsAbi,
        functionName: "claimedStarter",
        args: [s.address],
      });
      if (!claimed) {
        await send("Claimed 1,000 starter points", {
          address: POINTS_ADDRESS,
          abi: pointsAbi,
          functionName: "claimStarter",
          args: [],
        });
      }
    },
    [send],
  );

  const start = useCallback(
    async (open: () => Promise<{ session: import("@category-labs/mera").Secp256k1SigningSession }>) => {
      setError(undefined);
      setStatus("connecting");
      try {
        const { session: mera } = await open();
        sessionRef.current?.end();
        const s = new ScopedSession(mera);
        sessionRef.current = s;
        setAddress(s.address);
        setHasPasskey(true);
        setSession(s.info());
        await onboard(s);
        await refresh();
        setStatus("ready");
      } catch (e) {
        setError(isMeraError(e) ? describeMeraError(e) : describeTxError(e));
        setStatus(sessionRef.current ? "ready" : "signed-out");
      }
    },
    [onboard, refresh],
  );

  const create = useCallback(
    async (h: string) => {
      setHandle(h);
      await start(() => createAccount(h || "caller"));
    },
    [setHandle, start],
  );

  const signIn = useCallback(() => start(meraSignIn), [start]);

  const signOut = useCallback(() => {
    sessionRef.current?.end();
    sessionRef.current = null;
    setAddress(undefined);
    setSession(undefined);
    setPoints(0n);
    setStatus("signed-out");
  }, []);

  const write = useCallback<WalletCtx["write"]>(
    async (label, req, pointsAtRisk = 0) => {
      try {
        const res = await send(label, req, pointsAtRisk);
        refresh();
        return res;
      } catch (e) {
        if (!(e instanceof SessionScopeError)) throw e;
        // Out of scope: one more passkey prompt opens a fresh, bounded session, then retry once.
        const { session: mera } = await meraSignIn();
        sessionRef.current?.end();
        sessionRef.current = new ScopedSession(mera);
        const res = await send(label, req, pointsAtRisk);
        refresh();
        return res;
      }
    },
    [send, refresh],
  );

  return (
    <Ctx.Provider
      value={{
        status,
        address,
        handle,
        setHandle,
        hasPasskey,
        points,
        session,
        lastTx,
        error,
        clearError: () => setError(undefined),
        create,
        signIn,
        signOut,
        write,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function forgetThisDevice() {
  forgetCredential();
  try {
    localStorage.removeItem(HANDLE_KEY);
  } catch {}
}
