/**
 * The provider-agnostic language-model interface — M4.
 *
 * The "brain" (see `driver.ts`) turns a human sentence into a payment run by reasoning in a loop and
 * calling tools. It must not care *which* model does that reasoning: OpenAI, Anthropic, or a
 * deterministic scripted stand-in when no key is present all satisfy the same shape. Keeping the
 * driver behind this interface is what lets the whole milestone be exercised in CI with no network
 * and no API key, while a real model drops in the moment one is configured.
 *
 * This is deliberately the *smallest* useful surface: one `complete(messages, tools)` call that
 * returns either assistant prose, a set of tool calls, or both. Streaming, images and the rest of a
 * vendor SDK are out of scope — the brain only needs turn-based tool-calling.
 */

/** A tool the model may call, described as JSON Schema. Mirrors both vendors' function shape. */
export interface LlmToolDef {
  readonly name: string;
  readonly description: string;
  /** JSON Schema for the arguments object. */
  readonly parameters: Record<string, unknown>;
}

/** One tool invocation the model asked for. `arguments` is already parsed from the wire JSON. */
export interface LlmToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

/**
 * One turn in the conversation. `tool` messages carry a tool result back to the model, keyed to the
 * `toolCallId` the model used; `assistant` messages may carry `toolCalls` it decided to make.
 */
export interface LlmMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  /** Present on an assistant turn that requested tools. */
  readonly toolCalls?: readonly LlmToolCall[];
  /** Present on a tool-result turn: which call this answers. */
  readonly toolCallId?: string;
}

/** What the model returned for one `complete` call. */
export interface LlmResponse {
  /** Assistant prose, if any (a turn may be tool-calls only). */
  readonly text: string;
  /** Tool calls the model wants executed before it continues. */
  readonly toolCalls: readonly LlmToolCall[];
}

/**
 * A language model the brain can drive. `live` is the honesty flag the whole project turns on: a
 * scripted stand-in reports `live: false`, so every surface that shows the brain can state plainly
 * whether a real model reasoned or a deterministic script did.
 */
export interface LlmClient {
  /** A stable label for the trail, e.g. `"openai:gpt-4o"` or `"scripted"`. */
  readonly name: string;
  /** True only when a real model is behind this — false for the deterministic stand-in. */
  readonly live: boolean;
  complete(messages: readonly LlmMessage[], tools: readonly LlmToolDef[]): Promise<LlmResponse>;
}
