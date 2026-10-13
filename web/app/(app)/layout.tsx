import type { ReactNode } from "react";
import { TourAutoOpen } from "@/components/ArcadeTour";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";

/** The game itself: the Y2K application window with title bar, sidebar and status ticker. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="y2k-stage">
      <TourAutoOpen />
      <div className="y2k-window">
        <Header />
        <div className="y2k-body">
          <Sidebar />
          <main className="y2k-panel y2k-content px-4 pb-8 pt-6 sm:px-7">
            {children}
            <p className="mt-12 border-t border-line pt-4 font-mono text-[11px] leading-relaxed text-muted">
              Play-money points only — CloutCall points are non-transferable and have no cash value. Not affiliated with
              YouTube or any creator. Built on Monad.
            </p>
          </main>
        </div>
        <StatusBar />
      </div>
    </div>
  );
}
