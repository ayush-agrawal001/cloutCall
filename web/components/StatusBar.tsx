import { NETWORK_LABEL } from "@/lib/chain";

const TICKER = [
  "PLAY-MONEY POINTS ONLY — NON-TRANSFERABLE, NO CASH VALUE",
  "NOT AFFILIATED WITH YOUTUBE OR ANY CREATOR",
  "CALLS LAND IN ~300MS ON MONAD",
  "DON'T BUY THE CREATOR — CALL THE CREATOR",
];

/** Bottom status bar of the application window, carrying the legal line as a ticker. */
export function StatusBar() {
  const items = [...TICKER, ...TICKER];
  return (
    <footer className="y2k-panel y2k-statusbar flex h-[34px] items-stretch overflow-hidden font-mono text-[11px] tracking-[0.08em]">
      <span className="flex flex-none items-center gap-2 border-r border-ink bg-lime px-3.5 font-semibold text-ink">
        <span className="blink block h-[7px] w-[7px] bg-ink" />
        READY
      </span>
      <div className="flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap">
        <div className="marquee inline-flex flex-none" aria-hidden>
          {items.map((t, i) => (
            <span key={i} className="pr-14">
              {t} ■
            </span>
          ))}
        </div>
      </div>
      <span className="y2k-hide-m flex flex-none items-center border-l border-line px-3.5">
        {NETWORK_LABEL.toUpperCase()}
      </span>
    </footer>
  );
}
