import type { NextRequest } from "next/server";
import { googleAuthUrl, signState, verifyLinkRequest } from "@/lib/server/creator";

/** Step 1: the passkey account signed a link request → send the creator to Google (YouTube read-only). */
export async function POST(req: NextRequest) {
  try {
    const address = await verifyLinkRequest(await req.json());
    return Response.json({ url: googleAuthUrl(signState(address), req.nextUrl.origin) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "invalid request" }, { status: 400 });
  }
}
