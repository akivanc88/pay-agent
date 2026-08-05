/** Deterministic variation keeps server and client SVG path data identical. */
export function rnd(i: number): number {
  const value = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function wob(i: number, amount: number): number {
  return (rnd(i) - 0.5) * amount;
}

/** A blade (leaf or ray floret), based at the origin with its tip pointing up. */
export function blade(w: number, h: number, curl = 0.34, tip = 0.86): string {
  return (
    `M0 0C${-w} ${-h * curl} ${-w * tip} ${-h * 0.82} 0 ${-h}` +
    `C${w * tip} ${-h * 0.82} ${w} ${-h * curl} 0 0Z`
  );
}

/** The shaded half of a blade, used to give leaves directional form. */
export function bladeLee(w: number, h: number, curl = 0.34, tip = 0.86): string {
  return `M0 0C${w} ${-h * curl} ${w * tip} ${-h * 0.82} 0 ${-h}C0 ${-h * 0.6} 0 ${-h * 0.3} 0 0Z`;
}

/** A ruffled, reflexed petal based at the origin and opening upward. */
export function petal(r: number, wide = 1, tall = 1, curl = 0): string {
  const w = r * wide;
  const h = r * tall;
  const c = curl * w;
  return (
    `M0 0` +
    `C${-w} ${-h * 0.14} ${-w * 1.04} ${-h * 0.64} ${-w * 0.7 + c} ${-h * 0.86}` +
    `C${-w * 0.46 + c} ${-h * 0.99} ${-w * 0.2 + c} ${-h * 0.98} ${c} ${-h * 0.9}` +
    `C${w * 0.2 + c} ${-h * 0.98} ${w * 0.46 + c} ${-h * 0.99} ${w * 0.7 + c} ${-h * 0.86}` +
    `C${w * 1.04} ${-h * 0.64} ${w} ${-h * 0.14} 0 0Z`
  );
}

/** A broad, rounded cupped petal based at the origin. */
export function cup(r: number, wide = 1, tall = 1): string {
  const w = r * wide;
  const h = r * tall;
  return `M0 0C${-w * 1.04} ${-h * 0.12} ${-w * 0.94} ${-h} 0 ${-h}C${w * 0.94} ${-h} ${w * 1.04} ${-h * 0.12} 0 0Z`;
}

/** A long strap leaf with a controllable bend. */
export function strap(length: number, width: number, bend: number): string {
  return (
    `M0 0C${-width} ${-length * 0.32} ${bend - width * 0.7} ${-length * 0.74} ${bend} ${-length}` +
    `C${bend + width * 0.55} ${-length * 0.72} ${width * 0.9} ${-length * 0.3} 0 0Z`
  );
}
