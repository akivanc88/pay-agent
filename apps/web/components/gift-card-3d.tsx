"use client";

import { useEffect, useRef, useState } from "react";

import { WalletStaticCard, type FeaturedCard } from "./wallet-static-card";
import styles from "./gift-card-3d.module.css";

/**
 * The one piece of spectacle in the whole app.
 *
 * Everywhere else this project argues that a payment surface earns trust by being calm.
 * That argument is only worth making once, and it is made here: a single gift card,
 * rendered as a physical object — milled metal, gold foil, a specular sheen that sweeps
 * across the foil as the card tilts under the pointer. It is slow, damped, and it comes
 * to rest. It is not a spinning toy.
 *
 * Three things about how it is built are deliberate:
 *
 * 1. **Three.js is never in the first-paint bundle.** The import lives inside an effect,
 *    so the WebGL runtime is fetched after the wallet has already rendered and the visitor
 *    has already read their balances. A funding page must not wait on a decoration.
 *
 * 2. **The still card is the floor, not the failure case.** `WalletStaticCard` renders
 *    first and stays mounted underneath. Under `prefers-reduced-motion`, without WebGL, or
 *    if the chunk simply fails to load, that is what a visitor sees — and it is designed to
 *    be worth seeing on its own. Nothing is hidden behind the animation; the same brand,
 *    last four and balance are present either way.
 *
 * 3. **The card's colours are the page's tokens.** Both the texture and the lights read
 *    the same `--card-*` custom properties the static card uses, resolved off the DOM, so
 *    the two renderings are the same object and a theme change re-bakes the texture rather
 *    than leaving a light-theme card sitting on a dark page.
 *
 * The face carries only what is genuinely known: the brand mark, the last four digits, and
 * a balance the store has already formatted. No PAN reaches this app, and no amount is
 * computed here.
 */

/** Local names for the card's own palette, declared in the CSS module and read at runtime. */
const PALETTE_VARS = [
  "--card-bg-1",
  "--card-bg-2",
  "--card-bg-3",
  "--card-ink",
  "--card-ink-dim",
  "--card-foil-hi",
  "--card-foil-lo",
  "--card-gold",
] as const;

type PaletteVar = (typeof PALETTE_VARS)[number];
type Palette = Record<PaletteVar, string> & {
  serif: string;
  sans: string;
  mono: string;
};

function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  const out = {} as Palette;
  for (const name of PALETTE_VARS) out[name] = cs.getPropertyValue(name).trim() || "#000";
  // Font stacks come from the same computed style, so the card's typography is the app's
  // typography — not whatever canvas would otherwise fall back to.
  out.serif = cs.getPropertyValue("--font-serif").trim() || "serif";
  out.sans = cs.getPropertyValue("--font-sans").trim() || "sans-serif";
  out.mono = cs.getPropertyValue("--font-mono").trim() || "monospace";
  return out;
}

/* ── the card face ─────────────────────────────────────────────────────────
   Drawn twice from one routine: once in colour for the albedo map, once as a
   material mask whose green channel is roughness and blue channel metalness.
   Drawing both from the same code is what keeps the foil *exactly* aligned
   with the metal — a mask that drifted from the art would read as a printing
   error on a card that is meant to look milled. */

type DrawMode = "color" | "material";

/** Design space matches `wallet-static-card.tsx` so the two faces stay in step. */
const FACE_W = 400;
const FACE_H = 252;

