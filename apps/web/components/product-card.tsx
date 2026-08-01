import Link from "next/link";

import type { CatalogProduct } from "@/lib/store";
import { Money, Badge } from "./ui";
import { ProductArt } from "./product-art";
import styles from "./product-card.module.css";

export function ProductCard({ product }: { product: CatalogProduct }) {
  const soldOut = !product.in_stock;
  const lowStock = product.in_stock && product.stock <= 5;

  return (
    <Link
      href={`/product/${product.id}`}
      className={styles.card}
      data-soldout={soldOut || undefined}
    >
      <div className={styles.media}>
        <ProductArt id={product.id} />
        {soldOut && <span className={styles.soldOut}>Sold out</span>}
        {lowStock && (
          <span className={styles.lowStock}>
            <Badge tone="warn" soft>
              {product.stock} left
            </Badge>
          </span>
        )}
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{product.title}</h3>
        <div className={styles.meta}>
          <Money minor={product.price} currency={product.currency} className={styles.price} />
          <span className={styles.cta} aria-hidden>
            View
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
