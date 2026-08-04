import type { ReactNode } from "react";

import styles from "./product-art.module.css";

/**
 * Bespoke botanical still lifes — one per catalogue item.
 *
 * The seeded products point `image_url` at `example.com` placeholders that resolve to
 * nothing, so the storefront has to draw its own product imagery. The bar is a premium DTC
 * florist's photography, which means the art has to have *material*: depth, a light
 * direction, occlusion, grain. Flat vector fills are the single loudest "this is a demo"
 * tell there is.
 *
 * ── Why SVG and not three.js ──────────────────────────────────────────────────────────
 * three.js is already a dependency (the gift card uses it) so it was on the table, and it
 * loses on merit here:
 *
 *  • These are six *static* thumbnails, three of which also render at 72px in the cart.
 *    WebGL buys parallax and real shading; neither survives a 72px thumbnail, and neither
 *    is visible in a screenshot, which is where this art is judged.
 *  • Six canvases on the home grid is six GL contexts, six rAF loops and a renderer that
 *    has to be lazy-loaded, reduced-motion-gated, and then *still* needs an SVG fallback
 *    for the no-WebGL path — so the SVG has to be built either way.
 *  • The design contract says this explicitly: "Not a WebGL showpiece." A payment surface
 *    earns trust by being calm. A spinning bouquet on a product card is the opposite.
 *  • Everything WebGL would give at this size — layered form gradients, one consistent key
 *    light, ambient occlusion, a cast shadow, film grain, depth-of-field on the back rank —
 *    an SVG does with gradients and two filter primitives, server-rendered, zero JS, crisp
 *    at any DPR, and correct with JavaScript off.
 *
 * ── The drawing language ──────────────────────────────────────────────────────────────
 * Six illustrations read as one shoot because all six are built from the same three moves:
 *
 *  1. **Intrinsic form.** Every petal and leaf carries a base→tip gradient — dark where it
 *     tucks under its neighbour, open at the tip — and whorls of petals are separated by a
 *     soft occlusion wash, so a bloom has a dark heart and a lit rim. This shading rotates
 *     *with* the shape, because it is the shape's own form, not the room's light.
 *  2. **One key light.** A single canvas-wide soft-light gradient from the upper left,
 *     painted last over the whole frame, backdrop included. Because it lives in frame space
 *     rather than per-shape, the lamp physically cannot drift between specimens: all six
 *     are lit from the same corner at the same intensity by construction.
 *  3. **The shadow it throws.** Each arrangement is rendered twice — once through a filter
 *     that flattens it to a blurred, offset silhouette on the sweep behind it, and once for
 *     real. Direction and softness are shared, so the six sit on the same table.
 *
 * On top of that: a studio sweep rather than a flat fill, a contact shadow where the
 * subject meets the surface, depth-of-field on background blooms, a vignette, and film
 * grain over everything to kill the vector cleanliness.
 */

type ArtProps = { id: string; className?: string };

/* ── deterministic wobble ──────────────────────────────────────────────────────────────
   Real petals are not evenly spaced, and perfect radial symmetry is what makes a generated
   flower read as generated. This is a pure function of the index, so server and client
   render the identical path data and nothing hydrates twice. */
const rnd = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const wob = (i: number, amt: number) => (rnd(i) - 0.5) * amt;

/* ── geometry ──────────────────────────────────────────────────────────────────────── */

/** A blade — petal, ray floret, leaf. Base at the origin, tip straight up. `tip` controls
    how the shoulders close: 0.86 is a rounded petal, 0.55 a pointed leaf. */
function blade(w: number, h: number, curl = 0.34, tip = 0.86) {
  return (
    `M0 0C${-w} ${-h * curl} ${-w * tip} ${-h * 0.82} 0 ${-h}` +
    `C${w * tip} ${-h * 0.82} ${w} ${-h * curl} 0 0Z`
  );
}

/** The lee half of a blade — everything right of the midrib, laid over the leaf in stem
    ink so foliage turns away from the lamp instead of reading as one flat green cutout. */
function bladeLee(w: number, h: number, curl = 0.34, tip = 0.86) {
  return `M0 0C${w} ${-h * curl} ${w * tip} ${-h * 0.82} 0 ${-h}C0 ${-h * 0.6} 0 ${-h * 0.3} 0 0Z`;
}

/** A cupped petal — wide and rounded, the rose/gardenia move. Base at the origin. */
function cup(r: number, wide = 1, tall = 1) {
  const w = r * wide;
  const h = r * tall;
  return `M0 0C${-w * 1.04} ${-h * 0.12} ${-w * 0.94} ${-h} 0 ${-h}C${w * 0.94} ${-h} ${w * 1.04} ${-h * 0.12} 0 0Z`;
}

