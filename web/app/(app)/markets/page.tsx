import type { Metadata } from "next";
import Link from "next/link";
import { LiveFeed } from "@/components/LiveFeed";
import { MarketBoard } from "@/components/MarketBoard";
import { PixelIcon } from "@/components/Pixel";

export const metadata: Metadata = { title: "Markets" };

const HOW = [
  ["01", "Pick a market that's open for calls."],
  ["02", "Call YES or NO and stake some points."],
  ["03", "After the deadline, winners split the other side's points."],
];

export default function MarketsPage() {
  return (
    <div className="grid gap-x-6 gap-y-8 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section id="markets" aria-labelledby="markets-h" className="min-w-0">
        <div className="mb-5">
          <h1 id="markets-h" className="text-[40px] font-bold uppercase leading-[0.9] tracking-[-0.055em]">
            Markets
          </h1>
          <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-muted">
            Will the video reach its view target by the deadline? Your call is confirmed on Monad in about a second; the
            market settles when the final view count is posted.
          </p>
        </div>
        <MarketBoard />
      </section>

      <aside aria-label="Activity and help" className="min-w-0 space-y-6 xl:border-l xl:border-line xl:pl-6">
        <div>
          <div className="kicker mb-3.5">
            <h2 className="m-0 text-[11px] font-medium">LIVE ON MONAD</h2>
            <span className="kicker-end">
              <span className="blink inline-block h-[13px] w-2 border border-ink bg-lime align-middle" />
            </span>
          </div>
          <LiveFeed limit={6} />
        </div>
        <div className="card p-4">
          <p className="font-mono text-[10px] tracking-[0.16em] text-muted">HOW IT WORKS</p>
          <ol className="mt-3 space-y-2.5">
            {HOW.map(([n, t]) => (
              <li key={n} className="flex gap-2.5 text-sm">
                <span className="font-pixel text-xs text-muted">{n}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <Link
            href="/#how"
            className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-muted no-underline hover:text-text"
          >
            FULL GUIDE <PixelIcon name="arrow" size={11} />
          </Link>
        </div>
      </aside>
    </div>
  );
}
