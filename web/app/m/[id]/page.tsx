import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketView } from "@/components/MarketView";
import { formatViews } from "@/lib/markets";
import { getMarketSummary } from "@/lib/marketMeta";

function parseId(raw: string) {
  return /^\d{1,10}$/.test(raw) ? BigInt(raw) : undefined;
}

export async function generateMetadata({ params }: PageProps<"/m/[id]">): Promise<Metadata> {
  const id = parseId((await params).id);
  if (id === undefined) return { title: "Market not found" };
  try {
    const m = await getMarketSummary(id);
    const title = `Will "${m.video.title}" hit ${formatViews(m.threshold)} views?`;
    return {
      title,
      description: `Call it on CloutCall — YES or NO, confirmed on Monad in about a second.`,
      openGraph: { title, images: [`/api/og?m=${id}`] },
      twitter: { card: "summary_large_image", title, images: [`/api/og?m=${id}`] },
    };
  } catch {
    return { title: "Market" };
  }
}

async function Market({ params }: { params: PageProps<"/m/[id]">["params"] }) {
  const id = parseId((await params).id);
  if (id === undefined) return <p className="card p-6 text-no">Market not found.</p>;
  return <MarketView id={id} />;
}

export default function MarketPage({ params }: PageProps<"/m/[id]">) {
  return (
    <Suspense fallback={<div className="card aspect-video animate-pulse" />}>
      <Market params={params} />
    </Suspense>
  );
}
