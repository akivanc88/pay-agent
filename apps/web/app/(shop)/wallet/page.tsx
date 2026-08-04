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
/**
 * A badge only where there is something to flag.
 *
 * Stamping VERIFIED on every ledger-backed row makes the word wallpaper, and wallpaper is
 * exactly what the one amber UNVERIFIED badge needs to stand out against. The section
 * header already states the claim for the whole list, so here silence means verified and a
 * badge means "this one is different."
 */
function CardFlag({ card }: { card: FundingCard }) {
  if (card.balance_stale) return <Badge tone="warn">stale</Badge>;
  if (!card.balance_verified) return <Badge tone="warn">unverified</Badge>;
  return null;
}

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

  /*
   * Spent cards are separated out rather than left interleaved. A ledger listed in issue
   * order puts four $0.00 rows among the funded ones, each repeating the same sentence, and
   * the reader has to subtract noise to see what `$80.00` is made of. Funded first, spent
   * folded into one summary row that states the explanation once.
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
                <Money minor={verified.total} />
                <Badge tone="brand" soft>
                  ledger-backed
                </Badge>
              </p>
              <p className={styles.totalNote}>
                {verified.complete
                  ? `Across ${gift.length} gift ${gift.length === 1 ? "card" : "cards"}, ${spendable.length} with a balance.`
                  : "One or more balances could not be read, so this total is incomplete."}
              </p>
            </div>

            {prepaid.length > 0 && (
              <div className={styles.total}>
                <p className={styles.totalLabel}>On file</p>
                <p className={`${styles.totalValue} ${styles.totalValueMuted}`}>
                  {prepaid.length} {prepaid.length === 1 ? "card" : "cards"}
                  <Badge tone="warn" soft>
                    unverified
                  </Badge>
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
          <Panel className={styles.list}>
            <ul className={styles.cardList}>
              {funded.map((card) => {
                const minor = minorFromDisplay(card.balance_display);
                return (
                  <li key={card.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <p className={styles.rowTitle}>
                        Gift card
                        <span className={styles.last4}>····&thinsp;{card.last4}</span>
                      </p>
                      <p className={styles.rowNote}>
                        Drawn before any card, up to whatever it holds.
                      </p>
                    </div>
                    <div className={styles.rowAmount}>
                      {minor === null ? (
                        <span className={styles.unknown}>Unknown</span>
                      ) : (
                        <Money minor={minor} className={styles.amount} />
                      )}
                      <span className={styles.badgeSlot}>
                        <CardFlag card={card} />
                      </span>
                    </div>
                  </li>
                );
              })}

              {/* The spent cards, folded. Open by nobody's default — they are still here and
                  still countable, they just no longer cost eight rows to say so. */}
              {spent.length > 0 && (
                <li className={styles.row}>
                  <details className={styles.spent}>
                    <summary className={styles.spentSummary}>
                      <span className={styles.spentTitle}>
                        {spent.length} spent {spent.length === 1 ? "card" : "cards"}
                      </span>
                      <span className={styles.spentNote}>
                        Still valid to present — they simply contribute nothing.
                      </span>
                      <span className={styles.rowAmount}>
                        <Money minor={0} className={`${styles.amount} ${styles.amountSpent}`} />
                        <span className={styles.badgeSlot} />
                      </span>
                    </summary>
                    <ul className={styles.spentList}>
                      {spent.map((card) => (
                        <li key={card.id} className={styles.spentRow}>
                          <span className={styles.last4}>····&thinsp;{card.last4}</span>
                          <Money minor={0} className={styles.spentAmount} />
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              )}
            </ul>
          </Panel>
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

          <Panel className={styles.list}>
            <ul className={styles.cardList}>
              {prepaid.map((card) => {
                /* Through `<Money>` like every other amount on the site. Printing the store's
                   display string raw would put the one number this page calls untrustworthy
                   outside the single formatting guarantee the app has — and leave it unable
                   to say "Unknown" if the string ever stops parsing. */
                const minor = minorFromDisplay(card.balance_display);
                return (
                  <li key={card.id} className={styles.row}>
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
                      {minor === null ? (
                        <span className={styles.unknown}>Unknown</span>
                      ) : (
                        <Money
                          minor={minor}
                          className={`${styles.amount} ${styles.amountUnverified}`}
                        />
                      )}
                      <span className={styles.badgeSlot}>
                        <Badge tone="warn">unverified</Badge>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

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
