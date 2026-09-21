/**
 * Links a newly-installed shop to a pay-agent Cloud tenant, so the embedded admin page can show
 * real mandate usage instead of "not yet linked". This app holds a Cloud admin token to do it —
 * a deliberate choice (see README): the blast radius of that token leaking is "someone can create
 * junk free-tier tenants", not "someone can move money", so it's an acceptable trade for the app
 * actually working end to end.
 */
export interface CloudLinkConfig {
  readonly cloudUrl: string;
  readonly cloudAdminToken: string;
}

/** Creates a pay-agent Cloud tenant named after the shop and returns its API key. Throws on failure — the caller decides whether that should block install. */
export async function provisionCloudTenant(shopDomain: string, config: CloudLinkConfig): Promise<string> {
  const res = await fetch(`${config.cloudUrl}/v1/tenants`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.cloudAdminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: shopDomain }),
  });
  if (!res.ok) {
    throw new Error(`pay-agent Cloud tenant provisioning failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { apiKey: string };
  return body.apiKey;
}
