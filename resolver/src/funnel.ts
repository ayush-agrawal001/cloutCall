/**
 * CloutBot's model funnel: ask each configured model in turn and use the first valid call.
 *
 * Free tiers fail in ordinary ways (daily caps, "temporarily rate-limited upstream", 503 overload, retired
 * model names), so one provider is never enough. Any error, timeout or unparseable answer falls through to the
 * next step. A provider that rate-limits is benched for a while so every market doesn't wait on it again.
 *
 * Order (each step only if its key is set): OpenRouter → Gemini → Kimi. Override the models with
 * OPENROUTER_MODELS / GEMINI_MODELS (comma-separated).
 */
import { buildMessages, KIMI_BASE_URL, KIMI_MODEL, parseAiCall, type AiCall, type MarketContext } from "./kimi";

export type Step = { provider: "openrouter" | "gemini" | "kimi"; model: string };
export type FunnelKeys = { openrouter?: string; gemini?: string; kimi?: string };
export type FunnelResult = AiCall & { model: string; tried: string[] };

const list = (v: string | undefined, fallback: string[]) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : fallback;

export const OPENROUTER_MODELS = list(process.env.OPENROUTER_MODELS, [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/free", // OpenRouter routes to whichever free model is up
]);
export const GEMINI_MODELS = list(process.env.GEMINI_MODELS, [
  "gemini-3.8-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
]);

export function funnelSteps(keys: FunnelKeys): Step[] {
  return [
    ...(keys.openrouter ? OPENROUTER_MODELS.map((model) => ({ provider: "openrouter" as const, model })) : []),
    ...(keys.gemini ? GEMINI_MODELS.map((model) => ({ provider: "gemini" as const, model })) : []),
    ...(keys.kimi ? [{ provider: "kimi" as const, model: KIMI_MODEL }] : []),
  ];
}

const TIMEOUT_MS = 45_000;
const BENCH_MS = 10 * 60_000;
/** step id → time it may be tried again (after a rate limit or quota error). */
const benched = new Map<string, number>();
const id = (s: Step) => `${s.provider}:${s.model}`;

class StepError extends Error {
  constructor(
    message: string,
    readonly rateLimited: boolean,
  ) {
    super(message);
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, fetchImpl: typeof fetch) {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new StepError(`${res.status} ${text.slice(0, 200)}`, res.status === 429 || res.status === 402);
  return JSON.parse(text) as Record<string, unknown>;
}

/** OpenAI-compatible chat completions (OpenRouter, Kimi). Returns the text and the model that answered. */
async function chat(url: string, key: string, model: string, c: MarketContext, fetchImpl: typeof fetch) {
  const b = (await post(
    `${url}/chat/completions`,
    { authorization: `Bearer ${key}` },
    { model, messages: buildMessages(c), temperature: 0.3, response_format: { type: "json_object" } },
    fetchImpl,
  )) as { model?: string; choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  const text = b.choices?.[0]?.message?.content;
  if (!text) throw new StepError(`no content${b.error?.message ? `: ${b.error.message}` : ""}`, false);
  return { text, model: b.model ?? model };
}

async function gemini(key: string, model: string, c: MarketContext, fetchImpl: typeof fetch) {
  const [system, user] = buildMessages(c);
  const b = (await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { "x-goog-api-key": key },
    {
      systemInstruction: { parts: [{ text: system.content }] },
      contents: [{ role: "user", parts: [{ text: user.content }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    },
    fetchImpl,
  )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = b.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new StepError("no content", false);
  return { text, model };
}

/** The first valid call from the funnel. Throws only when every step failed, listing why. */
export async function askFunnel(
  c: MarketContext,
  keys: FunnelKeys,
  opts: { fetchImpl?: typeof fetch; now?: () => number; log?: (msg: string) => void } = {},
): Promise<FunnelResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const steps = funnelSteps(keys);
  if (steps.length === 0) throw new Error("No AI keys set: OPENROUTER_API_KEY, GEMINI_API_KEY or KIMI_API_KEY");
  const tried: string[] = [];
  const failures: string[] = [];
  for (const step of steps) {
    const sid = id(step);
    if ((benched.get(sid) ?? 0) > now()) continue;
    tried.push(sid);
    try {
      const { text, model } =
        step.provider === "gemini"
          ? await gemini(keys.gemini!, step.model, c, fetchImpl)
          : step.provider === "openrouter"
            ? await chat("https://openrouter.ai/api/v1", keys.openrouter!, step.model, c, fetchImpl)
            : await chat(KIMI_BASE_URL, keys.kimi!, step.model, c, fetchImpl);
      const call = parseAiCall(text, c);
      return { ...call, model: `${step.provider}/${model}`.slice(0, 64), tried };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof StepError && e.rateLimited) benched.set(sid, now() + BENCH_MS);
      failures.push(`${sid}: ${msg.slice(0, 120)}`);
      opts.log?.(`  ${sid} failed, trying the next model (${msg.slice(0, 80)})`);
    }
  }
  throw new Error(`every model failed:\n  ${failures.join("\n  ") || "all benched after rate limits"}`);
}

/** For tests: forget benched steps. */
export function resetFunnel() {
  benched.clear();
}
