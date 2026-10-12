import { createHmac, timingSafeEqual } from "node:crypto";
import { createWalletClient, http, isAddress, verifyMessage, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { registryAbi } from "../abi";
import { chain, publicClient, REGISTRY_ADDRESS, RPC_URL } from "../chain";

import { LINK_MESSAGE_PREFIX } from "../creatorLink";

const STATE_TTL_MS = 10 * 60 * 1000;

/** Checks the passkey account really asked to be linked, recently. */
export async function verifyLinkRequest(
  body: { address?: string; message?: string; signature?: string },
  now = Date.now(),
): Promise<Address> {
  const { address, message, signature } = body;
  if (!address || !isAddress(address) || !message || !signature) throw new Error("missing fields");
  if (!message.startsWith(`${LINK_MESSAGE_PREFIX}${address}\n`)) throw new Error("message does not match address");
  const issued = Date.parse(message.match(/\nIssued: (.+)\n/)?.[1] ?? "");
  if (!Number.isFinite(issued) || now - issued > STATE_TTL_MS || issued - now > 60_000)
    throw new Error("link request expired");
  const ok = await verifyMessage({ address, message, signature: signature as Hex });
  if (!ok) throw new Error("bad signature");
  return address;
}

function secret() {
  const s = process.env.CREATOR_STATE_SECRET;
  if (!s || s.length < 16) throw new Error("CREATOR_STATE_SECRET not configured");
  return s;
}

/** OAuth `state`: the address being linked + expiry, HMAC'd so the callback can trust it. */
export function signState(address: Address, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ a: address, e: now + STATE_TTL_MS })).toString("base64url");
  const mac = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function readState(state: string, now = Date.now()): Address {
  const [payload, mac] = state.split(".");
  if (!payload || !mac) throw new Error("bad state");
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error("bad state");
  const { a, e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { a: Address; e: number };
  if (now > e) throw new Error("state expired");
  return a;
}

export function redirectUri(origin: string) {
  return `${process.env.NEXT_PUBLIC_SITE_URL || origin}/api/creator/callback`;
}

export function googleAuthUrl(state: string, origin: string) {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID not configured");
  const q = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Code → short-lived access token → the signed-in user's own channel. The token is never stored. */
export async function channelFromCode(code: string, origin: string, fetchImpl = fetch) {
  const tokenRes = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error(`token exchange failed (${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) throw new Error("no access token");
  const chRes = await fetchImpl("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!chRes.ok) throw new Error(`channel lookup failed (${chRes.status})`);
  const ch = ((await chRes.json()) as { items?: { id: string; snippet?: { title?: string } }[] }).items?.[0];
  if (!ch) throw new Error("this Google account has no YouTube channel");
  return { channelId: ch.id, title: ch.snippet?.title ?? ch.id };
}

/** Writes the link on-chain from the verifier account. */
export async function attestOnchain(creator: Address, channelId: string, title: string) {
  const key = process.env.VERIFIER_PRIVATE_KEY as Hex | undefined;
  if (!key || !REGISTRY_ADDRESS) throw new Error("creator verification not configured");
  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(RPC_URL) });
  const hash = await wallet.writeContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "attest",
    args: [creator, channelId, title.slice(0, 80)],
  });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("attestation reverted");
  return hash;
}
