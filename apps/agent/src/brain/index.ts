/**
 * The brain — M4. Public surface, plus the one decision that picks a backend.
 *
 * `selectBrain` is the whole "which model" policy in one place: a real model if a key is configured
 * (OpenAI first, since that is what this environment uses; Anthropic if that key is the one present,
 * matching PLAN.md's wording), otherwise the deterministic scripted stand-in. It returns *why* it
 * chose, so every surface can state honestly whether a live model or a script produced a run.
 */
export * from "./llm.js";
export * from "./tools.js";
export * from "./driver.js";
export { scriptedBrain, parseInstruction } from "./scripted.js";
export { openAiBrain } from "./openai.js";
export { anthropicBrain } from "./anthropic.js";

import type { LlmClient } from "./llm.js";
import { scriptedBrain } from "./scripted.js";
import { openAiBrain } from "./openai.js";
import { anthropicBrain } from "./anthropic.js";

export interface BrainSelection {
  readonly client: LlmClient;
  /** Human-readable reason for the choice, for the trail and the console. */
  readonly reason: string;
}

/** Pick a backend from the environment. Never throws — always yields a working client. */
export function selectBrain(env: NodeJS.ProcessEnv = process.env): BrainSelection {
  if (env.OPENAI_API_KEY) {
    return { client: openAiBrain({ apiKey: env.OPENAI_API_KEY }), reason: "OPENAI_API_KEY present" };
  }
  if (env.ANTHROPIC_API_KEY) {
    return { client: anthropicBrain({ apiKey: env.ANTHROPIC_API_KEY }), reason: "ANTHROPIC_API_KEY present" };
  }
  return {
    client: scriptedBrain(),
    reason: "no OPENAI_API_KEY or ANTHROPIC_API_KEY — using the deterministic scripted brain (not a real model)",
  };
}
