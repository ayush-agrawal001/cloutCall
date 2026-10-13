"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { formatPoints, shortAddress } from "@/lib/markets";
import { PhoneHandoff, usePlatformAuthenticator, useUnlockName } from "./PhoneHandoff";
import { PixelAvatar, PixelIcon } from "./Pixel";
import { useWallet } from "./WalletProvider";

export function SignInPanel({ compact = false }: { compact?: boolean }) {
  const w = useWallet();
  const [handle, setHandle] = useState(w.handle);
  const busy = w.status === "connecting" || w.status === "funding";
  const hasBiometrics = usePlatformAuthenticator();
  const unlock = useUnlockName();

  return (
    <div className={compact ? "space-y-3" : "card space-y-4 p-5"}>
      {!compact && (
        <div>
          <p className="text-lg font-bold">Play with a passkey</p>
          <p className="text-sm text-muted">No wallet, no seed phrase, no gas. Your passkey is your account.</p>
        </div>
      )}
      {!w.hasPasskey && (
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value.replace(/[^\w.-]/g, "").slice(0, 20))}
          placeholder="Pick a handle (e.g. viewcounter)"
          className="h-[50px] w-full border border-line bg-transparent px-3.5 outline-none focus:border-lime focus:shadow-[0_0_0_1px_#39ff14]"
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
              : hasBiometrics && unlock
                ? `Create account with ${unlock}`
                : "Create account with passkey"}
          </button>
        )}
        <button className="btn btn-ghost" disabled={busy} onClick={() => w.signIn()}>
          {w.hasPasskey ? "Other passkey" : "I have a passkey"}
        </button>
      </div>
      {w.status === "connecting" && (
        <p className="text-xs text-muted">
          Some devices ask twice — once to create your passkey and once to unlock it.
        </p>
      )}
      {w.error && (
        <p className="border border-no bg-no/10 p-3 text-sm text-no" onClick={w.clearError}>
          {w.error}
        </p>
      )}
      {(hasBiometrics === false || w.error) && w.status !== "ready" && (
        <PhoneHandoff reason={w.error ? "failed" : "no-biometrics"} />
      )}
      {!w.hasPasskey && !busy && (
        <p className="text-sm text-muted">
          New here?{" "}
          <SignInLink intro className="font-semibold text-text underline">
            Take the 1-minute intro
          </SignInLink>{" "}
          — what CloutCall is, what you can win and how Monad fits in.
        </p>
      )}
    </div>
  );
}

/** The full sign-in page, returning to `path` afterwards. */
function signInHref(path: string | null, intro = false) {
  const q = new URLSearchParams();
  if (intro) q.set("new", "1");
  if (path && path !== "/") q.set("next", path);
  const s = q.toString();
  return s ? `/signin?${s}` : "/signin";
}

type SignInLinkProps = { intro?: boolean; className?: string; children: ReactNode };

function HereSignInLink({ intro, className, children }: SignInLinkProps) {
  return (
    <Link href={signInHref(usePathname(), intro)} className={className}>
      {children}
    </Link>
  );
}

/** Link to /signin that comes back here afterwards. The route streams in so pages stay prerenderable. */
function SignInLink(props: SignInLinkProps) {
  return (
    <Suspense
      fallback={
        <Link href={signInHref(null, props.intro)} className={props.className}>
          {props.children}
        </Link>
      }
    >
      <HereSignInLink {...props} />
    </Suspense>
  );
}

/** Signed in, but sponsored gas or starter points didn't come through: say why and offer a retry. */
export function SetupNotice() {
  const w = useWallet();
  if (w.status !== "ready" || !w.setupError) return null;
  return (
    <div role="alert" className="rounded-xl border border-no/40 bg-no/10 p-3 text-sm">
      <p className="font-bold text-no">Account setup isn&apos;t finished</p>
      <p className="text-muted">{w.setupError}</p>
      <button className="btn btn-ghost mt-2 px-4 py-2 text-xs" disabled={w.settingUp} onClick={() => w.finishSetup()}>
        {w.settingUp ? "Retrying…" : "Retry setup"}
      </button>
    </div>
  );
}

export function WalletButton() {
  const w = useWallet();
  const [open, setOpen] = useState(false);

  if (w.status === "ready" && w.address) {
    return (
      <Link href="/me" className="flex items-center gap-3 text-text no-underline">
        <PixelAvatar seed={w.address} size={42} />
        <span className="flex flex-col gap-0.5 leading-tight">
          <span className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            {w.persona && <PixelIcon name="eye" size={12} label="Persona" />}
            {w.handle || shortAddress(w.address)}
          </span>
          <span className="font-mono text-[11px] text-muted">
            {formatPoints(w.points)} pts{w.setupError && <span className="text-no"> · setup incomplete</span>}
          </span>
        </span>
      </Link>
    );
  }
  // First visit on this device: the sign-in page walks new players through the game before the passkey prompt.
  if (!w.hasPasskey && w.status === "signed-out") {
    return <SignInLink className="btn btn-accent h-11 px-4 py-0 text-sm uppercase no-underline">Sign in</SignInLink>;
  }
  return (
    <div className="relative">
      <button className="btn btn-accent h-11 px-4 py-0 text-sm uppercase" onClick={() => setOpen((o) => !o)}>
        {w.status === "connecting" || w.status === "funding" ? "Connecting…" : "Sign in"}
      </button>
      {open && w.status !== "ready" && (
        <div className="card absolute right-0 top-14 z-30 w-80 p-4 shadow-[6px_6px_0_var(--lift)]">
          <SignInPanel compact />
        </div>
      )}
    </div>
  );
}
