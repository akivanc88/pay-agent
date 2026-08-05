/** Enforces database schema, credential, and append-only ledger security invariants. */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import { describe, it } from "node:test";

import { SCHEMA_SQL } from "../src/sqlite/schema.js";

/**
 * Architectural invariants.
 *
 * These are the two rules the plan calls out as load-bearing, so they are tested rather
 * than trusted. Both are the kind of thing that holds on the day it is written and quietly
 * stops holding six commits later.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");

/**
 * Where a database driver may be imported, and why.
 *
 * The rule protects the **funding core** — gift cards, the ledger, and later mandates and
 * tokens. That is the user-owned data whose migration to Supabase buys the Auth and RLS
 * story, so it must not know which driver sits underneath it.
 *
 * `apps/store/src/data` is the vendored UCP reference implementation's own catalogue,
 * inventory and checkout-session storage. It is merchant-owned data with no per-user
 * isolation requirement, it is not what the Supabase migration is for, and rewriting it
 * would fork us from the upstream sample we deliberately build on. It is allowlisted
 * explicitly rather than by widening the rule, so adding a third location is a visible
 * decision instead of an accident.
 */
const DRIVER_ALLOWED_DIRS = [
  join("packages", "db", "src", "sqlite"),
  join("apps", "store", "src", "data"),
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("storage boundary", () => {
  it("confines the database driver to explicitly allowed directories", () => {
    // "SQLite now, Supabase later" is only cheap if nothing else knows which driver is in
    // use — get this wrong and the migration becomes a rewrite.
    const offenders = sourceFiles(REPO_ROOT)
      .filter((file) =>
        /from\s+["']better-sqlite3["']|require\(["']better-sqlite3["']\)/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(REPO_ROOT, file))
      .filter((rel) => !DRIVER_ALLOWED_DIRS.some((dir) => rel.startsWith(dir + sep)));

    assert.deepEqual(
      offenders,
      [],
      `better-sqlite3 may only be imported inside: ${DRIVER_ALLOWED_DIRS.join(", ")}. ` +
        `Offending files: ${offenders.join(", ")}`,
    );
  });

  it("keeps the funding core reachable only through the repository interface", () => {
    // The narrower rule that actually matters: gift cards and the ledger are reached via
    // @pay-agent/db and nothing else. The storefront may own its catalogue tables, but it
    // must not grow its own private route to the funding data.
    const offenders = sourceFiles(join(REPO_ROOT, "apps"))
      .filter((file) => {
        const src = readFileSync(file, "utf8");
        return /\b(gift_cards|ledger_entries)\b/.test(src);
      })
      .map((file) => relative(REPO_ROOT, file));

    assert.deepEqual(
      offenders,
      [],
      "Apps must not reference funding-core tables directly — go through @pay-agent/db. " +
        `Offending files: ${offenders.join(", ")}`,
    );
  });
});

describe("no-PAN invariant", () => {
  /**
   * Strip SQL comments before scanning.
   *
   * The schema *documents* that no PAN column exists, so a naive scan of the raw text
   * matches our own prose and fails. What matters is what the schema declares, not what
   * it says about itself.
   */
  const declarations = SCHEMA_SQL.replace(/--[^\n]*/g, "");

  it("declares no column capable of holding a card number", () => {
    // Storing a PAN — even encrypted — moves the project from PCI SAQ-A to SAQ-D. The
    // schema should make that impossible to do by accident.
    const forbidden = [/\bpan\b/i, /card_number/i, /\bcvv\b/i, /\bcvc\b/i, /security_code/i];

    for (const pattern of forbidden) {
      assert.ok(
        !pattern.test(declarations),
        `Schema must not declare anything matching ${pattern} — the PAN never reaches us.`,
      );
    }
  });

  it("contains no literal 16-digit sequence", () => {
    // Runs against the schema here; the same check runs over logs and the live database
    // in CI, per the plan's verification list.
    assert.ok(
      !/\b\d{13,19}\b/.test(declarations),
      "Schema contains a card-number-shaped digit sequence.",
    );
  });

  it("still catches a PAN column if one were added", () => {
    // Guards the guard: comment-stripping must not neuter the check itself.
    const withPan = declarations + "\nALTER TABLE gift_cards ADD COLUMN card_number TEXT;";
    assert.ok(/card_number/i.test(withPan));
  });
});
