/**
 * The brain's tool surface — the box the language model reasons inside, and the single most important
 * file for the milestone's safety argument (AGENTS.md rule 26; PLAN.md → "The agent is two layers").
 *
 * The model never touches money. It sees ids, amounts and plain-language status — never a credential,
 * never a Stripe key, never the funding wallet, never an instrument charge. All it can do is:
 *
 *   list_destinations   – read what places the agent knows how to reach
 *   draft_intent        – propose a spend cap + destination allowlist from what the human said;
 *                         the deterministic core *signs* the IntentMandate, the model does not
 *   start_run           – hand a reference to the orchestrator, which runs the FULL policy gate
 *   get_run             – read a run's status and why it halted, to narrate it
 *   resume_run          – continue a run a human already approved in the inbox
 *
 * Every one of these is a thin, side-effect-scoped call into the same consent orchestrator the scripted
 * demos use. The spend cap, the signed mandates, the approval gate, the reversal and the append-only
 * trail are all enforced *below* this surface, so a confused or jailbroken model can never move more
 * than the human authorized. Two mechanical belts-and-braces beyond that: `draft_intent` clamps the
 * cap to a hard ceiling the model cannot raise, and `start_run` refuses any destination the agent has
 * no real adapter for.
 */
import type { ConsentStore, Run } from "@pay-agent/db";
import {
  issueIntentMandate,
  type IssuerKey,
  type SignedMandate,
  type IntentClaims,
} from "@pay-agent/mandate";

import type { Funding, PaymentDestination } from "../destination.js";
import { formatMinor } from "../money.js";
import { startRun, resumeRun, type RunOutcome } from "../orchestrator.js";
import { reconstructDestination, type ResumeEnv } from "../resume-service.js";
import type { LlmToolCall, LlmToolDef } from "./llm.js";

/** The destinations the model is allowed to name, with the reference shape each one expects. */
export interface KnownDestination {
  readonly id: string;
  readonly label: string;
  readonly referenceHint: string;
  readonly note: string;
}

export const KNOWN_DESTINATIONS: readonly KnownDestination[] = [
  {
    id: "streamco",
    label: "StreamCo subscription bill",
    referenceHint: "a StreamCo account id, e.g. acct_demo",
    note: "A consumer billing portal with no payment API — the agent must scrape the amount off the page.",
  },
  {
    id: "ucp-storefront",
    label: "the UCP storefront",
    referenceHint: "a checkout-session id from the storefront",
    note: "A spec-native merchant that redeems the gift card itself and returns a machine-readable amount.",
  },
  {
    id: "stripe-payment-link",
    label: "a Stripe payment link",
    referenceHint: "a Stripe payment-link id or URL",
    note: "An external rail: the gift card is drawn on our own ledger, the remainder settled on the card.",
  },
];

/** Everything the tool executor needs — none of which the model ever sees. */
export interface BrainToolContext {
  readonly userId: string;
  readonly consent: ConsentStore;
  readonly issuerKey: IssuerKey;
  readonly env: ResumeEnv;
  /** Produces the funding wallet for a run. Held here, never exposed to the model. */
  readonly wallet: () => Promise<Funding> | Funding;
  /** Hard ceiling on any drafted spend cap — defense in depth against a runaway model. Minor units. */
  readonly maxCapMinor: number;
  /**
   * How a destination id is turned into a live adapter. Defaults to the real
   * {@link reconstructDestination}; tests inject a stub so the boxed surface can be exercised with no
   * network, no Stripe key, and no running servers.
   */
  readonly resolveDestination?: (destinationId: string, env: ResumeEnv) => PaymentDestination | null;
}

/** A structured record of one tool call, for the console to render and the trail to keep. */
export interface ToolTrace {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  /** The plain-text result handed back to the model. */
  readonly result: string;
  /** Structured payload for the UI (a run outcome, a drafted-intent summary, …). */
  readonly data?: Record<string, unknown>;
  readonly ok: boolean;
}

const CURRENCY = "CAD";

