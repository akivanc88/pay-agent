/**
 * The Agent Console — M4's marquee surface.
 *
 * You type a plain-language instruction ("Pay my StreamCo bill from my gift card, up to $50") and
 * watch the brain work: it drafts a signed IntentMandate, hands a reference to the rails, and either
 * settles or pauses for your approval. Every beat arrives as a Server-Sent Event from the agent
 * (proxied through /api/agent/instruct) and is rendered as it happens.
 *
 * The honesty rules the whole project turns on are carried here too: the console states plainly
 * whether a real model or the deterministic scripted stand-in produced the run, it never shows an
 * amount it doesn't have, and a paused run is sent to the same approval inbox every other surface uses
 * rather than being quietly forced through. The brain does not move money — this surface only watches
 * the boxed rails do it.
 */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, Button, Money, SectionLabel } from "@/components/ui";
import { AgentMarquee, type AgentState } from "@/components/agent-marquee";
import styles from "./agent-console.module.css";

/* ── The step shapes streamed from the agent (mirrors apps/agent BrainStep / ToolTrace). ── */
interface ToolTrace {
  name: string;
  arguments: Record<string, unknown>;
  result: string;
  data?: Record<string, unknown>;
  ok: boolean;
}
interface Step {
  kind: "user" | "assistant" | "tool" | "final" | "error";
  text?: string;
  tool?: ToolTrace;
}
interface Meta {
  model: string;
  live: boolean;
  reason: string;
  mode: string;
}

const EXAMPLES = [
  "Pay my StreamCo bill from my gift card, up to $50",
  "Pay my StreamCo bill, up to $20",
];

