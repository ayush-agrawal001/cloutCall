"use client";

import {
  BaseError,
  encodeFunctionData,
  keccak256,
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

/** The transaction was mined and reverted: nothing changed on-chain except gas. */
export class TxRevertedError extends Error {
  constructor(readonly hash: Hex) {
    super(`Transaction reverted (${hash})`);
  }
}

/**
 * The transaction was signed and may have been broadcast, but neither a receipt nor a clear rejection came
 * back in time. It may still land, so the caller must not send the same stake again until it is checked.
 */
export class TxStatusUnknownError extends Error {
  constructor(
    readonly hash: Hex,
    readonly cause?: unknown,
  ) {
    super("Sent, but not confirmed yet. Check the transaction before calling again.");
  }
}

/** Errors after which a signed transaction may or may not have reached the chain. */
export function isAmbiguousSendError(e: unknown): boolean {
  const test = (err: unknown) => {
    const { name = "", message = "", code } = (err ?? {}) as { name?: string; message?: string; code?: number };
    return (
      name === "TimeoutError" ||
      name === "HttpRequestError" ||
      name === "WaitForTransactionReceiptTimeoutError" ||
      name === "SocketClosedError" ||
      // EIP-7966: the node accepted the transaction but no receipt arrived within the sync timeout.
      code === 4 ||
      /time(d)? ?out|already known|fetch failed|network|ECONNRESET|socket|aborted/i.test(message)
    );
  };
  if (e instanceof BaseError) return !!e.walk(test);
  return test(e);
}

/**
 * After a failed send, looks the signed transaction up by hash. A receipt (success or revert) settles it;
 * if the failure was ambiguous, keeps polling for a bounded time before reporting the status as unknown.
 * A clear rejection with no receipt is rethrown as-is.
 */
export async function receiptAfterSendError(
  hash: Hex,
  error: unknown,
  getReceipt: (hash: Hex) => Promise<TransactionReceipt | null>,
  opts: { lookupMs?: number; intervalMs?: number } = {},
): Promise<TransactionReceipt> {
  const ambiguous = isAmbiguousSendError(error);
  const deadline = Date.now() + (ambiguous ? (opts.lookupMs ?? 8_000) : 0);
  for (;;) {
    const receipt = await getReceipt(hash).catch(() => null);
    if (receipt) return receipt;
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 300));
  }
  if (ambiguous) throw new TxStatusUnknownError(hash, error);
  throw error;
}
export type WriteRequest = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };

function unsupported(e: unknown) {
  if (!(e instanceof BaseError)) return false;
  return !!e.walk((err) => {
    const code = (err as { code?: number }).code;
    // Only the node's own error text: viem's full message embeds the request body, which always names
    // eth_sendRawTransactionSync, so a timeout would otherwise look like "method not supported".
    const msg = (err as { details?: string }).details ?? "";
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
    private readonly opts: { syncTimeoutMs?: number; receiptLookupMs?: number } = {},
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

    // Known before sending, so an ambiguous failure can still be checked on-chain instead of guessed.
    const hash = keccak256(serializedTransaction);
    let receipt: TransactionReceipt;
    try {
      receipt = await this.send(serializedTransaction);
    } catch (e) {
      try {
        receipt = await receiptAfterSendError(hash, e, (h) => publicClient.getTransactionReceipt({ hash: h }), {
          lookupMs: this.opts.receiptLookupMs,
        });
      } catch (err) {
        // Resync on the next call. If this transaction is still pending, the chain still reports nonce N,
        // so a later send reuses N and the two can't both land.
        this.nonce = undefined;
        throw err;
      }
    }
    this.nonce = nonce + 1;
    const ms = Math.round(performance.now() - t0);
    if (receipt.status !== "success") {
      this.gas.delete(key);
      throw new TxRevertedError(receipt.transactionHash);
    }
    return { receipt, ms };
  }

  private async send(serializedTransaction: Hex): Promise<TransactionReceipt> {
    if (this.sync) {
      try {
        return await this.wallet.sendRawTransactionSync({
          serializedTransaction,
          timeout: this.opts.syncTimeoutMs ?? 15_000,
          // Return reverted receipts instead of throwing, so `write` reports them as TxRevertedError.
          throwOnReceiptRevert: false,
        });
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
  if (e instanceof TxStatusUnknownError || e instanceof TxRevertedError) return e.message;
  // Nodes report an empty gas tank as "Missing or invalid parameters … insufficient balance".
  const text = e instanceof Error ? `${e.message} ${(e as { details?: string }).details ?? ""}` : String(e);
  if (/insufficient (balance|funds)/i.test(text)) {
    return "Not enough MON to pay for gas. CloutCall tops accounts up automatically; wait a moment and try again.";
  }
  if (e instanceof BaseError) {
    const reason = e.walk((err) => (err as { data?: { errorName?: string } }).data?.errorName !== undefined) as {
      data?: { errorName?: string };
    } | null;
    if (reason?.data?.errorName) return reason.data.errorName.replace(/([a-z])([A-Z])/g, "$1 $2");
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}
