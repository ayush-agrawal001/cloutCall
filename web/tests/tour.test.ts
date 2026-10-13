/** First-login tour rules (run: npx tsx --test tests/tour.test.ts). No browser, chain or server needed. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasSeenTour,
  rememberTour,
  setupComplete,
  SLIDE_MS,
  tick,
  tourKey,
  tourSlides,
  type TourAccountState,
} from "../lib/tour";

const A = "0xAbC0000000000000000000000000000000000001";
const B = "0x0000000000000000000000000000000000000002";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

const ready: TourAccountState = { status: "ready", address: A, settingUp: false };

test("opens only once the session is ready and setup has finished", () => {
  assert.equal(setupComplete(ready), true);
  assert.equal(setupComplete({ ...ready, status: "signed-out", address: undefined }), false);
  assert.equal(setupComplete({ ...ready, status: "connecting" }), false);
  assert.equal(setupComplete({ ...ready, status: "funding" }), false, "still setting up after sign-in");
  assert.equal(setupComplete({ ...ready, address: undefined }), false);
  assert.equal(setupComplete({ ...ready, settingUp: true }), false, "a retry is running");
  assert.equal(setupComplete({ ...ready, setupError: "Gas sponsor is busy" }), false, "setup failed");
});

test("setup error → retry → success: hidden until the retry clears the error", () => {
  const steps: TourAccountState[] = [
    { ...ready, setupError: "Couldn't sponsor gas right now" },
    { ...ready, settingUp: true }, // finishSetup clears the error and sets settingUp together
    ready,
  ];
  assert.deepEqual(
    steps.map((s) => setupComplete(s)),
    [false, false, true],
  );
});

test("does not depend on the points balance", () => {
  // TourAccountState has no balance at all: a player who spent every point still counts as set up.
  assert.equal(setupComplete({ ...ready }), true);
});

test("remembered per account and per network, case-insensitively", () => {
  const kv = memory();
  assert.equal(hasSeenTour(10143, A, kv), false);
  rememberTour(10143, A, "skipped", kv);
  assert.equal(hasSeenTour(10143, A, kv), true);
  assert.equal(hasSeenTour(10143, A.toLowerCase(), kv), true);
  assert.equal(hasSeenTour(10143, B, kv), false, "another persona is a separate account");
  assert.equal(hasSeenTour(31337, A, kv), false, "another network starts fresh");
  assert.match(tourKey(10143, A), /^cloutcall\.tour\.v\d+:10143:0xabc0/);
  assert.equal(JSON.parse(kv.m.get(tourKey(10143, A))!).outcome, "skipped");
});

test("storage that throws or is missing never breaks the app", () => {
  const broken = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(hasSeenTour(10143, A, broken), false);
  assert.doesNotThrow(() => rememberTour(10143, A, "completed", broken));
  assert.equal(hasSeenTour(10143, A, undefined), false); // server render: no window
  assert.doesNotThrow(() => rememberTour(10143, A, "completed", undefined));
});

test("timer advances by real frame time and never skips slides after a long gap", () => {
  let t = { elapsed: 0, done: false };
  for (let i = 0; i < 6; i++) t = tick(t.elapsed, 250); // a slow device at 4 frames a second
  assert.equal(t.elapsed, 1500, "slow frames still count in full");
  t = tick(t.elapsed, 60_000); // back from a backgrounded tab
  assert.equal(t.done, false, "one huge gap can't finish the slide");
  t = { elapsed: SLIDE_MS - 10, done: false };
  t = tick(t.elapsed, 16);
  assert.deepEqual(t, { elapsed: SLIDE_MS, done: true });
  assert.equal(tick(100, -50).elapsed, 100, "clock going backwards is ignored");
});

test("six slides; the AI rival is only mentioned when it is configured", () => {
  const on = tourSlides({ aiEnabled: true });
  const off = tourSlides({ aiEnabled: false });
  assert.equal(on.length, 6);
  assert.equal(off.length, 6);
  const labels = (s: typeof on) => s[5].items!.map((i) => i.label);
  assert.ok(labels(on).includes("CloutBot"));
  assert.ok(!labels(off).includes("CloutBot"));
  assert.ok(!JSON.stringify(off).includes("CloutBot"));
});

test("copy avoids claims the code doesn't back", () => {
  const text = JSON.stringify(tourSlides({ aiEnabled: true })).toLowerCase();
  for (const banned of ["smart account", "embedded wallet", "gasless", "guaranteed reward"]) {
    assert.ok(!text.includes(banned), `must not say "${banned}"`);
  }
  assert.ok(text.includes("not a paymaster"));
  assert.ok(text.includes("no cash value"));
});
