import { createSeed, type MockSeed, type SeedFlag } from "./seed.js";
import type {
  CohortRecord,
  DashboardRecord,
  ExperimentRecord,
  FeatureFlagDefinition,
  GroupRecord,
  GroupTypeRecord,
  InsightRecord,
  JsonObject,
  PersonRecord,
  ProjectRecord,
  StoredEventRecord,
} from "../types.js";

/**
 * Mutable in-memory PostHog state. Capture/identify/flag writes update this store
 * so subsequent reads and agent workflow checks stay consistent.
 */
export class MockStore {
  project: ProjectRecord;
  persons: PersonRecord[];
  events: StoredEventRecord[];
  flags: SeedFlag[];
  experiments: ExperimentRecord[];
  insights: InsightRecord[];
  cohorts: CohortRecord[];
  cohortPersonIds: Record<number, string[]>;
  groupTypes: GroupTypeRecord[];
  groups: GroupRecord[];
  dashboards: DashboardRecord[];
  private eventSeq: number;
  private flagIdSeq: number;

  constructor(seed: MockSeed = createSeed()) {
    this.project = structuredClone(seed.project);
    this.persons = structuredClone(seed.persons);
    this.events = structuredClone(seed.events);
    this.flags = structuredClone(seed.flags);
    this.experiments = structuredClone(seed.experiments);
    this.insights = structuredClone(seed.insights);
    this.cohorts = structuredClone(seed.cohorts);
    this.cohortPersonIds = structuredClone(seed.cohortPersonIds);
    this.groupTypes = structuredClone(seed.groupTypes);
    this.groups = structuredClone(seed.groups);
    this.dashboards = structuredClone(seed.dashboards);
    this.eventSeq = this.events.length;
    this.flagIdSeq = Math.max(0, ...this.flags.map((f) => f.id));
  }

  findPersonByDistinctId(distinctId: string): PersonRecord | undefined {
    return this.persons.find((p) => p.distinctIds.includes(distinctId));
  }

  upsertPersonProperties(distinctId: string, properties: JsonObject): PersonRecord {
    const existing = this.findPersonByDistinctId(distinctId);
    if (existing) {
      existing.properties = { ...existing.properties, ...properties };
      return existing;
    }
    const person: PersonRecord = {
      id: `person_${this.persons.length + 1}`,
      distinctIds: [distinctId],
      properties: { ...properties },
      createdAt: new Date().toISOString(),
    };
    this.persons.push(person);
    return person;
  }

  appendEvent(input: {
    distinctId: string;
    event: string;
    properties?: JsonObject;
  }): StoredEventRecord {
    this.eventSeq += 1;
    const record: StoredEventRecord = {
      captureId: `mock_evt_${this.eventSeq}`,
      distinctId: input.distinctId,
      event: input.event,
      properties: input.properties,
      timestamp: new Date().toISOString(),
    };
    this.events.push(record);
    return record;
  }

  findFlag(key?: string, id?: number): SeedFlag | undefined {
    if (id != null) return this.flags.find((f) => f.id === id);
    if (key) return this.flags.find((f) => f.key === key);
    return undefined;
  }

  createFlag(input: {
    key: string;
    name?: string;
    active?: boolean;
    rolloutPercentage?: number;
  }): FeatureFlagDefinition {
    this.flagIdSeq += 1;
    const active = input.active ?? true;
    const rollout = input.rolloutPercentage ?? 100;
    const evaluateValue = active && rollout > 0;
    const flag: SeedFlag = {
      id: this.flagIdSeq,
      key: input.key,
      name: input.name ?? input.key,
      active,
      rolloutPercentage: rollout,
      evaluateValue,
      defaultValue: evaluateValue,
      filters: {
        groups: [{ properties: [], rollout_percentage: rollout }],
      },
    };
    this.flags.push(flag);
    return flag;
  }

  updateFlag(
    flag: SeedFlag,
    patch: { name?: string; active?: boolean; rolloutPercentage?: number },
  ): FeatureFlagDefinition {
    if (patch.name !== undefined) flag.name = patch.name;
    if (patch.active !== undefined) flag.active = patch.active;
    if (patch.rolloutPercentage !== undefined) {
      flag.rolloutPercentage = patch.rolloutPercentage;
      flag.filters = {
        ...(flag.filters ?? {}),
        groups: [{ properties: [], rollout_percentage: patch.rolloutPercentage }],
      };
    }
    if (typeof flag.evaluateValue === "boolean") {
      flag.evaluateValue =
        flag.active && (flag.rolloutPercentage ?? 0) > 0;
      flag.defaultValue = flag.evaluateValue;
    }
    return flag;
  }

  snapshot() {
    return {
      project: this.project,
      persons: this.persons,
      events: this.events,
      flags: this.flags,
      experiments: this.experiments,
      insights: this.insights,
      cohorts: this.cohorts,
      cohortPersonIds: this.cohortPersonIds,
      groupTypes: this.groupTypes,
      groups: this.groups,
      dashboards: this.dashboards,
    };
  }
}
