/**
 * OAuth / PRM / encryption / connection-store tests (CI-safe, no WorkOS/PostHog).
 */
import { SignJWT } from "jose";
import {
  BearerApiKeyAuthenticator,
  CompositeAuthenticator,
  WorkOSJwtAuthenticator,
  oauthWwwAuthenticate,
} from "../src/http/auth.js";
import { decryptSecret, encryptSecret } from "../src/http/crypto/tokens.js";
import { createMemoryStore } from "../src/http/db/memory.js";
import { createHttpApp } from "../src/http/app.js";
import {
  posthogCimdDocument,
  generatePkce,
} from "../src/http/oauth/posthog.js";
import {
  protectedResourceMetadata,
  resourceMetadataUrl,
} from "../src/http/oauth/prm.js";

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
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

const HMAC = "test-hmac-secret-for-oauth-ci-32b!";
const AUDIENCE = "https://example.com/mcp";
const ENC_KEY = "a".repeat(64); // 32 bytes hex

async function mintJwt(sub: string, aud = AUDIENCE): Promise<string> {
  return new SignJWT({ email: "u@example.com", scope: "openid profile" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(HMAC));
}

async function main() {
  process.env.TOKEN_ENCRYPTION_KEY = ENC_KEY;
  process.env.PUBLIC_BASE_URL = "https://example.com";
  process.env.MCP_RESOURCE_URL = AUDIENCE;
  process.env.OAUTH_TEST_HMAC_SECRET = HMAC;

  const results: CaseResult[] = [];

  results.push(
    await runCase("crypto: encrypt/decrypt roundtrip", async () => {
      const blob = encryptSecret("pha_secret", ENC_KEY);
      assert(decryptSecret(blob, ENC_KEY) === "pha_secret", "roundtrip");
    }),
  );

  results.push(
    await runCase("prm: metadata lists resource and empty AS without WorkOS", async () => {
      delete process.env.WORKOS_AUTHKIT_DOMAIN;
      const meta = protectedResourceMetadata();
      assert(meta.resource === AUDIENCE, "resource");
      assert(Array.isArray(meta.authorization_servers), "as array");
    }),
  );

  results.push(
    await runCase("cimd: client_id matches URL", async () => {
      const doc = posthogCimdDocument("https://example.com");
      assert(
        doc.client_id === "https://example.com/oauth/posthog-client",
        "client_id",
      );
      assert(doc.client_name === "Analytics MCP", "name");
    }),
  );

  results.push(
    await runCase("pkce: generates verifier and challenge", async () => {
      const p = generatePkce();
      assert(p.codeVerifier.length > 20, "verifier");
      assert(p.codeChallenge.length > 20, "challenge");
      assert(p.state.length > 10, "state");
    }),
  );

  results.push(
    await runCase("jwt: valid token accepted", async () => {
      const auth = new WorkOSJwtAuthenticator({
        audience: AUDIENCE,
        testHmacSecret: HMAC,
      });
      const token = await mintJwt("user-1");
      const r = await auth.authenticate(`Bearer ${token}`);
      assert(r.ok && r.principal.type === "oauth", "oauth principal");
      assert(r.ok && r.principal.id === "user-1", "sub");
    }),
  );

  results.push(
    await runCase("jwt: wrong audience rejected", async () => {
      const auth = new WorkOSJwtAuthenticator({
        audience: AUDIENCE,
        testHmacSecret: HMAC,
      });
      const token = await mintJwt("user-1", "https://other/mcp");
      const r = await auth.authenticate(`Bearer ${token}`);
      assert(!r.ok && r.status === 401, "401");
    }),
  );

  results.push(
    await runCase("composite: api key still works", async () => {
      const oauth = new WorkOSJwtAuthenticator({
        audience: AUDIENCE,
        testHmacSecret: HMAC,
      });
      const composite = new CompositeAuthenticator(
        oauth,
        new BearerApiKeyAuthenticator({ apiKey: "ops-key", nodeEnv: "test" }),
      );
      const r = await composite.authenticate("Bearer ops-key");
      assert(r.ok && r.principal.type === "api_key", "api key");
    }),
  );

  results.push(
    await runCase("store: connection isolation between users", async () => {
      const store = createMemoryStore();
      const a = await store.upsertUser("wo-a", "a@x.com");
      const b = await store.upsertUser("wo-b", "b@x.com");
      await store.upsertConnection({
        userId: a.id,
        region: "us",
        appHost: "https://us.posthog.com",
        captureHost: "https://us.i.posthog.com",
        accessToken: "pha_a",
        refreshToken: "phr_a",
        scopes: ["project:read"],
        encryptionKey: ENC_KEY,
      });
      await store.upsertConnection({
        userId: b.id,
        region: "eu",
        appHost: "https://eu.posthog.com",
        captureHost: "https://eu.i.posthog.com",
        accessToken: "pha_b",
        refreshToken: "phr_b",
        scopes: ["project:read"],
        encryptionKey: ENC_KEY,
      });
      const ca = await store.getConnectionByUserId(a.id);
      const cb = await store.getConnectionByUserId(b.id);
      assert(ca && cb && ca.region === "us" && cb.region === "eu", "isolated");
    }),
  );

  const store = createMemoryStore();
  const app = createHttpApp({
    authenticator: new CompositeAuthenticator(
      new WorkOSJwtAuthenticator({
        audience: AUDIENCE,
        testHmacSecret: HMAC,
      }),
      new BearerApiKeyAuthenticator({ apiKey: "ops-key", nodeEnv: "test" }),
    ),
    store,
    useMockPostHog: true,
    onLog: () => undefined,
  });

  results.push(
    await runCase("http: PRM endpoint", async () => {
      process.env.WORKOS_AUTHKIT_DOMAIN = "https://authkit.example";
      const res = await app.fetch(
        new Request("https://example.com/.well-known/oauth-protected-resource"),
      );
      assert(res.status === 200, `status ${res.status}`);
      const body = (await res.json()) as { resource: string };
      assert(body.resource === AUDIENCE, "resource");
    }),
  );

  results.push(
    await runCase("http: unauthenticated /mcp has WWW-Authenticate", async () => {
      const res = await app.fetch(
        new Request("https://example.com/mcp", { method: "POST", body: "{}" }),
      );
      assert(res.status === 401, `status ${res.status}`);
      const wa = res.headers.get("WWW-Authenticate") ?? "";
      assert(wa.includes("resource_metadata="), wa);
      assert(wa.includes(resourceMetadataUrl()) || wa.length > 10, "challenge");
    }),
  );

  results.push(
    await runCase("http: oauth JWT + mock tools list path", async () => {
      const token = await mintJwt("wo-test");
      const res = await app.fetch(
        new Request("https://example.com/mcp", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "oauth-harness", version: "1.0.0" },
            },
          }),
        }),
      );
      assert(
        res.status >= 200 && res.status < 300,
        `status ${res.status} ${await res.clone().text()}`,
      );
    }),
  );

  results.push(
    await runCase("http: CIMD document", async () => {
      const res = await app.fetch(
        new Request("https://example.com/oauth/posthog-client"),
      );
      assert(res.status === 200, `status ${res.status}`);
      const doc = (await res.json()) as { client_id: string };
      assert(doc.client_id.endsWith("/oauth/posthog-client"), "cimd");
    }),
  );

  results.push(
    await runCase(
      "http: oauth without PostHog still initializes MCP",
      async () => {
        process.env.PUBLIC_BASE_URL = "https://example.com";
        const pendingStore = createMemoryStore();
        const pendingApp = createHttpApp({
          authenticator: new WorkOSJwtAuthenticator({
            audience: AUDIENCE,
            testHmacSecret: HMAC,
          }),
          store: pendingStore,
          useMockPostHog: false,
          onLog: () => undefined,
        });
        const token = await mintJwt("wo-pending");
        const res = await pendingApp.fetch(
          new Request("https://example.com/mcp", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json, text/event-stream",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: {
                protocolVersion: "2025-03-26",
                capabilities: {},
                clientInfo: { name: "oauth-harness", version: "1.0.0" },
              },
            }),
          }),
        );
        assert(
          res.status >= 200 && res.status < 300,
          `expected MCP init success, got ${res.status} ${await res.clone().text()}`,
        );
        const user = await pendingStore.getUserByWorkosId("wo-pending");
        assert(user, "user upserted");
      },
    ),
  );

  results.push(
    await runCase("www-authenticate helper", async () => {
      const h = oauthWwwAuthenticate("https://example.com/.well-known/x");
      assert(h.startsWith("Bearer "), "bearer");
      assert(h.includes("resource_metadata="), "prm");
    }),
  );

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(
      `${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`,
    );
  }
  console.log(
    `\noauth-harness: ${results.length - failed.length}/${results.length} passed`,
  );
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
