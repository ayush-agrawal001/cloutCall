"use client";

/* eslint-disable @next/next/no-img-element -- static pixel art; next/image would smooth it */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AI_ENABLED, AI_NAME } from "@/lib/aiConfig";
import { explorerAddress, explorerTx, NETWORK_LABEL } from "@/lib/chain";
import { safeNext, STARTER_POINTS } from "@/lib/intro";
import { formatPoints, shortAddress } from "@/lib/markets";
import { PhoneHandoff, usePlatformAuthenticator, useUnlockName } from "../PhoneHandoff";
import { PixelAvatar, PixelIcon, type PixelIconName } from "../Pixel";
import { SetupNotice } from "../WalletButton";
import { useWallet } from "../WalletProvider";
import {
  DemoMarket,
  FactList,
  monadFacts,
  NETWORK_NOTE,
  PayoutExample,
  PlayMoneyNote,
  REWARDS,
  STEPS,
} from "./Explain";

const INTRO = [
  { kicker: "WHAT IS CLOUTCALL", short: "What it is" },
  { kicker: "WHAT YOU WIN", short: "What you win" },
  { kicker: "WHY MONAD", short: "Why Monad" },
  { kicker: "CREATE YOUR ACCOUNT", short: "Your account" },
] as const;
const LAST = INTRO.length - 1;

type Mode = "intro" | "returning";

/**
 * /signin. First-time players get a short intro (what the game is, what they can win, how Monad is used) that
 * ends in account creation; players with a passkey on this device go straight to "sign in". Never touches the
 * wallet beyond `create` / `signIn`, so every sign-in path keeps the provider's setup and retry behaviour.
 */
