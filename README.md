# CloutCall

> **Don't buy the creator — call the creator.**

CloutCall is a social prediction game on **Monad**. Tap Face ID, call whether a creator's new YouTube
video will cross a view target, watch your call land in a few hundred milliseconds, and send a friend a
duel link to take the other side.

**Live app (Monad testnet): https://cloutcall.vercel.app**

Built for the Monad **Metropolis** hackathon · **Track 03 — Social, Attention & Culture**
("markets on cultural outcomes").

- **No wallet, no seed phrase, no gas.** A passkey *is* the account (Mera). New players get sponsored gas
  and 1,000 play-money points without a second prompt.
- **Feels instant.** Calls are sent with `eth_sendRawTransactionSync` and the app shows the measured
  send→receipt time. The live feed streams Monad's `monadLogs` with Proposed → Voted → Finalized states.
- **Built to be shared.** Every call produces a duel link that unfurls on X and LinkedIn as a generated
  card ("ayush says YES — take the other side"). Friends land with the opposite side preselected.
- **Sealed calls.** Hide your pick from rivals with a commit-reveal derived from a *second* PRF namespace
  of the same passkey — nothing stored, revealable from any device. Each account (and persona) gets its
  own per-market salt.
- **Settlement.** On the live testnet deployment, markets are settled by an allow-listed keeper
  (`resolver/`) reading the YouTube Data API at or after each market's deadline. A Chainlink CRE workflow
  (`cre/`: every DON node fetches the count, median, signed report through the KeystoneForwarder) is built
  and unit-tested, but not yet wired: the deployed contract's forwarder is unset. A call is *confirmed*
  in about a second; the *market* settles after its deadline.
- **Beat the AI.** CloutBot, a Kimi-powered rival, reads each upload's live signals, stakes points and posts
  its pick and reasoning on-chain before calls close. It runs as a separate process (`npm run agent`), so it
  only picks markets while it is running. Tap "take the other side" to duel it; a Humans vs AI
  scoreboard and a "Beat the AI" leaderboard column keep score.
- **Hype Sprints.** 30-minute markets on uploads from the last few hours, with targets projected from the
  upload's own pace and a live panel showing views/min needed vs doing.
- **Creator mode.** Creators verify their channel (Google sign-in, YouTube read-only), the link is attested
  on-chain, and they host markets on their own uploads with a "Hosted by the creator" badge.
- **Anonymous personas.** One passkey, many unlinkable caller identities (separate key branch per name).
- **Not a security, not a creator token.** Points are non-transferable and have no cash value. Markets
  read public view counters only; nobody buys a stake in a creator, so no creator has to consent.

## Live on Monad testnet (chain 10143)

