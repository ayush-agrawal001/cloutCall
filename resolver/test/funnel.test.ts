import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { askFunnel, funnelSteps, resetFunnel } from "../src/funnel";
import type { MarketContext } from "../src/kimi";

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
const answer = '{"side":"NO","confidence":70,"predictedViews":520000,"reasoning":"pace too slow"}';
const keys = { openrouter: "OR", gemini: "GM", kimi: "KM" };
const chatOk = (model: string) =>
  new Response(JSON.stringify({ model, choices: [{ message: { content: answer } }] }), { status: 200 });
const geminiOk = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }] }), { status: 200 });

beforeEach(resetFunnel);

test("steps follow the key order: OpenRouter, then Gemini, then Kimi", () => {
  const p = funnelSteps(keys).map((s) => s.provider);
  assert.equal(p[0], "openrouter");
  assert.equal(p.at(-1), "kimi");
  assert.ok(p.indexOf("gemini") > p.lastIndexOf("openrouter"));
  assert.deepEqual(
    funnelSteps({ gemini: "GM" }).map((s) => s.provider),
    funnelSteps({ gemini: "GM" }).map(() => "gemini"),
  );
  assert.equal(funnelSteps({}).length, 0);
});

test("the first working model answers and is recorded", async () => {
  const seen: string[] = [];
  const fake = (async (url: string) => {
    seen.push(String(url));
    return chatOk("nvidia/nemotron");
  }) as typeof fetch;
  const r = await askFunnel(ctx, keys, { fetchImpl: fake });
  assert.equal(r.side, "NO");
  assert.equal(r.model, "openrouter/nvidia/nemotron");
  assert.equal(seen.length, 1);
});

test("failures and bad answers fall through to Gemini", async () => {
  const fake = (async (url: string) => {
    if (String(url).includes("openrouter")) return new Response('{"choices":[{"message":{"content":"not json"}}]}');
    return geminiOk();
  }) as typeof fetch;
  const r = await askFunnel(ctx, keys, { fetchImpl: fake });
  assert.match(r.model, /^gemini\//);
  assert.ok(r.tried.length >= 2);
});

test("a rate-limited model is benched for later calls", async () => {
  let openrouterCalls = 0;
  const fake = (async (url: string) => {
    if (String(url).includes("openrouter")) {
      openrouterCalls++;
      return new Response('{"error":"rate limited"}', { status: 429 });
    }
    return geminiOk();
  }) as typeof fetch;
  let t = 1_000;
  await askFunnel(ctx, keys, { fetchImpl: fake, now: () => t });
  const first = openrouterCalls;
  await askFunnel(ctx, keys, { fetchImpl: fake, now: () => t });
  assert.equal(openrouterCalls, first, "benched models aren't retried right away");
  t += 11 * 60_000;
  await askFunnel(ctx, keys, { fetchImpl: fake, now: () => t });
  assert.ok(openrouterCalls > first, "and come back after the bench time");
});

test("when every model fails the error lists each one", async () => {
  const fake = (async () => new Response("down", { status: 503 })) as typeof fetch;
  await assert.rejects(askFunnel(ctx, keys, { fetchImpl: fake }), /every model failed[\s\S]*gemini/);
  await assert.rejects(askFunnel(ctx, {}), /No AI keys/);
});
