/** Owns the gift-card scene lifecycle, observers, animation frame, and GPU cleanup. */

"use client";

import { useEffect, useRef, useState } from "react";

import { WalletStaticCard, type FeaturedCard } from "./wallet-static-card";
import { paintCardFace, paintCardHeight } from "./gift-card-3d-face";
import { createGiftCardRenderer } from "./gift-card-3d-renderer";
import { startGiftCardMotion } from "./gift-card-3d-motion";
import { createCardTextureCanvases } from "./gift-card-3d-textures";
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

/** True when the browser can actually give us a WebGL context, not merely claims the API. */
function webglAvailable(): boolean {
  try {
    const probe = document.createElement("canvas");
    return !!(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

export function GiftCard3DScene({ card, className = "" }: { card: FeaturedCard; className?: string }) {
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

      /* All three maps share a palette, coordinate space, and scale so color, material,
         and relief remain pixel-registered after every theme re-bake. */
      const textures = createCardTextureCanvases(host, card, {
        face: (ctx, mode, palette, textureCard) =>
          paintCardFace(
            ctx,
            mode,
            palette,
            textureCard.last4,
            textureCard.label,
            textureCard.brand,
            textureCard.balanceDisplay,
          ),
        height: (ctx, palette, textureCard) =>
          paintCardHeight(
            ctx,
            palette,
            textureCard.last4,
            textureCard.label,
            textureCard.brand,
            textureCard.balanceDisplay,
          ),
      });
      if (!textures || disposed) return;

      const render = createGiftCardRenderer({ THREE, RoomEnvironment, canvas, textures });
      const { renderer, scene, camera, pivot } = render;
      /* ── resize ────────────────────────────────────────────────────── */
      const resize = () => render.resize(host);
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);
      teardown.push(() => ro.disconnect());

      teardown.push(startGiftCardMotion(host, pivot, () => renderer.render(scene, camera)));
      teardown.push(() => render.dispose());

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
