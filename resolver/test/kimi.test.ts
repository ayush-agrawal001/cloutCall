import assert from "node:assert/strict";
import { test } from "node:test";
import { askKimi, buildMessages, parseAiCall, signals, stakeFor, stakeWithin, type MarketContext } from "../src/kimi";

const ctx: MarketContext = {
  title: "Big upload",
  channel: "Creator",
  hoursSincePublish: 4,
  views: 400_000,
  likes: 20_000,
  comments: 1_000,
  threshold: 600_000,
  hoursToResolve: 2,
};

test("signals compare current pace with the pace the target needs", () => {
  const s = signals(ctx);
  assert.equal(s.avgViewsPerHour, 100_000);
  assert.equal(s.neededViewsPerHour, 100_000);
  assert.equal(s.likeRatePct, 5);
  assert.equal(s.gapToTarget, 200_000);
});

test("prompt carries the question and the numbers", () => {
  const [system, user] = buildMessages(ctx);
  assert.match(system.content, /JSON only/);
  assert.match(user.content, /600000/);
  assert.match(user.content, /neededViewsPerHour/);
});

test("parseAiCall validates and clamps model output", () => {
  const c = parseAiCall('```json\n{"side":"no","confidence":120,"predictedViews":10,"reasoning":"  slows   down "}\n```', ctx);
  assert.deepEqual(c, { side: "NO", confidence: 95, predictedViews: 400_000, reasoning: "slows down" });
  assert.throws(() => parseAiCall('{"side":"maybe"}', ctx));
});

test("stake grows with confidence", () => {
  assert.equal(stakeFor(50), 50);
  assert.equal(stakeFor(95), 300);
  assert.ok(stakeFor(70) > stakeFor(60));
});

test("askKimi calls the OpenAI-compatible endpoint with JSON mode", async () => {
  const fake = (async (url: string, init?: RequestInit) => {
    assert.match(String(url), /\/chat\/completions$/);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.response_format.type, "json_object");
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer KEY");
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"side":"YES","confidence":72,"predictedViews":650000,"reasoning":"pace matches"}' } }],
      }),
    );
  }) as typeof fetch;
  const call = await askKimi(ctx, "KEY", fake);
  assert.equal(call.side, "YES");
  assert.equal(call.confidence, 72);
});

test("stakeWithin caps a bet at a fifth of the balance and sits out when broke", () => {
  assert.equal(stakeWithin(95, 10_000), 300);
  assert.equal(stakeWithin(95, 500), 100);
  assert.equal(stakeWithin(60, 40), 0, "8 points is below the 10-point minimum call");
  assert.equal(stakeWithin(50, 0), 0);
});
