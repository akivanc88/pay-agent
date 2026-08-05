/** Parses UCP agent profiles and delivers nonfatal merchant webhooks. */

import { v4 as uuidv4 } from "uuid";

import { getOrder } from "../data";
import type { ExtendedCheckoutResponse, Order } from "../models";

export interface PlatformConfig {
  webhook_url?: string;
}

export async function parseAgentProfile(
  ucpAgentHeader: string | undefined,
): Promise<PlatformConfig | undefined> {
  if (!ucpAgentHeader) return undefined;

  const match = ucpAgentHeader.match(/profile="([^"]+)"/);
  if (!match) return undefined;

  try {
    let profileData:
      | {
          ucp?: {
            capabilities?: Record<
              string,
              Array<{ name: string; config?: PlatformConfig }>
            >;
          };
        }
      | undefined;

    const profileUri = match[1]!;
    if (profileUri.startsWith("data:")) {
      const base64Data = profileUri.split(",")[1];
      if (base64Data) {
        profileData = JSON.parse(
          Buffer.from(base64Data, "base64").toString("utf-8"),
        );
      }
    } else if (profileUri.startsWith("http")) {
      const response = await fetch(profileUri);
      if (response.ok) profileData = (await response.json()) as typeof profileData;
    }

    const orderCapability =
      profileData?.ucp?.capabilities?.["dev.ucp.shopping.order"]?.[0];
    if (orderCapability?.config?.webhook_url) {
      return { webhook_url: orderCapability.config.webhook_url };
    }
  } catch (error) {
    console.warn("Failed to fetch or parse agent profile", error);
  }
  return undefined;
}

export async function notifyOrderWebhook(
  checkout: ExtendedCheckoutResponse,
  eventType: string,
): Promise<void> {
  if (!checkout.platform?.webhook_url) return;

  let order: Order | undefined;
  if (checkout.order) order = getOrder(checkout.order.id);
  if (!order) {
    console.warn(
      `Skipping ${eventType} webhook for checkout ${checkout.id}: no order to deliver`,
    );
    return;
  }

  const webhookUrl = checkout.platform.webhook_url;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Event-Type": eventType,
        "Webhook-Id": uuidv4(),
        "Webhook-Timestamp": Math.floor(Date.now() / 1000).toString(),
      },
      body: JSON.stringify(order),
    });
  } catch (error) {
    console.error(`Failed to notify webhook at ${webhookUrl}`, error);
  }
}
