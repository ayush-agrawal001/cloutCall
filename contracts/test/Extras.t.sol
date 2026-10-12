// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {CloutPoints} from "../src/CloutPoints.sol";
import {CloutMarket} from "../src/CloutMarket.sol";
import {AgentJournal} from "../src/AgentJournal.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";

contract AgentJournalTest is Test {
    CloutPoints points;
    CloutMarket market;
    AgentJournal journal;
    address agent = makeAddr("agent");
    uint256 id;

    function setUp() public {
        vm.warp(1_790_000_000);
        points = new CloutPoints();
        market = new CloutMarket(points, address(this));
        points.setMarket(address(market));
        journal = new AgentJournal(market);
        journal.setAgent(agent, true);
        vm.prank(agent);
        points.claimStarter();
        id = market.createMarket(
            "dQw4w9WgXcQ",
            2_000_000,
            1_000_000,
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 2 hours)
        );
    }

    function test_recordsPickMatchingStake() public {
        vm.startPrank(agent);
        market.call(id, CloutMarket.Side.Yes, 100, address(0));
        journal.record(id, CloutMarket.Side.Yes, 7200, 2_300_000, "kimi-k2.6", "Upload velocity is 40k/h");
        vm.stopPrank();

        AgentJournal.Pick memory p = journal.pickOf(id, agent);
        assertEq(uint8(p.side), uint8(CloutMarket.Side.Yes));
        assertEq(p.confidenceBps, 7200);
        assertEq(p.model, "kimi-k2.6");
    }

    function test_rejectsPickWithoutStakeOrFromNonAgent() public {
        vm.prank(agent);
        vm.expectRevert(AgentJournal.NoStakeOnSide.selector);
        journal.record(id, CloutMarket.Side.Yes, 5000, 0, "m", "r");

        vm.prank(agent);
        market.call(id, CloutMarket.Side.No, 100, address(0));
        vm.prank(agent);
        vm.expectRevert(AgentJournal.NoStakeOnSide.selector);
        journal.record(id, CloutMarket.Side.Yes, 5000, 0, "m", "r"); // staked NO, claims YES

        vm.expectRevert(AgentJournal.NotAgent.selector);
        journal.record(id, CloutMarket.Side.No, 5000, 0, "m", "r");
    }

    function test_cannotRecordTwiceOrAfterClose() public {
        vm.startPrank(agent);
        market.call(id, CloutMarket.Side.No, 100, address(0));
        journal.record(id, CloutMarket.Side.No, 6000, 1_500_000, "m", "r");
        vm.expectRevert(AgentJournal.AlreadyRecorded.selector);
        journal.record(id, CloutMarket.Side.No, 6000, 1_500_000, "m", "r");
        vm.stopPrank();

        uint256 id2 = market.createMarket(
            "9bZkp7q19f0", 2, 1, uint64(block.timestamp + 1 hours), uint64(block.timestamp + 2 hours)
        );
        vm.prank(agent);
        market.call(id2, CloutMarket.Side.Yes, 100, address(0));
        vm.warp(block.timestamp + 1 hours);
        vm.prank(agent);
        vm.expectRevert(AgentJournal.MarketClosed.selector);
        journal.record(id2, CloutMarket.Side.Yes, 6000, 3, "m", "r");
    }

    function test_rejectsOversizedInput() public {
        vm.prank(agent);
        market.call(id, CloutMarket.Side.Yes, 100, address(0));
        vm.prank(agent);
        vm.expectRevert(AgentJournal.BadInput.selector);
        journal.record(id, CloutMarket.Side.Yes, 10_001, 0, "m", "r");
    }
}

contract CreatorRegistryTest is Test {
    CreatorRegistry reg;
    address verifier = makeAddr("verifier");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    string constant CH = "UCuAXFkgsw1L7xaCfnd5JJOw";

    function setUp() public {
        reg = new CreatorRegistry(verifier);
    }

    function test_attestLinksBothWays() public {
        vm.prank(verifier);
        reg.attest(alice, CH, "Rick Astley");
        assertEq(reg.creatorOf(CH), alice);
        assertEq(reg.channelOf(alice), CH);
    }

    function test_onlyVerifierAttests() public {
        vm.expectRevert(CreatorRegistry.NotVerifier.selector);
        reg.attest(alice, CH, "x");
        vm.prank(verifier);
        vm.expectRevert(CreatorRegistry.BadChannel.selector);
        reg.attest(alice, "short", "x");
    }

    function test_relinkMovesChannelAndCreatorCanUnlink() public {
        vm.startPrank(verifier);
        reg.attest(alice, CH, "x");
        reg.attest(bob, CH, "x");
        vm.stopPrank();
        assertEq(reg.creatorOf(CH), bob);
        assertEq(bytes(reg.channelOf(alice)).length, 0);

        vm.prank(bob);
        reg.unlink();
        assertEq(reg.creatorOf(CH), address(0));
        assertEq(bytes(reg.channelOf(bob)).length, 0);
    }
}
