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
  // Comparing a destination's identity — `.id` or `.destinationId`, with ==, ===, or !== in either
  // order — is the exact smell this forbids. `makeMandate` may *record* `due.destinationId` (an
  // assignment, `:` not a comparison), but the planner must never test it to pick behaviour.
  const idComparison =
    /(?:\.id\b|\.destinationId\b|\bdestinationId\b)\s*(?:===|!==|==(?!=))|(?:===|!==|==(?!=))\s*[\w.]*(?:\.id\b|\.destinationId\b)/;
  assert.doesNotMatch(
    code,
    idComparison,
    "planner.ts must not compare a destination's id — normalize in the adapter instead",
  );
});

test("the planner imports only the contract, so no branch can hide in a helper", () => {
  // A destination-specific branch could hide in a module the planner calls. Whitelisting its local
  // imports to the contract and money shuts that door: it can reach nothing that knows a concrete
  // destination.
  const localImports = [...plannerSrc.matchAll(/from\s+["'](\.[^"']+)["']/g)].map((m) => m[1]);
  const allowed = new Set(["./destination.js", "./money.js"]);
  for (const imp of localImports) {
    assert.ok(allowed.has(imp!), `planner.ts imports "${imp}" — only the contract and money are allowed`);
  }
});
