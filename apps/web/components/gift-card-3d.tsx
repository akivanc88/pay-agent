/** Preserves the public GiftCard3D facade and lazy static fallback behavior. */

"use client";

import type { FeaturedCard } from "./wallet-static-card";
import { GiftCard3DScene } from "./gift-card-3d-scene";

/** Stable public facade for the progressively enhanced gift-card presentation. */
export function GiftCard3D({ card, className = "" }: { card: FeaturedCard; className?: string }) {
  return <GiftCard3DScene card={card} className={className} />;
}
