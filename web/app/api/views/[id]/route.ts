import type { NextRequest } from "next/server";
import { isVideoId } from "@/lib/video";
import { getLiveViews } from "@/lib/views";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/views/[id]">) {
  const { id } = await ctx.params;
  if (!isVideoId(id)) return Response.json({ error: "invalid video id" }, { status: 400 });
  const live = await getLiveViews(id);
  if (!live) return Response.json({ error: "live views unavailable" }, { status: 503 });
  return Response.json(live, { headers: { "Cache-Control": "public, s-maxage=30" } });
}
