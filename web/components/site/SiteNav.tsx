"use client";

import Link from "next/link";
import { NETWORK_LABEL } from "@/lib/chain";
import { PixelIcon, PixelMark } from "../Pixel";
import { ThemeToggle } from "../ThemeToggle";
import { useWallet } from "../WalletProvider";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#win", label: "What you win" },
  { href: "/#monad", label: "Why Monad" },
  { href: "/#faq", label: "FAQ" },
];

/** Title bar for the public pages (landing, sign-in). The game itself uses the app window's header. */
export function SiteNav({ links = true, cta = true }: { links?: boolean; cta?: boolean }) {
  const w = useWallet();
  const signedIn = w.status === "ready" && !!w.address;

  return (
    <header className="y2k-panel site-bar flex min-h-16 flex-wrap items-center gap-3 px-3 py-2.5 sm:gap-4 sm:pl-4">
      <Link href="/" className="flex items-center gap-2.5 p-1 text-text no-underline">
        <PixelMark />
        <span className="font-pixel text-[21px] font-bold leading-none">CLOUTCALL</span>
      </Link>
      <span className="y2k-hide-m flex items-center gap-2 border border-line px-2 py-1 font-mono text-[11px] tracking-[0.04em] text-muted">
        <span className="live-dot" /> {NETWORK_LABEL.toUpperCase()}
      </span>
      {links && (
        <nav aria-label="Page sections" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="y2k-nav px-2.5 py-2 text-sm font-medium text-text no-underline">
              {l.label}
            </a>
          ))}
        </nav>
      )}
      <div className="flex-1" />
      <ThemeToggle />
      {signedIn ? (
        <Link href="/markets" className="btn btn-accent h-11 px-4 py-0 text-sm uppercase no-underline">
          Open app <PixelIcon name="arrow" size={12} />
        </Link>
      ) : !cta ? (
        <Link href="/" className="btn btn-ghost h-11 px-4 py-0 font-mono text-[11px] tracking-[0.1em] no-underline">
          <PixelIcon name="arrow" size={12} className="rotate-180" /> BACK TO HOME
        </Link>
      ) : (
        <>
          <Link
            href="/signin"
            className="btn btn-ghost y2k-hide-m h-11 px-4 py-0 font-mono text-[11px] tracking-[0.1em] no-underline"
          >
            SIGN IN
          </Link>
          <Link href="/signin?new=1" className="btn btn-accent h-11 px-4 py-0 text-sm uppercase no-underline">
            Play free <PixelIcon name="arrow" size={12} />
          </Link>
        </>
      )}
    </header>
  );
}
