/* eslint-disable @next/next/no-img-element -- static pixel art; next/image would smooth it */
import Link from "next/link";
import { HumansVsAi } from "@/components/HumansVsAi";
import { LiveFeed } from "@/components/LiveFeed";
import { MarketFeed } from "@/components/MarketFeed";
import { PixelIcon } from "@/components/Pixel";

const FEATURES = [
  {
    href: "#markets",
    title: "Hype Sprints",
    body: "30-minute markets on fresh uploads, with a live views-per-minute pace panel.",
    img: "/y2k/card-audio.webp",
    alt: "Rainbow scanlines with horizontal chromatic distortion",
    tag: "LIVE",
    eq: true,
  },
  {
    href: "/leaderboard",
    title: "Beat the AI",
    body: "CloutBot stakes on every market and posts its reasoning on-chain. Take the other side.",
    img: "/y2k/card-gallery.png",
    alt: "Green and purple glitch graphic with torn scanlines",
    tag: "KIMI",
  },
  {
    href: "/creator",
    title: "Creator mode",
    body: "Verified creators host markets on their own uploads, badged on every card.",
    img: "/y2k/card-pattern.png",
    alt: "Psychedelic magenta pixel interference pattern",
    tag: "VERIFIED",
  },
];

const EQ = [
  ["70%", "#39FF14", "-.1s"],
  ["100%", "#39FF14", "-.5s"],
  ["55%", "#39FF14", "-.3s"],
  ["85%", "#00FFFF", "-.7s"],
  ["40%", "#00FFFF", "-.2s"],
  ["95%", "#00FFFF", "-.6s"],
  ["60%", "#FF00E5", "-.4s"],
  ["80%", "#FF00E5", "-.9s"],
  ["45%", "#FF00E5", "-.15s"],
  ["75%", "#FFE600", "-.55s"],
  ["90%", "#FF7A00", "-.75s"],
  ["65%", "#FF1F1F", "-.25s"],
];

const STEPS = [
  {
    img: "/y2k/news-orb.webp",
    tag: "01 · ACCOUNT",
    title: "Face ID is the wallet",
    body: "No seed phrase, no gas. Your passkey opens a scoped session.",
  },
  {
    img: "/y2k/news-terrain.webp",
    tag: "02 · CALL",
    title: "Lands in ~300ms",
    body: "Calls go out with sync receipts; watch Proposed → Finalized.",
  },
  {
    img: "/y2k/news-sort.webp",
    tag: "03 · DUEL",
    title: "Send the other side",
    body: "Every call makes a duel link with the opposite side preselected.",
  },
];

function Kicker({ id, children, end }: { id?: string; children: React.ReactNode; end?: React.ReactNode }) {
  return (
    <div className="kicker mb-3.5">
      <h2 id={id} className="m-0 text-[11px] font-medium">
        {children}
      </h2>
      {end && <span className="kicker-end">{end}</span>}
    </div>
  );
}

