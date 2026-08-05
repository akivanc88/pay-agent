/**
 * The planner-independence test.
 *
 * The whole architectural claim of M2 is that one planner pays every destination without ever
 * branching on which destination it is — the adapters absorb every difference. That claim is easy
 * to assert in prose and easy to quietly break with one `if (dest.id === …)`. So this asserts it
 * against the source: the planner must not import a concrete adapter, must not name one, and must
 * not carry a destination id. If a future change reaches for a destination-specific shortcut, this
 * test fails before the shortcut ships.
 *
 * (The *functional* counterpart — the same planner actually settling both a storefront split and an
 * external-rail split — is `scripts/demo.ts both`, which needs the live store and Stripe.)
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const plannerSrc = readFileSync(join(here, "../src/planner.ts"), "utf8");

/** Concrete destinations that exist today. The planner must know none of them by name. */
const DESTINATION_IDS = ["ucp-storefront", "stripe-payment-link"];
/** Words that would betray a destination-specific branch even without the exact id. */
const DESTINATION_WORDS = ["storefront", "paymentLink", "payment-link", "stripe", "ucp", "plink"];

test("the planner imports no concrete adapter", () => {
  // Strip comments so prose that merely *describes* the adapters doesn't trip the check.
  const code = plannerSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(
    code,
    /from\s+["'][^"']*adapters\//,
    "planner.ts must not import anything from ./adapters — it only ever sees PaymentDestination",
  );
});

test("the planner names no concrete destination", () => {
  const code = plannerSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const id of DESTINATION_IDS) {
    assert.ok(!code.includes(id), `planner code must not mention the destination id "${id}"`);
  }
  for (const word of DESTINATION_WORDS) {
    assert.ok(
      !new RegExp(`\\b${word}\\b`, "i").test(code),
      `planner code must not mention "${word}" — that would be branching on destination identity`,
    );
  }
});

test("the planner branches on capabilities, not on destination id", () => {
  const code = plannerSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // Reading `.id` off a destination to *decide behaviour* is the exact smell this forbids. The
  // planner may pass a destination around, but it must not compare its id.
  assert.doesNotMatch(
    code,
    /\.id\s*===|===\s*[^;]*\.id|\.id\s*==[^=]/,
    "planner.ts must not compare a destination's id — normalize in the adapter instead",
  );
});
