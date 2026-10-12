"use client";

import { useState } from "react";
import { linkedInShare, xIntent } from "@/lib/share";

/** Share buttons for a duel or a win. The link unfurls into a generated OG card on X and LinkedIn. */
export function ShareCard({ path, text, heading }: { path: string; text: string; heading: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();

  async function nativeShare() {
    try {
      await navigator.share({ text, url });
    } catch {
      /* dismissed */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="pop space-y-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
      <p className="font-bold">{heading}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={path.replace(/^\/d\/(\d+)\?/, "/api/og?m=$1&")}
        alt=""
        className="w-full rounded-lg border border-line"
      />
      <div className="grid grid-cols-2 gap-2">
        <a className="btn btn-accent py-2 text-sm" href={xIntent(text, url)} target="_blank" rel="noreferrer">
          Post on X
        </a>
        <a className="btn btn-ghost py-2 text-sm" href={linkedInShare(url)} target="_blank" rel="noreferrer">
          LinkedIn
        </a>
        <button className="btn btn-ghost py-2 text-sm" onClick={copy}>
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <button className="btn btn-ghost py-2 text-sm" onClick={nativeShare}>
            Share…
          </button>
        )}
      </div>
    </div>
  );
}
