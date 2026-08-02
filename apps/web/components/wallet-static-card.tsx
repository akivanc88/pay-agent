import styles from "./wallet-static-card.module.css";

/**
 * The featured gift card as a still object.
 *
 * This is the honest floor of the showpiece: it is what a visitor sees before the WebGL
 * chunk loads, what a `prefers-reduced-motion` visitor sees *instead of* it, and what a
 * machine without WebGL falls back to. So it has to be genuinely beautiful on its own — a
 * calm, foil-on-charcoal metal card — not a grey placeholder waiting to be replaced.
 *
 * Every colour is a design token, re-pointed per theme in the CSS module so the object
 * reads as the same dark, gold-foiled card in light and dark alike (a physical card does
 * not invert with the room). The gold is `--gold`, reserved for exactly this moment.
 */

export interface FeaturedCard {
  /** Small foil eyebrow — the card family, e.g. "Gift card". */
  label: string;
  /** Merchant / issuer wordmark set in foil. */
  brand: string;
  /** Last four digits — never a full PAN, which never reaches this app. */
  last4: string;
  /** Pre-formatted, verified balance string from the store. Never re-computed here. */
  balanceDisplay: string;
}

export function WalletStaticCard({
  card,
  className = "",
  ariaHidden = false,
}: {
  card: FeaturedCard;
  className?: string;
  ariaHidden?: boolean;
}) {
  const label = ariaHidden
    ? undefined
    : `${card.brand} ${card.label}, ending ${card.last4}, balance ${card.balanceDisplay}`;

  return (
    <div
      className={`${styles.wrap} ${className}`}
      role={ariaHidden ? undefined : "img"}
      aria-label={label}
      aria-hidden={ariaHidden || undefined}
    >
      <svg
        className={styles.card}
        viewBox="0 0 400 252"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="wc-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--card-bg-2)" />
            <stop offset="0.55" stopColor="var(--card-bg-1)" />
            <stop offset="1" stopColor="var(--card-bg-3)" />
          </linearGradient>
          <linearGradient id="wc-foil" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--card-foil-hi)" />
            <stop offset="0.5" stopColor="var(--gold)" />
            <stop offset="1" stopColor="var(--card-foil-lo)" />
          </linearGradient>
          <linearGradient id="wc-sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--card-ink)" stopOpacity="0.16" />
            <stop offset="0.42" stopColor="var(--card-ink)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--card-ink)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="wc-chip" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--card-foil-hi)" />
            <stop offset="1" stopColor="var(--card-foil-lo)" />
          </linearGradient>
          <clipPath id="wc-clip">
            <rect x="0" y="0" width="400" height="252" rx="22" />
          </clipPath>
        </defs>

        <g clipPath="url(#wc-clip)">
          <rect x="0" y="0" width="400" height="252" fill="url(#wc-body)" />

          {/* Engraved guilloché — faint concentric arcs, the way security print catches light. */}
          <g stroke="var(--gold)" fill="none" opacity="0.12">
            <circle cx="330" cy="60" r="120" strokeWidth="0.75" />
            <circle cx="330" cy="60" r="160" strokeWidth="0.75" />
            <circle cx="330" cy="60" r="200" strokeWidth="0.75" />
            <circle cx="330" cy="60" r="240" strokeWidth="0.75" />
          </g>

          {/* Specular wash, baked toward the top-left as if lit from there. */}
          <rect x="0" y="0" width="400" height="252" fill="url(#wc-sheen)" />

          {/* Brand mark — the sprout, in foil. */}
          <g transform="translate(28 28)" fill="none" stroke="url(#wc-foil)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 22V10M11 10c0-3.6-2.6-6.6-6.6-7.1C4.1 7.7 6.6 11 11 11Zm0 0c0-3.3 2.2-6.2 6-6.6C17.3 8.4 14.9 11 11 11Z" />
          </g>
          <text x="52" y="45" className={styles.brandMark} fill="url(#wc-foil)">
            pay<tspan className={styles.brandDot}>·</tspan>agent
          </text>

          {/* Family eyebrow, foil, upper right. */}
          <text x="372" y="42" textAnchor="end" className={styles.eyebrow} fill="url(#wc-foil)">
            {card.label.toUpperCase()}
          </text>

          {/* Chip. */}
          <g transform="translate(30 92)">
            <rect x="0" y="0" width="52" height="40" rx="8" fill="url(#wc-chip)" />
            <g stroke="var(--card-bg-1)" strokeWidth="1.4" opacity="0.55">
              <path d="M0 13h52M0 27h52M18 0v40M34 0v40" />
            </g>
            <rect x="14" y="11" width="24" height="18" rx="4" fill="none" stroke="var(--card-bg-1)" strokeWidth="1.4" opacity="0.55" />
          </g>

          {/* Masked number — only the last four are ever known. */}
          <text x="30" y="176" className={styles.digits} fill="var(--card-ink)">
            <tspan className={styles.dots}>••••&#8201;••••&#8201;••••&#8201;</tspan>
            {card.last4}
          </text>

          {/* Balance and issuer footing. */}
          <text x="30" y="206" className={styles.footLabel} fill="var(--card-ink-dim)">
            BALANCE
          </text>
          <text x="30" y="230" className={styles.balance} fill="url(#wc-foil)">
            {card.balanceDisplay}
          </text>
          <text x="372" y="230" textAnchor="end" className={styles.issuer} fill="var(--card-ink-dim)">
            {card.brand}
          </text>

          {/* Inner hairline, so the card has a crisp edge in both themes. */}
          <rect x="0.75" y="0.75" width="398.5" height="250.5" rx="21.5" fill="none" stroke="var(--card-foil-hi)" strokeWidth="1" opacity="0.28" />
        </g>
      </svg>
    </div>
  );
}
