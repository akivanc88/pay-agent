/**
 * StreamCo is a *different product* from the florist — a simulated subscription biller — so it gets
 * its own self-contained chrome and palette rather than the shop's header and design tokens. That
 * separation is deliberate: the capstone's argument is a blind comparison against a real streaming
 * service's billing page, and that only lands if StreamCo reads as its own brand, not as our store
 * wearing a different hat. The palette lives scoped in `streamco.module.css`, not in globals.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "StreamCo — Account & Billing",
  description: "A simulated subscription biller used to demonstrate pay-agent against a no-API destination.",
};

export default function StreamCoLayout({ children }: { children: ReactNode }) {
  return children;
}
