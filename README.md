# CloutCall

> Don't buy the creator — call the creator.

CloutCall is a social prediction game on **Monad**. Tap Face ID, call whether a creator's new
YouTube video will cross a view target, watch your call finalize in ~0.6s, and send a friend a
duel link to take the other side.

Built for the Monad **Metropolis** hackathon — Track 03: Social, Attention & Culture.

## Repository layout

| Path         | What it is                                                        |
| ------------ | ----------------------------------------------------------------- |
| `contracts/` | Foundry project — `CloutPoints` and `CloutMarket` (Solidity)      |
| `web/`       | Next.js app — Mera passkey wallet, markets, duels, leaderboard    |
| `resolver/`  | YouTube Data API resolver that settles markets on Monad           |
| `cre/`       | Chainlink CRE workflow: YouTube view count → Monad                |
| `indexer/`   | Envio HyperIndex — leaderboard, streaks and rivalries             |

_Work in progress — see commit history._
