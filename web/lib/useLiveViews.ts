"use client";

import { useEffect, useState } from "react";

type Live = { views: number; at: number };
type Entry = { value?: Live; promise?: Promise<Live | null>; fetchedAt: number };

/** One request per video per 30s, shared by every card and panel showing it (the API caches for 30s too). */
const cache = new Map<string, Entry>();
const TTL = 30_000;

function load(id: string): Promise<Live | null> {
  const hit = cache.get(id);
  if (hit?.promise && Date.now() - hit.fetchedAt < TTL) return hit.promise;
  const promise = fetch(`/api/views/${id}`)
    .then((r) => (r.ok ? (r.json() as Promise<Live>) : null))
    .catch(() => null)
    .then((v) => {
      if (v) cache.set(id, { value: v, promise, fetchedAt: Date.now() });
      return v ?? cache.get(id)?.value ?? null;
    });
  cache.set(id, { ...hit, promise, fetchedAt: Date.now() });
  return promise;
}

/** The video's public view count, refreshed every 30s while `active`. `null` until known or if unavailable. */
export function useLiveViews(videoId: string | undefined, active = true) {
  const [live, setLive] = useState<Live | null>(() => (videoId ? (cache.get(videoId)?.value ?? null) : null));
  useEffect(() => {
    if (!videoId || !active) return;
    let on = true;
    const tick = () => load(videoId).then((v) => on && v && setLive(v));
    tick();
    const t = setInterval(tick, TTL);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [videoId, active]);
  return live;
}
