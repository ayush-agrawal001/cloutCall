// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CloutMarket} from "../src/CloutMarket.sol";

/// @notice LOCAL DEVELOPMENT ONLY: opens a few markets on well-known videos with placeholder
/// baselines so the UI has something to render on anvil. Real markets are created by
/// `resolver/` (`npm run create-market`), which reads live view counts from the YouTube Data API.
contract SeedDemo is Script {
    function run() external {
        CloutMarket market = CloutMarket(vm.envAddress("MARKET_ADDRESS"));
        string[3] memory videos = ["dQw4w9WgXcQ", "9bZkp7q19f0", "kJQP7kiw5Fk"];
        uint64[3] memory baselines = [uint64(1_700_000_000), 5_600_000_000, 8_900_000_000];

        vm.startBroadcast();
        for (uint256 i = 0; i < videos.length; i++) {
            uint64 close = uint64(block.timestamp + 1 hours);
            uint256 id = market.createMarket(
                videos[i], baselines[i] + baselines[i] / 1000, baselines[i], close, close + 1 hours
            );
            console2.log("market", id, videos[i]);
        }
        vm.stopBroadcast();
    }
}
