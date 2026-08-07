/** Reset a StreamCo bill back to "due" so the demo can be run again. Simulation-only convenience. */
import { NextResponse } from "next/server";

import { getAccount, resetAccount } from "@/lib/streamco";

export async function POST(request: Request): Promise<NextResponse> {
  let account: string | undefined;
  try {
    account = ((await request.json()) as { account?: string }).account;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!account || !(await getAccount(account))) {
    return NextResponse.json({ error: "unknown account" }, { status: 404 });
  }
  const updated = await resetAccount(account);
  return NextResponse.json({ ok: true, status: updated?.status ?? "due" });
}
