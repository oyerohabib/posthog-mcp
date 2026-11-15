import {
  PostHogAuthError,
  PostHogNotFoundError,
  PostHogValidationError,
} from "../errors.js";
import { requestJson, toAppHost } from "./http.js";
import type {
  CaptureEventInput,
  CaptureEventResult,
  CreateFeatureFlagInput,
  CreateFeatureFlagResult,
  FeatureFlagDefinition,
  FindGroupInput,
  FindGroupResult,
  GetCohortInput,
  GetCohortPersonsInput,
  GetCohortPersonsResult,
  GetCohortResult,
  GetExperimentInput,
  GetExperimentResult,
  GetFeatureFlagDefinitionInput,
  GetFeatureFlagDefinitionResult,
  GetFeatureFlagInput,
  GetFeatureFlagResult,
  GetInsightInput,
  GetInsightResult,
  GetPersonEventsInput,
  GetPersonEventsResult,
  GetPersonInput,
  GetPersonResult,
  GetProjectResult,
  IdentifyUserInput,
  IdentifyUserResult,
  JsonObject,
  ListCohortsInput,
  ListCohortsResult,
  ListDashboardsInput,
  ListDashboardsResult,
  ListExperimentsInput,
  ListExperimentsResult,
  ListFeatureFlagsResult,
  ListGroupTypesResult,
  ListGroupsInput,
  ListGroupsResult,
  ListInsightsInput,
  ListInsightsResult,
  ListPersonsInput,
  ListPersonsResult,
  PersonRecord,
  PostHogClient,
  QueryFunnelInput,
  QueryFunnelResult,
  QueryRetentionInput,
  QueryRetentionResult,
  QueryTrendsInput,
  QueryTrendsResult,
  UpdateFeatureFlagInput,
  UpdateFeatureFlagResult,
} from "../types.js";

export type LivePostHogConfig = {
  /** Project API token (phc_…) for capture / decide */
  apiKey: string;
  /** Capture/decide host (e.g. https://us.i.posthog.com) */
  host: string;
  personalApiKey?: string;
  /** OAuth access token (pha_…) for private REST — preferred over personalApiKey */
  oauthAccessToken?: string;
  /** Private API app host override (e.g. https://us.posthog.com) */
  appHost?: string;
  projectId?: string;
};

export class LivePostHogClient implements PostHogClient {
  readonly mode = "live" as const;

  constructor(private readonly config: LivePostHogConfig) {
    if (!config.apiKey?.trim()) {
      throw new PostHogValidationError("POSTHOG_API_KEY is required for live mode");
    }
  }

  private captureHost(path: string): string {
    return `${this.config.host.replace(/\/$/, "")}${path}`;
  }

  private requirePrivate(): { appHost: string; projectId: string; token: string } {
    const token =
      this.config.oauthAccessToken?.trim() ||
      this.config.personalApiKey?.trim();
    const projectId = this.config.projectId?.trim();
    if (!token) {
      throw new PostHogAuthError(
        "POSTHOG_PERSONAL_API_KEY or OAuth access token is required for this private API tool",
      );
    }
    if (!projectId) {
      throw new PostHogAuthError(
        "POSTHOG_PROJECT_ID is required for this private API tool",
      );
    }
    const appHost =
      this.config.appHost?.replace(/\/$/, "") ||
      toAppHost(this.config.host);
    return { appHost, projectId, token };
  }

  private privateHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  private projectUrl(path: string): string {
    const { appHost, projectId } = this.requirePrivate();
    return `${appHost}/api/projects/${projectId}${path}`;
  }

  async captureEvent(input: CaptureEventInput): Promise<CaptureEventResult> {
    const distinctId = input.distinctId?.trim();
    const event = input.event?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    if (!event) throw new PostHogValidationError("event is required");

    await requestJson(this.captureHost("/i/v0/e/"), {
      method: "POST",
      body: {
        api_key: this.config.apiKey,
        event,
        distinct_id: distinctId,
        properties: { ...input.properties, $lib: "posthog-mcp" },
      },
    });

    return { ok: true, mode: "live", distinctId, event };
  }

