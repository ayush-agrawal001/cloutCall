# CloutCall demo video: script for 3 speakers (≤ 3:00)

**Live app:** https://cloutcall.vercel.app · **Target length:** about 2:50 · **Tone:** friendly product tour, not a lecture.

The story in one line: **"Can you predict what goes viral better than an AI?"** Each speaker covers one act:

| Act | Speaker | Time | What they show | Sponsors they name |
| --- | --- | --- | --- | --- |
| 1. The hook and sign-in | **Speaker 1** | 0:00 – 0:55 | Landing page, Face ID sign-in, "One passkey, many keys" | **Mera** (UX), **Mera** (One Passkey Many Keys), **Monad** |
| 2. Playing the game | **Speaker 2** | 0:55 – 2:00 | Hype Sprint, CloutBot, a call confirmed in ms, sealed call, duel link | **Kimi**, **Monad** |
| 3. How it settles and keeps score | **Speaker 3** | 2:00 – 2:55 | Collecting winnings, leaderboard, Humans vs AI, explorer, close | **Chainlink CRE**, **Envio**, **Monad** |

Put your names in place of Speaker 1, 2 and 3. Give Act 1 to the most confident speaker: the first 10 seconds decide whether judges keep watching.

---

## Before you hit record (do this 1–2 hours ahead)

- [ ] **Keeper running:** `cd resolver && npm run resolve -- --sprints 4`, so Hype Sprints are open and due markets settle.
- [ ] **CloutBot running:** `npm run agent` (needs `KIMI_API_KEY`, `AGENT_PRIVATE_KEY`). It only picks markets while it runs, so start it early enough that open markets show its pick and reasoning.
- [ ] **Have a win ready to collect:** about an hour before, call the likely side on a short Hype Sprint so a **Collect** button is waiting for Act 3.
- [ ] **Two devices:** your main phone (iPhone Safari is the safest for passkeys) and a second phone or laptop with a **different** passkey to open the duel link.
- [ ] **Fresh browser for Act 1:** a private window or a new browser profile, so "Create account with a passkey" shows a new account being created.
- [ ] **Leaderboard shows Envio stats** (streaks, duels, upsets) on the live site. If `NEXT_PUBLIC_ENVIO_URL` isn't set on Vercel, record the leaderboard from a local run with the indexer instead.
- [ ] **Open these tabs:** Monad testnet explorer on a recent call tx, and the GitHub repo.
- [ ] **Write down the real numbers:** the Humans vs AI score and the "Confirmed in ___ms" value you get. Never read out a made-up number.
- [ ] **Drip wallet funded**, so the new account gets gas without an error on camera.

---

## The script

Each beat has three parts: **SCREEN** is what to show, **SAY** is the spoken line, and **CAPTION** is the text chip to add in editing. **Bold words** are the keywords to stress: slow down a little and hit them clearly.

### Act 1 · Speaker 1 · The hook and sign-in (0:00 – 0:55)

**0:00 – 0:12 · The hook**
- **SCREEN:** Landing page hero ("Predict which videos go viral on YouTube").
- **SAY:** "Every day millions of people argue in YouTube comments: *'this is going to blow up.'* Nobody ever settles it. So we built **CloutCall**. **Don't buy the creator — call the creator.** You predict whether a real YouTube video hits its view target, and the whole game runs on **Monad**."

**0:12 – 0:32 · Sign-in with Face ID**
- **SCREEN:** Tap **Start playing — it's free** → **Create account with a passkey** → Face ID → points appear.
- **SAY:** "Watch how you sign up. One tap. **Face ID**. Done. **No wallet app, no seed phrase, no gas.** That's **Mera**: my **passkey is my Monad account**. I already have **1,000 free points**, and gas was topped up for me automatically."
- **CAPTION:** `Powered by Mera · passkey wallet`

**0:32 – 0:55 · One passkey, many keys**
- **SCREEN:** Go to **Your account** (`/me`) and show the **One passkey, many keys** panel (Key 1 · Monad wallet, Key 2 · Sealed calls, Keys 3…n · Personas). Switch to a persona for a second.
- **SAY:** "And it's more than a login. From **one passkey** we derive **many keys**. Key one is my Monad account. Key two locks my **sealed calls**. The rest are **anonymous personas**: separate accounts nobody can link to me. Nothing is stored, so if I clear my browser or switch phones, everything **rebuilds from the passkey**. Over to [Speaker 2] to play."
- **CAPTION:** `Mera · One Passkey, Many Keys`

