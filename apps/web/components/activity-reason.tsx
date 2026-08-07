/** Turns an approval's machine-readable reason codes into the calm sentence a human reads. */

import { Fragment } from "react";

import { Money } from "@/components/ui";
import type { Approval } from "@/lib/consent";

import { humanizeId } from "./activity-format";

function reasonText(
  reason: Approval["reasons"][number],
  approval: Approval,
  destinationId: string,
) {
  switch (reason) {
    case "over_cap":
      return approval.capMinor != null ? (
        <>
          Over your <Money minor={approval.capMinor} /> cap
        </>
      ) : (
        "Over your spend cap"
      );
    case "destination_not_allowlisted":
      return `${humanizeId(destinationId)} isn't on your allowlist`;
    case "uncovered":
      return "Your funding doesn't cover the amount";
    case "currency_mismatch":
      return "The currency doesn't match your funding";
    default:
      return approval.detail;
  }
}

/** Renders the approval's reasons as one calm line, e.g. "Over your $50.00 cap". Multiple
 *  reasons (a run can trip more than one) are joined, never truncated or picked-one. */
export function ApprovalReasonLine({
  approval,
  destinationId,
}: {
  approval: Approval;
  destinationId: string;
}) {
  return (
    <>
      {approval.reasons.map((reason, i) => (
        <Fragment key={reason}>
          {i > 0 && " · "}
          {reasonText(reason, approval, destinationId)}
        </Fragment>
      ))}
    </>
  );
}
