import { Container, SectionLabel, Badge } from "@/components/ui";
import { ProductCard } from "@/components/product-card";
import { StoreDown } from "@/components/store-down";
import { getCatalog, storeIsUp } from "@/lib/store";
import styles from "./page.module.css";

export default async function HomePage() {
  if (!(await storeIsUp())) return <StoreDown />;

  const { products } = await getCatalog();

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
              Cut this morning, hand-tied, delivered locally. Put a gift card against your
              order and only the remainder reaches your card — every draw is written to a
              ledger you can check.
            </p>
            {/* One pill, and it names a thing a customer gets. The protocol and the sandbox
                disclosure are real and still stated — in the footer, where a shop puts them.
                A florist does not badge its payment processor's test mode above the fold. */}
            <div className={styles.heroTags}>
              <Badge tone="brand" soft>Pay with a gift card, a card, or both</Badge>
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <div className={styles.gridHead}>
          <h2 className={styles.gridTitle}>This week&rsquo;s cuttings</h2>
          {/* "6 items" is inventory-system language. A florist counts arrangements. */}
          <p className={styles.gridCount}>
            {products.length} {products.length === 1 ? "arrangement" : "arrangements"} this week
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
      </Container>
    </>
  );
}
