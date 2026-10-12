import { cacheLife } from "next/cache";

export type LiveViews = { views: number; likes: number; comments: number; channelId: string; at: number };

const API = process.env.YOUTUBE_API_BASE ?? "https://www.googleapis.com/youtube/v3/videos";

/**
 * Live public counters for one video. Cached for 30s so every viewer of a market shares one YouTube API
 * call (videos.list costs 1 quota unit) — the counters themselves only update every few seconds.
 */
export async function getLiveViews(id: string): Promise<LiveViews | null> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 120 });
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const res = await fetch(`${API}?${new URLSearchParams({ part: "snippet,statistics", id, key })}`);
  if (!res.ok) return null;
  const item = (
    (await res.json()) as {
      items?: {
        snippet?: { channelId?: string };
        statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      }[];
    }
  ).items?.[0];
  if (!item?.statistics?.viewCount) return null;
  return {
    views: Number(item.statistics.viewCount),
    likes: Number(item.statistics.likeCount ?? 0),
    comments: Number(item.statistics.commentCount ?? 0),
    channelId: item.snippet?.channelId ?? "",
    at: Date.now(),
  };
}
