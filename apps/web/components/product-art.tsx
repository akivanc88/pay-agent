import styles from "./product-art.module.css";

/**
 * Bespoke botanical art, one motif per catalogue item.
 *
 * The seeded products point their `image_url` at `example.com` placeholders that resolve to
 * nothing. Rather than ship broken images or grey boxes, each product gets a hand-built SVG
 * specimen in one shared "pressed-flower" style — fine strokes, muted fills, generous
 * negative space — so the grid reads as one considered collection instead of stock photos.
 * Vector art also stays crisp at any size and adds nothing to load.
 */

type ArtProps = { id: string; className?: string };

function Ground({ children, seed }: { children: React.ReactNode; seed: number }) {
  // A gentle paper grain + vignette shared by every specimen, so the set feels unified.
  const gid = `g${seed}`;
  return (
    <svg viewBox="0 0 400 300" className={styles.art} role="img" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={`${gid}-bg`} cx="50%" cy="38%" r="80%">
          <stop offset="0%" stopColor="var(--art-hi)" />
          <stop offset="100%" stopColor="var(--art-lo)" />
        </radialGradient>
        <filter id={`${gid}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer><feFuncA type="linear" slope="0.04" /></feComponentTransfer>
          <feComposite operator="over" in2="SourceGraphic" />
        </filter>
      </defs>
      <rect width="400" height="300" fill={`url(#${gid}-bg)`} />
      {children}
      <rect width="400" height="300" fill="#000" opacity="0.015" filter={`url(#${gid}-grain)`} />
    </svg>
  );
}

const S = { fill: "none", stroke: "var(--art-stem)", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Roses() {
  return (
    <Ground seed={1}>
      <g transform="translate(200 168)">
        <path {...S} d="M-42 96 C-30 40 -30 20 -46 -8M0 100 C0 30 0 6 0 -30M44 96 C32 44 32 22 48 -6" />
        <path {...S} d="M-46 40 C-70 34 -84 20 -78 2 M0 34 C-22 24 -34 6 -30 -14 M0 34 C22 24 34 6 30 -14 M48 40 C72 32 84 16 76 0" />
        {[-52, 0, 54].map((x, i) => (
          <g key={i} transform={`translate(${x} ${-24 - (i % 2) * 10})`}>
            <circle cx="0" cy="0" r="26" fill="var(--art-bloom)" />
            <circle cx="0" cy="0" r="26" fill="none" stroke="var(--art-bloom-ink)" strokeWidth="1.4" />
            <path d="M0 0 C-14 -6 -14 -22 0 -22 C14 -22 14 -6 0 0Z" fill="var(--art-bloom-ink)" opacity="0.28" />
            <path d="M0 0 C-18 4 -22 -10 -12 -18 M0 0 C18 4 22 -10 12 -18" fill="none" stroke="var(--art-bloom-ink)" strokeWidth="1.3" opacity="0.55" />
            <circle cx="0" cy="-2" r="6" fill="var(--art-bloom-ink)" opacity="0.4" />
          </g>
        ))}
      </g>
    </Ground>
  );
}

function Sunflowers() {
  return (
    <Ground seed={2}>
      <g transform="translate(200 160)">
        <path {...S} d="M-30 110 C-20 50 -22 26 -34 -6 M18 112 C14 46 18 22 34 -8" />
        <path {...S} d="M-32 44 C-58 40 -66 22 -56 6 M22 40 C46 34 54 16 44 2" />
        {[[-38, -26], [40, -34]].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            {Array.from({ length: 16 }).map((_, k) => (
              <ellipse
                key={k}
                cx="0" cy="-30" rx="7" ry="18"
                fill="var(--art-bloom)"
                stroke="var(--art-bloom-ink)" strokeWidth="1"
                transform={`rotate(${k * 22.5})`}
              />
            ))}
            <circle cx="0" cy="0" r="19" fill="var(--art-bloom-ink)" />
            <circle cx="0" cy="0" r="19" fill="none" stroke="var(--art-stem)" strokeWidth="1.4" />
            <circle cx="0" cy="0" r="11" fill="#000" opacity="0.18" />
          </g>
        ))}
      </g>
    </Ground>
  );
}

function Tulips() {
  return (
    <Ground seed={3}>
      <g transform="translate(200 162)">
        {[-56, 0, 56].map((x, i) => (
          <g key={i} transform={`translate(${x} ${(i % 2) * 12})`}>
            <path {...S} d="M0 108 L0 -6" />
            <path {...S} d="M0 60 C-30 44 -34 20 -20 8 M0 74 C30 58 34 34 20 22" />
            <path d="M0 -6 C-20 -6 -22 -30 -16 -46 C-8 -34 -8 -34 0 -46 C8 -34 8 -34 16 -46 C22 -30 20 -6 0 -6Z" fill="var(--art-bloom)" stroke="var(--art-bloom-ink)" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M0 -46 L0 -12" fill="none" stroke="var(--art-bloom-ink)" strokeWidth="1.2" opacity="0.5" />
          </g>
        ))}
      </g>
    </Ground>
  );
}

function Orchid() {
  return (
    <Ground seed={4}>
      <g transform="translate(206 150)">
        <path {...S} d="M-96 120 C-40 108 4 78 14 -24" />
        <path {...S} d="M-96 120 C-100 96 -92 84 -78 82" />
        {[[14, -24], [-6, 6], [-30, 40], [-56, 70]].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${1 - i * 0.13})`}>
            {[0, 72, 144, 216, 288].map((r) => (
              <ellipse key={r} cx="0" cy="-20" rx="12" ry="20" fill="var(--art-bloom)" stroke="var(--art-bloom-ink)" strokeWidth="1" transform={`rotate(${r})`} />
            ))}
            <circle cx="0" cy="0" r="8" fill="var(--art-accent)" />
            <circle cx="0" cy="0" r="8" fill="none" stroke="var(--art-bloom-ink)" strokeWidth="1" />
          </g>
        ))}
      </g>
    </Ground>
  );
}

function Gardenias() {
  return (
    <Ground seed={5}>
      <g transform="translate(200 158)">
        <path {...S} d="M-2 108 C-2 50 -2 26 -2 -2" />
        <path d="M-70 30 C-96 6 -92 -20 -66 -18 C-58 -40 -30 -40 -24 -18 C0 -30 14 -8 -2 8 C10 24 -6 46 -30 36 C-42 52 -70 46 -70 30Z" fill="var(--art-leaf)" stroke="var(--art-stem)" strokeWidth="1.6" opacity="0.9" />
        {[[8, -14, 1], [-26, 18, 0.72], [40, 20, 0.6]].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            {[0, 51, 103, 154, 206, 257, 309].map((r) => (
              <ellipse key={r} cx="0" cy="-22" rx="15" ry="23" fill="var(--art-bloom)" stroke="var(--art-bloom-ink)" strokeWidth="1" transform={`rotate(${r})`} />
            ))}
            <circle cx="0" cy="0" r="12" fill="var(--art-bloom)" stroke="var(--art-bloom-ink)" strokeWidth="1" />
            <circle cx="0" cy="0" r="4" fill="var(--art-accent)" />
          </g>
        ))}
      </g>
    </Ground>
  );
}

function CeramicPot() {
  return (
    <Ground seed={6}>
      <g transform="translate(200 150)">
        <path {...S} d="M-4 -20 C-4 -70 -30 -86 -54 -92 M-4 -20 C-4 -64 22 -80 46 -78 M-4 -20 C-4 -78 -2 -96 6 -110" />
        <path d="M-54 -92 C-44 -104 -30 -100 -26 -86 C-40 -84 -50 -86 -54 -92Z" fill="var(--art-leaf)" />
        <path d="M46 -78 C58 -88 70 -80 68 -66 C54 -68 48 -72 46 -78Z" fill="var(--art-leaf)" />
        <path d="M6 -110 C10 -124 26 -124 28 -110 C20 -104 12 -104 6 -110Z" fill="var(--art-leaf)" />
        <path d="M-64 -22 L64 -22 L48 74 C46 86 40 92 28 92 L-28 92 C-40 92 -46 86 -48 74 Z" fill="var(--art-bloom)" stroke="var(--art-bloom-ink)" strokeWidth="2" strokeLinejoin="round" />
        <path d="M-72 -30 L72 -30 L64 -8 L-64 -8 Z" fill="var(--art-accent)" stroke="var(--art-bloom-ink)" strokeWidth="2" strokeLinejoin="round" />
        <path d="M-40 6 C-30 40 -20 40 -14 6 M4 6 C14 44 26 42 34 6" fill="none" stroke="var(--art-bloom-ink)" strokeWidth="1.3" opacity="0.35" />
      </g>
    </Ground>
  );
}

const ART: Record<string, () => React.ReactElement> = {
  bouquet_roses: Roses,
  bouquet_sunflowers: Sunflowers,
  bouquet_tulips: Tulips,
  orchid_white: Orchid,
  gardenias: Gardenias,
  pot_ceramic: CeramicPot,
};

export function ProductArt({ id, className = "" }: ArtProps) {
  const Art = ART[id] ?? Gardenias;
  return (
    <div className={`${styles.frame} ${styles[`art_${id}`] ?? ""} ${className}`} data-art={id}>
      <Art />
    </div>
  );
}
