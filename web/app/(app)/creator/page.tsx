import type { Metadata } from "next";
import { Suspense } from "react";
import { CreatorPanel } from "@/components/CreatorPanel";

export const metadata: Metadata = { title: "Creator mode" };

export default function CreatorPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-black">Creator mode</h1>
        <p className="text-muted">
          Host hype markets on your own uploads. Your fans call it, duel each other and the AI — you get the watch time.
          Nothing about your channel is tokenized or sold.
        </p>
      </div>
      <Suspense fallback={<div className="card h-40 animate-pulse" />}>
        <CreatorPanel />
      </Suspense>
    </div>
  );
}
