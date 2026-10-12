import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry, monad, monadTestnet } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function load() {
  const chainId = Number(process.env.CHAIN_ID ?? 10143);
  const chain = chainId === 143 ? monad : chainId === 31337 ? foundry : monadTestnet;
  const rpc =
    process.env.RPC_URL ??
    (chainId === 10143 ? process.env.MONAD_TESTNET_RPC_URL : chainId === 143 ? process.env.MONAD_RPC_URL : undefined) ??
    chain.rpcUrls.default.http[0];
  const dep = JSON.parse(readFileSync(join(root, "deployments", `${chainId}.json`), "utf8")) as {
    market: Address;
    points: Address;
  };
  const key = (process.env.RESOLVER_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY) as Hex | undefined;
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const wallet = key ? createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(rpc) }) : undefined;
  return { chainId, chain, market: dep.market, publicClient, wallet, youtubeKey: process.env.YOUTUBE_API_KEY };
}

export function requireYoutubeKey(key: string | undefined): string {
  if (!key) throw new Error("Set YOUTUBE_API_KEY (https://console.cloud.google.com → YouTube Data API v3)");
  return key;
}
