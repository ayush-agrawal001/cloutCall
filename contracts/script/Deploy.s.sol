// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CloutPoints} from "../src/CloutPoints.sol";
import {CloutMarket} from "../src/CloutMarket.sol";

/// @notice Deploys CloutPoints + CloutMarket and records addresses in ../deployments/<chainId>.json.
///
/// Env:
///   RESOLVER_ADDRESS  account allowed to settle markets (defaults to the deployer)
///   CRE_FORWARDER     optional Chainlink CRE (Mock)KeystoneForwarder for report-based settlement
contract Deploy is Script {
    function run() external returns (CloutPoints points, CloutMarket market) {
        address deployer = msg.sender;
        address resolver = vm.envOr("RESOLVER_ADDRESS", deployer);
        address forwarder = vm.envOr("CRE_FORWARDER", address(0));

        vm.startBroadcast();
        points = new CloutPoints();
        market = new CloutMarket(points, resolver);
        points.setMarket(address(market));
        if (forwarder != address(0)) market.setForwarder(forwarder, bytes32(0));
        vm.stopBroadcast();

        console2.log("CloutPoints:", address(points));
        console2.log("CloutMarket:", address(market));
        console2.log("Resolver:   ", resolver);
        console2.log("Forwarder:  ", forwarder);

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "startBlock", block.number);
        vm.serializeAddress(key, "points", address(points));
        vm.serializeAddress(key, "resolver", resolver);
        vm.serializeAddress(key, "forwarder", forwarder);
        string memory json = vm.serializeAddress(key, "market", address(market));
        vm.writeJson(
            json, string.concat(vm.projectRoot(), "/../deployments/", vm.toString(block.chainid), ".json")
        );
    }
}
