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
const IP_LIMIT = 5;
const IP_WINDOW_MS = 60 * 60 * 1000;

const byAddress = new Map<string, number>();
const byIp = new Map<string, number[]>();

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

  byAddress.set(address.toLowerCase(), now);
  byIp.set(ip, [...hits, now]);

  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(RPC_URL) });
  // Monad charges the gas limit, so set it exactly for a plain transfer.
  const hash = await wallet.sendTransaction({ to: address, value: AMOUNT, gas: 21_000n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 150 });
  return Response.json({ funded: true, hash, blockNumber: receipt.blockNumber.toString() });
}