/** A long strap leaf that bends as it rises — tulip and orchid foliage. */
function strap(len: number, w: number, bend: number) {
  return (
    `M0 0C${-w} ${-len * 0.32} ${bend - w * 0.7} ${-len * 0.74} ${bend} ${-len}` +
    `C${bend + w * 0.55} ${-len * 0.72} ${w * 0.9} ${-len * 0.3} 0 0Z`
  );
}

/* ── shared paint ──────────────────────────────────────────────────────────────────── */

function Defs({ p }: { p: string }) {
  return (
    <defs>
      {/* The sweep: a seamless studio backdrop, brightest where the lamp lands, falling to
          a deep corner opposite it. Four stops, not two — two stops read as a UI gradient. */}
      <linearGradient id={`${p}-sweep`} x1="0.12" y1="0" x2="0.42" y2="1">
        <stop offset="0" stopColor="var(--art-hi)" />
        <stop offset="0.44" stopColor="var(--art-mid)" />
        <stop offset="0.82" stopColor="var(--art-lo)" />
        <stop offset="1" stopColor="var(--art-deep)" />
      </linearGradient>
      {/* The pool the lamp throws on the sweep behind the subject. */}
      <radialGradient id={`${p}-pool`} cx="0.26" cy="0.1" r="0.74">
        <stop offset="0" stopColor="var(--art-light)" stopOpacity="0.5" />
        <stop offset="0.5" stopColor="var(--art-light)" stopOpacity="0.13" />
        <stop offset="1" stopColor="var(--art-light)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}-vig`} cx="0.5" cy="0.42" r="0.76">
        <stop offset="0.48" stopColor="var(--art-shade)" stopOpacity="0" />
        <stop offset="1" stopColor="var(--art-shade)" stopOpacity="0.19" />
      </radialGradient>
      {/* THE key light. One gradient, frame space, painted over everything. */}
      <linearGradient id={`${p}-key`} x1="0.06" y1="0" x2="0.84" y2="1">
        <stop offset="0" stopColor="var(--art-light)" stopOpacity="0.6" />
        <stop offset="0.4" stopColor="var(--art-light)" stopOpacity="0" />
        <stop offset="0.6" stopColor="var(--art-shade)" stopOpacity="0" />
        <stop offset="1" stopColor="var(--art-shade)" stopOpacity="0.34" />
      </linearGradient>
      <radialGradient id={`${p}-contact`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="var(--art-shade)" stopOpacity="0.42" />
        <stop offset="0.48" stopColor="var(--art-shade)" stopOpacity="0.15" />
        <stop offset="1" stopColor="var(--art-shade)" stopOpacity="0" />
      </radialGradient>

      {/* Petal form: dark at the base where it is overlapped, open at the tip. */}
      <linearGradient id={`${p}-petal`} x1="0.5" y1="1" x2="0.5" y2="0">
        <stop offset="0" stopColor="var(--art-bloom-lo)" />
        <stop offset="0.42" stopColor="var(--art-bloom)" />
        <stop offset="1" stopColor="var(--art-bloom-hi)" />
      </linearGradient>
      <linearGradient id={`${p}-petal-deep`} x1="0.5" y1="1" x2="0.5" y2="0">
        <stop offset="0" stopColor="var(--art-bloom-ink)" />
        <stop offset="0.5" stopColor="var(--art-bloom-lo)" />
        <stop offset="1" stopColor="var(--art-bloom)" />
      </linearGradient>
      {/* The self-occlusion that turns a rosette of flat petals into a bloom with a heart. */}
      <radialGradient id={`${p}-core`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="var(--art-bloom-ink)" stopOpacity="0.6" />
        <stop offset="0.5" stopColor="var(--art-bloom-ink)" stopOpacity="0.2" />
        <stop offset="1" stopColor="var(--art-bloom-ink)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}-hollow`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="var(--art-shade)" stopOpacity="0.5" />
        <stop offset="0.6" stopColor="var(--art-shade)" stopOpacity="0.16" />
        <stop offset="1" stopColor="var(--art-shade)" stopOpacity="0" />
      </radialGradient>

      <linearGradient id={`${p}-leaf`} x1="0.5" y1="1" x2="0.5" y2="0">
        <stop offset="0" stopColor="var(--art-leaf-lo)" />
        <stop offset="0.5" stopColor="var(--art-leaf)" />
        <stop offset="1" stopColor="var(--art-leaf-hi)" />
      </linearGradient>
      {/* Foliage gloss, angled with the key light. */}
      <linearGradient id={`${p}-sheen`} x1="0" y1="1" x2="0.9" y2="0">
        <stop offset="0" stopColor="var(--art-light)" stopOpacity="0" />
        <stop offset="0.52" stopColor="var(--art-light)" stopOpacity="0.55" />
        <stop offset="1" stopColor="var(--art-light)" stopOpacity="0" />
      </linearGradient>
      {/* Glazed ceramic: a cylinder, lit from the left, turning away to the right. */}
      <linearGradient id={`${p}-vessel`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="var(--art-bloom-lo)" />
        <stop offset="0.26" stopColor="var(--art-bloom-hi)" />
        <stop offset="0.58" stopColor="var(--art-bloom)" />
        <stop offset="1" stopColor="var(--art-bloom-ink)" />
      </linearGradient>

      {/* The shadow the arrangement throws on the sweep. The colour matrix flattens whatever
          it is handed to one warm near-black at half alpha, so a single filter casts a true
          silhouette of any specimen without any of them having to describe their own. */}
      <filter id={`${p}-cast`} x="-45%" y="-45%" width="200%" height="200%">
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 0 0.045  0 0 0 0.34 0"
        />
        <feGaussianBlur stdDeviation="11" />
        <feOffset dx="10" dy="8" />
      </filter>
      {/* Depth of field. The back rank of every arrangement sits behind the plane of focus —
          enough to separate the planes, not enough to turn a bloom into a smear. */}
      <filter id={`${p}-far`} x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="1.25" />
      </filter>
      <filter id={`${p}-mid`} x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="0.85" />
      </filter>
      {/* Film grain. Vector art's tell is that it is *too* clean; this puts the noise floor
          of a real sensor back over the top of it. */}
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

function Ground({
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

/**
 * A leaf: blade, shaded lee half, midrib, side veins, gloss. The lee half is the piece that
 * matters — a leaf painted in one flat green is the paper-cutout tell, and half of every
 * real leaf is turned away from the light.
 */
function Leaf({
  p,
  x,
  y,
  a,
  w,
  h,
  gloss = 0.3,
  tip = 0.58,
}: {
  p: string;
  x: number;
  y: number;
  a: number;
  w: number;
  h: number;
  gloss?: number;
  tip?: number;
}) {
  const veins = [0.24, 0.42, 0.6, 0.76];
  return (
    <g transform={`translate(${x} ${y}) rotate(${a})`}>
      <path d={blade(w, h, 0.4, tip)} fill={`url(#${p}-leaf)`} />
      <path d={bladeLee(w, h, 0.4, tip)} fill="var(--art-stem)" opacity="0.2" />
      {veins.map((t) => (
        <path
          key={t}
          d={`M0 ${-h * t}L${w * 0.62 * (1 - t)} ${-h * (t + 0.16)}M0 ${-h * t}L${-w * 0.62 * (1 - t)} ${-h * (t + 0.16)}`}
          fill="none"
          stroke="var(--art-stem)"
          strokeOpacity="0.16"
          strokeWidth="0.7"
        />
      ))}
      <path
        d={`M0 ${-h * 0.04}C${w * 0.12} ${-h * 0.4} ${w * 0.07} ${-h * 0.7} 0 ${-h * 0.97}`}
        fill="none"
        stroke="var(--art-stem)"
        strokeOpacity="0.42"
        strokeWidth="1"
      />
      <path d={blade(w * 0.8, h * 0.88, 0.4, tip)} fill={`url(#${p}-sheen)`} opacity={gloss} />
    </g>
  );
}

/* ── specimens ─────────────────────────────────────────────────────────────────────── */

/** A garden rose: three whorls of cupped petals over a dark heart. */
function RoseHead({ p, r, seed }: { p: string; r: number; seed: number }) {
  const u = (n: string) => `url(#${p}-${n})`;
  // Outer petals are wide and reflexed, inner ones narrow and upright — that change of
  // proportion between whorls is what reads as a rose rather than as concentric circles.
  const whorls = [
    { n: 6, s: 1, rot: 0, wide: 1.16, tall: 0.92, grad: "petal" },
    { n: 6, s: 0.78, rot: 31, wide: 1.06, tall: 0.96, grad: "petal" },
    { n: 5, s: 0.55, rot: 12, wide: 0.94, tall: 1, grad: "petal" },
    { n: 4, s: 0.34, rot: 48, wide: 0.86, tall: 1.04, grad: "petal-deep" },
  ];
  return (
    <g>
      <circle r={r * 0.9} fill="var(--art-bloom-lo)" />
      {whorls.map((w, wi) => {
        // The heart wanders as it furls inward: each whorl nests a little off the last one's
        // centre along a short spiral, drifting up-left toward the key light. Co-centred
        // rings are the exact "bullseye" tell the flat version had — a real bloom does not
        // have one axis, it has a centre it spirals around.
        const ox = wob(seed + wi * 5 + 1, r * 0.14);
        const oy = wob(seed + wi * 5 + 2, r * 0.1) - r * 0.05 * wi;
        return (
          <g key={wi} transform={`translate(${ox} ${oy})`}>
            {Array.from({ length: w.n }, (_, i) => {
              const a = w.rot + (360 / w.n) * i + wob(seed + wi * 13 + i, 17);
              // Wider scale spread so petals overlap unevenly instead of tiling a clean ring.
              const s = w.s * (0.82 + rnd(seed + i * 7 + wi * 3) * 0.34);
              return (
                <path
                  key={i}
                  d={cup(r * s, w.wide, w.tall)}
                  transform={`rotate(${a})`}
                  fill={u(w.grad)}
                  stroke="var(--art-bloom-ink)"
                  strokeOpacity="0.22"
                  strokeWidth="0.55"
                />
              );
            })}
          </g>
        );
      })}
      {/* One heart, not four. The occlusion that darkens the centre is painted a single time
          over the whole bloom rather than once per whorl, so the middle reads as one
          deepening well instead of a stack of nested dark rings. */}
      <circle r={r * 0.66} fill={u("core")} />
      {/* the tight spiral at the centre */}
      <g transform={`scale(${r / 28})`}>
        <path
          d="M-4 3C-10 -1 -8 -10 0 -10C8 -10 10 -1 5 2"
          fill="none"
          stroke="var(--art-bloom-ink)"
          strokeOpacity="0.5"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M-2 1C-5 -1 -4 -5 0 -5C4 -5 5 -2 3 0"
          fill="none"
          stroke="var(--art-bloom-ink)"
          strokeOpacity="0.4"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

function Roses() {
  const p = "ro";
  const u = (n: string) => `url(#${p}-${n})`;
  const front: Array<[number, number, number]> = [
    [154, 158, 33],
    [250, 164, 30],
    [202, 124, 38],
  ];
  return (
    <Ground p={p} label="A hand-tied bouquet of deep red garden roses" contact={{ x: 208, y: 288, rx: 128, ry: 18 }}>
      {/* back rank — smaller, softer, behind the plane of focus */}
      <g filter={u("far")} opacity="0.92">
        <path
          d="M204 300C188 246 164 194 126 132M204 300C216 244 244 192 278 124M204 300C202 236 200 158 200 82"
          fill="none"
          stroke="var(--art-stem)"
          strokeOpacity="0.6"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <g transform="translate(124 122)">
          <RoseHead p={p} r={25} seed={11} />
        </g>
        <g transform="translate(280 114)">
          <RoseHead p={p} r={24} seed={23} />
        </g>
        <g transform="translate(200 74)">
          <RoseHead p={p} r={21} seed={37} />
        </g>
      </g>

      {/* stems, converging into a hand-tie that leaves the frame */}
      <path
        d="M204 300C196 250 176 210 156 178M204 300C218 252 236 214 250 184M204 300C204 240 203 186 202 146"
        fill="none"
        stroke="var(--art-stem)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Leaf p={p} x={186} y={266} a={-52} w={15} h={62} tip={0.5} />
      <Leaf p={p} x={224} y={258} a={46} w={14} h={56} tip={0.5} />
      <Leaf p={p} x={162} y={228} a={-74} w={12} h={48} gloss={0.2} tip={0.5} />
      <Leaf p={p} x={252} y={222} a={68} w={12} h={46} gloss={0.2} tip={0.5} />

      {front.map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <RoseHead p={p} r={r} seed={i * 41 + 5} />
        </g>
      ))}
    </Ground>
  );
}

/** A sunflower head: two ranks of ray florets and a phyllotactic seed disc. */
function SunHead({ p, R, disc, seed }: { p: string; R: number; disc: number; seed: number }) {
  const u = (n: string) => `url(#${p}-${n})`;
  const n = 21;
  const step = 360 / n;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const h = R * (0.98 + rnd(seed + i) * 0.1);
        return (
          <path
            key={`b${i}`}
            d={blade(R * 0.15, h, 0.36)}
            transform={`rotate(${step * i + step / 2 + wob(seed + i * 3, 5)})`}
            fill={u("petal-deep")}
          />
        );
      })}
      {Array.from({ length: n }, (_, i) => {
        const h = R * (0.84 + rnd(seed + i + 90) * 0.18);
        return (
          <g key={`f${i}`} transform={`rotate(${step * i + wob(seed + i * 5 + 40, 8)})`}>
            <path d={blade(R * 0.17, h, 0.32)} fill={u("petal")} />
            <path
              d={`M0 ${-h * 0.2}L0 ${-h * 0.84}`}
              stroke="var(--art-bloom-ink)"
              strokeOpacity="0.17"
              strokeWidth="0.8"
              fill="none"
            />
          </g>
        );
      })}
      <circle r={disc * 1.06} fill="var(--art-bloom-ink)" />
      {/* the fertile ring of disc florets, then the seed spiral inside it */}
      <circle
        r={disc * 0.94}
        fill="none"
        stroke="var(--art-bloom)"
        strokeOpacity="0.5"
        strokeWidth={disc * 0.16}
      />
      {Array.from({ length: 72 }, (_, i) => {
        const th = i * 2.39996;
        const rr = disc * 0.9 * Math.sqrt(i / 72);
        return (
          <circle
            key={i}
            cx={Math.cos(th) * rr}
            cy={Math.sin(th) * rr}
            r={disc * 0.055}
            fill="var(--art-bloom-hi)"
            opacity={0.08 + 0.4 * (rr / disc)}
          />
        );
      })}
      <circle r={disc * 1.06} fill={u("hollow")} />
    </g>
  );
}

function Sunflowers() {
  const p = "su";
  const u = (n: string) => `url(#${p}-${n})`;
  return (
    <Ground p={p} label="Two sunflowers with broad leaves, cut short" contact={{ x: 200, y: 286, rx: 118, ry: 16 }}>
      <g filter={u("far")} opacity="0.88">
        <path
          d="M196 300C206 240 216 160 222 86"
          fill="none"
          stroke="var(--art-stem)"
          strokeOpacity="0.6"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
        <g transform="translate(224 74)">
          <SunHead p={p} R={34} disc={14} seed={71} />
        </g>
        <Leaf p={p} x={296} y={216} a={62} w={26} h={68} gloss={0.16} tip={0.72} />
      </g>

      <path
        d="M166 300C158 234 150 178 146 132M190 300C210 244 240 196 268 162"
        fill="none"
        stroke="var(--art-stem)"
        strokeWidth="4.8"
        strokeLinecap="round"
      />
      <Leaf p={p} x={110} y={248} a={-52} w={30} h={78} tip={0.74} />
      <Leaf p={p} x={266} y={258} a={44} w={27} h={70} tip={0.74} />
      <Leaf p={p} x={186} y={286} a={-10} w={21} h={56} gloss={0.22} tip={0.74} />

      <g transform="translate(268 154)">
        <SunHead p={p} R={52} disc={21} seed={17} />
      </g>
      <g transform="translate(144 116)">
        <SunHead p={p} R={62} disc={25} seed={3} />
      </g>
    </Ground>
  );
}

/** A closed tulip cup: outer silhouette, two flanking petals, one lit front petal. */
function TulipHead({ p, s }: { p: string; s: number }) {
  const u = (n: string) => `url(#${p}-${n})`;
  return (
    <g transform={`scale(${s})`}>
      <path
        d="M-14 3C-17 -12 -13 -29 -6 -37C-4 -25 -3 -20 0 -18C3 -20 4 -25 6 -37C13 -29 17 -12 14 3C10 11 -10 11 -14 3Z"
        fill={u("petal-deep")}
      />
      <path d="M-13 2C-16 -12 -12 -28 -6 -35C-3 -22 -3 -8 -5 3Z" fill={u("petal-deep")} />
      <path d="M13 2C16 -12 12 -28 6 -35C3 -22 3 -8 5 3Z" fill={u("petal-deep")} />
      <path
        d="M-7 1C-10 -13 -7 -28 0 -34C7 -28 10 -13 7 1C4 7 -4 7 -7 1Z"
        fill={u("petal")}
      />
      <path
        d="M-3.5 -28C-5.5 -17 -5.5 -8 -4.5 -1"
        fill="none"
        stroke="var(--art-bloom-hi)"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4.5 -27C6 -16 6 -8 5 -1"
        fill="none"
        stroke="var(--art-bloom-ink)"
        strokeOpacity="0.22"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* where the cup closes onto the stem */}
      <path d="M-8 1C-5 8 5 8 8 1C6 8 -6 8 -8 1Z" fill="var(--art-bloom-ink)" opacity="0.35" />
    </g>
  );
}

function Tulips() {
  const p = "tu";
  const u = (n: string) => `url(#${p}-${n})`;
  const stems: Array<[number, number, number, number]> = [
    // x, head-base y, scale, bend of the stem where it leaves the frame
    [146, 176, 1.42, -10],
    [204, 142, 1.6, 2],
    [258, 182, 1.34, 12],
  ];
  return (
    <Ground p={p} label="Spring tulips in pink, still closed" contact={{ x: 204, y: 288, rx: 118, ry: 17 }}>
      <g filter={u("far")} opacity="0.86">
        {([[104, 200, 1.1, -18], [300, 206, 1.04, 18]] as const).map(([x, y, s, b], i) => (
          <g key={i}>
            <path
              d={`M${x + b} 300C${x + b * 0.4} 262 ${x} ${y + 58} ${x} ${y}`}
              fill="none"
              stroke="var(--art-stem)"
              strokeOpacity="0.62"
              strokeWidth="3.6"
              strokeLinecap="round"
            />
            <g transform={`translate(${x} ${y})`}>
              <TulipHead p={p} s={s} />
            </g>
          </g>
        ))}
        <path d={strap(140, 18, -26)} transform="translate(134 298)" fill={u("leaf")} opacity="0.78" />
        <path d={strap(130, 17, 28)} transform="translate(272 298)" fill={u("leaf")} opacity="0.78" />
      </g>

      {stems.map(([x, y, s, b], i) => (
        <g key={i}>
          <path
            d={`M${x + b} 300C${x + b * 0.4} 256 ${x} ${y + 66} ${x} ${y}`}
            fill="none"
            stroke="var(--art-stem)"
            strokeWidth="4.6"
            strokeLinecap="round"
          />
          <g transform={`translate(${x} ${y})`}>
            <TulipHead p={p} s={s} />
          </g>
        </g>
      ))}

      {/* strap leaves — one broad blade to each side, each with its own shaded lee */}
      {([[172, -34, 168, 21], [236, 38, 156, 20], [152, -46, 116, 16], [254, 50, 108, 15]] as const).map(
        ([x, bend, len, w], i) => (
          <g key={i} transform={`translate(${x} 300)`}>
            <path d={strap(len, w, bend)} fill={u("leaf")} />
            <path
              d={`M0 0C${w * 0.4} ${-len * 0.34} ${bend * 0.5} ${-len * 0.74} ${bend} ${-len}` +
                `C${bend + w * 0.55} ${-len * 0.72} ${w * 0.9} ${-len * 0.3} 0 0Z`}
              fill="var(--art-stem)"
              opacity={i % 2 ? 0.2 : 0.14}
            />
            <path d={strap(len * 0.94, w * 0.7, bend)} fill={u("sheen")} opacity="0.2" />
          </g>
        ),
      )}
    </Ground>
  );
}

/** One phalaenopsis flower: three sepals behind, two lateral petals, a coloured lip. */
function OrchidBloom({ p, s, seed }: { p: string; s: number; seed: number }) {
  const u = (n: string) => `url(#${p}-${n})`;
  if (s < 0.46) {
    return (
      <g transform={`scale(${s / 0.46})`}>
        <path d={blade(7, 15, 0.55)} transform="rotate(24)" fill={u("petal-deep")} />
        <path d={blade(6, 13, 0.55)} transform="rotate(-16)" fill={u("petal")} />
      </g>
    );
  }
  return (
    <g transform={`scale(${s}) rotate(${wob(seed, 14)})`}>
      <path d={blade(12, 26, 0.5)} fill={u("petal-deep")} />
      <path d={blade(11, 24, 0.5)} transform="rotate(142)" fill={u("petal-deep")} />
      <path d={blade(11, 24, 0.5)} transform="rotate(-142)" fill={u("petal-deep")} />
      <path d={cup(23, 1.16, 0.9)} transform="rotate(-74)" fill={u("petal")} />
      <path d={cup(23, 1.16, 0.9)} transform="rotate(74)" fill={u("petal")} />
      {/* fine radiating veins — the thing that stops a white petal reading as a white blob */}
      {[-96, -74, -52, 52, 74, 96].map((a) => (
        <path
          key={a}
          d="M0 -3L0 -19"
          transform={`rotate(${a})`}
          stroke="var(--art-bloom-ink)"
          strokeOpacity="0.2"
          strokeWidth="0.7"
          fill="none"
        />
      ))}
      <circle r="9" fill={u("core")} />
      <path
        d="M0 2C-7 2 -10 9 -5 14C-2 17 2 17 5 14C10 9 7 2 0 2Z"
        fill="var(--art-accent)"
      />
      <path
        d="M-6 1C-11 -4 -9 -10 -4 -9M6 1C11 -4 9 -10 4 -9"
        fill="none"
        stroke="var(--art-accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cy="-2" r="3.2" fill="var(--art-bloom-hi)" />
    </g>
  );
}

function Orchid() {
  const p = "or";
  const u = (n: string) => `url(#${p}-${n})`;
  const spray: Array<[number, number, number]> = [
    [150, 176, 1],
    [198, 150, 0.92],
    [242, 128, 0.78],
    [280, 113, 0.58],
    [308, 103, 0.4],
    [330, 96, 0.28],
  ];
  return (
    <Ground p={p} label="A white phalaenopsis orchid arching over its leaves" contact={{ x: 122, y: 284, rx: 96, ry: 15 }}>
      <g filter={u("far")} opacity="0.8">
        <path d={blade(30, 74, 0.44)} transform="translate(74 286) rotate(-58)" fill={u("leaf")} />
        <path d={blade(26, 62, 0.44)} transform="translate(160 288) rotate(58)" fill={u("leaf")} />
      </g>

      <path
        d="M104 292C112 236 122 202 146 182C190 146 246 118 336 96"
        fill="none"
        stroke="var(--art-stem)"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <path d={blade(31, 72, 0.46)} transform="translate(102 292) rotate(-32)" fill={u("leaf")} />
      <path
        d={blade(26, 60, 0.46)}
        transform="translate(102 292) rotate(-32)"
        fill={u("sheen")}
        opacity="0.26"
      />
      <path d={blade(28, 64, 0.46)} transform="translate(122 294) rotate(30)" fill={u("leaf")} />
      <path
        d={blade(23, 54, 0.46)}
        transform="translate(122 294) rotate(30)"
        fill={u("sheen")}
        opacity="0.22"
      />

      {spray
        .slice()
        .reverse()
        .map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <OrchidBloom p={p} s={s} seed={i * 19 + 7} />
          </g>
        ))}
    </Ground>
  );
}

