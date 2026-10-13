/* eslint-disable @next/next/no-img-element -- static pixel art; next/image would smooth it */
import Link from "next/link";
import { LiveFeed } from "@/components/LiveFeed";
import { PixelIcon } from "@/components/Pixel";
import {
  DemoMarket,
  FactList,
  MODES,
  monadFacts,
  NETWORK_NOTE,
  PayoutExample,
  PlayMoneyNote,
  REWARDS,
  STEPS,
} from "@/components/site/Explain";
import { HumansVsAiSection } from "@/components/site/HumansVsAiSection";
import { SiteNav } from "@/components/site/SiteNav";
import { AI_ENABLED, AI_NAME } from "@/lib/aiConfig";
import { STARTER_POINTS } from "@/lib/intro";

const SECTIONS = ["how", "win", ...(AI_ENABLED ? ["ai"] : []), "monad", "modes", "faq"];
/** Section numbers follow the order above, so they stay in sequence when the AI section is off. */
const num = (id: string) => String(SECTIONS.indexOf(id) + 1).padStart(2, "0");

const FAQ = [
  {
    q: "Can I earn real money?",
    a: "No. CloutCall is a free game played with CLOUT points. Points have no cash value and can't be bought, sold, transferred or withdrawn. What you earn is points, a leaderboard rank and the proof that you called the hype first.",
  },
  {
    q: "Do I need a crypto wallet or any crypto?",
    a: "No. Your passkey (your fingerprint, face unlock or phone screen lock) creates your account. New accounts get a small gas top-up automatically, so there's nothing to install or buy.",
  },
  {
    q: "What is Monad, and why is it here?",
    a: "Monad is a fast blockchain that works like Ethereum. Every call, payout and result in CloutCall is a transaction on it: confirmed in about a second, public, and checkable by anyone on the block explorer.",
  },
  ...(AI_ENABLED
    ? [
        {
          q: `Who is ${AI_NAME}, and is it fair?`,
          a: `${AI_NAME} is an AI player. It decides from the video's public stats only — not from what other players called — then stakes its own points and locks its pick and reasoning on-chain before calls close. It can't change the pick afterwards, and it wins or loses by the same rules as you.`,
        },
      ]
    : []),
  {
    q: "Who decides whether a video hit its target?",
    a: "After the deadline, CloutCall's resolver reads the video's public view count and posts it on-chain. The contract then pays out by fixed rules. If a market can't be settled fairly — for example the count was read too late to tell — it's cancelled and every stake is refunded.",
  },
  {
    q: "What if I lose my passkey?",
    a: "Your account key is rebuilt from your passkey each time you sign in, and only kept, encrypted, while a session is open. Keep the passkey synced in your password manager (iCloud Keychain, Google Password Manager and so on); if every copy is lost, the account can't be recovered.",
  },
  {
    q: "Is CloutCall connected to YouTube or the creators?",
    a: "No. It only reads public view counts. Creators can optionally link their own channel to host markets, but no one owns any part of a creator here.",
  },
];

