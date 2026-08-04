import styles from "./pay-footer.module.css";

/**
 * The checkout's footer: the disclosure, and nothing else.
 *
 * The shop's footer has three columns, a browse nav and a paragraph explaining the protocol.
 * None of that belongs under a payment form. What cannot be dropped is the sentence the
 * customer is entitled to read before they press pay — that this is a sandbox and no live
 * card is charged — so that sentence is the whole footer.
 */
export function PayFooter() {
  return (
    <footer className={styles.footer}>
      <p className={styles.disclosure}>
        Card payments run in <strong>Stripe test mode</strong>. No live card is ever charged,
        and no card number reaches this server.
      </p>
    </footer>
  );
}
