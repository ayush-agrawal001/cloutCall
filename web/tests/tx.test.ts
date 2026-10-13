/**
 * Ambiguous send failures (run: npx tsx --test tests/tx.test.ts). No chain or env file needed: the
 * FastSender tests talk to an in-process mock JSON-RPC server that can drop, stall or reject a send.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import {
  createWalletClient,
  HttpRequestError,
  http,
  keccak256,
  TimeoutError,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

// ---------------------------------------------------------------------------
// Mock RPC. `mode` decides what eth_sendRawTransactionSync does with the next transaction.
// ---------------------------------------------------------------------------
type Mode = "ok" | "drop-then-mine" | "stall-never-mine" | "revert" | "reject" | "no-sync";
let mode: Mode = "ok";
let chainNonce = 0;
const receipts = new Map<string, Record<string, unknown>>();
let sends = 0;

const hex = (n: number | bigint) => `0x${n.toString(16)}`;
const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

function receipt(hash: string, status: "0x1" | "0x0") {
  return {
    blockHash: `0x${"ab".repeat(32)}`,
    blockNumber: "0x10",
    contractAddress: null,
    cumulativeGasUsed: "0x5208",
    effectiveGasPrice: "0x1",
    from: account.address,
    gasUsed: "0x5208",
    logs: [],
    logsBloom: `0x${"00".repeat(256)}`,
    status,
    to: "0x000000000000000000000000000000000000c0de",
    transactionHash: hash,
    transactionIndex: "0x0",
    type: "0x2",
  };
}

async function handle(req: {
  method: string;
  params: unknown[];
}): Promise<{ result?: unknown; error?: unknown } | "drop" | "stall"> {
  switch (req.method) {
    case "eth_chainId":
      return { result: hex(foundry.id) };
    case "eth_getTransactionCount":
      return { result: hex(chainNonce) };
    case "eth_estimateGas":
      return { result: hex(50_000) };
    case "eth_maxPriorityFeePerGas":
      return { result: "0x1" };
    case "eth_getBlockByNumber":
      return {
        result: {
          number: "0x10",
          hash: `0x${"ab".repeat(32)}`,
          parentHash: `0x${"cd".repeat(32)}`,
          timestamp: "0x1",
          baseFeePerGas: "0x1",
          gasLimit: "0x1c9c380",
          gasUsed: "0x0",
          transactions: [],
          miner: `0x${"00".repeat(20)}`,
          difficulty: "0x0",
          extraData: "0x",
          logsBloom: `0x${"00".repeat(256)}`,
          nonce: "0x0000000000000000",
          size: "0x0",
          totalDifficulty: "0x0",
          uncles: [],
          sha3Uncles: `0x${"00".repeat(32)}`,
          stateRoot: `0x${"00".repeat(32)}`,
          receiptsRoot: `0x${"00".repeat(32)}`,
          transactionsRoot: `0x${"00".repeat(32)}`,
          mixHash: `0x${"00".repeat(32)}`,
        },
      };
    case "eth_getTransactionReceipt":
      return { result: receipts.get(String(req.params[0])) ?? null };
    case "eth_sendRawTransaction": {
      sends++;
      const hash = keccak256(req.params[0] as Hex);
      chainNonce++;
      receipts.set(hash, receipt(hash, "0x1"));
      return { result: hash };
    }
    case "eth_sendRawTransactionSync": {
      if (mode === "no-sync") return { error: { code: -32601, message: "Method not found" } };
      sends++;
      const raw = req.params[0] as Hex;
      const hash = keccak256(raw);
      if (mode === "reject") return { error: { code: -32000, message: "insufficient funds for gas * price + value" } };
      if (mode === "revert") {
        chainNonce++;
        const r = receipt(hash, "0x0");
        receipts.set(hash, r);
        return { result: r };
      }
      if (mode === "drop-then-mine") {
        // The node accepted it and it lands shortly, but the connection dies before the response.
        chainNonce++;
        setTimeout(() => receipts.set(hash, receipt(hash, "0x1")), 200);
        return "drop";
      }
      if (mode === "stall-never-mine") return "stall";
      chainNonce++;
      const r = receipt(hash, "0x1");
      receipts.set(hash, r);
      return { result: r };
    }
    default:
      return { error: { code: -32601, message: `method not found: ${req.method}` } };
  }
}

let server: Server;
let url = "";

before(async () => {
  server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body);
    const batch = Array.isArray(parsed) ? parsed : [parsed];
    const out = [];
    for (const r of batch) {
      const h = await handle(r);
      if (h === "drop") return req.socket.destroy();
      if (h === "stall") return; // never answer; the client's timeout fires
      out.push({ jsonrpc: "2.0", id: r.id, ...h });
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(Array.isArray(parsed) ? out : out[0]));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // lib/chain.ts reads these at import time, so the modules under test are imported after this.
  process.env.NEXT_PUBLIC_CHAIN_ID = String(foundry.id);
  process.env.NEXT_PUBLIC_RPC_URL = url;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

async function sender(opts?: { receiptLookupMs?: number }) {
  const { FastSender } = await import("../lib/tx");
  const wallet = createWalletClient({
    account,
    chain: foundry,
    transport: http(url, { timeout: 400, retryCount: 0 }),
  });
  return new FastSender(account, wallet, { receiptLookupMs: 1_500, ...opts });
}

const req = {
  address: "0x000000000000000000000000000000000000c0de" as const,
  abi: [{ type: "function", name: "ping", inputs: [], outputs: [], stateMutability: "nonpayable" }] as const,
  functionName: "ping",
  args: [],
};

function reset(m: Mode) {
  mode = m;
  sends = 0;
}

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------
const HASH = `0x${"12".repeat(32)}` as Hex;
const fakeReceipt = (status: "success" | "reverted") => ({ status, transactionHash: HASH }) as TransactionReceipt;

test("timeouts and dropped connections are ambiguous; explicit rejections are not", async () => {
  const { isAmbiguousSendError } = await import("../lib/tx");
  assert.equal(isAmbiguousSendError(new TimeoutError({ body: {}, url: "x" })), true);
  assert.equal(isAmbiguousSendError(new HttpRequestError({ url: "x", details: "fetch failed" })), true);
  assert.equal(isAmbiguousSendError({ code: 4, message: "transaction not included in time" }), true);
  assert.equal(isAmbiguousSendError(new Error("insufficient funds for gas * price + value")), false);
  assert.equal(isAmbiguousSendError(new Error("execution reverted: MarketClosed")), false);
});

test("an ambiguous failure whose transaction lands returns the real receipt", async () => {
  const { receiptAfterSendError } = await import("../lib/tx");
  let calls = 0;
  const r = await receiptAfterSendError(
    HASH,
    new TimeoutError({ body: {}, url: "x" }),
    async () => (++calls >= 3 ? fakeReceipt("success") : null),
    { lookupMs: 2_000, intervalMs: 10 },
  );
  assert.equal(r.status, "success");
  assert.equal(calls, 3);
});

test("an ambiguous failure that never resolves is reported as unknown, with the hash", async () => {
  const { receiptAfterSendError, TxStatusUnknownError } = await import("../lib/tx");
  const started = Date.now();
  await assert.rejects(
    receiptAfterSendError(HASH, new TimeoutError({ body: {}, url: "x" }), async () => null, {
      lookupMs: 200,
      intervalMs: 20,
    }),
    (e: unknown) => e instanceof TxStatusUnknownError && e.hash === HASH,
  );
  assert.ok(Date.now() - started < 1_000, "polling is bounded");
});

test("a clear rejection is rethrown after a single lookup", async () => {
  const { receiptAfterSendError } = await import("../lib/tx");
  const rejection = new Error("insufficient funds for gas * price + value");
  let calls = 0;
  await assert.rejects(
    receiptAfterSendError(HASH, rejection, async () => (calls++, null), { lookupMs: 5_000 }),
    (e: unknown) => e === rejection,
  );
  assert.equal(calls, 1);
});

test("a reverted receipt found after a failure is returned as a revert, not a success", async () => {
  const { receiptAfterSendError } = await import("../lib/tx");
  const r = await receiptAfterSendError(HASH, new TimeoutError({ body: {}, url: "x" }), async () =>
    fakeReceipt("reverted"),
  );
  assert.equal(r.status, "reverted");
});

// ---------------------------------------------------------------------------
// FastSender against the mock node
// ---------------------------------------------------------------------------
test("FastSender: connection dropped after broadcast, transaction lands → confirmed, nonce advances", async () => {
  const s = await sender();
  try {
    reset("drop-then-mine");
    const n0 = chainNonce;
    const { receipt } = await s.write(req);
    assert.equal(receipt.status, "success");
    assert.equal(sends, 1, "no second transaction was sent");
    reset("ok");
    await s.write(req);
    assert.equal(chainNonce, n0 + 2, "next call used the following nonce");
  } finally {
    s.stop();
  }
});

test("FastSender: send stalls and never lands → TxStatusUnknownError, no resend", async () => {
  const { TxStatusUnknownError } = await import("../lib/tx");
  const s = await sender({ receiptLookupMs: 600 });
  try {
    reset("stall-never-mine");
    await assert.rejects(
      s.write(req),
      (e: unknown) => e instanceof TxStatusUnknownError && /^0x[0-9a-f]{64}$/.test(e.hash),
    );
    assert.equal(sends, 1, "the stake was not resent");
  } finally {
    s.stop();
  }
});

test("FastSender: mined but reverted → TxRevertedError, never success", async () => {
  const { TxRevertedError } = await import("../lib/tx");
  const s = await sender();
  try {
    reset("revert");
    await assert.rejects(s.write(req), (e: unknown) => e instanceof TxRevertedError);
  } finally {
    s.stop();
  }
});

test("FastSender: node rejects the transaction → original error, quickly", async () => {
  const { TxStatusUnknownError, TxRevertedError } = await import("../lib/tx");
  const s = await sender({ receiptLookupMs: 5_000 });
  try {
    reset("reject");
    const started = Date.now();
    await assert.rejects(
      s.write(req),
      (e: unknown) => !(e instanceof TxStatusUnknownError) && !(e instanceof TxRevertedError),
    );
    assert.ok(Date.now() - started < 2_000, "no long polling for a definite rejection");
  } finally {
    s.stop();
  }
});

test("FastSender: a node without eth_sendRawTransactionSync still falls back to the async send", async () => {
  const s = await sender();
  try {
    reset("no-sync");
    const { receipt } = await s.write(req);
    assert.equal(receipt.status, "success");
    assert.equal(sends, 1, "sent exactly once via eth_sendRawTransaction");
  } finally {
    s.stop();
  }
});

test("an empty gas tank is explained, not reported as invalid parameters", async () => {
  const { describeTxError } = await import("../lib/tx");
  const { InvalidInputRpcError } = await import("viem");
  const raw = new InvalidInputRpcError(
    Object.assign(new Error("insufficient balance"), { details: "insufficient balance" }),
  );
  assert.match(raw.shortMessage, /Missing or invalid parameters/);
  assert.match(describeTxError(raw), /Not enough MON to pay for gas/);
  assert.match(describeTxError(new Error("insufficient funds for gas * price + value")), /Not enough MON/);
  assert.doesNotMatch(describeTxError(new Error("user rejected")), /MON/);
});
