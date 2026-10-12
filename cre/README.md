# CloutCall × Chainlink CRE

`cloutcall-settle` is a Chainlink Runtime Environment workflow that settles CloutCall markets
trust-minimized:

1. **Cron trigger** (every minute) reads `CloutMarket.getMarkets` on Monad at the last finalized block.
2. Picks the first market whose `resolveTime` has passed.
3. **HTTP capability**: every DON node fetches the video's public view count from the YouTube Data API
   (API key from CRE secrets). Nodes agree on the **median**, so one bad response can't move the result.
4. **Report**: `abi.encode(uint256 marketId, uint64 finalViews, bool voidMarket)` is signed by the DON and
   delivered through the KeystoneForwarder to `CloutMarket.onReport`, which resolves (or voids, if the
   video vanished) the market. The contract only accepts reports from the configured forwarder and,
   optionally, a pinned workflow id.

## Run

```bash
bun install                    # also runs cre-setup (Javy toolchain)
bun test                       # unit tests with the CRE SDK test runtime + EVM/HTTP mocks
bun run compile                # → cloutcall-settle/dist/workflow.wasm

# Simulate against Monad testnet with the CRE CLI (https://docs.chain.link/cre)
cre login
export MONAD_TESTNET_RPC_URL=https://testnet-rpc.monad.xyz
export YOUTUBE_API_KEY_VALUE=...   # secret for the workflow
# set marketAddress in cloutcall-settle/config.staging.json, and on the contract:
#   CloutMarket.setForwarder(0xB9F79d863261869B234c481D1f9A7af84AeAd192, 0x0)  # MockKeystoneForwarder (monad-testnet)
cre workflow simulate cloutcall-settle --target staging-settings --broadcast
```

Forwarders (from the CRE forwarder directory):

| Network | MockKeystoneForwarder (simulation) | KeystoneForwarder (production) |
| --- | --- | --- |
| monad-testnet | `0xB9F79d863261869B234c481D1f9A7af84AeAd192` | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |
| monad-mainnet | `0x9eF6468C5f37b976E57d52054c693269479A784d` | `0x76c9cf548b4179F8901cda1f8623568b58215E62` |
