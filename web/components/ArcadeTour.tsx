"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AI_ENABLED } from "@/lib/ai";
import { CHAIN_ID } from "@/lib/chain";
import { SESSION_BUDGET, SESSION_TTL_MS } from "@/lib/session";
import {
  hasSeenTour,
  rememberTour,
  setupComplete,
  SLIDE_MS,
  tick,
  tourSlides,
  type TourOutcome,
  type TourSlide,
} from "@/lib/tour";
import { PixelIcon, PixelMark } from "./Pixel";
import { useWallet } from "./WalletProvider";

type TourCtx = { openTour: () => void };
const Ctx = createContext<TourCtx | null>(null);

/**
 * Opens the "how to play" tour once per account and network, after sign-in and account setup have finished,
 * and lets the Help button replay it. Reads wallet state only; never writes to it.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  /** Accounts the tour already opened for in this page visit, in case storage can't remember it. */
  const shownFor = useRef(new Set<string>());
  const ready = setupComplete(w);
  const account = ready ? w.address : undefined;

  useEffect(() => {
    if (!account || shownFor.current.has(account) || hasSeenTour(CHAIN_ID, account)) return;
    shownFor.current.add(account);
    setOpen(true);
  }, [account]);

  const close = useCallback(
    (outcome: TourOutcome) => {
      setOpen(false);
      // Replays while signed out have no account to remember them for.
      if (account) rememberTour(CHAIN_ID, account, outcome);
    },
    [account],
  );

  const value = useMemo(() => ({ openTour: () => setOpen(true) }), []);
  return (
    <Ctx.Provider value={value}>
      {children}
      {open && <ArcadeTour onClose={close} />}
    </Ctx.Provider>
  );
}

/** Replays the tour; sits in the title bar. */
export function HowToPlayButton() {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={ctx.openTour}
      aria-label="How to play"
      aria-haspopup="dialog"
      className="btn btn-ghost h-11 px-3.5 py-0 font-mono text-[11px] tracking-[0.1em]"
    >
      <span aria-hidden className="font-pixel text-[13px] leading-none">
        ?
      </span>
      <span className="y2k-hide-m">HOW TO PLAY</span>
    </button>
  );
}

