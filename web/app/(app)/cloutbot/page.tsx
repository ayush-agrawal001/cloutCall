import type { Metadata } from "next";
import { CloutBotCalls } from "@/components/CloutBotCalls";

export const metadata: Metadata = {
  title: "CloutBot's calls",
  description:
    "Every pick the AI rival has made on CloutCall, with its reasoning, recorded on Monad before calls closed.",
};

export default function CloutBotPage() {
  return <CloutBotCalls />;
}
