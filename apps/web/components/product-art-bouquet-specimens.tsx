/** Defines bouquet specimen SVG compositions used by the product artwork registry. */

import { blade, rnd, strap, wob } from "./product-art-geometry";
import { Leaf, Rosette, type Whorl } from "./product-art-primitives";
import { Dome, Ground } from "./product-art-stage";

const ROSE_WHORLS: Whorl[] = [
  { n: 8, s: 1, rot: 0, wide: 1.14, tall: 0.9, ring: 0.34 },
  { n: 7, s: 0.82, rot: 26, wide: 1.06, tall: 0.96, ring: 0.24 },
  { n: 6, s: 0.6, rot: 12, wide: 0.98, tall: 1, ring: 0.15 },
  { n: 5, s: 0.42, rot: 44, wide: 0.9, tall: 1.04, ring: 0.08, deep: true },
];

export function Roses() {
  const p = "ro";
  const u = (n: string) => `url(#${p}-${n})`;
  const front: Array<[number, number, number]> = [
    [154, 158, 33],
    [250, 164, 30],
    [202, 122, 39],
  ];
  return (
    <Ground p={p} label="A hand-tied bouquet of deep red garden roses" contact={{ x: 208, y: 288, rx: 128, ry: 18 }}>
      {/* back rank — smaller, softer, behind the plane of focus */}
      <g filter={u("far")} opacity="0.94">
        <path
          d="M204 300C188 246 164 194 126 132M204 300C216 244 244 192 278 124M204 300C202 236 200 158 200 82"
          fill="none"
          stroke="var(--art-stem)"
          strokeOpacity="0.6"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <g transform="translate(124 120)">
          <Rosette p={p} r={25} seed={11} whorls={ROSE_WHORLS} />
        </g>
        <g transform="translate(280 112)">
          <Rosette p={p} r={24} seed={23} whorls={ROSE_WHORLS} />
        </g>
        <g transform="translate(200 72)">
          <Rosette p={p} r={21} seed={37} whorls={ROSE_WHORLS} />
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
          <Rosette p={p} r={r} seed={i * 41 + 5} whorls={ROSE_WHORLS} />
        </g>
      ))}
    </Ground>
  );
}

/** A sunflower head: two ranks of irregular ray florets and a phyllotactic seed disc. */
function SunHead({ p, R, disc, seed }: { p: string; R: number; disc: number; seed: number }) {
  const u = (n: string) => `url(#${p}-${n})`;
  const n = 22;
  const step = 360 / n;
  return (
    <g>
      {/* the shadowed back rank of rays, deeper and slightly longer */}
      {Array.from({ length: n }, (_, i) => {
        const h = R * (0.98 + rnd(seed + i) * 0.12);
        return (
          <path
            key={`b${i}`}
            d={blade(R * 0.16, h, 0.36, 0.72)}
            transform={`rotate(${step * i + step / 2 + wob(seed + i * 3, 6)})`}
            fill={u("petal-deep")}
          />
        );
      })}
      {/* the lit front rank — each ray notched at the tip and set at its own length/angle */}
      {Array.from({ length: n }, (_, i) => {
        const h = R * (0.82 + rnd(seed + i + 90) * 0.2);
        const w = R * (0.15 + rnd(seed + i + 30) * 0.05);
        return (
          <g key={`f${i}`} transform={`rotate(${step * i + wob(seed + i * 5 + 40, 9)})`}>
            <path d={blade(w, h, 0.3, 0.66)} fill={u("petal")} />
            {/* the crease down each ray */}
            <path
              d={`M0 ${-h * 0.16}L0 ${-h * 0.82}`}
              stroke="var(--art-bloom-ink)"
              strokeOpacity="0.2"
              strokeWidth="0.9"
              fill="none"
            />
            {/* the notch shadow at the ray tip */}
            <path
              d={`M${-w * 0.24} ${-h * 0.9}L0 ${-h * 0.8}L${w * 0.24} ${-h * 0.9}`}
              fill="none"
              stroke="var(--art-bloom-ink)"
              strokeOpacity="0.22"
              strokeWidth="0.8"
            />
          </g>
        );
      })}
      {/* the seed disc: a raised, domed cushion, not a flat coin */}
      <circle r={disc * 1.06} fill="var(--art-bloom-ink)" />
      <circle
        r={disc * 0.94}
        fill="none"
        stroke="var(--art-bloom)"
        strokeOpacity="0.5"
        strokeWidth={disc * 0.16}
      />
      {Array.from({ length: 80 }, (_, i) => {
        const th = i * 2.39996;
        const rr = disc * 0.9 * Math.sqrt(i / 80);
        return (
          <circle
            key={i}
            cx={Math.cos(th) * rr}
            cy={Math.sin(th) * rr}
            r={disc * 0.052}
            fill="var(--art-bloom-hi)"
            opacity={0.06 + 0.42 * (rr / disc)}
          />
        );
      })}
      {/* dome the disc so its centre sits proud and its far edge falls into shadow */}
      <circle r={disc * 1.06} fill={u("dome-lo")} />
      <circle r={disc * 1.06} fill={u("dome-hi")} />
      {/* and dome the whole flower head so the petal ring turns with the light */}
      <Dome p={p} r={R * 1.02} />
    </g>
  );
}