| Contract | Address | Source |
| --- | --- | --- |
| CloutPoints | [`0xe2b2B8C1ba9f33a3A6A2bc42328CaEb5ee602c05`](https://testnet.monadexplorer.com/address/0xe2b2B8C1ba9f33a3A6A2bc42328CaEb5ee602c05) | Sourcify exact match |
| CloutMarket | [`0x604044904e1cC70FC9CcD7c19d36E046367c08ee`](https://testnet.monadexplorer.com/address/0x604044904e1cC70FC9CcD7c19d36E046367c08ee) | Sourcify exact match |
| AgentJournal | [`0x4048FeFcAc8319f33e1F0bE4B665a132131475D0`](https://testnet.monadexplorer.com/address/0x4048FeFcAc8319f33e1F0bE4B665a132131475D0) | Sourcify exact match |
| CreatorRegistry | [`0x8803C68b7C8e356D9e3494eaF91B8E7A94dFeDEe`](https://testnet.monadexplorer.com/address/0x8803C68b7C8e356D9e3494eaF91B8E7A94dFeDEe) | Sourcify exact match |

CloutBot (AI rival) account: `0xBf93B7C8B8c25c68941E9855b6F8386873baBD25`.

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
| `contracts/` | Foundry. `CloutPoints` (soulbound play points) and `CloutMarket` (parimutuel markets, sealed calls, CRE receiver). 30 tests incl. fuzzing. |
| `web/`       | Next.js 16 app: Mera passkey wallet, markets, duels, OG cards, leaderboard. Node smoke tests for the wallet and full market flow. |
| `resolver/`  | YouTube Data API keeper: open markets from a URL or the trending chart, settle due markets. |
| `cre/`       | Chainlink CRE workflow (TypeScript → WASM) that settles markets via signed reports. Unit-tested with the CRE SDK test runtime; not yet wired on the live testnet deployment. |
| `indexer/`   | Envio HyperIndex: per-player wins, streaks, duels won, upsets; market history. |

## Sponsor tech used

| Sponsor | Where | What it does in CloutCall |
| --- | --- | --- |
| **Monad** | everywhere | 300ms blocks + `eth_sendRawTransactionSync` for one-round-trip calls; `monadLogs` commit states in the live feed; sub-cent gas makes sponsored onboarding viable |
| **Mera** (Monad Foundation) | `web/lib/mera.ts`, `web/lib/session.ts`, `web/lib/sealed.ts` | Whole account layer. One prompt opens a **scoped session** (CloutCall contracts only, 1,000-point budget, 30-min TTL; re-prompts outside scope), with the scope enforced by CloutCall's own client code in `web/lib/session.ts`. **Second PRF namespace** derives the sealed-call key (non-wallet use). Stateless: clear storage or switch device and everything rebuilds from the passkey. **Personas**: one passkey derives unlinkable accounts per name (`m/44'/60'/7'/0/i`). The session also signs exactly one message type (creator link) and nothing else |
| **Chainlink CRE** | `cre/` | Cron → EVM read (finalized) → HTTP fetch on every node → median consensus → signed report → `CloutMarket.onReport`. Built and unit-tested; live testnet settlement currently uses the allow-listed keeper |
| **Envio** | `indexer/` | HyperIndex derives streaks, win rate, duels, upsets and Humans-vs-AI results at settlement; drives the leaderboard |
| **Kimi** (Moonshot AI) | `resolver/src/kimi.ts`, `resolver/src/agent.ts` | Powers CloutBot: structured JSON calls (side, calibrated confidence, predicted views, reasoning) from live view/like/comment velocity; stakes sized by confidence and journaled on-chain |

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
cd contracts && forge test                 # 30 tests (unit + fuzz)
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
cd ../resolver && npm install && npm run seed-trending -- --count 6
npm run resolve -- --sprints 4      # settle due markets and keep 4 Hype Sprints open
npm run agent                       # CloutBot: needs KIMI_API_KEY and AGENT_PRIVATE_KEY
```

Deploy `web/` to Vercel **on its final domain first** — passkeys are bound to the domain (rpId), so
accounts created on one domain can't be re-derived on another. Set the `NEXT_PUBLIC_*` vars and
`DRIP_PRIVATE_KEY`/`DRIP_AMOUNT` in the Vercel project.

Passkey support: Safari / iOS (iCloud Keychain), Chrome with Google Password Manager, Android, or 1Password.
On desktop Chrome, passkeys saved elsewhere don't expose PRF and mera reports `PRF_UNAVAILABLE`.

## Security & design notes

- CloutBot can only journal a pick while calls are open and only for a side it has actually staked, so it
  can't backfill predictions. Model output is validated and clamped before it reaches the chain.
- Creator verification: the passkey session signs a link request (and refuses any other message), the
  OAuth state is HMAC'd with a 10-minute expiry, only the `youtube.readonly` scope is requested, and the
  Google token is discarded right after reading the channel id. Creators can unlink at any time.
- Personas are unlinkable on-chain by design; like any free-to-play game, a determined user can create
  more accounts, so points measure skill for fun, not value. Sealed-call salts include the account address,
  so one persona's reveal can't open or link another persona's sealed call. Sealed calls committed before
  this change used a salt shared by all personas of a passkey; they can still be revealed, but don't get
  this protection retroactively.

- Sealed-call commitments bind `chainid`, contract, market, player, side and a 32-byte passkey-derived salt,
  so a rival can't copy or replay one. Unrevealed stakes are forfeited to winners at settlement.
- `onReport` only accepts the configured KeystoneForwarder and, optionally, a pinned workflow id.
- The scoped session refuses value transfers and any contract other than CloutCall's contracts, enforces a
  points budget and expiry, and zeroes the key on sign-out (`session.end()`). These limits are enforced by
  the app's client code, not by the key or by Mera itself.
- If a send times out or the connection drops, the app looks the signed transaction up by hash before
  reporting anything. If it still can't tell, it says the call is unconfirmed and asks the player to check
  it rather than letting them stake again blindly.
- Late settlement: if the keeper observes a market more than 5 minutes after its deadline, a count still
  below target settles NO (views only go up), but a count at or above target voids the market (refunds)
  because it can't show the target was hit by the deadline.
- `/api/drip` only funds addresses with no gas and is rate-limited per address and IP.
- Known limitations (hackathon scope): live settlement is the allow-listed keeper key, since the CRE forwarder
  is not set on the deployed contract; the keeper must be running for markets to settle;
  view counts are YouTube's public (slightly delayed) counters; the drip's rate limit is per instance.

## AI tooling disclosure

Per the Metropolis rules: this project was built with the help of **Claude Code (Anthropic, Claude Opus 5.5)**
as a coding assistant — scaffolding, contract and test code, frontend components, and documentation were
written with AI assistance and reviewed, run and tested by the author. All work in this repository was done
during the Metropolis build window; see the commit history.

## License

MIT
