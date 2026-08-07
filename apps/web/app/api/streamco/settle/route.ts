/**
 * StreamCo settlement notice — the biller being told, out-of-band, that its bill was paid.
 *
 * This is **not** a checkout API the agent drives (StreamCo deliberately has none). It is the
 * reconciliation step: the agent settled the bill on our own rails (gift ledger + a real test-mode
 * card) and now notifies StreamCo so the account can show paid. A failed notice never un-settles a
 * real charge, so this only records what already happened.
 */
import { NextResponse } from "next/server";

import { getAccount, markPaid } from "@/lib/streamco";

interface SettleBody {
  account?: string;
  handle?: string;
  gift_drawn_minor?: number;
  card_charged_minor?: number;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: SettleBody;
  try {
    body = (await request.json()) as SettleBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const account = body.account;
  if (!account || typeof account !== "string") {
    return NextResponse.json({ error: "account is required" }, { status: 400 });
  }
  if (!(await getAccount(account))) {
    return NextResponse.json({ error: `unknown StreamCo account ${account}` }, { status: 404 });
  }

  const updated = await markPaid(account, {
    handle: typeof body.handle === "string" ? body.handle : "unknown",
    giftDrawnMinor: Number.isInteger(body.gift_drawn_minor) ? (body.gift_drawn_minor as number) : 0,
    cardChargedMinor: Number.isInteger(body.card_charged_minor) ? (body.card_charged_minor as number) : 0,
  });

  return NextResponse.json({ ok: true, status: updated?.status ?? "paid" });
}
