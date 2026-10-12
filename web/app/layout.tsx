import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "CloutCall — call the creator", template: "%s · CloutCall" },
  description:
    "Don't buy the creator, call the creator. Predict whether a YouTube video goes viral, settle in under a second on Monad, and duel your friends.",
  openGraph: { siteName: "CloutCall", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#09090f" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6">{children}</main>
        <footer className="mx-auto w-full max-w-5xl px-4 pb-10 text-xs text-muted">
          Play-money points only — CloutCall points are non-transferable and have no cash value. Not affiliated
          with YouTube or any creator. Built on Monad.
        </footer>
      </body>
    </html>
  );
}
