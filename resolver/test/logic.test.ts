import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, parseDuration, suggestThreshold } from "../src/logic";
import { getStats, parseVideoId, toStats } from "../src/youtube";

test("parseVideoId handles ids and common URL shapes", () => {
  assert.equal(parseVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), "dQw4w9WgXcQ");
  assert.equal(parseVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseVideoId("not a video"), null);
});

test("suggestThreshold grows and rounds to 2 significant figures", () => {
  assert.equal(suggestThreshold(1_234_567n, 20), 1_500_000n);
  assert.equal(suggestThreshold(98_000n, 10), 110_000n);
  assert.ok(suggestThreshold(10n, 0) > 10n);
});

test("decide resolves due markets and voids missing videos", () => {
  const markets = [
    { id: 0n, videoId: "aaaaaaaaaaa", threshold: 100n, resolveTime: 50n, status: 0 },
    { id: 1n, videoId: "bbbbbbbbbbb", threshold: 100n, resolveTime: 50n, status: 0 },
    { id: 2n, videoId: "aaaaaaaaaaa", threshold: 100n, resolveTime: 500n, status: 0 },
    { id: 3n, videoId: "aaaaaaaaaaa", threshold: 100n, resolveTime: 10n, status: 1 },
  ];
  const actions = decide(markets, new Map([["aaaaaaaaaaa", 150n]]), 100n);
  assert.deepEqual(actions, [
    { kind: "resolve", id: 0n, views: 150n },
    { kind: "void", id: 1n, reason: "video unavailable (deleted or private)" },
  ]);
});

test("parseDuration", () => {
  assert.equal(parseDuration("90s"), 90);
  assert.equal(parseDuration("2h"), 7200);
  assert.throws(() => parseDuration("soon"));
});

test("getStats parses the YouTube API response", async () => {
  const fake = (async (url: string) => {
    assert.match(String(url), /id=dQw4w9WgXcQ/);
    return new Response(
      JSON.stringify({
        items: [{ id: "dQw4w9WgXcQ", snippet: { title: "Never Gonna", channelTitle: "Rick" }, statistics: { viewCount: "1700000000" } }],
      }),
    );
  }) as typeof fetch;
  const stats = await getStats(["dQw4w9WgXcQ", "deletedvid1"], "KEY", fake);
  assert.equal(stats.get("dQw4w9WgXcQ")?.views, 1_700_000_000n);
  assert.equal(stats.has("deletedvid1"), false);
  assert.equal(toStats({ id: "x" }), null);
});

test("sprintThreshold projects the upload's pace over the window", async () => {
  const { sprintThreshold } = await import("../src/logic");
  // 600k views in 3h = 200k/h; 30 min window at 0.8 decay = +80k
  assert.equal(sprintThreshold(600_000n, 3, 0.5), 680_000n);
  // readable rounding at the scale of the gain
  assert.equal(sprintThreshold(1_234_567n, 10, 0.5), 1_284_000n);
  assert.ok(sprintThreshold(50n, 0.1, 0.5) > 50n);
});
