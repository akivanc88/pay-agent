/** Presents the wallet thesis, verified totals, and featured closed-loop card. */

import { Badge, Money, Panel, SectionLabel } from "@/components/ui";
import type { FundingCard } from "@/lib/store";

import { FeaturedCardStage } from "./featured-card";
import commonStyles from "./wallet-common.module.css";
import styles from "./wallet-hero.module.css";

export interface VerifiedBalanceSummary {
  total: number;
  complete: boolean;
}

interface WalletHeroProps {
  featured: FundingCard | undefined;
  giftCardCount: number;
  prepaidCardCount: number;
  spendableGiftCardCount: number;
  verified: VerifiedBalanceSummary;
}

export function WalletHero({
  featured,
  giftCardCount,
  prepaidCardCount,
  spendableGiftCardCount,
  verified,
}: WalletHeroProps) {
  return (
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
            <p className={styles.totalValue}>
              {verified.complete ? (
                <Money minor={verified.total} />
              ) : (
                <span className={commonStyles.unknown}>Incomplete</span>
              )}
              <Badge tone="brand" soft>
                ledger-backed
              </Badge>
            </p>
            <p className={styles.totalNote}>
              {verified.complete
                ? `Across ${giftCardCount} gift ${giftCardCount === 1 ? "card" : "cards"}, ${spendableGiftCardCount} still carrying a balance.`
                : "One or more balances could not be read, so this total is incomplete."}
            </p>
          </div>

          {prepaidCardCount > 0 && (
            <div className={styles.totalUnverified}>
              <p className={styles.totalLabel}>On file</p>
              <p className={`${styles.totalValue} ${styles.totalValueMuted}`}>
                {prepaidCardCount} {prepaidCardCount === 1 ? "card" : "cards"}
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
              Issue one with{" "}
              <code className={styles.code}>pnpm --filter @pay-agent/store issue-card</code>{" "}
              and it appears here.
            </p>
          </Panel>
        )}
      </div>
    </section>
  );
}
