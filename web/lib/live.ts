"use client";

import { decodeEventLog, type Address, type Hex, type Log } from "viem";
import { marketAbi } from "./abi";
import { IS_MONAD, MARKET_ADDRESS, publicClient, WS_URL } from "./chain";

export type CommitState = "Proposed" | "Voted" | "Finalized" | "Verified" | "Confirmed";

export type MarketEvent = {
  key: string;
  name: string;
  marketId: bigint;
  args: Record<string, unknown>;
  txHash: Hex;
  blockNumber: bigint;
  commitState: CommitState;
  seenAt: number;
};

type RawLog = Log & { commitState?: CommitState };

export function decodeMarketLog(log: RawLog): MarketEvent | null {
  try {
    const ev = decodeEventLog({ abi: marketAbi, data: log.data, topics: log.topics });
    const args = ev.args as Record<string, unknown>;
    if (!("marketId" in args)) return null;
    return {
      key: `${log.transactionHash}:${log.logIndex}`,
      name: ev.eventName,
      marketId: args.marketId as bigint,
      args,
      txHash: log.transactionHash as Hex,
      blockNumber: BigInt(log.blockNumber ?? 0),
      commitState: log.commitState ?? "Confirmed",
      seenAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/** Recent history (Monad RPCs cap eth_getLogs at ~100 blocks ≈ 30s; Envio serves deeper history). */
export async function recentEvents(blocks = 99n): Promise<MarketEvent[]> {
  const latest = await publicClient.getBlockNumber();
  const logs = await publicClient.getLogs({
    address: MARKET_ADDRESS,
    fromBlock: latest > blocks ? latest - blocks : 0n,
    toBlock: latest,
  });
  return logs.map((l) => decodeMarketLog(l as RawLog)).filter((e): e is MarketEvent => !!e);
}

/**
 * Streams CloutMarket events. On Monad this uses the `monadLogs` subscription, which pushes each log
 * as soon as its block is *proposed* and again as it is voted and finalized — so the UI can show a
 * call landing in a few hundred milliseconds. Elsewhere it falls back to 300ms log polling.
 */
export function watchMarketEvents(onEvent: (e: MarketEvent) => void, address: Address = MARKET_ADDRESS) {
  let stopped = false;
  let stopFallback: (() => void) | undefined;

  const fallback = () => {
    if (stopped || stopFallback) return;
    stopFallback = publicClient.watchEvent({
      address,
      pollingInterval: 300,
      onLogs: (logs) =>
        logs.forEach((l) => {
          const e = decodeMarketLog(l as RawLog);
          if (e) onEvent(e);
        }),
    });
  };

  if (!IS_MONAD || !WS_URL || typeof WebSocket === "undefined") {
    fallback();
    return () => {
      stopped = true;
      stopFallback?.();
    };
  }

  const ws = new WebSocket(WS_URL);
  ws.onopen = () =>
    ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["monadLogs", { address }] }));
  ws.onmessage = (msg) => {
    const data = JSON.parse(String(msg.data));
    if (data.id === 1 && data.error) {
      ws.close();
      fallback();
      return;
    }
    const log = data.params?.result as RawLog | undefined;
    if (!log) return;
    const e = decodeMarketLog(log);
    if (e) onEvent(e);
  };
  ws.onerror = () => fallback();
  ws.onclose = () => !stopped && fallback();

  return () => {
    stopped = true;
    ws.close();
    stopFallback?.();
  };
}
