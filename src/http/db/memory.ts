import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret } from "../crypto/tokens.js";
import type {
  ConnectionStore,
  OAuthStateRow,
  PostHogConnectionRow,
  ProjectSelectionRow,
  UpsertConnectionInput,
  UserRow,
} from "./types.js";

export function createMemoryStore(): ConnectionStore {
  const users = new Map<string, UserRow>();
  const byWorkos = new Map<string, string>();
  const connections = new Map<string, PostHogConnectionRow>();
  const byUserConnection = new Map<string, string>();
  const selections = new Map<string, ProjectSelectionRow>();
  const states = new Map<string, OAuthStateRow>();
  const locks = new Map<string, Promise<unknown>>();

  return {
    async upsertUser(workosUserId, email = null) {
      const existingId = byWorkos.get(workosUserId);
      if (existingId) {
        const u = users.get(existingId)!;
        if (email != null) u.email = email;
        u.updatedAt = new Date();
        return { ...u };
      }
      const id = randomUUID();
      const now = new Date();
      const row: UserRow = {
        id,
        workosUserId,
        email,
        createdAt: now,
        updatedAt: now,
      };
      users.set(id, row);
      byWorkos.set(workosUserId, id);
      return { ...row };
    },

    async getUserById(id) {
      const u = users.get(id);
      return u ? { ...u } : null;
    },

    async getUserByWorkosId(workosUserId) {
      const id = byWorkos.get(workosUserId);
      return id ? this.getUserById(id) : null;
    },

    async upsertConnection(input: UpsertConnectionInput) {
      const existingId = byUserConnection.get(input.userId);
      const now = new Date();
      const accessTokenEnc = encryptSecret(input.accessToken, input.encryptionKey);
      const refreshTokenEnc = encryptSecret(
        input.refreshToken,
        input.encryptionKey,
      );
      if (existingId) {
        const row = connections.get(existingId)!;
        row.posthogUserId = input.posthogUserId ?? row.posthogUserId;
        row.region = input.region;
        row.appHost = input.appHost;
        row.captureHost = input.captureHost;
        row.accessTokenEnc = accessTokenEnc;
        row.refreshTokenEnc = refreshTokenEnc;
        row.accessExpiresAt = input.accessExpiresAt ?? null;
        row.scopes = [...input.scopes];
        row.updatedAt = now;
        return { ...row, scopes: [...row.scopes] };
      }
      const id = randomUUID();
      const row: PostHogConnectionRow = {
        id,
        userId: input.userId,
        posthogUserId: input.posthogUserId ?? null,
        region: input.region,
        appHost: input.appHost,
        captureHost: input.captureHost,
        accessTokenEnc,
        refreshTokenEnc,
        accessExpiresAt: input.accessExpiresAt ?? null,
        scopes: [...input.scopes],
        createdAt: now,
        updatedAt: now,
      };
      connections.set(id, row);
      byUserConnection.set(input.userId, id);
      return { ...row, scopes: [...row.scopes] };
    },

    async getConnectionByUserId(userId) {
      const id = byUserConnection.get(userId);
      if (!id) return null;
      const row = connections.get(id);
      return row ? { ...row, scopes: [...row.scopes] } : null;
    },

    async deleteConnectionByUserId(userId) {
      const id = byUserConnection.get(userId);
      if (id) connections.delete(id);
      byUserConnection.delete(userId);
      selections.delete(userId);
    },

    async setProjectSelection(input) {
      const now = new Date();
      const row: ProjectSelectionRow = {
        userId: input.userId,
        connectionId: input.connectionId,
        projectId: input.projectId,
        projectName: input.projectName ?? null,
        projectApiTokenEnc: input.projectApiToken
          ? encryptSecret(input.projectApiToken, input.encryptionKey)
          : null,
        updatedAt: now,
      };
      selections.set(input.userId, row);
      return { ...row };
    },

    async getProjectSelection(userId) {
      const row = selections.get(userId);
      return row ? { ...row } : null;
    },

    async clearProjectSelection(userId) {
      selections.delete(userId);
    },

    async saveOAuthState(row) {
      states.set(row.state, { ...row });
    },

    async takeOAuthState(state) {
      const row = states.get(state);
      if (!row) return null;
      states.delete(state);
      if (row.expiresAt.getTime() < Date.now()) return null;
      return { ...row };
    },

    async updateConnectionTokens(input) {
      const row = connections.get(input.connectionId);
      if (!row) throw new Error("connection not found");
      row.accessTokenEnc = encryptSecret(input.accessToken, input.encryptionKey);
      row.refreshTokenEnc = encryptSecret(
        input.refreshToken,
        input.encryptionKey,
      );
      row.accessExpiresAt = input.accessExpiresAt ?? null;
      row.updatedAt = new Date();
    },

    async withConnectionLock(connectionId, fn) {
      const prev = locks.get(connectionId) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      locks.set(
        connectionId,
        prev.then(() => gate),
      );
      await prev;
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

export function decryptConnectionTokens(
  row: PostHogConnectionRow,
  encryptionKey?: string,
): { accessToken: string; refreshToken: string } {
  return {
    accessToken: decryptSecret(row.accessTokenEnc, encryptionKey),
    refreshToken: decryptSecret(row.refreshTokenEnc, encryptionKey),
  };
}

export function decryptProjectToken(
  row: ProjectSelectionRow,
  encryptionKey?: string,
): string | null {
  if (!row.projectApiTokenEnc) return null;
  return decryptSecret(row.projectApiTokenEnc, encryptionKey);
}
