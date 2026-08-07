/**
 * The M4 marquee: instruct-to-pay. A human sentence becomes a real, gated, audited payment run.
 *
 *   pnpm --filter @pay-agent/agent demo:instruct "Pay my StreamCo bill from my gift card, up to $50"
 *   pnpm --filter @pay-agent/agent demo:instruct --stub "Pay my StreamCo bill, up to $20"   # offline
 *   pnpm --filter @pay-agent/agent demo:instruct --auto-approve "…up to $20"                # full loop
 *
 * The brain (a real model when OPENAI_API_KEY / ANTHROPIC_API_KEY is set, otherwise the deterministic
 * scripted stand-in) reads the instruction, drafts the signed IntentMandate, and calls the
 * orchestrator's start_run / resume_run *as tools*. It never moves money itself — the same policy
 * gate, signed mandates, scoped token, reversal and append-only trail that gate every scripted run
 * gate this one. `--stub` swaps StreamCo for an in-process stub so the whole thing runs with no
 * servers and no Stripe key; the default is the real end-to-end run and needs both servers + a test key.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { openConsentStore } from "@pay-agent/db";
import { loadIssuerKey } from "@pay-agent/mandate";

import {
  BrainSession,
  drive,
  selectBrain,
  type BrainStep,
  type BrainToolContext,
} from "../src/brain/index.js";
import { demoWallet, issueDemoCard, stubStreamco, stubWallet } from "../src/brain/demo-support.js";
import type { Funding, PaymentDestination } from "../src/destination.js";
import { resumeEnv } from "../src/resume-service.js";

const WEB = process.env.WEB_URL ?? "http://localhost:3001";
const ACCOUNT = "acct_demo";
const here = dirname(fileURLToPath(import.meta.url));
const consentPath = process.env.CONSENT_DB_PATH ?? join(here, "../../web/.data/consent.db");

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string): string => `\x1b[36m${s}\x1b[0m`;
const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
/** Render the ledger's "CAD 45.99" as "$45.99" for the transcript, matching the web console. */
const dollarize = (s: string): string => s.replace(/CAD\s+(?=\d)/g, () => "$");

function printStep(step: BrainStep): void {
  switch (step.kind) {
    case "user":
      console.log(`\n${bold("You:")} ${step.text}`);
      break;
    case "assistant":
      if (step.text) console.log(`${dim("(thinking)")} ${step.text}`);
      break;
    case "tool":
      if (step.tool) {
        const mark = step.tool.ok ? green("→") : "\x1b[31m→\x1b[0m";
        console.log(`  ${mark} ${cyan(step.tool.name)}${argHint(step.tool.name, step.tool.arguments)}`);
        for (const line of dollarize(step.tool.result).split("\n")) console.log(`      ${dim(line)}`);
      }
      break;
    case "final":
      console.log(`\n${bold("Agent:")} ${step.text}`);
      break;
    case "error":
      console.log(`\n\x1b[31mError:\x1b[0m ${step.text}`);
      break;
  }
}

function argHint(name: string, args: Record<string, unknown>): string {
  if (name === "draft_intent") return dim(`  cap=${args.spendCapMinor} allow=${JSON.stringify(args.destinationAllowlist)}`);
  if (name === "start_run") return dim(`  ${args.destinationId} · ${args.reference}`);
  return "";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const stub = args.includes("--stub");
  const autoApprove = args.includes("--auto-approve");
  const instruction = args.filter((a) => !a.startsWith("--")).join(" ") || "Pay my StreamCo bill from my gift card, up to $50";

  const key = process.env.STRIPE_SECRET_KEY;
  if (!stub && !key) throw new Error("STRIPE_SECRET_KEY not set — run with --stub for an offline demo, or set a test key and start both servers.");

  const { client, reason } = selectBrain();
  console.log(bold("\npay-agent — instruct to pay"));
  console.log(dim(`brain: ${client.name} (${client.live ? "real model" : "scripted stand-in"}) — ${reason}`));
  console.log(dim(stub ? "mode: --stub (in-process StreamCo, no settlement)" : "mode: live end-to-end (StreamCo scrape + real test-mode card)"));

  const issuerKey = loadIssuerKey();
  const consent = openConsentStore(consentPath);
  const env = resumeEnv();

  let destination: PaymentDestination | undefined;
  let wallet: () => Funding;

  if (stub) {
    destination = stubStreamco(4599);
    wallet = () => stubWallet();
  } else {
    // Fresh bill + a fresh $20 gift card, exactly like demo:streamco.
    await fetch(`${WEB}/api/streamco/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: ACCOUNT }) });
    const gift = issueDemoCard(20);
    wallet = () => demoWallet(gift);
  }

  const ctx: BrainToolContext = {
    userId: "demo-user",
    consent,
    issuerKey,
    env,
    wallet,
    maxCapMinor: Number(process.env.BRAIN_MAX_CAP_MINOR ?? 20000),
    ...(destination ? { resolveDestination: (id: string) => (id === destination!.id ? destination! : null) } : {}),
  };

  const session = new BrainSession(ctx);
  const result = await drive(instruction, client, session, { onStep: printStep });

  // If it halted for approval and --auto-approve is set, play the human's part and resume.
  if (autoApprove) {
    for (const runId of result.runIds) {
      const approval = await consent.getApproval(runId);
      if (approval && approval.status === "pending") {
        console.log(dim(`\n[--auto-approve] granting approval for ${runId} as a stand-in for the human in the inbox…`));
        await consent.decideApproval(runId, "granted", "demo-user (auto)");
        await consent.setRunStatus(runId, "approved");
        const session2 = new BrainSession(ctx);
        // Re-drafting the intent for the resume session, then resuming the same run.
        await session2.execute({ id: "d", name: "draft_intent", arguments: { spendCapMinor: 20000, destinationAllowlist: ["streamco"] } });
        const trace = await session2.execute({ id: "r", name: "resume_run", arguments: { runId } });
        console.log(`  ${green("→")} ${cyan("resume_run")}`);
        for (const line of trace.result.split("\n")) console.log(`      ${dim(line)}`);
      }
    }
  }

  console.log(dim(`\nRuns: ${result.runIds.join(", ") || "(none)"} — see ${WEB}/activity`));
  await consent.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
