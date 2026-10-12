import { indexer, type EvmOnEventContext, type Market, type Player, type Position } from "envio";
import { isUpset, payout, result, sideName, staked, ZERO, type Outcome } from "../scoring";

const positionId = (marketId: bigint, player: string) => `${marketId}-${player.toLowerCase()}`;

function newPlayer(id: string, ts: number): Player {
  return {
    id,
    calls: 0,
    sealedCalls: 0,
    settled: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    totalStaked: 0n,
    totalProfit: 0n,
    biggestWin: 0n,
    upsetsCalled: 0,
    duelsWon: 0,
    duelsLost: 0,
    beatAi: 0,
    firstSeen: ts,
  };
}

function newPosition(marketId: bigint, player: string, rival: string): Position {
  return {
    id: positionId(marketId, player),
    market_id: marketId.toString(),
    player_id: player.toLowerCase(),
    yes: 0n,
    no: 0n,
    sealedStake: 0n,
    revealed: false,
    rival: rival === ZERO ? "" : rival.toLowerCase(),
    profit: 0n,
    result: "open",
  };
}

indexer.onEvent({ contract: "CloutMarket", event: "MarketCreated" }, async ({ event, context }) => {
  const p = event.params;
  context.Market.set({
    id: p.marketId.toString(),
    videoId: p.videoId,
    creator: p.creator.toLowerCase(),
    threshold: p.threshold,
    baselineViews: p.baselineViews,
    closeTime: p.closeTime,
    resolveTime: p.resolveTime,
    status: "open",
    outcome: "NONE",
    finalViews: 0n,
    yesPool: 0n,
    noPool: 0n,
    sealedPool: 0n,
    callCount: 0,
    duelCount: 0,
    players: [],
    aiAgent: "",
    createdAt: event.block.timestamp,
  });
});

/** Shared bookkeeping for open and sealed calls. */
async function recordCall(
  context: EvmOnEventContext,
  args: {
    marketId: bigint;
    player: string;
    rival: string;
    amount: bigint;
    side: string;
    sealed: boolean;
    ts: number;
    id: string;
    txHash: string;
  },
) {
  const player = args.player.toLowerCase();
  const market = await context.Market.getOrThrow(args.marketId.toString());
  const pl = (await context.Player.get(player)) ?? newPlayer(player, args.ts);
  const pos = (await context.Position.get(positionId(args.marketId, player))) ?? newPosition(args.marketId, player, args.rival);

  context.Player.set({
    ...pl,
    calls: pl.calls + 1,
    sealedCalls: pl.sealedCalls + (args.sealed ? 1 : 0),
    totalStaked: pl.totalStaked + args.amount,
  });
  context.Position.set({
    ...pos,
    yes: pos.yes + (args.side === "YES" ? args.amount : 0n),
    no: pos.no + (args.side === "NO" ? args.amount : 0n),
    sealedStake: pos.sealedStake + (args.sealed ? args.amount : 0n),
    rival: pos.rival || (args.rival === ZERO ? "" : args.rival.toLowerCase()),
  });
  context.Market.set({
    ...market,
    yesPool: market.yesPool + (args.side === "YES" ? args.amount : 0n),
    noPool: market.noPool + (args.side === "NO" ? args.amount : 0n),
    sealedPool: market.sealedPool + (args.sealed ? args.amount : 0n),
    callCount: market.callCount + 1,
    duelCount: market.duelCount + (args.rival === ZERO ? 0 : 1),
    players: market.players.includes(player) ? market.players : [...market.players, player],
  });
  context.Call.set({
    id: args.id,
    market_id: args.marketId.toString(),
    player_id: player,
    side: args.side,
    amount: args.amount,
    sealed: args.sealed,
    rival: args.rival === ZERO ? "" : args.rival.toLowerCase(),
    timestamp: args.ts,
    txHash: args.txHash,
  });
}

indexer.onEvent(
  { contract: "CloutMarket", event: "Called", fields: { transaction: ["hash"], block: ["timestamp"] } },
  async ({ event, context }) => {
    const p = event.params;
    await recordCall(context, {
      marketId: p.marketId,
      player: p.player,
      rival: p.rival,
      amount: p.amount,
      side: sideName(p.side),
      sealed: false,
      ts: event.block.timestamp,
      id: `${event.transaction.hash}-${event.logIndex}`,
      txHash: event.transaction.hash,
    });
  },
);

indexer.onEvent(
  { contract: "CloutMarket", event: "SealedCallCommitted", fields: { transaction: ["hash"], block: ["timestamp"] } },
  async ({ event, context }) => {
    const p = event.params;
    await recordCall(context, {
      marketId: p.marketId,
      player: p.player,
      rival: p.rival,
      amount: p.amount,
      side: "SEALED",
      sealed: true,
      ts: event.block.timestamp,
      id: `${event.transaction.hash}-${event.logIndex}`,
      txHash: event.transaction.hash,
    });
  },
);

indexer.onEvent({ contract: "CloutMarket", event: "SealedCallRevealed" }, async ({ event, context }) => {
  const p = event.params;
  const side = sideName(p.side);
  const market = await context.Market.getOrThrow(p.marketId.toString());
  const pos = await context.Position.getOrThrow(positionId(p.marketId, p.player));
  context.Position.set({
    ...pos,
    revealed: true,
    yes: pos.yes + (side === "YES" ? p.amount : 0n),
    no: pos.no + (side === "NO" ? p.amount : 0n),
  });
  context.Market.set({
    ...market,
    sealedPool: market.sealedPool - p.amount,
    yesPool: market.yesPool + (side === "YES" ? p.amount : 0n),
    noPool: market.noPool + (side === "NO" ? p.amount : 0n),
  });
});