  async identifyUser(input: IdentifyUserInput): Promise<IdentifyUserResult> {
    const distinctId = input.distinctId?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    if (
      !input.properties ||
      typeof input.properties !== "object" ||
      Array.isArray(input.properties)
    ) {
      throw new PostHogValidationError("properties must be a non-null object");
    }
    if (Object.keys(input.properties).length === 0) {
      throw new PostHogValidationError("properties must include at least one key");
    }

    await requestJson(this.captureHost("/i/v0/e/"), {
      method: "POST",
      body: {
        api_key: this.config.apiKey,
        event: "$identify",
        distinct_id: distinctId,
        properties: { $set: input.properties, $lib: "posthog-mcp" },
      },
    });

    return {
      ok: true,
      mode: "live",
      distinctId,
      properties: input.properties,
    };
  }

  async getPerson(input: GetPersonInput): Promise<GetPersonResult> {
    const distinctId = input.distinctId?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    const { token } = this.requirePrivate();
    const data = await requestJson<{
      results?: Array<{
        id: string | number;
        distinct_ids?: string[];
        properties?: JsonObject;
        created_at?: string;
      }>;
    }>(
      this.projectUrl(`/persons/?distinct_id=${encodeURIComponent(distinctId)}`),
      { headers: this.privateHeaders(token) },
    );
    const raw = data.results?.[0];
    const person: PersonRecord | null = raw
      ? {
          id: String(raw.id),
          distinctIds: raw.distinct_ids ?? [distinctId],
          properties: raw.properties ?? {},
          createdAt: raw.created_at,
        }
      : null;
    return { ok: true, mode: "live", person };
  }

  async listPersons(input: ListPersonsInput): Promise<ListPersonsResult> {
    const { token } = this.requirePrivate();
    const params = new URLSearchParams();
    if (input.search) params.set("search", input.search);
    if (input.limit != null) params.set("limit", String(input.limit));
    if (input.offset != null) params.set("offset", String(input.offset));
    const qs = params.toString();
    const data = await requestJson<{
      results?: Array<{
        id: string | number;
        distinct_ids?: string[];
        properties?: JsonObject;
        created_at?: string;
      }>;
      count?: number;
    }>(this.projectUrl(`/persons/${qs ? `?${qs}` : ""}`), {
      headers: this.privateHeaders(token),
    });
    const persons = (data.results ?? []).map((raw) => ({
      id: String(raw.id),
      distinctIds: raw.distinct_ids ?? [],
      properties: raw.properties ?? {},
      createdAt: raw.created_at,
    }));
    return {
      ok: true,
      mode: "live",
      persons,
      total: data.count ?? persons.length,
    };
  }

  async getPersonEvents(input: GetPersonEventsInput): Promise<GetPersonEventsResult> {
    const distinctId = input.distinctId?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    const { token } = this.requirePrivate();
    const limit = input.limit ?? 50;
    const eventFilter = input.event?.trim()
      ? ` and event = '${input.event.trim().replace(/'/g, "\\'")}'`
      : "";
    const data = await requestJson<{
      results?: unknown[][];
      columns?: string[];
    }>(this.projectUrl("/query/"), {
      method: "POST",
      headers: this.privateHeaders(token),
      body: {
        query: {
          kind: "HogQLQuery",
          query: `select uuid, event, timestamp, properties from events where distinct_id = '${distinctId.replace(/'/g, "\\'")}'${eventFilter} order by timestamp desc limit ${limit}`,
        },
        name: "get_person_events",
      },
    });

    const cols = data.columns ?? ["uuid", "event", "timestamp", "properties"];
    const events = (data.results ?? []).map((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((c, i) => {
        obj[c] = row[i];
      });
      return {
        captureId: String(obj.uuid ?? ""),
        distinctId,
        event: String(obj.event ?? ""),
        properties:
          typeof obj.properties === "object" && obj.properties
            ? (obj.properties as JsonObject)
            : undefined,
        timestamp: String(obj.timestamp ?? ""),
      };
    });

    return { ok: true, mode: "live", distinctId, events };
  }

