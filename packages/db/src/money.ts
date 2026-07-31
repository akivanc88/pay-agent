/**
 * Money is always integer minor units (cents for USD). Never floats.
 *
 * Floating point is wrong for money in a way that is quiet: 0.1 + 0.2 !== 0.3, and a
 * gift-card ledger that drifts by a fraction of a cent per operation will not reconcile
 * exactly after a reversal — which is precisely the invariant this project has to prove.
 *
 * The branded type makes the boundary explicit: a raw `number` cannot be passed where
 * `MinorUnits` is expected without going through `minorUnits()`, which validates.
 */

declare const brand: unique symbol;

export type MinorUnits = number & { readonly [brand]: "MinorUnits" };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Construct MinorUnits, rejecting anything that isn't a safe non-negative integer. */
export function minorUnits(value: number): MinorUnits {
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `Money must be integer minor units, received ${value}. ` +
        `Amounts like 12.34 must be expressed as 1234.`,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Money ${value} exceeds the safe integer range.`);
  }
  if (value < 0) {
    throw new MoneyError(`Money must be non-negative, received ${value}.`);
  }
  return value as MinorUnits;
}

export const ZERO: MinorUnits = 0 as MinorUnits;

export function add(a: MinorUnits, b: MinorUnits): MinorUnits {
  return minorUnits(a + b);
}

/** Subtract, refusing to go negative — callers must clamp deliberately via `min`. */
export function subtract(a: MinorUnits, b: MinorUnits): MinorUnits {
  return minorUnits(a - b);
}

export function min(a: MinorUnits, b: MinorUnits): MinorUnits {
  return (a < b ? a : b) as MinorUnits;
}

export function isZero(a: MinorUnits): boolean {
  return a === 0;
}

/** Display only — never feed the result back into arithmetic. */
export function format(a: MinorUnits, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(a / 100);
}
