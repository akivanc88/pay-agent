/** Defines the shared potted specimen SVG composition. */

import { blade, bladeLee } from "./product-art-geometry";
import { Ground } from "./product-art-stage";

export function CeramicPot() {
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
              <path d={bladeLee(w, h * 0.54, 0.4)} fill="var(--art-stem)" opacity="0.18" />
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