/** The tool definitions advertised to whichever model backs the brain. */
export function brainTools(): LlmToolDef[] {
  return [
    {
      name: "list_destinations",
      description:
        "List the places the agent knows how to pay, with the reference each expects. Call this first if you are unsure which destination the user means.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "draft_intent",
      description:
        "Draft the user's standing authorization from what they said: a spend cap and the destinations they allowed. The deterministic core signs this as an IntentMandate — you only propose the numbers. Amounts are integer minor units (cents): $50 = 5000. Call this once, before start_run.",
      parameters: {
        type: "object",
        properties: {
          spendCapMinor: { type: "integer", description: "Spend cap in minor units (cents). $50 = 5000." },
          currency: { type: "string", description: "ISO 4217, e.g. CAD. Defaults to CAD." },
          destinationAllowlist: {
            type: "array",
            items: { type: "string" },
            description: "Destination ids the user pre-authorized (from list_destinations).",
          },
          reason: { type: "string", description: "One short line paraphrasing the user's instruction." },
        },
        required: ["spendCapMinor", "destinationAllowlist"],
        additionalProperties: false,
      },
    },
    {
      name: "start_run",
      description:
        "Begin a payment run against one destination. The orchestrator discovers the amount, runs the full policy gate against the signed IntentMandate, and either settles or halts for human approval. You must call draft_intent first.",
      parameters: {
        type: "object",
        properties: {
          destinationId: { type: "string", description: "One of the ids from list_destinations." },
          reference: { type: "string", description: "The reference for that destination (e.g. acct_demo for StreamCo)." },
        },
        required: ["destinationId", "reference"],
        additionalProperties: false,
      },
    },
    {
      name: "get_run",
      description: "Read a run's current status, amounts, and — if it halted — why, so you can explain it to the user.",
      parameters: {
        type: "object",
        properties: { runId: { type: "string" } },
        required: ["runId"],
        additionalProperties: false,
      },
    },
    {
      name: "resume_run",
      description:
        "Continue a run the user already approved in the inbox. Refuses if no human has granted approval, or if the amount moved after they approved.",
      parameters: {
        type: "object",
        properties: { runId: { type: "string" } },
        required: ["runId"],
        additionalProperties: false,
      },
    },
  ];
}

/** Stateful executor for one brain conversation: holds the drafted intent between tool calls. */
export class BrainSession {
  private intent: SignedMandate<IntentClaims> | null = null;
  private capMinor = 0;
  private readonly runIds = new Set<string>();

  constructor(private readonly ctx: BrainToolContext) {}

  /** The runs this session started — for linking the console to the activity timeline. */
  get startedRuns(): string[] {
    return [...this.runIds];
  }

  /** The signed IntentMandate the model drafted, if any — the console shows exactly what was authorized. */
  get draftedIntent(): SignedMandate<IntentClaims> | null {
    return this.intent;
  }

  async execute(call: LlmToolCall): Promise<ToolTrace> {
    try {
      switch (call.name) {
        case "list_destinations":
          return this.listDestinations(call);
        case "draft_intent":
          return this.draftIntent(call);
        case "start_run":
          return await this.startRunTool(call);
        case "get_run":
          return await this.getRunTool(call);
        case "resume_run":
          return await this.resumeRunTool(call);
        default:
          return trace(call, false, `Unknown tool "${call.name}".`);
      }
    } catch (err) {
      return trace(call, false, `Tool "${call.name}" errored: ${(err as Error).message}`);
    }
  }

  private listDestinations(call: LlmToolCall): ToolTrace {
    const lines = KNOWN_DESTINATIONS.map((d) => `- ${d.id} — ${d.label}. Reference: ${d.referenceHint}. ${d.note}`);
    return trace(call, true, `Destinations the agent can reach:\n${lines.join("\n")}`, {
      destinations: KNOWN_DESTINATIONS,
    });
  }

  private draftIntent(call: LlmToolCall): ToolTrace {
    const currency = typeof call.arguments.currency === "string" ? call.arguments.currency : CURRENCY;
    const requested = Math.max(0, Math.round(Number(call.arguments.spendCapMinor)));
    if (!Number.isFinite(requested) || requested <= 0) {
      return trace(call, false, "spendCapMinor must be a positive integer number of cents.");
    }
    const allowlistRaw = Array.isArray(call.arguments.destinationAllowlist) ? call.arguments.destinationAllowlist : [];
    const allowlist = allowlistRaw.map(String).filter((id) => KNOWN_DESTINATIONS.some((d) => d.id === id));
    if (allowlist.length === 0) {
      return trace(call, false, "destinationAllowlist must name at least one known destination (see list_destinations).");
    }

    // Defense in depth: the model proposes the cap, but it can never exceed the configured ceiling.
    const capMinor = Math.min(requested, this.ctx.maxCapMinor);
    const clamped = capMinor < requested;

    this.intent = issueIntentMandate(
      { userId: this.ctx.userId, spendCapMinor: capMinor, currency, destinationAllowlist: allowlist, ttlSeconds: 3600 },
      this.ctx.issuerKey,
    );
    this.capMinor = capMinor;

    const summary =
      `Signed an IntentMandate: cap ${formatMinor(capMinor, currency)}, allowlist [${allowlist.join(", ")}]` +
      (clamped ? ` (requested ${formatMinor(requested, currency)}, clamped to the ${formatMinor(this.ctx.maxCapMinor, currency)} ceiling)` : "") +
      ". You did not sign it — the core did.";
    return trace(call, true, summary, {
      spendCapMinor: capMinor,
      requestedMinor: requested,
      clamped,
      currency,
      allowlist,
      jti: this.intent.claims.jti,
    });
  }

