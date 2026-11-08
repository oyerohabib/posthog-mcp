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

export type SeedFlag = FeatureFlagDefinition & {
  evaluateValue: boolean | string;
};

export type MockSeed = {
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
};

/** Deterministic seed data for mock mode and agent evaluations. */
export function createSeed(): MockSeed {
  const persons: PersonRecord[] = [
    {
      id: "person_1",
      distinctIds: ["user_alice"],
      properties: {
        email: "alice@example.com",
        name: "Alice",
        plan: "pro",
        company: "Acme",
      },
      createdAt: "2024-01-10T10:00:00.000Z",
    },
    {
      id: "person_2",
      distinctIds: ["user_bob"],
      properties: {
        email: "bob@example.com",
        name: "Bob",
        plan: "free",
        company: "Acme",
      },
      createdAt: "2024-02-15T12:00:00.000Z",
    },
    {
      id: "person_3",
      distinctIds: ["user_carol"],
      properties: {
        email: "carol@example.com",
        name: "Carol",
        plan: "enterprise",
        company: "Globex",
      },
      createdAt: "2024-03-01T08:30:00.000Z",
    },
    {
      id: "person_4",
      distinctIds: ["anon_device_9"],
      properties: { $browser: "Chrome", $os: "macOS" },
      createdAt: "2024-04-20T16:00:00.000Z",
    },
  ];

  const events: StoredEventRecord[] = [
    {
      captureId: "seed_evt_1",
      distinctId: "user_alice",
      event: "$pageview",
      properties: { $current_url: "/home" },
      timestamp: "2024-06-01T09:00:00.000Z",
    },
    {
      captureId: "seed_evt_2",
      distinctId: "user_alice",
      event: "user_signed_up",
      properties: { method: "email" },
      timestamp: "2024-06-01T09:01:00.000Z",
    },
    {
      captureId: "seed_evt_3",
      distinctId: "user_alice",
      event: "feature_used",
      properties: { feature: "insights" },
      timestamp: "2024-06-02T11:00:00.000Z",
    },
    {
      captureId: "seed_evt_4",
      distinctId: "user_bob",
      event: "$pageview",
      properties: { $current_url: "/pricing" },
      timestamp: "2024-06-01T10:00:00.000Z",
    },
    {
      captureId: "seed_evt_5",
      distinctId: "user_bob",
      event: "user_signed_up",
      properties: { method: "google" },
      timestamp: "2024-06-01T10:05:00.000Z",
    },
    {
      captureId: "seed_evt_6",
      distinctId: "user_carol",
      event: "$pageview",
      properties: { $current_url: "/dashboard" },
      timestamp: "2024-06-03T14:00:00.000Z",
    },
    {
      captureId: "seed_evt_7",
      distinctId: "user_carol",
      event: "purchase_completed",
      properties: { amount: 99, currency: "USD" },
      timestamp: "2024-06-03T14:30:00.000Z",
    },
    {
      captureId: "seed_evt_8",
      distinctId: "user_alice",
      event: "purchase_completed",
      properties: { amount: 49, currency: "USD" },
      timestamp: "2024-06-04T09:00:00.000Z",
    },
  ];

  const flags: SeedFlag[] = [
    {
      id: 1,
      key: "new-onboarding",
      name: "New Onboarding",
      active: true,
      rolloutPercentage: 100,
      evaluateValue: true,
      defaultValue: true,
      filters: { groups: [{ properties: [], rollout_percentage: 100 }] },
    },
    {
      id: 2,
      key: "beta-insights",
      name: "Beta Insights",
      active: true,
      rolloutPercentage: 0,
      evaluateValue: false,
      defaultValue: false,
      filters: { groups: [{ properties: [], rollout_percentage: 0 }] },
    },
    {
      id: 3,
      key: "pricing-experiment",
      name: "Pricing Experiment",
      active: true,
      rolloutPercentage: 50,
      evaluateValue: "control",
      defaultValue: "control",
      filters: {
        multivariate: {
          variants: [
            { key: "control", rollout_percentage: 50 },
            { key: "test", rollout_percentage: 50 },
          ],
        },
      },
    },
  ];

  const experiments: ExperimentRecord[] = [
    {
      id: 101,
      name: "Pricing page CTA",
      description: "Test new pricing CTA copy",
      featureFlagKey: "pricing-experiment",
      status: "running",
      startDate: "2024-05-01T00:00:00.000Z",
      endDate: null,
      metrics: [
        { name: "purchase_completed", kind: "primary" },
        { name: "$pageview", kind: "secondary" },
      ],
    },
    {
      id: 102,
      name: "Onboarding checklist",
      description: "Draft experiment for onboarding",
      featureFlagKey: "new-onboarding",
      status: "draft",
      startDate: null,
      endDate: null,
      metrics: [{ name: "feature_used", kind: "primary" }],
    },
  ];

  const insights: InsightRecord[] = [
    {
      id: 201,
      name: "Daily signups",
      description: "user_signed_up trend",
      insight: "TRENDS",
      filters: { events: [{ id: "user_signed_up" }] },
      query: { kind: "TrendsQuery", series: [{ event: "user_signed_up" }] },
    },
    {
      id: 202,
      name: "Signup to purchase funnel",
      description: "Conversion funnel",
      insight: "FUNNELS",
      filters: {
        events: [{ id: "user_signed_up" }, { id: "purchase_completed" }],
      },
      query: {
        kind: "FunnelsQuery",
        series: [{ event: "user_signed_up" }, { event: "purchase_completed" }],
      },
    },
    {
      id: 203,
      name: "Weekly retention",
      insight: "RETENTION",
      filters: { target_event: "$pageview", returning_event: "$pageview" },
      query: { kind: "RetentionQuery" },
    },
  ];

  const cohorts: CohortRecord[] = [
    {
      id: 301,
      name: "Pro users",
      description: "Users with plan=pro",
      count: 1,
      isStatic: false,
      filters: { properties: [{ key: "plan", value: "pro" }] },
    },
    {
      id: 302,
      name: "Purchasers",
      description: "Completed a purchase",
      count: 2,
      isStatic: true,
      filters: {},
    },
  ];

  const cohortPersonIds: Record<number, string[]> = {
    301: ["person_1"],
    302: ["person_1", "person_3"],
  };

  const groupTypes: GroupTypeRecord[] = [
    { groupTypeIndex: 0, groupType: "company", namePlural: "companies" },
    { groupTypeIndex: 1, groupType: "team", namePlural: "teams" },
  ];

  const groups: GroupRecord[] = [
    {
      groupTypeIndex: 0,
      groupKey: "acme",
      groupType: "company",
      properties: { name: "Acme", plan: "pro", seats: 25 } as JsonObject,
      createdAt: "2024-01-01T00:00:00.000Z",
    },
    {
      groupTypeIndex: 0,
      groupKey: "globex",
      groupType: "company",
      properties: { name: "Globex", plan: "enterprise", seats: 200 } as JsonObject,
      createdAt: "2024-02-01T00:00:00.000Z",
    },
    {
      groupTypeIndex: 1,
      groupKey: "eng",
      groupType: "team",
      properties: { name: "Engineering", size: 12 } as JsonObject,
      createdAt: "2024-03-01T00:00:00.000Z",
    },
  ];

  const dashboards: DashboardRecord[] = [
    {
      id: 401,
      name: "Product overview",
      description: "Core product metrics",
      pinned: true,
      insightIds: [201, 202],
    },
    {
      id: 402,
      name: "Growth",
      description: "Acquisition and retention",
      pinned: false,
      insightIds: [201, 203],
    },
  ];

  const project: ProjectRecord = {
    id: 1,
    name: "Demo Project",
    uuid: "proj-demo-uuid",
    timezone: "UTC",
    apiToken: "phc_mock_token",
  };

  return {
    project,
    persons,
    events,
    flags,
    experiments,
    insights,
    cohorts,
    cohortPersonIds,
    groupTypes,
    groups,
    dashboards,
  };
}
