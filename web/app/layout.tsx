import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Silkscreen, Space_Grotesk } from "next/font/google";
import { TourProvider } from "@/components/ArcadeTour";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { themeBootScript } from "@/components/ThemeToggle";
import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });
const silkscreen = Silkscreen({ variable: "--font-silkscreen", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "CloutCall — call the creator", template: "%s · CloutCall" },
  description:
    "Don't buy the creator, call the creator. Predict whether a YouTube video will hit a view target, get your call confirmed on Monad in about a second, and duel your friends. Markets settle after their deadline.",
  openGraph: { siteName: "CloutCall", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#ff00e5" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${grotesk.variable} ${plexMono.variable} ${silkscreen.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full">
        <WalletProvider>
          <TourProvider>
            <div className="y2k-stage">
              <div className="y2k-window">
                <Header />
                <div className="y2k-body">
                  <Sidebar />
                  <main className="y2k-panel y2k-content px-4 pb-8 pt-6 sm:px-7">
                    {children}
                    <p className="mt-12 border-t border-line pt-4 font-mono text-[11px] leading-relaxed text-muted">
                      Play-money points only — CloutCall points are non-transferable and have no cash value. Not
                      affiliated with YouTube or any creator. Built on Monad.
                    </p>
                  </main>
                </div>
                <StatusBar />
              </div>
            </div>
          </TourProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
