#!/usr/bin/env bash
# Local end-to-end environment: anvil + contracts + demo markets.
# Usage: scripts/dev-local.sh   (then `cd web && npm run dev`)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"
# anvil account #0 — public test key, never use it on a real network
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

if ! cast chain-id --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; then
  anvil --silent --block-time 1 >/tmp/cloutcall-anvil.log 2>&1 &
  sleep 2
fi

cd contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --private-key $PK --broadcast >/dev/null
MARKET=$(jq -r .market ../deployments/31337.json)
MARKET_ADDRESS=$MARKET forge script script/SeedDemo.s.sol --rpc-url http://127.0.0.1:8545 --private-key $PK --broadcast >/dev/null
cat ../deployments/31337.json
echo "Local chain ready. Demo markets seeded on $MARKET"
