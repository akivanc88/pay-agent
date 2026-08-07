/**
 * The Agent Console page — M4. "Tell the agent what to pay, in plain words."
 *
 * A thin server shell around the streaming client console: the whole surface lives in
 * `components/agent-console.tsx`, which talks to the agent's `/instruct` endpoint. Wrapped in the
 * shared console chrome (header + footer) like every other surface, so the brain reads as part of the
 * same product, not a separate demo.
 */
import type { Metadata } from "next";

import { AgentConsole } from "@/components/agent-console";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Agent · pay-agent",
  description: "Instruct the agent to pay in plain language; watch it draft a mandate, gate the spend, and settle.",
};

export default function AgentPage() {
  return (
    <Container>
      <AgentConsole />
    </Container>
  );
}
