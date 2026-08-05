/** Defines flowering plant SVG compositions used by product illustrations. */

import { blade, cup, wob } from "./product-art-geometry";
import { Leaf, Rosette, type Whorl } from "./product-art-primitives";
import { Dome, Ground } from "./product-art-stage";

function OrchidBloom({ p, s, seed }: { p: string; s: number; seed: number }) {
  const u = (n: string) => `url(#${p}-${n})`;
  if (s < 0.5) {
    // a bud: two small furled tepals and a green calyx
    return (
      <g transform={`scale(${s / 0.5}) rotate(${wob(seed, 18)})`}>
        <path d={cup(11, 0.8, 1)} transform="rotate(20)" fill={u("petal-deep")} />
        <path d={cup(10, 0.8, 1)} transform="rotate(-14)" fill={u("petal")} />
        <ellipse cx="0" cy="2" rx="4" ry="3" fill="var(--art-leaf)" />
      </g>
    );
  }
  return (
    <g transform={`scale(${s}) rotate(${wob(seed, 12)})`}>
      {/* three sepals behind — top, lower-left, lower-right */}
      <path d={cup(26, 0.86, 1.02)} fill={u("petal")} />
      <path d={cup(25, 0.86, 1.02)} transform="rotate(138)" fill={u("petal")} />
      <path d={cup(25, 0.86, 1.02)} transform="rotate(-138)" fill={u("petal")} />
      {/* two big lateral petals, broad and rounded, catching most of the light */}
      <path d={cup(27, 1.34, 0.86)} transform="rotate(-72)" fill={u("petal")} />
      <path d={cup(27, 1.34, 0.86)} transform="rotate(72)" fill={u("petal")} />
      {/* the fine radiating veins that keep a white petal from reading as a blank blob */}
      {[-108, -84, -72, -60, 60, 72, 84, 108, 0, 138, -138].map((a, k) => (
        <path
          key={k}
          d="M0 -4L0 -21"
          transform={`rotate(${a})`}
          stroke="var(--art-bloom-ink)"
          strokeOpacity="0.16"
          strokeWidth="0.7"
          fill="none"
        />
      ))}
      {/* throat shadow, then the coloured lip and column */}
      <circle r="10" fill={u("hollow")} />
      <path
        d="M0 3C-8 3 -11 11 -6 16C-3 19 3 19 6 16C11 11 8 3 0 3Z"
        fill="var(--art-accent)"
      />
      <path
        d="M-7 1C-12 -5 -10 -12 -4 -10M7 1C12 -5 10 -12 4 -10"
        fill="none"
        stroke="var(--art-accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* the column, with its little cap catching the light */}
      <path d="M-3 -3C-3 4 3 4 3 -3C3 -8 -3 -8 -3 -3Z" fill="var(--art-bloom-hi)" />
      <ellipse cx="-1" cy="-4" rx="2.6" ry="2" fill="var(--art-bloom-hi)" />
      <Dome p={p} r={30} />
    </g>
  );
}

export function Orchid() {
  const p = "or";
  const u = (n: string) => `url(#${p}-${n})`;
  // a phalaenopsis arch: open flowers low and large, tapering to buds at the tip
  const spray: Array<[number, number, number]> = [
    [138, 188, 1.02],
    [186, 150, 0.98],
    [236, 118, 0.9],
    [284, 98, 0.74],
    [318, 90, 0.46],
    [342, 86, 0.32],
  ];
  return (
    <Ground p={p} label="A white phalaenopsis orchid arching over its leaves" contact={{ x: 128, y: 284, rx: 100, ry: 15 }}>
      <g filter={u("far")} opacity="0.82">
        <path d={blade(30, 74, 0.44)} transform="translate(78 286) rotate(-58)" fill={u("leaf")} />
        <path d={blade(26, 62, 0.44)} transform="translate(164 288) rotate(58)" fill={u("leaf")} />
      </g>

      {/* the arching flower spike */}
      <path
        d="M108 292C116 236 126 202 150 182C196 146 252 112 344 84"
        fill="none"
        stroke="var(--art-stem)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {/* the broad basal leaves */}
      <path d={blade(32, 74, 0.46)} transform="translate(104 292) rotate(-30)" fill={u("leaf")} />
      <path
        d={blade(26, 60, 0.46)}
        transform="translate(104 292) rotate(-30)"
        fill={u("sheen")}
        opacity="0.26"
      />
      <path d={blade(29, 66, 0.46)} transform="translate(126 294) rotate(32)" fill={u("leaf")} />
      <path
        d={blade(23, 54, 0.46)}
        transform="translate(126 294) rotate(32)"
        fill={u("sheen")}
        opacity="0.22"
      />

      {/* blooms drawn tip-first so the near, larger flowers overlap the far ones */}
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

const GARDENIA_WHORLS: Whorl[] = [
  { n: 9, s: 1, rot: 0, wide: 1.08, tall: 0.92, ring: 0.3 },
  { n: 8, s: 0.8, rot: 22, wide: 1.02, tall: 0.96, ring: 0.2 },
  { n: 6, s: 0.56, rot: 44, wide: 0.96, tall: 1, ring: 0.12 },
  { n: 5, s: 0.34, rot: 18, wide: 0.9, tall: 1.02, ring: 0.06, deep: true },
];

export function Gardenias() {
  const p = "ga";
  const u = (n: string) => `url(#${p}-${n})`;
  return (
    <Ground p={p} label="Cream gardenias among glossy dark leaves" contact={{ x: 200, y: 286, rx: 116, ry: 16 }}>
      <g filter={u("far")} opacity="0.9">
        <Leaf p={p} x={148} y={196} a={-74} w={20} h={62} gloss={0.16} />
        <Leaf p={p} x={256} y={190} a={70} w={19} h={58} gloss={0.16} />
        <g transform="translate(208 116)">
          <Rosette p={p} r={20} seed={53} whorls={GARDENIA_WHORLS} center="button" />
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
        <Rosette p={p} r={26} seed={29} whorls={GARDENIA_WHORLS} center="button" />
      </g>
      <g transform="translate(170 152)">
        <Rosette p={p} r={33} seed={2} whorls={GARDENIA_WHORLS} center="button" />
      </g>
    </Ground>
  );
}
