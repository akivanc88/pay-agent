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

/**
 * A badge only where there is something to flag.
 *
 * Stamping VERIFIED on every ledger-backed row makes the word wallpaper. The gift section's
 * header already states, once, that every balance in it is read from the ledger — so in that
 * list silence *means* verified, and a badge is reserved for the rare row that is different
 * (a stale read). In the prepaid list every row is flagged, because every row is unverifiable.
 */
function CardFlag({ card }: { card: FundingCard }) {
  if (card.balance_stale) return <Badge tone="warn">stale</Badge>;
  if (!card.balance_verified) return <Badge tone="warn">unverified</Badge>;
  return null;
}

/** Verified and unverified money are never added together — that would launder one into the
 *  other. Only the ledger-backed family is summed; the parse guards against a balance the
 *  store can no longer format, which must be reported as unknown rather than invented. */
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

/** The masked card number, the identifier every statement line is keyed on. Only the last
 *  four are ever known to this app; the rest is a mask, not a redaction of data we hold. */
function MaskedNumber({ last4 }: { last4: string }) {
  return (
    <>
      <span className={styles.dots}>••••</span>
      <span className={styles.last4}>{last4}</span>
    </>
  );
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

  /*
   * Spent cards are separated out rather than left interleaved. A ledger listed in issue
   * order puts twenty-odd $0.00 rows among the funded ones, and the reader has to subtract
   * noise to see what the total is made of. Funded first, spent folded into one summary row.
   */
  const funded = gift.filter((c) => (minorFromDisplay(c.balance_display) ?? -1) !== 0);
  const spent = gift.filter((c) => minorFromDisplay(c.balance_display) === 0);

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
              <p className={styles.totalLabel}>Verified balance</p>
              {/* The badge qualifies the number, not the label — so it sits with the number.
                  Beside a tracked uppercase label it also had nowhere to go at this column
                  width and wrapped onto its own line. */}
              <p className={styles.totalValue}>
                {verified.complete ? (
                  <Money minor={verified.total} />
                ) : (
                  <span className={styles.unknown}>Incomplete</span>
                )}
                <Badge tone="brand" soft>
                  ledger-backed
                </Badge>
              </p>
              <p className={styles.totalNote}>
                {verified.complete
                  ? `Across ${gift.length} gift ${gift.length === 1 ? "card" : "cards"}, ${spendable.length} still carrying a balance.`
                  : "One or more balances could not be read, so this total is incomplete."}
              </p>
            </div>

            {prepaid.length > 0 && (
              <div className={styles.totalUnverified}>
                <p className={styles.totalLabel}>On file</p>
                <p className={`${styles.totalValue} ${styles.totalValueMuted}`}>
                  {prepaid.length} {prepaid.length === 1 ? "card" : "cards"}
                  <Badge tone="warn" soft>
                    unverified
                  </Badge>
                </p>
                <p className={styles.totalNote}>
                  Balances here are self-reported and cannot be confirmed, so they are never
                  added to the total on the left.
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
          {/* The sentence the rows used to repeat, once. It states for the whole list what a
              gift card is, that it is drawn first, up to its balance, and that the figures
              are read from the ledger — which is why not one row below needs to say it. */}
          <p className={styles.sectionNote}>
            Issued by this store and drawn before the card rail, each up to the balance shown.
            Every figure is read from the ledger.
          </p>
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
          <Panel className={styles.list}>
            <div className={styles.ledgerHead} aria-hidden="true">
              <span className={styles.headCol}>Card</span>
              <span className={styles.headColRight}>Balance</span>
            </div>

            <ul className={styles.ledger}>
              {funded.map((card) => {
                const minor = minorFromDisplay(card.balance_display);
                return (
                  <li key={card.id} className={styles.row}>
                    <span className={styles.rowId}>
                      <MaskedNumber last4={card.last4} />
                    </span>
                    <span className={styles.rowAmount}>
                      <CardFlag card={card} />
                      {minor === null ? (
                        <span className={styles.unknown}>Unknown</span>
                      ) : (
                        <Money minor={minor} className={styles.amount} />
                      )}
                    </span>
                  </li>
                );
              })}

              {/* The spent cards, folded. Still here, still countable — they just no longer
                  cost twenty-five rows to say they contribute nothing. */}
              {spent.length > 0 && (
                <li className={styles.spentRowWrap}>
                  <details className={styles.spent}>
                    <summary className={styles.spentSummary}>
                      <span className={styles.spentTitle}>
                        {spent.length} spent {spent.length === 1 ? "card" : "cards"}
                        <span className={styles.spentHint}>still valid to present</span>
                      </span>
                      <span className={styles.spentZero}>
                        <Money minor={0} />
                      </span>
                    </summary>
                    <ul className={styles.spentList}>
                      {spent.map((card) => (
                        <li key={card.id} className={styles.spentRow}>
                          <span className={styles.spentRowId}>
                            <MaskedNumber last4={card.last4} />
                          </span>
                          <Money minor={0} className={styles.spentAmount} />
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              )}
            </ul>

            {verified.complete && (
              <div className={styles.subtotal}>
                <span className={styles.subtotalLabel}>Verified balance</span>
                <span className={styles.rowAmount}>
                  <Money minor={verified.total} className={styles.subtotalValue} />
                </span>
              </div>
            )}
          </Panel>
        )}
      </section>

      {prepaid.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Cards on file</h2>
            <p className={styles.sectionNote}>
              Enrolled through Stripe. We hold a token, never a card number — and no issuer
              API can confirm what is left on one.
            </p>
          </div>

          <Panel className={styles.list}>
            <div className={styles.ledgerHead} aria-hidden="true">
              <span className={styles.headCol}>Card</span>
              <span className={styles.headColRight}>Reported balance</span>
            </div>

            <ul className={styles.ledger}>
              {prepaid.map((card) => {
                /* Through `<Money>` like every other amount on the site. Printing the store's
                   display string raw would put the one number this page calls untrustworthy
                   outside the single formatting guarantee the app has. */
                const minor = minorFromDisplay(card.balance_display);
                return (
                  <li key={card.id} className={`${styles.row} ${styles.rowStack}`}>
                    <span className={styles.rowId}>
                      <span className={styles.brand}>{card.brand ?? "Card"}</span>
                      <MaskedNumber last4={card.last4} />
                      {card.exp && <span className={styles.exp}>exp {card.exp}</span>}
                    </span>
                    <span className={styles.rowAmount}>
                      <Badge tone="warn">unverified</Badge>
                      {minor === null ? (
                        <span className={styles.unknown}>Unknown</span>
                      ) : (
                        <Money
                          minor={minor}
                          className={`${styles.amount} ${styles.amountUnverified}`}
                        />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <p className={styles.footnote}>
            An open-loop prepaid card exposes no balance endpoint to a merchant. Treating the
            number above as fact is exactly the mistake this project exists to avoid, so it is
            marked everywhere it appears and never counted toward a verified total.
          </p>
        </section>
      )}
    </Container>
  );
}
