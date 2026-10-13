# Metropolis submission kit

## Form fields

**Name:** CloutCall
**Track:** 03 — Social, Attention & Culture
**One-liner:** Don't buy the creator — call the creator. Face ID in, call whether a video goes viral,
get it confirmed on Monad in about a second, and dare a friend to take the other side.

**Description:**
CloutCall turns the internet's favourite argument, "this is going to blow up", into a game you can
settle. Every market asks one question about a public YouTube video: will it pass N views by time T?
Players sign in with a passkey (Mera, no wallet or seed phrase), get sponsored gas and 1,000
play-money points, and make a call in one tap. Monad's 300ms blocks and synchronous receipts mean the
call is confirmed before the phone is back in your pocket; the app shows the measured latency. Markets
themselves settle after their deadline. Every call
creates a duel link that unfurls on X and LinkedIn as a generated card, so the product spreads through
the argument itself. Sealed calls hide your side behind a commit-reveal derived from a second passkey
PRF namespace, revealable from any device. On the live testnet, markets settle through an allow-listed
keeper reading the YouTube Data API; a Chainlink CRE workflow (median of DON nodes' YouTube reads → signed
report → `onReport`) is built and unit-tested and takes over once the forwarder is set. An Envio HyperIndex
indexer powers streaks, duels and upsets on the leaderboard. **Beat the AI:** CloutBot, powered by Kimi,
stakes on open markets while it runs and posts its reasoning on-chain before calls close — players duel it, and a Humans vs AI scoreboard asks
whether people predict virality better than a model. **Hype Sprints** run 30-minute markets on fresh
uploads with a live pace panel. **Creator mode** lets verified creators host markets on their own uploads,
and **personas** give one passkey many unlinkable identities. Points are soulbound with no cash value: no creator tokens, no
securities, no consent needed.

**Go-to-market:**
1. *Wedge: creator-drop moments.* Seed markets on the biggest uploads of the week (trending chart +
   scheduled drops like MrBeast, Sidemen, Kai Cenat) where millions already argue in comments.
2. *Distribution through duels.* Each call yields a challenge link; the OG card does the selling. Target
   K-factor from duel links rather than paid acquisition. No post-to-earn (banned on X since Jan 2026).
3. *Communities first.* Campus crypto clubs and fan Discords run private leagues (same contracts,
   filtered leaderboard).
4. *Creators as hosts, not assets.* Creators can open markets on their own uploads to drive watch-time
   and engagement — they benefit from the attention without selling anything.
5. *Monetization path:* sponsored markets and brand-funded prize pools (sweepstakes-style, no purchase
   necessary), premium leagues, and later a licensed-partner route for real-money markets where legal.

## Demo video (≤ 3 min) — shot list

(Updated) Open on the hook: "Can you predict virality better than an AI?" — show the Humans vs AI
scoreboard, then a Hype Sprint with CloutBot's on-chain pick and reasoning, tap "Take the other side",
Face ID, "⚡ Confirmed in ~600ms". Then: live pace panel, creator-hosted badge, persona switch, settlement
and "you beat the AI" on the leaderboard. Original shot list below for the remaining beats.


1. 0:00 Hook: phone screen, "Will this video hit 30M views by tomorrow?" Tap **Create account with Face ID**.
2. 0:15 One prompt → points appear. Point at "no wallet, no seed phrase, no gas".
3. 0:30 Call YES for 100 → **"⚡ Confirmed in ~400ms"** badge; live feed row flips Proposed → Finalized.
4. 0:50 Share card → **Post on X** preview (generated OG image with handle, side, latency).
5. 1:05 Second phone opens the duel link → "ayush called YES. Take the other side?" → calls NO in one tap.
6. 1:25 **Seal it 🔒** on another market → rival sees only "sealed 300 pts".
7. 1:40 Stateless test: clear site data / open on a new device → same address, sealed pick shows again.
8. 2:00 Settlement: `cre workflow simulate` (or resolver) writes the view count → market settles → **Collect**.
9. 2:20 Leaderboard: win rate, streaks, duels (Envio). `/me`: "one passkey, many keys" panel.
10. 2:40 Close: contracts + tx hashes on Monad testnet explorer, repo link.

## Pitch video (≤ 2 min) — script

- **Problem:** Creator "shares" and creator coins (BitClout, friend.tech, creator tokens) keep failing:
  they're securities-shaped, need creator consent, and pump-and-dump.
- **Insight:** People don't want to own creators. They want to be *right* about them, publicly.
- **Product:** CloutCall — prediction duels on public creator metrics with calls confirmed in about a
  second, onboarding by Face ID.
- **Why Monad:** a viral link means thousands of first-time users calling in the same minute; Monad
  confirms each call in one round-trip for a fraction of a cent, so we can sponsor it all.
- **Traction:** (fill with real numbers on submission day: accounts, calls, duel links opened.)
- **Ask:** residency + intros to creator/media partners for sponsored markets.

## Launch posts

**X (post on submission morning, 30–45s screen recording attached; link in first reply):**
> Can you predict what goes viral better than an AI?
> I built an onchain game where you duel an AI on YouTube view counts.
> It stakes first and shows its reasoning. You take the other side with Face ID — confirmed in about a second on @monad.
> Humans are currently [X]–[Y] vs the bot 👇

Alternate:
> I built a way to bet on whether a YouTube video goes viral.
> Face ID to sign in. Your call is confirmed in about a second on @monad. Then you dare a friend to take the other side.
> No wallet. No seed phrase. No gas.
> Try to beat me 👇

**LinkedIn (carousel or native video; link in first comment; reply to every comment in the first hour):**
> My first hackathon idea — "buy shares in YouTubers as tokens" — got torn apart in five minutes.
> (Securities. Consent. Every attempt since 2021 died.)
> So I flipped it: don't buy the creator, *call* the creator.
> CloutCall lets anyone predict whether a video will cross a view target, confirms each call in about a
> second on Monad, and turns every call into a challenge link for a friend.
> What I learned building it in the Monad Metropolis hackathon: …

## Submission checklist

- [ ] Registration confirmed on hackathon.monad.xyz (one track: 03)
- [ ] Public GitHub repo with LICENSE (MIT) — commits fall inside the build window
- [ ] README discloses AI tooling ✔
- [ ] Contracts deployed to Monad testnet; addresses + tx hashes in the form
- [ ] Web deployed on its final Vercel domain; drip wallet funded
- [ ] Markets seeded from live YouTube data; resolver (or CRE) running
- [ ] Demo video ≤ 3 min and pitch video uploaded (public)
- [ ] Bounty answers: Mera UX, Mera One Passkey Many Keys, Chainlink CRE, Envio, Kimi (credits)
- [ ] Deadline: **13 Oct 2026, 11:59 PM ET**
