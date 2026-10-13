"use client";

import { useEffect, useRef } from "react";

/*
 * Animated background behind the landing page panels.
 * Light: the rainbow plays like a live VHS feed — slices wobble, tracking tears flick across, a CRT bar rolls down.
 * Dark: the same feed dimmed to a night glow, with neon tetrominoes dropping through it a row at a time.
 * Reduced motion gets one still frame. The still image under the canvases shows until they're ready.
 */

const SRC = "/y2k/bg-rainbow.webp";
const FRAME_MS = 1000 / 30;
/** Height of each horizontal slice the wobble shifts, in CSS px. */
const SLICE = 4;
/** Extra image width on each side, so shifted slices never show an edge. Covers wobble + the widest tear. */
const OVERSCAN = 160;
/** How fast the feed rolls upward, in px per second. */
const ROLL = 12;
/** Dark mode's dim: the canvas equivalent of `filter: brightness(0.35) saturate(1.6)` on .site-backdrop::before. */
const DIM = 0.35;
const SAT = 1.6;
const GLOW = 10;
const NEON = ["#00ffff", "#ffe600", "#ff00e5", "#39ff14", "#ff2a2a", "#3d5bff", "#ff7a00"];

type Cell = [number, number];
// prettier-ignore
const TETROMINOES: Cell[][] = [
  [[0, 0], [1, 0], [2, 0], [3, 0]], // I
  [[0, 0], [1, 0], [0, 1], [1, 1]], // O
  [[0, 0], [1, 0], [2, 0], [1, 1]], // T
  [[1, 0], [2, 0], [0, 1], [1, 1]], // S
  [[0, 0], [1, 0], [1, 1], [2, 1]], // Z
  [[0, 0], [0, 1], [1, 1], [2, 1]], // J
  [[2, 0], [0, 1], [1, 1], [2, 1]], // L
];

type Piece = { cells: Cell[]; col: number; row: number; color: number; every: number; next: number };
type Tear = { y: number; h: number; dx: number; until: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (n: number) => Math.floor(Math.random() * n);

function rotate(cells: Cell[]): Cell[] {
  const turned = cells.map(([x, y]): Cell => [-y, x]);
  const minX = Math.min(...turned.map((c) => c[0]));
  const minY = Math.min(...turned.map((c) => c[1]));
  return turned.map(([x, y]) => [x - minX, y - minY]);
}

/** Horizontal shift for the slice at height y: three sine waves drifting at different speeds. */
function wobble(y: number, t: number) {
  return 9 * Math.sin(y * 0.011 + t * 0.9) + 5 * Math.sin(y * 0.031 - t * 1.7) + 2 * Math.sin(y * 0.09 + t * 3.1);
}

/**
 * The rainbow dimmed for dark mode, baked once with the same maths as the CSS filter so the
 * browser doesn't have to re-filter the whole screen on every frame.
 */
function nightImage(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.213 * d[i] + 0.715 * d[i + 1] + 0.072 * d[i + 2];
    d[i] = DIM * (l + SAT * (d[i] - l));
    d[i + 1] = DIM * (l + SAT * (d[i + 1] - l));
    d[i + 2] = DIM * (l + SAT * (d[i + 2] - l));
  }
  g.putImageData(px, 0, 0);
  return c;
}

/** One bevelled, glowing Tetris cell, pre-rendered so each frame is a plain blit. */
function blockSprite(color: string, size: number, dpr: number) {
  const c = document.createElement("canvas");
  c.width = c.height = Math.ceil((size + GLOW * 2) * dpr);
  const g = c.getContext("2d")!;
  g.scale(dpr, dpr);
  g.translate(GLOW, GLOW);
  g.shadowColor = color;
  g.shadowBlur = GLOW;
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  g.shadowBlur = 0;
  const b = Math.max(2, Math.round(size / 7));
  g.fillStyle = "rgba(255, 255, 255, 0.5)";
  g.fillRect(0, 0, size, b);
  g.fillRect(0, b, b, size - b);
  g.fillStyle = "rgba(0, 0, 0, 0.35)";
  g.fillRect(b, size - b, size - b, b);
  g.fillRect(size - b, b, b, size - b * 2);
  g.fillStyle = "#ffffff";
  g.fillRect(b, b, b, b);
  g.strokeStyle = "#0d0d0f";
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, size - 1, size - 1);
  return c;
}

