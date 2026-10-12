import { parseAbi } from "viem";

export const MARKET_ABI = parseAbi([
  "struct Market { string videoId; address creator; uint64 threshold; uint64 baselineViews; uint64 closeTime; uint64 resolveTime; uint64 finalViews; uint8 status; uint8 outcome; uint128 yesPool; uint128 noPool; uint128 sealedPool; }",
  "function getMarkets(uint256 offset, uint256 limit) view returns (Market[] page, uint256[] ids)",
]);
