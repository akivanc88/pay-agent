/** Preserves the public ProductArt facade, registry lookup, and fallback illustration. */

import styles from "./product-art.module.css";
import {
  FALLBACK_PRODUCT_ILLUSTRATION,
  PRODUCT_ILLUSTRATIONS,
} from "./product-art-illustrations";

type ArtProps = { id: string; className?: string };

/** Stable product-art facade. Product intent selects an illustration; unknown products
 * continue to receive the gardenia fallback used before the extraction. */
export function ProductArt({ id, className = "" }: ArtProps) {
  const Illustration = PRODUCT_ILLUSTRATIONS[id] ?? FALLBACK_PRODUCT_ILLUSTRATION;
  return (
    <div className={`${styles.frame} ${className}`} data-art={id}>
      <Illustration />
    </div>
  );
}
