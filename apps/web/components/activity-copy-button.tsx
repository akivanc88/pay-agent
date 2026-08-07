/** A small clipboard affordance for a long token (a JWS). Copies the full value even though
 *  the row beside it only shows a truncated one. */
"use client";

import { useState } from "react";

import { Button } from "@/components/ui";

export function ActivityCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API unavailable (permissions, insecure context) — fail quietly, no crash.
    }
  }

  return (
    <Button type="button" variant="secondary" size="md" onClick={handleCopy} aria-live="polite">
      {copied ? "Copied" : "Copy JWS"}
    </Button>
  );
}
