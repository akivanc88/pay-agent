/**
 * The signed mandates a run issued — an IntentMandate always, and a Checkout/PaymentMandate
 * once it actually reached payment. Each is shown with its verified badge, key id, and the
 * compact JWS itself, truncated for legibility with a copy affordance for the real value.
 *
 * Honesty: this project signs compact JWS (RFC 7515), not SD-JWT-VC, and says so — quietly,
 * once, at the foot of the panel, not as a caveat on every row.
 */

import type { MandateKind } from "@pay-agent/db";

import { Badge, Panel } from "@/components/ui";
import type { StoredMandate } from "@/lib/consent";

import { ActivityCopyButton } from "./activity-copy-button";
import { formatClock, truncateMiddle } from "./activity-format";
import styles from "./activity-mandates.module.css";

const KIND_ORDER: readonly MandateKind[] = ["IntentMandate", "CheckoutMandate", "PaymentMandate"];

export function ActivityMandates({ mandates }: { mandates: StoredMandate[] }) {
  const sorted = [...mandates].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );

  return (
    <Panel className={styles.panel}>
      {sorted.length === 0 ? (
        <p className={styles.empty}>No mandates issued for this run yet.</p>
      ) : (
        sorted.map((mandate) => (
          <div key={mandate.jti} className={styles.card}>
            <div className={styles.head}>
              <span className={styles.kind}>{mandate.kind}</span>
              <Badge tone="brand" soft>
                Signed · EdDSA JWS
              </Badge>
            </div>

            <div className={styles.meta}>
              <div className={styles.metaItem}>
                <p className={styles.metaLabel}>Key ID</p>
                <p className={styles.metaValue}>{mandate.kid}</p>
              </div>
              <div className={styles.metaItem}>
                <p className={styles.metaLabel}>Issued</p>
                <p className={styles.metaValue}>{formatClock(mandate.createdAt)}</p>
              </div>
            </div>

            <div className={styles.jwsRow}>
              <code className={styles.jws}>{truncateMiddle(mandate.jws)}</code>
              <ActivityCopyButton value={mandate.jws} />
            </div>
          </div>
        ))
      )}
      <p className={styles.honesty}>
        Signed as a compact JWS (RFC 7515) — not SD-JWT-VC.
      </p>
    </Panel>
  );
}
