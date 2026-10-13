import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, LATE_GRACE_SEC, LATE_VOID_REASON, parseDuration, staggeredWindow, suggestThreshold } from "../src/logic";
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

test("late policy: on time resolves as before, late-and-below resolves NO, late-and-above voids", () => {
  const due = 1_000n;
  const m = (id: bigint, threshold: bigint) => ({ id, videoId: `vid${id}xxxxxxx`.slice(0, 11), threshold, resolveTime: due, status: 0 });
  const views = new Map([
    ["vid1xxxxxxx", 150n],
    ["vid2xxxxxxx", 50n],
    ["vid3xxxxxxx", 100n],
  ]);
  const markets = [m(1n, 100n), m(2n, 100n), m(3n, 100n)];

  // Exactly at the edge of the grace window is still on time: existing behaviour, both outcomes.
  assert.deepEqual(decide(markets, views, due + LATE_GRACE_SEC), [
    { kind: "resolve", id: 1n, views: 150n },
    { kind: "resolve", id: 2n, views: 50n },
    { kind: "resolve", id: 3n, views: 100n },
  ]);

  // One second past the grace window.
  assert.deepEqual(decide(markets, views, due + LATE_GRACE_SEC + 1n), [
    { kind: "void", id: 1n, reason: LATE_VOID_REASON }, // above target: can't know when it crossed
    { kind: "resolve", id: 2n, views: 50n }, // still below: below at the deadline too → NO
    { kind: "void", id: 3n, reason: LATE_VOID_REASON }, // exactly at target counts as "at or above"
  ]);
  assert.equal(LATE_GRACE_SEC, 300n);
});

test("missing or invalid view counts never settle as zero", () => {
  const markets = [{ id: 7n, videoId: "aaaaaaaaaaa", threshold: 100n, resolveTime: 50n, status: 0 }];
  // Missing (on time and late): void, not a NO.
  for (const now of [60n, 50n + LATE_GRACE_SEC + 1n]) {
    assert.deepEqual(decide(markets, new Map(), now), [
      { kind: "void", id: 7n, reason: "video unavailable (deleted or private)" },
    ]);
  }
  assert.deepEqual(decide(markets, new Map([["aaaaaaaaaaa", -1n]]), 60n), [
    { kind: "void", id: 7n, reason: "video unavailable (deleted or private)" },
  ]);
  // A blank or malformed viewCount is dropped at parse time instead of becoming 0n.
  for (const viewCount of ["", " ", "12a", "-5", "1.5"]) {
    assert.equal(toStats({ id: "aaaaaaaaaaa", statistics: { viewCount } }), null, `viewCount ${JSON.stringify(viewCount)}`);
  }
  assert.equal(toStats({ id: "aaaaaaaaaaa", statistics: { viewCount: "0" } })?.views, 0n);
});

test("resolved, voided and not-yet-due markets are never acted on", () => {
  const views = new Map([["aaaaaaaaaaa", 999n]]);
  const markets = [
    { id: 1n, videoId: "aaaaaaaaaaa", threshold: 100n, resolveTime: 10n, status: 1 },
    { id: 2n, videoId: "aaaaaaaaaaa", threshold: 100n, resolveTime: 10n, status: 2 },
    { id: 3n, videoId: "aaaaaaaaaaa", threshold: 100n, resolveTime: 10_000n, status: 0 },
  ];
  assert.deepEqual(decide(markets, views, 5_000n), []);
  assert.deepEqual(decide(markets, new Map(), 5_000n), []);
});

test("the three overdue testnet markets (#16–#18, read 12–13 Oct) would all be voided", () => {
  // On-chain params of markets 16–18 and their public view counts ~3.5h after resolveTime.
  const markets = [
    { id: 18n, videoId: "37qhP-qt7BE", threshold: 131_800n, resolveTime: 1_791_818_791n, status: 0 },
    { id: 17n, videoId: "8aKR2Ho--5k", threshold: 3_580_000n, resolveTime: 1_791_818_790n, status: 0 },
    { id: 16n, videoId: "xIlFjHHUfI0", threshold: 889_000n, resolveTime: 1_791_818_788n, status: 0 },
  ];
  const views = new Map([
    ["37qhP-qt7BE", 189_423n],
    ["8aKR2Ho--5k", 5_445_132n],
    ["xIlFjHHUfI0", 1_874_827n],
  ]);
  const now = 1_791_831_577n;
  assert.deepEqual(
    decide(markets, views, now).map((a) => [a.id, a.kind]),
    [
      [18n, "void"],
      [17n, "void"],
      [16n, "void"],
    ],
  );
  // The old behaviour would have resolved all three YES from a count taken hours after the deadline.
  assert.ok(decide(markets, views, now, 1n << 62n).every((a) => a.kind === "resolve"));
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

test("staggeredWindow cycles sprint lengths so a batch settles at different times", () => {
  const mins = [20, 30, 40, 50, 60];
  const ends = [0, 1, 2, 3, 4].map((i) => staggeredWindow(i, mins).resolveIn);
  assert.deepEqual(ends, [1200, 1800, 2400, 3000, 3600]);
  assert.equal(staggeredWindow(5, mins).resolveIn, 1200, "wraps around");
  const w = staggeredWindow(0, mins);
  assert.equal(w.resolveIn - w.closeIn, 300, "calls close 5 minutes before settling");
  // Contract limits: ≥5 min of calls and ≥2 min between closing and settling.
  const tiny = staggeredWindow(0, [6]);
  assert.ok(tiny.closeIn >= 300 && tiny.resolveIn - tiny.closeIn >= 120);
});
