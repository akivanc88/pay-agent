/**
 * Merchant-quoted delivery option selection for checkout.
 *
 * Boundary: renders the currently quoted options and reports a selected identifier; quote
 * retrieval and session mutation remain in the route controller.
 */

import { Money } from "@/components/ui";

import { Step } from "./checkout-pieces";
import { optionAmount, type ShippingOption } from "./session";
import styles from "./checkout-choice.module.css";

export function DeliverySection({
  destinationSelected,
  options,
  selectedId,
  busy,
  onChoose,
}: {
  destinationSelected: boolean;
  options: ShippingOption[];
  selectedId: string | null;
  busy: boolean;
  onChoose: (optionId: string) => void;
}) {
  return (
    <Step index={2} title="Delivery" done={Boolean(selectedId)} muted={!destinationSelected}>
      {!destinationSelected ? (
        <p className={styles.stepHint}>
          Delivery is quoted per destination, so options appear once an address is chosen.
        </p>
      ) : options.length === 0 ? (
        <p className={styles.stepHint}>No delivery options came back for this address.</p>
      ) : (
        <fieldset className={styles.fieldset} disabled={busy}>
          <legend className={styles.srOnly}>Delivery speed</legend>
          {options.map((option) => {
            const selected = option.id === selectedId;
            return (
              <label
                key={option.id}
                className={styles.choice}
                data-selected={selected || undefined}
              >
                <input
                  type="radio"
                  name="shipping"
                  value={option.id}
                  checked={selected}
                  onChange={() => onChoose(option.id)}
                  className={styles.radio}
                />
                <span className={styles.choiceBody}>
                  <span className={styles.choiceTitle}>{option.title}</span>
                  {option.description && (
                    <span className={styles.choiceNote}>{option.description}</span>
                  )}
                </span>
                <Money minor={optionAmount(option)} className={styles.choiceAmount} />
              </label>
            );
          })}
        </fieldset>
      )}
    </Step>
  );
}
