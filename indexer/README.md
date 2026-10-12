# CloutCall indexer (Envio HyperIndex)

Indexes `CloutMarket` events into derived entities that power the leaderboard:

- **Player** — calls, sealed calls, wins/losses, current and best streak, total profit, biggest win,
  upsets called (wins on a side priced under 30%), duels won/lost.
- **Market** — pools, call and duel counts, status/outcome, participants.
- **Position** — each player's stake per market, rival (duel link) and settled profit/result.
- **Call** — every open or sealed call with its tx hash, for feeds and history.

Players are scored at `Resolved` in settlement order (`src/scoring.ts` mirrors the contract's payout math),
so streaks don't depend on when people claim.

```bash
npm install
npm test                                     # scoring unit tests
# Monad testnet via HyperSync
ENVIO_API_TOKEN=... ENVIO_MARKET_ADDRESS=$(jq -r .market ../deployments/10143.json) \
  ENVIO_START_BLOCK=$(jq -r .startBlock ../deployments/10143.json) npm run dev
# Local anvil devnet over RPC, with its own Postgres on :5455
ENVIO_MARKET_ADDRESS=$(jq -r .market ../deployments/31337.json) npm run dev:local
```

GraphQL: `http://localhost:8080/v1/graphql`, e.g.
`{ Player(order_by: {wins: desc}) { id wins bestStreak duelsWon upsetsCalled } }`.
Set `NEXT_PUBLIC_ENVIO_URL` in `web/.env.local` to show these stats on the leaderboard.