/** A gardenia: a many-whorled cream rosette that has to survive being nearly white. */
function GardeniaHead({ p, r, seed }: { p: string; r: number; seed: number }) {
  const u = (n: string) => `url(#${p}-${n})`;
  const whorls = [
    { n: 9, s: 1, rot: 0 },
    { n: 7, s: 0.74, rot: 24 },
    { n: 6, s: 0.5, rot: 48 },
    { n: 5, s: 0.29, rot: 20 },
  ];
  return (
    <g>
      <circle r={r * 0.88} fill="var(--art-bloom-lo)" />
      {whorls.map((w, wi) => (
        <g key={wi}>
          {Array.from({ length: w.n }, (_, i) => {
            const a = w.rot + (360 / w.n) * i + wob(seed + wi * 17 + i, 10);
            const s = w.s * (0.92 + rnd(seed + i * 11 + wi * 5) * 0.16);
            return (
              <path
                key={i}
                d={cup(r * s, 1.06, 0.92)}
                transform={`rotate(${a})`}
                fill={u(wi > 2 ? "petal-deep" : "petal")}
                stroke="var(--art-bloom-ink)"
                strokeOpacity="0.26"
                strokeWidth="0.5"
              />
            );
          })}
          <circle r={r * w.s * 0.8} fill={u("core")} />
        </g>
      ))}
      <circle r={r * 0.1} fill="var(--art-accent)" opacity="0.8" />
    </g>
  );
}

