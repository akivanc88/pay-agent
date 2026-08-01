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
