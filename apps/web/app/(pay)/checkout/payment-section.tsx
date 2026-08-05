/**
 * Gift-card and Stripe-test funding controls for checkout.
 *
 * Boundary: this section captures funding intent and explains known wallet state. Planning,
 * approval, instrument construction, and payment mutation remain in the route controller.
 */

import { Badge } from "@/components/ui";

import { CheckMark, Step } from "./checkout-pieces";
import {
  TEST_CARDS,
  type FundingCard,
  type GiftCardMatch,
} from "./session";
import choiceStyles from "./checkout-choice.module.css";
import styles from "./payment-section.module.css";

export function PaymentSection({
  busy,
  giftCode,
  giftPin,
  cardToken,
  giftBalance,
  matchedGift,
  match,
  hasGift,
  hasCard,
  onGiftCodeChange,
  onGiftPinChange,
  onCardTokenChange,
}: {
  busy: boolean;
  giftCode: string;
  giftPin: string;
  cardToken: string;
  giftBalance: number | null;
  matchedGift: FundingCard | null;
  match: GiftCardMatch;
  hasGift: boolean;
  hasCard: boolean;
  onGiftCodeChange: (value: string) => void;
  onGiftPinChange: (value: string) => void;
  onCardTokenChange: (value: string) => void;
}) {
  return (
    <Step index={3} title="Payment" done={hasGift || hasCard} last>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor="gift-code" className={styles.label}>
            Gift card code <span className={styles.optional}>optional</span>
          </label>
          <input
            id="gift-code"
            className={styles.input}
            value={giftCode}
            onChange={(event) => onGiftCodeChange(event.target.value)}
            placeholder="GC-DEMO-7777"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className={`${styles.field} ${styles.fieldPin}`}>
          <label htmlFor="gift-pin" className={styles.label}>PIN</label>
          <input
            id="gift-pin"
            className={styles.input}
            value={giftPin}
            onChange={(event) => onGiftPinChange(event.target.value)}
            placeholder="1234"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
      </div>

      <p className={styles.giftStatus} aria-live="polite">
        {!giftCode.trim() ? (
          <span className={choiceStyles.stepHint}>
            No gift card — the card covers the whole amount.
          </span>
        ) : giftBalance !== null && matchedGift ? (
          <span className={styles.giftFound}>
            <CheckMark />
            Matches the enrolled card ending {matchedGift.last4}, holding{" "}
            <strong>{matchedGift.balance_display}</strong> right now.
          </span>
        ) : match.kind === "ambiguous" ? (
          <span className={styles.giftAmbiguous}>
            {match.count} enrolled cards end {match.last4}. This page can&rsquo;t tell them
            apart, so it won&rsquo;t project a draw — the store resolves the code when you pay.
          </span>
        ) : match.kind === "matched" ? (
          <span className={styles.giftAmbiguous}>
            Matches the card ending {matchedGift?.last4}, but the ledger doesn&rsquo;t currently
            vouch for its balance, so the draw is settled at payment.
          </span>
        ) : (
          <span className={choiceStyles.stepHint}>
            Nothing enrolled in this wallet ends in these digits. The store still checks the
            code and PIN when you pay.
          </span>
        )}
      </p>

      <div className={styles.cardRail}>
        <p className={styles.railHead}>
          Card
          <Badge tone="warn" soft>Stripe test mode</Badge>
        </p>
        <fieldset className={choiceStyles.fieldset} disabled={busy}>
          <legend className={choiceStyles.srOnly}>Card</legend>
          {TEST_CARDS.map((card) => (
            <label
              key={card.token}
              className={`${choiceStyles.choice} ${choiceStyles.choiceTight}`}
              data-selected={cardToken === card.token || undefined}
            >
              <input
                type="radio"
                name="card"
                value={card.token}
                checked={cardToken === card.token}
                onChange={() => onCardTokenChange(card.token)}
                className={choiceStyles.radio}
              />
              <span className={choiceStyles.choiceBody}>
                <span className={choiceStyles.choiceTitle}>
                  {card.brand}{" "}
                  <span className={choiceStyles.last4}>····&thinsp;{card.last4}</span>
                </span>
              </span>
              <span
                className={choiceStyles.choiceMeta}
                data-declines={card.declines || undefined}
              >
                {card.outcome}
                {card.code && <code className={choiceStyles.outcomeCode}>{card.code}</code>}
              </span>
            </label>
          ))}
          <label
            className={`${choiceStyles.choice} ${choiceStyles.choiceTight}`}
            data-selected={cardToken === "" || undefined}
          >
            <input
              type="radio"
              name="card"
              value=""
              checked={cardToken === ""}
              onChange={() => onCardTokenChange("")}
              className={choiceStyles.radio}
            />
            <span className={choiceStyles.choiceBody}>
              <span className={choiceStyles.choiceTitle}>No card</span>
            </span>
            <span className={choiceStyles.choiceMeta}>Gift card only</span>
          </label>
        </fieldset>
        <p className={styles.railNote}>
          Stripe&rsquo;s published test PaymentMethods. The authorization and capture are real
          API calls in test mode against Stripe&rsquo;s simulated issuer — no card number ever
          reaches this app.
        </p>
      </div>
    </Step>
  );
}
