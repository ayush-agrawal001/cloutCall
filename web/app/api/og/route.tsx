import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { formatViews, Side } from "@/lib/markets";
import { getMarketSummary } from "@/lib/marketMeta";
import { cleanHandle } from "@/lib/share";

/**
 * Share card for duel links, results and markets. Query:
 *   m      market id (required)
 *   h      caller handle
 *   side   1 = YES, 2 = NO
 *   sealed 1 if the call is sealed
 *   ms     confirmation latency to brag about
 *   won    points won (result card)
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const raw = q.get("m") ?? "";
  if (!/^\d{1,10}$/.test(raw)) return new Response("bad market id", { status: 400 });

  let m;
  try {
    m = await getMarketSummary(BigInt(raw));
  } catch {
    return new Response("market not found", { status: 404 });
  }

  const handle = cleanHandle(q.get("h")) || "Someone";
  const side = Number(q.get("side"));
  const sealed = q.get("sealed") === "1";
  const ms = Number(q.get("ms")) || 0;
  const won = Number(q.get("won")) || 0;
  const title = m.video.title.length > 80 ? `${m.video.title.slice(0, 78)}…` : m.video.title;

  const headline = won
    ? `${handle} called it. +${won.toLocaleString("en")} pts`
    : sealed
      ? `${handle} sealed a call 🔒`
      : side === Side.Yes || side === Side.No
        ? `${handle} says ${side === Side.Yes ? "YES" : "NO"}`
        : "Will it go viral?";
  const accent = won ? "#3ee089" : side === Side.No ? "#ff4d8d" : side === Side.Yes ? "#3ee089" : "#a594ff";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(135deg, #09090f 0%, #1a1433 60%, #2a1640 100%)",
        color: "#f4f3ff",
        padding: 56,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 800 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: "#836ef9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          C
        </div>
        CloutCall
        <div style={{ marginLeft: "auto", fontSize: 24, color: "#9a98b3", display: "flex" }}>
          {ms ? `confirmed in ${ms}ms on Monad` : "called on Monad"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 40, marginTop: 44, flex: 1 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://i.ytimg.com/vi/${m.videoId}/hqdefault.jpg`}
          width={480}
          height={360}
          style={{ borderRadius: 24, objectFit: "cover", border: "2px solid #2a2a3a" }}
          alt=""
        />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 56, fontWeight: 900, color: accent, lineHeight: 1.05, display: "flex" }}>
            {headline}
          </div>
          <div style={{ fontSize: 30, marginTop: 24, color: "#d8d6ee", lineHeight: 1.25, display: "flex" }}>
            {title}
          </div>
          <div style={{ fontSize: 34, marginTop: "auto", fontWeight: 800, display: "flex" }}>
            {`Hits ${formatViews(m.threshold)} views?`}
          </div>
          <div style={{ fontSize: 26, marginTop: 10, color: "#9a98b3", display: "flex" }}>
            {won ? "Think you can call the next one?" : "Take the other side →"}
          </div>
        </div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
