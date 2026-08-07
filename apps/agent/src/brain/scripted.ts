/**
 * The deterministic stand-in for a language model — M4's honesty valve.
 *
 * When no API key is configured, the brain still has to run: for CI (no network), for anyone cloning
 * the repo without an OpenAI or Anthropic key, and for a demo that must never depend on a paid call
 * succeeding. This client satisfies the exact same `LlmClient` interface and drives the exact same
 * tool loop as a real model — it just decides the next step from a few regexes over the instruction
 * instead of by reasoning. It reports `live: false`, so every surface can say plainly that a script,
 * not a model, produced this run. It is a stand-in for the reasoning, never for the payment: the
 * money still moves through the identical signed-mandate, policy-gated, audited rails.
 *
 * It is written to be *history-driven*, exactly like a model: it looks at which tools have already
 * run in the message list and decides what to do next, rather than counting turns.
 */
import { KNOWN_DESTINATIONS } from "./tools.js";
import type { LlmClient, LlmMessage, LlmResponse, LlmToolCall } from "./llm.js";

const DEFAULT_CAP_MINOR = 5000; // $50 — a sensible small cap when the user names none.

/** Build the deterministic brain. `note` is appended to its name for the trail. */
export function scriptedBrain(): LlmClient {
  let counter = 0;
  const nextId = (): string => `call_${++counter}`;

  return {
    name: "scripted",
    live: false,
    async complete(messages: readonly LlmMessage[]): Promise<LlmResponse> {
      const instruction = firstUserText(messages);
      const called = toolNamesCalled(messages);

      // 1. Draft the standing authorization from the instruction.
      if (!called.has("draft_intent")) {
        const plan = parseInstruction(instruction);
        const call: LlmToolCall = {
          id: nextId(),
          name: "draft_intent",
          arguments: {
            spendCapMinor: plan.capMinor,
            currency: "CAD",
            destinationAllowlist: [plan.destinationId],
            reason: plan.reason,
          },
        };
        return { text: "", toolCalls: [call] };
      }

      // 2. Start the run against the inferred destination.
      if (!called.has("start_run")) {
        const plan = parseInstruction(instruction);
        const call: LlmToolCall = {
          id: nextId(),
          name: "start_run",
          arguments: { destinationId: plan.destinationId, reference: plan.reference },
        };
        return { text: "", toolCalls: [call] };
      }

      // 3. Narrate the outcome from the last tool result — no more tool calls. We render amounts as
      // "$45.99" to match the console's Money primitive, rather than the ledger's "CAD 45.99".
      return { text: dollarize(narrate(lastToolResult(messages))), toolCalls: [] };
    },
  };
}

interface ParsedInstruction {
  readonly capMinor: number;
  readonly destinationId: string;
  readonly reference: string;
  readonly reason: string;
}

/** Pull a spend cap, a destination and a reference out of a plain-language instruction. */
export function parseInstruction(instruction: string): ParsedInstruction {
  const capMinor = parseCap(instruction);
  const { destinationId, reference } = parseDestination(instruction);
  return { capMinor, destinationId, reference, reason: instruction.trim().slice(0, 120) };
}

function parseCap(text: string): number {
  const m = text.match(/(?:up to|under|below|no more than|max(?:imum)?(?:\s+of)?|cap(?:ped)?(?:\s+at)?)\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (m) return dollarsToMinor(m[1]!);
  // A bare "$45" with no qualifier is treated as a cap too, so "pay my $50 bill" is bounded.
  const bare = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (bare) return dollarsToMinor(bare[1]!);
  return DEFAULT_CAP_MINOR;
}

function dollarsToMinor(raw: string): number {
  const dollars = Number(raw.replace(/,/g, ""));
  return Math.round(dollars * 100);
}

function parseDestination(text: string): { destinationId: string; reference: string } {
  const t = text.toLowerCase();
  if (/stream\s?co|streamco|netflix|disney|subscription|\bstreaming\b|\bbill\b/.test(t)) {
    const acct = text.match(/\bacct[_-]?\w+/i)?.[0]?.replace("-", "_");
    return { destinationId: "streamco", reference: acct ?? "acct_demo" };
  }
  if (/payment link|stripe link|\blink\b/.test(t)) {
    const url = text.match(/https?:\/\/\S+/)?.[0] ?? text.match(/\bplink_\w+/i)?.[0] ?? "";
    return { destinationId: "stripe-payment-link", reference: url };
  }
  if (/store|storefront|\bcart\b|checkout|flower|bouquet|order/.test(t)) {
    const cs = text.match(/\bcs_\w+/i)?.[0] ?? text.match(/\bcheckout[_-]?\w+/i)?.[0] ?? "";
    return { destinationId: "ucp-storefront", reference: cs };
  }
  // Default to the marquee destination — a StreamCo bill — which needs no external reference.
  return { destinationId: "streamco", reference: "acct_demo" };
}

/** Turn a tool's compact status line into a warm, user-facing closing message. */
function narrate(result: string): string {
  const amount = result.match(/(?:[A-Z]{3}\s+|\$)[\d,]+\.\d{2}/)?.[0] ?? "the amount";

  const place = destName(result.match(/at\s+([\w-]+)/)?.[1] ?? "");

  if (/^SETTLED/.test(result)) {
    const split = result.match(/—\s*(.+?)\.\s*Run/)?.[1];
    return split
      ? `Done — I paid ${place} of ${amount}: ${humaniseSplit(split)}. You can see the full run in your activity timeline.`
      : `Done — I paid ${place} of ${amount} from your gift card. The full run is in your activity timeline.`;
  }
  if (/^PENDING APPROVAL/.test(result)) {
    const detail = result.match(/:\s*(.+?)\.\s*Nothing was drawn/)?.[1] ?? "it needs a closer look";
    return `I paused before paying anything — ${place} is ${amount}, but ${detail}. It's now in your approval inbox; approve it there and I'll finish. Nothing has been drawn.`;
  }
  if (/^FAILED/.test(result)) {
    return `That didn't go through — the payment for ${amount} failed and any gift-card draw was reversed, so your balance is exactly as it was. Nothing is owed on our side.`;
  }
  if (/^DENIED/.test(result)) {
    return `That run was denied, so nothing was paid.`;
  }
  return `I've recorded what happened — see the activity timeline for the details.`;
}

/** Render the ledger's "CAD 45.99" as "$45.99" for user-facing prose. */
function dollarize(text: string): string {
  return text.replace(/CAD\s+(?=\d)/g, () => "$");
}

function humaniseSplit(split: string): string {
  return split
    .replace(/from the gift card/g, "from your gift card")
    .replace(/on the card/g, "on your card");
}

function destName(id: string): string {
  if (id === "streamco") return "your StreamCo bill";
  const known = KNOWN_DESTINATIONS.find((d) => d.id === id);
  return known ? known.label : "the destination";
}

function firstUserText(messages: readonly LlmMessage[]): string {
  return messages.find((m) => m.role === "user")?.content ?? "";
}

function toolNamesCalled(messages: readonly LlmMessage[]): Set<string> {
  const names = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls) {
      for (const c of m.toolCalls) names.add(c.name);
    }
  }
  return names;
}

function lastToolResult(messages: readonly LlmMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "tool") return messages[i]!.content;
  }
  return "";
}
