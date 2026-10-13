import type { Metadata } from "next";
import { HumansVsAi } from "@/components/HumansVsAi";
import { Leaderboard } from "@/components/Leaderboard";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[40px] font-bold uppercase leading-[0.9] tracking-[-0.055em]">Leaderboard</h1>
        <p className="mt-2 text-[15px] text-muted">Best callers on CloutCall. Points can only be won, never bought.</p>
      </div>
      <HumansVsAi />
      <Leaderboard />
    </div>
  );
}
