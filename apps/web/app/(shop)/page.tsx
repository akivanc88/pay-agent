import Link from "next/link";

import { Container, SectionLabel, Button, Money } from "@/components/ui";
import { ProductCard } from "@/components/product-card";
import { ProductArt } from "@/components/product-art";
import { StoreDown } from "@/components/store-down";
import { getCatalog, storeIsUp } from "@/lib/store";
import styles from "./page.module.css";

/**
 * The storefront.
 *
 * Four movements, in the order a florist's own site uses them: a hero that carries real
 * material rather than text on an empty field, the week's grid, the explainer that says how
 * the money actually moves, and a short reassurance strip before the footer. The page used
 * to stop dead after the grid — roughly 400px of nothing above the footer — which is the
 * single loudest tell that a storefront is a mock-up.
 */

/** Three ways this shop asks to be trusted. Fictional flowers, stated plainly in the footer. */
const ASSURANCES = [
  {
    title: "Cut to order",
    body: "Nothing sits in a bucket waiting. Each arrangement is made the morning it goes out.",
    icon: (
      <>
        <path d="M6.5 6.5 17 17M17.5 6.5 7 17" />
        <circle cx="5" cy="19" r="2.2" />
        <circle cx="19" cy="19" r="2.2" />
      </>
    ),
  },
  {
    title: "Delivered locally",
    body: "Same-day across the city on orders placed before 1pm, by someone who works here.",
    icon: (
      <>
        <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7" />
        <circle cx="7" cy="18" r="1.9" />
        <circle cx="18" cy="18" r="1.9" />
      </>
    ),
  },
  {
    title: "Wrapped by hand",
    body: "Kraft paper, a cotton ribbon, and a card written out in your own words.",
    icon: (
      <>
        <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13" />
        <path d="M12 7C10 3.5 6 4 6 6.4 6 7.6 8.2 7 12 7ZM12 7c2-3.5 6-3 6-.6 0 1.2-2.2.6-6 .6Z" />
      </>
    ),
  },
];

/** The split, in the order it actually happens in `apps/store`. No step here is aspirational. */
const STEPS = [
  {
    n: "01",
    title: "Fill the basket",
    body: "Pick your stems and add them to the cart. Nothing is charged until the last step.",
  },
  {
    n: "02",
    title: "Put a gift card against it",
    body: "Code and PIN at checkout. The balance is drawn down to the cent against an append-only ledger this store owns.",
  },
  {
    n: "03",
    title: "Your card covers the rest",
    body: "Only the remainder is authorized on your card, in the same checkout. A gift card that covers everything means your card is never touched.",
  },
];

