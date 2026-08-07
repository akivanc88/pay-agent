/**
 * Anthropic (Claude) backend for the brain — the model PLAN.md names for M4.
 *
 * The plan's M4 says "a language model (Claude, via the Anthropic SDK)"; this keeps that path a
 * drop-in even though the current environment leans on OpenAI. Like the OpenAI backend it is
 * dependency-free, speaking the Messages HTTP API directly. Reads `ANTHROPIC_API_KEY`; the model is
 * `ANTHROPIC_MODEL` or a sensible default.
 *
 * The Messages API is block-structured rather than flat, so this translates the brain's flat message
 * list into content blocks: assistant tool calls become `tool_use` blocks, and the run of tool
 * results that answers them is merged into a single `user` turn of `tool_result` blocks.
 */
import type { LlmClient, LlmMessage, LlmResponse, LlmToolCall, LlmToolDef } from "./llm.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";

export interface AnthropicOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
}

export function anthropicBrain(opts: AnthropicOptions): LlmClient {
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
  const url = opts.baseUrl ?? ENDPOINT;
  return {
    name: `anthropic:${model}`,
    live: true,
    async complete(messages: readonly LlmMessage[], tools: readonly LlmToolDef[]): Promise<LlmResponse> {
      const system = messages.find((m) => m.role === "system")?.content ?? "";
      const body = {
        model,
        max_tokens: 1024,
        system,
        messages: toAnthropicMessages(messages),
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 500)}`);
      }
      const data = (await res.json()) as AnthropicResponse;
      let text = "";
      const toolCalls: LlmToolCall[] = [];
      for (const block of data.content ?? []) {
        if (block.type === "text" && block.text) text += block.text;
        if (block.type === "tool_use" && block.id && block.name) {
          toolCalls.push({ id: block.id, name: block.name, arguments: (block.input ?? {}) as Record<string, unknown> });
        }
      }
      return { text, toolCalls };
    },
  };
}

/** Translate the flat message list into Anthropic's block-structured user/assistant turns. */
function toAnthropicMessages(messages: readonly LlmMessage[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      out.push({ role: "user", content: [{ type: "text", text: m.content }] });
    } else if (m.role === "assistant") {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) content.push({ type: "tool_use", id: c.id, name: c.name, input: c.arguments });
      out.push({ role: "assistant", content });
    } else if (m.role === "tool") {
      // Merge a run of tool results into the trailing user turn, as the Messages API expects.
      const block = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content };
      const last = out[out.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content) && isToolResultTurn(last.content)) {
        (last.content as Array<Record<string, unknown>>).push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    }
  }
  return out;
}

function isToolResultTurn(content: unknown[]): boolean {
  return content.every((b) => typeof b === "object" && b !== null && (b as { type?: string }).type === "tool_result");
}

interface AnthropicResponse {
  readonly content?: ReadonlyArray<{
    readonly type: string;
    readonly text?: string;
    readonly id?: string;
    readonly name?: string;
    readonly input?: unknown;
  }>;
}
