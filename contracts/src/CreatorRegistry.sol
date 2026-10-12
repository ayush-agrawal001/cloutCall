// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title CreatorRegistry
/// @notice Links a YouTube channel to the passkey account of the person who controls it. A verifier
/// attests after the creator signs in with Google (YouTube read-only scope) and the account signs a
/// link message, so markets a creator hosts on their own uploads can carry a "verified creator" badge.
/// Creators opt in; nothing about a channel is ever tokenized.
contract CreatorRegistry {
    address public owner;
    mapping(address => bool) public isVerifier;

    mapping(string => address) public creatorOf; // channelId => account
    mapping(address => string) public channelOf; // account => channelId

    event VerifierSet(address indexed verifier, bool allowed);
    event CreatorVerified(address indexed creator, string channelId, string channelTitle);
    event CreatorUnlinked(address indexed creator, string channelId);

    error NotOwner();
    error NotVerifier();
    error BadChannel();

    constructor(address verifier) {
        owner = msg.sender;
        isVerifier[verifier] = true;
        emit VerifierSet(verifier, true);
    }

    function setVerifier(address verifier, bool allowed) external {
        if (msg.sender != owner) revert NotOwner();
        isVerifier[verifier] = allowed;
        emit VerifierSet(verifier, allowed);
    }

    /// @notice Record that `creator` controls `channelId`. Re-linking moves the channel to the new account.
    function attest(address creator, string calldata channelId, string calldata channelTitle) external {
        if (!isVerifier[msg.sender]) revert NotVerifier();
        if (bytes(channelId).length < 10 || bytes(channelId).length > 40 || creator == address(0)) {
            revert BadChannel();
        }

        address previous = creatorOf[channelId];
        if (previous != address(0) && previous != creator) {
            delete channelOf[previous];
            emit CreatorUnlinked(previous, channelId);
        }
        string memory old = channelOf[creator];
        if (bytes(old).length != 0 && keccak256(bytes(old)) != keccak256(bytes(channelId))) {
            delete creatorOf[old];
            emit CreatorUnlinked(creator, old);
        }
        creatorOf[channelId] = creator;
        channelOf[creator] = channelId;
        emit CreatorVerified(creator, channelId, channelTitle);
    }

    /// @notice A creator can always remove their own link.
    function unlink() external {
        string memory channelId = channelOf[msg.sender];
        if (bytes(channelId).length == 0) return;
        delete creatorOf[channelId];
        delete channelOf[msg.sender];
        emit CreatorUnlinked(msg.sender, channelId);
    }
}
