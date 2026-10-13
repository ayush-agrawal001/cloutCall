import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInFlow } from "@/components/site/SignInFlow";
import { SiteNav } from "@/components/site/SiteNav";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Create your CloutCall account with a passkey, or sign in with the one you have.",
};

export default function SignInPage() {
  return (
    <div className="site-stage">
      <SiteNav links={false} cta={false} />
      <Suspense fallback={<main className="y2k-panel flex-1 animate-pulse" aria-busy />}>
        <SignInFlow />
      </Suspense>
    </div>
  );
}