### Act 2 · Speaker 2 · Playing the game (0:55 – 2:00)

**0:55 – 1:10 · Hype Sprint**
- **SCREEN:** **Markets** page → open a **Hype Sprint**. Point the cursor at the pace panel (Needs / min vs Doing / min).
- **SAY:** "These are live markets on real uploads. This one's a **Hype Sprint**: a short market on a video posted just hours ago. The **pace panel** shows the views per minute it needs against what it's actually doing right now."

**1:10 – 1:28 · Meet CloutBot**
- **SCREEN:** CloutBot's card on the same market: its pick, confidence and reasoning. Optionally click its on-chain link.
- **SAY:** "And I'm not only playing against people. This is **CloutBot**, our **AI rival, powered by Kimi**. It read this video's live views, likes and comments, **staked its own points**, and posted its **pick and its reasoning on-chain** before calls closed. It can't change its mind afterwards."
- **CAPTION:** `Powered by Kimi (Moonshot AI)`

**1:28 – 1:43 · Take the other side, confirmed in milliseconds**
- **SCREEN:** Tap the side **opposite** CloutBot → 100 pts → Face ID → the **⚡ Confirmed in ___ms** badge.
- **SAY:** "CloutBot says YES. I think it's wrong. **NO**, 100 points, Face ID… **confirmed in [read the number] milliseconds.** That's a real transaction on **Monad**: its blocks are so fast I get the receipt before I put my phone down."
- **CAPTION:** `Monad · ~300ms blocks · instant receipts`

**1:43 – 1:50 · Sealed call**
- **SCREEN:** On another market, tick **Seal it 🔒** and confirm. Optionally show what a rival sees: "🔒 Sealed · 300 pts".
- **SAY:** "Don't want people copying you? Tick **Seal it**. Rivals see that I staked, but not which side, until calls close."

**1:50 – 2:00 · Dare a friend**
- **SCREEN:** **Dare a friend to take the other side** → **Post on X** preview card → second phone opens the link ("… called NO. Take the other side?").
- **SAY:** "Every call becomes a **duel link**. It unfurls as a card on X, and my friend lands with the **other side already picked**. **The argument is the growth loop.** [Speaker 3], who won?"

### Act 3 · Speaker 3 · How it settles and keeps score (2:00 – 2:55)

**2:00 – 2:22 · Settlement**
- **SCREEN:** The market you set up earlier, now settled → tap **Collect ___ pts**. Optionally flash `cd cre && bun test` passing in a terminal for 2–3 seconds.
- **SAY:** "When the deadline hits, the **final view count is posted on-chain** and winners hit **Collect**. On the live testnet today, our keeper reads the YouTube API. We've also built a **Chainlink CRE** workflow: every node in the oracle network fetches the view count, they agree on the **median**, and a **signed report** settles the market, so no single party can fake the number. It's built and tested in our repo and takes over once the forwarder is switched on."
- **CAPTION:** `Chainlink CRE · DON median → signed report (built & tested)`

**2:22 – 2:40 · Leaderboard and Humans vs AI**
- **SCREEN:** **Leaderboard** with streaks, win rate, duels and upsets → the **Humans vs AI** scoreboard.
- **SAY:** "The leaderboard tracks **streaks, win rate, duels won and upsets**, all indexed live from our contracts by **Envio HyperIndex**. And here's the big question: **Humans vs AI**. Right now humans are **[X] to [Y]**."
- **CAPTION:** `Indexed by Envio HyperIndex`

**2:40 – 2:55 · Close**
- **SCREEN:** Monad explorer showing a call tx → back to the landing page with the URL visible → end card.
- **SAY:** "Every call, every AI pick and every payout is **public on Monad's explorer**. It's play money only: **no creator tokens, nothing to buy**. That's **CloutCall**. **Don't buy the creator — call the creator.** Come **beat the AI** at **cloutcall.vercel.app**."
- **END CARD (3 seconds, no voice):** `CloutCall · cloutcall.vercel.app · Built on Monad with Mera · Chainlink CRE · Envio · Kimi` + the GitHub repo link.

