/* eslint-disable @next/next/no-img-element -- static pixel art; next/image would smooth it */
import type { Metadata } from "next";
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
    body: "When CloutBot is running, it stakes on open markets and posts its reasoning on-chain first. Take the other side.",
    img: "/y2k/card-gallery.png",
    alt: "Green and purple glitch graphic with torn scanlines",
    tag: "KIMI",
  },
  {
    href: "/creator",
    title: "Creator mode",
    body: "Creators who link their channel (Google sign-in, read-only) can host markets on their own uploads.",
    img: "/y2k/card-pattern.png",
    alt: "Psychedelic magenta pixel interference pattern",
    tag: "CREATORS",
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

export const metadata: Metadata = { title: "Markets" };

export default function MarketsPage() {
  return (
    <div className="grid gap-x-6 gap-y-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section id="markets" aria-labelledby="markets-h" className="min-w-0 xl:col-start-1">
        <div className="mb-5 flex flex-wrap items-end gap-x-5 gap-y-2">
          <h1 id="markets-h" className="text-[40px] font-bold uppercase leading-[0.9] tracking-[-0.055em]">
            Live markets
          </h1>
          <span className="pb-0.5 font-mono text-[11px] tracking-[0.16em] text-muted">
            01 / OPEN FIRST, THEN SETTLING
          </span>
        </div>
        <p className="mb-5 max-w-[60ch] text-[15px] leading-relaxed text-muted">
          Will the video hit its view target by the deadline? Open a market to call YES or NO — your call is confirmed
          on Monad in about a second, and the market settles after its deadline.
        </p>
        <MarketFeed />
      </section>

      <aside
        aria-labelledby="feed-h"
        className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:border-l xl:border-line xl:pl-6"
      >
        <Kicker
          id="feed-h"
          end={<span className="blink inline-block h-[13px] w-2 border border-ink bg-lime align-middle" />}
        >
          02 / FEED.LOG
        </Kicker>
        <LiveFeed />
        <Link href="/#how" className="card lift mt-8 block p-4 text-text no-underline">
          <p className="font-mono text-[10px] tracking-[0.16em] text-muted">NEW TO CLOUTCALL?</p>
          <p className="mt-1 font-bold tracking-[-0.015em]">How it works, what you win and why Monad</p>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-muted">
            READ THE GUIDE <PixelIcon name="arrow" size={11} />
          </p>
        </Link>
      </aside>

      <section aria-labelledby="modes-h" className="min-w-0 xl:col-start-1">
        <Kicker id="modes-h" end="3 MODES">
          03 / GAME MODES
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
        <div className="mt-6">
          <HumansVsAi />
        </div>
      </section>
    </div>
  );
}
