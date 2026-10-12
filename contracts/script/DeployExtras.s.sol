// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CloutMarket} from "../src/CloutMarket.sol";
import {AgentJournal} from "../src/AgentJournal.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";

/// @notice Adds AgentJournal (AI rival picks) and CreatorRegistry (verified creators) next to an existing
/// CloutMarket and records them in ../deployments/<chainId>.json.
///
/// Env:
///   AGENT_ADDRESS     the AI rival's account (allowed to write to the journal)
///   VERIFIER_ADDRESS  attests creator channel links (defaults to the deployer)
contract DeployExtras is Script {
    function run() external returns (AgentJournal journal, CreatorRegistry registry) {
        string memory path =
            string.concat(vm.projectRoot(), "/../deployments/", vm.toString(block.chainid), ".json");
        string memory existing = vm.readFile(path);
        address market = vm.parseJsonAddress(existing, ".market");
        address agent = vm.envAddress("AGENT_ADDRESS");
        address verifier = vm.envOr("VERIFIER_ADDRESS", msg.sender);

        vm.startBroadcast();
        journal = new AgentJournal(CloutMarket(market));
        journal.setAgent(agent, true);
        registry = new CreatorRegistry(verifier);
        vm.stopBroadcast();

        console2.log("AgentJournal:   ", address(journal));
        console2.log("CreatorRegistry:", address(registry));

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "startBlock", vm.parseJsonUint(existing, ".startBlock"));
        vm.serializeAddress(key, "points", vm.parseJsonAddress(existing, ".points"));
        vm.serializeAddress(key, "resolver", vm.parseJsonAddress(existing, ".resolver"));
        vm.serializeAddress(key, "forwarder", vm.parseJsonAddress(existing, ".forwarder"));
        vm.serializeAddress(key, "market", market);
        vm.serializeAddress(key, "agent", agent);
        vm.serializeAddress(key, "journal", address(journal));
        vm.serializeAddress(key, "verifier", verifier);
        string memory json = vm.serializeAddress(key, "registry", address(registry));
        vm.writeJson(json, path);
    }
}
