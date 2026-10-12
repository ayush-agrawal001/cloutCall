// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {CloutMarket} from "./CloutMarket.sol";

/// @title AgentJournal
/// @notice Public record of the AI rival's calls. Each entry is written while calls are still open and
/// must match a stake the agent actually holds on that side, so the AI can't rewrite history or
/// "predict" without skin in the game. Humans can then duel the AI on the same market.
contract AgentJournal {
    struct Pick {
        CloutMarket.Side side;
        uint16 confidenceBps;
        uint64 predictedViews;
        uint64 recordedAt;
        string model;
        string reasoning;
    }

    uint256 public constant MAX_REASONING = 560;

    CloutMarket public immutable market;
    address public owner;
    mapping(address => bool) public isAgent;
    mapping(uint256 => mapping(address => Pick)) internal _picks;

    event AgentSet(address indexed agent, bool allowed);
    event AgentPick(
        uint256 indexed marketId,
        address indexed agent,
        CloutMarket.Side side,
        uint16 confidenceBps,
        uint64 predictedViews,
        string model,
        string reasoning
    );

    error NotOwner();
    error NotAgent();
    error AlreadyRecorded();
    error MarketClosed();
    error NoStakeOnSide();
    error BadInput();

    constructor(CloutMarket market_) {
        market = market_;
        owner = msg.sender;
    }

    function setAgent(address agent, bool allowed) external {
        if (msg.sender != owner) revert NotOwner();
        isAgent[agent] = allowed;
        emit AgentSet(agent, allowed);
    }

    /// @notice Record the agent's pick for a market it has already called.
    function record(
        uint256 marketId,
        CloutMarket.Side side,
        uint16 confidenceBps,
        uint64 predictedViews,
        string calldata model,
        string calldata reasoning
    ) external {
        if (!isAgent[msg.sender]) revert NotAgent();
        if (side != CloutMarket.Side.Yes && side != CloutMarket.Side.No) revert BadInput();
        if (confidenceBps > 10_000 || bytes(reasoning).length > MAX_REASONING || bytes(model).length > 64) {
            revert BadInput();
        }
        if (_picks[marketId][msg.sender].recordedAt != 0) revert AlreadyRecorded();

        CloutMarket.Market memory m = market.getMarket(marketId);
        if (m.status != CloutMarket.Status.Open || block.timestamp >= m.closeTime) revert MarketClosed();
        CloutMarket.Position memory p = market.positionOf(marketId, msg.sender);
        if ((side == CloutMarket.Side.Yes ? p.yes : p.no) == 0) revert NoStakeOnSide();

        _picks[marketId][msg.sender] =
            Pick(side, confidenceBps, predictedViews, uint64(block.timestamp), model, reasoning);
        emit AgentPick(marketId, msg.sender, side, confidenceBps, predictedViews, model, reasoning);
    }

    function pickOf(uint256 marketId, address agent) external view returns (Pick memory) {
        return _picks[marketId][agent];
    }
}