export function SignInFlow() {
  const w = useWallet();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [modeChoice, setModeChoice] = useState<Mode | null>(params.get("new") === "1" ? "intro" : null);
  const mode: Mode = modeChoice ?? (w.hasPasskey ? "returning" : "intro");
  const [step, setStep] = useState(0);
  /** Set once this page created the account, so the player sees their starter points before moving on. */
  const [created, setCreated] = useState(false);

  const ready = w.status === "ready" && !!w.address;

  // Returning players (or anyone already signed in) go straight on to where they were heading.
  useEffect(() => {
    if (ready && !created) router.replace(next);
  }, [ready, created, next, router]);

  // Move focus to the new step's heading so keyboard and screen-reader users land on it.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.closest("main")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [step, mode]);
  const go = (to: number) => {
    moved.current = true;
    setStep(Math.max(0, Math.min(LAST, to)));
  };
  const switchMode = (m: Mode) => {
    moved.current = true;
    setModeChoice(m);
    setStep(0);
    setCreated(false);
    w.clearError();
  };

  if (ready && created) return <Welcome next={next} />;
  if (ready)
    return (
      <Shell aside={null}>
        <p className="p-8 text-muted">Signed in. Taking you back…</p>
      </Shell>
    );

  if (mode === "returning") {
    return (
      <Shell aside={<ReturningAside />}>
        <Returning headingRef={headingRef} onNew={() => switchMode("intro")} />
      </Shell>
    );
  }

  return (
    <Shell aside={<IntroAside step={step} go={go} onReturning={() => switchMode("returning")} />}>
      <div className="flex min-h-full flex-col">
        <MobileProgress step={step} />
        <div className="flex-1 px-4 py-7 sm:px-8 sm:py-9">
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted">
            <span className="text-text">{String(step + 1).padStart(2, "0")}</span> /{" "}
            {String(INTRO.length).padStart(2, "0")} · {INTRO[step].kicker}
          </p>
          {step === 0 && <WhatStep headingRef={headingRef} />}
          {step === 1 && <WinStep headingRef={headingRef} />}
          {step === 2 && <MonadStep headingRef={headingRef} />}
          {step === 3 && <CreateStep headingRef={headingRef} onCreate={() => setCreated(true)} />}
        </div>
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-line bg-[var(--bg)] px-4 py-3.5 sm:px-8">
          <button
            type="button"
            className="btn btn-ghost px-4 py-2.5 text-sm"
            disabled={step === 0}
            onClick={() => go(step - 1)}
          >
            <PixelIcon name="arrow" size={12} className="rotate-180" /> Back
          </button>
          {step < LAST && (
            <button type="button" className="btn btn-accent px-4 py-2.5 text-sm" onClick={() => go(step + 1)}>
              Next: {INTRO[step + 1].short} <PixelIcon name="arrow" size={12} />
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            className="font-mono text-[11px] tracking-[0.12em] text-muted underline lg:hidden"
            onClick={() => switchMode("returning")}
          >
            I HAVE AN ACCOUNT
          </button>
          {step < LAST && (
            <button
              type="button"
              className="font-mono text-[11px] tracking-[0.12em] text-muted underline"
              onClick={() => go(LAST)}
            >
              SKIP INTRO
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ aside, children }: { aside: React.ReactNode; children: React.ReactNode }) {
  return (
    <main
      className={`y2k-panel grid flex-1 ${aside ? "lg:grid-cols-[300px_minmax(0,1fr)]" : ""}`}
      aria-label="Sign in to CloutCall"
    >
      {aside && <aside className="hidden border-r border-line bg-surface-2 lg:flex lg:flex-col">{aside}</aside>}
      <div className="min-w-0">{children}</div>
    </main>
  );
}

type HeadingRef = React.RefObject<HTMLHeadingElement | null>;

function StepTitle({ headingRef, children }: { headingRef: HeadingRef; children: React.ReactNode }) {
  return (
    <h1
      ref={headingRef}
      tabIndex={-1}
      className="mt-3 max-w-[20ch] text-[clamp(32px,4.4vw,54px)] font-bold uppercase leading-[0.92] tracking-[-0.055em] outline-none"
    >
      {children}
    </h1>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed">{children}</p>;
}

function IntroAside({ step, go, onReturning }: { step: number; go: (i: number) => void; onReturning: () => void }) {
  return (
    <>
      <div className="glitch h-[150px] border-b border-line bg-black">
        <img src="/y2k/news-orb.webp" alt="" className="block h-full w-full object-cover" />
        <span className="absolute left-2 top-2 bg-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] text-[#f5f5f5]">
          NEW PLAYER · ~1 MIN
        </span>
      </div>
      <nav aria-label="Intro steps" className="p-4">
        <ol className="space-y-1.5">
          {INTRO.map((s, i) => {
            const state = i < step ? "done" : i === step ? "now" : "todo";
            return (
              <li key={s.kicker}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={state === "now" ? "step" : undefined}
                  className={`y2k-nav flex min-h-[46px] w-full items-center gap-3 border px-2.5 text-left text-[15px] ${
                    state === "now" ? "border-ink bg-lime font-semibold text-ink hover:bg-lime" : "border-transparent"
                  }`}
                >
                  <span
                    className={`grid h-[26px] w-[26px] flex-none place-items-center border font-mono text-[11px] ${
                      state === "now"
                        ? "border-ink bg-ink text-lime"
                        : state === "done"
                          ? "border-ink bg-lime text-ink"
                          : "border-line text-muted"
                    }`}
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  {s.short}
                  {state === "done" && <span className="sr-only"> (seen)</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="flex-1" />
      <div className="space-y-2 border-t border-line p-4 text-sm">
        <p className="text-muted">Already played on this or another device?</p>
        <button type="button" className="btn btn-ghost w-full py-2.5 text-sm" onClick={onReturning}>
          Sign in with your passkey
        </button>
      </div>
    </>
  );
}

function MobileProgress({ step }: { step: number }) {
  return (
    <ol aria-hidden className="flex gap-1.5 border-b border-line px-4 py-3 lg:hidden">
      {INTRO.map((s, i) => (
        <li key={s.kicker} className={`h-1.5 flex-1 border border-ink ${i <= step ? "bg-lime" : "bg-surface-2"}`} />
      ))}
    </ol>
  );
}

function WhatStep({ headingRef }: { headingRef: HeadingRef }) {
  return (
    <>
      <StepTitle headingRef={headingRef}>Call the hype before it happens</StepTitle>
      <Lead>
        CloutCall is a free prediction game about YouTube. Each market takes a real video and asks one question:{" "}
        <b>will it reach its view target before the deadline?</b> You call YES or NO, and the real view count decides.
      </Lead>
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:items-start">
        <div className="mx-auto w-full max-w-[340px]">
          <DemoMarket />
        </div>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid h-9 w-9 flex-none place-items-center border border-ink bg-lime font-pixel text-sm text-ink">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-bold tracking-[-0.015em]">{s.title}</span>
                <span className="mt-0.5 block text-sm leading-snug text-muted">{s.body}</span>
              </span>
            </li>
          ))}
          {AI_ENABLED && (
            <li className="flex gap-3 border border-ink bg-magenta/10 p-3">
              <span className="grid h-9 w-9 flex-none place-items-center border border-ink bg-magenta text-ink">
                <PixelIcon name="bot" size={14} />
              </span>
              <span className="min-w-0">
                <span className="block font-bold tracking-[-0.015em]">Humans vs AI</span>
                <span className="mt-0.5 block text-sm leading-snug text-muted">
                  {AI_NAME}, an AI player, makes its own call on markets and locks it on Monad before calls close. Back
                  it, or take the other side and try to beat it.
                </span>
              </span>
            </li>
          )}
          <li className="border-t border-line pt-3 font-mono text-[11px] leading-relaxed text-muted">
            CloutCall only reads public view counts. It isn&apos;t affiliated with YouTube or any creator, and nobody
            owns a piece of a creator here.
          </li>
        </ol>
      </div>
    </>
  );
}

function WinStep({ headingRef }: { headingRef: HeadingRef }) {
  return (
    <>
      <StepTitle headingRef={headingRef}>Win points, climb the board</StepTitle>
      <Lead>
        You start with <b>{STARTER_POINTS.toLocaleString("en")} free points</b>. Stake some on each call. When a market
        settles, the people who called it right split the points of the people who called it wrong.
      </Lead>
      <PlayMoneyNote className="mt-5 max-w-[70ch]" />
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <FactList facts={REWARDS} />
        <PayoutExample />
      </div>
    </>
  );
}

function MonadStep({ headingRef }: { headingRef: HeadingRef }) {
  const flow = [
    ["TAP YES OR NO", "your passkey approves it"],
    ["SENT TO MONAD", "a real transaction"],
    ["CONFIRMED", "in about a second"],
    ["ON THE EXPLORER", "anyone can check it"],
  ];
  return (
    <>
      <StepTitle headingRef={headingRef}>Every call is on Monad</StepTitle>
      <Lead>
        Monad is a fast blockchain that works like Ethereum. CloutCall runs the whole game on it — calls, points,
        payouts and results — so it feels as quick as an app but plays by rules anyone can check.
      </Lead>
      <ol className="mt-6 grid gap-2 sm:grid-cols-4" aria-label="What happens when you make a call">
        {flow.map(([t, d], i) => (
          <li key={t} className="relative border border-ink bg-surface p-3 font-mono text-[11px]">
            <span className="text-muted">{String(i + 1).padStart(2, "0")}</span>
            <p className="mt-1 font-semibold tracking-[0.06em]">{t}</p>
            <p className="text-muted">{d}</p>
          </li>
        ))}
      </ol>
      <div className="mt-5">
        <FactList facts={monadFacts()} />
      </div>
      {NETWORK_NOTE && <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted">{NETWORK_NOTE}</p>}
    </>
  );
}

function CreateStep({ headingRef, onCreate }: { headingRef: HeadingRef; onCreate: () => void }) {
  const w = useWallet();
  const [handle, setHandle] = useState(w.handle);
  const hasBiometrics = usePlatformAuthenticator();
  const unlock = useUnlockName();
  const busy = w.status === "connecting" || w.status === "funding";

  const progress = [
    {
      label: "Make your passkey",
      detail: "Your device asks for your fingerprint, face or screen lock — whichever it supports.",
      state: w.status === "connecting" ? "now" : w.status === "funding" ? "done" : "todo",
    },
    {
      label: "Open your Monad account",
      detail: "Your account key is worked out from the passkey each time. It's never stored anywhere.",
      state: w.status === "funding" ? "done" : "todo",
    },
    {
      label: `Get gas + ${STARTER_POINTS.toLocaleString("en")} points`,
      detail: "We send a little gas, then your starter points land on-chain. Takes a few seconds.",
      state: w.status === "funding" ? "now" : "todo",
    },
  ] as const;

  return (
    <>
      <StepTitle headingRef={headingRef}>Log in like you unlock your phone</StepTitle>
      <Lead>
        No wallet app, no seed phrase, nothing to buy. CloutCall uses a <b>passkey</b> — the same fingerprint, face
        unlock or screen lock that unlocks your phone — and that passkey is your account.
      </Lead>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <form
          className="card space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!handle || busy) return;
            onCreate();
            void w.create(handle);
          }}
        >
          <div>
            <label htmlFor="handle" className="block font-bold">
              Pick a handle
            </label>
            <p id="handle-hint" className="text-sm text-muted">
              Shown on the leaderboard. Letters, numbers, dots, dashes and underscores; up to 20.
            </p>
            <input
              id="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value.replace(/[^\w.-]/g, "").slice(0, 20))}
              placeholder="e.g. viewcounter"
              autoComplete="nickname"
              aria-describedby="handle-hint"
              disabled={busy}
              className="mt-2 h-[50px] w-full border border-line bg-transparent px-3.5 outline-none focus:border-lime focus:shadow-[0_0_0_1px_#39ff14]"
            />
          </div>
          <button type="submit" className="btn btn-accent w-full py-3.5" disabled={busy || !handle}>
            {w.status === "connecting"
              ? "Waiting for your passkey…"
              : w.status === "funding"
                ? "Setting up your account…"
                : hasBiometrics && unlock
                  ? `Create account with ${unlock}`
                  : "Create account with a passkey"}
          </button>
          {w.status === "connecting" && (
            <p className="text-xs text-muted">
              Some devices ask twice — once to create the passkey and once to unlock it.
            </p>
          )}
          {w.error && (
            <p role="alert" className="border border-no bg-no/10 p-3 text-sm text-no">
              {w.error}
            </p>
          )}
          {(hasBiometrics === false || w.error) && <PhoneHandoff reason={w.error ? "failed" : "no-biometrics"} />}
        </form>

        <div className="space-y-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.16em] text-muted">WHAT HAPPENS WHEN YOU TAP</p>
            <ol className="mt-2 space-y-2" aria-live="polite">
              {progress.map((p, i) => (
                <li
                  key={p.label}
                  className={`flex gap-3 border p-3 ${p.state === "now" ? "border-ink bg-lime/15" : "border-line"}`}
                >
                  <span
                    className={`grid h-7 w-7 flex-none place-items-center border font-mono text-[11px] ${
                      p.state === "done"
                        ? "border-ink bg-lime text-ink"
                        : p.state === "now"
                          ? "border-ink bg-ink text-lime"
                          : "border-line text-muted"
                    }`}
                  >
                    {p.state === "done" ? "✓" : p.state === "now" ? <span className="blink">■</span> : i + 1}
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-bold">
                      {p.label}
                      {p.state === "now" && <span className="sr-only"> (in progress)</span>}
                      {p.state === "done" && <span className="sr-only"> (done)</span>}
                    </span>
                    <span className="block leading-snug text-muted">{p.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <p className="border-l-4 border-warn bg-warn/10 px-3.5 py-2.5 text-sm leading-relaxed">
            <b>Keep your passkey synced.</b> Save it in iCloud Keychain, Google Password Manager or another password
            manager. If every copy is lost, the account can&apos;t be recovered.
          </p>
        </div>
      </div>
    </>
  );
}

function Returning({ headingRef, onNew }: { headingRef: HeadingRef; onNew: () => void }) {
  const w = useWallet();
  const hasBiometrics = usePlatformAuthenticator();
  const busy = w.status === "connecting" || w.status === "funding";
  return (
    <div className="max-w-[560px] px-4 py-9 sm:px-8 sm:py-12">
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted">SIGN IN · {NETWORK_LABEL.toUpperCase()}</p>
      <StepTitle headingRef={headingRef}>Welcome back{w.handle ? `, ${w.handle}` : ""}</StepTitle>
      <Lead>Use the passkey you made for CloutCall. Your points and calls are waiting on-chain.</Lead>
      <div className="card mt-7 space-y-4 p-5">
        <button type="button" className="btn btn-accent w-full py-3.5" disabled={busy} onClick={() => w.signIn()}>
          {w.status === "connecting"
            ? "Waiting for your passkey…"
            : w.status === "funding"
              ? "Checking your account…"
              : "Sign in with passkey"}
        </button>
        {w.error && (
          <p role="alert" className="border border-no bg-no/10 p-3 text-sm text-no">
            {w.error}
          </p>
        )}
        {(hasBiometrics === false || w.error) && <PhoneHandoff reason={w.error ? "failed" : "no-biometrics"} />}
        <p className="text-sm text-muted">
          Passkey saved on your phone? Choose &ldquo;use a phone or tablet&rdquo; when your browser asks.
        </p>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <p className="text-sm">New to CloutCall?</p>
        <button type="button" className="btn btn-ghost px-4 py-2.5 text-sm" onClick={onNew}>
          Take the 1-minute intro <PixelIcon name="arrow" size={12} />
        </button>
      </div>
    </div>
  );
}

const RETURNING_NOTES: [PixelIconName, string][] = [
  ["podium", "Winnings from settled markets wait for you to collect them."],
  ["lock", "Reveal your sealed calls once calls close, or the stake is forfeited."],
  ["eye", "Personas from the same passkey stay separate accounts."],
];

function ReturningAside() {
  return (
    <>
      <div className="glitch h-[220px] border-b border-line bg-black">
        <img src="/y2k/art-target.png" alt="" className="pixelated block h-full w-full object-cover" />
      </div>
      <ul className="space-y-3 p-4 text-sm">
        {RETURNING_NOTES.map(([icon, t]) => (
          <li key={t} className="flex gap-2.5">
            <PixelIcon name={icon} size={14} className="mt-0.5 flex-none" />
            <span className="text-muted">{t}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Shown once, right after this page created the account: the points arrived, and here's the proof on Monad. */
function Welcome({ next }: { next: string }) {
  const w = useWallet();
  const router = useRouter();
  const tx = w.lastTx;
  const txUrl = tx && explorerTx(tx.hash);
  const addrUrl = w.address && explorerAddress(w.address);
  return (
    <main className="y2k-panel flex-1 px-4 py-9 sm:px-8 sm:py-12" aria-labelledby="welcome-h">
      <div className="mx-auto max-w-[640px]">
        <div className="flex items-center gap-4">
          {w.address && <PixelAvatar seed={w.address} size={64} />}
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-[0.2em] text-muted">ACCOUNT CREATED</p>
            <h1
              id="welcome-h"
              className="text-[clamp(30px,5vw,52px)] font-bold uppercase leading-[0.92] tracking-[-0.055em]"
            >
              You&apos;re in{w.handle ? `, ${w.handle}` : ""}
            </h1>
          </div>
        </div>

        <div className="card mt-7 grid sm:grid-cols-2">
          <div className="border-b border-line p-5 sm:border-b-0 sm:border-r">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted">YOUR POINTS</p>
            <p className="mt-1 text-5xl font-bold tracking-[-0.05em]">{formatPoints(w.points)}</p>
            <p className="mt-1 text-sm text-muted">Play money — stake them on your first call.</p>
          </div>
          <div className="space-y-2 p-5 text-sm">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted">ON MONAD</p>
            {tx ? (
              <p>
                {tx.label}: confirmed in <b>{tx.ms.toLocaleString("en")} ms</b>, block {tx.block.toString()}.{" "}
                {txUrl && (
                  <a href={txUrl} target="_blank" rel="noreferrer" className="underline">
                    View transaction
                  </a>
                )}
              </p>
            ) : (
              <p className="text-muted">Your account is live on {NETWORK_LABEL}.</p>
            )}
            {w.address && (
              <p className="font-mono text-xs text-muted">
                Account {shortAddress(w.address)}
                {addrUrl && (
                  <>
                    {" · "}
                    <a href={addrUrl} target="_blank" rel="noreferrer" className="underline">
                      explorer
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <SetupNotice />
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-accent h-13 justify-between gap-4 py-0 pl-5 pr-2 text-sm uppercase"
            onClick={() => router.push(next)}
          >
            Make your first call
            <span className="grid h-9 w-9 place-items-center bg-ink text-lime">
              <PixelIcon name="arrow" size={14} />
            </span>
          </button>
          <p className="text-sm text-muted">
            A quick how-to-play tour opens next. Replay it any time from the <b>?</b> button.
          </p>
        </div>
        <p className="mt-6 font-mono text-[11px] text-muted">
          Want to look around first? <Link href="/leaderboard">See the leaderboard</Link>.
        </p>
      </div>
    </main>
  );
}