export function Sunflowers() {
  const p = "su";
  const u = (n: string) => `url(#${p}-${n})`;
  return (
    <Ground p={p} label="Two sunflowers with broad leaves, cut short" contact={{ x: 200, y: 286, rx: 118, ry: 16 }}>
      <g filter={u("far")} opacity="0.9">
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

/** A closed tulip cup: three petals, the near one lit, cupped and glossy. */
function TulipHead({ p, s, seed }: { p: string; s: number; seed?: number }) {
  const u = (n: string) => `url(#${p}-${n})`;
  const tilt = wob(seed ?? 0, 6);
  return (
    <g transform={`scale(${s}) rotate(${tilt})`}>
      {/* silhouette of the whole closed cup */}
      <path
        d="M-14 3C-17 -12 -13 -30 -6 -38C-4 -26 -3 -20 0 -18C3 -20 4 -26 6 -38C13 -30 17 -12 14 3C10 12 -10 12 -14 3Z"
        fill={u("petal-deep")}
      />
      {/* the two flanking petals, turned away from the light */}
      <path d="M-13 2C-16 -12 -12 -29 -6 -36C-3 -22 -3 -8 -5 3Z" fill={u("petal-deep")} />
      <path d="M13 2C16 -12 12 -29 6 -36C3 -22 3 -8 5 3Z" fill={u("petal-deep")} />
      {/* the near petal, cupped and lit */}
      <path d="M-8 1C-11 -14 -8 -30 0 -36C8 -30 11 -14 8 1C5 9 -5 9 -8 1Z" fill={u("petal")} />
      {/* the fold lines of the near petal */}
      <path
        d="M-3.6 -30C-5.6 -18 -5.6 -8 -4.6 -1"
        fill="none"
        stroke="var(--art-bloom-hi)"
        strokeOpacity="0.5"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M4.6 -29C6.2 -17 6.2 -8 5 -1"
        fill="none"
        stroke="var(--art-bloom-ink)"
        strokeOpacity="0.28"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* a soft specular down the lit petal */}
      <ellipse cx="-2" cy="-18" rx="2.4" ry="12" fill="var(--art-bloom-hi)" opacity="0.4" filter={u("mid")} />
      {/* where the cup closes onto the stem */}
      <path d="M-8 1C-5 9 5 9 8 1C6 9 -6 9 -8 1Z" fill="var(--art-bloom-ink)" opacity="0.4" />
    </g>
  );
}

export function Tulips() {
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
      <g filter={u("far")} opacity="0.88">
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
              <TulipHead p={p} s={s} seed={i * 9 + 3} />
            </g>
          </g>
        ))}
        <path d={strap(140, 18, -26)} transform="translate(134 298)" fill={u("leaf")} opacity="0.82" />
        <path d={strap(130, 17, 28)} transform="translate(272 298)" fill={u("leaf")} opacity="0.82" />
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
            <TulipHead p={p} s={s} seed={i * 17 + 5} />
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

/**
 * One phalaenopsis flower: five broad rounded tepals — three sepals behind, two big lateral
 * petals — around a coloured lip and column. Buds are two small furled tepals. The read has
 * to be "moth orchid", so the tepals are broad and overlapping, not thin blades.
 */
