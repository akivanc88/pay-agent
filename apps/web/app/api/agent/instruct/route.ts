/**
 * A pure streaming proxy from the browser to the agent's `/instruct` endpoint.
 *
 * The brain lives in the agent process — it holds the Stripe key and the destination adapters, which
 * the web app must never import (the agent and the dashboard are separated by HTTP on purpose). So
 * the console POSTs here, and this hands the request straight to the agent and streams the
 * Server-Sent-Events response back untouched. No agent internals cross this boundary; only bytes do.
 */
const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:3002";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine — the agent defaults the instruction */
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}/instruct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // The agent service isn't running. Tell the console in its own SSE dialect so it can show a
    // designed offline state rather than a dead spinner.
    const message = "The agent service isn't reachable. Start it with `pnpm --filter @pay-agent/agent serve`.";
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`event: offline\ndata: ${JSON.stringify({ message })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, { headers: sseHeaders() });
  }

  return new Response(upstream.body, { status: upstream.status, headers: sseHeaders() });
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}
