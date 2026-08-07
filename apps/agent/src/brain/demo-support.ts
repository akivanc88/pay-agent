/**
 * Shared scaffolding for driving the brain in a demo or from the resume service — the bits that are
 * not the brain itself: a fresh demo wallet, and an in-process StreamCo stub for offline runs.
 *
 * Kept here so the CLI demo (`demo-instruct.ts`) and the HTTP endpoint (`serve.ts /instruct`) build
 * the exact same run, rather than each hand-rolling a wallet and a stub that could drift apart.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const storeDir = join(dirname(fileURLToPath(import.meta.url)), "../../../store");

/** Issue a fresh closed-loop gift card in the store's ledger and return its code + pin. */
export function issueDemoCard(dollars: number): { code: string; pin: string } {
  const code = `GC-IN-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  execFileSync("pnpm", ["issue-card", code, "1234", dollars.toFixed(2)], { cwd: storeDir, stdio: "ignore" });
  return { code, pin: "1234" };
}

/** A demo wallet: a real fresh gift card (given a code) plus a Stripe test card. */
export function demoWallet(gift: { code: string; pin: string }, giftHintMinor = 2000): Funding {
  return {
    giftCard: { ...gift, hintMinor: giftHintMinor, verified: true },
    card: { token: "pm_card_visa", label: "Visa (test)" },
  };
}

/** A wallet that needs no store — a fixed gift + test card, for `--stub` / no-Stripe runs. */
export function stubWallet(giftHintMinor = 2000): Funding {
  return {
    giftCard: { code: "GC-STUB", pin: "1234", hintMinor: giftHintMinor, verified: true },
    card: { token: "pm_card_visa", label: "Visa (test)" },
  };
}

/** An in-process StreamCo, so the brain runs with no servers and no Stripe key. */
export function stubStreamco(amountMinor: number): PaymentDestination {
  return {
    id: "streamco",
    async discover(reference: string): Promise<AmountDue> {
      return { destinationId: "streamco", reference, amountMinor, currency: "CAD", description: "StreamCo Premium (stub)", handle: reference };
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
