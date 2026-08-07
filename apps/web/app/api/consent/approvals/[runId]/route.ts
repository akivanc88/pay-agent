/**
 * Approve or deny a pending run — the human-in-the-loop decision, written back to the consent store.
 *
 * This is the whole point of the approval inbox: a person, not the agent, decides. The decision is
 * append-only in effect — `decideApproval` refuses to flip an already-decided approval — so a
 * double-submit or a race cannot turn a denial into a grant.
 */
import { NextResponse } from "next/server";

import { decideApproval } from "@/lib/consent";

interface DecideBody {
  decision?: "granted" | "denied";
  by?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
  const { runId } = await params;
  let body: DecideBody;
  try {
    body = (await request.json()) as DecideBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (body.decision !== "granted" && body.decision !== "denied") {
    return NextResponse.json({ error: "decision must be 'granted' or 'denied'" }, { status: 400 });
  }

  let approval;
  try {
    approval = await decideApproval(runId, body.decision, body.by?.trim() || "demo-user");
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }

  // On approval, ask the agent service to actually resume and settle the run — the other half of
  // the human-in-the-loop. The agent (not the dashboard) holds the Stripe key and the adapters. If
  // it isn't running, the approval still stands; we report that it wasn't auto-settled rather than
  // pretending money moved.
  let settle: { ok: boolean; status: string; detail: string } | null = null;
  if (body.decision === "granted") {
    const agentUrl = process.env.AGENT_URL ?? "http://localhost:3002";
    try {
      const res = await fetch(`${agentUrl}/runs/${encodeURIComponent(runId)}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(30_000),
      });
      settle = (await res.json()) as { ok: boolean; status: string; detail: string };
    } catch {
      settle = { ok: false, status: "unreached", detail: "agent service not running — approval recorded, but the run was not auto-settled" };
    }
  }

  return NextResponse.json({ ok: true, status: approval.status, settle });
}
