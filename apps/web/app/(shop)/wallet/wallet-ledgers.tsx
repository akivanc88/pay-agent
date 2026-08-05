/** Presents closed-loop and open-loop funding as deliberately distinct ledgers. */

import { Badge, Money, Panel } from "@/components/ui";
import { minorFromDisplay } from "@/lib/money";
import type { FundingCard } from "@/lib/store";

import type { VerifiedBalanceSummary } from "./wallet-hero";
import commonStyles from "./wallet-common.module.css";
import styles from "./wallet-ledgers.module.css";

function CardFlag({ card }: { card: FundingCard }) {
  if (card.balance_stale) return <Badge tone="warn">stale</Badge>;
  if (!card.balance_verified) return <Badge tone="warn">unverified</Badge>;
  return null;
}

function MaskedNumber({ last4 }: { last4: string }) {
  return (
    <>
      <span className={styles.dots}>••••</span>
      <span className={styles.last4}>{last4}</span>
    </>
  );
}

interface GiftCardLedgerProps {
  cards: FundingCard[];
  funded: FundingCard[];
  spent: FundingCard[];
  verified: VerifiedBalanceSummary;
}

export function GiftCardLedger({ cards, funded, spent, verified }: GiftCardLedgerProps) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Gift cards</h2>
        <p className={styles.sectionNote}>
          Issued by this store and drawn before the card rail, each up to the balance shown.
          Every figure is read from the ledger.
        </p>
      </div>

      {cards.length === 0 ? (
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
                      <span className={commonStyles.unknown}>Unknown</span>
                    ) : (
                      <Money minor={minor} className={styles.amount} />
                    )}
                  </span>
                </li>
              );
            })}

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
  );
}

export function PrepaidCardLedger({ cards }: { cards: FundingCard[] }) {
  if (cards.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Cards on file</h2>
        <p className={styles.sectionNote}>
          Enrolled through Stripe. We hold a token, never a card number — and no issuer API
          can confirm what is left on one.
        </p>
      </div>

      <Panel className={styles.list}>
        <div className={styles.ledgerHead} aria-hidden="true">
          <span className={styles.headCol}>Card</span>
          <span className={styles.headColRight}>Reported balance</span>
        </div>

        <ul className={styles.ledger}>
          {cards.map((card) => {
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
                    <span className={commonStyles.unknown}>Unknown</span>
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
  );
}
