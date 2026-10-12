/** 8×8 pixel-art icons drawn in currentColor, plus a deterministic pixel avatar for addresses. */

const ICONS = {
  home: "M3 0h2v1H3zM2 1h4v1H2zM1 2h6v1H1zM0 3h8v1H0zM1 4h6v1H1zM1 5h2v3H1zM5 5h2v3H5z",
  markets: "M0 0h2v2H0zM4 0h2v2H4zM2 2h2v2H2zM6 2h2v2H6zM0 4h2v2H0zM4 4h2v2H4zM2 6h2v2H2zM6 6h2v2H6z",
  podium: "M3 1h2v7H3zM0 4h3v4H0zM5 3h3v5H5z",
  creator: "M0 1h8v1H0zM0 6h8v1H0zM0 2h1v4H0zM7 2h1v4H7zM3 2h1v4H3zM4 3h1v2H4z",
  user: "M2 0h4v1H2zM1 1h6v3H1zM2 4h4v1H2zM1 5h6v1H1zM0 6h8v2H0z",
  bot: "M3 0h2v1H3zM1 1h6v1H1zM0 2h1v5H0zM7 2h1v5H7zM1 7h6v1H1zM2 3h1v2H2zM5 3h1v2H5zM3 5h2v1H3z",
  bolt: "M4 0h3v1H4zM3 1h3v1H3zM2 2h3v1H2zM1 3h6v1H1zM3 4h3v1H3zM2 5h3v1H2zM2 6h2v1H2zM1 7h2v1H1z",
  lock: "M2 0h4v1H2zM1 1h1v3H1zM6 1h1v3H6zM0 4h8v4H0zM3 5h2v2H3z",
  duel: "M0 0h2v1H0zM1 1h2v1H1zM2 2h1v1H2zM6 0h2v1H6zM5 1h2v1H5zM5 2h1v1H5zM3 3h2v2H3zM2 5h1v1H2zM1 6h2v1H1zM0 7h1v1H0zM5 5h1v1H5zM5 6h2v1H5zM7 7h1v1H7z",
  arrow: "M1 3h5v2H1zM4 1h1v1H4zM5 2h1v1H5zM6 3h1v2H6zM5 5h1v1H5zM4 6h1v1H4z",
  arrowUp: "M1 6h1v1H1zM2 5h1v1H2zM3 4h1v1H3zM4 3h1v1H4zM5 2h1v1H5zM3 1h4v1H3zM6 2h1v3H6z",
  contrast:
    "M2 0h4v1H2zM1 1h1v1H1zM6 1h1v1H6zM0 2h1v4H0zM7 2h1v4H7zM1 6h1v1H1zM6 6h1v1H6zM2 7h4v1H2zM1 2h3v4H1zM2 1h2v1H2zM2 6h2v1H2z",
  eye: "M2 1h4v1H2zM1 2h1v1H1zM6 2h1v1H6zM0 3h1v2H0zM7 3h1v2H7zM1 5h1v1H1zM6 5h1v1H6zM2 6h4v1H2zM3 3h2v2H3z",
} as const;

export type PixelIconName = keyof typeof ICONS;

export function PixelIcon({
  name,
  size = 16,
  className,
  label,
}: {
  name: PixelIconName;
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      fill="currentColor"
      fillRule="evenodd"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/** The four-colour mosaic mark used as the CloutCall logo. */
export function PixelMark({ size = 28 }: { size?: number }) {
  const cells: [number, number, string][] = [
    [0, 0, "#39FF14"],
    [1, 0, "currentColor"],
    [2, 0, "#FF00E5"],
    [3, 0, "currentColor"],
    [0, 1, "currentColor"],
    [1, 1, "#00FFFF"],
    [3, 1, "#39FF14"],
    [0, 2, "#FF00E5"],
    [2, 2, "#39FF14"],
    [3, 2, "currentColor"],
    [1, 3, "currentColor"],
    [2, 3, "#1F3CFF"],
    [3, 3, "#00FFFF"],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 4 4" shapeRendering="crispEdges" aria-hidden>
      {cells.map(([x, y, fill]) => (
        <rect key={`${x}${y}`} x={x} y={y} width={1} height={1} fill={fill} />
      ))}
    </svg>
  );
}

const AVATAR_COLORS = ["#39FF14", "#FF00E5", "#00FFFF", "#1F3CFF", "#FF7A00", "#FFE600"];

/** Mirror-symmetric 8×8 identicon derived from an address (or any string). */
export function PixelAvatar({ seed, size = 32, className }: { seed: string; size?: number; className?: string }) {
  const hex = seed.toLowerCase().replace(/^0x/, "").padEnd(40, "0");
  const nib = (i: number) => parseInt(hex[i % hex.length], 16) || 0;
  const fg = AVATAR_COLORS[nib(0) % AVATAR_COLORS.length];
  const fg2 = AVATAR_COLORS[(nib(1) + 2) % AVATAR_COLORS.length];
  const rects: { x: number; y: number; c: string }[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const n = nib(2 + y * 4 + x);
      if (n < 7) continue;
      const c = n > 12 ? fg2 : fg;
      rects.push({ x, y, c }, { x: 7 - x, y, c });
    }
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      className={className}
      style={{ background: "#242424", border: "1px solid #242424", flex: "none" }}
      aria-hidden
    >
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={1} height={1} fill={r.c} />
      ))}
    </svg>
  );
}
