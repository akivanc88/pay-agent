/**
 * The console's hero band — a calm, state-reactive "agent core".
 *
 * This is the one place on the Agent Console that is allowed a little spectacle, in the same spirit as
 * the wallet's 3D gift card: everywhere else the surface stays quiet and legible. It reads the run's
 * state (idle → thinking → settled / paused / failed) and shifts its colour and motion to match —
 * brand-green at rest, a soft pulse while the brain reasons, a green bloom on payment, amber when it
 * pauses for approval. All motion is CSS and honours `prefers-reduced-motion`; nothing here carries
 * information that the transcript below does not also state in words.
 */
"use client";

import { useState } from "react";

import { AgentOrb3D } from "./agent-orb-3d";
import styles from "./agent-marquee.module.css";

export type AgentState = "idle" | "thinking" | "settled" | "paused" | "failed";

interface Meta {
  model: string;
  live: boolean;
  reason: string;
  mode: string;
}

const CAPTION: Record<AgentState, string> = {
  idle: "Ready when you are.",
  thinking: "Reading your instruction and drafting a mandate…",
  settled: "Paid — drawn gift-first, then the card.",
  paused: "Paused for your approval. Nothing was drawn.",
  failed: "That didn’t go through — any draw was reversed.",
};

export function AgentMarquee({ state, meta }: { state: AgentState; meta: Meta | null }) {
  /** True once the WebGL core is rendering — the CSS orb below it then dims to a faint scaffold. */
  const [orbLive, setOrbLive] = useState(false);
  return (
    <div className={styles.marquee} data-state={state}>
      <div className={styles.aurora} aria-hidden />
      <div className={styles.grid} aria-hidden />

      <div className={styles.core} data-orb-live={orbLive || undefined} aria-hidden>
        <span className={styles.ring} data-r="3" />
        <span className={styles.ring} data-r="2" />
        <span className={styles.ring} data-r="1" />
        <span className={styles.node} />
        <span className={styles.spark} data-s="a" />
        <span className={styles.spark} data-s="b" />
        <span className={styles.spark} data-s="c" />
        <AgentOrb3D state={state} onLive={setOrbLive} />
      </div>

      <div className={styles.caption}>
        <p className={styles.eyebrow}>The agent’s brain</p>
        <p className={styles.title}>Instruct&nbsp;to&nbsp;pay</p>
        <p className={styles.status} aria-live="polite">{CAPTION[state]}</p>
      </div>

      <div className={styles.badgeRail}>
        {meta ? (
          <span className={styles.brainBadge} data-live={meta.live || undefined}>
            <span className={styles.brainDot} />
            {meta.live ? meta.model : "scripted stand-in"}
          </span>
        ) : (
          <span className={styles.brainBadge}>
            <span className={styles.brainDot} />
            language-model driver
          </span>
        )}
      </div>
    </div>
  );
}
