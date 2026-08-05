/** Mirrors the cart layout while browser-owned cart state hydrates. */

import shellStyles from "./cart-view.module.css";
import lineStyles from "./cart-line-items.module.css";
import summaryStyles from "./cart-summary.module.css";
import styles from "./cart-skeleton.module.css";

export function CartSkeleton() {
  return (
    <div className={shellStyles.layout} aria-hidden>
      <div className={shellStyles.itemsCol}>
        <div className={`${lineStyles.lines} ${styles.linesSkeleton}`}>
          {[0, 1].map((index) => (
            <div key={index} className={`${lineStyles.row} ${styles.rowSkeleton}`}>
              <div className={`${lineStyles.thumb} ${styles.skel}`} />
              <div className={lineStyles.rowInfo}>
                <div className={styles.skelLine} style={{ width: "55%" }} />
                <div className={styles.skelLine} style={{ width: "24%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={summaryStyles.summaryCol}>
        <div className={`${summaryStyles.summary} ${styles.skel}`} style={{ height: "20rem" }} />
      </div>
    </div>
  );
}
