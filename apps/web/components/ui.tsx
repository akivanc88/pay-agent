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
  return (
    <span className={`${styles.money} tnum ${className}`}>{formatMoney(minor, currency)}</span>
  );
}

/* ── Panel ─────────────────────────────────────────────────────────────
   The base surface. `tone` shifts the ground; `inset` sinks it. Depth is one idea — see the
   note in ui.module.css. */
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

/** The in-flight mark. Sized in `em` so it tracks whatever size the button is. */
function Spinner() {
  return (
    <svg className={styles.spinner} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  full = false,
  loading = false,
  href,
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  /**
   * In-flight. Deliberately *not* `disabled`: a disabled element loses focus, so a keyboard
   * user who presses a button is thrown back to the top of the document at the exact moment
   * the page starts telling them what is happening. `aria-disabled` plus `aria-busy` says
   * the same thing to assistive tech and CSS blocks the pointer.
   */
  loading?: boolean;
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
    <button
      className={cls}
      data-loading={loading || undefined}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
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
export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`${styles.eyebrow} ${className}`}>{children}</p>;
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
