# CloutCall

> **Don't buy the creator — call the creator.**

CloutCall is a social prediction game on **Monad**. Tap Face ID, call whether a creator's new YouTube
video will cross a view target, watch your call land in a few hundred milliseconds, and send a friend a
duel link to take the other side.

Built for the Monad **Metropolis** hackathon · **Track 03 — Social, Attention & Culture**
("markets on cultural outcomes").

- **No wallet, no seed phrase, no gas.** A passkey *is* the account (Mera). New players get sponsored gas
  and 1,000 play-money points without a second prompt.
- **Feels instant.** Calls are sent with `eth_sendRawTransactionSync` and the app shows the measured
  send→receipt time. The live feed streams Monad's `monadLogs` with Proposed → Voted → Finalized states.
- **Built to be shared.** Every call produces a duel link that unfurls on X and LinkedIn as a generated
  card ("ayush says YES — take the other side"). Friends land with the opposite side preselected.
- **Sealed calls.** Hide your pick from rivals with a commit-reveal derived from a *second* PRF namespace
  of the same passkey — nothing stored, revealable from any device.
- **Trust-minimized settlement.** A Chainlink CRE workflow fetches view counts on every DON node, takes
  the median and settles markets on Monad through the KeystoneForwarder.
- **Not a security, not a creator token.** Points are non-transferable and have no cash value. Markets
  read public view counters only; nobody buys a stake in a creator, so no creator has to consent.

## Live on Monad testnet (chain 10143)

