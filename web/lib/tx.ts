"use client";

import {
  BaseError,
  encodeFunctionData,
  type Abi,
  type Address,
  type Chain,
  type Hex,
  type LocalAccount,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from "viem";
import { publicClient } from "./chain";

export type FastReceipt = { receipt: TransactionReceipt; ms: number };
export type WriteRequest = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };

function unsupported(e: unknown) {
  if (!(e instanceof BaseError)) return false;
  return !!e.walk((err) => {
    const code = (err as { code?: number }).code;
    const msg = (err as Error).message ?? "";
    return code === -32601 || code === -32004 || /sendRawTransactionSync|method not found|not supported/i.test(msg);
  });
}

/**
 * Low-latency sender for one account.
 *
 * Everything a transaction needs except the signature is prepared ahead of time — nonce tracked
 * locally, fees refreshed in the background, and each function's gas limit learned once — so a call
 * is one local signature plus a single `eth_sendRawTransactionSync` round-trip (EIP-7966, supported
 * by Monad), which returns the receipt. Monad charges the declared gas limit, so limits are the
 * estimate plus a 20% margin rather than a generous constant.
 */
export class FastSender {
  private nonce?: number;
  private fees?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; at: number };
  /** Known limits (measured on Monad testnet + 20%); everything else is learned on first use. */
  private gas = new Map<string, bigint>();
  static readonly KNOWN_GAS: Record<string, bigint> = { claimStarter: 112_000n };
  private sync = true;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly account: LocalAccount,
    private readonly wallet: WalletClient<Transport, Chain, LocalAccount>,
  ) {
    this.warm().catch(() => {});
    this.timer = setInterval(() => this.refreshFees().catch(() => {}), 10_000);
    // Don't keep a Node process (tests, scripts) alive just for fee refreshes.
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }

  async warm() {
    await Promise.all([this.refreshNonce(), this.refreshFees()]);
  }

  private async refreshNonce() {
    this.nonce = await publicClient.getTransactionCount({ address: this.account.address, blockTag: "latest" });
  }

  private async refreshFees() {
    const f = await publicClient.estimateFeesPerGas();
    this.fees = { maxFeePerGas: f.maxFeePerGas, maxPriorityFeePerGas: f.maxPriorityFeePerGas, at: Date.now() };
  }

  private gasKey(req: WriteRequest) {
    return `${req.address.toLowerCase()}:${req.functionName}`;
  }

  /** Learn a call's gas limit ahead of time (e.g. while the user picks a side) so the click doesn't wait. */
  async prefetch(req: WriteRequest) {
    const key = this.gasKey(req);
    if (this.gas.has(key) || FastSender.KNOWN_GAS[req.functionName]) return;
    const data = encodeFunctionData({ abi: req.abi, functionName: req.functionName, args: req.args });
    const g = await publicClient.estimateGas({ account: this.account.address, to: req.address, data });
    this.gas.set(key, (g * 12n) / 10n);
  }

  async write(req: WriteRequest): Promise<FastReceipt> {
    const t0 = performance.now();
    const data = encodeFunctionData({ abi: req.abi, functionName: req.functionName, args: req.args });
    const key = this.gasKey(req);

    const [gas] = await Promise.all([
      this.gas.get(key) ??
        FastSender.KNOWN_GAS[req.functionName] ??
        publicClient.estimateGas({ account: this.account.address, to: req.address, data }).then((g) => (g * 12n) / 10n),
      this.nonce === undefined ? this.refreshNonce() : undefined,
      !this.fees || Date.now() - this.fees.at > 30_000 ? this.refreshFees() : undefined,
    ]);
    this.gas.set(key, gas);

    const nonce = this.nonce!;
    const serializedTransaction = await this.account.signTransaction({
      chainId: this.wallet.chain.id,
      type: "eip1559",
      to: req.address,
      data,
      value: 0n,
      gas,
      nonce,
      maxFeePerGas: this.fees!.maxFeePerGas,
      maxPriorityFeePerGas: this.fees!.maxPriorityFeePerGas,
    });

    let receipt: TransactionReceipt;
    try {
      receipt = await this.send(serializedTransaction);
    } catch (e) {
      this.nonce = undefined; // resync on the next call
      throw e;
    }
    this.nonce = nonce + 1;
    const ms = Math.round(performance.now() - t0);
    if (receipt.status !== "success") {
      this.gas.delete(key);
      throw new Error(`Transaction reverted (${receipt.transactionHash})`);
    }
    return { receipt, ms };
  }

  private async send(serializedTransaction: Hex): Promise<TransactionReceipt> {
    if (this.sync) {
      try {
        return await this.wallet.sendRawTransactionSync({ serializedTransaction, timeout: 15_000 });
      } catch (e) {
        if (!unsupported(e)) throw e;
        this.sync = false;
      }
    }
    const hash = await this.wallet.sendRawTransaction({ serializedTransaction });
    return publicClient.waitForTransactionReceipt({ hash, pollingInterval: 100 });
  }
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
