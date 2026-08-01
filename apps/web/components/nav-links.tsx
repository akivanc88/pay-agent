"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./site-header.module.css";

const LINKS = [
  { href: "/", label: "Shop", match: (p: string) => p === "/" || p.startsWith("/product") },
  { href: "/wallet", label: "Wallet", match: (p: string) => p.startsWith("/wallet") },
  { href: "/checkout", label: "Checkout", match: (p: string) => p.startsWith("/checkout") },
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
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
