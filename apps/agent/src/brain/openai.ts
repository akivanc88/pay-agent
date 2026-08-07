/**
 * OpenAI backend for the brain — M4's primary live model.
 *
 * Deliberately dependency-free: it speaks the Chat Completions HTTP API directly with the global
 * `fetch`, the same discipline the rest of this repo follows (the mandate package signs with Node
 * crypto and no `jose`). That keeps the brain provider-agnostic and installable with nothing extra.
 *
 * Reads `OPENAI_API_KEY`; the model is `OPENAI_MODEL` or a sensible default. Only constructed when a
 * key is present, so the scripted path never reaches this file.
 */
import type { LlmClient, LlmMessage, LlmResponse, LlmToolCall, LlmToolDef } from "./llm.js";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

export interface OpenAiOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
}

export function openAiBrain(opts: OpenAiOptions): LlmClient {
  const model = opts.model ?? process.env.OPENAI_MODEL ?? "gpt-4o";
  const url = opts.baseUrl ?? ENDPOINT;
  return {
    name: `openai:${model}`,
    live: true,
    async complete(messages: readonly LlmMessage[], tools: readonly LlmToolDef[]): Promise<LlmResponse> {
      const body = {
        model,
        messages: messages.map(toOpenAiMessage),
        tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
        tool_choice: "auto",
        temperature: 0.2,
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 500)}`);
      }
      const data = (await res.json()) as OpenAiCompletion;
      const message = data.choices?.[0]?.message;
      const toolCalls: LlmToolCall[] = (message?.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.function.name,
        arguments: parseArgs(c.function.arguments),
      }));
      return { text: message?.content ?? "", toolCalls };
    },
  };
}

function toOpenAiMessage(m: LlmMessage): Record<string, unknown> {
  if (m.role === "tool") {
    return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
  }
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.arguments) },
      })),
    };
  }
  return { role: m.role, content: m.content };
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

interface OpenAiCompletion {
  readonly choices?: ReadonlyArray<{
    readonly message?: {
      readonly content?: string | null;
      readonly tool_calls?: ReadonlyArray<{ readonly id: string; readonly function: { readonly name: string; readonly arguments: string } }>;
    };
  }>;
}
