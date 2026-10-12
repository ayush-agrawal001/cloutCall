// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title CloutPoints
/// @notice Non-transferable play-money points used to make calls in CloutCall.
/// Points cannot be sent between users and have no monetary value: the only way to
/// move them is by staking on a market and winning or losing. This keeps CloutCall a
/// game of skill and taste rather than a financial product.
contract CloutPoints {
    string public constant name = "CloutCall Points";
    string public constant symbol = "CLOUT";
    uint8 public constant decimals = 0;

    uint256 public constant STARTER_GRANT = 1_000;
    uint256 public constant REFILL_GRANT = 250;
    uint256 public constant REFILL_THRESHOLD = 50;
    uint256 public constant REFILL_COOLDOWN = 1 days;

    address public immutable owner;
    address public market;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => bool) public claimedStarter;
    mapping(address => uint256) public lastRefill;

    /// @dev ERC-20 compatible event so wallets and indexers can follow balances.
    event Transfer(address indexed from, address indexed to, uint256 value);
    event MarketSet(address indexed market);
    event Granted(address indexed player, uint256 amount, bool starter);

    error NotOwner();
    error NotMarket();
    error MarketAlreadySet();
    error AlreadyClaimed();
    error RefillUnavailable();
    error InsufficientPoints();
    error NonTransferable();

    constructor() {
        owner = msg.sender;
    }

    /// @notice One-time wiring of the market contract, the only address allowed to move points.
    function setMarket(address market_) external {
        if (msg.sender != owner) revert NotOwner();
        if (market != address(0)) revert MarketAlreadySet();
        market = market_;
        emit MarketSet(market_);
    }

    /// @notice Every new player gets a starter stack once.
    function claimStarter() external {
        if (claimedStarter[msg.sender]) revert AlreadyClaimed();
        claimedStarter[msg.sender] = true;
        _mint(msg.sender, STARTER_GRANT);
        emit Granted(msg.sender, STARTER_GRANT, true);
    }

    /// @notice Busted players can top up once per day so nobody is locked out of the game.
    function claimRefill() external {
        if (!claimedStarter[msg.sender]) revert RefillUnavailable();
        if (balanceOf[msg.sender] >= REFILL_THRESHOLD) revert RefillUnavailable();
        if (block.timestamp < lastRefill[msg.sender] + REFILL_COOLDOWN) revert RefillUnavailable();
        lastRefill[msg.sender] = block.timestamp;
        _mint(msg.sender, REFILL_GRANT);
        emit Granted(msg.sender, REFILL_GRANT, false);
    }

    /// @notice Moves points between a player and the market. Only callable by the market.
    function marketTransfer(address from, address to, uint256 amount) external {
        if (msg.sender != market) revert NotMarket();
        if (balanceOf[from] < amount) revert InsufficientPoints();
        unchecked {
            balanceOf[from] -= amount;
        }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function transfer(address, uint256) external pure returns (bool) {
        revert NonTransferable();
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        revert NonTransferable();
    }

    function approve(address, uint256) external pure returns (bool) {
        revert NonTransferable();
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
