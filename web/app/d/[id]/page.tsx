import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DuelView } from "@/components/DuelView";
import { formatViews, Side } from "@/lib/markets";
import { getMarketSummary } from "@/lib/marketMeta";
import { cleanHandle, ogPath } from "@/lib/share";

type Props = PageProps<"/d/[id]">;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function parse(id: string, sp: Record<string, string | string[] | undefined>) {
  const vs = one(sp.vs);
  const side = Number(one(sp.side));
  return {
    id: /^\d{1,10}$/.test(id) ? BigInt(id) : undefined,
    vs: vs && /^0x[0-9a-fA-F]{40}$/.test(vs) ? (vs as `0x${string}`) : undefined,
    handle: cleanHandle(one(sp.h)),
    side: side === Side.Yes || side === Side.No ? side : undefined,
    sealed: one(sp.sealed) === "1",
    ms: Number(one(sp.ms)) || undefined,
    won: Number(one(sp.won)) || undefined,
  };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const d = parse((await params).id, await searchParams);
  if (d.id === undefined) return { title: "Duel" };
  try {
    const m = await getMarketSummary(d.id);
    const who = d.handle || "A friend";
    const what = d.won
      ? `called it and won ${d.won} pts`
      : d.sealed
        ? "sealed a call"
        : d.side === Side.Yes
          ? "says YES"
          : d.side === Side.No
            ? "says NO"
            : "called it";
    const title = `${who} ${what}: will "${m.video.title}" hit ${formatViews(m.threshold)} views?`;
    const image = ogPath({
      m: String(d.id),
      h: d.handle,
      side: d.side,
      sealed: d.sealed ? 1 : undefined,
      ms: d.ms,
      won: d.won,
    });
    return {
      title,
      description: "Take the other side on CloutCall — one tap with Face ID, settled in under a second on Monad.",
      openGraph: { title, images: [image] },
      twitter: { card: "summary_large_image", title, images: [image] },
    };
  } catch {
    return { title: "Duel" };
  }
}

async function Duel({ params, searchParams }: Props) {
  const d = parse((await params).id, await searchParams);
  if (d.id === undefined) return <p className="card p-6 text-no">Duel not found.</p>;
  return <DuelView id={d.id} rival={d.vs} handle={d.handle} side={d.side} sealed={d.sealed} won={d.won} />;
}

/** Duel metadata depends on the query string, so this page always renders at request time. */
async function Dynamic() {
  await connection();
  return null;
}

export default function DuelPage(props: Props) {
  return (
    <>
      <Suspense fallback={<div className="card aspect-video animate-pulse" />}>
        <Duel {...props} />
      </Suspense>
      <Suspense>
        <Dynamic />
      </Suspense>
    </>
  );
}
