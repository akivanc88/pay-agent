/**
 * Chat-based approval, Slack edition — the B2B/agent-platform counterpart to `telegram-bot.ts`.
 *
 * Same shape as the Telegram bot: poll the consent store's `listApprovals("pending")` (the same
 * read the web `/activity` inbox does), post a Block Kit card with Approve/Deny buttons, and on tap
 * call the *same* decide endpoint the dashboard's approve button calls
 * (`POST /api/consent/approvals/:runId` on the web app). Nothing here can settle money itself.
 *
 * Slack's interactivity has no long-polling option like Telegram's `getUpdates` — the two documented
 * ways to receive a button tap are a public HTTPS Request URL, or **Socket Mode** (a outbound
 * WebSocket the app opens to Slack, needing no public endpoint). Socket Mode is the one that needs
 * no extra infra for a local/demo run, so that's what this uses — zero-dep, via Node's built-in
 * global `WebSocket` (Node ≥ 22 ships it), the same "raw fetch, no SDK" discipline as
 * `brain/openai.ts` / `brain/anthropic.ts`.
 *
 * Usage:  pnpm --filter @pay-agent/agent slack-bot
 * Needs a Slack app with Socket Mode enabled and the `chat:write` bot scope:
 *   SLACK_BOT_TOKEN   — xoxb-... (Web API calls: chat.postMessage, chat.update)
 *   SLACK_APP_TOKEN   — xapp-... (opens the Socket Mode connection; needs the `connections:write` scope)
 *   SLACK_CHANNEL_ID  — the channel (or user DM) id to post approval cards into
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { openConsentStore, type PendingApproval } from "@pay-agent/db";

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const APP_TOKEN = process.env.SLACK_APP_TOKEN;
const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3001";
const POLL_MS = Number(process.env.SLACK_POLL_MS ?? 4000);
const consentPath =
  process.env.CONSENT_DB_PATH ?? join(dirname(fileURLToPath(import.meta.url)), "../../web/.data/consent.db");

if (!BOT_TOKEN || !APP_TOKEN || !CHANNEL_ID) {
  console.error(
    "slack-bot: set SLACK_BOT_TOKEN (xoxb-...), SLACK_APP_TOKEN (xapp-...) and SLACK_CHANNEL_ID — " +
      "create a Slack app with Socket Mode + the chat:write scope at https://api.slack.com/apps",
  );
  process.exit(1);
}

function formatAmount(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

async function slackApi(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; [k: string]: unknown }> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${BOT_TOKEN}` },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { ok: boolean; [k: string]: unknown };
}

function approvalBlocks(pending: PendingApproval): unknown[] {
  const { run, approval } = pending;
  return [
    { type: "section", text: { type: "mrkdwn", text: `*Approval needed*\n${run.description}` } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Amount:*\n\`${formatAmount(run.amountMinor, run.currency)}\`` },
        { type: "mrkdwn", text: `*Destination:*\n\`${run.destinationId}\`` },
      ],
    },
    { type: "context", elements: [{ type: "mrkdwn", text: `Why: ${approval.reasons.join(", ")} — ${approval.detail}` }] },
    {
      type: "actions",
      block_id: `approval_${run.id}`,
      elements: [
        { type: "button", text: { type: "plain_text", text: "✅ Approve" }, style: "primary", action_id: "approve", value: run.id },
        { type: "button", text: { type: "plain_text", text: "❌ Deny" }, style: "danger", action_id: "deny", value: run.id },
      ],
    },
  ];
}

async function sendApprovalCard(pending: PendingApproval): Promise<void> {
  await slackApi("chat.postMessage", {
    channel: CHANNEL_ID,
    text: `Approval needed: ${pending.run.description}`, // fallback for notifications
    blocks: approvalBlocks(pending),
  });
}

/** The same decision path the web inbox's approve/deny buttons call — see `apps/web/app/api/consent/approvals/[runId]/route.ts`. */
async function decide(runId: string, decision: "granted" | "denied"): Promise<{ ok: boolean; status: string; settle: unknown }> {
  const res = await fetch(`${WEB_URL}/api/consent/approvals/${encodeURIComponent(runId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, by: "slack" }),
  });
  return (await res.json()) as { ok: boolean; status: string; settle: unknown };
}

interface SlackInteractionPayload {
  readonly type: string;
  readonly channel?: { readonly id: string };
  readonly message?: { readonly ts: string };
  readonly actions?: ReadonlyArray<{ readonly action_id: string; readonly value: string }>;
}

async function handleInteraction(payload: SlackInteractionPayload): Promise<void> {
  if (payload.type !== "block_actions" || !payload.actions?.[0] || !payload.channel || !payload.message) return;
  const action = payload.actions[0];
  if (action.action_id !== "approve" && action.action_id !== "deny") return;

  const runId = action.value;
  const decision = action.action_id === "approve" ? "granted" : "denied";
  try {
    const result = await decide(runId, decision);
    const verb = decision === "granted" ? "Approved" : "Denied";
    const settleNote =
      decision === "granted" && result.settle && typeof result.settle === "object" ? ` — ${JSON.stringify(result.settle)}` : "";
    await slackApi("chat.update", {
      channel: payload.channel.id,
      ts: payload.message.ts,
      text: `${verb} run ${runId}${settleNote}`,
      blocks: [{ type: "section", text: { type: "mrkdwn", text: `${verb} run \`${runId}\`${settleNote}` } }],
    });
  } catch (err) {
    console.error("slack-bot: decide failed:", (err as Error).message);
  }
}

/** Open a Socket Mode connection and handle interaction payloads (button taps) forever. */
async function runSocketMode(): Promise<void> {
  for (;;) {
    try {
      const open = await slackApi("apps.connections.open", {}).catch(() => null);
      const url = open && typeof open["url"] === "string" ? (open["url"] as string) : null;
      if (!open?.ok || !url) {
        console.error("slack-bot: apps.connections.open failed:", JSON.stringify(open));
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${APP_TOKEN}` } } as never);
        ws.addEventListener("message", (event: MessageEvent) => {
          void (async () => {
            const envelope = JSON.parse(String(event.data)) as {
              envelope_id?: string;
              type?: string;
              payload?: string | SlackInteractionPayload;
            };
            if (envelope.envelope_id) {
              ws.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
            }
            if (envelope.type === "interactive" && envelope.payload) {
              const payload =
                typeof envelope.payload === "string" ? (JSON.parse(envelope.payload) as SlackInteractionPayload) : envelope.payload;
              await handleInteraction(payload);
            }
          })();
        });
        ws.addEventListener("close", () => resolve());
        ws.addEventListener("error", (event) => reject(new Error(`socket error: ${JSON.stringify(event)}`)));
      });
      console.log("slack-bot: socket closed, reconnecting…");
    } catch (err) {
      console.error("slack-bot: socket mode error:", (err as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/** Poll the consent store for newly pending approvals and push a card for each one, once. */
async function pollApprovals(): Promise<void> {
  const consent = openConsentStore(consentPath);
  const notified = new Set<string>();
  console.log(`slack-bot: watching ${consentPath} for pending approvals every ${POLL_MS}ms`);
  for (;;) {
    try {
      const pending = await consent.listApprovals("pending");
      for (const p of pending) {
        if (notified.has(p.run.id)) continue;
        notified.add(p.run.id);
        await sendApprovalCard(p);
      }
    } catch (err) {
      console.error("slack-bot: listApprovals failed:", (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

console.log("slack-bot: sending approval cards to channel", CHANNEL_ID, "— approve/deny calls", WEB_URL);
await Promise.all([pollApprovals(), runSocketMode()]);
