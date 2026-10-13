"use client";

import { isMeraError } from "@category-labs/mera";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Abi, Address } from "viem";
import { pointsAbi } from "@/lib/abi";
import { POINTS_ADDRESS, publicClient } from "@/lib/chain";
import {
  createAccount,
  describeMeraError,
  forgetCredential,
  loadCredential,
  signIn as meraSignIn,
  sessionFromKey,
} from "@/lib/mera";
import { runOnboarding, SetupError, type DripResult } from "@/lib/onboarding";
import {
  clearSession,
  forgetAccount,
  loadAccount,
  loadSession,
  rememberAccount,
  saveSession,
  updateSessionSpent,
} from "@/lib/rememberedSession";
import { lockSealedKey } from "@/lib/sealed";
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
  /**
   * Set when the passkey session opened but account setup (sponsored gas, starter points) didn't finish.
   * The player is signed in but can't play until `finishSetup` succeeds.
   */
  setupError?: string;
  settingUp: boolean;
  /** Re-runs setup inside the current session (no new passkey prompt). Never claims twice. */
  finishSetup: () => Promise<void>;
  create: (handle: string) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => void;
  /** Current persona name ("" = main account). Personas are unlinkable accounts from the same passkey. */
  persona: string;
  personas: string[];
  /** One passkey prompt opens the named persona's account ("" switches back to the main account). */
  switchPersona: (name: string) => Promise<void>;
  /** Sends inside the scoped session; re-prompts the passkey if the call is out of scope. */
  write: (
    label: string,
    req: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
    pointsAtRisk?: number,
  ) => Promise<FastReceipt>;
  refresh: () => Promise<void>;
  /** Signs a creator-link message inside the session (the only kind of message it will sign). */
  signLinkMessage: (message: string) => Promise<`0x${string}`>;
  /** Pre-computes gas for a likely next call so the tap is a single round-trip. */
  prefetch: (req: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] }) => void;
};

const Ctx = createContext<WalletCtx | null>(null);
const HANDLE_KEY = "cloutcall.handle";
const PERSONAS_KEY = "cloutcall.personas";

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

/** The player-facing reason account setup stopped. */
function setupMessage(e: unknown) {
  if (e instanceof SetupError) return e.message;
  if (e instanceof SessionScopeError) return "Your session expired. Sign in again to finish setting up.";
  return `Account setup failed: ${describeTxError(e)}`;
}

