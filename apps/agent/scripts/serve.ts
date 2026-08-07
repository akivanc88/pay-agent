/**
 * The agent as a service — a tiny HTTP surface the dashboard calls to resume approved runs.
 *
 * The dashboard cannot settle a run itself (only the agent holds the Stripe key and the destination
 * adapters), so approving in the inbox POSTs here. Deliberately minimal — Node's built-in http, one
 * real endpoint — because the interesting logic lives in `resume-service.ts`, not the transport.
 *
 * Usage:  pnpm --filter @pay-agent/agent serve     (listens on AGENT_PORT, default 3002)
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { openConsentStore } from "@pay-agent/db";
import { loadIssuerKey } from "@pay-agent/mandate";

import { BrainSession, drive, selectBrain, type BrainStep, type BrainToolContext } from "../src/brain/index.js";
import { demoWallet, issueDemoCard, stubStreamco, stubWallet } from "../src/brain/demo-support.js";
import type { Funding, PaymentDestination } from "../src/destination.js";
import { resumeAndSettle, resumeEnv } from "../src/resume-service.js";

const PORT = Number(process.env.AGENT_PORT ?? 3002);
const consentPath =
  process.env.CONSENT_DB_PATH ?? join(dirname(fileURLToPath(import.meta.url)), "../../web/.data/consent.db");

const issuerKey = loadIssuerKey();
const env = resumeEnv();

const WEB = process.env.WEB_URL ?? "http://localhost:3001";
const ACCOUNT = "acct_demo";

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * The M4 endpoint: turn a plain-language instruction into a gated, audited run, streaming every beat
 * back to the web console as Server-Sent Events. Runs the *real* end-to-end path when a Stripe test
 * key is configured (fresh bill + fresh gift card + real test-mode card), and an offline stub
 * otherwise — so the console is demoable with or without infra. Either way the brain drives the same
 * consent orchestrator; nothing here can move more than the drafted, signed, gated mandate allows.
 */
async function handleInstruct(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  const instruction = typeof body.instruction === "string" && body.instruction.trim() ? body.instruction.trim() : "Pay my StreamCo bill from my gift card, up to $50";
  const stub = body.stub === true || !env.stripeSecretKey;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const { client, reason } = selectBrain();
  send("meta", { model: client.name, live: client.live, reason, mode: stub ? "stub" : "live" });

  const consent = openConsentStore(consentPath);
  try {
    let destination: PaymentDestination | undefined;
    let wallet: () => Funding;
    if (stub) {
      destination = stubStreamco(4599);
      wallet = () => stubWallet();
    } else {
      await fetch(`${WEB}/api/streamco/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: ACCOUNT }),
      }).catch(() => undefined);
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
    const result = await drive(instruction, client, session, { onStep: (step: BrainStep) => send("step", step) });
    send("done", { final: result.final, runIds: result.runIds, model: result.model, live: result.live });
  } catch (err) {
    send("error", { message: (err as Error).message });
  } finally {
    await consent.close();
    res.end();
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const { client } = selectBrain();
    return json(res, 200, { ok: true, service: "pay-agent", stripe: Boolean(env.stripeSecretKey), brain: client.name, live: client.live });
  }

  if (req.method === "POST" && url.pathname === "/instruct") {
    return handleInstruct(req, res);
  }

  const resume = url.pathname.match(/^\/runs\/([^/]+)\/resume$/);
  if (req.method === "POST" && resume) {
    const runId = decodeURIComponent(resume[1]!);
    // A fresh store handle per request — the file is shared with the dashboard, and a short-lived
    // handle can't go stale under WAL.
    const consent = openConsentStore(consentPath);
    try {
      const result = await resumeAndSettle(runId, consent, issuerKey, env);
      return json(res, result.ok ? 200 : 200, result); // 200 either way; `ok` carries success
    } catch (err) {
      return json(res, 500, { ok: false, status: "error", detail: (err as Error).message });
    } finally {
      await consent.close();
    }
  }

  json(res, 404, { ok: false, detail: "not found" });
});

server.listen(PORT, () => {
  console.log(`pay-agent resume service on http://localhost:${PORT} (stripe: ${Boolean(env.stripeSecretKey)})`);
});
