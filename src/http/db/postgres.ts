import pg from "pg";
import { encryptSecret } from "../crypto/tokens.js";
import type {
  ConnectionStore,
  OAuthStateRow,
  PostHogConnectionRow,
  ProjectSelectionRow,
  UpsertConnectionInput,
  UserRow,
} from "./types.js";

const { Pool } = pg;

const MIGRATION_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workos_user_id TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posthog_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  posthog_user_id TEXT,
  region TEXT NOT NULL CHECK (region IN ('us', 'eu')),
  app_host TEXT NOT NULL,
  capture_host TEXT NOT NULL,
  access_token_enc BYTEA NOT NULL,
  refresh_token_enc BYTEA NOT NULL,
  access_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posthog_project_selections (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES posthog_connections(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  project_name TEXT,
  project_api_token_enc BYTEA,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  redirect_after TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

function mapUser(r: pg.QueryResultRow): UserRow {
  return {
    id: r.id,
    workosUserId: r.workos_user_id,
    email: r.email,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapConnection(r: pg.QueryResultRow): PostHogConnectionRow {
  return {
    id: r.id,
    userId: r.user_id,
    posthogUserId: r.posthog_user_id,
    region: r.region,
    appHost: r.app_host,
    captureHost: r.capture_host,
    accessTokenEnc: r.access_token_enc,
    refreshTokenEnc: r.refresh_token_enc,
    accessExpiresAt: r.access_expires_at,
    scopes: r.scopes ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapSelection(r: pg.QueryResultRow): ProjectSelectionRow {
  return {
    userId: r.user_id,
    connectionId: r.connection_id,
    projectId: r.project_id,
    projectName: r.project_name,
    projectApiTokenEnc: r.project_api_token_enc,
    updatedAt: r.updated_at,
  };
}

export async function createPostgresStore(
  databaseUrl: string,
): Promise<ConnectionStore> {
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query(MIGRATION_SQL);

  const store: ConnectionStore = {
    async upsertUser(workosUserId, email = null) {
      const res = await pool.query(
        `INSERT INTO users (workos_user_id, email)
         VALUES ($1, $2)
         ON CONFLICT (workos_user_id) DO UPDATE
           SET email = COALESCE(EXCLUDED.email, users.email),
               updated_at = now()
         RETURNING *`,
        [workosUserId, email],
      );
      return mapUser(res.rows[0]!);
    },

    async getUserById(id) {
      const res = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
      return res.rows[0] ? mapUser(res.rows[0]) : null;
    },

    async getUserByWorkosId(workosUserId) {
      const res = await pool.query(
        `SELECT * FROM users WHERE workos_user_id = $1`,
        [workosUserId],
      );
      return res.rows[0] ? mapUser(res.rows[0]) : null;
    },

    async upsertConnection(input: UpsertConnectionInput) {
      const accessTokenEnc = encryptSecret(
        input.accessToken,
        input.encryptionKey,
      );
      const refreshTokenEnc = encryptSecret(
        input.refreshToken,
        input.encryptionKey,
      );
      const res = await pool.query(
        `INSERT INTO posthog_connections (
           user_id, posthog_user_id, region, app_host, capture_host,
           access_token_enc, refresh_token_enc, access_expires_at, scopes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (user_id) DO UPDATE SET
           posthog_user_id = COALESCE(EXCLUDED.posthog_user_id, posthog_connections.posthog_user_id),
           region = EXCLUDED.region,
           app_host = EXCLUDED.app_host,
           capture_host = EXCLUDED.capture_host,
           access_token_enc = EXCLUDED.access_token_enc,
           refresh_token_enc = EXCLUDED.refresh_token_enc,
           access_expires_at = EXCLUDED.access_expires_at,
           scopes = EXCLUDED.scopes,
           updated_at = now()
         RETURNING *`,
        [
          input.userId,
          input.posthogUserId ?? null,
          input.region,
          input.appHost,
          input.captureHost,
          accessTokenEnc,
          refreshTokenEnc,
          input.accessExpiresAt ?? null,
          input.scopes,
        ],
      );
      return mapConnection(res.rows[0]!);
    },

    async getConnectionByUserId(userId) {
      const res = await pool.query(
        `SELECT * FROM posthog_connections WHERE user_id = $1`,
        [userId],
      );
      return res.rows[0] ? mapConnection(res.rows[0]) : null;
    },

    async deleteConnectionByUserId(userId) {
      await pool.query(`DELETE FROM posthog_project_selections WHERE user_id = $1`, [
        userId,
      ]);
      await pool.query(`DELETE FROM posthog_connections WHERE user_id = $1`, [
        userId,
      ]);
    },

    async setProjectSelection(input) {
      const enc = input.projectApiToken
        ? encryptSecret(input.projectApiToken, input.encryptionKey)
        : null;
      const res = await pool.query(
        `INSERT INTO posthog_project_selections (
           user_id, connection_id, project_id, project_name, project_api_token_enc
         ) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id) DO UPDATE SET
           connection_id = EXCLUDED.connection_id,
           project_id = EXCLUDED.project_id,
           project_name = EXCLUDED.project_name,
           project_api_token_enc = EXCLUDED.project_api_token_enc,
           updated_at = now()
         RETURNING *`,
        [
          input.userId,
          input.connectionId,
          input.projectId,
          input.projectName ?? null,
          enc,
        ],
      );
      return mapSelection(res.rows[0]!);
    },

    async getProjectSelection(userId) {
      const res = await pool.query(
        `SELECT * FROM posthog_project_selections WHERE user_id = $1`,
        [userId],
      );
      return res.rows[0] ? mapSelection(res.rows[0]) : null;
    },

    async clearProjectSelection(userId) {
      await pool.query(
        `DELETE FROM posthog_project_selections WHERE user_id = $1`,
        [userId],
      );
    },

    async saveOAuthState(row: OAuthStateRow) {
      await pool.query(
        `INSERT INTO oauth_states (state, user_id, code_verifier, redirect_after, expires_at)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (state) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           code_verifier = EXCLUDED.code_verifier,
           redirect_after = EXCLUDED.redirect_after,
           expires_at = EXCLUDED.expires_at`,
        [
          row.state,
          row.userId,
          row.codeVerifier,
          row.redirectAfter,
          row.expiresAt,
        ],
      );
    },

    async takeOAuthState(state) {
      const res = await pool.query(
        `DELETE FROM oauth_states
         WHERE state = $1 AND expires_at > now()
         RETURNING *`,
        [state],
      );
      const r = res.rows[0];
      if (!r) return null;
      return {
        state: r.state,
        userId: r.user_id,
        codeVerifier: r.code_verifier,
        redirectAfter: r.redirect_after,
        expiresAt: r.expires_at,
      };
    },

    async updateConnectionTokens(input) {
      await pool.query(
        `UPDATE posthog_connections SET
           access_token_enc = $2,
           refresh_token_enc = $3,
           access_expires_at = $4,
           updated_at = now()
         WHERE id = $1`,
        [
          input.connectionId,
          encryptSecret(input.accessToken, input.encryptionKey),
          encryptSecret(input.refreshToken, input.encryptionKey),
          input.accessExpiresAt ?? null,
        ],
      );
    },

    async withConnectionLock(connectionId, fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `SELECT id FROM posthog_connections WHERE id = $1 FOR UPDATE`,
          [connectionId],
        );
        const result = await fn();
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };

  return store;
}

export async function createConnectionStore(): Promise<ConnectionStore> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return createPostgresStore(url);
  const { createMemoryStore } = await import("./memory.js");
  return createMemoryStore();
}
