#!/usr/bin/env bash
# One-command trial: install, build just enough, and run the instruct-to-pay demo — no Stripe key,
# no servers, no network call (the deterministic scripted brain stands in unless OPENAI_API_KEY or
# ANTHROPIC_API_KEY is set). This is the fastest path from "cloned the repo" to "watched a signed,
# gated, audited payment happen." See README.md's "Running it" for the full multi-service demo
# (real storefront, real Stripe test charges, the web approval inbox).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

instruction="${1:-Pay my StreamCo bill from my gift card, up to \$50}"

echo "==> Installing dependencies (skips if already installed)"
pnpm install

echo "==> Building the consent/mandate core"
pnpm --filter @pay-agent/db build
pnpm --filter @pay-agent/mandate build 2>/dev/null || true
pnpm --filter @pay-agent/protocol build 2>/dev/null || true

echo "==> Running the instruct-to-pay demo (offline, stub mode)"
echo
pnpm --filter @pay-agent/agent demo:instruct --stub "$instruction"
