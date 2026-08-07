/**
 * StreamCo — the simulated subscription biller (destination 3).
 *
 * **Simulated, deliberately, and labelled as such on the surface.** The agent cannot pay a real
 * Netflix or Disney+ account: there is no public payment API, automating a login violates their
 * terms, and those properties are bot-defended. StreamCo reproduces the *shape* of that problem —
 * a plan, a balance due, a due date, a payment form, and **no machine-readable checkout** — so the
 * agent must fall back to reading the page. That constraint is the capstone's whole contrast.
 *
 * State model: the account facts (holder, plan, amount, due date) are fixed defaults in code; the
 * only mutable bit is whether the bill has been settled, which is kept as an override in a small
 * JSON file so the agent (a separate process, reaching us over HTTP) and the rendered portal agree.
 * `resetAccount` puts a bill back to "due" so the demo can be run again.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DATA_FILE = join(process.cwd(), ".data", "streamco.json");

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
const DEFAULTS: Record<string, Omit<StreamCoAccount, "status" | "settlement">> = {
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

interface Overrides {
  [accountId: string]: { status: "due" | "paid"; settlement: StreamCoSettlement | null };
}

async function readOverrides(): Promise<Overrides> {
  try {
    return JSON.parse(await readFile(DATA_FILE, "utf8")) as Overrides;
  } catch {
    return {};
  }
}

async function writeOverrides(overrides: Overrides): Promise<void> {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(overrides, null, 2), "utf8");
}

/** The demo account ids, for links and reset. */
export function streamCoAccountIds(): string[] {
  return Object.keys(DEFAULTS);
}

/** An account merged with its mutable settlement override, or null if the id is unknown. */
export async function getAccount(id: string): Promise<StreamCoAccount | null> {
  const base = DEFAULTS[id];
  if (!base) return null;
  const override = (await readOverrides())[id];
  return {
    ...base,
    status: override?.status ?? "due",
    settlement: override?.settlement ?? null,
  };
}

/** Mark a bill paid, recording what our settlement layer reported. Idempotent on the account. */
export async function markPaid(id: string, settlement: Omit<StreamCoSettlement, "paidAt">): Promise<StreamCoAccount | null> {
  if (!DEFAULTS[id]) return null;
  const overrides = await readOverrides();
  overrides[id] = { status: "paid", settlement: { ...settlement, paidAt: new Date().toISOString() } };
  await writeOverrides(overrides);
  return getAccount(id);
}

/** Put a bill back to "due" so the demo can run again. */
export async function resetAccount(id: string): Promise<StreamCoAccount | null> {
  if (!DEFAULTS[id]) return null;
  const overrides = await readOverrides();
  delete overrides[id];
  await writeOverrides(overrides);
  return getAccount(id);
}