export function SiteBackdrop() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLCanvasElement>(null);
  const blocksRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const flow = flowRef.current;
    const blocks = blocksRef.current;
    const fx = flow?.getContext("2d");
    const bx = blocks?.getContext("2d");
    if (!wrap || !flow || !blocks || !fx || !bx) return;

    const root = document.documentElement;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const img = new Image();
    const t0 = performance.now();
    let dark = root.dataset.theme === "dark";
    let tile: HTMLCanvasElement | null = null;
    let vw = 0;
    let vh = 0;
    let dpr = 1;
    let cell = 0;
    let cols = 0;
    let rows = 0;
    let sprites: HTMLCanvasElement[] = [];
    const pieces: Piece[] = [];
    let tears: Tear[] = [];
    let nextTear = 0;
    let raf = 0;
    let last = 0;

    // The image stacked normal / flipped / normal, so the feed can roll forever without a seam.
    const buildTile = () => {
      if (!img.naturalWidth) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const src = dark ? nightImage(img) : img;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h * 3;
      const g = c.getContext("2d")!;
      g.drawImage(src, 0, 0);
      g.save();
      g.translate(0, h * 2);
      g.scale(1, -1);
      g.drawImage(src, 0, 0);
      g.restore();
      g.drawImage(src, 0, h * 2);
      tile = c;
    };

    const spawn = (now: number, anywhere: boolean): Piece => {
      let cells = TETROMINOES[randInt(TETROMINOES.length)];
      for (let i = randInt(4); i > 0; i--) cells = rotate(cells);
      const width = Math.max(...cells.map((c) => c[0])) + 1;
      const every = rand(150, 420);
      return {
        cells,
        col: randInt(Math.max(1, cols - width + 1)),
        row: anywhere ? randInt(rows + 4) - 4 : -4,
        color: randInt(NEON.length),
        every,
        next: now + rand(0, every),
      };
    };

    const size = () => {
      vw = flow.clientWidth;
      vh = flow.clientHeight;
      flow.width = vw;
      flow.height = vh;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      blocks.width = Math.round(vw * dpr);
      blocks.height = Math.round(vh * dpr);
      cell = vw < 760 ? 16 : 22;
      sprites = NEON.map((c) => blockSprite(c, cell, dpr));
      cols = Math.ceil(vw / cell);
      rows = Math.ceil(vh / cell);
      const want = Math.max(6, Math.round(cols / 3.5));
      const now = performance.now();
      while (pieces.length < want) pieces.push(spawn(now, true));
      pieces.length = want;
    };

    const drawFlow = (now: number) => {
      if (!tile) return;
      const moving = !still.matches;
      const t = (now - t0) / 1000;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const s = Math.max((vw + OVERSCAN * 2) / iw, vh / ih);
      const dw = iw * s;
      const dh = ih * s;
      const x0 = (vw - dw) / 2;
      const scroll = ((dh - vh) / 2 + (moving ? t * ROLL : 0)) % (dh * 2);

      if (moving && now > nextTear) {
        nextTear = now + rand(1800, 5200);
        for (let i = 1 + randInt(3); i > 0; i--) {
          tears.push({
            y: rand(0, vh),
            h: rand(4, 60),
            dx: rand(40, 130) * (Math.random() < 0.5 ? -1 : 1),
            until: now + rand(70, 240),
          });
        }
      }
      tears = tears.filter((r) => r.until > now);

      for (let y = 0; y < vh; y += SLICE) {
        let dx = moving ? wobble(y, t) : 0;
        for (const r of tears) if (y + SLICE > r.y && y < r.y + r.h) dx += r.dx;
        fx.drawImage(tile, 0, (scroll + y) / s, iw, SLICE / s, x0 + dx, y, dw, SLICE);
      }

      fx.fillStyle = "rgba(255, 255, 255, 0.55)";
      for (const r of tears) {
        fx.fillRect(0, r.y, vw, 1);
        fx.fillRect(0, r.y + r.h, vw, 1);
      }

      if (moving) {
        // CRT refresh bar rolling down the screen.
        const by = ((t * 70) % (vh + 300)) - 150;
        const bar = fx.createLinearGradient(0, by - 150, 0, by + 150);
        bar.addColorStop(0, "rgba(255, 255, 255, 0)");
        bar.addColorStop(0.5, "rgba(255, 255, 255, 0.12)");
        bar.addColorStop(1, "rgba(255, 255, 255, 0)");
        fx.fillStyle = bar;
        fx.fillRect(0, by - 150, vw, 300);
      }
    };

    /** Drops every piece whose turn has come; returns whether anything moved. */
    const stepBlocks = (now: number) => {
      let moved = false;
      pieces.forEach((p, i) => {
        if (now < p.next) return;
        moved = true;
        p.next = now + p.every;
        p.row += 1;
        const roll = Math.random();
        if (roll < 0.14) p.cells = rotate(p.cells);
        else if (roll < 0.28) p.col = Math.min(Math.max(p.col + (roll < 0.21 ? -1 : 1), 0), cols - 1);
        if (p.row > rows) pieces[i] = spawn(now, false);
      });
      return moved;
    };

    // Drawn whatever the theme (CSS hides this canvas in light mode), so a switch to dark shows blocks at once.
    const drawBlocks = () => {
      bx.clearRect(0, 0, blocks.width, blocks.height);
      for (const p of pieces) {
        for (const [x, y] of p.cells) {
          if (p.row + y < -1) continue;
          bx.drawImage(sprites[p.color], ((p.col + x) * cell - GLOW) * dpr, ((p.row + y) * cell - GLOW) * dpr);
        }
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS - 2) return;
      last = now;
      drawFlow(now);
      if (dark && stepBlocks(now)) drawBlocks();
    };

    const start = () => {
      cancelAnimationFrame(raf);
      size();
      drawFlow(performance.now());
      drawBlocks();
      if (!still.matches) raf = requestAnimationFrame(frame);
    };

    const onResize = () => {
      size();
      drawFlow(performance.now());
      drawBlocks();
    };

    const themeWatch = new MutationObserver(() => {
      if ((root.dataset.theme === "dark") === dark) return;
      dark = !dark;
      buildTile();
      drawFlow(performance.now());
    });

    img.onload = () => {
      buildTile();
      start();
      wrap.dataset.ready = "";
    };
    img.src = SRC;
    themeWatch.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", onResize);
    still.addEventListener("change", start);

    return () => {
      cancelAnimationFrame(raf);
      img.onload = null;
      themeWatch.disconnect();
      window.removeEventListener("resize", onResize);
      still.removeEventListener("change", start);
    };
  }, []);

  return (
    <div ref={wrapRef} aria-hidden className="site-backdrop">
      <canvas ref={flowRef} />
      <canvas ref={blocksRef} className="site-backdrop-blocks" />
    </div>
  );
}
