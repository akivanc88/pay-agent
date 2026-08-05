/** Loads one catalog product and composes its server-rendered detail route. */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Container, Money, SectionLabel, Badge } from "@/components/ui";
import { ProductArt } from "@/components/product-art";
import { StoreDown } from "@/components/store-down";
import { getProduct, storeIsUp } from "@/lib/store";
import { ProductPurchase } from "./purchase";
import styles from "./page.module.css";

/**
 * Editorial copy for each cutting. The store only knows price and stock; the voice of the
 * shop lives here. Every product id in the catalogue has an entry, with a graceful fallback
 * so a newly-seeded product is never blank.
 */
type Copy = {
  kind: string;
  lede: string;
  description: string;
  care: string;
  delivery: string;
};

const COPY: Record<string, Copy> = {
  bouquet_roses: {
    kind: "Hand-tied bouquet",
    lede: "The classic gesture, made properly.",
    description:
      "A dozen velvet-red garden roses, cut this morning and hand-tied with eucalyptus and a whisper of gypsophila. Wrapped in kraft paper and finished with a cotton ribbon, ready to hand over or drop into a vase.",
    care: "Trim two centimetres from each stem at an angle and stand in fresh water. Change the water every other day and keep the bunch clear of direct sun and ripening fruit.",
    delivery: "Same-day delivery across the city on orders placed before 1pm.",
  },
  bouquet_sunflowers: {
    kind: "Seasonal bundle",
    lede: "Summer, cut and carried indoors.",
    description:
      "Five tall sunflowers with faces turned to the light, gathered loose with seasonal greenery and a few stems of wheat. Cheerful, unfussy, and built to fill a wide jug.",
    care: "Sunflowers drink heavily — top up the water daily and recut the stems every couple of days to keep the heads upright.",
    delivery: "Same-day delivery across the city on orders placed before 1pm.",
  },
  bouquet_tulips: {
    kind: "Hand-tied bouquet",
    lede: "Gathered loose so they open in their own time.",
    description:
      "A generous handful of Dutch tulips in bloom-ready bud, tied loosely so the stems keep their natural sway. They’ll keep growing and turning toward the window for days after they arrive.",
    care: "Tulips prefer a cool spot and shallow, cold water. A clean, straight-sided vase helps them stand tall as they continue to grow.",
    delivery: "Same-day delivery across the city on orders placed before 1pm.",
  },
  orchid_white: {
    kind: "Living plant",
    lede: "Long-lasting and quietly architectural.",
    description:
      "A single phalaenopsis in porcelain-white, arching over glossy leaves in a matte stoneware pot. A considered gift that keeps flowering for weeks, then again the next season with a little care.",
    care: "Bright, indirect light and a weekly drink — three ice cubes at the base is plenty. Let the roots dry between waterings; orchids resent wet feet.",
    delivery: "Delivered boxed and upright. Next-day on orders placed after 1pm.",
  },
  gardenias: {
    kind: "Fragrant cutting",
    lede: "The most scented cutting we grow.",
    description:
      "Cream gardenias in full bloom against deep, waxy foliage. The scent carries across a room — best kept somewhere you’ll pass often. Cut sparingly and only to order.",
    care: "Keep out of drafts and away from heat. Mist the foliage lightly and change the water daily to hold the blooms open longer.",
    delivery: "Same-day delivery across the city on orders placed before 1pm.",
  },
  pot_ceramic: {
    kind: "Potted plant",
    lede: "Ready for a bright windowsill.",
    description:
      "A trailing pothos settled into a hand-thrown stoneware planter, glazed in soft matte clay. Forgiving, fast-growing, and happy in almost any room — a good first plant or an easy second one.",
    care: "Water when the top inch of soil is dry and give it bright, indirect light. Wipe the leaves now and then to keep them glossy.",
    delivery: "Delivered potted and ready to place. Next-day on orders placed after 1pm.",
  },
};

const FALLBACK: Copy = {
  kind: "From the shop",
  lede: "Cut fresh and arranged by hand.",
  description:
    "A seasonal arrangement from our workroom, cut fresh and tied by hand. Ask us about substitutions if you have something particular in mind.",
  care: "Trim the stems, stand in fresh water, and keep out of direct sun. Change the water every couple of days.",
  delivery: "Same-day delivery across the city on orders placed before 1pm.",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id).catch(() => undefined);
  if (!product) return { title: "Not found — pay-agent" };
  return { title: `${product.title} — pay-agent` };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await storeIsUp())) return <StoreDown />;

  const product = await getProduct(id);
  if (!product) notFound();

  const copy = COPY[id] ?? FALLBACK;
  const soldOut = !product.in_stock;

  return (
    <Container className={styles.page}>
      <nav className={styles.crumb} aria-label="Breadcrumb">
        <Link href="/" className={styles.back}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Back to shop
        </Link>
      </nav>

      <div className={styles.layout}>
        <div className={`${styles.mediaCol} rise`}>
          <div className={styles.media} data-soldout={soldOut || undefined}>
            <ProductArt id={product.id} />
            {soldOut && <span className={styles.soldOutVeil}>Sold out</span>}
          </div>
        </div>

        <div className={`${styles.detailCol} rise`}>
          <SectionLabel>{copy.kind}</SectionLabel>
          <h1 className={styles.title}>{product.title}</h1>
          <p className={styles.lede}>{copy.lede}</p>

          <div className={styles.priceRow}>
            <Money minor={product.price} currency={product.currency} className={styles.price} />
            {soldOut ? (
              <Badge tone="danger" soft>
                Sold out
              </Badge>
            ) : product.stock <= 5 ? (
              <Badge tone="warn" soft>
                {product.stock} left
              </Badge>
            ) : /* No badge for the ordinary case. `ProductPurchase` already says "In stock ·
                   cut fresh and ready to arrange" under the button, so a badge here repeats
                   it 400px away — and a status mark that fires on the default state stops
                   marking status. The slot is reserved for the exceptions above. */
            null}
          </div>

          <p className={styles.description}>{copy.description}</p>

          <ProductPurchase
            id={product.id}
            title={product.title}
            price={product.price}
            currency={product.currency}
            stock={product.stock}
            inStock={product.in_stock}
          />

          <dl className={styles.notes}>
            <div className={styles.note}>
              <dt className={styles.noteTerm}>
                {/* A water droplet. This was a map pin with a plus in it — an "add location"
                    glyph — labelling instructions about trimming stems and changing water. */}
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3.2c3.6 4.2 6 7 6 10.1a6 6 0 0 1-12 0c0-3.1 2.4-5.9 6-10.1Z" />
                  <path d="M9.4 13.6a2.6 2.6 0 0 0 2.6 2.6" opacity="0.65" />
                </svg>
                Care
              </dt>
              <dd className={styles.noteBody}>{copy.care}</dd>
            </div>
            <div className={styles.note}>
              <dt className={styles.noteTerm}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 19a2 2 0 1 0 0-.01M18 19a2 2 0 1 0 0-.01" />
                </svg>
                Delivery
              </dt>
              <dd className={styles.noteBody}>{copy.delivery}</dd>
            </div>
            <div className={styles.note}>
              <dt className={styles.noteTerm}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 7l8-4 8 4-8 4-8-4ZM4 7v10l8 4 8-4V7M12 11v10" />
                </svg>
                In the shop
              </dt>
              <dd className={styles.noteBody}>
                Prefer to see it first? Every arrangement is made to order in our workroom —
                pay here with a gift card, a card, or both.
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </Container>
  );
}
