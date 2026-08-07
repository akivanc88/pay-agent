/**
 * The agent core, rendered in WebGL — the three.js layer over the console's hero.
 *
 * Built the same disciplined way as the wallet's 3D gift card (`gift-card-3d-scene.tsx`):
 *
 * 1. **three.js is never in the first-paint bundle.** The import lives inside the effect, so the
 *    console renders and streams a run before the WebGL runtime is ever fetched.
 * 2. **The CSS orb is the floor, not the failure case.** The marquee's `.core` rings and sparks render
 *    first and stay mounted; under `prefers-reduced-motion`, without WebGL, or if the chunk fails to
 *    load, that is what a visitor keeps. This component only fades a richer core in on top when it can.
 * 3. **It replaces one thing: the flat CSS node.** The elegant orbital rings and sparks stay as the
 *    frame; in their centre, instead of a glowing dot, sits a small reflective jewel that tilts,
 *    breathes, and shifts colour with the run's state. It carries no information the transcript doesn't.
 */
"use client";

import { useEffect, useRef, useState } from "react";

import type { AgentState } from "./agent-marquee";
import styles from "./agent-orb.module.css";

/**
 * The jewel's colour per state — a *material* constant, like the foil trio in globals.css: a physical
 * gem does not change hue when the page theme flips. These track the CSS `--accent` the rings use.
 */
const ORB_ACCENT: Record<AgentState, string> = {
  idle: "#e2c988",
  thinking: "#f3d99b",
  settled: "#f3d99b",
  paused: "#eab35d",
  failed: "#e28d7d",
};

function webglAvailable(): boolean {
  try {
    const probe = document.createElement("canvas");
    return !!(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

export function AgentOrb3D({ state, onLive }: { state: AgentState; onLive?: (live: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const stateRef = useRef<AgentState>(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!webglAvailable()) return;

    let disposed = false;
    let raf = 0;
    const teardown: Array<() => void> = [];

    (async () => {
      let THREE: typeof import("three");
      let RoomEnvironment: typeof import("three/examples/jsm/environments/RoomEnvironment.js").RoomEnvironment;
      try {
        [THREE, { RoomEnvironment }] = await Promise.all([
          import("three"),
          import("three/examples/jsm/environments/RoomEnvironment.js"),
        ]);
      } catch {
        return; // The CSS orb is already on screen.
      }
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0, 0, 7.2);

      // Soft studio reflections — the same environment the gift card uses, so the metal reads as
      // milled and jewel-like rather than a flat gold polygon.
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;

      const group = new THREE.Group();
      group.rotation.z = 0.18;
      scene.add(group);

      const accent = new THREE.Color(ORB_ACCENT[stateRef.current]);

      // The jewel: a small cut gem in the accent metal, with a clearcoat sheen so highlights read.
      const coreMat = new THREE.MeshPhysicalMaterial({
        color: accent,
        metalness: 1,
        roughness: 0.16,
        clearcoat: 1,
        clearcoatRoughness: 0.22,
        envMapIntensity: 1.5,
        emissive: accent.clone().multiplyScalar(0.08),
      });
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.92, 0), coreMat);
      group.add(core);

      // A faint inner glow shell, so the gem sits in a soft halo rather than on hard vacuum.
      const glowMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.10 });
      const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(1.28, 2), glowMat);
      group.add(glow);

      // A crisp key light picks out the facet edges; a coloured rim keeps it from going grey.
      const key = new THREE.DirectionalLight(0xffffff, 2.6);
      key.position.set(3, 4.5, 4);
      scene.add(key);
      const rim = new THREE.PointLight(accent.getHex(), 12, 30);
      rim.position.set(-4, -2.5, 2.5);
      scene.add(rim);

      const resize = () => {
        const r = host.getBoundingClientRect();
        const size = Math.max(1, Math.min(r.width, r.height));
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(size, size, false);
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);
      teardown.push(() => ro.disconnect());

      setLive(true);
      onLive?.(true);

      const start = performance.now();
      let lastState = stateRef.current;
      const tick = (now: number) => {
        if (disposed) return;
        const t = (now - start) / 1000;

        if (stateRef.current !== lastState) {
          lastState = stateRef.current;
          const c = new THREE.Color(ORB_ACCENT[lastState]);
          coreMat.color.copy(c);
          coreMat.emissive.copy(c).multiplyScalar(0.08);
          glowMat.color.copy(c);
          rim.color.copy(c);
        }
        const fast = lastState === "thinking";
        group.rotation.y = t * (fast ? 0.5 : 0.17);
        group.rotation.x = Math.sin(t * 0.4) * 0.22;
        const breathe = 1 + Math.sin(t * (fast ? 2.6 : 1.25)) * (fast ? 0.045 : 0.028);
        core.scale.setScalar(breathe);
        glow.scale.setScalar(breathe * (fast ? 1.14 : 1.06));
        glowMat.opacity = fast ? 0.16 : 0.1;

        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      teardown.push(() => {
        cancelAnimationFrame(raf);
        core.geometry.dispose();
        glow.geometry.dispose();
        coreMat.dispose();
        glowMat.dispose();
        envTex.dispose();
        pmrem.dispose();
        renderer.dispose();
      });
    })();

    return () => {
      disposed = true;
      setLive(false);
      onLive?.(false);
      for (const fn of teardown) fn();
    };
    // Rebuild only on mount; state changes are handled inside the loop via stateRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className={styles.canvas} data-live={live || undefined} aria-hidden />;
}