  async getFeatureFlag(input: GetFeatureFlagInput): Promise<GetFeatureFlagResult> {
    const distinctId = input.distinctId?.trim();
    const flagKey = input.flagKey?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    if (!flagKey) throw new PostHogValidationError("flagKey is required");

    const data = await requestJson<{
      featureFlags?: Record<string, boolean | string>;
    }>(this.captureHost("/decide/?v=3"), {
      method: "POST",
      body: {
        api_key: this.config.apiKey,
        distinct_id: distinctId,
        person_properties: input.personProperties ?? {},
      },
    });

    const raw = data.featureFlags?.[flagKey];
    const value: boolean | string | null =
      typeof raw === "boolean" || typeof raw === "string" ? raw : null;
    const enabled =
      value === true || (typeof value === "string" && value.length > 0 && value !== "false");

    return {
      ok: true,
      mode: "live",
      flagKey,
      distinctId,
      value,
      enabled,
    };
  }

  async listFeatureFlags(): Promise<ListFeatureFlagsResult> {
    // Preserve prior empty-fallback when personal key missing.
    if (!this.config.personalApiKey?.trim() || !this.config.projectId?.trim()) {
      return { ok: true, mode: "live", flags: [] };
    }
    const { token } = this.requirePrivate();
    const data = await requestJson<{
      results?: Array<{
        id: number;
        key: string;
        name?: string;
        active: boolean;
      }>;
    }>(this.projectUrl("/feature_flags/?limit=100"), {
      headers: this.privateHeaders(token),
    });
    return {
      ok: true,
      mode: "live",
      flags: (data.results ?? []).map((f) => ({
        key: f.key,
        active: f.active,
        id: f.id,
        name: f.name,
      })),
    };
  }

  async getFeatureFlagDefinition(
    input: GetFeatureFlagDefinitionInput,
  ): Promise<GetFeatureFlagDefinitionResult> {
    const { token } = this.requirePrivate();
    if (input.id != null) {
      const raw = await requestJson<{
        id: number;
        key: string;
        name?: string;
        active: boolean;
        filters?: JsonObject;
        rollout_percentage?: number | null;
      }>(this.projectUrl(`/feature_flags/${input.id}/`), {
        headers: this.privateHeaders(token),
      });
      return {
        ok: true,
        mode: "live",
        flag: mapFlagDefinition(raw),
      };
    }
    const key = input.key?.trim();
    if (!key) throw new PostHogValidationError("key or id is required");
    const data = await requestJson<{
      results?: Array<{
        id: number;
        key: string;
        name?: string;
        active: boolean;
        filters?: JsonObject;
        rollout_percentage?: number | null;
      }>;
    }>(this.projectUrl(`/feature_flags/?search=${encodeURIComponent(key)}`), {
      headers: this.privateHeaders(token),
    });
    const raw = (data.results ?? []).find((f) => f.key === key) ?? null;
    return {
      ok: true,
      mode: "live",
      flag: raw ? mapFlagDefinition(raw) : null,
    };
  }

  async createFeatureFlag(input: CreateFeatureFlagInput): Promise<CreateFeatureFlagResult> {
    if (!input.confirm) {
      throw new PostHogValidationError("confirm must be true to create a feature flag");
    }
    const key = input.key?.trim();
    if (!key) throw new PostHogValidationError("key is required");
    const { token } = this.requirePrivate();
    const raw = await requestJson<{
      id: number;
      key: string;
      name?: string;
      active: boolean;
      filters?: JsonObject;
      rollout_percentage?: number | null;
    }>(this.projectUrl("/feature_flags/"), {
      method: "POST",
      headers: this.privateHeaders(token),
      body: {
        key,
        name: input.name ?? key,
        active: input.active ?? true,
        filters: {
          groups: [
            {
              properties: [],
              rollout_percentage: input.rolloutPercentage ?? 100,
            },
          ],
        },
      },
    });
    return { ok: true, mode: "live", flag: mapFlagDefinition(raw) };
  }

