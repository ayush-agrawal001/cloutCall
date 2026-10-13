import Link from "next/link";
import { NETWORK_LABEL } from "@/lib/chain";
import { HowToPlayButton } from "./ArcadeTour";
import { PixelMark } from "./Pixel";
import { ThemeToggle } from "./ThemeToggle";
import { WalletButton } from "./WalletButton";

/** The application window's title bar. */
export function Header() {
  return (
    <header className="y2k-panel y2k-titlebar flex min-h-16 flex-wrap items-center gap-3 px-3 py-2.5 sm:gap-4 sm:pl-4">
      <Link href="/" className="flex items-center gap-2.5 p-1 text-text no-underline">
        <PixelMark />
        <span className="font-pixel text-[21px] font-bold leading-none">CLOUTCALL</span>
      </Link>
      <span className="y2k-hide-m flex items-center gap-2 border border-line px-2 py-1 font-mono text-[11px] tracking-[0.04em] text-muted">
        <span className="live-dot" /> {NETWORK_LABEL.toUpperCase()}
      </span>
      <div className="flex-1" />
      <HowToPlayButton />
      <ThemeToggle />
      <div className="flex items-center border-l border-line pl-3 sm:pl-4">
        <WalletButton />
      </div>
    </header>
  );
}
