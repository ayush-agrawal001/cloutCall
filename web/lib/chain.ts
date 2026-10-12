import { createPublicClient, http, type Address, type Chain } from "viem";
import { foundry, monad, monadTestnet } from "viem/chains";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? monadTestnet.id);

const base: Chain = CHAIN_ID === monad.id ? monad : CHAIN_ID === foundry.id ? foundry : monadTestnet;

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || base.rpcUrls.default.http[0];
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  (CHAIN_ID === foundry.id ? "ws://127.0.0.1:8545" : base.rpcUrls.default.webSocket?.[0]);

export const chain: Chain = {
  ...base,
  rpcUrls: { default: { http: [RPC_URL], webSocket: WS_URL ? [WS_URL] : undefined } },
};

export const IS_MONAD = CHAIN_ID === monad.id || CHAIN_ID === monadTestnet.id;
export const NETWORK_LABEL =
  CHAIN_ID === monad.id ? "Monad" : CHAIN_ID === monadTestnet.id ? "Monad Testnet" : "Local devnet";

export const MARKET_ADDRESS = (process.env.NEXT_PUBLIC_MARKET_ADDRESS ?? "0x") as Address;
export const POINTS_ADDRESS = (process.env.NEXT_PUBLIC_POINTS_ADDRESS ?? "0x") as Address;
export const JOURNAL_ADDRESS = (process.env.NEXT_PUBLIC_JOURNAL_ADDRESS || undefined) as Address | undefined;
export const REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || undefined) as Address | undefined;
export const AGENT_ADDRESS = (process.env.NEXT_PUBLIC_AGENT_ADDRESS || undefined) as Address | undefined;
export const START_BLOCK = BigInt(process.env.NEXT_PUBLIC_START_BLOCK ?? "0");
export const ENVIO_URL = process.env.NEXT_PUBLIC_ENVIO_URL || "";

export const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL, { batch: true }),
  // Monad produces a block every ~300ms; poll at the same cadence.
  pollingInterval: 300,
});

export function explorerTx(hash: string) {
  const url = chain.blockExplorers?.default.url;
  return url ? `${url}/tx/${hash}` : undefined;
}

export function explorerAddress(address: string) {
  const url = chain.blockExplorers?.default.url;
  return url ? `${url}/address/${address}` : undefined;
}
