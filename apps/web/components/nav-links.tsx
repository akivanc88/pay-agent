/** Renders route-aware storefront navigation links. */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./site-header.module.css";

/**
 * `secondary` marks a link the header drops when width runs out. Only three primary links fit
 * beside the mark, cart and toggle at 390px, so the two destinations that are *already reachable
 * another way* go: checkout, which the cart indicator leads to, and activity, which every run card
 * on the Agent console links straight into ("See the full run →"). Dropping them loses no route on a
 * phone, only a redundant entry point — while Shop, Agent and Wallet, which have no other door, stay.
 */
const LINKS = [
  { href: "/", label: "Shop", match: (p: string) => p === "/" || p.startsWith("/product") },
  { href: "/agent", label: "Agent", match: (p: string) => p.startsWith("/agent") },
  { href: "/wallet", label: "Wallet", match: (p: string) => p.startsWith("/wallet") },
  {
    href: "/activity",
    label: "Activity",
    match: (p: string) => p.startsWith("/activity"),
    secondary: true,
  },
  {
    href: "/checkout",
    label: "Checkout",
    match: (p: string) => p.startsWith("/checkout"),
    secondary: true,
  },
];

export function NavLinks() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className={styles.nav} aria-label="Primary">
      {LINKS.map((link) => {
        const active = link.match(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={styles.navLink}
            data-active={active || undefined}
            /* Dropped unconditionally at narrow widths, including when it is the current
               page. Keeping it while active sounded kinder — the nav would never lose its
               "you are here" marker — but /checkout is exactly where the link is widest, so
               it put a 7px horizontal scroll on the one surface that can least afford one.
               The page's own h1 says where you are. */
            data-secondary={link.secondary || undefined}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
