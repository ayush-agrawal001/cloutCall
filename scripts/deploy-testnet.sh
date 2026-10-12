#!/usr/bin/env bash
# Deploys CloutCall to Monad testnet (chain 10143) and writes deployments/10143.json.
#
# Required env (put them in ./.env):
#   DEPLOYER_PRIVATE_KEY   funded testnet key (https://faucet.monad.xyz)
# Optional:
#   MONAD_TESTNET_RPC_URL  defaults to https://testnet-rpc.monad.xyz (use a QuickNode/Alchemy URL for a demo)
#   RESOLVER_ADDRESS       settles markets; defaults to the deployer
#   CRE_FORWARDER          Chainlink CRE forwarder. Monad testnet:
#                            MockKeystoneForwarder 0xB9F79d863261869B234c481D1f9A7af84AeAd192 (simulation)
#                            KeystoneForwarder     0xF8344CFd5c43616a4366C34E3EEE75af79a74482 (production)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
: "${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY in .env}"
export MONAD_TESTNET_RPC_URL="${MONAD_TESTNET_RPC_URL:-https://testnet-rpc.monad.xyz}"
export PATH="$HOME/.foundry/bin:$PATH"

cd contracts
forge script script/Deploy.s.sol \
  --rpc-url "$MONAD_TESTNET_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast --slow
cat ../deployments/10143.json
