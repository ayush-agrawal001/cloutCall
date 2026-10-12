/**
 * CloutCall settlement workflow (Chainlink CRE).
 *
 * Every minute: read CloutMarket on Monad, pick the first market whose resolve time has passed, have
 * each DON node fetch the video's public view count from the YouTube Data API, agree on the median,
 * and deliver a signed report to CloutMarket.onReport via the KeystoneForwarder. A video that every
 * node finds missing (deleted/private) voids the market so stakes are refunded.
 *
 * Report payload: abi.encode(uint256 marketId, uint64 finalViews, bool voidMarket)
 */
import {
  bytesToHex,
  consensusMedianAggregation,
  CronCapability,
  EVMClient,
  encodeCallMsg,
  getNetwork,
  HTTPClient,
  type HTTPSendRequester,
  handler,
  json,
  LAST_FINALIZED_BLOCK_NUMBER,
  ok,
  prepareReportRequest,
  Runner,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import { type Address, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, zeroAddress } from "viem";
import { z } from "zod";
import { MARKET_ABI } from "./abi";

const configSchema = z.object({
  schedule: z.string(),
  chainSelectorName: z.string(),
  isTestnet: z.boolean(),
  marketAddress: z.string(),
  gasLimit: z.string(),
  scanLimit: z.number(),
});
type Config = z.infer<typeof configSchema>;

const MISSING = -1;

/** Runs on each node; the DON takes the median so one flaky node can't move the result. */
const fetchViews = (requester: HTTPSendRequester, videoId: string, apiKey: string): number => {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${apiKey}`;
  const res = requester.sendRequest({ url, method: "GET" }).result();
  if (!ok(res)) throw new Error(`YouTube API status ${res.statusCode}`);
  const body = json(res) as { items?: { statistics?: { viewCount?: string } }[] };
  const count = body.items?.[0]?.statistics?.viewCount;
  return count === undefined ? MISSING : Number(count);
};

export const onCron = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainSelectorName, isTestnet: cfg.isTestnet });
  if (!network) throw new Error(`unknown chain ${cfg.chainSelectorName}`);
  const evm = new EVMClient(network.chainSelector.selector);

  // 1. Find a market that is due.
  const read = evm
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: cfg.marketAddress as Address,
        data: encodeFunctionData({ abi: MARKET_ABI, functionName: "getMarkets", args: [0n, BigInt(cfg.scanLimit)] }),
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  const [page, ids] = decodeFunctionResult({ abi: MARKET_ABI, functionName: "getMarkets", data: bytesToHex(read.data) });

  const now = BigInt(Math.floor(runtime.now().getTime() / 1000));
  const i = page.findIndex((m) => m.status === 0 && m.resolveTime <= now);
  if (i < 0) {
    runtime.log("no market due");
    return "idle";
  }
  const marketId = ids[i];
  const videoId = page[i].videoId;
  runtime.log(`settling market ${marketId} (video ${videoId})`);

  // 2. Fetch the view count on every node and agree on the median.
  const apiKey = runtime.getSecret({ id: "YOUTUBE_API_KEY" }).result().value;
  const views = new HTTPClient()
    .sendRequest(runtime, fetchViews, consensusMedianAggregation())(videoId, apiKey)
    .result();
  const voidIt = views === MISSING;
  runtime.log(voidIt ? "video unavailable — voiding" : `consensus views: ${views}`);

  // 3. Sign a report and deliver it to CloutMarket.onReport through the forwarder.
  const payload = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint64" }, { type: "bool" }],
    [marketId, voidIt ? 0n : BigInt(Math.floor(views)), voidIt],
  );
  const report = runtime.report(prepareReportRequest(payload)).result();
  const res = evm
    .writeReport(runtime, { receiver: cfg.marketAddress, report, gasConfig: { gasLimit: cfg.gasLimit } })
    .result();
  if (res.txStatus !== TxStatus.SUCCESS) throw new Error(`writeReport failed: ${res.errorMessage ?? res.txStatus}`);
  return `settled ${marketId}`;
};

const initWorkflow = (config: Config) => [handler(new CronCapability().trigger({ schedule: config.schedule }), onCron)];

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