export function AgentConsole() {
  const [instruction, setInstruction] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [running, setRunning] = useState(false);
  const [offline, setOffline] = useState<string | null>(null);
  const [runIds, setRunIds] = useState<string[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const state = deriveState(running, steps);

  /* Keep the newest step in view as the transcript grows, unless the visitor asked for less motion. */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, [steps]);

  const run = useCallback(async (text: string) => {
    if (running || !text.trim()) return;
    setRunning(true);
    setOffline(null);
    setSteps([]);
    setMeta(null);
    setRunIds([]);

    try {
      const res = await fetch("/api/agent/instruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text }),
      });
      if (!res.body) throw new Error("no stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) handleFrame(frame);
      }
    } catch {
      setOffline("Something interrupted the run. Check that the agent and store services are running.");
    } finally {
      setRunning(false);
    }

    function handleFrame(frame: string): void {
      const evLine = frame.split("\n").find((l) => l.startsWith("event:"));
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) return;
      const event = evLine?.slice(6).trim() ?? "message";
      let payload: unknown;
      try {
        payload = JSON.parse(dataLine.slice(5).trim());
      } catch {
        return;
      }
      if (event === "meta") setMeta(payload as Meta);
      else if (event === "step") setSteps((s) => [...s, payload as Step]);
      else if (event === "done") setRunIds((payload as { runIds?: string[] }).runIds ?? []);
      else if (event === "offline") setOffline((payload as { message: string }).message);
      else if (event === "error") setSteps((s) => [...s, { kind: "error", text: (payload as { message: string }).message }]);
    }
  }, [running]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(instruction);
  };

  const started = steps.length > 0 || running || offline;

  return (
    <div className={styles.console}>
      <AgentMarquee state={state} meta={meta} />

      <div className={styles.stage}>
        <div className={styles.transcript} ref={scrollerRef} aria-live="polite" aria-busy={running}>
          {!started && <EmptyState onPick={(t) => { setInstruction(t); void run(t); }} />}

          {steps.map((step, i) => (
            <StepView key={i} step={step} runIds={runIds} />
          ))}

          {running && <WorkingRow />}

          {offline && (
            <div className={styles.offline} role="status">
              <p>{offline}</p>
            </div>
          )}
        </div>

        <form className={styles.composer} onSubmit={onSubmit}>
          <label className={styles.srOnly} htmlFor="instruction">
            Tell the agent what to pay
          </label>
          <input
            id="instruction"
            className={styles.input}
            placeholder="Tell the agent what to pay…"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={running}
            autoComplete="off"
          />
          <Button type="submit" loading={running} disabled={!instruction.trim()}>
            {running ? "Working" : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────── */
function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className={styles.empty}>
      <SectionLabel>How it works</SectionLabel>
      <h2 className={styles.emptyTitle}>Tell the agent what to pay, in plain words.</h2>
      <p className={styles.emptyBody}>
        It drafts a signed spend mandate from what you said, then draws your gift card first and the
        card for the rest — pausing for your approval whenever a payment would exceed what you
        authorized. It never moves money on its own.
      </p>
      <div className={styles.chips}>
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className={styles.chip} onClick={() => onPick(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── One step ────────────────────────────────────────────────────────── */
function StepView({ step, runIds }: { step: Step; runIds: string[] }) {
  if (step.kind === "user") {
    return (
      <div className={styles.userRow}>
        <div className={styles.userBubble}>{step.text}</div>
      </div>
    );
  }
  if (step.kind === "assistant") {
    return <p className={styles.thinking}>{step.text}</p>;
  }
  if (step.kind === "final") {
    return (
      <div className={styles.agentRow}>
        <div className={styles.agentGlyph} aria-hidden />
        <div className={styles.agentBubble}>{step.text}</div>
      </div>
    );
  }
  if (step.kind === "error") {
    return <div className={styles.errorCard} role="alert">{step.text}</div>;
  }
  if (step.kind === "tool" && step.tool) {
    return <ToolCard tool={step.tool} runIds={runIds} />;
  }
  return null;
}

/* ── Tool cards ──────────────────────────────────────────────────────── */
function ToolCard({ tool, runIds }: { tool: ToolTrace; runIds: string[] }) {
  const data = tool.data ?? {};
  if (tool.name === "draft_intent") return <DraftIntentCard data={data} />;
  if (tool.name === "start_run" || tool.name === "resume_run") return <OutcomeCard data={data} runIds={runIds} />;
  if (tool.name === "list_destinations") return <ToolNote label="Looked up destinations" body={tool.result} />;
  if (tool.name === "get_run") return <ToolNote label="Checked the run" body={tool.result} />;
  return <ToolNote label={tool.name} body={tool.result} />;
}

function DraftIntentCard({ data }: { data: Record<string, unknown> }) {
  const cap = Number(data.spendCapMinor ?? 0);
  const currency = String(data.currency ?? "CAD");
  const allow = Array.isArray(data.allowlist) ? (data.allowlist as string[]) : [];
  const clamped = Boolean(data.clamped);
  return (
    <article className={`${styles.card} ${styles.cardIntent}`}>
      <header className={styles.cardHead}>
        <span className={styles.cardKicker}>Mandate drafted</span>
        <Badge tone="brand" soft>
          signed by the core
        </Badge>
      </header>
      <div className={styles.intentBody}>
        <div className={styles.intentCap}>
          <span className={styles.intentCapLabel}>Spend cap</span>
          <Money minor={cap} currency={currency} className={styles.intentCapValue} />
        </div>
        <div className={styles.intentAllow}>
          <span className={styles.intentCapLabel}>Allowed</span>
          <div className={styles.allowChips}>
            {allow.map((id) => (
              <span key={id} className={styles.allowChip}>{prettyDest(id)}</span>
            ))}
          </div>
        </div>
      </div>
      <p className={styles.cardFoot}>
        {clamped ? "Your instruction asked for more than the safety ceiling, so it was clamped down. " : ""}
        The model proposed these limits; the deterministic core signed the mandate — the model can’t.
      </p>
    </article>
  );
}

function OutcomeCard({ data, runIds }: { data: Record<string, unknown>; runIds: string[] }) {
  const status = String(data.status ?? "");
  const run = (data.run ?? {}) as Record<string, unknown>;
  const amount = Number(run.amountMinor ?? 0);
  const currency = String(run.currency ?? "CAD");
  const dest = String(run.destinationId ?? "");
  const runId = String(run.id ?? runIds[runIds.length - 1] ?? "");

  if (status === "settled") {
    const gift = Number(data.giftDrawnMinor ?? 0);
    const card = Number(data.cardChargedMinor ?? 0);
    const confirmed = Boolean(data.confirmed);
    return (
      <article className={`${styles.card} ${styles.cardSettled}`}>
        <header className={styles.cardHead}>
          <span className={styles.cardKicker}>Paid — {prettyDest(dest)}</span>
          <Badge tone="brand">{confirmed ? "confirmed" : "settled"}</Badge>
        </header>
        <div className={styles.receiptTotal}>
          <Money minor={amount} currency={currency} className={styles.receiptAmount} />
        </div>
        <dl className={styles.receiptSplit}>
          {gift > 0 && (
            <div className={styles.splitRow}>
              <dt><span className={styles.dotGift} aria-hidden /> Gift card</dt>
              <dd><Money minor={gift} currency={currency} /></dd>
            </div>
          )}
          {card > 0 && (
            <div className={styles.splitRow}>
              <dt><span className={styles.dotCard} aria-hidden /> Card</dt>
              <dd><Money minor={card} currency={currency} /></dd>
            </div>
          )}
        </dl>
        {runId && (
          <Link className={styles.cardLink} href={`/activity/${runId}`}>
            See the full run →
          </Link>
        )}
      </article>
    );
  }

  if (status === "pending_approval") {
    return (
      <article className={`${styles.card} ${styles.cardPending}`}>
        <header className={styles.cardHead}>
          <span className={styles.cardKicker}>Paused for your approval</span>
          <Badge tone="warn">nothing drawn</Badge>
        </header>
        <div className={styles.pendingRow}>
          <Money minor={amount} currency={currency} className={styles.pendingAmount} />
          <span className={styles.pendingDest}>at {prettyDest(dest)}</span>
        </div>
        <p className={styles.cardFoot}>{String(data.detail ?? "This needs a closer look before anything is paid.")}</p>
        {runId && (
          <Button href={`/activity/${runId}`} variant="secondary" size="sm">
            Review in your inbox →
          </Button>
        )}
      </article>
    );
  }

  if (status === "failed") {
    return (
      <article className={`${styles.card} ${styles.cardFailed}`}>
        <header className={styles.cardHead}>
          <span className={styles.cardKicker}>Payment failed</span>
          <Badge tone="danger">reversed</Badge>
        </header>
        <p className={styles.cardFoot}>{String(data.detail ?? "The payment did not go through; any gift-card draw was reversed exactly.")}</p>
      </article>
    );
  }

  return <ToolNote label="Run" body={JSON.stringify(data)} />;
}

function ToolNote({ label, body }: { label: string; body: string }) {
  return (
    <div className={styles.toolNote}>
      <span className={styles.toolNoteLabel}>{label}</span>
      <span className={styles.toolNoteBody}>{body}</span>
    </div>
  );
}

function WorkingRow() {
  return (
    <div className={styles.workingRow} aria-hidden>
      <span className={styles.workingDot} />
      <span className={styles.workingDot} />
      <span className={styles.workingDot} />
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────── */
function prettyDest(id: string): string {
  switch (id) {
    case "streamco":
      return "StreamCo";
    case "ucp-storefront":
      return "the storefront";
    case "stripe-payment-link":
      return "a payment link";
    default:
      return id || "the destination";
  }
}

function deriveState(running: boolean, steps: Step[]): AgentState {
  const lastOutcome = [...steps].reverse().find((s) => s.kind === "tool" && (s.tool?.name === "start_run" || s.tool?.name === "resume_run"));
  const status = lastOutcome?.tool?.data?.status;
  if (running) return "thinking";
  if (status === "settled") return "settled";
  if (status === "pending_approval") return "paused";
  if (status === "failed") return "failed";
  return "idle";
}
