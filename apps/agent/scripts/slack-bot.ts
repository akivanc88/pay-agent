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

/** "streamco" → "Streamco" — same convention the web inbox's `humanizeId` uses, so every front door reads the same. */
function humanizeId(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Mirrors `apps/web/components/activity-reason.tsx` — the plain-language "why this paused" sentence, not the machine reason code. */
function reasonText(pending: PendingApproval): string {
  const { approval, run } = pending;
  const lines = approval.reasons.map((reason) => {
    switch (reason) {
      case "over_cap":
        return approval.capMinor != null
          ? `it's over the ${formatAmount(approval.capMinor, run.currency)} cap you set for this agent`
          : "it's over the spend cap you set for this agent";
      case "over_cumulative_cap":
        return "it's over the cumulative budget for this authorization";
      case "destination_not_allowlisted":
        return `${humanizeId(run.destinationId)} isn't on the list of places you've allowed this agent to pay`;
      case "uncovered":
        return "your funding doesn't cover the amount";
      case "currency_mismatch":
        return "the currency doesn't match your funding";
      default:
        return approval.detail;
    }
  });
  return lines.join(" and ");
}

/**
 * `token` defaults to the bot token (every Web API call except one uses it); `apps.connections.open`
 * is the one exception — Slack requires the *app-level* token there and answers
 * `not_allowed_token_type` if you send the bot token, which is exactly what this call site used to do.
 */
async function slackApi(
  method: string,
  body: Record<string, unknown>,
  token: string | undefined = BOT_TOKEN,
): Promise<{ ok: boolean; [k: string]: unknown }> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { ok: boolean; [k: string]: unknown };
}

function approvalBlocks(pending: PendingApproval): unknown[] {
  const { run } = pending;
  const merchant = humanizeId(run.destinationId);
  const amount = formatAmount(run.amountMinor, run.currency);
  return [
    { type: "section", text: { type: "mrkdwn", text: `:bell: *Your agent wants to pay ${merchant}*` } },
    { type: "section", text: { type: "mrkdwn", text: `:moneybag: *${amount}* — the amount ${merchant} says is owed` } },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `:double_vertical_bar: Paused because ${reasonText(pending)}. Nothing has been charged yet.` }],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Approve* → pay ${amount} now, this time only.\n*Deny* → nothing is charged; the bill stays unpaid.`,
      },
    },
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

/**
 * Plain-language outcome line. `settle.detail` on success is already a human-safe sentence (see
 * `paidSummary` in `resume-service.ts`, e.g. "Paid — $20.00 gift card + $25.99 card.") — never the
 * adapter's own log-facing detail, and never a raw JSON dump of the settle result.
 */
function outcomeText(decision: "granted" | "denied", settle: unknown): string {
  if (decision === "denied") return ":x: *Denied* — nothing was charged; the bill stays unpaid.";
  const s = settle as { ok?: boolean; detail?: string } | null;
  if (s?.ok) return `:white_check_mark: *${s.detail ?? "Paid."}*`;
  if (s?.detail) return `:white_check_mark: *Approved*\n_Not paid yet:_ ${s.detail}`;
  return ":white_check_mark: *Approved*";
}

async function handleInteraction(payload: SlackInteractionPayload): Promise<void> {
  if (payload.type !== "block_actions" || !payload.actions?.[0] || !payload.channel || !payload.message) return;
  const action = payload.actions[0];
  if (action.action_id !== "approve" && action.action_id !== "deny") return;

  const runId = action.value;
  const decision = action.action_id === "approve" ? "granted" : "denied";
  try {
    const result = await decide(runId, decision);
    const text = outcomeText(decision, result.settle);
    await slackApi("chat.update", {
      channel: payload.channel.id,
      ts: payload.message.ts,
      text,
      blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
    });
  } catch (err) {
    console.error("slack-bot: decide failed:", (err as Error).message);
  }
}

/** Open a Socket Mode connection and handle interaction payloads (button taps) forever. */
async function runSocketMode(): Promise<void> {
  for (;;) {
    try {
      const open = await slackApi("apps.connections.open", {}, APP_TOKEN).catch(() => null);
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