export default function Home() {
  return (
    <div className="grid gap-x-6 gap-y-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-labelledby="modes-h" className="min-w-0 xl:col-start-1">
        <Kicker id="modes-h" end="3 MODES">
          01 / GAME MODES
        </Kicker>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.title} href={f.href} className="card lift flex min-w-0 flex-col text-text no-underline">
              <div className="glitch h-[150px] border-b border-line bg-black">
                <img src={f.img} alt={f.alt} className="pixelated block h-full w-full object-cover" />
                <span className="absolute left-2 top-2 flex items-center gap-1.5 bg-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-[#f5f5f5]">
                  {f.eq && <span className="blink block h-[7px] w-[7px] bg-[#ff1f1f]" />}
                  {f.tag}
                </span>
                {f.eq && (
                  <div aria-hidden className="absolute inset-x-2.5 bottom-2.5 flex h-11 items-end gap-[3px]">
                    {EQ.map(([h, c, d], i) => (
                      <span key={i} className="eq flex-1" style={{ height: h, background: c, animationDelay: d }} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-1 items-end gap-3 p-3 pl-3.5">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[19px] font-bold leading-tight tracking-[-0.025em]">{f.title}</h3>
                  <p className="mt-1 font-mono text-[11px] leading-snug text-muted">{f.body}</p>
                </div>
                <span className="grid h-11 w-11 flex-none place-items-center border border-ink bg-lime text-ink">
                  <PixelIcon name="arrowUp" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="manifesto-h" className="min-w-0 xl:col-start-1">
        <Kicker end="MONAD · TRACK 03">02 / MANIFESTO</Kicker>
        <div className="grid gap-5 sm:grid-cols-[30px_minmax(0,1fr)]">
          <div
            aria-hidden
            className="hidden rotate-180 justify-between gap-6 overflow-hidden whitespace-nowrap border-l border-line pl-2.5 font-mono text-[10px] tracking-[0.34em] text-muted [writing-mode:vertical-rl] sm:flex"
          >
            <span>CLOUTCALL ■ HYPE MARKETS ON MONAD</span>
            <span>VIEWS — CALLS — DUELS ■ 300MS</span>
          </div>
          <div className="min-w-0">
            <h1
              id="manifesto-h"
              className="chroma text-[clamp(44px,5.8vw,86px)] font-bold uppercase leading-[0.86] tracking-[-0.065em]"
            >
              <span className="block">
                Don&apos;t buy
                <span className="glitch ml-[0.12em] inline-block h-[0.68em] w-[1.5em] border-2 border-[currentColor] align-[0]">
                  <img src="/y2k/art-mosaic.png" alt="" className="pixelated block h-full w-full object-cover" />
                </span>
              </span>
              <span className="block pl-[0.5em] text-[var(--ink-2)]">the creator.</span>
              <span className="block">
                <span className="glitch mr-[0.1em] inline-block h-[0.68em] w-[0.7em] border-2 border-[currentColor] align-[0]">
                  <img src="/y2k/art-sphere.png" alt="" className="pixelated block h-full w-full object-cover" />
                </span>
                Call
                <sup className="ml-2 inline-block align-[0.62em] font-mono text-[11px] font-medium tracking-[0.1em] text-muted">
                  (YES/NO)
                </sup>
              </span>
              <span className="block text-[var(--ink-2)]">the creator.</span>
            </h1>
            <div className="mt-7 flex flex-wrap items-stretch gap-5">
              <p className="max-w-[40ch] flex-[1_1_240px] text-[15px] leading-relaxed">
                Will that new upload cross the view target? Tap Face ID, make your call, and watch it settle in under a
                second. <span className="text-muted">Then dare a friend — or our AI — to take the other side.</span>
              </p>
              <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-2.5">
                <div className="glitch h-[86px] border border-line">
                  <img src="/y2k/art-target.png" alt="" className="pixelated block h-full w-full object-cover" />
                </div>
                <a
                  href="#markets"
                  className="btn btn-accent h-12 justify-between py-0 pl-4 pr-2 text-sm uppercase tracking-[0.04em] no-underline"
                >
                  Make a call
                  <span className="grid h-8 w-8 place-items-center bg-ink text-lime">
                    <PixelIcon name="arrow" size={14} />
                  </span>
                </a>
              </div>
            </div>
            <div className="mt-7">
              <HumansVsAi />
            </div>
          </div>
        </div>
      </section>

      <aside
        aria-labelledby="feed-h"
        className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:border-l xl:border-line xl:pl-6"
      >
        <Kicker
          id="feed-h"
          end={<span className="blink inline-block h-[13px] w-2 border border-ink bg-lime align-middle" />}
        >
          03 / FEED.LOG
        </Kicker>
        <LiveFeed />
        <div className="kicker mb-3.5 mt-8">
          <h2 className="m-0 text-[11px] font-medium">HOW IT WORKS</h2>
        </div>
        <ol className="space-y-4">
          {STEPS.map((s) => (
            <li key={s.tag} className="flex gap-3 border-b border-line pb-4 last:border-b-0">
              <div className="glitch h-[84px] w-[84px] flex-none border border-line">
                <img src={s.img} alt="" className="block h-full w-full object-cover" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] tracking-[0.06em] text-muted">{s.tag}</p>
                <h3 className="mt-1 text-[15px] font-bold leading-tight tracking-[-0.015em]">{s.title}</h3>
                <p className="mt-1 text-xs leading-snug text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </aside>

      <section id="markets" aria-labelledby="markets-h" className="min-w-0 border-t border-line pt-6 xl:col-span-2">
        <div className="mb-5 flex flex-wrap items-end gap-x-5 gap-y-2">
          <h2 id="markets-h" className="text-[40px] font-bold uppercase leading-[0.9] tracking-[-0.055em]">
            Live markets
          </h2>
          <span className="pb-0.5 font-mono text-[11px] tracking-[0.16em] text-muted">
            04 / OPEN FIRST, THEN SETTLING
          </span>
        </div>
        <MarketFeed />
      </section>
    </div>
  );
}
