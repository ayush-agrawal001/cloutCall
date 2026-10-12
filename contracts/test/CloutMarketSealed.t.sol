// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {CloutPoints} from "../src/CloutPoints.sol";
import {CloutMarket, IReceiver, IERC165} from "../src/CloutMarket.sol";

contract CloutMarketSealedTest is Test {
    CloutPoints points;
    CloutMarket market;

    address resolver = makeAddr("resolver");
    address forwarder = makeAddr("forwarder");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    bytes32 constant SALT = keccak256("alice-sealed-salt");

    function setUp() public {
        vm.warp(1_790_000_000);
        points = new CloutPoints();
        market = new CloutMarket(points, resolver);
        points.setMarket(address(market));
        address[3] memory players = [alice, bob, carol];
        for (uint256 i = 0; i < players.length; i++) {
            vm.prank(players[i]);
            points.claimStarter();
        }
    }

    function _create() internal returns (uint256) {
        return market.createMarket(
            "dQw4w9WgXcQ",
            1_000_000,
            800_000,
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 2 hours)
        );
    }

    function test_resolveTimeMustLeaveRevealWindow() public {
        vm.expectRevert(CloutMarket.InvalidTimes.selector);
        market.createMarket(
            "dQw4w9WgXcQ",
            1,
            0,
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 1 hours + 1 minutes)
        );
    }

    function test_sealedCallHidesSideUntilReveal() public {
        uint256 id = _create();
        bytes32 c = market.sealedCommitment(id, alice, CloutMarket.Side.Yes, SALT);

        vm.prank(alice);
        market.commitCall(id, c, 400, bob);
        CloutMarket.Market memory m = market.getMarket(id);
        assertEq(m.sealedPool, 400);
        assertEq(m.yesPool, 0);
        assertEq(points.balanceOf(alice), 600);

        vm.prank(alice);
        vm.expectRevert(CloutMarket.AlreadyCommitted.selector);
        market.commitCall(id, c, 100, address(0));

        // Calls close; reveal still allowed until settlement.
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(alice);
        vm.expectRevert(CloutMarket.BadReveal.selector);
        market.revealCall(id, CloutMarket.Side.No, SALT);

        vm.prank(alice);
        market.revealCall(id, CloutMarket.Side.Yes, SALT);
        m = market.getMarket(id);
        assertEq(m.sealedPool, 0);
        assertEq(m.yesPool, 400);

        vm.prank(alice);
        vm.expectRevert(CloutMarket.AlreadyRevealed.selector);
        market.revealCall(id, CloutMarket.Side.Yes, SALT);
    }

    function test_commitmentIsBoundToPlayer() public {
        uint256 id = _create();
        bytes32 c = market.sealedCommitment(id, alice, CloutMarket.Side.Yes, SALT);
        // Bob copies Alice's commitment but cannot reveal it as his own.
        vm.prank(bob);
        market.commitCall(id, c, 100, address(0));
        vm.prank(bob);
        vm.expectRevert(CloutMarket.BadReveal.selector);
        market.revealCall(id, CloutMarket.Side.Yes, SALT);
    }

    function test_unrevealedStakesGoToWinners() public {
        uint256 id = _create();
        bytes32 commitment = market.sealedCommitment(id, alice, CloutMarket.Side.No, SALT);
        vm.prank(alice);
        market.commitCall(id, commitment, 300, address(0));
        vm.prank(bob);
        market.call(id, CloutMarket.Side.Yes, 100, address(0));
        vm.prank(carol);
        market.call(id, CloutMarket.Side.No, 100, address(0));

        vm.warp(block.timestamp + 2 hours);
        vm.prank(resolver);
        market.resolve(id, 2_000_000); // YES; alice never revealed

        vm.prank(bob);
        assertEq(market.claim(id), 500); // 100 + 100 * (100 no + 300 forfeited) / 100
        vm.prank(alice);
        assertEq(market.claim(id), 0);
        vm.prank(carol);
        assertEq(market.claim(id), 0);
        assertEq(points.balanceOf(address(market)), 0);

        vm.prank(alice);
        vm.expectRevert(CloutMarket.MarketNotOpen.selector);
        market.revealCall(id, CloutMarket.Side.No, SALT);
    }

    function test_voidRefundsUnrevealedSealedStake() public {
        uint256 id = _create();
        bytes32 commitment = market.sealedCommitment(id, alice, CloutMarket.Side.No, SALT);
        vm.prank(alice);
        market.commitCall(id, commitment, 300, address(0));
        vm.prank(resolver);
        market.voidMarket(id);
        vm.prank(alice);
        assertEq(market.claim(id), 300);
    }

    function test_sealedWinnerIsPaid() public {
        uint256 id = _create();
        bytes32 commitment = market.sealedCommitment(id, alice, CloutMarket.Side.No, SALT);
        vm.prank(alice);
        market.commitCall(id, commitment, 200, address(0));
        vm.prank(bob);
        market.call(id, CloutMarket.Side.Yes, 200, alice);
        vm.warp(block.timestamp + 1 hours + 30);
        vm.prank(alice);
        market.revealCall(id, CloutMarket.Side.No, SALT);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(resolver);
        market.resolve(id, 10);
        vm.prank(alice);
        assertEq(market.claim(id), 400);
    }

    // ---------------------------------------------------------------- CRE

    function test_supportsCreReceiverInterface() public view {
        assertTrue(market.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(market.supportsInterface(type(IERC165).interfaceId));
        assertFalse(market.supportsInterface(0xdeadbeef));
    }

    function test_creReportResolves() public {
        uint256 id = _create();
        vm.prank(alice);
        market.call(id, CloutMarket.Side.Yes, 100, address(0));

        bytes memory report = abi.encode(id, uint64(1_500_000), false);
        bytes memory metadata =
            abi.encodePacked(bytes32("wf-id"), bytes10("cloutcall"), address(this), bytes2(0));

        vm.expectRevert(CloutMarket.NotForwarder.selector);
        market.onReport(metadata, report); // forwarder not configured

        market.setForwarder(forwarder, bytes32(0));
        vm.prank(alice);
        vm.expectRevert(CloutMarket.NotForwarder.selector);
        market.onReport(metadata, report);

        vm.prank(forwarder);
        vm.expectRevert(CloutMarket.TooEarly.selector);
        market.onReport(metadata, report);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(forwarder);
        market.onReport(metadata, report);
        CloutMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.status), uint8(CloutMarket.Status.Resolved));
        assertEq(m.finalViews, 1_500_000);
        assertEq(uint8(m.outcome), uint8(CloutMarket.Side.Yes));
    }

    function test_creReportCanVoidAndChecksWorkflowId() public {
        uint256 id = _create();
        market.setForwarder(forwarder, bytes32("wf-good"));
        bytes memory report = abi.encode(id, uint64(0), true);

        vm.prank(forwarder);
        vm.expectRevert(CloutMarket.WrongWorkflow.selector);
        market.onReport(abi.encodePacked(bytes32("wf-evil"), bytes10("x"), address(0), bytes2(0)), report);

        vm.prank(forwarder);
        market.onReport(abi.encodePacked(bytes32("wf-good"), bytes10("x"), address(0), bytes2(0)), report);
        assertEq(uint8(market.getMarket(id).status), uint8(CloutMarket.Status.Voided));
    }

    function test_onlyOwnerSetsForwarder() public {
        vm.prank(alice);
        vm.expectRevert(CloutMarket.NotOwner.selector);
        market.setForwarder(alice, bytes32(0));
    }
}
