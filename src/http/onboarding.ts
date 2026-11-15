/**
 * Web onboarding: PostHog OAuth + project picker (after MCP/WorkOS identity).
 */
import type { ConnectionStore } from "./db/types.js";
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  generatePkce,
  getProject,
  listProjects,
  posthogCallbackUrl,
  posthogCimdDocument,
  posthogClientIdUrl,
  probePostHogRegion,
  revokeToken,
} from "./oauth/posthog.js";
import { publicBaseUrl } from "./oauth/prm.js";
import {
  decryptConnectionTokens,
} from "./db/memory.js";

function html(body: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Analytics MCP</title>
    <style>
      body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.5}
      a.button,button{display:inline-block;background:#1a1a1a;color:#f5c400;padding:.6rem 1rem;border-radius:8px;text-decoration:none;border:0;cursor:pointer}
      li{margin:.4rem 0} .err{color:#b00020}
    </style></head><body>${body}</body></html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Resolve local user id from query `user` (our UUID) — set after WorkOS upsert
 * via /onboarding?user=…  For MCP OAuth users opening the link from tool errors.
 */
export function createOnboardingHandler(store: ConnectionStore) {
  return async function handleOnboarding(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const base = publicBaseUrl();

    if (path === "/oauth/posthog-client" && request.method === "GET") {
      return new Response(JSON.stringify(posthogCimdDocument(base), null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    if (path === "/onboarding" && request.method === "GET") {
      const userId = url.searchParams.get("user");
      if (!userId) {
        return html(
          `<h1>Connect PostHog</h1>
           <p>Open this page from Cursor after signing in, or pass <code>?user=&lt;id&gt;</code>.</p>
           <p>Your MCP client authenticates via OAuth first; then connect PostHog here.</p>`,
        );
      }
      const user = await store.getUserById(userId);
      if (!user) {
        return html(`<p class="err">Unknown user. Sign in via Cursor MCP OAuth first.</p>`, 404);
      }
      const connection = await store.getConnectionByUserId(userId);
      const selection = await store.getProjectSelection(userId);
      if (!connection) {
        return html(
          `<h1>Connect PostHog</h1>
           <p>Signed in as ${user.email ?? user.id}</p>
           <p><a class="button" href="/oauth/posthog/start?user=${encodeURIComponent(userId)}">Authorize PostHog</a></p>`,
        );
      }
      if (!selection) {
        return html(
          `<h1>Select a project</h1>
           <p><a class="button" href="/onboarding/projects?user=${encodeURIComponent(userId)}">Choose project</a></p>
           <p><a href="/oauth/posthog/disconnect?user=${encodeURIComponent(userId)}">Disconnect PostHog</a></p>`,
        );
      }
      return html(
        `<h1>Connected</h1>
         <p>Project <strong>${selection.projectName ?? selection.projectId}</strong> is linked.</p>
         <p>You can return to Cursor and use the PostHog tools.</p>
         <p><a href="/onboarding/projects?user=${encodeURIComponent(userId)}">Change project</a> ·
            <a href="/oauth/posthog/disconnect?user=${encodeURIComponent(userId)}">Disconnect</a></p>`,
      );
    }

    if (path === "/oauth/posthog/start" && request.method === "GET") {
      const userId = url.searchParams.get("user");
      if (!userId || !(await store.getUserById(userId))) {
        return html(`<p class="err">Missing or invalid user</p>`, 400);
      }
      const pkce = generatePkce();
      await store.saveOAuthState({
        state: pkce.state,
        userId,
        codeVerifier: pkce.codeVerifier,
        redirectAfter: `/onboarding/projects?user=${encodeURIComponent(userId)}`,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
      const authorize = buildAuthorizeUrl({
        clientId: posthogClientIdUrl(base),
        redirectUri: posthogCallbackUrl(base),
        state: pkce.state,
        codeChallenge: pkce.codeChallenge,
      });
      return Response.redirect(authorize, 302);
    }

    if (path === "/oauth/posthog/callback" && request.method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const err = url.searchParams.get("error");
      if (err) {
        return html(`<p class="err">PostHog authorization failed: ${err}</p>`, 400);
      }
      if (!code || !state) {
        return html(`<p class="err">Missing code/state</p>`, 400);
      }
      const saved = await store.takeOAuthState(state);
      if (!saved) {
        return html(`<p class="err">Invalid or expired state</p>`, 400);
      }
      try {
        const tokens = await exchangeAuthorizationCode({
          clientId: posthogClientIdUrl(base),
          redirectUri: posthogCallbackUrl(base),
          code,
          codeVerifier: saved.codeVerifier,
        });
        if (!tokens.refresh_token) {
          return html(
            `<p class="err">No refresh token returned — cannot persist connection.</p>`,
            400,
          );
        }
        const hosts = await probePostHogRegion(tokens.access_token);
        const expires = tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null;
        await store.upsertConnection({
          userId: saved.userId,
          region: hosts.region,
          appHost: hosts.appHost,
          captureHost: hosts.captureHost,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          accessExpiresAt: expires,
          scopes: tokens.scope?.split(/\s+/).filter(Boolean) ?? [],
        });
        const next =
          saved.redirectAfter ??
          `/onboarding/projects?user=${encodeURIComponent(saved.userId)}`;
        return Response.redirect(`${base}${next.startsWith("/") ? next : `/${next}`}`, 302);
      } catch (e) {
        return html(
          `<p class="err">${e instanceof Error ? e.message : String(e)}</p>`,
          500,
        );
      }
    }

    if (path === "/onboarding/projects" && request.method === "GET") {
      const userId = url.searchParams.get("user");
      if (!userId) return html(`<p class="err">Missing user</p>`, 400);
      const connection = await store.getConnectionByUserId(userId);
      if (!connection) {
        return Response.redirect(
          `${base}/onboarding?user=${encodeURIComponent(userId)}`,
          302,
        );
      }
      try {
        const { accessToken } = decryptConnectionTokens(connection);
        const projects = await listProjects(connection.appHost, accessToken);
        const items = projects
          .map(
            (p) =>
              `<li><form method="POST" action="/onboarding/projects" style="display:inline">
                <input type="hidden" name="user" value="${userId}"/>
                <input type="hidden" name="projectId" value="${p.id}"/>
                <input type="hidden" name="projectName" value="${String(p.name).replace(/"/g, "&quot;")}"/>
                <button type="submit">${p.name} (#${p.id})</button>
              </form></li>`,
          )
          .join("");
        return html(
          `<h1>Select a PostHog project</h1><ul>${items || "<li>No projects found</li>"}</ul>`,
        );
      } catch (e) {
        return html(
          `<p class="err">${e instanceof Error ? e.message : String(e)}</p>`,
          500,
        );
      }
    }

    if (path === "/onboarding/projects" && request.method === "POST") {
      const form = await request.formData();
      const userId = String(form.get("user") ?? "");
      const projectId = String(form.get("projectId") ?? "");
      const projectName = String(form.get("projectName") ?? "");
      const connection = await store.getConnectionByUserId(userId);
      if (!connection || !projectId) {
        return html(`<p class="err">Invalid selection</p>`, 400);
      }
      try {
        const { accessToken } = decryptConnectionTokens(connection);
        const project = await getProject(
          connection.appHost,
          accessToken,
          projectId,
        );
        const apiToken = project.api_token;
        if (!apiToken) {
          return html(
            `<p class="err">Project has no api_token — grant project:read and retry.</p>`,
            400,
          );
        }
        await store.setProjectSelection({
          userId,
          connectionId: connection.id,
          projectId: String(project.id),
          projectName: project.name || projectName,
          projectApiToken: apiToken,
        });
        return Response.redirect(
          `${base}/onboarding?user=${encodeURIComponent(userId)}`,
          302,
        );
      } catch (e) {
        return html(
          `<p class="err">${e instanceof Error ? e.message : String(e)}</p>`,
          500,
        );
      }
    }

    if (path === "/oauth/posthog/disconnect" && request.method === "GET") {
      const userId = url.searchParams.get("user");
      if (!userId) return html(`<p class="err">Missing user</p>`, 400);
      const connection = await store.getConnectionByUserId(userId);
      if (connection) {
        try {
          const { accessToken, refreshToken } =
            decryptConnectionTokens(connection);
          await revokeToken(accessToken);
          await revokeToken(refreshToken);
        } catch {
          // ignore revoke errors
        }
        await store.deleteConnectionByUserId(userId);
      }
      return Response.redirect(
        `${base}/onboarding?user=${encodeURIComponent(userId)}`,
        302,
      );
    }

    return null;
  };
}

export function ensureUserQueryLink(userId: string): string {
  return `${publicBaseUrl()}/onboarding?user=${encodeURIComponent(userId)}`;
}
