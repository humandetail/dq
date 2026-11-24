import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("Vite serves the application page and its TypeScript entry", async (context) => {
  const server = await createServer({
    server: { host: "127.0.0.1", port: 0, ws: false },
  });
  context.after(() => server.close());
  await server.listen();

  const [url] = server.resolvedUrls.local;
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /^text\/html\b/);
  const html = await page.text();
  assert.match(html, /id="app-status"/);
  const entryPath = html.match(/<script type="module" src="(\/src\/main\.ts)"><\/script>/)?.[1];
  assert.ok(entryPath, "the page loads the formal entry as a module");

  const entry = await fetch(new URL(entryPath, url));
  assert.equal(entry.status, 200);
  assert.match(entry.headers.get("content-type"), /javascript/);
  assert.match(await entry.text(), /应用已启动/);
});
