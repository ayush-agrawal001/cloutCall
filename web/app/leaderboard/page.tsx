import type { Metadata } from "next";
import { Leaderboard } from "@/components/Leaderboard";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Leaderboard</h1>
        <p className="text-muted">Best callers on CloutCall. Points can only be won, never bought.</p>
      </div>
      <Leaderboard />
    </div>
  );
}
