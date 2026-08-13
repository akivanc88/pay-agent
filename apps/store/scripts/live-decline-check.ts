/**
 * M5 — the one real transaction this project ever makes.
 *
 * Every other script proves something against Stripe's test mode. This one asks Stripe's
 * *live* mode a single question — does a genuine over-balance attempt on your real enrolled
 * card produce a genuine network decline — and it is built to be incapable of answering any
 * other way. Two guards stand between this script and a captured live charge:
 *
 *   1. `assertAmountExceedsEnrolledBalance` refuses to even build a live client unless the
 *      attempted amount exceeds the balance you recorded at enrollment. There is no flag to
 *      skip this — the only live outcome this script can produce is a decline.
 *   2. `attemptGuardedLiveDecline` never calls `captureAuthorization`. If the card somehow
 *      authorizes anyway (your recorded balance was wrong), the hold is cancelled immediately
 *      and reported as `unexpectedly_authorized`, not treated as this demo's decline.
 *
 * Prerequisites (all local, none of this runs on the hosted demo — `assertSafeStripeConfig`
 * refuses to boot with a live key in any deployed environment):
 *
 *   1. Enroll your real Visa gift card through the running app's `/wallet` → "add a card" flow
 *      (Stripe Elements — the PAN goes straight to Stripe, never through this repository).
 *      Note the `pm_…` id shown after enrolling and the balance you recorded.
 *   2. Set `STRIPE_LIVE_SECRET_KEY=sk_live_…` in `.env` — see `.env.example`. Never in a
 *      deployed environment.
 *
 * Usage (amounts in dollars):
 *
 *   pnpm --filter @pay-agent/store live-decline-check <pm_id> <enrolled-balance> <attempt-amount>
 *
 * Example — a card enrolled with $20.00 on it, attempting $25.00:
 *
 *   pnpm --filter @pay-agent/store live-decline-check pm_1AbC... 20.00 25.00
 */

import { minorUnits } from "@pay-agent/db";

import { attemptGuardedLiveDecline, liveClient, LiveGuardError } from "../src/payments/stripe";

const [paymentMethodId, enrolledDollars, attemptDollars] = process.argv.slice(2);

if (!paymentMethodId || !enrolledDollars || !attemptDollars) {
  console.error(
    "usage: live-decline-check <payment_method_id> <enrolled-balance-dollars> <attempt-amount-dollars>",
  );
  process.exit(1);
}

const enrolledCents = Math.round(Number(enrolledDollars) * 100);
const attemptCents = Math.round(Number(attemptDollars) * 100);
if (!Number.isFinite(enrolledCents) || !Number.isFinite(attemptCents) || enrolledCents < 0 || attemptCents < 0) {
  console.error(`invalid amount: enrolled=${enrolledDollars} attempt=${attemptDollars}`);
  process.exit(1);
}

// Ask Stripe, not our own code — `livemode` is Stripe's word, exactly as `stripe-check.ts`
// insists on the opposite fact before touching test-mode money.
const stripe = liveClient();
const balance = await stripe.balance.retrieve();
console.log(`\nStripe live key accepted  livemode=${balance.livemode}`);
if (!balance.livemode) {
  console.error("STRIPE_LIVE_SECRET_KEY did not resolve to a live key. Refusing to continue.");
  process.exit(1);
}

console.log(
  `Attempting ${attemptDollars} against a recorded balance of ${enrolledDollars} on ${paymentMethodId} …`,
);

try {
  const outcome = await attemptGuardedLiveDecline({
    paymentMethodId,
    amount: minorUnits(attemptCents),
    enrolledBalance: minorUnits(enrolledCents),
    runId: `live-decline-check-${Date.now()}`,
  });

  if (outcome.ok) {
    // Structurally unreachable — attemptGuardedLiveDecline cancels every authorization it
    // creates — kept as a loud failure rather than silently falling through.
    console.error("UNREACHABLE: the guarded live path returned ok:true. Do not trust this run.");
    process.exit(1);
  }

  console.log(`\n── result ${"─".repeat(50)}`);
  console.log(`  code:    ${outcome.code}`);
  console.log(`  message: ${outcome.message}`);

  if (outcome.code === "unexpectedly_authorized" || outcome.code === "unexpectedly_not_declined") {
    console.error(
      "\nThe card did NOT decline. The authorization was cancelled and nothing was captured, " +
        "but your recorded enrolled balance is wrong for this card — re-enroll with the real " +
        "figure before treating any run as the M5 demo.",
    );
    process.exit(1);
  }

  console.log(
    "\nGenuine issuer decline captured above — this is the M5 demo. Record the decline code " +
      "and this output as the artifact; no money moved (verify in the Stripe dashboard: no " +
      "captured charge, `livemode: true`, PaymentIntent status `canceled`).",
  );
} catch (err) {
  if (err instanceof LiveGuardError) {
    console.error(`\nRefused before touching the network: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
