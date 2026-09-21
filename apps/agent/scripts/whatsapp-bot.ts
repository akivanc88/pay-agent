/**
 * Chat-based approval, WhatsApp edition — gated to paying pay-agent Cloud tenants.
 *
 * Same shape as `telegram-bot.ts` / `slack-bot.ts`: poll `listApprovals("pending")`, push an
 * Approve/Deny card, and on tap call the same decide endpoint the web `/activity` inbox's buttons
 * call. What's different, deliberately:
 *
 *  - It refuses to run unless the configured pay-agent Cloud tenant is on the "pro" plan
 *    (`GET /v1/entitlements`) — the WhatsApp Business API needs Meta Business verification and has
 *    real per-message cost, unlike Telegram/Slack, so this channel is the one paid-tier lever
 *    described in `docs/PLAN.md`'s Cloud offering (see `pay-agent-cloud`'s README "Plans" section).
 *  - WhatsApp's Cloud API has no long-polling/Socket-Mode equivalent for receiving a button tap —
 *    Meta requires a registered, public HTTPS webhook. So this runs its own tiny HTTP server for
 *    the webhook (verification handshake + inbound events) alongside the same polling loop the
 *    other two channels use to *discover* new pending approvals.
 *
 * Usage:  pnpm --filter @pay-agent/agent whatsapp-bot
 * Needs:
 *   PAY_AGENT_CLOUD_URL, PAY_AGENT_CLOUD_API_KEY — to check the pro-plan entitlement
 *   WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID — Meta Cloud API credentials
 *   WHATSAPP_TO — the E.164 number to notify (a single-recipient demo, like the Telegram/Slack chat id)
 *   WHATSAPP_VERIFY_TOKEN — the token Meta's webhook verification handshake checks
 *   WHATSAPP_WEBHOOK_PORT — where this app's webhook server listens (default 3030); must be
 *     reachable at a public HTTPS URL registered in the Meta App dashboard for buttons to work
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { openConsentStore, type PendingApproval } from "@pay-agent/db";

const CLOUD_URL = process.env.PAY_AGENT_CLOUD_URL;
const CLOUD_API_KEY = process.env.PAY_AGENT_CLOUD_API_KEY;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TO = process.env.WHATSAPP_TO;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "dev-verify-token-change-me";
const WEBHOOK_PORT = Number(process.env.WHATSAPP_WEBHOOK_PORT ?? 3030);
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3001";
const POLL_MS = Number(process.env.WHATSAPP_POLL_MS ?? 4000);
const consentPath =
  process.env.CONSENT_DB_PATH ?? join(dirname(fileURLToPath(import.meta.url)), "../../web/.data/consent.db");

async function requireProPlan(): Promise<void> {
  if (!CLOUD_URL || !CLOUD_API_KEY) {
    console.error(
      "whatsapp-bot: PAY_AGENT_CLOUD_URL and PAY_AGENT_CLOUD_API_KEY are required — the WhatsApp " +
        "channel is a pay-agent Cloud pro-plan feature, not a free one (Meta Business verification + " +
        "per-message cost). Sign up for pay-agent Cloud to get a tenant API key.",
    );
    process.exit(1);
  }
  const res = await fetch(`${CLOUD_URL}/v1/entitlements`, { headers: { Authorization: `Bearer ${CLOUD_API_KEY}` } });
  const entitlements = (await res.json().catch(() => null)) as { plan?: string; whatsappApproval?: boolean } | null;
  if (!res.ok || !entitlements?.whatsappApproval) {
    console.error(
      `whatsapp-bot: this tenant's plan (${entitlements?.plan ?? "unknown"}) does not include the ` +
        "WhatsApp approval channel — upgrade to pro on pay-agent Cloud first.",
    );
    process.exit(1);
  }
  console.log("whatsapp-bot: pro-plan entitlement confirmed, starting.");
}

if (!ACCESS_TOKEN || !PHONE_NUMBER_ID || !TO) {
  console.error("whatsapp-bot: set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TO (from the Meta Cloud API).");
  process.exit(1);
}

function formatAmount(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

const GRAPH = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

async function sendApprovalCard(pending: PendingApproval): Promise<void> {
  const { run, approval } = pending;
  const body =
    `Approval needed\n${run.description}\n\n` +
    `Amount: ${formatAmount(run.amountMinor, run.currency)}\n` +
    `Destination: ${run.destinationId}\n` +
    `Why: ${approval.reasons.join(", ")} — ${approval.detail}`;

  await fetch(GRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: TO,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: [
            { type: "reply", reply: { id: `approve:${run.id}`, title: "Approve" } },
            { type: "reply", reply: { id: `deny:${run.id}`, title: "Deny" } },
          ],
        },
      },
    }),
  });
}

async function sendText(text: string): Promise<void> {
  await fetch(GRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to: TO, type: "text", text: { body: text } }),
  });
}

/** The same decision path the web inbox's approve/deny buttons call — see `apps/web/app/api/consent/approvals/[runId]/route.ts`. */
async function decide(runId: string, decision: "granted" | "denied"): Promise<{ ok: boolean; status: string; settle: unknown }> {
  const res = await fetch(`${WEB_URL}/api/consent/approvals/${encodeURIComponent(runId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, by: "whatsapp" }),
  });
  return (await res.json()) as { ok: boolean; status: string; settle: unknown };
}

interface WhatsAppWebhookBody {
  readonly entry?: ReadonlyArray<{
    readonly changes?: ReadonlyArray<{
      readonly value?: {
        readonly messages?: ReadonlyArray<{
          readonly interactive?: { readonly button_reply?: { readonly id?: string } };
        }>;
      };
    }>;
  }>;
}

async function handleWebhookEvent(body: WhatsAppWebhookBody): Promise<void> {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        const buttonId = message.interactive?.button_reply?.id;
        if (!buttonId) continue;
        const [action, runId] = buttonId.split(":");
        if ((action !== "approve" && action !== "deny") || !runId) continue;
        const decision = action === "approve" ? "granted" : "denied";
        try {
          const result = await decide(runId, decision);
          const verb = decision === "granted" ? "Approved" : "Denied";
          const settleNote = decision === "granted" && result.settle ? ` — ${JSON.stringify(result.settle)}` : "";
          await sendText(`${verb} run ${runId}${settleNote}`);
        } catch (err) {
          console.error("whatsapp-bot: decide failed:", (err as Error).message);
        }
      }
    }
  }
}

/** Meta's webhook: a GET verification handshake, then POST events for every inbound message (including button taps). */
function runWebhookServer(): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${WEBHOOK_PORT}`);
    if (req.method === "GET" && url.pathname === "/webhooks/whatsapp") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end(challenge);
      }
      res.writeHead(403);
      return res.end();
    }
    if (req.method === "POST" && url.pathname === "/webhooks/whatsapp") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        res.writeHead(200);
        res.end();
        void handleWebhookEvent(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as WhatsAppWebhookBody);
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(WEBHOOK_PORT, () => {
    console.log(`whatsapp-bot: webhook listening on http://localhost:${WEBHOOK_PORT}/webhooks/whatsapp (needs a public HTTPS tunnel registered with Meta)`);
  });
}

/** Poll the consent store for newly pending approvals and push a card for each one, once. */
async function pollApprovals(): Promise<void> {
  const consent = openConsentStore(consentPath);
  const notified = new Set<string>();
  console.log(`whatsapp-bot: watching ${consentPath} for pending approvals every ${POLL_MS}ms`);
  for (;;) {
    try {
      const pending = await consent.listApprovals("pending");
      for (const p of pending) {
        if (notified.has(p.run.id)) continue;
        notified.add(p.run.id);
        await sendApprovalCard(p);
      }
    } catch (err) {
      console.error("whatsapp-bot: listApprovals failed:", (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

await requireProPlan();
runWebhookServer();
await pollApprovals();
