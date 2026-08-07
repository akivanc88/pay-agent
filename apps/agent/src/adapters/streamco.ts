/**
 * The StreamCo biller adapter — the "no machine-readable checkout" pole.
 *
 * StreamCo is a simulated subscription biller (a Netflix/Disney+-shaped account page). It is the
 * contrast the whole capstone argument rests on: it exposes **no** discovery API, so the agent has
 * to do the thing agents should not have to do — read a human page and work out the amount from it.
 * `discover` fetches the rendered portal and scrapes the "amount due" out of the markup; when the
 * markup it depends on isn't there, it reports it **cannot read the amount** rather than guessing a
 * number and paying it. That refusal is the point: the better the destination's protocol, the less
 * the agent has to guess — and here there is no protocol, so the agent guesses nothing and says so.
 *
 * Settlement is honest about what it is: StreamCo has no checkout to drive, so the split runs on our
 * own rails exactly like the payment link — gift card drawn on our ledger, remainder on a real
 * test-mode card, reversed on a decline (shared `settleExternalRail`). On success the adapter tells
 * StreamCo the bill was paid out-of-band (a reconciliation notice, not a checkout call), and
 * `confirm` re-reads the portal to see the account marked paid rather than trusting `pay`'s return.
 */
import Stripe from "stripe";

import type {
  AcceptedInstruments,
  AmountDue,
  InstrumentPlan,
  Mandate,
  PaymentDestination,
  PaymentResult,
  PaymentStatus,
} from "../destination.js";
import { settleExternalRail } from "./external-rail.js";

/** The agent could not read the amount off StreamCo's page. Surfaced, never guessed past. */
export class StreamCoUnreadable extends Error {
  readonly reference: string;
  constructor(reference: string, detail: string) {
    super(`StreamCo account ${reference}: ${detail}`);
    this.name = "StreamCoUnreadable";
    this.reference = reference;
  }
}

/** Normalize whatever reference the agent was handed to a StreamCo account id (`acct_…`). */
function accountId(reference: string): string {
  const match = reference.match(/acct_[A-Za-z0-9]+/);
  if (match) return match[0];
  throw new Error(`StreamCo reference must contain a StreamCo account id (acct_…); got "${reference}"`);
}

/** Strip tags to text so the scrape reads what a human reads, not the DOM structure. */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Scrape the amount due from the rendered account page. Anchored to the human "Amount due" label so
 * it can't accidentally lift the monthly plan price shown elsewhere on the page. Returns null when
 * the anchor or a following amount is missing — the "markup changed" case the failure matrix drives.
 */
export function scrapeAmountDue(text: string): number | null {
  const anchored = text.match(/amount\s+due[^$]{0,200}?\$\s?([\d,]+\.\d{2})/i);
  if (!anchored?.[1]) return null;
  const dollars = Number(anchored[1].replace(/,/g, ""));
  if (!Number.isFinite(dollars)) return null;
  return Math.round(dollars * 100);
}

/** Whether the re-read page shows the account settled. */
function scrapePaid(text: string): boolean {
  return /\bpaid\b/i.test(text) && !/amount\s+due/i.test(text);
}

export function streamco(opts: {
  secretKey: string;
  storeBaseUrl: string;
  /** Where the StreamCo portal is served — the Next web app. */
  webBaseUrl: string;
}): PaymentDestination {
  if (!opts.secretKey.startsWith("sk_test_")) {
    throw new Error("StreamCo adapter is test-mode only; its key must be an sk_test_… key");
  }
  const stripe = new Stripe(opts.secretKey, {
    appInfo: { name: "pay-agent-agent", url: "https://github.com/ashis-majumder/pay-agent" },
  });
  const storeBase = opts.storeBaseUrl.replace(/\/$/, "");
  const webBase = opts.webBaseUrl.replace(/\/$/, "");
  const portalUrl = (id: string) => `${webBase}/streamco/${id}`;

  return {
    id: "streamco",

    /** Read the amount owed by *scraping the page* — there is no API to ask. */
    async discover(reference: string): Promise<AmountDue> {
      const id = accountId(reference);
      let html: string;
      try {
        const res = await fetch(portalUrl(id), { headers: { accept: "text/html" } });
        if (!res.ok) throw new StreamCoUnreadable(id, `portal responded ${res.status}`);
        html = await res.text();
      } catch (err) {
        if (err instanceof StreamCoUnreadable) throw err;
        throw new StreamCoUnreadable(id, `portal could not be fetched (${(err as Error).message})`);
      }

      const text = visibleText(html);
      const amountMinor = scrapeAmountDue(text);
      if (amountMinor === null) {
        throw new StreamCoUnreadable(
          id,
          "the page did not expose a readable amount due — refusing to guess a number and pay it",
        );
      }
      return {
        destinationId: this.id,
        reference: id,
        amountMinor,
        currency: "CAD",
        description: `StreamCo account ${id}`,
        handle: id,
      };
    },

    /** A biller with no ability to redeem our closed-loop card; it takes a card, effectively. */
    async capabilities(): Promise<AcceptedInstruments> {
      return { currency: "CAD", redeemsGiftCard: false, acceptsCard: true };
    },

    /** Settle on our own rails, then notify StreamCo out-of-band that the bill was paid. */
    async pay(plan: InstrumentPlan, _mandate: Mandate, due: AmountDue): Promise<PaymentResult> {
      const { result } = await settleExternalRail({
        stripe,
        storeBase,
        plan,
        due,
        metadata: { destination: this.id, streamco_account: due.handle },
      });

      if (result.ok) {
        // Reconciliation notice, not a checkout call: our settlement layer tells the biller its bill
        // was paid on our rails. Best-effort — a failed notice does not un-settle a real charge, so
        // it is surfaced in the detail rather than reversing money that genuinely moved.
        try {
          const res = await fetch(`${webBase}/api/streamco/settle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              account: due.handle,
              handle: result.handle,
              gift_drawn_minor: result.giftDrawnMinor ?? 0,
              card_charged_minor: result.cardChargedMinor ?? 0,
            }),
          });
          if (!res.ok) {
            return { ...result, detail: `${result.detail}; StreamCo settle-notice failed (${res.status})` };
          }
        } catch (err) {
          return { ...result, handle: due.handle, detail: `${result.detail}; StreamCo settle-notice errored (${(err as Error).message})` };
        }
        // Confirm re-reads the account page, so the handle it will be given must be the account id,
        // not the PaymentIntent id the card leg produced (that id is already recorded in the notice).
        return { ...result, handle: due.handle };
      }
      return result;
    },

    /** Confirm by re-reading the portal — the account should now show paid. */
    async confirm(handle: string): Promise<PaymentStatus> {
      try {
        const res = await fetch(portalUrl(handle), { headers: { accept: "text/html" } });
        if (!res.ok) return { settled: false, handle, detail: `portal responded ${res.status}` };
        const text = visibleText(await res.text());
        const paid = scrapePaid(text);
        return { settled: paid, handle, detail: paid ? "account shows paid" : "account still shows a balance" };
      } catch (err) {
        return { settled: false, handle, detail: `could not re-read the portal (${(err as Error).message})` };
      }
    },
  };
}
