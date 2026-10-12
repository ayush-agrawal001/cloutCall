import { describe, expect } from "bun:test";
import { TxStatus } from "@chainlink/cre-sdk";
import {
  addContractMock,
  EvmMock,
  HttpActionsMock,
  newTestRuntime,
  REPORT_METADATA_HEADER_LENGTH,
  test,
} from "@chainlink/cre-sdk/test";
import { bytesToHex, decodeAbiParameters } from "viem";
import { MARKET_ABI } from "./abi";
import { onCron } from "./main";

const MONAD_TESTNET = 2183018362218727504n;
const MARKET = "0x1111111111111111111111111111111111111111" as const;
const NOW = 1_800_000_000;

const config = {
  schedule: "0 */1 * * * *",
  chainSelectorName: "monad-testnet",
  isTestnet: true,
  marketAddress: MARKET,
  gasLimit: "300000",
  scanLimit: 100,
};

function market(videoId: string, resolveTime: number, status = 0) {
  return {
    videoId,
    creator: MARKET,
    threshold: 1_000_000n,
    baselineViews: 800_000n,
    closeTime: BigInt(resolveTime - 600),
    resolveTime: BigInt(resolveTime),
    finalViews: 0n,
    status,
    outcome: 0,
    yesPool: 100n,
    noPool: 50n,
    sealedPool: 0n,
  };
}

function setup(markets: ReturnType<typeof market>[], youtube: (url: string) => { status: number; body: unknown }) {
  const runtime = newTestRuntime(new Map([["main", new Map([["YOUTUBE_API_KEY", "test-key"]])]]), {
    timeProvider: () => NOW * 1000,
  }, config);
  const evm = EvmMock.testInstance(MONAD_TESTNET);
  const contract = addContractMock(evm, { address: MARKET, abi: MARKET_ABI });
  contract.getMarkets = () => [markets, markets.map((_, i) => BigInt(i))];
  const writes: `0x${string}`[] = [];
  contract.writeReport = (input) => {
    writes.push(bytesToHex(input.report.rawReport.slice(REPORT_METADATA_HEADER_LENGTH)));
    return { txStatus: TxStatus.SUCCESS };
  };
  const http = HttpActionsMock.testInstance();
  const urls: string[] = [];
  http.sendRequest = (req) => {
    urls.push(req.url);
    const r = youtube(req.url);
    return { statusCode: r.status, body: new TextEncoder().encode(JSON.stringify(r.body)) };
  };
  return { runtime, writes, urls };
}

const decode = (hex: `0x${string}`) =>
  decodeAbiParameters([{ type: "uint256" }, { type: "uint64" }, { type: "bool" }], hex);

describe("cloutcall-settle", () => {
  test("idles when nothing is due", () => {
    const { runtime, writes } = setup([market("dQw4w9WgXcQ", NOW + 60)], () => ({ status: 200, body: {} }));
    expect(onCron(runtime)).toBe("idle");
    expect(writes).toHaveLength(0);
  });

  test("settles the first due market with the consensus view count", () => {
    const { runtime, writes, urls } = setup(
      [market("aaaaaaaaaaa", NOW - 10, 1), market("dQw4w9WgXcQ", NOW - 5), market("bbbbbbbbbbb", NOW - 1)],
      () => ({ status: 200, body: { items: [{ statistics: { viewCount: "1234567" } }] } }),
    );
    expect(onCron(runtime)).toBe("settled 1");
    expect(urls[0]).toContain("id=dQw4w9WgXcQ");
    expect(urls[0]).toContain("key=test-key");
    expect(writes).toHaveLength(1);
    const [id, views, voided] = decode(writes[0]);
    expect(id).toBe(1n);
    expect(views).toBe(1_234_567n);
    expect(voided).toBe(false);
  });

  test("voids a market whose video disappeared", () => {
    const { runtime, writes } = setup([market("gone1234567", NOW - 5)], () => ({ status: 200, body: { items: [] } }));
    expect(onCron(runtime)).toBe("settled 0");
    const [id, views, voided] = decode(writes[0]);
    expect(id).toBe(0n);
    expect(views).toBe(0n);
    expect(voided).toBe(true);
  });
});
