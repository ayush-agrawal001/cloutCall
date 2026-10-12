"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { registryAbi } from "./abi";
import { publicClient, REGISTRY_ADDRESS } from "./chain";

/** True when the market was opened by the verified owner of the video's channel. */
export function useCreatorBadge(creator: Address | undefined, videoId: string | undefined) {
  const [hosted, setHosted] = useState(false);
  useEffect(() => {
    if (!REGISTRY_ADDRESS || !creator || !videoId) return;
    let live = true;
    (async () => {
      const channel = await publicClient.readContract({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: "channelOf",
        args: [creator],
      });
      if (!channel) return;
      const r = await fetch(`/api/views/${videoId}`);
      if (!r.ok) return;
      const v = (await r.json()) as { channelId?: string };
      if (live) setHosted(v.channelId === channel);
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [creator, videoId]);
  return hosted;
}
