// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {CloutPoints} from "../src/CloutPoints.sol";

contract CloutPointsTest is Test {
    CloutPoints points;
    address alice = makeAddr("alice");
    address market = makeAddr("market");

    function setUp() public {
        points = new CloutPoints();
        points.setMarket(market);
    }

    function test_claimStarterOnce() public {
        vm.prank(alice);
        points.claimStarter();
        assertEq(points.balanceOf(alice), 1_000);
        assertEq(points.totalSupply(), 1_000);

        vm.prank(alice);
        vm.expectRevert(CloutPoints.AlreadyClaimed.selector);
        points.claimStarter();
    }

    function test_transfersAreDisabled() public {
        vm.prank(alice);
        points.claimStarter();

        vm.startPrank(alice);
        vm.expectRevert(CloutPoints.NonTransferable.selector);
        points.transfer(makeAddr("bob"), 1);
        vm.expectRevert(CloutPoints.NonTransferable.selector);
        points.approve(makeAddr("bob"), 1);
        vm.expectRevert(CloutPoints.NonTransferable.selector);
        points.transferFrom(alice, makeAddr("bob"), 1);
        vm.stopPrank();
    }

    function test_onlyMarketMovesPoints() public {
        vm.prank(alice);
        points.claimStarter();

        vm.expectRevert(CloutPoints.NotMarket.selector);
        points.marketTransfer(alice, market, 10);

        vm.prank(market);
        points.marketTransfer(alice, market, 400);
        assertEq(points.balanceOf(alice), 600);
        assertEq(points.balanceOf(market), 400);

        vm.prank(market);
        vm.expectRevert(CloutPoints.InsufficientPoints.selector);
        points.marketTransfer(alice, market, 601);
    }

    function test_marketCanOnlyBeSetOnce() public {
        vm.expectRevert(CloutPoints.MarketAlreadySet.selector);
        points.setMarket(alice);
    }

    function test_refillWhenBustedWithCooldown() public {
        vm.prank(alice);
        vm.expectRevert(CloutPoints.RefillUnavailable.selector);
        points.claimRefill();

        vm.prank(alice);
        points.claimStarter();

        vm.prank(alice);
        vm.expectRevert(CloutPoints.RefillUnavailable.selector);
        points.claimRefill(); // still has 1000

        vm.prank(market);
        points.marketTransfer(alice, market, 980);

        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        points.claimRefill();
        assertEq(points.balanceOf(alice), 270);

        vm.prank(market);
        points.marketTransfer(alice, market, 260);
        vm.prank(alice);
        vm.expectRevert(CloutPoints.RefillUnavailable.selector);
        points.claimRefill(); // cooldown

        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        points.claimRefill();
        assertEq(points.balanceOf(alice), 260);
    }
}
