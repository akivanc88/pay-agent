/** The HTTP primitive retains structured failures without choosing retry policy. */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createJsonClient, ProtocolHttpError } from "../src/index.js";

test("structured issuer failures retain status, detail, and code", async () => {
  const request = createJsonClient({
    baseUrl: "https://store.test/",
    fetch: async () =>
      new Response(JSON.stringify({ detail: "Your card was declined.", code: "card_declined" }), {
        status: 402,
      }),
  });

  await assert.rejects(
    request("/complete", { method: "POST" }),
    (error: unknown) =>
      error instanceof ProtocolHttpError &&
      error.status === 402 &&
      error.detail === "Your card was declined." &&
      error.code === "card_declined",
  );
});

test("non-JSON failures preserve response text as detail", async () => {
  const request = createJsonClient({
    baseUrl: "https://store.test",
    fetch: async () => new Response("upstream unavailable", { status: 503 }),
  });
  await assert.rejects(
    request("/quote", { method: "GET" }),
    (error: unknown) =>
      error instanceof ProtocolHttpError && error.status === 503 && error.detail === "upstream unavailable",
  );
});
