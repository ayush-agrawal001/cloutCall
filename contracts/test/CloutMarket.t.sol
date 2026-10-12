// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {CloutPoints} from "../src/CloutPoints.sol";
import {CloutMarket} from "../src/CloutMarket.sol";

contract CloutMarketTest is Test {
    CloutPoints points;
    CloutMarket market;

    address resolver = makeAddr("resolver");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    string constant VIDEO = "dQw4w9WgXcQ";

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

    function _create() internal returns (uint256 id) {
        id = market.createMarket(
            VIDEO, 1_000_000, 800_000, uint64(block.timestamp + 1 hours), uint64(block.timestamp + 2 hours)
        );
    }

    function test_createMarketValidates() public {
        vm.expectRevert(CloutMarket.InvalidVideoId.selector);
        market.createMarket(
            "short", 1, 0, uint64(block.timestamp + 1 hours), uint64(block.timestamp + 1 hours)
        );

        vm.expectRevert(CloutMarket.InvalidTimes.selector);
        market.createMarket(
            VIDEO, 1, 0, uint64(block.timestamp + 1 minutes), uint64(block.timestamp + 1 hours)
        );

        vm.expectRevert(CloutMarket.InvalidTimes.selector);
        market.createMarket(VIDEO, 1, 0, uint64(block.timestamp + 2 hours), uint64(block.timestamp + 1 hours));

        uint256 id = _create();
        assertEq(id, 0);
        assertEq(market.marketCount(), 1);
        CloutMarket.Market memory m = market.getMarket(id);
        assertEq(m.videoId, VIDEO);
        assertEq(m.threshold, 1_000_000);
        assertEq(uint8(m.status), uint8(CloutMarket.Status.Open));
    }

    function test_callMovesPointsAndTracksPools() public {
        uint256 id = _create();
        vm.prank(alice);
        market.call(id, CloutMarket.Side.Yes, 300, address(0));
        vm.prank(bob);
        market.call(id, CloutMarket.Side.No, 100, alice);

        CloutMarket.Market memory m = market.getMarket(id);
        assertEq(m.yesPool, 300);
        assertEq(m.noPool, 100);
        assertEq(points.balanceOf(alice), 700);
        assertEq(points.balanceOf(address(market)), 400);
        assertEq(market.playerCount(), 2);
        assertEq(market.positionOf(id, bob).no, 100);
    }

    function test_callRejectsBadInput() public {
        uint256 id = _create();
        vm.startPrank(alice);
        vm.expectRevert(CloutMarket.InvalidSide.selector);
        market.call(id, CloutMarket.Side.None, 100, address(0));
        vm.expectRevert(CloutMarket.InvalidAmount.selector);
        market.call(id, CloutMarket.Side.Yes, 5, address(0));
        vm.expectRevert(CloutPoints.InsufficientPoints.selector);
        market.call(id, CloutMarket.Side.Yes, 5_000, address(0));
        vm.expectRevert(CloutMarket.UnknownMarket.selector);
        market.call(99, CloutMarket.Side.Yes, 100, address(0));
        vm.warp(block.timestamp + 1 hours);
        vm.expectRevert(CloutMarket.MarketClosed.selector);
        market.call(id, CloutMarket.Side.Yes, 100, address(0));
        vm.stopPrank();
    }

    function test_resolveAndClaimParimutuel() public {
        uint256 id = _create();
        vm.prank(alice);
        market.call(id, CloutMarket.Side.Yes, 300, address(0));
        vm.prank(carol);
        market.call(id, CloutMarket.Side.Yes, 100, address(0));
        vm.prank(bob);
        market.call(id, CloutMarket.Side.No, 200, alice);

        vm.prank(resolver);
        vm.expectRevert(CloutMarket.TooEarly.selector);
        market.resolve(id, 1_200_000);

        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(CloutMarket.NotResolver.selector);
        market.resolve(id, 1_200_000);

        vm.prank(resolver);
        market.resolve(id, 1_200_000);
        CloutMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.outcome), uint8(CloutMarket.Side.Yes));
        assertEq(m.finalViews, 1_200_000);

        assertEq(market.claimable(id, alice), 450); // 300 + 300*200/400
        assertEq(market.claimable(id, carol), 150); // 100 + 100*200/400
        assertEq(market.claimable(id, bob), 0);

        vm.prank(alice);
        assertEq(market.claim(id), 450);
        vm.prank(carol);
        market.claim(id);
        vm.prank(bob);
        assertEq(market.claim(id), 0);

        assertEq(points.balanceOf(alice), 1_150);
        assertEq(points.balanceOf(carol), 1_050);
        assertEq(points.balanceOf(bob), 800);
        assertEq(points.balanceOf(address(market)), 0);

        vm.prank(alice);
        vm.expectRevert(CloutMarket.AlreadyClaimed.selector);
        market.claim(id);
    }

    function test_noWinnersRefundsEveryone() public {
        uint256 id = _create();
        vm.prank(alice);
        market.call(id, CloutMarket.Side.No, 300, address(0));
        vm.warp(block.timestamp + 2 hours);
        vm.prank(resolver);
        market.resolve(id, 5_000_000); // YES wins, nobody on YES
        vm.prank(alice);
        assertEq(market.claim(id), 300);
    }

    function test_voidRefunds() public {
        uint256 id = _create();
        vm.prank(alice);
        market.call(id, CloutMarket.Side.Yes, 300, address(0));
        vm.prank(bob);
        market.call(id, CloutMarket.Side.No, 100, address(0));

        vm.prank(alice);
        vm.expectRevert(CloutMarket.NotSettled.selector);
        market.claim(id);

        vm.prank(resolver);
        market.voidMarket(id);
        vm.prank(alice);
        assertEq(market.claim(id), 300);
        vm.prank(bob);
        assertEq(market.claim(id), 100);

        vm.prank(resolver);
        vm.expectRevert(CloutMarket.MarketNotOpen.selector);
        market.resolve(id, 1);
    }

    function test_getMarketsNewestFirst() public {
        _create();
        _create();
        _create();
        (CloutMarket.Market[] memory page, uint256[] memory ids) = market.getMarkets(0, 2);
        assertEq(page.length, 2);
        assertEq(ids[0], 2);
        assertEq(ids[1], 1);
        (, ids) = market.getMarkets(2, 10);
        assertEq(ids.length, 1);
        assertEq(ids[0], 0);
        (page,) = market.getMarkets(5, 10);
        assertEq(page.length, 0);
    }

    function testFuzz_payoutsNeverExceedPot(uint16 a, uint16 b, uint16 c, bool yesWins) public {
        uint256 id = _create();
        uint256 sa = bound(a, 10, 1_000);
        uint256 sb = bound(b, 10, 1_000);
        uint256 sc = bound(c, 10, 1_000);
        vm.prank(alice);
        market.call(id, CloutMarket.Side.Yes, sa, address(0));
        vm.prank(bob);
        market.call(id, CloutMarket.Side.No, sb, address(0));
        vm.prank(carol);
        market.call(id, CloutMarket.Side.Yes, sc, address(0));

        vm.warp(block.timestamp + 2 hours);
        vm.prank(resolver);
        market.resolve(id, yesWins ? 2_000_000 : 1);

        vm.prank(alice);
        market.claim(id);
        vm.prank(bob);
        market.claim(id);
        vm.prank(carol);
        market.claim(id);
        // Rounding dust may remain, but the market can never be overdrawn.
        assertLe(points.balanceOf(address(market)), 2);
        assertEq(
            points.balanceOf(alice) + points.balanceOf(bob) + points.balanceOf(carol)
                + points.balanceOf(address(market)),
            3_000
        );
    }
}
