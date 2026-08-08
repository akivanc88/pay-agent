/**
 * The human-in-the-loop decision, front and center. Posts to the same decide endpoint from
 * both the inbox card and the run timeline header, so approving from either place behaves
 * identically. On success it holds a "done" state briefly — long enough to register as an
 * action that happened — before `router.refresh()` pulls the server back in sync.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";

import styles from "./activity-actions.module.css";

type Decision = "granted" | "denied";

type DecideState =
  | { phase: "idle" }
  | { phase: "busy"; decision: Decision }
  | { phase: "done"; decision: Decision; note?: string }
  | { phase: "error"; message: string };

interface DecideResponse {
  ok: boolean;
  status: string;
  settle?: { ok: boolean; status: string; detail: string } | null;
}

/** Minor units → a readable amount for the checkbox label (the Money component renders an element). */
function formatAmount(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(minor / 100);
}

function CheckGlyph() {
  return (
    <svg
      className={styles.doneIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" opacity="0.35" />
      <path d="M8.5 12.3l2.4 2.4 4.6-5.4" />
    </svg>
  );
}

function XGlyph() {
  return (
    <svg
      className={styles.doneIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" opacity="0.35" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}

/** Where the "trust going forward" choice appears, it needs the destination and amount to name it. */
export interface StandingAuthOffer {
  readonly destinationId: string;
  readonly amountMinor: number;
  readonly currency: string;
}

export function ActivityActions({
  runId,
  decidedBy,
  size = "md",
  standingAuth,
}: {
  runId: string;
  decidedBy: string;
  size?: "sm" | "md" | "lg";
  /** When present, offer an opt-in "also trust this destination going forward" checkbox. */
  standingAuth?: StandingAuthOffer;
}) {
  const router = useRouter();
  const [state, setState] = useState<DecideState>({ phase: "idle" });
  const [trustForward, setTrustForward] = useState(false);

  async function decide(decision: Decision) {
    setState({ phase: "busy", decision });
    // Standing authorization is opt-in and only meaningful on a grant; a denial never widens trust.
    const standing = decision === "granted" && trustForward;
    let res: Response;
    try {
      res = await fetch(`/api/consent/approvals/${runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, by: decidedBy, standingAuth: standing }),
      });
    } catch {
      setState({ phase: "error", message: "Couldn't reach the server. Try again." });
      return;
    }

    if (res.status === 409) {
      // Someone else decided this first — or this tab is stale. Say so calmly and resync
      // with the server rather than pretending the click landed.
      setState({ phase: "error", message: "This run was already decided. Refreshing…" });
      router.refresh();
      return;
    }
    if (!res.ok) {
      setState({ phase: "error", message: "Couldn't record that decision. Try again." });
      return;
    }

    // On approval the server also asks the agent to resume + settle. Reflect what actually happened:
    // a clean settle, or an honest note that it couldn't (agent not running, or a non-live run).
    let note: string | undefined;
    if (decision === "granted") {
      const data = (await res.json().catch(() => null)) as DecideResponse | null;
      if (data?.settle && !data.settle.ok) note = data.settle.detail;
    }
    setState({ phase: "done", decision, note });
    // Give a settled run a beat longer to read before the view refreshes.
    window.setTimeout(() => router.refresh(), note ? 2600 : 1200);
  }

  return (
    <div className={styles.root} aria-live="polite" aria-atomic="true">
      {state.phase === "done" ? (
        <div className={styles.doneGroup}>
          <p className={styles.done} data-decision={state.decision}>
            {state.decision === "granted" ? <CheckGlyph /> : <XGlyph />}
            {state.decision === "granted" ? (state.note ? "Approved" : "Approved & settled") : "Denied"}
          </p>
          {state.note && (
            <p className={styles.note} role="status">
              {state.note}
            </p>
          )}
        </div>
      ) : (
        <>
          {standingAuth && (
            <label className={styles.standing}>
              <input
                type="checkbox"
                className={styles.standingBox}
                checked={trustForward}
                disabled={state.phase === "busy"}
                onChange={(e) => setTrustForward(e.target.checked)}
              />
              <span className={styles.standingText}>
                Also trust {standingAuth.destinationId} up to{" "}
                {formatAmount(standingAuth.amountMinor, standingAuth.currency)} going forward
              </span>
            </label>
          )}
          <div className={styles.buttons}>
            <Button
              type="button"
              variant="primary"
              size={size}
              loading={state.phase === "busy" && state.decision === "granted"}
              disabled={state.phase === "busy" && state.decision === "denied"}
              onClick={() => decide("granted")}
            >
              {trustForward ? "Approve & trust" : "Approve"}
            </Button>
            <Button
              type="button"
              variant="danger"
              size={size}
              loading={state.phase === "busy" && state.decision === "denied"}
              disabled={state.phase === "busy" && state.decision === "granted"}
              onClick={() => decide("denied")}
            >
              Deny
            </Button>
          </div>
          {state.phase === "error" && (
            <p className={styles.error} role="alert">
              {state.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
