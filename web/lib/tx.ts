"use client";

import {
  BaseError,
  type Abi,
  type Account,
  type Chain,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from "viem";
import { publicClient } from "./chain";

export type FastReceipt = { receipt: TransactionReceipt; ms: number };

function unsupported(e: unknown) {
  if (!(e instanceof BaseError)) return false;
  return !!e.walk((err) => {
    const code = (err as { code?: number }).code;
    const msg = (err as Error).message ?? "";
    return code === -32601 || code === -32004 || /sendRawTransactionSync|method not found|not supported/i.test(msg);
  });
}

let syncSupported = true;

/**
 * Sends a contract write and returns its receipt plus wall-clock latency (sign → receipt).
 * Uses `eth_sendRawTransactionSync` (EIP-7966, supported by Monad) so the receipt comes back in the
 * same round-trip; falls back to send + 100ms receipt polling on RPCs that lack it.
 */
export async function writeFast<
  const abi extends Abi,
  functionName extends ContractFunctionName<abi, "nonpayable" | "payable">,
  args extends ContractFunctionArgs<abi, "nonpayable" | "payable", functionName>,
>(
  wallet: WalletClient<Transport, Chain, Account>,
  req: { address: `0x${string}`; abi: abi; functionName: functionName; args: args },
): Promise<FastReceipt> {
  const t0 = performance.now();
  let receipt: TransactionReceipt;
  // viem's generics for writeContract are too deep to thread through; the request is typed above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params = req as any;
  if (syncSupported) {
    try {
      receipt = await wallet.writeContractSync({ ...params, timeout: 15_000 });
    } catch (e) {
      if (!unsupported(e)) throw e;
      syncSupported = false;
      return writeFast(wallet, req);
    }
  } else {
    const hash = await wallet.writeContract(params);
    receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 100 });
  }
  const ms = Math.round(performance.now() - t0);
  if (receipt.status !== "success") throw new Error(`Transaction reverted (${receipt.transactionHash})`);
  return { receipt, ms };
}

/** Human-readable revert reason from a viem error. */
export function describeTxError(e: unknown): string {
  if (e instanceof BaseError) {
    const reason = e.walk((err) => (err as { data?: { errorName?: string } }).data?.errorName !== undefined) as {
      data?: { errorName?: string };
    } | null;
    if (reason?.data?.errorName) return reason.data.errorName.replace(/([a-z])([A-Z])/g, "$1 $2");
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}
