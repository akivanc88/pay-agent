/**
 * Saved-destination selection for checkout.
 *
 * Boundary: renders typed merchant destinations and reports buyer intent; it never mutates
 * the checkout session itself.
 */

import { Step } from "./checkout-pieces";
import type { Destination } from "./session";
import styles from "./checkout-choice.module.css";

export function DestinationSection({
  destinations,
  selectedId,
  busy,
  onChoose,
}: {
  destinations: Destination[];
  selectedId: string | null;
  busy: boolean;
  onChoose: (destination: Destination) => void;
}) {
  return (
    <Step index={1} title="Deliver to" done={Boolean(selectedId)}>
      <fieldset className={styles.fieldset} disabled={busy}>
        <legend className={styles.srOnly}>Delivery address</legend>
        {destinations.map((destination) => {
          const selected = destination.id === selectedId;
          return (
            <label
              key={destination.id}
              className={styles.choice}
              data-selected={selected || undefined}
            >
              <input
                type="radio"
                name="destination"
                value={destination.id}
                checked={selected}
                onChange={() => onChoose(destination)}
                className={styles.radio}
              />
              <span className={styles.choiceBody}>
                <span className={styles.choiceTitle}>
                  {destination.street_address}, {destination.address_locality}
                </span>
                <span className={styles.choiceNote}>
                  {destination.first_name} {destination.last_name} &middot;{" "}
                  {destination.address_region} {destination.postal_code},{" "}
                  {destination.address_country}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
    </Step>
  );
}
