/**
 * Chat-based approval: the human-in-the-loop, over Telegram instead of the web `/activity` inbox.
 *
 * Real friction the web dashboard has: it requires opening a browser tab to approve a run. This
 * polls the same consent store the dashboard reads (`listApprovals("pending")`), pushes each new
 * one to a chat as an inline-keyboard message, and on tap calls the *same* decide endpoint the
 * dashboard's approve button calls (`POST /api/consent/approvals/:runId` on the web app) — so this
 * is a second front door onto the existing approval flow, not a parallel one. Nothing here can
 * settle money itself; it only ever records a human's decision, exactly like the web inbox does.
 *
 * Deliberately dependency-free (raw `fetch` against the Telegram Bot API, long-polling via
 * `getUpdates`) so it costs nothing to run and needs no webhook/TLS endpoint for the demo. A
 * production deployment would swap `getUpdates` polling for a registered webhook, but the
 * approval-decision path below is unchanged either way.
 *
 * Usage:  pnpm --filter @pay-agent/agent telegram-bot
 * Needs:  TELEGRAM_BOT_TOKEN (from @BotFather), TELEGRAM_CHAT_ID (the chat to notify — message the
 *         bot once and read https://api.telegram.org/bot<token>/getUpdates to find it)
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { openConsentStore, type PendingApproval } from "@pay-agent/db";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3001";
const POLL_MS = Number(process.env.TELEGRAM_POLL_MS ?? 4000);
const consentPath =
  process.env.CONSENT_DB_PATH ?? join(dirname(fileURLToPath(import.meta.url)), "../../web/.data/consent.db");

if (!TOKEN) {
  console.error("telegram-bot: TELEGRAM_BOT_TOKEN is not set — create a bot with @BotFather and set it.");
  process.exit(1);
}
if (!CHAT_ID) {
  console.error(
    "telegram-bot: TELEGRAM_CHAT_ID is not set — message your bot once, then GET " +
      "https://api.telegram.org/bot<token>/getUpdates to read your chat id.",
  );
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

function formatAmount(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

async function sendApprovalCard(pending: PendingApproval): Promise<void> {
  const { run, approval } = pending;
  const text =
    `*Approval needed*\n` +
    `${run.description}\n\n` +
    `Amount: \`${formatAmount(run.amountMinor, run.currency)}\`\n` +
    `Destination: \`${run.destinationId}\`\n` +
    `Why: ${approval.reasons.join(", ")} — ${approval.detail}`;

  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `approve:${run.id}` },
            { text: "❌ Deny", callback_data: `deny:${run.id}` },
          ],
        ],
      },
    }),
  });
}

async function answerCallback(callbackQueryId: string, text: string): Promise<void> {
  await fetch(`${API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

async function editMessage(chatId: number, messageId: number, text: string): Promise<void> {
  await fetch(`${API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "Markdown" }),
  });
}

/** The same decision path the web inbox's approve/deny buttons call — see `apps/web/app/api/consent/approvals/[runId]/route.ts`. */
async function decide(runId: string, decision: "granted" | "denied"): Promise<{ ok: boolean; status: string; settle: unknown }> {
  const res = await fetch(`${WEB_URL}/api/consent/approvals/${encodeURIComponent(runId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, by: "telegram" }),
  });
  return (await res.json()) as { ok: boolean; status: string; settle: unknown };
}

interface TelegramUpdate {
  readonly update_id: number;
  readonly callback_query?: {
    readonly id: string;
    readonly data?: string;
    readonly message?: { readonly chat: { readonly id: number }; readonly message_id: number };
  };
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const cb = update.callback_query;
  if (!cb?.data || !cb.message) return;

  const [action, runId] = cb.data.split(":");
  if ((action !== "approve" && action !== "deny") || !runId) return;

  const decision = action === "approve" ? "granted" : "denied";
  try {
    const result = await decide(runId, decision);
    const verb = decision === "granted" ? "Approved" : "Denied";
    const settleNote =
      decision === "granted" && result.settle && typeof result.settle === "object"
        ? ` — ${JSON.stringify(result.settle)}`
        : "";
    await answerCallback(cb.id, `${verb}`);
    await editMessage(cb.message.chat.id, cb.message.message_id, `${verb} run \`${runId}\`${settleNote}`);
  } catch (err) {
    await answerCallback(cb.id, "Error — see agent logs");
    console.error("telegram-bot: decide failed:", (err as Error).message);
  }
}

/** Long-poll Telegram for callback taps, forever. */
async function pollUpdates(): Promise<void> {
  let offset = 0;
  for (;;) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=25&offset=${offset}`, { signal: AbortSignal.timeout(30_000) });
      const body = (await res.json()) as { result: TelegramUpdate[] };
      for (const update of body.result ?? []) {
        offset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (err) {
      console.error("telegram-bot: getUpdates failed:", (err as Error).message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/** Poll the consent store for newly pending approvals and push a card for each one, once. */
async function pollApprovals(): Promise<void> {
  const consent = openConsentStore(consentPath);
  const notified = new Set<string>();
  console.log(`telegram-bot: watching ${consentPath} for pending approvals every ${POLL_MS}ms`);
  for (;;) {
    try {
      const pending = await consent.listApprovals("pending");
      for (const p of pending) {
        if (notified.has(p.run.id)) continue;
        notified.add(p.run.id);
        await sendApprovalCard(p);
      }
    } catch (err) {
      console.error("telegram-bot: listApprovals failed:", (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

console.log("telegram-bot: sending approval cards to chat", CHAT_ID, "— approve/deny calls", WEB_URL);
await Promise.all([pollApprovals(), pollUpdates()]);
