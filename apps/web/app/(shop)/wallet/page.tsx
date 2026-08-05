/** Loads enrolled funding sources and composes the wallet's verified balance views. */

import type { Metadata } from "next";

import { StoreDown } from "@/components/store-down";
import { Container } from "@/components/ui";
import { minorFromDisplay } from "@/lib/money";
import { getFundingCards, storeIsUp, type FundingCard } from "@/lib/store";

import { WalletHero, type VerifiedBalanceSummary } from "./wallet-hero";
import { GiftCardLedger, PrepaidCardLedger } from "./wallet-ledgers";

export const metadata: Metadata = {
  title: "Wallet — pay-agent",
  description: "The funding the agent can draw on, and what is actually known about each.",
};

export const dynamic = "force-dynamic";

/** Sum only ledger-backed balances, reporting unreadable values instead of inventing them. */
function sumVerified(cards: FundingCard[]): VerifiedBalanceSummary {
  let total = 0;
  let complete = true;
  for (const card of cards) {
    const minor = minorFromDisplay(card.balance_display);
    if (minor === null) complete = false;
    else total += minor;
  }
  return { total, complete };
}

export default async function WalletPage() {
  if (!(await storeIsUp())) {
    return (
      <Container>
        <StoreDown />
      </Container>
    );
  }

  const cards = await getFundingCards();
  const gift = cards.filter((card) => card.family === "closed_loop");
  const prepaid = cards.filter((card) => card.family === "open_loop");
  const verified = sumVerified(gift);
  const spendable = gift.filter((card) => (minorFromDisplay(card.balance_display) ?? 0) > 0);
  const funded = gift.filter((card) => (minorFromDisplay(card.balance_display) ?? -1) !== 0);
  const spent = gift.filter((card) => minorFromDisplay(card.balance_display) === 0);
  const featured = [...spendable].sort(
    (a, b) =>
      (minorFromDisplay(b.balance_display) ?? 0) -
      (minorFromDisplay(a.balance_display) ?? 0),
  )[0];

  return (
    <Container>
      <WalletHero
        featured={featured}
        giftCardCount={gift.length}
        prepaidCardCount={prepaid.length}
        spendableGiftCardCount={spendable.length}
        verified={verified}
      />
      <GiftCardLedger cards={gift} funded={funded} spent={spent} verified={verified} />
      <PrepaidCardLedger cards={prepaid} />
    </Container>
  );
}
