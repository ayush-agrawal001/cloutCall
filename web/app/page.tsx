import { HumansVsAi } from "@/components/HumansVsAi";
import { MarketFeed } from "@/components/MarketFeed";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="pt-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-2">Hype markets on Monad</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
          Don&apos;t buy the creator.
          <br />
          <span className="text-accent-2">Call the creator.</span>
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          Will that new upload cross the view target? Tap Face ID, make your call, and watch it settle in under a
          second. Then dare a friend — or our AI — to take the other side.
        </p>
      </section>
      <HumansVsAi />
      <section>
        <h2 className="mb-4 text-lg font-bold">Live markets</h2>
        <MarketFeed />
      </section>
    </div>
  );
}
