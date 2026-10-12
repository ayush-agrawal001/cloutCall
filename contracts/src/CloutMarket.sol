// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {CloutPoints} from "./CloutPoints.sol";

/// @title CloutMarket
/// @notice Parimutuel "hype markets" on public creator metrics. Each market asks one question:
/// will this YouTube video have at least `threshold` views at `resolveTime`?
/// Players stake non-transferable CloutPoints on YES or NO. Winners split the losing pool
/// pro-rata. Markets read only public counters; nobody buys or sells a stake in a creator.
contract CloutMarket {
    enum Side {
        None,
        Yes,
        No
    }

    enum Status {
        Open,
        Resolved,
        Voided
    }

    struct Market {
        string videoId;
        address creator;
        uint64 threshold;
        uint64 baselineViews;
        uint64 closeTime;
        uint64 resolveTime;
        uint64 finalViews;
        Status status;
        Side outcome;
        uint128 yesPool;
        uint128 noPool;
    }

    struct Position {
        uint128 yes;
        uint128 no;
        bool claimed;
    }

    uint256 public constant MIN_CALL = 10;
    uint256 public constant MAX_CALL = 10_000;
    uint256 public constant MIN_DURATION = 5 minutes;
    uint256 public constant MAX_DURATION = 30 days;

    CloutPoints public immutable points;
    address public owner;
    mapping(address => bool) public isResolver;

    Market[] internal _markets;
    mapping(uint256 => mapping(address => Position)) internal _positions;

    address[] internal _players;
    mapping(address => bool) public isPlayer;

    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        string videoId,
        uint64 threshold,
        uint64 baselineViews,
        uint64 closeTime,
        uint64 resolveTime
    );
    event Called(
        uint256 indexed marketId, address indexed player, Side side, uint256 amount, address indexed rival
    );
    event Resolved(uint256 indexed marketId, uint64 finalViews, Side outcome);
    event Voided(uint256 indexed marketId);
    event Claimed(uint256 indexed marketId, address indexed player, uint256 staked, uint256 payout);
    event ResolverSet(address indexed resolver, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotResolver();
    error InvalidVideoId();
    error InvalidTimes();
    error InvalidSide();
    error InvalidAmount();
    error UnknownMarket();
    error MarketClosed();
    error MarketNotOpen();
    error TooEarly();
    error NotSettled();
    error AlreadyClaimed();
    error NothingToClaim();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyResolver() {
        if (!isResolver[msg.sender]) revert NotResolver();
        _;
    }

    constructor(CloutPoints points_, address resolver) {
        points = points_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        isResolver[resolver] = true;
        emit ResolverSet(resolver, true);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setResolver(address resolver, bool allowed) external onlyOwner {
        isResolver[resolver] = allowed;
        emit ResolverSet(resolver, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ---------------------------------------------------------------------
    // Markets
    // ---------------------------------------------------------------------

    /// @notice Opens a market on a YouTube video. Anyone can create one; only resolvers settle.
    /// @param videoId The 11-character YouTube video id.
    /// @param threshold View count the video must reach for YES to win.
    /// @param baselineViews View count when the market was created (for display and indexing).
    function createMarket(
        string calldata videoId,
        uint64 threshold,
        uint64 baselineViews,
        uint64 closeTime,
        uint64 resolveTime
    ) external returns (uint256 marketId) {
        if (bytes(videoId).length != 11) revert InvalidVideoId();
        if (
            closeTime < block.timestamp + MIN_DURATION || resolveTime < closeTime
                || resolveTime > block.timestamp + MAX_DURATION
        ) revert InvalidTimes();

        marketId = _markets.length;
        _markets.push(
            Market({
                videoId: videoId,
                creator: msg.sender,
                threshold: threshold,
                baselineViews: baselineViews,
                closeTime: closeTime,
                resolveTime: resolveTime,
                finalViews: 0,
                status: Status.Open,
                outcome: Side.None,
                yesPool: 0,
                noPool: 0
            })
        );
        emit MarketCreated(marketId, msg.sender, videoId, threshold, baselineViews, closeTime, resolveTime);
    }

    /// @notice Make an open call. `rival` is the player whose duel link brought you here (or zero).
    function call(uint256 marketId, Side side, uint256 amount, address rival) external {
        Market storage m = _market(marketId);
        if (m.status != Status.Open || block.timestamp >= m.closeTime) revert MarketClosed();
        if (side != Side.Yes && side != Side.No) revert InvalidSide();
        if (amount < MIN_CALL || amount > MAX_CALL) revert InvalidAmount();

        points.marketTransfer(msg.sender, address(this), amount);
        _registerPlayer(msg.sender);

        Position storage p = _positions[marketId][msg.sender];
        if (side == Side.Yes) {
            m.yesPool += uint128(amount);
            p.yes += uint128(amount);
        } else {
            m.noPool += uint128(amount);
            p.no += uint128(amount);
        }
        emit Called(marketId, msg.sender, side, amount, rival == msg.sender ? address(0) : rival);
    }

    /// @notice Settles a market with the video's view count at (or after) `resolveTime`.
    function resolve(uint256 marketId, uint64 finalViews) external onlyResolver {
        _resolve(marketId, finalViews);
    }

    /// @notice Voids a market (e.g. the video was deleted or made private). Everyone is refunded.
    function voidMarket(uint256 marketId) external onlyResolver {
        Market storage m = _market(marketId);
        if (m.status != Status.Open) revert MarketNotOpen();
        m.status = Status.Voided;
        emit Voided(marketId);
    }

    /// @notice Collect winnings (or a refund) from a settled market.
    function claim(uint256 marketId) external returns (uint256 payout) {
        Market storage m = _market(marketId);
        if (m.status == Status.Open) revert NotSettled();
        Position storage p = _positions[marketId][msg.sender];
        if (p.claimed) revert AlreadyClaimed();

        uint256 staked = uint256(p.yes) + uint256(p.no);
        if (staked == 0) revert NothingToClaim();
        payout = _payout(m, p);
        p.claimed = true;

        if (payout > 0) points.marketTransfer(address(this), msg.sender, payout);
        emit Claimed(marketId, msg.sender, staked, payout);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _market(marketId);
    }

    /// @notice Returns markets newest-first, for feeds.
    function getMarkets(uint256 offset, uint256 limit)
        external
        view
        returns (Market[] memory page, uint256[] memory ids)
    {
        uint256 total = _markets.length;
        if (offset >= total) return (new Market[](0), new uint256[](0));
        uint256 n = total - offset < limit ? total - offset : limit;
        page = new Market[](n);
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 id = total - 1 - offset - i;
            page[i] = _markets[id];
            ids[i] = id;
        }
    }

    function positionOf(uint256 marketId, address player) external view returns (Position memory) {
        return _positions[marketId][player];
    }

    /// @notice What `player` would receive from `claim` right now (0 if unsettled).
    function claimable(uint256 marketId, address player) external view returns (uint256) {
        Market storage m = _market(marketId);
        Position storage p = _positions[marketId][player];
        if (m.status == Status.Open || p.claimed) return 0;
        return _payout(m, p);
    }

    function playerCount() external view returns (uint256) {
        return _players.length;
    }

    function getPlayers(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory players, uint256[] memory balances)
    {
        uint256 total = _players.length;
        if (offset >= total) return (new address[](0), new uint256[](0));
        uint256 n = total - offset < limit ? total - offset : limit;
        players = new address[](n);
        balances = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            players[i] = _players[offset + i];
            balances[i] = points.balanceOf(players[i]);
        }
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _market(uint256 marketId) internal view returns (Market storage) {
        if (marketId >= _markets.length) revert UnknownMarket();
        return _markets[marketId];
    }

    function _resolve(uint256 marketId, uint64 finalViews) internal {
        Market storage m = _market(marketId);
        if (m.status != Status.Open) revert MarketNotOpen();
        if (block.timestamp < m.resolveTime) revert TooEarly();
        m.finalViews = finalViews;
        m.outcome = finalViews >= m.threshold ? Side.Yes : Side.No;
        m.status = Status.Resolved;
        emit Resolved(marketId, finalViews, m.outcome);
    }

    function _payout(Market storage m, Position storage p) internal view returns (uint256) {
        uint256 staked = uint256(p.yes) + uint256(p.no);
        if (m.status == Status.Voided) return staked;

        uint256 winPool = m.outcome == Side.Yes ? m.yesPool : m.noPool;
        uint256 losePool = m.outcome == Side.Yes ? m.noPool : m.yesPool;
        // Nobody called it right: everyone gets their stake back.
        if (winPool == 0) return staked;

        uint256 winStake = m.outcome == Side.Yes ? p.yes : p.no;
        return winStake + (winStake * losePool) / winPool;
    }

    function _registerPlayer(address player) internal {
        if (!isPlayer[player]) {
            isPlayer[player] = true;
            _players.push(player);
        }
    }
}
