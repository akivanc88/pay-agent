import { PayFooter } from "@/components/pay-footer";
import { PayHeader } from "@/components/pay-header";

import styles from "./layout.module.css";

/**
 * The payment frame. See `components/pay-header.tsx` for why it is this bare.
 *
 * There is no theme toggle here, and that is not an oversight: the theme is persisted and
 * applied before first paint, so a customer who arrived in dark mode stays in dark mode. The
 * control is simply not a thing anyone needs mid-payment, and none of the checkouts worth
 * copying offer one.
 */
export default function PayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <PayHeader />
      <main className={styles.main}>{children}</main>
      <PayFooter />
    </div>
  );
}
