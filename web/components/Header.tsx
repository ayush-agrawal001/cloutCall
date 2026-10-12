import Link from "next/link";
import { NETWORK_LABEL } from "@/lib/chain";
import { WalletButton } from "./WalletButton";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent text-white">C</span>
          CloutCall
        </Link>
        <nav className="hidden gap-4 text-sm text-muted sm:flex">
          <Link href="/" className="hover:text-text">
            Markets
          </Link>
          <Link href="/leaderboard" className="hover:text-text">
            Leaderboard
          </Link>
          <Link href="/creator" className="hover:text-text">
            Creators
          </Link>
        </nav>
        <span className="ml-auto hidden items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted md:flex">
          <span className="live-dot" /> {NETWORK_LABEL}
        </span>
        <div className="ml-auto md:ml-0">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
