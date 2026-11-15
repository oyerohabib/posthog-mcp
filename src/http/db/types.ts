export type UserRow = {
  id: string;
  workosUserId: string;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PostHogConnectionRow = {
  id: string;
  userId: string;
  posthogUserId: string | null;
  region: "us" | "eu";
  appHost: string;
  captureHost: string;
  accessTokenEnc: Buffer;
  refreshTokenEnc: Buffer;
  accessExpiresAt: Date | null;
  scopes: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectSelectionRow = {
  userId: string;
  connectionId: string;
  projectId: string;
  projectName: string | null;
  projectApiTokenEnc: Buffer | null;
  updatedAt: Date;
};

export type OAuthStateRow = {
  state: string;
  userId: string;
  codeVerifier: string;
  redirectAfter: string | null;
  expiresAt: Date;
};

export type UpsertConnectionInput = {
  userId: string;
  posthogUserId?: string | null;
  region: "us" | "eu";
  appHost: string;
  captureHost: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt?: Date | null;
  scopes: string[];
  encryptionKey?: string;
};

export type ConnectionStore = {
  upsertUser(workosUserId: string, email?: string | null): Promise<UserRow>;
  getUserById(id: string): Promise<UserRow | null>;
  getUserByWorkosId(workosUserId: string): Promise<UserRow | null>;
  upsertConnection(input: UpsertConnectionInput): Promise<PostHogConnectionRow>;
  getConnectionByUserId(userId: string): Promise<PostHogConnectionRow | null>;
  deleteConnectionByUserId(userId: string): Promise<void>;
  setProjectSelection(input: {
    userId: string;
    connectionId: string;
    projectId: string;
    projectName?: string | null;
    projectApiToken?: string | null;
    encryptionKey?: string;
  }): Promise<ProjectSelectionRow>;
  getProjectSelection(userId: string): Promise<ProjectSelectionRow | null>;
  clearProjectSelection(userId: string): Promise<void>;
  saveOAuthState(row: OAuthStateRow): Promise<void>;
  takeOAuthState(state: string): Promise<OAuthStateRow | null>;
  updateConnectionTokens(input: {
    connectionId: string;
    accessToken: string;
    refreshToken: string;
    accessExpiresAt?: Date | null;
    encryptionKey?: string;
  }): Promise<void>;
  withConnectionLock<T>(
    connectionId: string,
    fn: () => Promise<T>,
  ): Promise<T>;
};
