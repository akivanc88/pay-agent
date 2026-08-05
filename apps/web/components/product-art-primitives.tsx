/** Provides reusable SVG leaf, petal, stem, and pot primitives for product artwork. */

import { blade, bladeLee, petal, rnd, wob } from "./product-art-geometry";
import { Dome } from "./product-art-stage";

export function Leaf({
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

export type Whorl = {
  n: number;
  s: number;
  rot: number;
  wide: number;
  tall: number;
  ring: number;
  deep?: boolean;
};

export function Rosette({
  p,
  r,
  seed,
  whorls,
  center = "furl",
  accent,
}: {
  p: string;
  r: number;
  seed: number;
  whorls: Whorl[];
  center?: "furl" | "button";
  accent?: string;
}) {
  const u = (n: string) => `url(#${p}-${n})`;
  return (
    <g>
      <circle r={r * 0.82} fill="var(--art-bloom-lo)" />
      {whorls.map((w, wi) => {
        const grad = w.deep ? "petal-deep" : "petal";
        return (
          <g key={wi}>
            {Array.from({ length: w.n }, (_, i) => {
              const a = w.rot + (360 / w.n) * i + wob(seed + wi * 13 + i, 16);
              const s = w.s * (0.84 + rnd(seed + i * 7 + wi * 3) * 0.3);
              const curl = wob(seed + wi * 7 + i * 2, 0.42);
              const rad = r * w.ring;
              const rx = Math.sin((a * Math.PI) / 180) * rad;
              const ry = -Math.cos((a * Math.PI) / 180) * rad;
              return (
                <path
                  key={i}
                  d={petal(r * s, w.wide, w.tall, curl)}
                  transform={`translate(${rx.toFixed(2)} ${ry.toFixed(2)}) rotate(${a.toFixed(2)})`}
                  fill={u(grad)}
                  stroke="var(--art-bloom-ink)"
                  strokeOpacity="0.16"
                  strokeWidth="0.5"
                />
              );
            })}
          </g>
        );
      })}
      {center === "furl" ? (
        <g transform={`translate(${(-r * 0.05).toFixed(2)} ${(-r * 0.07).toFixed(2)})`}>
          <circle r={r * 0.3} fill={u("petal-deep")} />
          {Array.from({ length: 5 }, (_, k) => {
            const a = 32 + k * 74 + wob(seed + k * 3 + 90, 20);
            const s = 0.28 - k * 0.03;
            return (
              <path
                key={k}
                d={petal(r * s, 0.94, 1.02, 0.36)}
                transform={`rotate(${a.toFixed(2)})`}
                fill={u("petal-deep")}
                stroke="var(--art-bloom-ink)"
                strokeOpacity="0.3"
                strokeWidth="0.4"
              />
            );
          })}
          <path
            d={`M${-r * 0.12} ${-r * 0.02}C${-r * 0.16} ${r * 0.12} ${r * 0.16} ${r * 0.12} ${r * 0.12} ${-r * 0.02}`}
            fill="none"
            stroke="var(--art-bloom-ink)"
            strokeOpacity="0.5"
            strokeWidth={r * 0.05}
            strokeLinecap="round"
          />
          <ellipse cx={-r * 0.05} cy={-r * 0.1} rx={r * 0.06} ry={r * 0.04} fill="var(--art-bloom-hi)" opacity="0.7" />
        </g>
      ) : (
        <g>
          <circle r={r * 0.2} fill={u("hollow")} />
          <circle r={r * 0.1} fill={accent ?? "var(--art-accent)"} opacity="0.85" />
          {Array.from({ length: 7 }, (_, k) => (
            <circle
              key={k}
              cx={Math.cos((k / 7) * 6.28) * r * 0.11}
              cy={Math.sin((k / 7) * 6.28) * r * 0.11}
              r={r * 0.02}
              fill={accent ?? "var(--art-accent)"}
            />
          ))}
        </g>
      )}
      <Dome p={p} r={r * 1.02} />
    </g>
  );
}