export default async function HomePage() {
  if (!(await storeIsUp())) return <StoreDown />;

  const { products } = await getCatalog();

  // The hero shows real catalogue items at real prices — never a stand-in. If the shop is
  // ever empty the plates simply don't render, rather than inventing a bouquet.
  const inStock = products.filter((p) => p.in_stock);
  const lead = inStock[0] ?? products[0];
  const second = (inStock[1] ?? products[1]) as typeof lead | undefined;

  return (
    <>
      <section className={styles.hero}>
        <Container className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <SectionLabel>Fernbank &amp; Co · Florist</SectionLabel>
            <h1 className={styles.heroTitle}>
              Flowers, paid for<br />
              <em className={styles.em}>however you like.</em>
            </h1>
            <p className={styles.heroLede}>
              Cut this morning, hand-tied, delivered across the city. Put a gift card against
              your order and only the remainder reaches your card — every draw written to a
              ledger you can check.
            </p>
            <div className={styles.heroActions}>
              <Button href="#cuttings" size="lg">
                Shop this week
              </Button>
              <Link href="#how-it-pays" className={styles.heroLink}>
                How the payment splits
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 5v14M6 13l6 6 6-6" />
                </svg>
              </Link>
            </div>
            {/* This was a pill. A pill directly beneath a real button and a real text link is
                a third control-shaped object in a row of two controls, and this one does
                nothing when pressed — the shape promised an affordance the element does not
                have. It says the same sentence as a caption, which is what it always was. */}
            <p className={styles.heroNote}>
              <span className={styles.heroNoteMark} aria-hidden />
              Pay with a gift card, a card, or both
            </p>
            {/* A second, compact pass at the same three assurances that get a full paragraph
                near the footer. Real hero space under a CTA reads as unfinished if it's left
                empty — a premium storefront fills it with proof, not padding. */}
            <ul className={styles.heroCreds}>
              {ASSURANCES.map((a) => (
                <li key={a.title} className={styles.heroCred}>
                  {a.title}
                </li>
              ))}
            </ul>
          </div>

          {lead && (
            <div className={styles.heroArt} aria-hidden={false}>
              <Link href={`/product/${lead.id}`} className={`${styles.plate} ${styles.plateMain}`}>
                <ProductArt id={lead.id} />
                <span className={styles.plateTag}>
                  <span className={styles.plateTagName}>{lead.title}</span>
                  <Money
                    minor={lead.price}
                    currency={lead.currency}
                    className={styles.plateTagPrice}
                  />
                </span>
              </Link>

              {second && second.id !== lead.id && (
                <Link
                  href={`/product/${second.id}`}
                  className={`${styles.plate} ${styles.plateAside}`}
                  tabIndex={-1}
                  aria-hidden
                >
                  <ProductArt id={second.id} />
                </Link>
              )}
            </div>
          )}
        </Container>
      </section>

      <Container>
        <section id="cuttings" className={styles.shop} aria-labelledby="cuttings-title">
          <div className={styles.gridHead}>
            <div className={styles.gridHeadCopy}>
              <SectionLabel>From the workroom</SectionLabel>
              <h2 id="cuttings-title" className={styles.gridTitle}>
                This week&rsquo;s cuttings
              </h2>
            </div>
            {/* "6 items" is inventory-system language. A florist counts arrangements. */}
            <p className={styles.gridCount}>
              <span className={`${styles.gridCountNum} tnum`}>{products.length}</span>
              {products.length === 1 ? "arrangement" : "arrangements"}, cut to order
            </p>
          </div>

          <div className={styles.grid}>
            {products.map((product, i) => (
              <div
                key={product.id}
                className={`${styles.gridItem} rise`}
                style={{ animationDelay: `${Math.min(i, 6) * 55}ms` }}
              >
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </section>
      </Container>

      <section id="how-it-pays" className={styles.pays} aria-labelledby="pays-title">
        <Container className={styles.paysInner}>
          <div className={styles.paysHead}>
            <SectionLabel>Paying for it</SectionLabel>
            <h2 id="pays-title" className={styles.paysTitle}>
              A gift card first.<br />
              <em className={styles.em}>Your card for the rest.</em>
            </h2>
            <p className={styles.paysLede}>
              Most gift cards go unspent because they never quite cover the basket. Here they
              don&rsquo;t have to. One checkout draws the card down to the cent and authorizes
              only what&rsquo;s left on the other rail.
            </p>
          </div>

          <ol className={styles.steps}>
            {STEPS.map((step) => (
              <li key={step.n} className={`${styles.step} ${styles.reveal}`}>
                <span className={`${styles.stepNum} tnum`} aria-hidden>
                  {step.n}
                </span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            ))}
          </ol>

          <div className={styles.paysFoot}>
            <Button href="/wallet" size="lg">
              Set up a gift card
            </Button>
            <p className={styles.paysNote}>
              A balance you type in yourself stays marked <strong>unverified</strong> — no API
              can read an open-loop prepaid card, so this wallet never pretends otherwise.
            </p>
          </div>
        </Container>
      </section>

      <Container>
        <ul className={styles.assurances}>
          {ASSURANCES.map((a) => (
            <li key={a.title} className={`${styles.assurance} ${styles.reveal}`}>
              <svg
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.assuranceIcon}
                aria-hidden
              >
                {a.icon}
              </svg>
              <h3 className={styles.assuranceTitle}>{a.title}</h3>
              <p className={styles.assuranceBody}>{a.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
