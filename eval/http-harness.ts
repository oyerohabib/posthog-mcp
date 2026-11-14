/**
 * HTTP MCP auth, header validation, health, and transport tests (CI-safe).
 * Uses mock PostHog after auth — no live credentials required.
 *
 * Run: tsx eval/http-harness.ts (also via npm test)
 */
import { createServer } from "node:http";
import { BearerApiKeyAuthenticator, redactHeaders } from "../src/http/auth.js";
import {
  parsePostHogHeaders,
  validatePostHogHost,
  allowedPostHogHosts,
} from "../src/http/posthog-headers.js";
import { createHttpApp } from "../src/http/app.js";
import { nodeRequestToWeb, webResponseToNode } from "../src/http/node-adapter.js";
import { EXPECTED_TOOL_NAMES } from "../src/tools/register.js";

type CaseResult = { name: string; ok: boolean; detail?: string };

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function runCase(
  name: string,
  body: () => Promise<void>,
): Promise<CaseResult> {
  try {
    await body();
    return { name, ok: true };
  } catch (err) {
    return {
      name: name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

const TEST_KEY = "test-mcp-api-key-for-ci-only";

function posthogHeaders(): Record<string, string> {
  return {
    "X-PostHog-API-Key": "phc_test_project_key",
    "X-PostHog-Personal-API-Key": "phx_test_personal_key",
    "X-PostHog-Project-ID": "12345",
    "X-PostHog-Host": "https://us.i.posthog.com",
  };
}

async function main() {
  const results: CaseResult[] = [];

  // --- Auth unit tests ---
  results.push(
    await runCase("auth: missing bearer → 401", async () => {
      const auth = new BearerApiKeyAuthenticator({
        apiKey: TEST_KEY,
        nodeEnv: "test",
      });
      const r = auth.authenticate(null);
      assert(!r.ok && r.status === 401, "expected 401");
    }),
  );

  results.push(
    await runCase("auth: invalid bearer → 401", async () => {
      const auth = new BearerApiKeyAuthenticator({
        apiKey: TEST_KEY,
        nodeEnv: "test",
      });
      const r = auth.authenticate("Bearer wrong-key");
      assert(!r.ok && r.status === 401, "expected 401");
    }),
  );

  results.push(
    await runCase("auth: valid bearer → principal", async () => {
      const auth = new BearerApiKeyAuthenticator({
        apiKey: TEST_KEY,
        nodeEnv: "test",
      });
      const r = auth.authenticate(`Bearer ${TEST_KEY}`);
      assert(r.ok && r.principal.id === "default", "expected principal");
      assert(r.principal.scopes.includes("mcp"), "expected mcp scope");
    }),
  );

  results.push(
    await runCase("auth: production without MCP_API_KEY → 503", async () => {
      const auth = new BearerApiKeyAuthenticator({
        apiKey: "",
        nodeEnv: "production",
      });
      const r = auth.authenticate(`Bearer anything`);
      assert(!r.ok && r.status === 503, "expected 503");
    }),
  );

  results.push(
    await runCase("auth: redactHeaders masks secrets", async () => {
      const redacted = redactHeaders({
        authorization: "Bearer secret",
        "x-posthog-api-key": "phc_xxx",
        "x-posthog-personal-api-key": "phx_yyy",
        "x-posthog-project-id": "1",
      });
      assert(redacted.authorization === "[REDACTED]", "auth redacted");
      assert(redacted["x-posthog-api-key"] === "[REDACTED]", "api key redacted");
      assert(
        redacted["x-posthog-personal-api-key"] === "[REDACTED]",
        "personal redacted",
      );
      assert(redacted["x-posthog-project-id"] === "1", "project id kept");
      const blob = JSON.stringify(redacted);
      assert(!blob.includes("secret"), "no secret leak");
      assert(!blob.includes("phc_xxx"), "no phc leak");
    }),
  );

  // --- Header validation ---
  results.push(
    await runCase("headers: missing project API key", async () => {
      const r = parsePostHogHeaders({
        "x-posthog-personal-api-key": "phx_x",
        "x-posthog-project-id": "1",
      });
      assert(!r.ok && r.message.includes("API-Key"), r.ok ? "" : r.message);
    }),
  );

  results.push(
    await runCase("headers: missing personal API key", async () => {
      const r = parsePostHogHeaders({
        "x-posthog-api-key": "phc_x",
        "x-posthog-project-id": "1",
      });
      assert(!r.ok && r.message.includes("Personal"), r.ok ? "" : r.message);
    }),
  );

  results.push(
    await runCase("headers: invalid project id", async () => {
      const r = parsePostHogHeaders({
        "x-posthog-api-key": "phc_x",
        "x-posthog-personal-api-key": "phx_x",
        "x-posthog-project-id": "abc",
      });
      assert(!r.ok && r.message.includes("Project-ID"), r.ok ? "" : r.message);
    }),
  );

  results.push(
    await runCase("headers: invalid host rejected", async () => {
      const r = parsePostHogHeaders({
        "x-posthog-api-key": "phc_x",
        "x-posthog-personal-api-key": "phx_x",
        "x-posthog-project-id": "1",
        "x-posthog-host": "https://evil.example.com",
      });
      assert(!r.ok && r.message.includes("allowed"), r.ok ? "" : r.message);
    }),
  );

  results.push(
    await runCase("headers: valid US host", async () => {
      const r = parsePostHogHeaders({
        "x-posthog-api-key": "phc_x",
        "x-posthog-personal-api-key": "phx_x",
        "x-posthog-project-id": "99",
        "x-posthog-host": "https://us.i.posthog.com",
      });
      assert(r.ok && r.config.host === "https://us.i.posthog.com", "us host");
    }),
  );

  results.push(
    await runCase("headers: valid EU host", async () => {
      const r = parsePostHogHeaders({
        "x-posthog-api-key": "phc_x",
        "x-posthog-personal-api-key": "phx_x",
        "x-posthog-project-id": "99",
        "x-posthog-host": "https://eu.i.posthog.com",
      });
      assert(r.ok && r.config.host === "https://eu.i.posthog.com", "eu host");
    }),
  );

  results.push(
    await runCase("headers: http scheme rejected", async () => {
      const r = validatePostHogHost("http://us.i.posthog.com");
      assert(!r.ok, "http must fail");
    }),
  );

  results.push(
    await runCase("headers: extra allowlist host", async () => {
      const allowed = allowedPostHogHosts("custom.posthog.example");
      const r = validatePostHogHost(
        "https://custom.posthog.example",
        allowed,
      );
      assert(r.ok, "custom host should pass");
    }),
  );

  results.push(
    await runCase("headers: configs isolated between parses", async () => {
      const a = parsePostHogHeaders({
        "x-posthog-api-key": "phc_a",
        "x-posthog-personal-api-key": "phx_a",
        "x-posthog-project-id": "1",
      });
      const b = parsePostHogHeaders({
        "x-posthog-api-key": "phc_b",
        "x-posthog-personal-api-key": "phx_b",
        "x-posthog-project-id": "2",
      });
      assert(a.ok && b.ok, "both ok");
      assert(a.config.apiKey === "phc_a" && b.config.apiKey === "phc_b", "isolated");
      assert(a.config.projectId !== b.config.projectId, "project ids differ");
    }),
  );

  // --- HTTP app integration (mock PostHog) ---
  const app = createHttpApp({
    authenticator: new BearerApiKeyAuthenticator({
      apiKey: TEST_KEY,
      nodeEnv: "test",
    }),
    useMockPostHog: true,
    allowedOrigins: new Set(),
    onLog: () => undefined,
  });

  results.push(
    await runCase("http: GET /health → 200", async () => {
      const res = await app.fetch(new Request("http://localhost/health"));
      assert(res.status === 200, `status ${res.status}`);
      const body = (await res.json()) as { ok: boolean };
      assert(body.ok === true, "ok true");
      const text = JSON.stringify(body);
      assert(!text.includes("MCP_API_KEY"), "no env leak");
      assert(!text.includes(TEST_KEY), "no key leak");
    }),
  );

  results.push(
    await runCase("http: unauthenticated /mcp → 401", async () => {
      const res = await app.fetch(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...posthogHeaders() },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "test", version: "1.0.0" },
            },
          }),
        }),
      );
      assert(res.status === 401, `status ${res.status}`);
    }),
  );

  results.push(
    await runCase("http: invalid origin → 403", async () => {
      const res = await app.fetch(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_KEY}`,
            Origin: "https://evil.example",
            "Content-Type": "application/json",
            ...posthogHeaders(),
          },
          body: "{}",
        }),
      );
      assert(res.status === 403, `status ${res.status}`);
    }),
  );

  results.push(
    await runCase("http: live path missing PostHog headers → 400", async () => {
      const liveApp = createHttpApp({
        authenticator: new BearerApiKeyAuthenticator({
          apiKey: TEST_KEY,
          nodeEnv: "test",
        }),
        useMockPostHog: false,
        onLog: () => undefined,
      });
      const res = await liveApp.fetch(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_KEY}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
      );
      assert(res.status === 400, `status ${res.status}`);
      const body = (await res.json()) as { error: string };
      assert(body.error.includes("PostHog"), body.error);
    }),
  );

  results.push(
    await runCase("http: MCP initialize + tools/list", async () => {
      const initRes = await app.fetch(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_KEY}`,
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
            ...posthogHeaders(),
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "http-harness", version: "1.0.0" },
            },
          }),
        }),
      );
      assert(
        initRes.status >= 200 && initRes.status < 300,
        `initialize status ${initRes.status}: ${await initRes.clone().text()}`,
      );

      const listRes = await app.fetch(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_KEY}`,
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
            ...posthogHeaders(),
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/list",
            params: {},
          }),
        }),
      );
      assert(
        listRes.status >= 200 && listRes.status < 300,
        `tools/list status ${listRes.status}`,
      );
      const listText = await listRes.text();
      // Response may be JSON or SSE; look for known tool names
      const found = EXPECTED_TOOL_NAMES.filter((n) => listText.includes(n));
      assert(
        found.length >= 10,
        `expected many tools in response, found ${found.length}: ${listText.slice(0, 400)}`,
      );
      assert(!listText.includes(TEST_KEY), "no api key in MCP body");
      assert(!listText.includes("phc_test_project_key"), "no phc in body");
    }),
  );

  results.push(
    await runCase("http: node adapter serves /health", async () => {
      const server = createServer(async (req, res) => {
        const webReq = await nodeRequestToWeb(req, {
          baseUrl: "http://127.0.0.1",
        });
        const webRes = await app.fetch(webReq);
        await webResponseToNode(webRes, res);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const addr = server.address();
      assert(addr && typeof addr === "object", "address");
      const port = addr.port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        assert(res.status === 200, `status ${res.status}`);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve())),
        );
      }
    }),
  );

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log(
    `\nhttp-harness: ${results.length - failed.length}/${results.length} passed`,
  );
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
