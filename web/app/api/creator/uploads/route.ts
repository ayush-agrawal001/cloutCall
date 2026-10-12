import type { NextRequest } from "next/server";
import { isAddress } from "viem";
import { registryAbi } from "@/lib/abi";
import { publicClient, REGISTRY_ADDRESS } from "@/lib/chain";

const API = process.env.YOUTUBE_API_BASE?.replace(/\/videos$/, "") ?? "https://www.googleapis.com/youtube/v3";

/** Latest uploads of a verified creator's channel, with live view counts, for hosting a market. */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") ?? "";
  const key = process.env.YOUTUBE_API_KEY;
  if (!isAddress(address) || !REGISTRY_ADDRESS || !key) return Response.json({ error: "unavailable" }, { status: 400 });
  const channelId = await publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "channelOf",
    args: [address],
  });
  if (!channelId) return Response.json({ error: "not a verified creator" }, { status: 403 });

  const get = async (path: string, params: Record<string, string>) => {
    const r = await fetch(`${API}/${path}?${new URLSearchParams({ ...params, key })}`);
    if (!r.ok) throw new Error(`YouTube ${path} ${r.status}`);
    return r.json();
  };
  try {
    const ch = await get("channels", { part: "contentDetails", id: channelId });
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) return Response.json({ channelId, uploads: [] });
    const pl = await get("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: "6" });
    const ids: string[] = (pl.items ?? []).map(
      (i: { contentDetails: { videoId: string } }) => i.contentDetails.videoId,
    );
    if (ids.length === 0) return Response.json({ channelId, uploads: [] });
    const vids = await get("videos", { part: "snippet,statistics", id: ids.join(",") });
    return Response.json({
      channelId,
      uploads: (vids.items ?? []).map(
        (v: { id: string; snippet: { title: string; publishedAt: string }; statistics: { viewCount: string } }) => ({
          id: v.id,
          title: v.snippet.title,
          publishedAt: v.snippet.publishedAt,
          views: Number(v.statistics.viewCount),
        }),
      ),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "lookup failed" }, { status: 502 });
  }
}
