/**
 * Resolve a request-scoped LivePostHogClient from the authenticated user's
 * stored PostHog connection + project selection.
 */
import { LivePostHogClient } from "../posthog/live/index.js";
import type { PostHogClient } from "../posthog/types.js";
import type { Principal } from "./auth.js";
import {
  decryptConnectionTokens,
  decryptProjectToken,
} from "./db/memory.js";
import type { ConnectionStore } from "./db/types.js";
import {
  posthogClientIdUrl,
  refreshAccessToken,
} from "./oauth/posthog.js";
import { publicBaseUrl } from "./oauth/prm.js";

export type ResolveResult =
  | { ok: true; client: PostHogClient }
  | { ok: false; status: 403 | 401; message: string; onboardingUrl: string };

export async function resolveUserPostHogClient(opts: {
  principal: Principal;
  store: ConnectionStore;
  encryptionKey?: string;
}): Promise<ResolveResult> {
  const onboardingUrl = `${publicBaseUrl()}/onboarding`;
  const { principal, store } = opts;

  if (principal.type === "api_key") {
    return {
      ok: false,
      status: 403,
      message:
        "API key auth cannot use stored PostHog OAuth connections; pass X-PostHog-* headers or complete OAuth onboarding",
      onboardingUrl,
    };
  }

  const user =
    (await store.getUserByWorkosId(principal.workosUserId ?? principal.id)) ??
    (await store.upsertUser(
      principal.workosUserId ?? principal.id,
      principal.email,
    ));

  const connection = await store.getConnectionByUserId(user.id);
  if (!connection) {
    return {
      ok: false,
      status: 403,
      message: `Connect PostHog to use these tools: ${onboardingUrl}`,
      onboardingUrl,
    };
  }

  const selection = await store.getProjectSelection(user.id);
  if (!selection) {
    return {
      ok: false,
      status: 403,
      message: `Select a PostHog project: ${onboardingUrl}`,
      onboardingUrl,
    };
  }

  let tokens = decryptConnectionTokens(connection, opts.encryptionKey);
  const expiresAt = connection.accessExpiresAt?.getTime() ?? 0;
  const needsRefresh = !expiresAt || expiresAt < Date.now() + 60_000;

  if (needsRefresh) {
    await store.withConnectionLock(connection.id, async () => {
      const fresh = await store.getConnectionByUserId(user.id);
      if (!fresh) return;
      const current = decryptConnectionTokens(fresh, opts.encryptionKey);
      const stillExpired =
        !fresh.accessExpiresAt ||
        fresh.accessExpiresAt.getTime() < Date.now() + 60_000;
      if (!stillExpired) {
        tokens = current;
        return;
      }
      const clientId = posthogClientIdUrl(publicBaseUrl());
      const refreshed = await refreshAccessToken({
        clientId,
        refreshToken: current.refreshToken,
      });
      const newRefresh = refreshed.refresh_token ?? current.refreshToken;
      const accessExpiresAt = refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000)
        : null;
      await store.updateConnectionTokens({
        connectionId: fresh.id,
        accessToken: refreshed.access_token,
        refreshToken: newRefresh,
        accessExpiresAt,
        encryptionKey: opts.encryptionKey,
      });
      tokens = {
        accessToken: refreshed.access_token,
        refreshToken: newRefresh,
      };
    });
  }

  const projectApiToken = decryptProjectToken(selection, opts.encryptionKey);
  if (!projectApiToken) {
    return {
      ok: false,
      status: 403,
      message: `Project API token missing — reconnect PostHog: ${onboardingUrl}`,
      onboardingUrl,
    };
  }

  const client = new LivePostHogClient({
    apiKey: projectApiToken,
    host: connection.captureHost,
    appHost: connection.appHost,
    oauthAccessToken: tokens.accessToken,
    projectId: selection.projectId,
  });

  return { ok: true, client };
}
