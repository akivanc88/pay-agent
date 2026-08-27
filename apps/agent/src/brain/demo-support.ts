/**
 * Shared scaffolding for driving the brain in a demo or from the resume service — the bits that are
 * not the brain itself: a fresh demo wallet, and an in-process StreamCo stub for offline runs.
 *
 * Kept here so the CLI demo (`demo-instruct.ts`) and the HTTP endpoint (`serve.ts /instruct`) build
 * the exact same run, rather than each hand-rolling a wallet and a stub that could drift apart.
 */
import type {
  AcceptedInstruments,
  AmountDue,
  Funding,
  InstrumentPlan,
  Mandate,
  PaymentDestination,
  PaymentResult,
  PaymentStatus,
} from "../destination.js";

const STORE_URL = process.env["STORE_URL"] ?? "http://localhost:3000";
const SIMULATION_SECRET = process.env["SIMULATION_SECRET"] || "super-secret-sim-key";

/**
 * Issue a fresh closed-loop gift card in the store's ledger and return its code + pin.
 *
 * Goes over the store's HTTP API (a testing-only, Simulation-Secret-guarded endpoint), not a
 * shelled-out local script — the agent and the store are separate deployed services, each with
 * their own disk, so a local `pnpm issue-card` child process used to write to the *caller's*
 * filesystem rather than reaching the store's actual ledger. That is the same "agent and
 * merchant separated by HTTP" boundary the rest of this codebase already holds to (AGENTS.md
 * rule 6); this was the one place it had quietly slipped.
 */
export async function issueDemoCard(dollars: number): Promise<{ code: string; pin: string }> {
  const code = `GC-IN-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const pin = "1234";
  const res = await fetch(`${STORE_URL}/testing/issue-card`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Simulation-Secret": SIMULATION_SECRET },
    body: JSON.stringify({ code, pin, dollars }),
  });
  if (!res.ok) {
    throw new Error(`issueDemoCard: store refused (${res.status}): ${await res.text()}`);
  }
  return { code, pin };
}

/** A demo wallet: a real fresh gift card (given a code) plus a Stripe test card. */
export function demoWallet(gift: { code: string; pin: string }, giftHintMinor = 2000): Funding {
  return {
    giftCard: { ...gift, hintMinor: giftHintMinor, verified: true },
    card: { token: "pm_card_visa", label: "Visa (test)", enrolledBalanceMinor: null },
  };
}

/** A wallet that needs no store — a fixed gift + test card, for `--stub` / no-Stripe runs. */
export function stubWallet(giftHintMinor = 2000): Funding {
  return {
    giftCard: { code: "GC-STUB", pin: "1234", hintMinor: giftHintMinor, verified: true },
    card: { token: "pm_card_visa", label: "Visa (test)", enrolledBalanceMinor: null },
  };
}

/** The demo catalogue's real seed prices (`apps/store/scripts/seed.ts`), so an offline run quotes the same total the live store would. */
const STUB_CATALOGUE: Record<string, number> = {
  bouquet_roses: 3500,
  pot_ceramic: 1500,
  bouquet_sunflowers: 2500,
  bouquet_tulips: 3000,
  orchid_white: 4500,
  gardenias: 2000,
};

/** An in-process flower shop, so the ucp-storefront path runs with no servers and no network. */
export function stubUcpStorefront(): PaymentDestination {
  return {
    id: "ucp-storefront",
    async discover(reference: string): Promise<AmountDue> {
      const amountMinor = reference
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce((sum, part) => {
          const [id, qty] = part.split(":");
          const price = STUB_CATALOGUE[id ?? ""] ?? STUB_CATALOGUE["bouquet_roses"]!;
          return sum + price * (qty ? Number.parseInt(qty, 10) : 1);
        }, 0);
      return {
        destinationId: "ucp-storefront",
        reference,
        amountMinor,
        currency: "CAD",
        description: `flower shop cart (${reference}) — offline simulation`,
        handle: reference,
      };
    },
    async capabilities(): Promise<AcceptedInstruments> {
      return { currency: "CAD", redeemsGiftCard: true, acceptsCard: true };
    },
    async pay(plan: InstrumentPlan): Promise<PaymentResult> {
      return {
        ok: true,
        handle: "stub_ok",
        detail: "settled on stub",
        giftDrawnMinor: plan.giftDrawMinor > 0 ? plan.giftDrawMinor : null,
        cardChargedMinor: plan.cardMinor > 0 ? plan.cardMinor : null,
        reversed: false,
      };
    },
    async confirm(handle: string): Promise<PaymentStatus> {
      return { settled: true, handle, detail: "stub confirmed" };
    },
  };
}

/** An in-process StreamCo, so the brain runs with no servers and no Stripe key. */
export function stubStreamco(amountMinor: number): PaymentDestination {
  return {
    id: "streamco",
    async discover(reference: string): Promise<AmountDue> {
      return { destinationId: "streamco", reference, amountMinor, currency: "CAD", description: "StreamCo Premium — offline simulation", handle: reference };
    },
    async capabilities(): Promise<AcceptedInstruments> {
      return { currency: "CAD", redeemsGiftCard: false, acceptsCard: true };
    },
    async pay(plan: InstrumentPlan, _mandate: Mandate): Promise<PaymentResult> {
      return {
        ok: true,
        handle: "stub_ok",
        detail: "settled on stub",
        giftDrawnMinor: plan.giftDrawMinor > 0 ? plan.giftDrawMinor : null,
        cardChargedMinor: plan.cardMinor > 0 ? plan.cardMinor : null,
        reversed: false,
      };
    },
    async confirm(handle: string): Promise<PaymentStatus> {
      return { settled: true, handle, detail: "stub confirmed" };
    },
  };
}
