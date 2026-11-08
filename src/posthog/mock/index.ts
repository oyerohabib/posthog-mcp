import { PostHogValidationError, PostHogNotFoundError } from "../errors.js";
import { MockStore } from "./store.js";
import type {
  CaptureEventInput,
  CaptureEventResult,
  CreateFeatureFlagInput,
  CreateFeatureFlagResult,
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

export { MockStore } from "./store.js";
export { createSeed } from "./seed.js";
export { PostHogValidationError } from "../errors.js";

/**
 * In-memory PostHog stand-in. Deterministic, no network.
 * Seeded flags: new-onboarding=true, beta-insights=false, pricing-experiment="control".
 */
export class MockPostHogClient implements PostHogClient {
  readonly mode = "mock" as const;
  readonly store: MockStore;

  constructor(store?: MockStore) {
    this.store = store ?? new MockStore();
  }

  /** Back-compat accessors used by existing harness. */
  get events() {
    return this.store.events.map((e) => ({
      distinctId: e.distinctId,
      event: e.event,
      properties: e.properties,
      captureId: e.captureId,
      capturedAt: e.timestamp,
    }));
  }

  get persons() {
    const map = new Map<
      string,
      { distinctId: string; properties: Record<string, unknown>; updatedAt: string }
    >();
    for (const p of this.store.persons) {
      for (const did of p.distinctIds) {
        map.set(did, {
          distinctId: did,
          properties: p.properties,
          updatedAt: p.createdAt ?? "",
        });
      }
    }
    return map;
  }

  get flags(): Record<string, boolean | string> {
    const out: Record<string, boolean | string> = {};
    for (const f of this.store.flags) out[f.key] = f.evaluateValue;
    return out;
  }

  async captureEvent(input: CaptureEventInput): Promise<CaptureEventResult> {
    const event = input.event?.trim();
    const distinctId = input.distinctId?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    if (!event) throw new PostHogValidationError("event is required");

    const record = this.store.appendEvent({
      distinctId,
      event,
      properties: input.properties,
    });

    return {
      ok: true,
      mode: "mock",
      distinctId,
      event,
      captureId: record.captureId,
    };
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

    const person = this.store.upsertPersonProperties(distinctId, input.properties);
    return {
      ok: true,
      mode: "mock",
      distinctId,
      properties: person.properties,
    };
  }

  async getPerson(input: GetPersonInput): Promise<GetPersonResult> {
    const distinctId = input.distinctId?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    const person = this.store.findPersonByDistinctId(distinctId) ?? null;
    return { ok: true, mode: "mock", person };
  }

  async listPersons(input: ListPersonsInput): Promise<ListPersonsResult> {
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    let persons = [...this.store.persons];
    if (input.search?.trim()) {
      const q = input.search.trim().toLowerCase();
      persons = persons.filter((p) => {
        const hay = JSON.stringify(p).toLowerCase();
        return hay.includes(q) || p.distinctIds.some((d) => d.toLowerCase().includes(q));
      });
    }
    const total = persons.length;
    return {
      ok: true,
      mode: "mock",
      persons: persons.slice(offset, offset + limit),
      total,
    };
  }

  async getPersonEvents(input: GetPersonEventsInput): Promise<GetPersonEventsResult> {
    const distinctId = input.distinctId?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    const limit = input.limit ?? 50;
    let events = this.store.events.filter((e) => e.distinctId === distinctId);
    if (input.event?.trim()) {
      events = events.filter((e) => e.event === input.event!.trim());
    }
    events = [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return {
      ok: true,
      mode: "mock",
      distinctId,
      events: events.slice(0, limit),
    };
  }

  async getFeatureFlag(input: GetFeatureFlagInput): Promise<GetFeatureFlagResult> {
    const distinctId = input.distinctId?.trim();
    const flagKey = input.flagKey?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    if (!flagKey) throw new PostHogValidationError("flagKey is required");

    const overrideKey = `$feature/${flagKey}`;
    const override = input.personProperties?.[overrideKey];
    let value: boolean | string | null;
    if (typeof override === "boolean" || typeof override === "string") {
      value = override;
    } else {
      const flag = this.store.findFlag(flagKey);
      value = flag ? flag.evaluateValue : null;
    }

    const enabled =
      value === true || (typeof value === "string" && value.length > 0 && value !== "false");

    return {
      ok: true,
      mode: "mock",
      flagKey,
      distinctId,
      value,
      enabled,
    };
  }

  async listFeatureFlags(): Promise<ListFeatureFlagsResult> {
    return {
      ok: true,
      mode: "mock",
      flags: this.store.flags.map((f) => ({
        key: f.key,
        active: f.active,
        id: f.id,
        name: f.name,
        defaultValue: f.defaultValue ?? f.evaluateValue,
      })),
    };
  }

  async getFeatureFlagDefinition(
    input: GetFeatureFlagDefinitionInput,
  ): Promise<GetFeatureFlagDefinitionResult> {
    if (input.id == null && !input.key?.trim()) {
      throw new PostHogValidationError("key or id is required");
    }
    const flag = this.store.findFlag(input.key?.trim(), input.id) ?? null;
    return { ok: true, mode: "mock", flag };
  }

  async createFeatureFlag(input: CreateFeatureFlagInput): Promise<CreateFeatureFlagResult> {
    if (!input.confirm) {
      throw new PostHogValidationError("confirm must be true to create a feature flag");
    }
    const key = input.key?.trim();
    if (!key) throw new PostHogValidationError("key is required");
    if (this.store.findFlag(key)) {
      throw new PostHogValidationError(`feature flag already exists: ${key}`);
    }
    const flag = this.store.createFlag({
      key,
      name: input.name,
      active: input.active,
      rolloutPercentage: input.rolloutPercentage,
    });
    return { ok: true, mode: "mock", flag };
  }

  async updateFeatureFlag(input: UpdateFeatureFlagInput): Promise<UpdateFeatureFlagResult> {
    if (!input.confirm) {
      throw new PostHogValidationError("confirm must be true to update a feature flag");
    }
    if (input.id == null && !input.key?.trim()) {
      throw new PostHogValidationError("key or id is required");
    }
    const flag = this.store.findFlag(input.key?.trim(), input.id);
    if (!flag) throw new PostHogNotFoundError("feature flag not found");
    const updated = this.store.updateFlag(flag, {
      name: input.name,
      active: input.active,
      rolloutPercentage: input.rolloutPercentage,
    });
    return { ok: true, mode: "mock", flag: updated };
  }

  async listExperiments(input: ListExperimentsInput): Promise<ListExperimentsResult> {
    let experiments = [...this.store.experiments];
    if (input.status?.trim() && input.status !== "all") {
      experiments = experiments.filter((e) => e.status === input.status);
    }
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    return {
      ok: true,
      mode: "mock",
      experiments: experiments.slice(offset, offset + limit),
    };
  }

  async getExperiment(input: GetExperimentInput): Promise<GetExperimentResult> {
    if (input.id == null || Number.isNaN(input.id)) {
      throw new PostHogValidationError("id is required");
    }
    const experiment = this.store.experiments.find((e) => e.id === input.id) ?? null;
    return { ok: true, mode: "mock", experiment };
  }

  async queryTrends(input: QueryTrendsInput): Promise<QueryTrendsResult> {
    const event = input.event?.trim();
    if (!event) throw new PostHogValidationError("event is required");
    const interval = input.interval ?? "day";
    const matching = this.store.events.filter((e) => {
      if (e.event !== event) return false;
      if (input.dateFrom && e.timestamp < input.dateFrom) return false;
      if (input.dateTo && e.timestamp > input.dateTo) return false;
      return true;
    });

    const buckets = new Map<string, number>();
    for (const e of matching) {
      const day = e.timestamp.slice(0, 10);
      buckets.set(day, (buckets.get(day) ?? 0) + 1);
    }
    const series = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return {
      ok: true,
      mode: "mock",
      event,
      interval,
      series,
      total: matching.length,
    };
  }

  async queryFunnel(input: QueryFunnelInput): Promise<QueryFunnelResult> {
    if (!input.events?.length) {
      throw new PostHogValidationError("events must include at least one step");
    }
    const steps = input.events.map((eventName, idx) => {
      const users = new Set(
        this.store.events.filter((e) => e.event === eventName).map((e) => e.distinctId),
      );
      const count = users.size;
      const firstCount = idx === 0 ? count : stepsFirstCount(this.store, input.events[0]!);
      const conversionRate = firstCount === 0 ? 0 : count / firstCount;
      return { event: eventName, count, conversionRate };
    });
    return { ok: true, mode: "mock", steps };
  }

  async queryRetention(input: QueryRetentionInput): Promise<QueryRetentionResult> {
    const target = input.targetEvent?.trim() || "$pageview";
    const returning = input.returningEvent?.trim() || target;
    const users = new Set(
      this.store.events.filter((e) => e.event === target).map((e) => e.distinctId),
    );
    const returningUsers = new Set(
      this.store.events.filter((e) => e.event === returning).map((e) => e.distinctId),
    );
    const base = users.size || 1;
    const periods = [
      { period: 0, count: users.size, rate: 1 },
      {
        period: 1,
        count: [...users].filter((u) => returningUsers.has(u)).length,
        rate: [...users].filter((u) => returningUsers.has(u)).length / base,
      },
      { period: 2, count: Math.max(0, Math.floor(users.size / 2)), rate: 0.5 },
    ];
    return { ok: true, mode: "mock", periods };
  }

  async listInsights(input: ListInsightsInput): Promise<ListInsightsResult> {
    let insights = [...this.store.insights];
    if (input.search?.trim()) {
      const q = input.search.trim().toLowerCase();
      insights = insights.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description ?? "").toLowerCase().includes(q),
      );
    }
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    return {
      ok: true,
      mode: "mock",
      insights: insights.slice(offset, offset + limit),
    };
  }

  async getInsight(input: GetInsightInput): Promise<GetInsightResult> {
    if (input.id == null || Number.isNaN(input.id)) {
      throw new PostHogValidationError("id is required");
    }
    const insight = this.store.insights.find((i) => i.id === input.id) ?? null;
    return { ok: true, mode: "mock", insight };
  }

  async listCohorts(input: ListCohortsInput): Promise<ListCohortsResult> {
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    return {
      ok: true,
      mode: "mock",
      cohorts: this.store.cohorts.slice(offset, offset + limit),
    };
  }

  async getCohort(input: GetCohortInput): Promise<GetCohortResult> {
    if (input.id == null || Number.isNaN(input.id)) {
      throw new PostHogValidationError("id is required");
    }
    const cohort = this.store.cohorts.find((c) => c.id === input.id) ?? null;
    return { ok: true, mode: "mock", cohort };
  }

  async getCohortPersons(input: GetCohortPersonsInput): Promise<GetCohortPersonsResult> {
    if (input.id == null || Number.isNaN(input.id)) {
      throw new PostHogValidationError("id is required");
    }
    const ids = this.store.cohortPersonIds[input.id] ?? [];
    const persons = this.store.persons.filter((p) => ids.includes(p.id));
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    return {
      ok: true,
      mode: "mock",
      cohortId: input.id,
      persons: persons.slice(offset, offset + limit),
      total: persons.length,
    };
  }

  async listGroupTypes(): Promise<ListGroupTypesResult> {
    return { ok: true, mode: "mock", groupTypes: this.store.groupTypes };
  }

  async listGroups(input: ListGroupsInput): Promise<ListGroupsResult> {
    if (input.groupTypeIndex == null || Number.isNaN(input.groupTypeIndex)) {
      throw new PostHogValidationError("groupTypeIndex is required");
    }
    let groups = this.store.groups.filter(
      (g) => g.groupTypeIndex === input.groupTypeIndex,
    );
    if (input.search?.trim()) {
      const q = input.search.trim().toLowerCase();
      groups = groups.filter(
        (g) =>
          g.groupKey.toLowerCase().includes(q) ||
          JSON.stringify(g.properties).toLowerCase().includes(q),
      );
    }
    const limit = input.limit ?? 100;
    return { ok: true, mode: "mock", groups: groups.slice(0, limit) };
  }

  async findGroup(input: FindGroupInput): Promise<FindGroupResult> {
    if (input.groupTypeIndex == null || Number.isNaN(input.groupTypeIndex)) {
      throw new PostHogValidationError("groupTypeIndex is required");
    }
    const groupKey = input.groupKey?.trim();
    if (!groupKey) throw new PostHogValidationError("groupKey is required");
    const group =
      this.store.groups.find(
        (g) => g.groupTypeIndex === input.groupTypeIndex && g.groupKey === groupKey,
      ) ?? null;
    return { ok: true, mode: "mock", group };
  }

  async getProject(): Promise<GetProjectResult> {
    return { ok: true, mode: "mock", project: this.store.project };
  }

  async listDashboards(input: ListDashboardsInput): Promise<ListDashboardsResult> {
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    return {
      ok: true,
      mode: "mock",
      dashboards: this.store.dashboards.slice(offset, offset + limit),
    };
  }
}

function stepsFirstCount(store: MockStore, firstEvent: string): number {
  return new Set(
    store.events.filter((e) => e.event === firstEvent).map((e) => e.distinctId),
  ).size;
}
