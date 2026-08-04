/**
 * Money is integer minor units on the wire, everywhere — mirroring `packages/db`. This is
 * the one place the web app turns cents into something a person reads, and it never does
 * float arithmetic to get there.
 */

const FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let f = FORMATTERS.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    });
    FORMATTERS.set(currency, f);
  }
  return f;
}

/** e.g. formatMoney(3500, "CAD") → "$35.00". Input is minor units. */
export function formatMoney(minor: number, currency = "CAD"): string {
  return formatter(currency).format(minor / 100);
}

/** Just the digits, for places that supply their own currency mark. */
export function formatAmount(minor: number): string {
  return (minor / 100).toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Read a formatted balance back into minor units.
 *
 * The funding endpoint reports balances as display strings (`"$25.00"`), so anything that
 * needs to add them up has to parse them back. Done on the digits — `"$25.00"` → `2500` —
 * so no float ever exists: `parseFloat("25.00") * 100` is the exact class of bug this
 * project's ledger is built to avoid. Anything not matching the expected shape returns
 * `null`, and the caller must then say the amount is unknown rather than invent one.
 *
 * Group separators are stripped before matching. `formatMoney` emits them once a balance
 * reaches four figures, so a stricter pattern would reject `"$1,250.00"` and report a
 * balance the ledger knows perfectly well as unknown — degrading honestly, but wrongly.
 */
export function minorFromDisplay(display: string): number | null {
  const match = /^(-?)[^\d-]*(\d[\d,\u00a0\u202f ]*)\.(\d{2})$/.exec(display.trim());
  if (!match) return null;
  const [, sign, whole, cents] = match;
  const digits = (whole ?? "").replace(/[,\u00a0\u202f ]/g, "");
  const minor = Number.parseInt(digits, 10) * 100 + Number.parseInt(cents ?? "", 10);
  if (!Number.isSafeInteger(minor)) return null;
  return sign === "-" ? -minor : minor;
}
