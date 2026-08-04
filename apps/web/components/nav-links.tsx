"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./site-header.module.css";

/**
 * `secondary` marks a link the header may drop when width runs out. Checkout is the one
 * that goes: on a phone the three links plus the mark, cart and toggle overflow 390px, and
 * checkout is the only destination already reachable by another control in the same
 * header — the cart indicator leads there. Dropping it loses no route, only a duplicate.
 */
const LINKS = [
  { href: "/", label: "Shop", match: (p: string) => p === "/" || p.startsWith("/product") },
  { href: "/wallet", label: "Wallet", match: (p: string) => p.startsWith("/wallet") },
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
