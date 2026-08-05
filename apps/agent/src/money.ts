/**
 * Money is integer minor units end to end — a cents value, never a float, never `toFixed`
 * arithmetic. The whole project's honesty argument rests on never inventing or rounding an
 * amount, and the surest way to invent one is to let a float in.
 */
export type Minor = number;

/** Assert a value really is an integer count of minor units, so a stray float fails loudly. */
export function assertMinor(n: number, what = "amount"): Minor {
  if (!Number.isInteger(n)) {
    throw new Error(`${what} must be integer minor units, got ${n}`);
  }
  return n;
}

/** Clamp a draw to what is available: never negative, never more than the cap. */
export function drawUpTo(want: Minor, available: Minor): Minor {
  return Math.max(0, Math.min(assertMinor(want), assertMinor(available)));
}

/** Format minor units for a run log only — display, never used back in arithmetic. */
export function formatMinor(n: Minor, currency: string): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${currency} ${(abs / 100).toFixed(2)}`;
}
