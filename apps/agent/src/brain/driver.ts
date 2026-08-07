/**
 * The brain's reasoning loop — M4.
 *
 * Given a language model (`LlmClient`) and the boxed tool surface (`BrainSession`), this drives the
 * turn-by-turn loop that most people mean by *"an AI agent that pays for you"*: read the human's
 * sentence, draft the standing authorization, hand a reference to the rails, and narrate what the
 * deterministic core did with it. The loop itself holds no payment logic — every consequential action
 * is a tool call executed by `BrainSession`, which is the only thing that can touch the orchestrator.
 *
 * It emits a `BrainStep` for each beat (assistant prose, a tool call and its result, the final word),
 * so a CLI can print the transcript and the web console can stream it as it happens.
 */
import type { LlmClient, LlmMessage } from "./llm.js";
import { BrainSession, brainTools, type ToolTrace } from "./tools.js";

export interface BrainStep {
  readonly kind: "user" | "assistant" | "tool" | "final" | "error";
  /** Prose for user/assistant/final/error steps. */
  readonly text?: string;
  /** The tool call + result for tool steps. */
  readonly tool?: ToolTrace;
}

export interface BrainResult {
  readonly model: string;
  readonly live: boolean;
  readonly steps: BrainStep[];
  /** Runs this conversation started, for linking to the activity timeline. */
  readonly runIds: string[];
  /** The agent's closing message to the user. */
  readonly final: string;
}

export interface DriveOptions {
  /** Cap the tool loop so a confused model cannot spin forever. */
  readonly maxTurns?: number;
  /** Streamed as each step is produced — the console's SSE feed. */
  readonly onStep?: (step: BrainStep) => void;
}

export const BRAIN_SYSTEM_PROMPT = `You are the brain of a payment agent. You turn a person's plain-language instruction into a real payment by calling tools — and only by calling tools. You never move money, hold a card, or construct a charge yourself; a deterministic core does that, boxed by a signed spend cap, a human approval gate, and an append-only audit trail that you cannot bypass.

How you work, in order:
1. If it is not obvious which destination the person means, call list_destinations.
2. Call draft_intent exactly once. Infer the spend cap and the destination allowlist from what the person actually said — "up to $50" is a 5000 cent cap. Do not invent a cap they did not state; if they gave none, use a sensible small one and say so. The core signs this; you only propose it.
3. Call start_run with the destination id and its reference.
4. Read the result and tell the person what happened, in plain language:
   - SETTLED: say what was paid and from which funding (e.g. "$20 from your gift card, $25.99 on your card").
   - PENDING APPROVAL: explain plainly why it paused (over the cap, a destination they hadn't allowed, or an amount that moved) and that it is now waiting in their approval inbox. Do NOT try to force it through — the pause is the safety feature working.
   - FAILED: say it failed, and that any gift-card draw was reversed.

Rules you never break: never invent or guess an amount; never claim a payment settled that did not; talk to the person in dollars, never raw cents; be warm, concise, and exact. Currency is CAD.`;

/** Run one instruction to completion, returning the full transcript. */
export async function drive(
  instruction: string,
  client: LlmClient,
  session: BrainSession,
  options: DriveOptions = {},
): Promise<BrainResult> {
  const maxTurns = options.maxTurns ?? 8;
  const steps: BrainStep[] = [];
  const emit = (step: BrainStep): void => {
    steps.push(step);
    options.onStep?.(step);
  };

  emit({ kind: "user", text: instruction });

  const messages: LlmMessage[] = [
    { role: "system", content: BRAIN_SYSTEM_PROMPT },
    { role: "user", content: instruction },
  ];

  let final = "";
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.complete(messages, brainTools());

    if (response.text.trim()) {
      const isFinal = response.toolCalls.length === 0;
      emit({ kind: isFinal ? "final" : "assistant", text: response.text.trim() });
      if (isFinal) final = response.text.trim();
    }

    messages.push({
      role: "assistant",
      content: response.text,
      toolCalls: response.toolCalls,
    });

    if (response.toolCalls.length === 0) break;

    for (const call of response.toolCalls) {
      const result = await session.execute(call);
      emit({ kind: "tool", tool: result });
      messages.push({ role: "tool", content: result.result, toolCallId: call.id });
    }
  }

  if (!final) {
    // The loop hit its turn cap without a closing message — narrate from what the session did rather
    // than leaving the user with nothing.
    final = fallbackClosing(session);
    emit({ kind: "final", text: final });
  }

  return { model: client.name, live: client.live, steps, runIds: session.startedRuns, final };
}

function fallbackClosing(session: BrainSession): string {
  const runs = session.startedRuns;
  if (runs.length === 0) return "I couldn't complete that — no run was started. Please try rephrasing the instruction.";
  return `I started run ${runs[runs.length - 1]}. Check the activity timeline for exactly what happened.`;
}
