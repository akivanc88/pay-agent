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
              A working UCP storefront. Pay with a gift card, a card, or both at once — the
              remainder falls through to the card rail automatically, and every draw is
              written to an append-only ledger.
            </p>
            <div className={styles.heroTags}>
              <Badge tone="brand" soft>Gift card + card</Badge>
              <Badge tone="neutral" soft>UCP agentic checkout</Badge>
              <Badge tone="neutral" soft>Stripe test mode</Badge>
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <div className={styles.gridHead}>
          <h2 className={styles.gridTitle}>This week&rsquo;s cuttings</h2>
          <p className={styles.gridCount}>
            {products.length} {products.length === 1 ? "item" : "items"}
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
