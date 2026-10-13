/* Explainer blocks shared by the landing page and the first-time sign-in. Figures marked EXAMPLE are demo values. */
import { AI_ENABLED, AI_NAME } from "@/lib/aiConfig";
import { IS_MONAD, NETWORK_LABEL } from "@/lib/chain";
import {
  PAYOUT_EXAMPLE,
  PAYOUT_EXAMPLE_RESULT,
  REFILL_BELOW,
  REFILL_POINTS,
  SPRINT_MINUTES,
  STARTER_POINTS,
} from "@/lib/intro";
import { PixelIcon, type PixelIconName } from "../Pixel";

const n = (v: number) => v.toLocaleString("en");

export type Fact = { icon: PixelIconName; title: string; body: string };

export const STEPS: Fact[] = [
  {
    icon: "markets",
    title: "Pick a video",
    body: "Each market is a real YouTube video with a view target and a deadline, like “150K views in the next 30 minutes”.",
  },
  {
    icon: "duel",
    title: "Make your call",
    body: "YES, it hits the target in time. NO, it falls short. Choose how many points to stake, then confirm with your passkey.",
  },
  {
    icon: "podium",
    title: "Collect if you're right",
    body: "After the deadline the final view count is posted on-chain. Everyone who called it right splits the other side's points.",
  },
];

export const REWARDS: Fact[] = [
  {
    icon: "user",
    title: `${n(STARTER_POINTS)} free points to start`,
    body: "Every new account gets a starter stack the moment it's created. You never pay for points.",
  },
  {
    icon: "bolt",
    title: "Win the other side's stake",
    body: "Call it right and you get your stake back plus a share of everything staked against you.",
  },
  {
    icon: "podium",
    title: "Climb the leaderboard",
    body: "Callers are ranked by points. Points can only be won, never bought, so rank means you read the hype well.",
  },
  {
    icon: "arrowUp",
    title: "Never locked out",
    body: `Run low? Below ${n(REFILL_BELOW)} points you can claim ${n(REFILL_POINTS)} more, once a day.`,
  },
];

export function monadFacts(): Fact[] {
  return [
    {
      icon: "bolt",
      title: "Confirmed in about a second",
      body: "Monad makes a new block in well under a second. Your call is a real transaction, confirmed in about a second, and CloutCall shows you the measured time.",
    },
    {
      icon: "lock",
      title: "Rules in public code",
      body: "Stakes, payouts and refunds follow smart contracts anyone can read. The final view count is posted on-chain too, so every result can be checked.",
    },
    {
      icon: "eye",
      title: "Every move is visible",
      body: AI_ENABLED
        ? `Each call links to Monad's block explorer, and ${AI_NAME} posts its pick and reasoning on-chain before calls close.`
        : "Each call links to Monad's block explorer, and the live feed shows calls the moment their block is proposed.",
    },
    {
      icon: "user",
      title: "No crypto to buy",
      body: `Your passkey becomes a standard Monad account. New players get a small top-up of ${IS_MONAD ? "MON" : "gas"} for fees, so there's nothing to buy first.`,
    },
  ];
}

export const MODES: Fact[] = [
  {
    icon: "bolt",
    title: "Hype Sprints",
    body: `${SPRINT_MINUTES}-minute markets on fresh uploads, with a live views-per-minute pace panel.`,
  },
  {
    icon: "duel",
    title: "Duels",
    body: "Every call makes a link that dares a friend to take the other side.",
  },
  {
    icon: "lock",
    title: "Sealed calls",
    body: "Hide your side until calls close, then reveal it. Nobody can copy your call.",
  },
  ...(AI_ENABLED
    ? [
        {
          icon: "bot" as const,
          title: "Beat the AI",
          body: `${AI_NAME} stakes on open markets when it's running. Take the other side.`,
        },
      ]
    : []),
  {
    icon: "eye",
    title: "Personas",
    body: "Play under extra anonymous accounts from the same passkey.",
  },
  {
    icon: "creator",
    title: "Creator mode",
    body: "Creators who link their channel can host markets on their own uploads.",
  },
];

