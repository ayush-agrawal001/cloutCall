/**
 * The AI rival's brain: Kimi (Moonshot AI), via its OpenAI-compatible chat completions API.
 * Given a market and the video's live signals, it returns a structured call.
 */

export type MarketContext = {
  title: string;
  channel: string;
  hoursSincePublish: number;
  views: number;
  likes: number;
  comments: number;
  threshold: number;
  hoursToResolve: number;
};

export type AiCall = { side: "YES" | "NO"; confidence: number; predictedViews: number; reasoning: string };

export const KIMI_BASE_URL = process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1";
export const KIMI_MODEL = process.env.KIMI_MODEL ?? "kimi-k2.6";

/** Derived signals we hand the model so it reasons from numbers, not vibes. */
export function signals(c: MarketContext) {
  const avgPerHour = c.hoursSincePublish > 0 ? c.views / c.hoursSincePublish : c.views;
  const neededPerHour = c.hoursToResolve > 0 ? Math.max(0, c.threshold - c.views) / c.hoursToResolve : Infinity;
  return {
    avgViewsPerHour: Math.round(avgPerHour),
    neededViewsPerHour: Number.isFinite(neededPerHour) ? Math.round(neededPerHour) : null,
    likeRatePct: c.views > 0 ? +((c.likes / c.views) * 100).toFixed(2) : 0,
    commentRatePct: c.views > 0 ? +((c.comments / c.views) * 100).toFixed(3) : 0,
    gapToTarget: Math.max(0, c.threshold - c.views),
  };
}

export function buildMessages(c: MarketContext) {
  const s = signals(c);
  return [
    {
      role: "system",
      content:
        "You are CloutBot, an analyst who predicts YouTube view counts. Views usually decay after the first " +
        "hours of an upload; strong like/comment rates and big channels sustain momentum. Be calibrated: " +
        "confidence 50 means a coin flip. Reply with JSON only: " +
        '{"side":"YES"|"NO","confidence":50-95,"predictedViews":integer,"reasoning":"max 240 chars, cite the numbers"}',
    },
    {
      role: "user",
      content: JSON.stringify({
        question: `Will this video have at least ${c.threshold} views in ${c.hoursToResolve.toFixed(2)} hours?`,
        video: { title: c.title, channel: c.channel, hoursSincePublish: +c.hoursSincePublish.toFixed(2) },
        now: { views: c.views, likes: c.likes, comments: c.comments },
        signals: s,
      }),
    },
  ];
}

/** Validates and clamps the model's JSON so nothing malformed reaches the chain. */
export function parseAiCall(raw: string, c: MarketContext): AiCall {
  const json = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim()) as Partial<AiCall>;
  const side =
    String(json.side).toUpperCase() === "NO" ? "NO" : String(json.side).toUpperCase() === "YES" ? "YES" : null;
  if (!side) throw new Error(`model returned no side: ${raw.slice(0, 200)}`);
  const confidence = Math.min(95, Math.max(50, Math.round(Number(json.confidence) || 50)));
  const predictedViews = Math.max(c.views, Math.round(Number(json.predictedViews) || c.views));
  const reasoning =
    String(json.reasoning ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240) || "No reasoning given.";
  return { side, confidence, predictedViews, reasoning };
}

/** Bigger stake when more confident: 50 points at a coin flip up to 300 at 95%. */
export function stakeFor(confidence: number) {
  return Math.round(50 + ((confidence - 50) / 45) * 250);
}

/** CloutBot never bets more than a fifth of what it holds, so one bad run can't empty it. 0 = sit this one out. */
export function stakeWithin(confidence: number, balance: number, share = 0.2, min = 10) {
  const stake = Math.min(stakeFor(confidence), Math.floor(balance * share));
  return stake >= min ? stake : 0;
}

export async function askKimi(c: MarketContext, apiKey: string, fetchImpl = fetch): Promise<AiCall> {
  const res = await fetchImpl(`${KIMI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages: buildMessages(c),
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Kimi API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Kimi returned no content");
  return parseAiCall(content, c);
}
