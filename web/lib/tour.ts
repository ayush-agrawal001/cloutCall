/**
 * First-login "how to play" tour: slide copy, when it opens on its own, and where finishing it is remembered.
 *
 * Kept free of React so the trigger and persistence rules can be tested. The tour is product education
 * only: opening, finishing or skipping it never touches the wallet, the session or the chain.
 */

/** Bump to show the tour again to everyone after a substantial rewrite. */
export const TOUR_VERSION = 1;
/** How long each slide plays before advancing on its own. */
export const SLIDE_MS = 7_000;

export type TourVisual = "welcome" | "market" | "call" | "passkey" | "states" | "modes";
export type TourIcon = "lock" | "duel" | "bot" | "podium";

export type TourSlide = {
  id: TourVisual;
  /** Monospaced micro-label above the heading. */
  kicker: string;
  title: string;
  body: string;
  /** Short labelled facts (the advanced-play slide). */
  items?: { icon: TourIcon; label: string; text: string }[];
  /** A highlighted caveat, e.g. "play money only". */
  note?: string;
};

export type TourFacts = {
  /** Whether the AI rival is configured on this deployment (`AI_ENABLED`); otherwise it isn't mentioned. */
  aiEnabled: boolean;
};

/**
 * Every claim here is backed by the current code: the passkey PRF derives a regular EOA key (lib/mera.ts),
 * the signing session is scoped (lib/session.ts), gas comes from a rate-limited top-up rather than a
 * paymaster (app/api/drip), and markets resolve through the resolver at or after `resolveTime`
 * (contracts/src/CloutMarket.sol). Keep each slide readable in about `SLIDE_MS`.
 */
export function tourSlides(f: TourFacts): TourSlide[] {
  return [
    {
      id: "welcome",
      kicker: "WELCOME",
      title: "Don't buy the creator. Call the creator.",
      body: "CloutCall is a prediction game: will a creator's video hit its view target in time?",
      note: "CLOUT points are play money. They have no cash value and never mean you own any part of a creator.",
    },
    {
      id: "market",
      kicker: "READ THE MARKET",
      title: "One video. One target. One clock.",
      body: "Each market shows the views a video had when the market opened, the target it has to reach, and a countdown until calls close.",
      note: "Figures in this guide are illustrative, not live stats.",
    },
    {
      id: "call",
      kicker: "MAKE YOUR CALL",
      title: "YES it hits, or NO it flops.",
      body: "Pick a side, choose how many points to stake, and check both before you confirm.",
      note: "Points are non-transferable game points, not money or shares. A call can lose; no reward is guaranteed.",
    },
    {
      id: "passkey",
      kicker: "YOUR PASSKEY",
      title: "Your passkey is the key.",
      body: "Each sign-in derives your account key from your passkey, so there's no seed phrase to write down or import. Reloading keeps you signed in.",
      note: "Lose every copy of your passkey and the account can't be rebuilt. Keep it synced in a password manager.",
    },
    {
      id: "states",
      kicker: "GAS & TRANSACTIONS",
      title: "Confirmed isn't resolved.",
      body: "Low on gas when you sign in? CloutCall may top up your account with a little MON. It's rate-limited, not a paymaster: your calls spend that MON.",
      note: "A market resolves at or after its deadline, when the resolver posts the final view count.",
    },
    {
      id: "modes",
      kicker: "ADVANCED PLAY",
      title: "Ready? Make your first call.",
      body: "A few more ways to play:",
      items: [
        {
          icon: "lock",
          label: "Sealed calls",
          text: "Hide your side until calls close, then reveal it with your passkey. Unrevealed stakes are forfeited.",
        },
        {
          icon: "duel",
          label: "Duels",
          text: "Every call gives you a link that dares a friend to take the other side.",
        },
        ...(f.aiEnabled
          ? [
              {
                icon: "bot" as const,
                label: "CloutBot",
                text: "When it's running, the AI posts its pick on-chain before calls close. Bet against it.",
              },
            ]
          : []),
        { icon: "podium", label: "Leaderboard", text: "Callers ranked by points. Points are won, never bought." },
      ],
    },
  ];
}

/** Account state the tour needs from the wallet; matches the fields `useWallet()` exposes. */
export type TourAccountState = {
  status: "signed-out" | "connecting" | "funding" | "ready";
  address?: string;
  settingUp: boolean;
  setupError?: string;
};

/**
 * Signed in with setup finished: the session is open (`ready` with an address), no retry is running and no
 * setup failure is waiting. The balance is deliberately not checked — a player may have spent every point.
 */
export function setupComplete(a: TourAccountState): boolean {
  return a.status === "ready" && !!a.address && !a.settingUp && !a.setupError;
}

export type TourOutcome = "completed" | "skipped";

/** Per network and per account: personas are separate addresses, so each gets its own first tour. */
export function tourKey(chainId: number, address: string) {
  return `cloutcall.tour.v${TOUR_VERSION}:${chainId}:${address.toLowerCase()}`;
}

type KV = Pick<Storage, "getItem" | "setItem">;

function storage(): KV | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined; // blocked storage throws on access
  }
}

/** Whether this account already finished or skipped the tour. Unreadable storage counts as "not seen". */
export function hasSeenTour(chainId: number, address: string, kv: KV | undefined = storage()): boolean {
  try {
    return !!kv?.getItem(tourKey(chainId, address));
  } catch {
    return false;
  }
}

export function rememberTour(
  chainId: number,
  address: string,
  outcome: TourOutcome,
  kv: KV | undefined = storage(),
): void {
  try {
    kv?.setItem(tourKey(chainId, address), JSON.stringify({ outcome, at: Date.now() }));
  } catch {
    /* private mode or full storage: the in-memory guard still stops it reopening this visit */
  }
}

/**
 * Story-timer bookkeeping: advances `elapsed` by one frame. A hidden tab stops the clock outright; clamping
 * `dt` also covers gaps nothing reports (a frozen page, a debugger pause), so they can never skip a slide,
 * while a slow device that only manages a few frames a second still keeps real time.
 */
export function tick(elapsed: number, dt: number, duration = SLIDE_MS, maxStep = 1000) {
  const next = elapsed + Math.min(Math.max(dt, 0), maxStep);
  return next >= duration ? { elapsed: duration, done: true } : { elapsed: next, done: false };
}
