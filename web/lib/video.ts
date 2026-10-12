import { cacheLife } from "next/cache";

export type VideoMeta = { title: string; author: string; thumbnail: string };

const VIDEO_ID = /^[\w-]{11}$/;

export function isVideoId(id: string) {
  return VIDEO_ID.test(id);
}

/** Title and channel via YouTube oEmbed (public, no API key). Cached for a day. */
export async function getVideoMeta(id: string): Promise<VideoMeta> {
  "use cache";
  cacheLife("days");
  const fallback = {
    title: `YouTube video ${id}`,
    author: "YouTube",
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
  if (!isVideoId(id)) return fallback;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
    );
    if (!res.ok) return fallback;
    const j = (await res.json()) as { title?: string; author_name?: string };
    return {
      title: j.title ?? fallback.title,
      author: j.author_name ?? fallback.author,
      thumbnail: fallback.thumbnail,
    };
  } catch {
    return fallback;
  }
}