  async updateFeatureFlag(input: UpdateFeatureFlagInput): Promise<UpdateFeatureFlagResult> {
    if (!input.confirm) {
      throw new PostHogValidationError("confirm must be true to update a feature flag");
    }
    const { token } = this.requirePrivate();
    let id = input.id;
    if (id == null) {
      const key = input.key?.trim();
      if (!key) throw new PostHogValidationError("key or id is required");
      const found = await this.getFeatureFlagDefinition({ key });
      if (!found.flag) throw new PostHogNotFoundError(`feature flag not found: ${key}`);
      id = found.flag.id;
    }
    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.active !== undefined) body.active = input.active;
    if (input.rolloutPercentage !== undefined) {
      body.filters = {
        groups: [{ properties: [], rollout_percentage: input.rolloutPercentage }],
      };
    }
    const raw = await requestJson<{
      id: number;
      key: string;
      name?: string;
      active: boolean;
      filters?: JsonObject;
      rollout_percentage?: number | null;
    }>(this.projectUrl(`/feature_flags/${id}/`), {
      method: "PATCH",
      headers: this.privateHeaders(token),
      body,
    });
    return { ok: true, mode: "live", flag: mapFlagDefinition(raw) };
  }

  async listExperiments(input: ListExperimentsInput): Promise<ListExperimentsResult> {
    const { token } = this.requirePrivate();
    const params = new URLSearchParams();
    if (input.status) params.set("status", input.status);
    if (input.limit != null) params.set("limit", String(input.limit));
    if (input.offset != null) params.set("offset", String(input.offset));
    const qs = params.toString();
    const data = await requestJson<{
      results?: Array<{
        id: number;
        name: string;
        description?: string;
        feature_flag_key?: string;
        status?: string;
        start_date?: string | null;
        end_date?: string | null;
        metrics?: JsonObject[];
      }>;
    }>(this.projectUrl(`/experiments/${qs ? `?${qs}` : ""}`), {
      headers: this.privateHeaders(token),
    });
    return {
      ok: true,
      mode: "live",
      experiments: (data.results ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        featureFlagKey: e.feature_flag_key,
        status: e.status ?? "unknown",
        startDate: e.start_date,
        endDate: e.end_date,
        metrics: e.metrics,
      })),
    };
  }

  async getExperiment(input: GetExperimentInput): Promise<GetExperimentResult> {
    if (input.id == null || Number.isNaN(input.id)) {
      throw new PostHogValidationError("id is required");
    }
    const { token } = this.requirePrivate();
    const e = await requestJson<{
      id: number;
      name: string;
      description?: string;
      feature_flag_key?: string;
      status?: string;
      start_date?: string | null;
      end_date?: string | null;
      metrics?: JsonObject[];
    }>(this.projectUrl(`/experiments/${input.id}/`), {
      headers: this.privateHeaders(token),
    });
    return {
      ok: true,
      mode: "live",
      experiment: {
        id: e.id,
        name: e.name,
        description: e.description,
        featureFlagKey: e.feature_flag_key,
        status: e.status ?? "unknown",
        startDate: e.start_date,
        endDate: e.end_date,
        metrics: e.metrics,
      },
    };
  }

  async queryTrends(input: QueryTrendsInput): Promise<QueryTrendsResult> {
    const event = input.event?.trim();
    if (!event) throw new PostHogValidationError("event is required");
    const { token } = this.requirePrivate();
    const interval = input.interval ?? "day";
    const data = await requestJson<{
      results?: Array<{ data?: number[]; labels?: string[]; count?: number }>;
    }>(this.projectUrl("/query/"), {
      method: "POST",
      headers: this.privateHeaders(token),
      body: {
        query: {
          kind: "TrendsQuery",
          series: [{ kind: "EventsNode", event }],
          interval,
          dateRange: {
            date_from: input.dateFrom ?? "-7d",
            date_to: input.dateTo ?? null,
          },
        },
        name: "query_trends",
      },
    });
    const first = data.results?.[0];
    const series = (first?.labels ?? []).map((date, i) => ({
      date,
      count: first?.data?.[i] ?? 0,
    }));
    return {
      ok: true,
      mode: "live",
      event,
      interval,
      series,
      total: first?.count ?? series.reduce((a, b) => a + b.count, 0),
    };
  }

  async queryFunnel(input: QueryFunnelInput): Promise<QueryFunnelResult> {
    if (!input.events?.length) {
      throw new PostHogValidationError("events must include at least one step");
    }
    const { token } = this.requirePrivate();
    const data = await requestJson<{
      results?: Array<Array<{ count?: number; name?: string }>>;
    }>(this.projectUrl("/query/"), {
      method: "POST",
      headers: this.privateHeaders(token),
      body: {
        query: {
          kind: "FunnelsQuery",
          series: input.events.map((event) => ({ kind: "EventsNode", event })),
          dateRange: {
            date_from: input.dateFrom ?? "-30d",
            date_to: input.dateTo ?? null,
          },
        },
        name: "query_funnel",
      },
    });
    const rows = data.results?.[0] ?? [];
    const firstCount = rows[0]?.count ?? 0;
    const steps = input.events.map((event, i) => {
      const count = rows[i]?.count ?? 0;
      return {
        event,
        count,
        conversionRate: firstCount === 0 ? 0 : count / firstCount,
      };
    });
    return { ok: true, mode: "live", steps };
  }

  async queryRetention(input: QueryRetentionInput): Promise<QueryRetentionResult> {
    const { token } = this.requirePrivate();
    const target = input.targetEvent?.trim() || "$pageview";
    const returning = input.returningEvent?.trim() || target;
    const data = await requestJson<{
      results?: Array<{ values?: Array<{ count?: number }> }>;
    }>(this.projectUrl("/query/"), {
      method: "POST",
      headers: this.privateHeaders(token),
      body: {
        query: {
          kind: "RetentionQuery",
          retentionFilter: {
            period: input.period ?? "Week",
            targetEntity: { id: target, type: "events" },
            returningEntity: { id: returning, type: "events" },
          },
          dateRange: { date_from: input.dateFrom ?? "-30d" },
        },
        name: "query_retention",
      },
    });
    const values = data.results?.[0]?.values ?? [];
    const base = values[0]?.count ?? 1;
    const periods = values.map((v, i) => ({
      period: i,
      count: v.count ?? 0,
      rate: base === 0 ? 0 : (v.count ?? 0) / base,
    }));
    return { ok: true, mode: "live", periods };
  }

  async listInsights(input: ListInsightsInput): Promise<ListInsightsResult> {
    const { token } = this.requirePrivate();
    const params = new URLSearchParams();
    if (input.search) params.set("search", input.search);
    if (input.limit != null) params.set("limit", String(input.limit));
    if (input.offset != null) params.set("offset", String(input.offset));
    const qs = params.toString();
    const data = await requestJson<{
      results?: Array<{
        id: number;
        name?: string;
        description?: string;
        filters?: JsonObject;
        query?: JsonObject;
        insight?: string;
      }>;
    }>(this.projectUrl(`/insights/${qs ? `?${qs}` : ""}`), {
      headers: this.privateHeaders(token),
    });
    return {
      ok: true,
      mode: "live",
      insights: (data.results ?? []).map((i) => ({
        id: i.id,
        name: i.name ?? `Insight ${i.id}`,
        description: i.description,
        filters: i.filters,
        query: i.query,
        insight: i.insight,
      })),
    };
  }

  async getInsight(input: GetInsightInput): Promise<GetInsightResult> {
    if (input.id == null || Number.isNaN(input.id)) {
      throw new PostHogValidationError("id is required");
    }
    const { token } = this.requirePrivate();
    const i = await requestJson<{
      id: number;
      name?: string;
      description?: string;
      filters?: JsonObject;
      query?: JsonObject;
      insight?: string;
    }>(this.projectUrl(`/insights/${input.id}/`), {
      headers: this.privateHeaders(token),
    });
    return {
      ok: true,
      mode: "live",
      insight: {
        id: i.id,
        name: i.name ?? `Insight ${i.id}`,
        description: i.description,
        filters: i.filters,
        query: i.query,
        insight: i.insight,
      },
    };
  }

  async listCohorts(input: ListCohortsInput): Promise<ListCohortsResult> {
    const { token } = this.requirePrivate();
    const params = new URLSearchParams();
    if (input.limit != null) params.set("limit", String(input.limit));
    if (input.offset != null) params.set("offset", String(input.offset));
    const qs = params.toString();
    const data = await requestJson<{
      results?: Array<{
        id: number;
        name: string;
        description?: string;
        count?: number;
        is_static?: boolean;
        filters?: JsonObject;
      }>;
    }>(this.projectUrl(`/cohorts/${qs ? `?${qs}` : ""}`), {
      headers: this.privateHeaders(token),
    });
    return {
      ok: true,
      mode: "live",
      cohorts: (data.results ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        count: c.count,
        isStatic: c.is_static,
        filters: c.filters,
      })),
    };
  }

  async getCohort(input: GetCohortInput): Promise<GetCohortResult> {
    if (input.id == null || Number.isNaN(input.id)) {
      throw new PostHogValidationError("id is required");
    }
    const { token } = this.requirePrivate();
    const c = await requestJson<{
      id: number;
      name: string;
      description?: string;
      count?: number;
      is_static?: boolean;
      filters?: JsonObject;
    }>(this.projectUrl(`/cohorts/${input.id}/`), {
      headers: this.privateHeaders(token),
    });
    return {
      ok: true,
      mode: "live",
      cohort: {
        id: c.id,
        name: c.name,
        description: c.description,
        count: c.count,
        isStatic: c.is_static,
        filters: c.filters,
      },
    };
  }

  async getCohortPersons(input: GetCohortPersonsInput): Promise<GetCohortPersonsResult> {
    if (input.id == null || Number.isNaN(input.id)) {
      throw new PostHogValidationError("id is required");
    }
    const { token } = this.requirePrivate();
    const params = new URLSearchParams();
    if (input.limit != null) params.set("limit", String(input.limit));
    if (input.offset != null) params.set("offset", String(input.offset));
    const qs = params.toString();
    const data = await requestJson<{
      results?: Array<{
        id: string | number;
        distinct_ids?: string[];
        properties?: JsonObject;
        created_at?: string;
      }>;
      count?: number;
    }>(this.projectUrl(`/cohorts/${input.id}/persons/${qs ? `?${qs}` : ""}`), {
      headers: this.privateHeaders(token),
    });
    const persons = (data.results ?? []).map((raw) => ({
      id: String(raw.id),
      distinctIds: raw.distinct_ids ?? [],
      properties: raw.properties ?? {},
      createdAt: raw.created_at,
    }));
    return {
      ok: true,
      mode: "live",
      cohortId: input.id,
      persons,
      total: data.count ?? persons.length,
    };
  }

  async listGroupTypes(): Promise<ListGroupTypesResult> {
    const { token, appHost, projectId } = this.requirePrivate();
    const data = await requestJson<
      Array<{ group_type_index: number; group_type: string; name_plural?: string }>
    >(`${appHost}/api/projects/${projectId}/groups_types/`, {
      headers: this.privateHeaders(token),
    });
    const list = Array.isArray(data) ? data : [];
    return {
      ok: true,
      mode: "live",
      groupTypes: list.map((g) => ({
        groupTypeIndex: g.group_type_index,
        groupType: g.group_type,
        namePlural: g.name_plural,
      })),
    };
  }

  async listGroups(input: ListGroupsInput): Promise<ListGroupsResult> {
    if (input.groupTypeIndex == null || Number.isNaN(input.groupTypeIndex)) {
      throw new PostHogValidationError("groupTypeIndex is required");
    }
    const { token } = this.requirePrivate();
    const params = new URLSearchParams({
      group_type_index: String(input.groupTypeIndex),
    });
    if (input.search) params.set("search", input.search);
    if (input.limit != null) params.set("limit", String(input.limit));
    const data = await requestJson<{
      results?: Array<{
        group_type_index: number;
        group_key: string;
        group_properties?: JsonObject;
        created_at?: string;
      }>;
    }>(this.projectUrl(`/groups/?${params}`), {
      headers: this.privateHeaders(token),
    });
    return {
      ok: true,
      mode: "live",
      groups: (data.results ?? []).map((g) => ({
        groupTypeIndex: g.group_type_index,
        groupKey: g.group_key,
        properties: g.group_properties ?? {},
        createdAt: g.created_at,
      })),
    };
  }

  async findGroup(input: FindGroupInput): Promise<FindGroupResult> {
    if (input.groupTypeIndex == null || Number.isNaN(input.groupTypeIndex)) {
      throw new PostHogValidationError("groupTypeIndex is required");
    }
    const groupKey = input.groupKey?.trim();
    if (!groupKey) throw new PostHogValidationError("groupKey is required");
    const { token } = this.requirePrivate();
    const params = new URLSearchParams({
      group_type_index: String(input.groupTypeIndex),
      group_key: groupKey,
    });
    const data = await requestJson<{
      group_type_index?: number;
      group_key?: string;
      group_properties?: JsonObject;
      created_at?: string;
      results?: Array<{
        group_type_index: number;
        group_key: string;
        group_properties?: JsonObject;
        created_at?: string;
      }>;
    }>(this.projectUrl(`/groups/find/?${params}`), {
      headers: this.privateHeaders(token),
    });

    const raw =
      data.group_key != null
        ? data
        : (data.results ?? []).find((g) => g.group_key === groupKey);

    if (!raw || raw.group_key == null) {
      return { ok: true, mode: "live", group: null };
    }

    return {
      ok: true,
      mode: "live",
      group: {
        groupTypeIndex: raw.group_type_index ?? input.groupTypeIndex,
        groupKey: raw.group_key,
        properties: raw.group_properties ?? {},
        createdAt: raw.created_at,
      },
    };
  }

  async getProject(): Promise<GetProjectResult> {
    const { token, appHost, projectId } = this.requirePrivate();
    const p = await requestJson<{
      id: number | string;
      name: string;
      uuid?: string;
      timezone?: string;
      api_token?: string;
    }>(`${appHost}/api/projects/${projectId}/`, {
      headers: this.privateHeaders(token),
    });
    return {
      ok: true,
      mode: "live",
      project: {
        id: p.id,
        name: p.name,
        uuid: p.uuid,
        timezone: p.timezone,
        apiToken: p.api_token ? "redacted" : undefined,
      },
    };
  }

  async listDashboards(input: ListDashboardsInput): Promise<ListDashboardsResult> {
    const { token } = this.requirePrivate();
    const params = new URLSearchParams();
    if (input.limit != null) params.set("limit", String(input.limit));
    if (input.offset != null) params.set("offset", String(input.offset));
    const qs = params.toString();
    const data = await requestJson<{
      results?: Array<{
        id: number;
        name: string;
        description?: string;
        pinned?: boolean;
      }>;
    }>(this.projectUrl(`/dashboards/${qs ? `?${qs}` : ""}`), {
      headers: this.privateHeaders(token),
    });
    return {
      ok: true,
      mode: "live",
      dashboards: (data.results ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        pinned: d.pinned,
      })),
    };
  }
}

function mapFlagDefinition(raw: {
  id: number;
  key: string;
  name?: string;
  active: boolean;
  filters?: JsonObject;
  rollout_percentage?: number | null;
}): FeatureFlagDefinition {
  return {
    id: raw.id,
    key: raw.key,
    name: raw.name ?? raw.key,
    active: raw.active,
    filters: raw.filters,
    rolloutPercentage: raw.rollout_percentage ?? null,
  };
}