  private async startRunTool(call: LlmToolCall): Promise<ToolTrace> {
    if (!this.intent) {
      return trace(call, false, "Call draft_intent first — start_run needs a signed IntentMandate to gate against.");
    }
    const destinationId = String(call.arguments.destinationId ?? "");
    const reference = String(call.arguments.reference ?? "");
    if (!reference) return trace(call, false, "start_run needs a reference for the destination.");

    const resolve = this.ctx.resolveDestination ?? reconstructDestination;
    const destination = resolve(destinationId, this.ctx.env);
    if (!destination) {
      return trace(
        call,
        false,
        `No live adapter for "${destinationId}". Known destinations: ${KNOWN_DESTINATIONS.map((d) => d.id).join(", ")}.`,
      );
    }

    const funding = await this.ctx.wallet();
    const outcome = await startRun(
      reference,
      { destination, funding, consent: this.ctx.consent, issuerKey: this.ctx.issuerKey },
      { userId: this.ctx.userId, intent: this.intent },
    );
    this.runIds.add(outcome.run.id);
    return trace(call, true, describeOutcome(outcome), outcomeData(outcome));
  }

  private async getRunTool(call: LlmToolCall): Promise<ToolTrace> {
    const runId = String(call.arguments.runId ?? "");
    const run = await this.ctx.consent.getRun(runId);
    if (!run) return trace(call, false, `No run ${runId}.`);
    const approval = await this.ctx.consent.getApproval(runId);
    const events = await this.ctx.consent.eventsForRun(runId);
    const tail = events.slice(-4).map((e) => `  ${e.summary}`).join("\n");
    const pending =
      approval && approval.status === "pending"
        ? `\nAwaiting your approval — ${approval.detail}`
        : approval && approval.status === "granted"
          ? "\nApproved — ready to resume."
          : "";
    return trace(
      call,
      true,
      `Run ${runId} is "${run.status}" for ${formatMinor(run.amountMinor, run.currency)} at ${run.destinationId}.${pending}\nRecent:\n${tail}`,
      { run: runData(run), approvalStatus: approval?.status ?? null },
    );
  }

  private async resumeRunTool(call: LlmToolCall): Promise<ToolTrace> {
    if (!this.intent) return trace(call, false, "No drafted intent in this session to resume against.");
    const runId = String(call.arguments.runId ?? "");
    const run = await this.ctx.consent.getRun(runId);
    if (!run) return trace(call, false, `No run ${runId}.`);
    const resolve = this.ctx.resolveDestination ?? reconstructDestination;
    const destination = resolve(run.destinationId, this.ctx.env);
    if (!destination) return trace(call, false, `No live adapter for "${run.destinationId}" to resume.`);
    const funding = await this.ctx.wallet();
    const outcome = await resumeRun(
      runId,
      { destination, funding, consent: this.ctx.consent, issuerKey: this.ctx.issuerKey },
      { userId: this.ctx.userId, intent: this.intent },
    );
    return trace(call, true, describeOutcome(outcome), outcomeData(outcome));
  }
}

function trace(call: LlmToolCall, ok: boolean, result: string, data?: Record<string, unknown>): ToolTrace {
  return { name: call.name, arguments: call.arguments, ok, result, ...(data ? { data } : {}) };
}

/** A compact, model-readable description of a run outcome. */
function describeOutcome(outcome: RunOutcome): string {
  const amount = formatMinor(outcome.run.amountMinor, outcome.run.currency);
  switch (outcome.status) {
    case "settled": {
      const gift = outcome.result.giftDrawnMinor ?? 0;
      const card = outcome.result.cardChargedMinor ?? 0;
      const parts: string[] = [];
      if (gift > 0) parts.push(`${formatMinor(gift, outcome.run.currency)} from the gift card`);
      if (card > 0) parts.push(`${formatMinor(card, outcome.run.currency)} on the card`);
      return `SETTLED ${amount} at ${outcome.run.destinationId}${parts.length ? ` — ${parts.join(" + ")}` : ""}. Run ${outcome.run.id}.`;
    }
    case "pending_approval":
      return `PENDING APPROVAL for ${amount} at ${outcome.run.destinationId}: ${outcome.detail}. Nothing was drawn. Run ${outcome.run.id} — tell the user why and that it is waiting in their inbox.`;
    case "denied":
      return `DENIED. The run for ${amount} was refused. Run ${outcome.run.id}.`;
    case "failed":
      return `FAILED to settle ${amount}: ${outcome.result.detail}. Any gift draw was reversed. Run ${outcome.run.id}.`;
  }
}

function outcomeData(outcome: RunOutcome): Record<string, unknown> {
  const base = { status: outcome.status, run: runData(outcome.run) };
  if (outcome.status === "settled") {
    return {
      ...base,
      giftDrawnMinor: outcome.result.giftDrawnMinor ?? 0,
      cardChargedMinor: outcome.result.cardChargedMinor ?? 0,
      confirmed: outcome.confirmation.settled,
    };
  }
  if (outcome.status === "pending_approval") return { ...base, detail: outcome.detail };
  if (outcome.status === "failed") return { ...base, detail: outcome.result.detail, reversed: outcome.result.reversed };
  return base;
}

function runData(run: Run): Record<string, unknown> {
  return {
    id: run.id,
    status: run.status,
    destinationId: run.destinationId,
    reference: run.reference,
    amountMinor: run.amountMinor,
    currency: run.currency,
    description: run.description,
  };
}
