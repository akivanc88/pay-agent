import type { ReactNode } from "react";

import { Button, Container, SectionLabel } from "./ui";
import styles from "./state-page.module.css";

/**
 * The one composition for "there is nothing here."
 *
 * Empty states, 404s and errors are all the same shape of moment — the page has no content
 * to show and has to explain itself instead — so they get one treatment. Before this
 * existed, `/cart` empty was centred inside a bordered card with bespoke art while
 * `/checkout` empty was bare left-aligned text in a narrower container, so walking from one
 * to the other with an empty cart moved the content 224px and changed its whole language.
 *
 * Deliberately not wrapped in a `Panel`: a box drawn around an absence makes the absence the
 * largest object on the page. The art and the type sit directly on the page ground, and
 * anything that fills the space (products to browse, say) goes in `children` underneath.
 */
export function StatePage({
  art,
  eyebrow,
  title,
  body,
  action,
  secondary,
  children,
}: {
  /**
   * A bare line drawing. The disc it sits on is drawn *here*, not in the caller — the cart's
   * empty state used to bring its own filled circle while the 404 and the error boundary
   * were unmounted strokes on paper, so three states that share a composition arrived in
   * three different weights.
   */
  art?: ReactNode;
  eyebrow: string;
  title: string;
  body: ReactNode;
  action?: { href: string; label: string };
  /** A quieter action beneath the main one — "Try again" on the error boundary. */
  secondary?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Container className={styles.wrap}>
      <div className={styles.center}>
        {art && (
          <div className={styles.art} aria-hidden>
            {art}
          </div>
        )}
        <SectionLabel>{eyebrow}</SectionLabel>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{body}</p>
        {(action || secondary) && (
          <div className={styles.actions}>
            {action && (
              <Button href={action.href} size="lg">
                {action.label}
              </Button>
            )}
            {secondary}
          </div>
        )}
      </div>
      {children}
    </Container>
  );
}
