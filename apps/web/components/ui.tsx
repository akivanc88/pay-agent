import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { formatMoney } from "@/lib/money";
import styles from "./ui.module.css";

/* ── Money ─────────────────────────────────────────────────────────────
   Every amount on screen goes through here: tabular figures, minor-units in,
   a formatted string out. There is no other way to render money in this app. */
export function Money({
  minor,
  currency = "CAD",
  className = "",
}: {
  minor: number;
  currency?: string;
  className?: string;
}) {
  return <span className={`tnum ${className}`}>{formatMoney(minor, currency)}</span>;
}

/* ── Panel ─────────────────────────────────────────────────────────────
   The base surface. `tone` shifts the ground; `inset` sinks it. */
export function Panel({
  children,
  tone = "surface",
  inset = false,
  className = "",
  ...rest
}: {
  children: ReactNode;
  tone?: "surface" | "raised" | "sunk";
  inset?: boolean;
  className?: string;
} & ComponentProps<"div">) {
  return (
    <div
      className={`${styles.panel} ${styles[`panel_${tone}`]} ${inset ? styles.panelInset : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ── Button ────────────────────────────────────────────────────────────
   Renders as <a> when `href` is present, <button> otherwise — same skin. */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

function buttonClass(variant: ButtonVariant, size: ButtonSize, full?: boolean) {
  return `${styles.btn} ${styles[`btn_${variant}`]} ${styles[`btn_${size}`]} ${full ? styles.btnFull : ""}`;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  full = false,
  href,
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  href?: string;
  className?: string;
} & ComponentProps<"button">) {
  const cls = `${buttonClass(variant, size, full)} ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

/* ── Badge ─────────────────────────────────────────────────────────────
   Small status marks. `unverified`/`stale` are load-bearing here: an amount
   the system can't confirm must always carry one. */
type BadgeTone = "neutral" | "brand" | "warn" | "danger" | "gold";
export function Badge({
  children,
  tone = "neutral",
  soft = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  soft?: boolean;
}) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${tone}`]} ${soft ? styles.badgeSoft : ""}`}>
      {children}
    </span>
  );
}

/* ── SectionLabel — the small uppercase eyebrow used across surfaces. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className={styles.eyebrow}>{children}</p>;
}

/* ── Container — the shared page gutter and max width. */
export function Container({
  children,
  narrow = false,
  className = "",
}: {
  children: ReactNode;
  narrow?: boolean;
  className?: string;
}) {
  return (
    <div className={`${styles.container} ${narrow ? styles.containerNarrow : ""} ${className}`}>
      {children}
    </div>
  );
}
