/** Minimal YouTube Data API v3 client: public statistics for videos and the trending chart. */

export type VideoStats = {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  views: bigint;
  likes: bigint;
  comments: bigint;
  publishedAt: string;
};

type ApiVideo = {
  id: string;
  snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

// Overridable for local end-to-end tests against a mock server.
const API = process.env.YOUTUBE_API_BASE ?? "https://www.googleapis.com/youtube/v3/videos";

export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") return url.pathname.slice(1, 12) || null;
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const m = url.pathname.match(/\/(shorts|embed|live)\/([\w-]{11})/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

export function toStats(item: ApiVideo): VideoStats | null {
  const views = item.statistics?.viewCount;
  if (!item.id || views === undefined) return null;
  return {
    id: item.id,
    title: item.snippet?.title ?? item.id,
    channel: item.snippet?.channelTitle ?? "",
    channelId: item.snippet?.channelId ?? "",
    views: BigInt(views),
    likes: BigInt(item.statistics?.likeCount ?? "0"),
    comments: BigInt(item.statistics?.commentCount ?? "0"),
    publishedAt: item.snippet?.publishedAt ?? "",
  };
}

async function call(params: Record<string, string>, apiKey: string, fetchImpl = fetch) {
  const url = `${API}?${new URLSearchParams({ ...params, key: apiKey })}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { items?: ApiVideo[] }).items ?? [];
}

/** Stats for up to 50 videos. Videos that are deleted or private are simply missing from the map. */
export async function getStats(ids: string[], apiKey: string, fetchImpl = fetch) {
  const out = new Map<string, VideoStats>();
  for (let i = 0; i < ids.length; i += 50) {
    const items = await call({ part: "snippet,statistics", id: ids.slice(i, i + 50).join(",") }, apiKey, fetchImpl);
    for (const it of items) {
      const s = toStats(it);
      if (s) out.set(s.id, s);
    }
  }
  return out;
}

export async function getTrending(regionCode: string, max: number, apiKey: string, fetchImpl = fetch) {
  const items = await call(
    { part: "snippet,statistics", chart: "mostPopular", regionCode, maxResults: String(Math.min(50, max)) },
    apiKey,
    fetchImpl,
  );
  return items.map(toStats).filter((s): s is VideoStats => !!s);
}