/** Scores every position in chronological settlement order: wins, streaks, upsets and duels. */
indexer.onEvent({ contract: "CloutMarket", event: "Resolved" }, async ({ event, context }) => {
  const p = event.params;
  const market = await context.Market.getOrThrow(p.marketId.toString());
  const outcome = sideName(p.outcome) as Outcome;
  const upset = isUpset(market, outcome);
  context.Market.set({ ...market, status: "resolved", outcome, finalViews: p.finalViews });

  const results = new Map<string, "win" | "loss" | "push">();
  for (const addr of market.players) {
    const pos = await context.Position.getOrThrow(positionId(p.marketId, addr));
    const profit = payout(market, outcome, pos) - staked(pos);
    const r = result(profit);
    results.set(addr, r);
    context.Position.set({ ...pos, profit, result: r });

    const pl = await context.Player.getOrThrow(addr);
    const streak = r === "win" ? pl.streak + 1 : r === "loss" ? 0 : pl.streak;
    context.Player.set({
      ...pl,
      settled: pl.settled + 1,
      wins: pl.wins + (r === "win" ? 1 : 0),
      losses: pl.losses + (r === "loss" ? 1 : 0),
      streak,
      bestStreak: Math.max(pl.bestStreak, streak),
      totalProfit: pl.totalProfit + profit,
      biggestWin: profit > pl.biggestWin ? profit : pl.biggestWin,
      upsetsCalled: pl.upsetsCalled + (r === "win" && upset ? 1 : 0),
    });
  }

  // Humans vs AI: score the AI's journaled pick and every human who took the other side.
  if (market.aiAgent) {
    const pick = await context.AgentPick.get(`${p.marketId}-${market.aiAgent}`);
    if (pick) {
      const aiRight = pick.side === outcome;
      context.AgentPick.set({ ...pick, result: aiRight ? "correct" : "wrong" });
      const score = (await context.HumansVsAi.get("global")) ?? {
        id: "global",
        aiWins: 0,
        aiLosses: 0,
        humansBeatAi: 0,
        humansLostToAi: 0,
      };
      let beat = 0;
      let lost = 0;
      for (const addr of market.players) {
        if (addr === market.aiAgent) continue;
        const pos = await context.Position.getOrThrow(positionId(p.marketId, addr));
        const humanSide = pos.yes > pos.no ? "YES" : pos.no > pos.yes ? "NO" : "";
        if (!humanSide || humanSide === pick.side) continue;
        const r = results.get(addr);
        if (r === "win") {
          beat++;
          const pl = await context.Player.getOrThrow(addr);
          context.Player.set({ ...pl, beatAi: pl.beatAi + 1 });
        } else if (r === "loss") lost++;
      }
      context.HumansVsAi.set({
        ...score,
        aiWins: score.aiWins + (aiRight ? 1 : 0),
        aiLosses: score.aiLosses + (aiRight ? 0 : 1),
        humansBeatAi: score.humansBeatAi + beat,
        humansLostToAi: score.humansLostToAi + lost,
      });
    }
  }

  // Duels: a player who came in through someone's link vs. that someone.
  for (const addr of market.players) {
    const pos = await context.Position.getOrThrow(positionId(p.marketId, addr));
    if (!pos.rival || !results.has(pos.rival)) continue;
    const mine = results.get(addr);
    const theirs = results.get(pos.rival);
    if (mine === theirs || mine === "push" || theirs === "push") continue;
    const winner = mine === "win" ? addr : pos.rival;
    const loser = mine === "win" ? pos.rival : addr;
    const w = await context.Player.getOrThrow(winner);
    context.Player.set({ ...w, duelsWon: w.duelsWon + 1 });
    const l = await context.Player.getOrThrow(loser);
    context.Player.set({ ...l, duelsLost: l.duelsLost + 1 });
  }
});

indexer.onEvent({ contract: "CloutMarket", event: "Voided" }, async ({ event, context }) => {
  const market = await context.Market.getOrThrow(event.params.marketId.toString());
  context.Market.set({ ...market, status: "voided" } satisfies Market);
});

indexer.onEvent({ contract: "CloutMarket", event: "Claimed" }, async () => {
  // Payouts are already scored at settlement; claims only move points (read balances on-chain).
});

indexer.onEvent({ contract: "AgentJournal", event: "AgentPick" }, async ({ event, context }) => {
  const p = event.params;
  const agent = p.agent.toLowerCase();
  context.AgentPick.set({
    id: `${p.marketId}-${agent}`,
    market_id: p.marketId.toString(),
    agent,
    side: sideName(p.side),
    confidence: Number(p.confidenceBps) / 100,
    predictedViews: p.predictedViews,
    model: p.model,
    reasoning: p.reasoning,
    result: "open",
    timestamp: event.block.timestamp,
  });
  const market = await context.Market.get(p.marketId.toString());
  if (market) context.Market.set({ ...market, aiAgent: agent });
});

indexer.onEvent({ contract: "CreatorRegistry", event: "CreatorVerified" }, async ({ event, context }) => {
  const p = event.params;
  context.Creator.set({
    id: p.creator.toLowerCase(),
    channelId: p.channelId,
    channelTitle: p.channelTitle,
    verifiedAt: event.block.timestamp,
    active: true,
  });
});

indexer.onEvent({ contract: "CreatorRegistry", event: "CreatorUnlinked" }, async ({ event, context }) => {
  const c = await context.Creator.get(event.params.creator.toLowerCase());
  if (c && c.channelId === event.params.channelId) context.Creator.set({ ...c, active: false });
});
