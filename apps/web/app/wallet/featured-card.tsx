"use client";

import dynamic from "next/dynamic";

import { WalletStaticCard, type FeaturedCard } from "@/components/wallet-static-card";

/**
 * The featured card, loaded off the critical path.
 *
 * `ssr: false` and a `loading` fallback of the still card mean the WebGL runtime is never
 * in the first-paint bundle and never blocks the balances — the wallet renders complete,
 * and the card upgrades itself in place if and when the chunk arrives. If it never does,
 * or the visitor asked for less motion, the still card is simply what the wallet has, and
 * it is designed to be worth having.
 */
const GiftCard3D = dynamic(
  () => import("@/components/gift-card-3d").then((m) => m.GiftCard3D),
  {
    ssr: false,
    loading: () => <WalletStaticCard card={PLACEHOLDER} ariaHidden />,
  },
);

/* Only ever on screen for the moment the chunk is in flight, and only ever behind the real
   card — but it still must not state a balance, because inventing one is the single thing
   this project refuses to do. An em dash is honest; "$0.00" would not be. */
const PLACEHOLDER: FeaturedCard = {
  label: "Gift card",
  brand: "pay·agent",
  last4: "····",
  balanceDisplay: "—",
};

export function FeaturedCardStage({ card }: { card: FeaturedCard }) {
  return <GiftCard3D card={card} />;
}
