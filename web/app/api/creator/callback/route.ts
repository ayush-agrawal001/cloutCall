import type { NextRequest } from "next/server";
import { attestOnchain, channelFromCode, readState } from "@/lib/server/creator";

/** Step 2: Google redirects back → read the user's own channel → attest the link on-chain. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const back = new URL("/creator", req.nextUrl.origin);
  try {
    if (q.get("error")) throw new Error(q.get("error")!);
    const address = readState(q.get("state") ?? "");
    const { channelId, title } = await channelFromCode(q.get("code") ?? "", req.nextUrl.origin);
    await attestOnchain(address, channelId, title);
    back.searchParams.set("verified", title);
  } catch (e) {
    back.searchParams.set("error", e instanceof Error ? e.message : "verification failed");
  }
  return Response.redirect(back, 303);
}