// Device-local, non-secret values (handle, whether a passkey was used here) read via an external store
// so server and client render the same first frame.
const localListeners = new Set<() => void>();
function subscribeLocal(cb: () => void) {
  localListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    localListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function notifyLocal() {
  localListeners.forEach((l) => l());
}
function readPersonas() {
  try {
    return localStorage.getItem(PERSONAS_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function readHandle() {
  try {
    return localStorage.getItem(HANDLE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const sessionRef = useRef<ScopedSession | null>(null);
  const [status, setStatus] = useState<Status>("signed-out");
  const [address, setAddress] = useState<Address>();
  const handle = useSyncExternalStore(subscribeLocal, readHandle, () => "");
  const hasPasskey = useSyncExternalStore(
    subscribeLocal,
    () => !!loadCredential(),
    () => false,
  );
  const personasRaw = useSyncExternalStore(subscribeLocal, readPersonas, () => "[]");
  const personas = useMemo(() => {
    try {
      return JSON.parse(personasRaw) as string[];
    } catch {
      return [];
    }
  }, [personasRaw]);
  const [persona, setPersona] = useState("");
  const personaRef = useRef("");
  const [points, setPoints] = useState(0n);
  const [session, setSession] = useState<SessionInfo>();
  const [lastTx, setLastTx] = useState<LastTx>();
  const [error, setError] = useState<string>();
  const [setupError, setSetupError] = useState<string>();
  const [settingUp, setSettingUp] = useState(false);
  const setupRunning = useRef(false);

  useEffect(() => () => sessionRef.current?.end(), []);

  const setHandle = useCallback((h: string) => {
    try {
      localStorage.setItem(HANDLE_KEY, h);
    } catch {}
    notifyLocal();
  }, []);

  /** The signed-in address, also when only remembered (the signing session expired and wasn't reopened). */
  const addressRef = useRef<Address | undefined>(undefined);

  const refresh = useCallback(async () => {
    const s = sessionRef.current;
    const who = s?.address ?? addressRef.current;
    if (!who) return;
    const bal = await publicClient.readContract({
      address: POINTS_ADDRESS,
      abi: pointsAbi,
      functionName: "balanceOf",
      args: [who],
    });
    setPoints(bal);
    setSession(s?.info());
  }, []);

  /** Adopts a freshly opened session: keeps it across reloads and remembers who is signed in. */
  const adopt = useCallback((s: ScopedSession, walletKey: Uint8Array | undefined) => {
    sessionRef.current?.end();
    sessionRef.current = s;
    addressRef.current = s.address;
    setAddress(s.address);
    setSession(s.info());
    rememberAccount(s.address, personaRef.current);
    if (walletKey) void saveSession(walletKey, s.info());
  }, []);

  // Back from a reload: reopen the saved signing session, or at least show who is signed in.
  useEffect(() => {
    const account = loadAccount();
    if (!account) return;
    let live = true;
    (async () => {
      const saved = await loadSession();
      if (!live || sessionRef.current) {
        saved?.privateKey.fill(0);
        return;
      }
      personaRef.current = account.persona;
      setPersona(account.persona);
      addressRef.current = account.address;
      if (saved && saved.info.address.toLowerCase() === account.address.toLowerCase()) {
        const { expiresAt, budget, spent } = saved.info;
        sessionRef.current = new ScopedSession(sessionFromKey(saved.privateKey), { expiresAt, budget, spent });
      } else {
        saved?.privateKey.fill(0);
      }
      setAddress(account.address);
      setStatus("ready");
      await refresh().catch(() => {});
    })();
    return () => {
      live = false;
    };
  }, [refresh]);

  const send = useCallback(
    async (
      label: string,
      req: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
      pointsAtRisk = 0,
    ) => {
      const s = sessionRef.current;
      if (!s) {
        if (addressRef.current) throw new SessionScopeError("expired", "Session expired — confirm with your passkey.");
        throw new Error("Sign in first");
      }
      const res = await s.write(req, pointsAtRisk);
      setLastTx({ label, hash: res.receipt.transactionHash, ms: res.ms, block: res.receipt.blockNumber });
      setSession(s.info());
      if (pointsAtRisk) void updateSessionSpent(s.address, s.spent);
      return res;
    },
    [],
  );

  /** Fund gas if needed, then grant starter points — all without extra prompts. */
  const onboard = useCallback(
    (s: ScopedSession) =>
      runOnboarding({
        requestDrip: async (): Promise<DripResult> => {
          try {
            const r = await fetch("/api/drip", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ address: s.address }),
            });
            // A crashed route (e.g. an empty sponsor wallet) answers with a non-JSON 500.
            const body = (await r.json().catch(() => ({ error: `HTTP ${r.status}` }))) as Omit<DripResult, "status">;
            return { status: r.status, ...body };
          } catch {
            return { status: 0, error: "network error" };
          }
        },
        getBalance: () => publicClient.getBalance({ address: s.address }),
        waitForDrip: (block) => waitBlocks(block, 3n),
        hasClaimedStarter: () =>
          publicClient.readContract({
            address: POINTS_ADDRESS,
            abi: pointsAbi,
            functionName: "claimedStarter",
            args: [s.address],
          }),
        claimStarter: async () => {
          await send("Claimed 1,000 starter points", {
            address: POINTS_ADDRESS,
            abi: pointsAbi,
            functionName: "claimStarter",
            args: [],
          });
        },
      }),
    [send],
  );

  const start = useCallback(
    async (
      open: () => Promise<{ session: import("@category-labs/mera").Secp256k1SigningSession; walletKey?: Uint8Array }>,
    ) => {
      setError(undefined);
      setSetupError(undefined);
      setStatus("connecting");
      try {
        const { session: mera, walletKey } = await open();
        const s = new ScopedSession(mera);
        adopt(s, walletKey);
        notifyLocal();
        setStatus("funding");
        // The account exists from here on: a setup failure leaves the player signed in, with a visible
        // reason and a retry, instead of silently showing zero points.
        await onboard(s).catch((e) => setSetupError(setupMessage(e)));
        await refresh();
        setStatus("ready");
      } catch (e) {
        setError(isMeraError(e) ? describeMeraError(e) : describeTxError(e));
        setStatus(sessionRef.current ? "ready" : "signed-out");
      }
    },
    [onboard, refresh, adopt],
  );

  const create = useCallback(
    async (h: string) => {
      setHandle(h);
      await start(() => createAccount(h || "caller"));
    },
    [setHandle, start],
  );

  const signIn = useCallback(async () => {
    personaRef.current = "";
    setPersona("");
    await start(() => meraSignIn());
  }, [start]);

  const switchPersona = useCallback(
    async (name: string) => {
      const clean = name.replace(/[^\w.-]/g, "").slice(0, 20);
      personaRef.current = clean;
      setPersona(clean);
      if (clean && !personas.includes(clean)) {
        try {
          localStorage.setItem(PERSONAS_KEY, JSON.stringify([...personas, clean].slice(-12)));
        } catch {}
        notifyLocal();
      }
      await start(() => meraSignIn(clean || undefined));
    },
    [personas, start],
  );

  const finishSetup = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || setupRunning.current) return; // one run at a time; a double tap can't double-send
    setupRunning.current = true;
    setSettingUp(true);
    setSetupError(undefined);
    let failure: string | undefined;
    try {
      if (!s.active) throw new SessionScopeError("expired", "session expired");
      await onboard(s);
    } catch (e) {
      failure = setupMessage(e);
    } finally {
      setupRunning.current = false;
      setSettingUp(false);
    }
    // Ignore the outcome if the player signed out or switched persona meanwhile.
    if (sessionRef.current !== s) return;
    setSetupError(failure);
    await refresh().catch(() => {});
  }, [onboard, refresh]);

  const signOut = useCallback(() => {
    sessionRef.current?.end();
    lockSealedKey();
    sessionRef.current = null;
    addressRef.current = undefined;
    void clearSession();
    forgetAccount();
    setAddress(undefined);
    setSession(undefined);
    setPoints(0n);
    setSetupError(undefined);
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
        // Out of scope or expired: one more passkey prompt opens a fresh, bounded session, then retry once.
        const { session: mera, walletKey } = await meraSignIn(personaRef.current || undefined);
        const s = new ScopedSession(mera);
        // A different passkey than before means a different account; don't spend from it unasked.
        const switched = !!addressRef.current && addressRef.current.toLowerCase() !== s.address.toLowerCase();
        adopt(s, walletKey);
        if (switched) {
          await refresh();
          throw new Error("That passkey opened a different account. Check the account, then try again.");
        }
        const res = await send(label, req, pointsAtRisk);
        refresh();
        return res;
      }
    },
    [send, refresh, adopt],
  );

  const signLinkMessage = useCallback(
    async (message: string) => {
      let s = sessionRef.current;
      if (!s?.active) {
        if (!addressRef.current) throw new Error("Sign in first");
        // The signing session expired (or ended with a reload): one passkey prompt reopens it.
        const { session: mera, walletKey } = await meraSignIn(personaRef.current || undefined);
        s = new ScopedSession(mera);
        if (s.address.toLowerCase() !== addressRef.current.toLowerCase()) {
          adopt(s, walletKey);
          await refresh();
          throw new Error("That passkey opened a different account. Check the account, then try again.");
        }
        adopt(s, walletKey);
      }
      return s.signLinkMessage(message);
    },
    [adopt, refresh],
  );

  const prefetch = useCallback<WalletCtx["prefetch"]>((req) => sessionRef.current?.prefetch(req), []);

  return (
    <Ctx.Provider
      value={{
        status,
        address,
        // In a persona, only the persona name is ever shown or shared, never the main handle.
        handle: persona || handle,
        setHandle,
        persona,
        personas,
        switchPersona,
        hasPasskey,
        points,
        session,
        lastTx,
        error,
        clearError: () => setError(undefined),
        setupError,
        settingUp,
        finishSetup,
        create,
        signIn,
        signOut,
        write,
        refresh,
        prefetch,
        signLinkMessage,
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
  notifyLocal();
}