function drawFace(
  ctx: CanvasRenderingContext2D,
  mode: DrawMode,
  p: Palette,
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

  ctx.clearRect(0, 0, FACE_W, FACE_H);

  /* body */
  if (color) {
    const g = ctx.createLinearGradient(0, 0, FACE_W, FACE_H);
    g.addColorStop(0, p["--card-bg-2"]);
    g.addColorStop(0.55, p["--card-bg-1"]);
    g.addColorStop(1, p["--card-bg-3"]);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = BODY_M;
  }
  ctx.fillRect(0, 0, FACE_W, FACE_H);

  /* brushed grain — fine horizontal streaks. Invisible as texture, but they break the
     specular into the anisotropic sweep that makes the surface read as milled metal. */
  ctx.save();
  for (let y = 0; y < FACE_H; y += 1.5) {
    const n = Math.sin(y * 12.9898) * 43758.5453;
    const j = n - Math.floor(n);
    if (color) {
      ctx.fillStyle = p["--card-ink"];
      ctx.globalAlpha = 0.012 + j * 0.016;
    } else {
      ctx.fillStyle = `rgb(0, ${Math.round(142 + j * 34)}, 26)`;
      ctx.globalAlpha = 0.8;
    }
    ctx.fillRect(0, y, FACE_W, 0.9);
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
    const s = ctx.createLinearGradient(0, 0, FACE_W * 0.75, FACE_H);
    s.addColorStop(0, p["--card-ink"]);
    s.addColorStop(0.45, p["--card-ink"]);
    s.addColorStop(1, p["--card-ink"]);
    ctx.fillStyle = s;
    ctx.globalAlpha = 0.05;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(FACE_W, 0);
    ctx.lineTo(0, FACE_H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* foil paint — a gradient across the whole card so every foil element belongs to one
     sheet of foil rather than each being separately gold */
  const foil = () => {
    if (!color) return FOIL_M;
    const g = ctx.createLinearGradient(0, 0, FACE_W, FACE_H);
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

/** True when the browser can actually give us a WebGL context, not merely claims the API. */
function webglAvailable(): boolean {
  try {
    const probe = document.createElement("canvas");
    return !!(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

export function GiftCard3D({ card, className = "" }: { card: FeaturedCard; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  /** Bumped by the theme observer to force a full re-bake of the scene's colours. */
  const [themeKey, setThemeKey] = useState(0);

  /* Re-bake on a theme change. The card is a physical object built out of the page's
     tokens, so when the tokens change the object has to be rebuilt — a light-theme card
     left sitting on a dark page would be the one thing worse than no card at all. */
  useEffect(() => {
    const bump = () => setThemeKey((k) => k + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", bump);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    // Two reasons never to start: the visitor asked for less motion, or the machine cannot
    // render it. Both land on the same designed still card.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!webglAvailable()) return;

    let disposed = false;
    const teardown: Array<() => void> = [];

    (async () => {
      let THREE: typeof import("three");
      let RoomEnvironment: typeof import("three/examples/jsm/environments/RoomEnvironment.js").RoomEnvironment;
      try {
        // Loaded here, after paint, and nowhere else — this import is the only reason the
        // component exists as a client boundary at all.
        [THREE, { RoomEnvironment }] = await Promise.all([
          import("three"),
          import("three/examples/jsm/environments/RoomEnvironment.js"),
        ]);
        // Fonts must be resolved before the face is drawn to a canvas, or the typography
        // bakes into the texture as a fallback stack and cannot be corrected later.
        await document.fonts?.ready;
      } catch {
        return; // The still card is already on screen. Nothing to report, nothing to fix.
      }
      if (disposed) return;

      const palette = readPalette(host);

      /* ── the face textures ─────────────────────────────────────────── */
      const SCALE = 3; // 1200×756 — enough that the mono digits stay crisp at 2× DPR
      const makeFace = (mode: DrawMode) => {
        const c = document.createElement("canvas");
        c.width = FACE_W * SCALE;
        c.height = FACE_H * SCALE;
        const ctx = c.getContext("2d");
        if (!ctx) return null;
        ctx.scale(SCALE, SCALE);
        drawFace(ctx, mode, palette, card.last4, card.label, card.brand, card.balanceDisplay);
        return c;
      };

      const colorCanvas = makeFace("color");
      const materialCanvas = makeFace("material");
      if (!colorCanvas || !materialCanvas || disposed) return;

      /* ── renderer ──────────────────────────────────────────────────── */
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true, // the page's paper shows through; the card floats on it
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      /* Under 1.0 the card is a *dark* object lit hard enough to read as a light one: the
         near-black albedo plus a full-strength environment, key and rim washed the whole
         face toward silver and took the foil lettering with it. The still SVG underneath is
         the reference — these numbers exist to make the lit render match that object, not to
         make it bright. See the contrast assertion in scripts/card-contrast.mjs. */
      renderer.toneMappingExposure = 0.74;

      const map = new THREE.CanvasTexture(colorCanvas);
      map.colorSpace = THREE.SRGBColorSpace;
      const ormMap = new THREE.CanvasTexture(materialCanvas);
      for (const t of [map, ormMap]) {
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        // Extrude's world UVs are the vertex x/y, so the texture is placed by mapping the
        // card's own dimensions onto 0…1 rather than by trusting a generated layout.
        t.repeat.set(1 / CARD_W, 1 / CARD_H);
        t.offset.set(0.5, 0.5);
      }

      /* ── scene, camera, light ──────────────────────────────────────── */
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
      camera.position.set(0, 0, 4.4);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      const envRT = pmrem.fromScene(room, 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.3;
      room.dispose();
      pmrem.dispose();

      /* The key, whose reflection travels across the foil as the card turns — the sheen is
         a real specular, not a gradient slid across the surface.

         Its placement is a legibility constraint, not a taste one. Aimed from the upper
         left it puts its hot spot exactly on the wordmark, and a near-mirror foil under a
         bright white key clips to white: the brand mark disappears. So the light comes from
         above and slightly right, landing the lobe on the empty guilloché field in the
         middle of the card where there is nothing to wash out, and it is dim enough that
         the highlight rolls off instead of clipping. */
      const key = new THREE.DirectionalLight(0xffffff, 0.95);
      key.position.set(0.6, 2.4, 4.0);
      scene.add(key);

      const rim = new THREE.DirectionalLight(0xffffff, 0.45);
      rim.position.set(2.6, -1.6, 1.4);
      scene.add(rim);

      /* ── the card ──────────────────────────────────────────────────── */
      const shape = new THREE.Shape();
      {
        const r = 0.085;
        const x0 = -CARD_W / 2, y0 = -CARD_H / 2, x1 = CARD_W / 2, y1 = CARD_H / 2;
        shape.moveTo(x0 + r, y0);
        shape.lineTo(x1 - r, y0);
        shape.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
        shape.lineTo(x1, y1 - r);
        shape.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
        shape.lineTo(x0 + r, y1);
        shape.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
        shape.lineTo(x0, y0 + r);
        shape.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
      }

      const THICKNESS = 0.045;
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: THICKNESS,
        bevelEnabled: true,
        bevelThickness: 0.007,
        bevelSize: 0.007,
        bevelOffset: 0,
        bevelSegments: 4,
        curveSegments: 32,
      });
      geometry.translate(0, 0, -THICKNESS / 2);

      const faceMaterial = new THREE.MeshPhysicalMaterial({
        map,
        roughnessMap: ormMap,
        metalnessMap: ormMap,
        roughness: 1,
        metalness: 1,
        /* A laminate sheen, not a wet gloss. At 0.55/0.16 the coat threw a broad mirror
           reflection of the environment over the whole face, which is most of why the card
           read as silver rather than as a dark card with a shine on it. */
        clearcoat: 0.22,
        clearcoatRoughness: 0.34,
        envMapIntensity: 0.6,
      });
      // Brushed metal: the highlight stretches along the grain instead of pooling into a
      // dot. This is what separates "a picture of a card" from "a milled object".
      faceMaterial.anisotropy = 0.5;
      faceMaterial.anisotropyRotation = Math.PI / 2;

      const edgeMaterial = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(palette["--card-gold"]),
        roughness: 0.3,
        metalness: 1,
        envMapIntensity: 1.3,
      });

      // ExtrudeGeometry emits group 0 for the two caps and group 1 for the side walls, so
      // the milled gold edge is a material rather than something painted into the texture.
      const cardMesh = new THREE.Mesh(geometry, [faceMaterial, edgeMaterial]);
      const pivot = new THREE.Group();
      pivot.add(cardMesh);
      scene.add(pivot);

      /* ── resize ────────────────────────────────────────────────────── */
      const resize = () => {
        const { width, height } = host.getBoundingClientRect();
        if (!width || !height) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        // Frame on the card's width so a narrow phone crops the margin, not the card.
        const vFov = 2 * Math.atan(Math.tan((24 * Math.PI) / 360) * camera.aspect);
        camera.position.z = (CARD_W * 1.16) / 2 / Math.tan(vFov / 2);
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);
      teardown.push(() => ro.disconnect());

      /* ── pointer ───────────────────────────────────────────────────── */
      // Tracked against the card's own rect with a generous divisor, so the card starts
      // responding as the pointer approaches rather than snapping when it arrives.
      const MAX_TILT = 0.21; // ~12°, past which a card stops looking like it is resting
      let targetX = -0.045;
      let targetY = 0.07;
      let curX = targetX;
      let curY = targetY;
      let velX = 0;
      let velY = 0;
      let pointerActive = false;

      const rest = () => {
        pointerActive = false;
        targetX = -0.045;
        targetY = 0.07;
      };

      const onPointerMove = (e: PointerEvent) => {
        const r = host.getBoundingClientRect();
        const nx = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.85);
        const ny = (e.clientY - (r.top + r.height / 2)) / (r.height * 0.95);
        if (Math.abs(nx) > 1.6 || Math.abs(ny) > 1.9) {
          rest();
          return;
        }
        pointerActive = true;
        targetY = Math.max(-1, Math.min(1, nx)) * MAX_TILT;
        targetX = Math.max(-1, Math.min(1, ny)) * MAX_TILT * 0.72;
      };

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("blur", rest);
      host.addEventListener("pointerleave", rest);
      teardown.push(() => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("blur", rest);
        host.removeEventListener("pointerleave", rest);
      });

      /* ── loop ──────────────────────────────────────────────────────── */
      // Paused whenever the card is off screen or the tab is hidden: a decoration has no
      // business spending a battery it cannot be seen by.
      let visible = true;
      const io = new IntersectionObserver(([entry]) => {
        visible = entry?.isIntersecting ?? true;
      });
      io.observe(host);
      teardown.push(() => io.disconnect());

      let raf = 0;
      let last = performance.now();
      const t0 = last;

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min((now - last) / 1000, 1 / 30);
        last = now;
        if (!visible || document.hidden) return;

        // At rest the card breathes: two slow, out-of-phase sines with a total amplitude of
        // about one degree. Enough that the foil is never frozen, far too little to read as
        // an animation playing.
        const t = (now - t0) / 1000;
        const driftY = pointerActive ? 0 : Math.sin(t * 0.34) * 0.018;
        const driftX = pointerActive ? 0 : Math.cos(t * 0.23) * 0.012;

        // A critically damped spring. It settles without overshoot, which is what makes the
        // movement read as weight rather than as easing.
        const stiffness = 46;
        const damping = 2 * Math.sqrt(stiffness);
        velX += (-(curX - (targetX + driftX)) * stiffness - velX * damping) * dt;
        velY += (-(curY - (targetY + driftY)) * stiffness - velY * damping) * dt;
        curX += velX * dt;
        curY += velY * dt;

        pivot.rotation.x = curX;
        pivot.rotation.y = curY;
        // A hair of counter-roll, the way a held card twists as it tips.
        pivot.rotation.z = curY * -0.06;

        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);
      teardown.push(() => cancelAnimationFrame(raf));

      teardown.push(() => {
        geometry.dispose();
        faceMaterial.dispose();
        edgeMaterial.dispose();
        map.dispose();
        ormMap.dispose();
        envRT.dispose();
        renderer.dispose();
      });

      setLive(true);
    })();

    return () => {
      disposed = true;
      setLive(false);
      for (const fn of teardown) fn();
    };
  }, [card.last4, card.label, card.brand, card.balanceDisplay, themeKey]);

  return (
    <div
      ref={hostRef}
      className={`${styles.host} ${className}`}
      data-live={live || undefined}
      role="img"
      aria-label={`${card.brand} ${card.label}, ending ${card.last4}, balance ${card.balanceDisplay}`}
    >
      {/* Rendered first and never unmounted: it holds the layout, it is what a
          reduced-motion or WebGL-less visitor keeps, and it is the thing the canvas
          fades in over. */}
      <WalletStaticCard card={card} className={styles.still} ariaHidden />
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden />
    </div>
  );
}

/** Card proportions, in world units — 85.6 × 54 mm, the ISO/IEC 7810 ID-1 the eye knows. */
const CARD_W = 1.586;
const CARD_H = 1;
