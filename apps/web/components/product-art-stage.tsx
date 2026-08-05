/** Provides accessible deterministic SVG staging and identifiers for product art. */

import type { ReactNode } from "react";

import styles from "./product-art.module.css";

function Defs({ p }: { p: string }) {
  return (
    <defs>
      <linearGradient id={`${p}-sweep`} x1="0.12" y1="0" x2="0.42" y2="1">
        <stop offset="0" stopColor="var(--art-hi)" />
        <stop offset="0.44" stopColor="var(--art-mid)" />
        <stop offset="0.82" stopColor="var(--art-lo)" />
        <stop offset="1" stopColor="var(--art-deep)" />
      </linearGradient>
      <radialGradient id={`${p}-pool`} cx="0.26" cy="0.1" r="0.74">
        <stop offset="0" stopColor="var(--art-light)" stopOpacity="0.5" />
        <stop offset="0.5" stopColor="var(--art-light)" stopOpacity="0.13" />
        <stop offset="1" stopColor="var(--art-light)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}-vig`} cx="0.5" cy="0.42" r="0.76">
        <stop offset="0.46" stopColor="var(--art-shade)" stopOpacity="0" />
        <stop offset="1" stopColor="var(--art-shade)" stopOpacity="0.22" />
      </radialGradient>
      <linearGradient id={`${p}-key`} x1="0.06" y1="0" x2="0.84" y2="1">
        <stop offset="0" stopColor="var(--art-light)" stopOpacity="0.66" />
        <stop offset="0.4" stopColor="var(--art-light)" stopOpacity="0" />
        <stop offset="0.6" stopColor="var(--art-shade)" stopOpacity="0" />
        <stop offset="1" stopColor="var(--art-shade)" stopOpacity="0.4" />
      </linearGradient>
      <radialGradient id={`${p}-contact`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="var(--art-shade)" stopOpacity="0.46" />
        <stop offset="0.48" stopColor="var(--art-shade)" stopOpacity="0.16" />
        <stop offset="1" stopColor="var(--art-shade)" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${p}-petal`} x1="0.5" y1="1" x2="0.5" y2="0">
        <stop offset="0" stopColor="var(--art-bloom-lo)" />
        <stop offset="0.4" stopColor="var(--art-bloom)" />
        <stop offset="0.86" stopColor="var(--art-bloom-hi)" />
        <stop offset="1" stopColor="var(--art-bloom-hi)" />
      </linearGradient>
      <linearGradient id={`${p}-petal-deep`} x1="0.5" y1="1" x2="0.5" y2="0">
        <stop offset="0" stopColor="var(--art-bloom-ink)" />
        <stop offset="0.5" stopColor="var(--art-bloom-lo)" />
        <stop offset="1" stopColor="var(--art-bloom)" />
      </linearGradient>
      <radialGradient id={`${p}-dome-hi`} cx="0.34" cy="0.28" r="0.6">
        <stop offset="0" stopColor="var(--art-light)" stopOpacity="0.5" />
        <stop offset="0.5" stopColor="var(--art-light)" stopOpacity="0.12" />
        <stop offset="1" stopColor="var(--art-light)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}-dome-lo`} cx="0.68" cy="0.74" r="0.62">
        <stop offset="0" stopColor="var(--art-shade)" stopOpacity="0.4" />
        <stop offset="0.62" stopColor="var(--art-shade)" stopOpacity="0.08" />
        <stop offset="1" stopColor="var(--art-shade)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}-rim`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="var(--art-shade)" stopOpacity="0" />
        <stop offset="0.7" stopColor="var(--art-shade)" stopOpacity="0" />
        <stop offset="1" stopColor="var(--art-shade)" stopOpacity="0.34" />
      </radialGradient>
      <radialGradient id={`${p}-hollow`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="var(--art-shade)" stopOpacity="0.52" />
        <stop offset="0.6" stopColor="var(--art-shade)" stopOpacity="0.16" />
        <stop offset="1" stopColor="var(--art-shade)" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${p}-leaf`} x1="0.5" y1="1" x2="0.5" y2="0">
        <stop offset="0" stopColor="var(--art-leaf-lo)" />
        <stop offset="0.5" stopColor="var(--art-leaf)" />
        <stop offset="1" stopColor="var(--art-leaf-hi)" />
      </linearGradient>
      <linearGradient id={`${p}-sheen`} x1="0" y1="1" x2="0.9" y2="0">
        <stop offset="0" stopColor="var(--art-light)" stopOpacity="0" />
        <stop offset="0.52" stopColor="var(--art-light)" stopOpacity="0.55" />
        <stop offset="1" stopColor="var(--art-light)" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${p}-vessel`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="var(--art-bloom-lo)" />
        <stop offset="0.26" stopColor="var(--art-bloom-hi)" />
        <stop offset="0.58" stopColor="var(--art-bloom)" />
        <stop offset="1" stopColor="var(--art-bloom-ink)" />
      </linearGradient>
      <filter id={`${p}-cast`} x="-45%" y="-45%" width="200%" height="200%">
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 0 0.045  0 0 0 0.36 0"
        />
        <feGaussianBlur stdDeviation="10" />
        <feOffset dx="9" dy="7" />
      </filter>
      <filter id={`${p}-far`} x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="0.9" />
      </filter>
      <filter id={`${p}-mid`} x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="0.7" />
      </filter>
      <filter id={`${p}-grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.62" intercept="-0.22" />
        </feComponentTransfer>
      </filter>
    </defs>
  );
}

export function Dome({ p, r, cx = 0, cy = 0 }: { p: string; r: number; cx?: number; cy?: number }) {
  const u = (n: string) => `url(#${p}-${n})`;
  return (
    <g style={{ pointerEvents: "none" }}>
      <circle cx={cx} cy={cy} r={r} fill={u("dome-lo")} />
      <circle cx={cx} cy={cy} r={r} fill={u("rim")} />
      <circle cx={cx} cy={cy} r={r} fill={u("dome-hi")} />
    </g>
  );
}

export function Ground({
  p,
  label,
  contact,
  children,
}: {
  p: string;
  label: string;
  contact: { x: number; y: number; rx: number; ry: number };
  children: ReactNode;
}) {
  const u = (n: string) => `url(#${p}-${n})`;
  return (
    <svg
      viewBox="0 0 400 300"
      className={styles.art}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid slice"
    >
      <Defs p={p} />
      <rect width="400" height="300" fill={u("sweep")} />
      <rect width="400" height="300" fill={u("pool")} />
      <ellipse cx={contact.x} cy={contact.y} rx={contact.rx} ry={contact.ry} fill={u("contact")} />
      <g filter={u("cast")}>{children}</g>
      {children}
      <rect width="400" height="300" fill={u("key")} className={styles.key} />
      <rect width="400" height="300" fill={u("vig")} />
      <rect
        width="400"
        height="300"
        fill="var(--art-shade)"
        filter={u("grain")}
        className={styles.grain}
      />
    </svg>
  );
}