function Section({
  id,
  index,
  label,
  title,
  lead,
  children,
}: {
  id: string;
  index: string;
  label: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="y2k-panel px-4 py-8 sm:px-8 sm:py-10">
      <div className="kicker mb-4">
        <span>
          {index} / {label}
        </span>
      </div>
      <h2
        id={`${id}-h`}
        className="max-w-[22ch] text-[clamp(30px,4.2vw,52px)] font-bold uppercase leading-[0.92] tracking-[-0.05em]"
      >
        {title}
      </h2>
      {lead && <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted">{lead}</p>}
      <div className="mt-7">{children}</div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="site-stage">
      <SiteNav />

      <section aria-labelledby="hero-h" className="y2k-panel overflow-hidden">
        <div className="grid gap-8 px-4 py-9 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-muted">
              <span className="border border-ink bg-lime px-1.5 py-0.5 font-semibold text-ink">FREE TO PLAY</span>A
              YOUTUBE PREDICTION GAME ON MONAD
            </p>
            <h1
              id="hero-h"
              className="chroma mt-5 text-[clamp(46px,7vw,98px)] font-bold uppercase leading-[0.86] tracking-[-0.065em]"
            >
              <span className="block">
                Predict
                <span className="glitch ml-[0.12em] inline-block h-[0.68em] w-[1.5em] border-2 border-[currentColor] align-[0]">
                  <img src="/y2k/art-mosaic.png" alt="" className="pixelated block h-full w-full object-cover" />
                </span>
              </span>
              <span className="block pl-[0.5em] text-[var(--ink-2)]">which videos</span>
              <span className="block">
                <span className="glitch mr-[0.1em] inline-block h-[0.68em] w-[0.7em] border-2 border-[currentColor] align-[0]">
                  <img src="/y2k/art-sphere.png" alt="" className="pixelated block h-full w-full object-cover" />
                </span>
                go viral
              </span>
              <span className="block text-[var(--ink-2)]">on YouTube.</span>
            </h1>
            <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed">
              Will that new upload hit its view target before the clock runs out? Call <b>YES</b> or <b>NO</b> with free
              points, see it confirmed on Monad in about a second, then go up against your friends — and an AI that
              makes its own calls.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/signin?new=1"
                className="btn btn-accent h-13 justify-between gap-4 py-0 pl-5 pr-2 text-sm uppercase tracking-[0.04em] no-underline"
              >
                Start playing — it&apos;s free
                <span className="grid h-9 w-9 place-items-center bg-ink text-lime">
                  <PixelIcon name="arrow" size={14} />
                </span>
              </Link>
              <Link href="/markets" className="btn btn-ghost h-13 py-0 text-sm uppercase no-underline">
                See live markets
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] tracking-[0.08em] text-muted">
              {[
                "NO WALLET APP",
                "NO SEED PHRASE",
                `${STARTER_POINTS.toLocaleString("en")} FREE POINTS`,
                "NO REAL MONEY",
              ].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <span aria-hidden className="block h-1.5 w-1.5 bg-lime outline outline-1 outline-ink" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-[400px] lg:rotate-[1.5deg]">
            <DemoMarket />
          </div>
        </div>
      </section>

      <Section
        id="how"
        index={num("how")}
        label="HOW IT WORKS"
        title="Three taps, one call"
        lead="Every market asks one question about a real YouTube video: will it reach the view target by the deadline?"
      >
        <ol className="grid gap-3 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card flex flex-col p-4">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center border border-ink bg-lime text-ink">
                  <PixelIcon name={s.icon} size={16} />
                </span>
                <span className="font-pixel text-3xl text-[var(--ink-2)]">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mt-4 text-xl font-bold tracking-[-0.025em]">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="win"
        index={num("win")}
        label="WHAT YOU WIN"
        title="Win points, not payouts"
        lead="CloutCall is a skill game for bragging rights. You play with free points and win them from people who called it wrong."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0 space-y-4">
            <FactList facts={REWARDS} />
            <PlayMoneyNote />
          </div>
          <PayoutExample />
        </div>
      </Section>

      {AI_ENABLED && (
        <Section
          id="ai"
          index={num("ai")}
          label="HUMANS VS AI"
          title="Can you out-predict an AI?"
          lead={`${AI_NAME} is an AI player that makes its own calls on the same markets, with its own points on the line. Every market is a contest between the crowd and the machine.`}
        >
          <HumansVsAiSection />
        </Section>
      )}

      <Section
        id="monad"
        index={num("monad")}
        label="WHY MONAD"
        title="Every call is on-chain"
        lead="Monad is a fast, Ethereum-compatible blockchain. CloutCall keeps the whole game on it, so it feels like an app but plays by public rules."
      >
        <FactList facts={monadFacts()} cols={4} />
        <div className="mt-6">
          <div className="card min-w-0 p-4">
            <div className="kicker mb-3">
              <span>HAPPENING ON MONAD NOW</span>
              <span className="kicker-end">
                <span className="blink inline-block h-[11px] w-2 border border-ink bg-lime align-middle" />
              </span>
            </div>
            <LiveFeed limit={5} />
          </div>
          {NETWORK_NOTE && <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted">{NETWORK_NOTE}</p>}
        </div>
      </Section>

      <Section id="modes" index={num("modes")} label="WAYS TO PLAY" title="More than yes or no">
        <FactList facts={MODES} cols={3} />
      </Section>

      <Section id="faq" index={num("faq")} label="FAQ" title="Fair questions">
        <div className="grid gap-2">
          {FAQ.map((f) => (
            <details key={f.q} className="card group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 font-bold tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  aria-hidden
                  className="grid h-7 w-7 flex-none place-items-center border border-line font-pixel text-sm group-open:bg-lime group-open:text-ink"
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <p className="border-t border-line p-4 text-sm leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <section aria-labelledby="cta-h" className="relative overflow-hidden border border-ink bg-ink text-[#f5f5f5]">
        <img
          src="/y2k/card-pattern.png"
          alt=""
          className="pixelated absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6 px-4 py-10 sm:px-8">
          <div>
            <h2
              id="cta-h"
              className="text-[clamp(32px,5vw,64px)] font-bold uppercase leading-[0.9] tracking-[-0.055em]"
            >
              Make your first call
            </h2>
            <p className="mt-3 max-w-[44ch] text-[15px] text-[#d6d3da]">
              One passkey, {STARTER_POINTS.toLocaleString("en")} free points, and a minute-long intro before you play.
            </p>
          </div>
          <Link
            href="/signin?new=1"
            className="btn btn-accent h-13 justify-between gap-4 py-0 pl-5 pr-2 text-sm uppercase no-underline"
          >
            Create your account
            <span className="grid h-9 w-9 place-items-center bg-ink text-lime">
              <PixelIcon name="arrow" size={14} />
            </span>
          </Link>
        </div>
      </section>

      <footer className="y2k-panel flex flex-wrap items-center justify-between gap-3 px-4 py-4 font-mono text-[11px] leading-relaxed text-muted sm:px-8">
        <p>
          Play-money points only — non-transferable, no cash value. Not affiliated with YouTube or any creator. Built on
          Monad.
        </p>
        <nav aria-label="Footer" className="flex gap-4">
          <Link href="/markets">Markets</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/creator">Creators</Link>
          <a href="https://github.com/ayush-agrawal001/cloutCall">GitHub</a>
        </nav>
      </footer>
    </div>
  );
}
