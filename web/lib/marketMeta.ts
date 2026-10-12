import { cacheLife } from "next/cache";
import { marketAbi } from "./abi";
import { MARKET_ADDRESS, publicClient } from "./chain";
import { getVideoMeta } from "./video";

/** Immutable parts of a market (video + target), cached for share metadata and OG images. */
export async function getMarketSummary(id: bigint) {
  "use cache";
  cacheLife("hours");
  const m = await publicClient.readContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "getMarket",
    args: [id],
  });
  const video = await getVideoMeta(m.videoId);
  return {
    videoId: m.videoId,
    threshold: m.threshold,
    baselineViews: m.baselineViews,
    resolveTime: m.resolveTime,
    video,
  };
}
