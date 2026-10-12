"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { NETWORK_LABEL } from "@/lib/chain";
import { PixelIcon, type PixelIconName } from "./Pixel";

const NAV: { href: string; label: string; icon: PixelIconName; match: (p: string) => boolean }[] = [
  {
    href: "/",
    label: "Markets",
    icon: "markets",
    match: (p) => p === "/" || p.startsWith("/m/") || p.startsWith("/d/"),
  },
  { href: "/leaderboard", label: "Leaderboard", icon: "podium", match: (p) => p.startsWith("/leaderboard") },
  { href: "/creator", label: "Creators", icon: "creator", match: (p) => p.startsWith("/creator") },
];
const SYSTEM = [
  { href: "/me", label: "Your account", icon: "user" as const, match: (p: string) => p.startsWith("/me") },
];

function NavItem({ item, index, active }: { item: (typeof NAV)[number]; index: number; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`y2k-nav flex min-h-[46px] items-center gap-3 border px-2.5 text-[15px] no-underline ${
        active ? "border-ink bg-lime font-semibold text-ink hover:bg-lime" : "border-transparent font-medium text-text"
      }`}
    >
      <span
        className={`y2k-navbox grid h-[26px] w-[26px] flex-none place-items-center border ${
          active ? "border-ink bg-ink text-lime" : "border-line text-text"
        }`}
      >
        <PixelIcon name={item.icon} />
      </span>
      <span className="y2k-label">{item.label}</span>
      <span className={`y2k-label ml-auto font-mono text-[10px] ${active ? "" : "text-muted"}`}>
        {String(index + 1).padStart(2, "0")}
      </span>
    </Link>
  );
}

/** Left navigation of the application window; collapses to an icon rail. */
function NavLinks({ path }: { path: string }) {
  return (
    <>
      <p className="y2k-label px-2.5 pb-2.5 font-mono text-[10px] tracking-[0.22em] text-muted">/ PLAY</p>
      {NAV.map((item, i) => (
        <NavItem key={item.href} item={item} index={i} active={item.match(path)} />
      ))}
      <p className="y2k-label px-2.5 pb-2.5 pt-5 font-mono text-[10px] tracking-[0.22em] text-muted">/ SYSTEM</p>
      {SYSTEM.map((item, i) => (
        <NavItem key={item.href} item={item} index={NAV.length + i} active={item.match(path)} />
      ))}
    </>
  );
}

/** Reads the route at request time; streams in behind a Suspense boundary so pages stay prerenderable. */
function ActiveNavLinks() {
  return <NavLinks path={usePathname()} />;
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav
      aria-label="Main"
      data-collapsed={collapsed}
      className="y2k-panel y2k-side relative z-10 flex flex-col gap-1.5 px-3.5 pb-4 pt-6"
    >
      <Suspense fallback={<NavLinks path="" />}>
        <ActiveNavLinks />
      </Suspense>

      <div className="min-h-7 flex-1" />
      <div className="y2k-label y2k-hide-m glitch border border-line bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/y2k/art-mosaic.png"
          alt=""
          className="pixelated block h-[92px] w-full border-b border-line object-cover"
        />
        <div className="space-y-1 px-2.5 py-2 font-mono text-[10px] tracking-[0.08em]">
          <p className="flex items-center gap-2 font-semibold">
            <span className="live-dot" /> {NETWORK_LABEL.toUpperCase()}
          </p>
          <p className="text-muted">PLAY-MONEY POINTS ONLY</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className="btn y2k-hide-m absolute -right-[23px] top-[76px] h-9 w-9 rounded-full bg-lime p-0 text-ink"
      >
        <PixelIcon name="arrow" size={14} className={collapsed ? "" : "rotate-180"} />
      </button>
    </nav>
  );
}