function Gardenias() {
  const p = "ga";
  const u = (n: string) => `url(#${p}-${n})`;
  return (
    <Ground p={p} label="Cream gardenias among glossy dark leaves" contact={{ x: 200, y: 286, rx: 116, ry: 16 }}>
      <g filter={u("far")} opacity="0.88">
        <Leaf p={p} x={148} y={196} a={-74} w={20} h={62} gloss={0.16} />
        <Leaf p={p} x={256} y={190} a={70} w={19} h={58} gloss={0.16} />
        <g transform="translate(208 116)">
          <GardeniaHead p={p} r={20} seed={53} />
        </g>
      </g>

      <path
        d="M198 300C198 250 194 214 178 186M204 300C214 258 226 226 240 202"
        fill="none"
        stroke="var(--art-stem)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <Leaf p={p} x={122} y={248} a={-52} w={24} h={72} gloss={0.34} />
      <Leaf p={p} x={278} y={244} a={48} w={23} h={68} gloss={0.34} />
      <Leaf p={p} x={168} y={276} a={-20} w={21} h={62} gloss={0.28} />
      <Leaf p={p} x={244} y={280} a={22} w={20} h={58} gloss={0.28} />

      <g transform="translate(240 180)">
        <GardeniaHead p={p} r={26} seed={29} />
      </g>
      <g transform="translate(170 152)">
        <GardeniaHead p={p} r={33} seed={2} />
      </g>
    </Ground>
  );
}

