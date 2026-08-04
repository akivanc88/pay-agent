"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StatePage } from "@/components/state-page";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The root error boundary.
 *
 * Without it, any render failure shows Next's raw stack-trace overlay in development and a
 * blank stock 500 in production. On a payment surface that is worse than ugly: a buyer who
 * has just pressed Pay needs to be told, in plain words, whether their money moved.
 *
 * It doesn't guess. Nothing here claims the payment did or didn't go through — it points at
 * the wallet, where the ledger is the authority, because that is the only place the answer
 * actually lives.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack once this is deployed.
    console.error("Unhandled error", error.digest ?? "", error);
  }, [error]);

  return (
    <>
      {/* Same reasoning as `not-found.tsx`: the root boundary catches failures from *both*
          route groups, so it inherits neither frame and has to bring its own. A page that
          tells you to go and check your wallet had better give you a way to get there. */}
      <SiteHeader themeToggle={<ThemeToggle />} />
      <main>
        <StatePage
          eyebrow="Something broke"
          title="This page didn’t finish loading"
          body={
            <>
              The fault is ours, not yours. Nothing here has been charged by this screen
              failing — if you were part-way through paying, the wallet shows what the ledger
              actually recorded, and that is the authority.
            </>
          }
          action={{ href: "/wallet", label: "Check the wallet" }}
          secondary={
            <Button onClick={reset} variant="ghost" size="lg">
              Try again
            </Button>
          }
          art={
            <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              {/* a snapped stem */}
              <path d="M48 86V56" />
              <path d="M48 56 34 42" opacity="0.5" />
              <path d="M52 50c6-10 3-22-6-30-5 10-2 22 6 30Z" />
              <path d="M30 44c-7-3-11-10-11-18 8 1 14 7 15 15" opacity="0.5" />
            </svg>
          }
        />
      </main>
      <SiteFooter />
    </>
  );
}
