"use client";

import { useEffect, useState } from "react";
import type { VideoMeta } from "./video";

const cache = new Map<string, Promise<VideoMeta>>();

function load(id: string) {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/api/video/${id}`).then((r) => r.json() as Promise<VideoMeta>);
    cache.set(id, p);
  }
  return p;
}

export function useVideoMeta(id: string | undefined) {
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    load(id).then((m) => live && setMeta(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return meta;
}
