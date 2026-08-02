import type { Metadata } from "next";

import { StoreDown } from "@/components/store-down";
import { Badge, Container, Money, Panel, SectionLabel } from "@/components/ui";
import { getFundingCards, storeIsUp, type FundingCard } from "@/lib/store";
import { minorFromDisplay } from "@/lib/money";

import { FeaturedCardStage } from "./featured-card";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Wallet — pay-agent",
  description: "The funding the agent can draw on, and what is actually known about each.",
};

export const dynamic = "force-dynamic";

/**
 * The wallet.
 *
 * The organising idea is the difference between the two card families, because that
 * difference *is* the project. A closed-loop gift card is issued by this merchant, so its
 * balance is a fact read out of an append-only ledger. An open-loop prepaid card is issued
 * by a bank, and no API on earth will tell us what is left on it — the number is whatever
 * the cardholder typed. The wallet never lets those two look alike.
 */

/** Verified and unverified money are never added together — that would launder one into
 *  the other. They are summed separately and shown as two different kinds of number. */
function sumVerified(cards: FundingCard[]): { total: number; complete: boolean } {
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
  const gift = cards.filter((c) => c.family === "closed_loop");
  const prepaid = cards.filter((c) => c.family === "open_loop");

  const verified = sumVerified(gift);
  const spendable = gift.filter((c) => (minorFromDisplay(c.balance_display) ?? 0) > 0);

  // The card worth rendering as an object is the one with the most left on it. A card with
  // nothing on it is a poor hero, and a card whose balance we can't read is a worse one.
  const featured = [...spendable].sort(
    (a, b) =>
      (minorFromDisplay(b.balance_display) ?? 0) - (minorFromDisplay(a.balance_display) ?? 0),
  )[0];

  return (
    <Container>
      <section className={`${styles.hero} rise`}>
        <div className={styles.heroCopy}>
          <SectionLabel>Wallet</SectionLabel>
          <h1 className={styles.title}>What the agent can spend.</h1>
          <p className={styles.lead}>
            Gift cards are drawn first and settle against a ledger this store owns, so their
            balances are facts. Cards on file are not — they are shown exactly as far as they
            can be trusted, and no further.
          </p>

          <div className={styles.totals}>
            <div className={styles.total}>
              <p className={styles.totalLabel}>
                Verified balance
                <Badge tone="brand" soft>
                  ledger-backed
                </Badge>
              </p>
              <p className={styles.totalValue}>
                <Money minor={verified.total} />
              </p>
              <p className={styles.totalNote}>
                {verified.complete
                  ? `Across ${gift.length} gift ${gift.length === 1 ? "card" : "cards"}, ${spendable.length} with a balance.`
                  : "One or more balances could not be read, so this total is incomplete."}
              </p>
            </div>

            {prepaid.length > 0 && (
              <div className={styles.total}>
                <p className={styles.totalLabel}>
                  On file
                  <Badge tone="warn" soft>
                    unverified
                  </Badge>
                </p>
                <p className={`${styles.totalValue} ${styles.totalValueMuted}`}>
                  {prepaid.length} {prepaid.length === 1 ? "card" : "cards"}
                </p>
                <p className={styles.totalNote}>
                  Balances on these are self-reported and cannot be confirmed, so they are
                  not added to the total above.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className={styles.heroCard}>
          {featured ? (
            <FeaturedCardStage
              card={{
                label: "Gift card",
                brand: "pay·agent",
                last4: featured.last4,
                balanceDisplay: featured.balance_display,
              }}
            />
          ) : (
            <Panel tone="sunk" className={styles.noCard}>
              <p className={styles.noCardTitle}>No gift card with a balance</p>
              <p className={styles.noCardBody}>
                Issue one with <code className={styles.code}>pnpm --filter @pay-agent/store issue-card</code>{" "}
                and it appears here.
              </p>
            </Panel>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Gift cards</h2>
          <p className={styles.sectionNote}>Issued by this store. Balance read from the ledger.</p>
        </div>

        {gift.length === 0 ? (
          <Panel tone="sunk" className={styles.empty}>
            <p className={styles.emptyTitle}>No gift cards enrolled</p>
            <p className={styles.emptyBody}>
              A gift card is what makes a split payment possible: it is drawn first, and only
              what it cannot cover reaches the card rail.
            </p>
          </Panel>
        ) : (
          <ul className={styles.cardList}>
            {gift.map((card) => {
              const minor = minorFromDisplay(card.balance_display);
              const empty = minor === 0;
              return (
                <li key={card.id}>
                  <Panel className={styles.row} data-empty={empty || undefined}>
                    <div className={styles.rowMain}>
                      <p className={styles.rowTitle}>
                        Gift card
                        <span className={styles.last4}>····&thinsp;{card.last4}</span>
                      </p>
                      <p className={styles.rowNote}>
                        {empty
                          ? "Spent. It can still be presented — it simply contributes nothing."
                          : "Drawn before any card, up to whatever it holds."}
                      </p>
                    </div>
                    <div className={styles.rowAmount}>
                      {minor === null ? (
                        <span className={styles.unknown}>Unknown</span>
                      ) : (
                        <Money minor={minor} className={styles.amount} />
                      )}
                      {card.balance_stale ? (
                        <Badge tone="warn">stale</Badge>
                      ) : card.balance_verified ? (
                        <Badge tone="brand" soft>
                          verified
                        </Badge>
                      ) : (
                        <Badge tone="warn">unverified</Badge>
                      )}
                    </div>
                  </Panel>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {prepaid.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Cards on file</h2>
            <p className={styles.sectionNote}>
              Enrolled through Stripe. We hold a token, never a card number.
            </p>
          </div>

          <ul className={styles.cardList}>
            {prepaid.map((card) => (
              <li key={card.id}>
                <Panel className={styles.row}>
                  <div className={styles.rowMain}>
                    <p className={styles.rowTitle}>
                      <span className={styles.brand}>{card.brand ?? "Card"}</span>
                      <span className={styles.last4}>····&thinsp;{card.last4}</span>
                    </p>
                    <p className={styles.rowNote}>
                      {card.exp ? `Expires ${card.exp}. ` : ""}
                      Balance as entered at enrolment — no issuer API can confirm it.
                    </p>
                  </div>
                  <div className={styles.rowAmount}>
                    <span className={`${styles.amount} ${styles.amountUnverified} tnum`}>
                      {card.balance_display}
                    </span>
                    <Badge tone="warn">unverified</Badge>
                  </div>
                </Panel>
              </li>
            ))}
          </ul>

          <p className={styles.footnote}>
            An open-loop prepaid card exposes no balance endpoint to a merchant. Treating the
            number above as fact is exactly the mistake this project exists to avoid, so it is
            marked everywhere it appears and never counted toward a total.
          </p>
        </section>
      )}
    </Container>
  );
}