| Contract | Address | Source |
| --- | --- | --- |
| CloutPoints | [`0xe2b2B8C1ba9f33a3A6A2bc42328CaEb5ee602c05`](https://testnet.monadexplorer.com/address/0xe2b2B8C1ba9f33a3A6A2bc42328CaEb5ee602c05) | Sourcify exact match |
| CloutMarket | [`0x604044904e1cC70FC9CcD7c19d36E046367c08ee`](https://testnet.monadexplorer.com/address/0x604044904e1cC70FC9CcD7c19d36E046367c08ee) | Sourcify exact match |

Deploy txs: CloutPoints `0x3a5f00cef8d618efef6b4553cda9d0d9b0f8329b75720712b0c415d06ef74d9c`,
CloutMarket `0x5fdd8dd888909788fdad147092fddef5fcbce421172f19000bed40f2ea51af4b`,
wiring `0x26562597597833352a718a0b02f4656b2bf39b732e337508e64907aa5b6f0cc8`. Start block 70364840.

## How it works

```
 ┌───────────── web (Next.js 16 on Vercel) ─────────────┐
 │ Face ID ─► mera PRF ─► EOA (scoped signing session)   │
 │            └► PRF ns "cloutcall/sealed-calls/v1" ─► HMAC salts for sealed calls
 │ call / commitCall / revealCall / claim ─► Monad (300ms blocks, sync receipts)
 │ /api/drip (gas)  /api/og (share cards)  /d/:id (duels)│
 └───────────────────────────┬──────────────────────────┘
                             ▼
              CloutMarket + CloutPoints (Solidity, Monad)
                ▲                        │ events
   resolve() /  │ onReport()             ▼
   resolver/ keeper   cre/ Chainlink CRE    indexer/ Envio HyperIndex
   (YouTube API)      (median of DON)       (streaks, duels, upsets → leaderboard)
```

| Path         | What it is |
| ------------ | ---------- |
| `contracts/` | Foundry. `CloutPoints` (soulbound play points) and `CloutMarket` (parimutuel markets, sealed calls, CRE receiver). 23 tests incl. fuzzing. |
| `web/`       | Next.js 16 app: Mera passkey wallet, markets, duels, OG cards, leaderboard. Node smoke tests for the wallet and full market flow. |
| `resolver/`  | YouTube Data API keeper: open markets from a URL or the trending chart, settle due markets. |
| `cre/`       | Chainlink CRE workflow (TypeScript → WASM) settling markets via signed reports. Unit-tested with the CRE SDK test runtime. |
| `indexer/`   | Envio HyperIndex: per-player wins, streaks, duels won, upsets; market history. |

## Sponsor tech used

| Sponsor | Where | What it does in CloutCall |
| --- | --- | --- |
| **Monad** | everywhere | 300ms blocks + `eth_sendRawTransactionSync` for one-round-trip calls; `monadLogs` commit states in the live feed; sub-cent gas makes sponsored onboarding viable |
| **Mera** (Monad Foundation) | `web/lib/mera.ts`, `web/lib/session.ts`, `web/lib/sealed.ts` | Whole account layer. One prompt opens a **scoped session** (CloutCall contracts only, 1,000-point budget, 30-min TTL; re-prompts outside scope). **Second PRF namespace** derives the sealed-call key (non-wallet use). Stateless: clear storage or switch device and everything rebuilds from the passkey |
| **Chainlink CRE** | `cre/` | Cron → EVM read (finalized) → HTTP fetch on every node → median consensus → signed report → `CloutMarket.onReport` |
| **Envio** | `indexer/` | HyperIndex derives streaks, win rate, duels and upsets at settlement; drives the leaderboard |

## Run it locally (5 minutes)

Requirements: Node 22+, [Foundry](https://getfoundry.sh), Docker (for the indexer), Bun (for CRE).

```bash
git clone <this repo> && cd cloutcall
git submodule update --init

# 1. chain + contracts + demo markets (anvil)
scripts/dev-local.sh

# 2. web app
cd web && npm install
node scripts/sync-env.mjs 31337
echo "DRIP_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" >> .env.local  # anvil key #0
npm run dev            # http://localhost:3000 — passkeys work on localhost

# 3. (optional) indexer with its own Postgres on :5455
cd ../indexer && npm install
ENVIO_MARKET_ADDRESS=$(jq -r .market ../deployments/31337.json) npm run dev:local
echo "NEXT_PUBLIC_ENVIO_URL=http://localhost:8080/v1/graphql" >> ../web/.env.local
```

Tests:

```bash
cd contracts && forge test                 # 23 tests (unit + fuzz)
cd resolver && npm test                    # keeper logic + YouTube parsing
cd indexer && npm test                     # settlement scoring
cd cre && bun test                         # CRE workflow with EVM/HTTP mocks
cd web && npm run smoke:session && npm run smoke:market   # against a running local stack
```

## Deploy to Monad testnet

```bash
cp .env.example .env    # fill DEPLOYER_PRIVATE_KEY (fund it at https://faucet.monad.xyz), YOUTUBE_API_KEY
scripts/deploy-testnet.sh                       # writes deployments/10143.json
cd web && node scripts/sync-env.mjs 10143       # then set DRIP_PRIVATE_KEY + NEXT_PUBLIC_SITE_URL
cd ../resolver && npm install && npm run seed-trending -- --count 6 && npm run resolve
```

Deploy `web/` to Vercel **on its final domain first** — passkeys are bound to the domain (rpId), so
accounts created on one domain can't be re-derived on another. Set the `NEXT_PUBLIC_*` vars and
`DRIP_PRIVATE_KEY`/`DRIP_AMOUNT` in the Vercel project.

Passkey support: Safari / iOS (iCloud Keychain), Chrome with Google Password Manager, Android, or 1Password.
On desktop Chrome, passkeys saved elsewhere don't expose PRF and mera reports `PRF_UNAVAILABLE`.

## Security & design notes

- Sealed-call commitments bind `chainid`, contract, market, player, side and a 32-byte passkey-derived salt,
  so a rival can't copy or replay one. Unrevealed stakes are forfeited to winners at settlement.
- `onReport` only accepts the configured KeystoneForwarder and, optionally, a pinned workflow id.
- The scoped session refuses value transfers and any contract other than CloutCall's two, enforces a
  points budget and expiry, and zeroes the key on sign-out (`session.end()`).
- `/api/drip` only funds addresses with no gas and is rate-limited per address and IP.
- Known limitations (hackathon scope): the resolver is an allow-listed key until the CRE forwarder is set;
  view counts are YouTube's public (slightly delayed) counters; the drip's rate limit is per instance.

## AI tooling disclosure

Per the Metropolis rules: this project was built with the help of **Claude Code (Anthropic, Claude Opus 5.5)**
as a coding assistant — scaffolding, contract and test code, frontend components, and documentation were
written with AI assistance and reviewed, run and tested by the author. All work in this repository was done
during the Metropolis build window; see the commit history.

## License

MIT
