/** Provides explicitly test-only controls used to drive deterministic payment failure scenarios. */

import { minorUnits } from "@pay-agent/db";
import { type Context } from "hono";

import { getFundingStore } from "../payments/gift-card";
import { type IdParamContext, type IssueCardContext } from "../utils/validation";
import { CheckoutService } from "./checkout";

function checkSimulationSecret(c: Context): boolean {
  const secret = c.req.header("Simulation-Secret");
  const expectedSecret = process.env.SIMULATION_SECRET || "super-secret-sim-key";
  return secret === expectedSecret;
}

export class TestingService {
  constructor(private readonly checkoutService: CheckoutService) {}

  shipOrder = async (c: IdParamContext) => {
    if (!checkSimulationSecret(c)) {
      return c.json({ detail: "Invalid Simulation Secret" }, 403);
    }

    const { id } = c.req.valid("param");
    try {
      await this.checkoutService.shipOrder(id);
      return c.json({ status: "shipped" }, 200);
    } catch (e: any) {
      if (e.message === "Order not found") {
        return c.json({ detail: "Order not found" }, 404);
      }
      return c.json({ detail: e.message }, 500);
    }
  };

  /**
   * Mint a closed-loop gift card into the funding ledger, over HTTP.
   *
   * Exists because the agent's demo wallet used to mint one by shelling out to this store's
   * own `pnpm issue-card` script directly against the local filesystem — a local-machine
   * assumption that silently wrote to the *caller's* disk once the agent and the store became
   * separate deployed services, rather than reaching the store's actual ledger at all. This is
   * the fix, and a testing-only endpoint (guarded the same way `shipOrder` above is) rather
   * than a real merchant capability: minting a card with a caller-chosen code and balance is
   * explicitly a demo/test action, never something a real storefront exposes.
   */
  issueCard = async (c: IssueCardContext) => {
    if (!checkSimulationSecret(c)) {
      return c.json({ detail: "Invalid Simulation Secret" }, 403);
    }

    const { code, pin, dollars, userId } = c.req.valid("json");
    const cents = Math.round(dollars * 100);
    const card = await getFundingStore().cards.issueClosedLoop({
      userId: userId ?? "demo-user",
      code,
      pin,
      initialBalance: minorUnits(cents),
    });
    return c.json({ id: card.id, last4: card.last4 }, 201);
  };
}
