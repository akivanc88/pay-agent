/**
 * Plain-language "why did that happen" copy for the Agent Console's tool cards.
 *
 * Every sentence here is derived from data the tool already returned (`ToolTrace.data`) — never
 * invented, and never dependent on a real model producing prose, since the deterministic scripted
 * brain never does. Written for a reader with no prior knowledge of this project's architecture:
 * no "mandate," "allowlist," "clamped," or "the core" — those already appear elsewhere in the existing
 * UI (e.g. the "signed by the core" badge) but are not repeated in this new narration copy.
 */

export interface DestinationInfo {
  readonly id: string;
  readonly label: string;
  readonly referenceHint?: string;
  readonly note?: string;
}

/** The one line under a freshly drafted spend limit, explaining who can and can't change it. */
export function intentFootnote(data: Record<string, unknown>): string {
  const clamped = Boolean(data.clamped);
  const prefix = clamped
    ? "You asked for more than this agent is ever allowed to spend in one go, so the limit was automatically lowered. "
    : "";
  return `${prefix}The AI only proposed this limit — the payment system itself locks it in and enforces it. Not even the AI can raise it later.`;
}

/** The one line under a settled payment, explaining the gift-card-first funding order. Null when there's nothing to explain (no split occurred). */
export function settledFootnote(data: Record<string, unknown>): string | null {
  const gift = Number(data.giftDrawnMinor ?? 0);
  const card = Number(data.cardChargedMinor ?? 0);
  if (gift > 0 && card > 0) {
    return "Your gift card was used first for what it could cover, and the card paid the small remainder — that happens automatically, in the same order every time.";
  }
  if (gift > 0 && card === 0) {
    return "Your gift card covered the whole amount — the card was never touched.";
  }
  if (gift === 0 && card > 0) {
    return "There was no gift-card balance available, so the full amount went on the card.";
  }
  return null;
}

/** Classifies the orchestrator's fixed `detail` string into plain sentences, joined if more than one check tripped. */
export function explainPending(detail: string): string {
  const reasons: string[] = [];
  if (detail.includes("allowlist")) reasons.push("you hadn't approved this destination yet");
  if (detail.includes("cumulative cap")) reasons.push("it would push your total spending over the budget you set");
  if (detail.includes("exceeds the") && detail.includes("spend cap")) reasons.push("the amount is more than you authorized");
  if (detail.includes("covered by no instrument")) reasons.push("none of your payment methods can cover the full amount");
  if (detail.includes("intent authorizes")) reasons.push("the amount is owed in a different currency than you authorized");
  if (detail.includes("amount changed from")) reasons.push("the amount changed since you last reviewed it");
  if (detail.includes("still awaiting a human decision")) return "This is waiting on you — no one has approved it yet.";
  if (reasons.length === 0) return "This paused as a safety check before anything was paid.";
  return `This paused because ${reasons.join(" and ")} — nothing has been paid.`;
}

/** The one line under a failed payment. Only claims a reversal when the data confirms one happened. */
export function failedFootnote(data: Record<string, unknown>): string | null {
  return data.reversed === true
    ? "Any money already set aside from your gift card was given back — you didn't lose anything."
    : null;
}

/** The one line explaining that checking a run's status never moves money. */
export function explainGetRun(data: Record<string, unknown>): string {
  const run = (data.run ?? {}) as Record<string, unknown>;
  const status = String(run.status ?? "");
  const approval = data.approvalStatus as string | null | undefined;
  if (approval === "pending") return "Just checking — nothing changes until you approve it.";
  if (approval === "granted") return "You already approved this — resuming is the last step to finish paying.";
  if (status === "settled") return "Just checking — this already finished, so nothing changes.";
  if (status === "failed") return "Just checking — this already failed (and was reversed), so nothing changes.";
  return "Just checking — looking something up never moves money.";
}

/** Plain, user-facing descriptions of each known destination — distinct from `KNOWN_DESTINATIONS[].note`, which is written for the model's tool description, not for end users. */
const DESTINATION_DESCRIPTIONS: Record<string, string> = {
  streamco:
    "A subscription bill with no direct payment connection — the agent has to read the amount off the page itself.",
  "ucp-storefront":
    "A flower shop that can take your gift card directly and always tells us the exact price — no guessing needed.",
  "stripe-payment-link":
    "A payment link from an outside site — your gift card is tracked on our side, and only what's left over goes on your card.",
};

/** A destination's plain description, falling back to its label alone for anything not in the map above. */
export function destinationDescription(destination: DestinationInfo): string {
  return DESTINATION_DESCRIPTIONS[destination.id] ?? destination.label;
}
