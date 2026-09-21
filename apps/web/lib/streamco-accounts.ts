/**
 * StreamCo's static demo-account facts and types — split out from `lib/streamco.ts` so a client
 * component can read them without pulling in `node:fs/promises`.
 *
 * `lib/streamco.ts` is server-only: it reads/writes the JSON override file that makes a bill
 * "paid". The account error boundary (`app/streamco/[account]/error.tsx`) has to be a client
 * component — that's a Next.js requirement for `error.tsx` — and it needs the demo account id for
 * its "reload" link. Importing `lib/streamco.ts` there pulled its top-level `node:fs/promises`
 * import into the client bundle too, which is a hard webpack build failure (`UnhandledSchemeError`),
 * not a warning: the account page 500'd on every request. Nothing in this file touches the
 * filesystem, so it is safe in either bundle, and `lib/streamco.ts` now builds its `DEFAULTS` on
 * top of the same `STREAMCO_DEFAULTS` here instead of keeping a second copy.
 */

export interface StreamCoSettlement {
  /** The PaymentIntent id (or gift-only run id) our settlement layer reported. */
  readonly handle: string;
  readonly giftDrawnMinor: number;
  readonly cardChargedMinor: number;
  readonly paidAt: string;
}

export interface StreamCoAccount {
  readonly id: string;
  readonly holder: string;
  readonly plan: string;
  readonly planBlurb: string;
  /** The recurring price, shown on the page — deliberately near the amount due, to make a scrape work. */
  readonly planPriceMinor: number;
  readonly currency: string;
  readonly amountDueMinor: number;
  /** ISO date (no time) the bill is due. */
  readonly dueDate: string;
  readonly memberSince: string;
  readonly cycleLabel: string;
  /** Card the biller has on file, for display only — a masked last4, never a real number. */
  readonly cardOnFile: string;
  readonly status: "due" | "paid";
  readonly settlement: StreamCoSettlement | null;
}

/** The immutable facts of each demo account. Amounts are minor units (cents), currency CAD. */
export const STREAMCO_DEFAULTS: Record<string, Omit<StreamCoAccount, "status" | "settlement">> = {
  acct_demo: {
    id: "acct_demo",
    holder: "Arpita Das",
    plan: "Premium 4K + HDR",
    planBlurb: "Ultra HD on four screens, spatial audio, offline downloads.",
    planPriceMinor: 4599,
    currency: "CAD",
    amountDueMinor: 4599,
    dueDate: "2026-08-12",
    memberSince: "2021",
    cycleLabel: "Aug 12 – Sep 11",
    cardOnFile: "•••• 4242",
  },
};

/** The demo account ids, for links and reset. Safe to import from a client component. */
export function streamCoAccountIds(): string[] {
  return Object.keys(STREAMCO_DEFAULTS);
}
