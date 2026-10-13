import type { Metadata } from "next";
import { AccountPanel } from "@/components/AccountPanel";

export const metadata: Metadata = { title: "Your account" };

export default function MePage() {
  return <AccountPanel />;
}
