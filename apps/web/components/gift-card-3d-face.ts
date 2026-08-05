/** Builds the gift-card face geometry and material assignments for the Three.js scene. */

import {
  CARD_FACE_HEIGHT,
  CARD_FACE_WIDTH,
  type CardPalette,
  type CardTextureMode,
} from "./gift-card-3d-textures";

export function paintCardFace(
  ctx: CanvasRenderingContext2D,
  mode: CardTextureMode,
  p: CardPalette,
  last4: string,
  label: string,
  brand: string,
  balance: string,
) {
  const color = mode === "color";

  // In material mode: green = roughness, blue = metalness. Foil is near-mirror metal, the
  // body is a satin non-metal, the printed digits sit between the two.
  /* Roughness 0.30, not a mirror. Foil that is too smooth reflects the key as pure white
     and the wordmark reads as a blank scratch; a little roughness keeps the gold in it. */
  const FOIL_M = "rgb(0, 76, 255)";
  const BODY_M = "rgb(0, 158, 26)";
  const INK_M = "rgb(0, 108, 44)";

  ctx.clearRect(0, 0, CARD_FACE_WIDTH, CARD_FACE_HEIGHT);

  /* body */
  if (color) {
    const g = ctx.createLinearGradient(0, 0, CARD_FACE_WIDTH, CARD_FACE_HEIGHT);
    g.addColorStop(0, p["--card-bg-2"]);
    g.addColorStop(0.55, p["--card-bg-1"]);
    g.addColorStop(1, p["--card-bg-3"]);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = BODY_M;
  }
  ctx.fillRect(0, 0, CARD_FACE_WIDTH, CARD_FACE_HEIGHT);

  /* brushed grain — fine horizontal streaks. Invisible as texture, but they break the
     specular into the anisotropic sweep that makes the surface read as milled metal. */
  ctx.save();
  for (let y = 0; y < CARD_FACE_HEIGHT; y += 1.5) {
    const n = Math.sin(y * 12.9898) * 43758.5453;
    const j = n - Math.floor(n);
    if (color) {
      ctx.fillStyle = p["--card-ink"];
      ctx.globalAlpha = 0.012 + j * 0.016;
    } else {
      ctx.fillStyle = `rgb(0, ${Math.round(142 + j * 34)}, 26)`;
      ctx.globalAlpha = 0.8;
    }
    ctx.fillRect(0, y, CARD_FACE_WIDTH, 0.9);
  }
  ctx.restore();

  /* guilloché — the concentric engraving of security print */
  ctx.save();
  ctx.strokeStyle = color ? p["--card-gold"] : FOIL_M;
  ctx.globalAlpha = color ? 0.13 : 0.22;
  ctx.lineWidth = 0.75;
  for (const r of [120, 160, 200, 240, 280]) {
    ctx.beginPath();
    ctx.arc(330, 60, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  /* a baked lighting wash, top-left, so the card is never flat even head-on */
  if (color) {
    ctx.save();
    const s = ctx.createLinearGradient(0, 0, CARD_FACE_WIDTH * 0.75, CARD_FACE_HEIGHT);
    s.addColorStop(0, p["--card-ink"]);
    s.addColorStop(0.45, p["--card-ink"]);
    s.addColorStop(1, p["--card-ink"]);
    ctx.fillStyle = s;
    ctx.globalAlpha = 0.05;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(CARD_FACE_WIDTH, 0);
    ctx.lineTo(0, CARD_FACE_HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* foil paint — a gradient across the whole card so every foil element belongs to one
     sheet of foil rather than each being separately gold */
  const foil = () => {
    if (!color) return FOIL_M;
    const g = ctx.createLinearGradient(0, 0, CARD_FACE_WIDTH, CARD_FACE_HEIGHT);
    g.addColorStop(0, p["--card-foil-hi"]);
    g.addColorStop(0.5, p["--card-gold"]);
    g.addColorStop(1, p["--card-foil-lo"]);
    return g;
  };

  /* brand mark — the sprout, same path as the site header */
  ctx.save();
  ctx.translate(28, 28);
  ctx.strokeStyle = foil();
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(
    new Path2D(
      "M11 22V10M11 10c0-3.6-2.6-6.6-6.6-7.1C4.1 7.7 6.6 11 11 11Zm0 0c0-3.3 2.2-6.2 6-6.6C17.3 8.4 14.9 11 11 11Z",
    ),
  );
  ctx.restore();

  ctx.save();
  ctx.fillStyle = foil();
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 20px ${p.serif}`;
  ctx.fillText("pay·agent", 52, 45);

  ctx.font = `640 12px ${p.sans}`;
  ctx.textAlign = "right";
  ctx.letterSpacing = "2.1px";
  ctx.fillText(label.toUpperCase(), 372, 42);
  ctx.letterSpacing = "0px";
  ctx.restore();

  /* chip */
  ctx.save();
  ctx.translate(30, 92);
  ctx.fillStyle = color
    ? (() => {
        const g = ctx.createLinearGradient(0, 0, 52, 40);
        g.addColorStop(0, p["--card-foil-hi"]);
        g.addColorStop(1, p["--card-foil-lo"]);
        return g;
      })()
    : FOIL_M;
  ctx.beginPath();
  ctx.roundRect(0, 0, 52, 40, 8);
  ctx.fill();
  ctx.strokeStyle = color ? p["--card-bg-1"] : BODY_M;
  ctx.globalAlpha = color ? 0.55 : 1;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 13); ctx.lineTo(52, 13);
  ctx.moveTo(0, 27); ctx.lineTo(52, 27);
  ctx.moveTo(18, 0); ctx.lineTo(18, 40);
  ctx.moveTo(34, 0); ctx.lineTo(34, 40);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(14, 11, 24, 18, 4);
  ctx.stroke();
  ctx.restore();

  /* the number — only the last four are ever known to this app */
  ctx.save();
  ctx.fillStyle = color ? p["--card-ink"] : INK_M;
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "0.5px";
  ctx.font = `500 21px ${p.mono}`;
  const dots = "•••• •••• •••• ";
  ctx.fillText(dots, 30, 176);
  const dotsWidth = ctx.measureText(dots).width;
  ctx.font = `500 27px ${p.mono}`;
  ctx.fillText(last4, 30 + dotsWidth, 176);
  ctx.letterSpacing = "0px";
  ctx.restore();

  /* balance, and the issuer footing */
  ctx.save();
  ctx.fillStyle = color ? p["--card-ink-dim"] : INK_M;
  ctx.font = `640 10px ${p.sans}`;
  ctx.letterSpacing = "1.6px";
  ctx.fillText("BALANCE", 30, 206);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = foil();
  ctx.font = `600 26px ${p.serif}`;
  ctx.fillText(balance, 30, 230);

  ctx.fillStyle = color ? p["--card-ink-dim"] : INK_M;
  ctx.font = `600 13px ${p.sans}`;
  ctx.textAlign = "right";
  ctx.fillText(brand, 372, 230);
  ctx.restore();
}

/* ── the relief map ────────────────────────────────────────────────────────
   A greyscale height field of the same face, black where the card is flat and
   bright where an element stands off it. It is what turns "a picture of a card"
   into a milled object: the wordmark and balance are *foil-stamped* — pressed
   proud of the body so their edges catch the key as it sweeps past — the number
   is *embossed*, and the chip is a raised plateau with recessed contacts. Fed to
   the material as a bump map, so the relief is in the lit normals, not painted
   into the albedo where it would sit dead-flat under any light.

   Drawn from the exact coordinates and fonts of `drawFace`, so the relief lands
   registered to the art rather than a hair off it — a foil edge that missed its
   letter would read as a mis-struck stamp. A soft blur rounds every stamp so the
   bump derivative is a bevel, not an aliased cliff. */
export function paintCardHeight(
  ctx: CanvasRenderingContext2D,
  p: CardPalette,
  last4: string,
  label: string,
  brand: string,
  balance: string,
) {
  const gray = (v: number) => `rgb(${v}, ${v}, ${v})`;

  ctx.clearRect(0, 0, CARD_FACE_WIDTH, CARD_FACE_HEIGHT);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, CARD_FACE_WIDTH, CARD_FACE_HEIGHT);

  // Round every strike into a bevel rather than a sheer wall of height.
  ctx.filter = "blur(0.7px)";

  /* guilloché — engraved, so barely proud of the body */
  ctx.save();
  ctx.strokeStyle = gray(34);
  ctx.lineWidth = 0.75;
  for (const r of [120, 160, 200, 240, 280]) {
    ctx.beginPath();
    ctx.arc(330, 60, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  /* brand mark + wordmark — foil-stamped, standing proud */
  ctx.save();
  ctx.translate(28, 28);
  ctx.strokeStyle = gray(190);
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(
    new Path2D(
      "M11 22V10M11 10c0-3.6-2.6-6.6-6.6-7.1C4.1 7.7 6.6 11 11 11Zm0 0c0-3.3 2.2-6.2 6-6.6C17.3 8.4 14.9 11 11 11Z",
    ),
  );
  ctx.restore();

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = gray(205);
  ctx.font = `600 20px ${p.serif}`;
  ctx.fillText("pay·agent", 52, 45);
  ctx.fillStyle = gray(150);
  ctx.font = `640 12px ${p.sans}`;
  ctx.textAlign = "right";
  ctx.letterSpacing = "2.1px";
  ctx.fillText(label.toUpperCase(), 372, 42);
  ctx.letterSpacing = "0px";
  ctx.restore();

  /* chip — a raised plateau, its contact grooves pressed back into it */
  ctx.save();
  ctx.translate(30, 92);
  ctx.fillStyle = gray(210);
  ctx.beginPath();
  ctx.roundRect(0, 0, 52, 40, 8);
  ctx.fill();
  ctx.strokeStyle = gray(90);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 13); ctx.lineTo(52, 13);
  ctx.moveTo(0, 27); ctx.lineTo(52, 27);
  ctx.moveTo(18, 0); ctx.lineTo(18, 40);
  ctx.moveTo(34, 0); ctx.lineTo(34, 40);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(14, 11, 24, 18, 4);
  ctx.stroke();
  ctx.restore();

  /* the number — embossed, the tallest relief on the card */
  ctx.save();
  ctx.fillStyle = gray(215);
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "0.5px";
  ctx.font = `500 21px ${p.mono}`;
  const dots = "•••• •••• •••• ";
  ctx.fillText(dots, 30, 176);
  const dotsWidth = ctx.measureText(dots).width;
  ctx.font = `500 27px ${p.mono}`;
  ctx.fillText(last4, 30 + dotsWidth, 176);
  ctx.letterSpacing = "0px";
  ctx.restore();

  /* balance foil-stamped; its label and the issuer only faintly proud */
  ctx.save();
  ctx.fillStyle = gray(110);
  ctx.font = `640 10px ${p.sans}`;
  ctx.letterSpacing = "1.6px";
  ctx.fillText("BALANCE", 30, 206);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = gray(200);
  ctx.font = `600 26px ${p.serif}`;
  ctx.fillText(balance, 30, 230);
  ctx.fillStyle = gray(110);
  ctx.font = `600 13px ${p.sans}`;
  ctx.textAlign = "right";
  ctx.fillText(brand, 372, 230);
  ctx.restore();

  ctx.filter = "none";
}
