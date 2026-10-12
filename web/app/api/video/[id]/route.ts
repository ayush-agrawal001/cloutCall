import type { NextRequest } from "next/server";
import { getVideoMeta, isVideoId } from "@/lib/video";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/video/[id]">) {
  const { id } = await ctx.params;
  if (!isVideoId(id)) return Response.json({ error: "invalid video id" }, { status: 400 });
  return Response.json(await getVideoMeta(id), {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