---

## Keywords that stand out

Stress these words. Judges remember a small set of phrases repeated with confidence.

| Keyword | Why it lands |
| --- | --- |
| **"Don't buy the creator — call the creator"** | The tagline. Say it at the start **and** at the end. |
| **"Can you beat the AI?" / "Humans vs AI"** | The emotional hook: everyone wants to beat the bot. |
| **"Face ID. Done."** | Onboarding in three words. Pause right after it. |
| **"No wallet, no seed phrase, no gas"** | The Mera UX promise in one breath. |
| **"One passkey, many keys"** | The exact name of the Mera bounty. Say it word for word. |
| **"Confirmed in ___ milliseconds"** | The Monad speed proof. Read the real number off the screen. |
| **"Reasoning on-chain"** | Shows the AI is honest and can't cheat. |
| **"Duel link" / "Take the other side"** | The viral growth loop. |
| **"Median" + "signed report"** | The two Chainlink CRE words judges look for. |
| **"Streaks, duels, upsets"** | Shows Envio is doing real work, not just listing events. |
| **"Play money, nothing to buy"** | Ends any legal worry before a judge thinks of it. |

## How to mention each sponsor so judges notice

Use the same three-step formula every time: **say the sponsor's name, say what it does for the player, and show it on screen with a caption chip.**

| Sponsor / bounty | Who says it | The line | What to show |
| --- | --- | --- | --- |
| **Monad** (main chain) | All three | "runs on **Monad**", "confirmed in ___ms on **Monad**", "public on **Monad's explorer**" | ⚡ Confirmed badge + explorer tx |
| **Mera: passkey UX** | Speaker 1 | "That's **Mera**: my **passkey is my Monad account**." | Face ID sign-in → 1,000 points |
| **Mera: One Passkey Many Keys** | Speaker 1 | "From **one passkey** we derive **many keys**." | The "One passkey, many keys" panel + a persona switch |
| **Kimi** (Moonshot AI) | Speaker 2 | "**CloutBot**, our AI rival, **powered by Kimi**." | CloutBot's pick and reasoning card |
| **Chainlink CRE** | Speaker 3 | "every node fetches the count, they agree on the **median**, a **signed report** settles it." | Caption + optional `bun test` in `cre/` |
| **Envio** | Speaker 3 | "indexed live from our contracts by **Envio HyperIndex**." | Leaderboard: streaks, duels, upsets |

Two rules:
1. **Be honest about Chainlink CRE.** Say it's "built and tested" and "takes over once the forwarder is switched on". Don't say it settles live markets today; judges can check the contract.
2. **Repeat every sponsor on the end card.** Some judges only watch the first and last 20 seconds.

---

## Recording tips (keep it simple and fun)

- **Record each act on its own**, then stitch them together. Each speaker can redo their part without the others.
- **Record voice and screen separately if needed.** Capture the screen first, then record the voice-over while watching it. It's much easier than talking and tapping at the same time.
- **Phone screen:** on iPhone, plug into a Mac and use QuickTime → New Movie Recording → choose the iPhone. If the Face ID sheet doesn't show up in the capture, film the phone with another camera for those 2–3 seconds.
- **Cut every wait.** Speed up or cut loading screens and passkey prompts. Keep each shot under about 8 seconds.
- **Zoom in** on the ⚡ Confirmed badge, CloutBot's reasoning and the Humans vs AI score. They are the three hero shots.
- **Add captions/subtitles.** Many judges watch on mute.
- **Talk like you're showing a friend**, not reading a spec: "watch this", "here's the fun part", "I think the bot's wrong".
- **Stay under 3:00.** If you run long, cut the sealed-call beat (1:43–1:50) first, then the persona switch.
- Upload as **public** (or unlisted if the form allows), at 1080p, and test the link in a private window before submitting.

**Word count check:** the SAY lines come to about 480 words. That fits in about 2:50 at an upbeat pace (about 165 words a minute) and runs over 3:00 if you speak slowly. Do a timed read-through first; if you run long, trim filler words, never the keywords.