function CeramicPot() {
  const p = "po";
  const u = (n: string) => `url(#${p}-${n})`;
  // Leaves fan out of the soil: angle, length, width, whether it sits behind the plane.
  const canopy: Array<[number, number, number, number, boolean]> = [
    [-74, 96, 21, 0.9, true],
    [72, 90, 20, 0.9, true],
    [-24, 118, 22, 1, true],
    [-52, 108, 23, 1, false],
    [46, 104, 22, 1, false],
    [-8, 128, 24, 1, false],
    [22, 116, 22, 1, false],
    [-36, 78, 17, 1, false],
    [58, 72, 16, 1, false],
  ];
  return (
    <Ground p={p} label="A leafy houseplant in a glazed terracotta pot" contact={{ x: 208, y: 286, rx: 104, ry: 15 }}>
      {/* canopy — back rank first, softened, then the leaves in focus */}
      <g filter={u("far")} opacity="0.85">
        {canopy
          .filter(([, , , , back]) => back)
          .map(([a, h, w, g], i) => (
            <g key={i} transform={`translate(200 182) rotate(${a})`}>
              <path
                d={`M0 0C${-a * 0.12} ${-h * 0.5} ${-a * 0.06} ${-h * 0.8} 0 ${-h}`}
                fill="none"
                stroke="var(--art-stem)"
                strokeOpacity="0.6"
                strokeWidth="2.4"
              />
              <g transform={`translate(0 ${-h})`}>
                <path d={blade(w, h * 0.52, 0.4)} fill={u("leaf")} opacity={g} />
              </g>
            </g>
          ))}
      </g>
      {canopy
        .filter(([, , , , back]) => !back)
        .map(([a, h, w], i) => (
          <g key={i} transform={`translate(200 182) rotate(${a})`}>
            <path
              d={`M0 0C${-a * 0.14} ${-h * 0.5} ${-a * 0.07} ${-h * 0.8} 0 ${-h}`}
              fill="none"
              stroke="var(--art-stem)"
              strokeWidth="2.6"
            />
            <g transform={`translate(0 ${-h})`}>
              <path d={blade(w, h * 0.54, 0.4)} fill={u("leaf")} />
              <path
                d={`M0 ${-h * 0.03}C${w * 0.14} ${-h * 0.22} ${w * 0.09} ${-h * 0.38} 0 ${-h * 0.52}`}
                fill="none"
                stroke="var(--art-stem)"
                strokeOpacity="0.4"
                strokeWidth="0.9"
              />
              <path d={blade(w * 0.8, h * 0.48, 0.4)} fill={u("sheen")} opacity="0.26" />
            </g>
          </g>
        ))}

      {/* the vessel */}
      <g transform="translate(200 178)">
        {/* the opening, and the soil sitting down inside it */}
        <ellipse cx="0" cy="0" rx="62" ry="12" fill="var(--art-bloom-ink)" />
        <ellipse cx="0" cy="2" rx="55" ry="9" fill="var(--art-stem)" opacity="0.55" />
        <ellipse cx="0" cy="2" rx="55" ry="9" fill={u("hollow")} />
        {/* collar */}
        <path
          d="M-64 -12C-64 -19 -60 -22 0 -22C60 -22 64 -19 64 -12L62 8C62 13 58 15 0 15C-58 15 -62 13 -62 8Z"
          fill={u("vessel")}
        />
        {/* body, tapering to the base */}
        <path d="M-60 14L60 14L46 96C44 106 38 110 30 110L-30 110C-38 110 -44 106 -46 96Z" fill={u("vessel")} />
        {/* the shadow the collar throws on the body, and the pot's own base occlusion */}
        <path
          d="M-60 14L60 14L57 28L-57 28Z"
          fill="var(--art-bloom-ink)"
          opacity="0.28"
        />
        <path
          d="M-49 78L49 78L46 96C44 106 38 110 30 110L-30 110C-38 110 -44 106 -46 96Z"
          fill="var(--art-shade)"
          opacity="0.16"
        />
        {/* glaze: one soft specular band, left of centre, agreeing with the key light */}
        <ellipse cx="-27" cy="58" rx="9" ry="38" fill="var(--art-light)" opacity="0.22" filter={u("mid")} />
        <ellipse cx="-30" cy="-3" rx="14" ry="5" fill="var(--art-light)" opacity="0.24" filter={u("mid")} />
        {/* the throwing rings a wheel leaves */}
        <path
          d="M-56 40C-20 46 20 46 54 40M-52 58C-18 64 18 64 50 58"
          fill="none"
          stroke="var(--art-bloom-ink)"
          strokeOpacity="0.14"
          strokeWidth="1.2"
        />
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
    <div className={`${styles.frame} ${className}`} data-art={id}>
      <Art />
    </div>
  );
}
