import type { Address, PublicClient, WalletClient } from "viem";
import { marketAbi } from "./abi";
import type { OnchainMarket } from "./logic";

export async function readAllMarkets(client: PublicClient, market: Address): Promise<OnchainMarket[]> {
  const out: OnchainMarket[] = [];
  for (let offset = 0n; ; offset += 100n) {
    const [page, ids] = await client.readContract({
      address: market,
      abi: marketAbi,
      functionName: "getMarkets",
      args: [offset, 100n],
    });
    page.forEach((m, i) => out.push({ ...m, id: ids[i] }));
    if (page.length < 100) return out;
  }
}

export async function openMarket(
  client: PublicClient,
  wallet: WalletClient,
  market: Address,
  args: { videoId: string; threshold: bigint; baseline: bigint; closeIn: number; resolveIn: number },
) {
  const now = (await client.getBlock()).timestamp;
  const hash = await wallet.writeContract({
    address: market,
    abi: marketAbi,
    functionName: "createMarket",
    args: [args.videoId, args.threshold, args.baseline, now + BigInt(args.closeIn), now + BigInt(args.resolveIn)],
    account: wallet.account!,
    chain: wallet.chain,
  });
  await client.waitForTransactionReceipt({ hash });
  const id = (await client.readContract({ address: market, abi: marketAbi, functionName: "marketCount" })) - 1n;
  return { id, hash };
}