export function FactList({ facts, cols = 2 }: { facts: Fact[]; cols?: 2 | 3 | 4 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "md:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4" }[cols];
  return (
    <ul className={`grid gap-3 ${grid}`}>
      {facts.map((f) => (
        <li key={f.title} className="card flex gap-3 p-3.5">
          <span className="grid h-9 w-9 flex-none place-items-center border border-ink bg-lime text-ink">
            <PixelIcon name={f.icon} size={14} />
          </span>
          <span className="min-w-0">
            <span className="block font-bold leading-tight tracking-[-0.015em]">{f.title}</span>
            <span className="mt-1 block text-sm leading-snug text-muted">{f.body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The parimutuel payout, worked through with the same formula as the contract. */
export function PayoutExample() {
  const { stake, yesPool, noPool } = PAYOUT_EXAMPLE;
  const share = PAYOUT_EXAMPLE_RESULT - stake;
  return (
    <figure className="card p-4" aria-label="Worked payout example">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-muted">
        <span>HOW A PAYOUT WORKS</span>
        <span className="border border-no px-1.5 text-no">EXAMPLE</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
        <div className="border border-ink bg-lime p-2.5 text-ink">
          <p className="text-[10px] tracking-[0.12em]">YES POOL</p>
          <p className="text-lg font-semibold">{n(yesPool)} pts</p>
          <p className="text-[10px]">incl. your {n(stake)}</p>
        </div>
        <div className="border border-ink bg-magenta p-2.5 text-ink">
          <p className="text-[10px] tracking-[0.12em]">NO POOL</p>
          <p className="text-lg font-semibold">{n(noPool)} pts</p>
          <p className="text-[10px]">everyone against you</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed">
        You stake <b>{n(stake)}</b> on YES and the video hits its target. You hold {n(stake)} of the {n(yesPool)} YES
        points, so you take that share of the NO pool: {n(stake)} ÷ {n(yesPool)} × {n(noPool)} = <b>{n(share)}</b>.
      </p>
      <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-2 font-mono text-xs">
        <span className="text-muted">YOU COLLECT</span>
        <span className="text-base font-semibold">
          {n(stake)} + {n(share)} = {n(PAYOUT_EXAMPLE_RESULT)} pts
        </span>
      </p>
      <figcaption className="mt-2 text-xs text-muted">
        Called it wrong? That stake goes to the other side. If nobody called it right, or a market is cancelled, stakes
        are refunded.
      </figcaption>
    </figure>
  );
}

/** The honest answer to "can I earn money here?". */
export function PlayMoneyNote({ className = "" }: { className?: string }) {
  return (
    <p className={`border-l-4 border-magenta bg-magenta/10 px-3.5 py-2.5 text-sm leading-relaxed ${className}`}>
      <b>Is this real money? No.</b> CLOUT points are play money: free to get, and they can&apos;t be bought, sold,
      transferred or cashed out. You can&apos;t win or lose real money on CloutCall — you play for the score, the
      leaderboard and bragging rights.
    </p>
  );
}

/** Mock market in the house style. Demo figures only. */
export function DemoMarket() {
  return (
    <figure className="card w-full" aria-label="Example market with demo figures">
      <div className="scanlines relative aspect-video border-b border-line bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/y2k/card-audio.webp" alt="" className="pixelated block h-full w-full object-cover opacity-90" />
        <div className="absolute left-2 top-2 z-10 flex gap-1.5">
          <span className="flex items-center gap-1 border border-ink bg-lime px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-ink">
            <span className="blink block h-[6px] w-[6px] bg-ink" /> OPEN
          </span>
          <span className="flex items-center gap-1 border border-ink bg-[#ffe600] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-ink">
            <PixelIcon name="bolt" size={10} /> SPRINT
          </span>
        </div>
        <span className="absolute right-2 top-2 z-10 bg-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-[#f5f5f5]">
          EXAMPLE
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="font-bold leading-snug tracking-[-0.015em]">New music video — official premiere</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Some creator · 2h ago</p>
        </div>
        <div className="font-mono text-[11px]">
          <div className="flex justify-between gap-2">
            <span className="text-muted">NOW 120K</span>
            <span className="font-semibold">TARGET 150K</span>
          </div>
          <div aria-hidden className="mt-1.5 h-2 border border-line bg-surface-2">
            <div className="h-full w-[62%] bg-cyan" />
          </div>
          <p className="mt-1.5 text-muted">
            CALLS CLOSE IN <span className="text-text">00:29:41</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2" aria-hidden>
          <span className="btn btn-yes py-2 text-sm">YES, IT HITS</span>
          <span className="btn btn-no py-2 text-sm">NO, IT FLOPS</span>
        </div>
      </div>
      <figcaption className="sr-only">
        An example market: a video at 120 thousand views with a 150 thousand view target and 29 minutes left.
      </figcaption>
    </figure>
  );
}

export const NETWORK_NOTE =
  IS_MONAD && NETWORK_LABEL === "Monad Testnet"
    ? "CloutCall runs on Monad Testnet for now. Test MON has no value either."
    : undefined;
