"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { parseEventLogs } from "viem";
import { marketAbi, registryAbi } from "@/lib/abi";
import { MARKET_ADDRESS, publicClient, REGISTRY_ADDRESS } from "@/lib/chain";
import { linkMessage } from "@/lib/creatorLink";
import { formatViews, thumbnail } from "@/lib/markets";
import { describeTxError } from "@/lib/tx";
import { SignInPanel } from "./WalletButton";
import { useWallet } from "./WalletProvider";

type Upload = { id: string; title: string; publishedAt: string; views: number };

const TARGETS = [10, 25, 50];
const WINDOWS = [
  { label: "1 hour", close: 20 * 60, resolve: 3600 },
  { label: "24 hours", close: 6 * 3600, resolve: 24 * 3600 },
];

function roundTarget(views: number, pct: number) {
  const raw = views * (1 + pct / 100);
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 2);
  return Math.ceil(raw / unit) * unit;
}

export function CreatorPanel() {
  const w = useWallet();
  const q = useSearchParams();
  const [channel, setChannel] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[] | null>(null);
  const [busy, setBusy] = useState<string>();
  const [err, setErr] = useState<string>();
  const [opened, setOpened] = useState<bigint>();

  const loadChannel = useCallback(async () => {
    if (!w.address || !REGISTRY_ADDRESS) return;
    const c = await publicClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "channelOf",
      args: [w.address],
    });
    setChannel(c || "");
  }, [w.address]);

  useEffect(() => {
    let live = true;
    if (!w.address || !REGISTRY_ADDRESS) return;
    publicClient
      .readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "channelOf", args: [w.address] })
      .then((c) => live && setChannel(c || ""))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [w.address]);

  useEffect(() => {
    if (!channel || !w.address) return;
    let live = true;
    fetch(`/api/creator/uploads?address=${w.address}`)
      .then((r) => r.json())
      .then((j: { uploads?: Upload[]; error?: string }) => {
        if (!live) return;
        if (j.error) setErr(j.error);
        setUploads(j.uploads ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [channel, w.address]);

  if (!REGISTRY_ADDRESS) return <p className="card p-6 text-muted">Creator mode isn&apos;t enabled on this network.</p>;
  if (w.status !== "ready" || !w.address) return <SignInPanel />;

  async function verify() {
    setBusy("verify");
    setErr(undefined);
    try {
      const message = linkMessage(w.address!, new Date().toISOString(), crypto.randomUUID());
      const signature = await w.signLinkMessage(message);
      const r = await fetch("/api/creator/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: w.address, message, signature }),
      });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!j.url) throw new Error(j.error ?? "couldn't start verification");
      window.location.href = j.url;
    } catch (e) {
      setErr(describeTxError(e));
      setBusy(undefined);
    }
  }

  async function host(u: Upload, pct: number, win: (typeof WINDOWS)[number]) {
    setBusy(u.id);
    setErr(undefined);
    try {
      // Use chain time: the contract checks close/resolve against block.timestamp.
      const now = (await publicClient.getBlock()).timestamp;
      const res = await w.write(`Hosted a market on "${u.title.slice(0, 40)}"`, {
        address: MARKET_ADDRESS,
        abi: marketAbi,
        functionName: "createMarket",
        args: [
          u.id,
          BigInt(roundTarget(u.views, pct)),
          BigInt(u.views),
          now + BigInt(win.close),
          now + BigInt(win.resolve),
        ],
      });
      const [created] = parseEventLogs({ abi: marketAbi, eventName: "MarketCreated", logs: res.receipt.logs });
      setOpened(created?.args.marketId);
    } catch (e) {
      setErr(describeTxError(e));
    } finally {
      setBusy(undefined);
    }
  }

  async function unlink() {
    setBusy("unlink");
    try {
      await w.write("Unlinked channel", {
        address: REGISTRY_ADDRESS!,
        abi: registryAbi,
        functionName: "unlink",
        args: [],
      });
      await loadChannel();
      setUploads(null);
    } catch (e) {
      setErr(describeTxError(e));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="space-y-4">
      {q.get("verified") && (
        <p className="pop rounded-xl border border-yes/40 bg-yes/10 p-4 text-sm text-yes">
          ✓ Verified as <b>{q.get("verified")}</b>. The link is recorded on-chain.
        </p>
      )}
      {(q.get("error") || err) && <p className="rounded-xl bg-no/10 p-4 text-sm text-no">{err ?? q.get("error")}</p>}

      {channel === null ? (
        <div className="card h-24 animate-pulse" />
      ) : !channel ? (
        <div className="card space-y-3 p-6 text-sm">
          <p className="text-lg font-bold">Verify your channel</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>Your passkey signs a link request (no prompt — it&apos;s inside your session).</li>
            <li>Sign in with Google and grant read-only YouTube access so we can see which channel is yours.</li>
            <li>
              We record &ldquo;this account controls this channel&rdquo; on Monad and throw the Google token away.
            </li>
          </ol>
          <button className="btn btn-accent w-full" disabled={busy === "verify"} onClick={verify}>
            {busy === "verify" ? "Opening Google…" : "Verify with Google"}
          </button>
        </div>
      ) : (
        <>
          <div className="card flex items-center justify-between gap-3 p-5 text-sm">
            <div>
              <p className="font-bold text-yes">✓ Verified creator</p>
              <p className="font-mono text-xs text-muted">{channel}</p>
            </div>
            <button className="btn btn-ghost px-3 py-1.5 text-xs" disabled={busy === "unlink"} onClick={unlink}>
              Unlink
            </button>
          </div>
          {opened !== undefined && (
            <p className="pop rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
              Market #{opened.toString()} is live —{" "}
              <Link className="underline" href={`/m/${opened}`}>
                open it and share it with your fans
              </Link>
              .
            </p>
          )}
          <p className="font-bold">Host a market on a recent upload</p>
          {uploads === null ? (
            <div className="card h-24 animate-pulse" />
          ) : uploads.length === 0 ? (
            <p className="card p-5 text-sm text-muted">No public uploads found.</p>
          ) : (
            uploads.map((u) => (
              <div key={u.id} className="card flex flex-col gap-3 p-4 sm:flex-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbnail(u.id)} alt="" className="aspect-video w-full rounded-lg object-cover sm:w-40" />
                <div className="flex-1 space-y-2 text-sm">
                  <p className="font-semibold leading-snug">{u.title}</p>
                  <p className="text-xs text-muted">{formatViews(u.views)} views now</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WINDOWS.map((win) =>
                      TARGETS.map((pct) => (
                        <button
                          key={`${win.label}-${pct}`}
                          className="btn btn-ghost px-2.5 py-1 text-xs"
                          disabled={!!busy}
                          onClick={() => host(u, pct, win)}
                        >
                          +{pct}% in {win.label} ({formatViews(roundTarget(u.views, pct))})
                        </button>
                      )),
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
