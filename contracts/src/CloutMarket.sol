// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {CloutPoints} from "./CloutPoints.sol";

/// @dev Chainlink CRE consumer interface. The KeystoneForwarder delivers signed workflow reports here.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @title CloutMarket
/// @notice Parimutuel "hype markets" on public creator metrics. Each market asks one question:
/// will this YouTube video have at least `threshold` views at `resolveTime`?
/// Players stake non-transferable CloutPoints on YES or NO. Winners split the losing pool
/// pro-rata. Markets read only public counters; nobody buys or sells a stake in a creator.
///
/// Sealed calls: a player can commit `keccak256(chainid, market, id, player, side, salt)` so nobody
/// (including their duel rival) can copy the pick. The salt is derived client-side from a dedicated
/// passkey PRF namespace, so the same passkey can reveal from any device. Unrevealed sealed stakes are
/// forfeited to the winners at settlement.
///
/// Settlement comes from an allow-listed resolver or from a Chainlink CRE workflow report.
contract CloutMarket is IReceiver, IERC165 {
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
        uint128 sealedPool;
    }

    struct Position {
        uint128 yes;
        uint128 no;
        uint128 sealedStake;
        bytes32 commitment;
        bool revealed;
        bool claimed;
    }

    uint256 public constant MIN_CALL = 10;
    uint256 public constant MAX_CALL = 10_000;
    uint256 public constant MIN_DURATION = 5 minutes;
    uint256 public constant MAX_DURATION = 30 days;
    /// @notice Minimum gap between calls closing and settlement, so sealed calls can be revealed.
    uint256 public constant REVEAL_WINDOW = 2 minutes;

    CloutPoints public immutable points;
    address public owner;
    mapping(address => bool) public isResolver;
    /// @notice Chainlink CRE KeystoneForwarder allowed to deliver resolution reports.
    address public forwarder;
    /// @notice If non-zero, only reports from this CRE workflow id are accepted.
    bytes32 public expectedWorkflowId;

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
    event SealedCallCommitted(
        uint256 indexed marketId,
        address indexed player,
        bytes32 commitment,
        uint256 amount,
        address indexed rival
    );
    event SealedCallRevealed(uint256 indexed marketId, address indexed player, Side side, uint256 amount);
    event Resolved(uint256 indexed marketId, uint64 finalViews, Side outcome);
    event Voided(uint256 indexed marketId);
    event Claimed(uint256 indexed marketId, address indexed player, uint256 staked, uint256 payout);
    event ResolverSet(address indexed resolver, bool allowed);
    event ForwarderSet(address indexed forwarder, bytes32 expectedWorkflowId);
    event ReportReceived(
        uint256 indexed marketId, bytes32 indexed workflowId, uint64 finalViews, bool voided
    );
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
    error AlreadyCommitted();
    error NoCommitment();
    error AlreadyRevealed();
    error BadReveal();
    error NotForwarder();
    error WrongWorkflow();

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

    /// @notice Wire a Chainlink CRE forwarder (MockKeystoneForwarder for simulation,
    /// KeystoneForwarder in production). Zero disables CRE settlement.
    function setForwarder(address forwarder_, bytes32 expectedWorkflowId_) external onlyOwner {
        forwarder = forwarder_;
        expectedWorkflowId = expectedWorkflowId_;
        emit ForwarderSet(forwarder_, expectedWorkflowId_);
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
            closeTime < block.timestamp + MIN_DURATION || resolveTime < closeTime + REVEAL_WINDOW
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
                noPool: 0,
                sealedPool: 0
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

    /// @notice Make a sealed call: stake now, reveal the side later. One sealed call per market.
    /// @param commitment `sealedCommitment(marketId, player, side, salt)`.
    function commitCall(uint256 marketId, bytes32 commitment, uint256 amount, address rival) external {
        Market storage m = _market(marketId);
        if (m.status != Status.Open || block.timestamp >= m.closeTime) revert MarketClosed();
        if (amount < MIN_CALL || amount > MAX_CALL) revert InvalidAmount();
        Position storage p = _positions[marketId][msg.sender];
        if (p.commitment != bytes32(0)) revert AlreadyCommitted();

        points.marketTransfer(msg.sender, address(this), amount);
        _registerPlayer(msg.sender);

        p.commitment = commitment;
        p.sealedStake = uint128(amount);
        m.sealedPool += uint128(amount);
        emit SealedCallCommitted(
            marketId, msg.sender, commitment, amount, rival == msg.sender ? address(0) : rival
        );
    }

    /// @notice Reveal a sealed call. Allowed any time before the market settles.
    function revealCall(uint256 marketId, Side side, bytes32 salt) external {
        Market storage m = _market(marketId);
        if (m.status != Status.Open) revert MarketNotOpen();
        Position storage p = _positions[marketId][msg.sender];
        if (p.commitment == bytes32(0)) revert NoCommitment();
        if (p.revealed) revert AlreadyRevealed();
        if (side != Side.Yes && side != Side.No) revert InvalidSide();
        if (sealedCommitment(marketId, msg.sender, side, salt) != p.commitment) revert BadReveal();

        uint128 amount = p.sealedStake;
        p.revealed = true;
        m.sealedPool -= amount;
        if (side == Side.Yes) {
            m.yesPool += amount;
            p.yes += amount;
        } else {
            m.noPool += amount;
            p.no += amount;
        }
        emit SealedCallRevealed(marketId, msg.sender, side, amount);
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

        uint256 staked = _staked(p);
        if (staked == 0) revert NothingToClaim();
        payout = _payout(m, p);
        p.claimed = true;

        if (payout > 0) points.marketTransfer(address(this), msg.sender, payout);
        emit Claimed(marketId, msg.sender, staked, payout);
    }

    // ---------------------------------------------------------------------
    // Chainlink CRE
    // ---------------------------------------------------------------------

    /// @notice Receives a CRE workflow report: abi.encode(uint256 marketId, uint64 finalViews, bool voidMarket).
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (forwarder == address(0) || msg.sender != forwarder) revert NotForwarder();
        bytes32 workflowId;
        if (metadata.length >= 32) workflowId = bytes32(metadata[0:32]);
        if (expectedWorkflowId != bytes32(0) && workflowId != expectedWorkflowId) revert WrongWorkflow();

        (uint256 marketId, uint64 finalViews, bool voidIt) = abi.decode(report, (uint256, uint64, bool));
        if (voidIt) {
            Market storage m = _market(marketId);
            if (m.status != Status.Open) revert MarketNotOpen();
            m.status = Status.Voided;
            emit Voided(marketId);
        } else {
            _resolve(marketId, finalViews);
        }
        emit ReportReceived(marketId, workflowId, finalViews, voidIt);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice The commitment a sealed call must match. Bound to chain, contract, market and player.
    function sealedCommitment(uint256 marketId, address player, Side side, bytes32 salt)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), marketId, player, side, salt));
    }

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

    /// @dev Everything a player has at risk in a market, including an unrevealed sealed call.
    function _staked(Position storage p) internal view returns (uint256) {
        return uint256(p.yes) + uint256(p.no) + (p.revealed ? 0 : uint256(p.sealedStake));
    }

    function _payout(Market storage m, Position storage p) internal view returns (uint256) {
        if (m.status == Status.Voided) return _staked(p);

        uint256 revealedStake = uint256(p.yes) + uint256(p.no);
        uint256 winPool = m.outcome == Side.Yes ? m.yesPool : m.noPool;
        // Unrevealed sealed stakes are forfeited to the winners.
        uint256 losePool = (m.outcome == Side.Yes ? m.noPool : m.yesPool) + m.sealedPool;
        // Nobody called it right: revealed stakes come back.
        if (winPool == 0) return revealedStake;

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