const reducedQuery = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(reducedQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

/** `n` keys each move so a quick double tap still replays the transition. */
type Nav = { index: number; dir: 0 | 1 | -1; n: number };

/** The progress fill reads the real timer, written straight to a CSS variable (no re-render per frame). */
function paintProgress(el: HTMLElement | null, ms: number) {
  el?.style.setProperty("--tour-p", String(Math.min(1, ms / SLIDE_MS)));
}

function ArcadeTour({ onClose }: { onClose: (outcome: TourOutcome) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const slides = useMemo(() => tourSlides({ aiEnabled: AI_ENABLED }), []);
  const last = slides.length - 1;
  const titleId = useId();
  const bodyId = useId();

  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );

  const [nav, setNav] = useState<Nav>({ index: 0, dir: 0, n: 0 });
  /** The slide animating out. Never set when motion is reduced. */
  const [out, setOut] = useState<Nav>();
  const index = nav.index;
  /** Reduced motion: no autoplay until the player asks for it. */
  const [userPaused, setUserPaused] = useState(reduced);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  /** The final slide's timer ran out; it stays put so the CTA can still be read and pressed. */
  const [ended, setEnded] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLOListElement>(null);
  const elapsed = useRef(0);

  const running = !userPaused && !hovered && !keyboardFocus && !hidden && !ended;
  const pauseReason = userPaused
    ? "PAUSED"
    : hidden
      ? "PAUSED · TAB HIDDEN"
      : hovered
        ? "HOLD · POINTER"
        : keyboardFocus
          ? "HOLD · FOCUS"
          : ended
            ? "DONE"
            : "AUTO";

  /** Mirrors `nav` synchronously, so two presses before a re-render still move two steps. */
  const navRef = useRef(nav);
  const step = useCallback(
    (delta: 1 | -1) => {
      const cur = navRef.current;
      const to = cur.index + delta;
      if (to < 0 || to > last) return;
      const next: Nav = { index: to, dir: delta, n: cur.n + 1 };
      navRef.current = next;
      elapsed.current = 0;
      paintProgress(progressRef.current, 0);
      setEnded(false);
      setOut(reduced ? undefined : { index: cur.index, dir: delta, n: next.n });
      setNav(next);
    },
    [last, reduced],
  );

  // Drop the outgoing slide once its exit has played (a timer, so it also clears if animations never run).
  useEffect(() => {
    if (!out) return;
    const t = setTimeout(() => setOut((o) => (o === out ? undefined : o)), 420);
    return () => clearTimeout(t);
  }, [out]);

  const onTimerDone = useEffectEvent(() => {
    if (index < last) step(1);
    else setEnded(true);
  });

  // One clock drives both the fill and the advance. It only runs while nothing holds it, resumes from the
  // time left, and clamps each frame so returning to a backgrounded tab never races through slides.
  useEffect(() => {
    const el = progressRef.current;
    paintProgress(el, elapsed.current);
    if (!running) return;
    let raf = 0;
    let prev = performance.now();
    const frame = (now: number) => {
      const t = tick(elapsed.current, now - prev);
      prev = now;
      elapsed.current = t.elapsed;
      paintProgress(el, t.elapsed);
      if (t.done) return onTimerDone();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, index]);

  // Native modal dialog: the page behind is inert, the backdrop doesn't close it, and focus returns on close.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    // Focus the card itself rather than a control, so autoplay isn't held by focus from the start.
    cardRef.current?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = overflow;
      if (dialog.open) dialog.close();
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  function finish(outcome: TourOutcome) {
    onClose(outcome);
    if (outcome !== "completed") return;
    if (pathname !== "/") return router.push("/#markets");
    // After the dialog has closed and the page can scroll again.
    requestAnimationFrame(() =>
      document.getElementById("markets")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" }),
    );
  }

  const slide = slides[index];
  const isLast = index === last;

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="tour-dialog"
      onCancel={(e) => {
        // Escape dismisses for good, the same as "Skip tour".
        e.preventDefault();
        onClose("skipped");
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") step(1);
        else if (e.key === "ArrowLeft") step(-1);
      }}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="tour-card"
        onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
        onFocus={(e) => setKeyboardFocus(e.target !== cardRef.current && e.target.matches(":focus-visible"))}
        onBlur={(e) => {
          if (!cardRef.current?.contains(e.relatedTarget as Node | null)) setKeyboardFocus(false);
        }}
      >
        <div className="flex items-center gap-3 border-b border-[var(--t-line)] px-4 pb-3 pt-4 sm:px-6">
          <ol ref={progressRef} aria-label="Tour progress" className="flex flex-1 gap-1.5">
            {slides.map((s, i) => (
              <li
                key={s.id}
                className="tour-seg"
                data-state={i < index ? "done" : i === index ? "now" : "todo"}
                aria-current={i === index ? "step" : undefined}
              >
                <span className="sr-only">
                  Step {i + 1}: {s.kicker.toLowerCase()}
                  {i < index ? " (seen)" : ""}
                </span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => setUserPaused((p) => !p)}
            aria-pressed={userPaused}
            aria-label={userPaused ? "Resume autoplay" : "Pause autoplay"}
            className="tour-icon-btn"
          >
            {userPaused ? <PlayGlyph /> : <PauseGlyph />}
          </button>
        </div>

        <div className="flex items-center justify-between px-4 pt-3 font-mono text-[10px] tracking-[0.18em] text-[var(--t-muted)] sm:px-6">
          <span>
            <span className="text-[var(--t-accent)]">{String(index + 1).padStart(2, "0")}</span> /{" "}
            {String(slides.length).padStart(2, "0")} · HOW TO PLAY
          </span>
          <span aria-hidden className="flex items-center gap-1.5">
            <span className={`block h-1.5 w-1.5 ${running ? "bg-[var(--t-accent)]" : "bg-[var(--t-dim)]"}`} />
            {pauseReason}
          </span>
        </div>

        <div className="tour-stage" aria-live={running ? "off" : "polite"}>
          <section
            key={nav.n}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
            className={`tour-slide ${reduced || !nav.dir ? "" : nav.dir === 1 ? "tour-in-next" : "tour-in-prev"}`}
          >
            <SlideBody slide={slide} titleId={titleId} bodyId={bodyId} />
          </section>
          {out && (
            <section
              key={`out-${out.n}`}
              aria-hidden
              inert
              className={`tour-slide tour-leaving ${out.dir === 1 ? "tour-out-next" : "tour-out-prev"}`}
            >
              <SlideBody slide={slides[out.index]} />
            </section>
          )}
        </div>

        <div className="tour-footer">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-disabled={index === 0}
              aria-label="Previous step"
              className="tour-btn tour-btn-ghost"
            >
              <PixelIcon name="arrow" size={12} className="rotate-180" />
              <span className="tour-hide-xs">Back</span>
            </button>
            <button
              type="button"
              onClick={() => (isLast ? finish("completed") : step(1))}
              className={`tour-btn ${isLast ? "tour-btn-cta" : "tour-btn-primary"}`}
            >
              {isLast ? "Start Calling" : "Next"}
              <PixelIcon name="arrow" size={12} />
            </button>
          </div>
          <button type="button" onClick={() => finish("skipped")} className="tour-skip">
            Skip tour
          </button>
        </div>
      </div>
    </dialog>
  );
}

function SlideBody({ slide, titleId, bodyId }: { slide: TourSlide; titleId?: string; bodyId?: string }) {
  let i = 0;
  const stagger = () => ({ "--i": i++ }) as React.CSSProperties;
  return (
    <div className="tour-stagger">
      <p style={stagger()} className="font-mono text-[11px] tracking-[0.2em] text-[var(--t-accent)]">
        ■ {slide.kicker}
      </p>
      <h2
        id={titleId}
        style={stagger()}
        className="mt-2 text-[clamp(24px,5.4vw,32px)] font-bold leading-[1.02] tracking-[-0.035em] text-[var(--t-text)]"
      >
        {slide.title}
      </h2>
      <p id={bodyId} style={stagger()} className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-[var(--t-body)]">
        {slide.body}
      </p>
      <div style={stagger()} className="mt-4">
        <Visual id={slide.id} />
      </div>
      {slide.items && (
        <ul className="mt-1 grid gap-2">
          {slide.items.map((it) => (
            <li
              key={it.label}
              style={stagger()}
              className="flex gap-3 border border-[var(--t-line)] bg-[var(--t-panel)] p-2.5"
            >
              <span className="grid h-8 w-8 flex-none place-items-center border border-[var(--t-accent)] text-[var(--t-accent)]">
                <PixelIcon name={it.icon} size={14} />
              </span>
              <span className="min-w-0 text-[13px] leading-snug text-[var(--t-body)]">
                <b className="font-semibold text-[var(--t-text)]">{it.label}</b> — {it.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      {slide.note && (
        <p
          style={stagger()}
          className="mt-4 border-l-2 border-[var(--t-mag-line)] bg-[var(--t-note-bg)] px-3 py-2 font-mono text-[11.5px] leading-relaxed text-[var(--t-note)]"
        >
          {slide.note}
        </p>
      )}
    </div>
  );
}

/** Tiny illustrative diagrams. All figures are demo values, never live data. */
function Visual({ id }: { id: TourSlide["id"] }) {
  switch (id) {
    case "welcome":
      return (
        <div className="flex flex-wrap items-center gap-2" aria-hidden>
          <span className="grid h-10 w-10 place-items-center border border-[var(--t-line-2)] bg-[var(--t-chip)]">
            <PixelMark size={24} />
          </span>
          {["PREDICTION GAME", "PLAY MONEY", "NO OWNERSHIP"].map((t) => (
            <span key={t} className="tour-chip">
              {t}
            </span>
          ))}
        </div>
      );
    case "market":
      return (
        <figure className="tour-panel" aria-label="Example market with demo figures">
          <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-[var(--t-muted)]">
            <span>MARKET · EXAMPLE</span>
            <span className="border border-[var(--t-mag-line)] px-1.5 text-[var(--t-mag)]">DEMO DATA</span>
          </div>
          <div className="mt-2.5 grid grid-cols-[52px_minmax(0,1fr)] gap-3">
            <div aria-hidden className="tour-thumb" />
            <div className="min-w-0 font-mono text-[11px]">
              <div className="flex justify-between gap-2 text-[var(--t-body)]">
                <span>OPENED AT 120K</span>
                <span className="text-[var(--t-accent)]">TARGET 150K</span>
              </div>
              <div aria-hidden className="mt-1.5 h-2 border border-[var(--t-line-2)] bg-[var(--t-chip)]">
                <div className="h-full w-[62%] bg-[#00ffff]" />
              </div>
              <p className="mt-1.5 text-[var(--t-muted)]">
                CALLS CLOSE IN <span className="text-[var(--t-text)]">00:29:41</span>
              </p>
            </div>
          </div>
        </figure>
      );
    case "call":
      return (
        <div className="tour-panel" aria-hidden>
          <div className="grid grid-cols-2 gap-2">
            <span className="tour-pick border-[var(--t-fill-line)] bg-[#39ff14] text-[#121214]">YES, IT HITS</span>
            <span className="tour-pick border-[var(--t-line-2)] text-[var(--t-body)]">NO, IT FLOPS</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            {[25, 50, 100, 250].map((n) => (
              <span
                key={n}
                className={`border px-2 py-0.5 ${n === 100 ? "border-[var(--t-accent)] text-[var(--t-accent)]" : "border-[var(--t-line-2)] text-[var(--t-muted)]"}`}
              >
                {n}
              </span>
            ))}
            <span className="ml-auto text-[var(--t-muted)]">
              REVIEW: <span className="text-[var(--t-text)]">YES · 100 PTS</span>
            </span>
          </div>
        </div>
      );
    case "passkey":
      return (
        <div className="tour-panel" aria-hidden>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] tracking-[0.06em]">
            <span className="tour-chip">PASSKEY</span>
            <span className="text-[var(--t-dim)]">→</span>
            <span className="tour-chip">KEY DERIVED IN MEMORY</span>
            <span className="text-[var(--t-dim)]">→</span>
            <span className="tour-chip border-[var(--t-accent)] text-[var(--t-accent)]">STANDARD ACCOUNT</span>
          </div>
          <p className="mt-2.5 font-mono text-[11px] leading-relaxed text-[var(--t-body)]">
            ONE PROMPT = A SESSION: {Math.round(SESSION_TTL_MS / 60_000)} MIN · UP TO{" "}
            {SESSION_BUDGET.toLocaleString("en")} PTS AT RISK · CLOUTCALL CONTRACTS ONLY.{" "}
            <span className="text-[var(--t-muted)]">ANYTHING ELSE ASKS FOR YOUR PASSKEY AGAIN.</span>
          </p>
        </div>
      );
    case "states":
      return (
        <div className="tour-panel font-mono text-[11px]" aria-label="Transaction states">
          <ul className="grid gap-1.5">
            <li className="flex flex-wrap items-center gap-2">
              <span className="tour-state border-[var(--t-accent)] text-[var(--t-accent)]">CONFIRMED</span>
              <span className="text-[var(--t-body)]">on-chain, with a transaction link</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span className="tour-state border-[var(--t-warn)] text-[var(--t-warn)]">NOT CONFIRMED YET</span>
              <span className="text-[var(--t-body)]">may still land — check the link</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span className="tour-state border-[var(--t-mag-line)] text-[var(--t-mag)]">FAILED</span>
              <span className="text-[var(--t-body)]">the reason is shown</span>
            </li>
          </ul>
          <div
            aria-hidden
            className="mt-2.5 flex items-center gap-2 border-t border-[var(--t-line)] pt-2.5 text-[10px] tracking-[0.12em] text-[var(--t-muted)]"
          >
            <span>CALL CONFIRMED</span>
            <span className="h-px flex-1 bg-[var(--t-line-2)]" />
            <span>DEADLINE</span>
            <span className="h-px flex-1 bg-[var(--t-line-2)]" />
            <span className="text-[var(--t-cyan)]">MARKET RESOLVED</span>
          </div>
        </div>
      );
    case "modes":
      return null;
  }
}

function PauseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 6 6" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <path d="M1 0h1v6H1zM4 0h1v6H4z" />
    </svg>
  );
}
function PlayGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 6 6" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <path d="M1 0h1v6H1zM2 1h1v4H2zM3 2h1v2H3z" />
    </svg>
  );
}
