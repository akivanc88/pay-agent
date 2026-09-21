/** Verifies the Cloud tenant provisioning call shape and that failures throw rather than swallow silently. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { provisionCloudTenant } from "../src/cloud-link.js";

test("provisionCloudTenant posts to /v1/tenants with the admin token and returns the api key", async () => {
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(JSON.stringify({ apiKey: "pak_live_test" }), { status: 201 });
  }) as typeof fetch;

  const apiKey = await provisionCloudTenant("acme.myshopify.com", {
    cloudUrl: "https://cloud.example.com",
    cloudAdminToken: "admin-token",
  });

  assert.equal(apiKey, "pak_live_test");
  assert.equal(capturedUrl, "https://cloud.example.com/v1/tenants");
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, "Bearer admin-token");
  assert.deepEqual(JSON.parse(capturedInit?.body as string), { name: "acme.myshopify.com" });
});

test("provisionCloudTenant throws on a non-2xx response", async () => {
  globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
  await assert.rejects(() => provisionCloudTenant("acme.myshopify.com", { cloudUrl: "https://cloud.example.com", cloudAdminToken: "bad" }));
});
