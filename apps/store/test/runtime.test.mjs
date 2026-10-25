/** Exercises the production server and catches per-request logger worker leaks. */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

test("store serves requests without adding logging workers", { timeout: 20000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "pay-agent-runtime-"));
  await mkdir(join(directory, "databases"));
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ["--import", createRequire(import.meta.url).resolve("tsx"), fileURLToPath(new URL("../src/index.ts", import.meta.url))], {
    cwd: directory,
    env: { PATH: process.env.PATH, PORT: String(port), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const exit = once(child, "exit");
  const base = `http://127.0.0.1:${port}`;
  async function request(path) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, output);
    return response.json();
  }
  async function threads() {
    const status = await readFile(`/proc/${child.pid}/status`, "utf8");
    return Number(status.match(/^Threads:\s+(\d+)$/m)[1]);
  }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      assert.equal(child.exitCode, null, output);
      try {
        await request("/health");
        ready = true;
        break;
      } catch { await delay(50); }
    }
    assert.ok(ready, output);
    assert.deepEqual(await request("/health"), { ok: true, service: "pay-agent-store" });
    for (let i = 0; i < 5; i++) await request("/products");
    await delay(200);
    const before = process.platform === "linux" ? await threads() : null;
    for (let i = 0; i < 50; i++) await request("/products");
    await delay(200);
    if (before !== null) assert.equal(await threads(), before, "requests must reuse the logging worker");
    assert.match(output, /GET .*\/products/);
  } finally {
    child.kill("SIGTERM");
    await exit;
    await rm(directory, { recursive: true, force: true });
  }
});
