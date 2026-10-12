import type { NextRequest } from "next/server";
import { createWalletClient, http, isAddress, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, publicClient, RPC_URL } from "@/lib/chain";

/**
 * Gas drip for brand-new passkey accounts. Calls cost a fraction of a cent on Monad, so CloutCall
 * sponsors a tiny amount of MON once per address and players never have to find a faucet.
 */
const AMOUNT = parseEther(process.env.DRIP_AMOUNT ?? "0.2");
const ADDRESS_COOLDOWN_MS = 10 * 60 * 1000;
const IP_LIMIT = Number(process.env.DRIP_IP_LIMIT ?? 5);
const IP_WINDOW_MS = 60 * 60 * 1000;

const byAddress = new Map<string, number>();
const byIp = new Map<string, number[]>();

/**
 * Monad reserve balance: while the drip wallet holds < 10 MON, a value transfer only succeeds if it is
 * the wallet's only transaction in the last 3 blocks ("emptying exception"). So drips are serialized
 * and spaced ≥ 3 blocks (~0.9s) apart. Funding the drip wallet above 10 MON removes the limit.
 */
const MIN_GAP_MS = 1_200;
let queue: Promise<unknown> = Promise.resolve();
let lastSentAt = 0;

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastSentAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastSentAt = Date.now();
    }
  });
  queue = run.catch(() => {});
  return run;
}

export async function POST(req: NextRequest) {
  const key = process.env.DRIP_PRIVATE_KEY as Hex | undefined;
  if (!key) return Response.json({ error: "drip not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { address?: string };
  const address = body.address;
  if (!address || !isAddress(address)) return Response.json({ error: "invalid address" }, { status: 400 });

  const balance = await publicClient.getBalance({ address });
  if (balance >= AMOUNT / 2n) return Response.json({ funded: false, reason: "has gas", balance: balance.toString() });

  const now = Date.now();
  const last = byAddress.get(address.toLowerCase()) ?? 0;
  if (now - last < ADDRESS_COOLDOWN_MS) return Response.json({ error: "slow down" }, { status: 429 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const hits = (byIp.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_LIMIT) return Response.json({ error: "too many new accounts" }, { status: 429 });

  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(RPC_URL) });
  const receipt = await serialized(async () => {
    // Monad charges the gas limit, so set it exactly for a plain transfer.
    const hash = await wallet.sendTransaction({ to: address, value: AMOUNT, gas: 21_000n });
    return publicClient.waitForTransactionReceipt({ hash, pollingInterval: 150 });
  });
  if (receipt.status !== "success") {
    return Response.json({ error: "drip busy, retry", hash: receipt.transactionHash }, { status: 503 });
  }
  byAddress.set(address.toLowerCase(), now);
  byIp.set(ip, [...hits, now]);
  return Response.json({
    funded: true,
    hash: receipt.transactionHash,
    blockNumber: receipt.blockNumber.toString(),
  });
}
