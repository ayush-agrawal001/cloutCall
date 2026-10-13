/* Landing-page explainer for the AI rival. The pick card uses demo figures and is labelled EXAMPLE. */
import { AI_NAME } from "@/lib/aiConfig";
import { HumansVsAi } from "../HumansVsAi";
import { PixelIcon } from "../Pixel";
import { FactList, type Fact } from "./Explain";

/** Each step is backed by resolver/src/agent.ts, resolver/src/kimi.ts and contracts/src/AgentJournal.sol. */
const HOW: Fact[] = [
  {
    icon: "eye",
    title: `${AI_NAME} reads the numbers`,
    body: "For each open market it pulls the video's live views, likes, comments and age, and works out the pace the video needs to hit its target.",
  },
  {
    icon: "bot",
    title: "An AI makes the call",
    body: "Kimi, a large language model, picks YES or NO with a confidence and a view forecast, and explains why in a sentence or two.",
  },
  {
    icon: "bolt",
    title: "It bets like a player",
    body: `${AI_NAME} stakes its own points on that side through the same market contract you use: 50 points on a coin flip, up to 300 when it's sure.`,
  },
  {
    icon: "lock",
    title: "Locked on Monad before calls close",
    body: "Its pick and reasoning go into the AgentJournal contract. The contract rejects a pick after calls close, a changed pick, or a pick it didn't stake on.",
  },
];

/** Same layout as the market page's AI card. Demo values that match the example market in the hero. */
function DemoAiPick() {
  return (
    <figure className="card w-full" aria-label="Example AI pick with demo figures">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="flex items-center gap-2 font-bold">
          <span className="grid h-7 w-7 place-items-center border border-ink bg-ink text-lime">
            <PixelIcon name="bot" size={13} />
          </span>
          {AI_NAME} says
        </p>
        <span className="flex items-center gap-1.5">
          <span className="border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">kimi</span>
          <span className="border border-no px-1.5 py-0.5 font-mono text-[10px] text-no">EXAMPLE</span>
        </span>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-4xl font-bold tracking-[-0.04em]">
          <span className="text-no">NO</span>{" "}
          <span className="text-base font-semibold tracking-normal text-muted">· 72% sure</span>
        </p>
        <blockquote className="border-l-2 border-line pl-3 text-sm leading-relaxed">
          &ldquo;It&apos;s gaining about 40K views an hour, but it needs 60K an hour to reach 150K in time. Strong
          engagement, still not enough to close the gap.&rdquo;
        </blockquote>
        <dl className="grid grid-cols-3 gap-2 font-mono text-[11px]">
          {[
            ["FORECAST", "141K views"],
            ["STAKED", "172 pts"],
            ["RECORDED", "on-chain"],
          ].map(([k, v]) => (
            <div key={k} className="border border-line p-2">
              <dt className="text-[10px] tracking-[0.12em] text-muted">{k}</dt>
              <dd className="mt-0.5 font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <span aria-hidden className="btn btn-yes w-full py-2.5 text-sm">
          Think the AI is wrong? Take YES
        </span>
      </div>
      <figcaption className="sr-only">
        An example: the AI calls NO with 72% confidence, forecasts 141 thousand views and stakes 172 points.
      </figcaption>
    </figure>
  );
}

export function HumansVsAiSection() {
  return (
    <div className="space-y-6">
      <div aria-hidden className="grid grid-cols-[1fr_auto_1fr] items-stretch border border-ink font-pixel">
        <div className="flex items-center gap-3 bg-lime px-4 py-3 text-ink">
          <PixelIcon name="user" size={20} />
          <span className="text-[clamp(18px,3vw,30px)] leading-none">HUMANS</span>
        </div>
        <div className="grid place-items-center bg-ink px-4 text-[clamp(16px,2.4vw,24px)] text-[#f5f5f5]">VS</div>
        <div className="flex items-center justify-end gap-3 bg-magenta px-4 py-3 text-ink">
          <span className="text-[clamp(18px,3vw,30px)] leading-none">AI</span>
          <PixelIcon name="bot" size={20} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <FactList facts={HOW} />
          <div className="card flex gap-3 p-3.5">
            <span className="grid h-9 w-9 flex-none place-items-center border border-ink bg-magenta text-ink">
              <PixelIcon name="duel" size={14} />
            </span>
            <span className="min-w-0">
              <span className="block font-bold leading-tight tracking-[-0.015em]">Then it&apos;s your move</span>
              <span className="mt-1 block text-sm leading-snug text-muted">
                Every market page shows {AI_NAME}&apos;s pick and reasoning. Back it, or take the other side and duel it
                with one tap. Beat the AI and you win its stake along with everyone else&apos;s.
              </span>
            </span>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[420px]">
          <DemoAiPick />
        </div>
      </div>

      <div>
        <p className="mb-2 font-mono text-[11px] tracking-[0.16em] text-muted">LIVE SCOREBOARD · READ FROM THE CHAIN</p>
        <HumansVsAi />
        <p className="mt-2 text-sm text-muted">
          The scoreboard puts {AI_NAME}&apos;s record against the crowd&apos;s, where the crowd&apos;s pick is the side
          people staked more on (the AI and house bots don&apos;t count), across every settled market. {AI_NAME} only
          plays while its agent is running, so some markets have no AI pick.
        </p>
      </div>
    </div>
  );
}
