"use client";

import { useSyncExternalStore } from "react";
import { PixelIcon } from "./Pixel";

type Theme = "light" | "dark";
const KEY = "cloutcall:theme";

/** Runs before paint (inlined in <head>) so the stored theme applies without a flash. */
export const themeBootScript = `try{var t=localStorage.getItem("${KEY}");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const read = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="btn btn-ghost h-11 px-3.5 py-0 font-mono text-[11px] tracking-[0.1em]"
    >
      <PixelIcon name="contrast" />
      <span className="y2k-hide-m">{theme === "dark" ? "LIGHT" : "DARK"}</span>
    </button>
  );
}
