# CloutCall resolver

Node/TypeScript keeper that opens markets from live YouTube data and settles them on Monad.

```bash
npm install
npm test                                              # unit tests (decision logic + API parsing)
npm run create-market -- https://youtu.be/<id> --growth 20 --close 1h --resolve 24h
npm run seed-trending -- --region US --count 6        # fresh markets on today's trending uploads
npm run resolve                                       # settle due markets every 30s (--once for one pass)
```

Env (in `../.env`): `RESOLVER_PRIVATE_KEY`, `YOUTUBE_API_KEY`, `CHAIN_ID` (default 10143),
`MONAD_TESTNET_RPC_URL`. Addresses come from `../deployments/<chainId>.json`.

The Chainlink CRE workflow in `../cre` can settle the same markets trust-minimized; this keeper is the
simple path and a fallback.
