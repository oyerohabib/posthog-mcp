/** Shared PostHog-shaped types used by mock + live clients. */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type PostHogMode = "mock" | "live";

export type OkResult = { ok: true; mode: PostHogMode };

// --- Events / identify ---

export type CaptureEventInput = {
  distinctId: string;
  event: string;
  properties?: JsonObject;
};

export type CaptureEventResult = OkResult & {
  distinctId: string;
  event: string;
  captureId?: string;
};

export type IdentifyUserInput = {
  distinctId: string;
  properties: JsonObject;
};

export type IdentifyUserResult = OkResult & {
  distinctId: string;
  properties: JsonObject;
};

// --- Persons ---

export type PersonRecord = {
  id: string;
  distinctIds: string[];
  properties: JsonObject;
  createdAt?: string;
};

export type GetPersonInput = { distinctId: string };
export type GetPersonResult = OkResult & {
  person: PersonRecord | null;
};

export type ListPersonsInput = {
  search?: string;
  limit?: number;
  offset?: number;
};

export type ListPersonsResult = OkResult & {
  persons: PersonRecord[];
  total: number;
};

export type GetPersonEventsInput = {
  distinctId: string;
  limit?: number;
  event?: string;
};

export type StoredEventRecord = {
  captureId: string;
  distinctId: string;
  event: string;
  properties?: JsonObject;
  timestamp: string;
};

export type GetPersonEventsResult = OkResult & {
  distinctId: string;
  events: StoredEventRecord[];
};

// --- Feature flags ---

export type GetFeatureFlagInput = {
  distinctId: string;
  flagKey: string;
  personProperties?: JsonObject;
};

export type GetFeatureFlagResult = OkResult & {
  flagKey: string;
  distinctId: string;
  value: boolean | string | null;
  enabled: boolean;
};

export type FeatureFlagDefinition = {
  id: number;
  key: string;
  name: string;
  active: boolean;
  filters?: JsonObject;
  rolloutPercentage?: number | null;
  defaultValue?: boolean | string | null;
};

export type ListFeatureFlagsResult = OkResult & {
  flags: Array<{
    key: string;
    active: boolean;
    id?: number;
    name?: string;
    defaultValue?: boolean | string | null;
  }>;
};

export type GetFeatureFlagDefinitionInput = {
  key?: string;
  id?: number;
};

export type GetFeatureFlagDefinitionResult = OkResult & {
  flag: FeatureFlagDefinition | null;
};

export type CreateFeatureFlagInput = {
  key: string;
  name?: string;
  active?: boolean;
  rolloutPercentage?: number;
  confirm: boolean;
};

export type CreateFeatureFlagResult = OkResult & {
  flag: FeatureFlagDefinition;
};

export type UpdateFeatureFlagInput = {
  key?: string;
  id?: number;
  name?: string;
  active?: boolean;
  rolloutPercentage?: number;
  confirm: boolean;
};

export type UpdateFeatureFlagResult = OkResult & {
  flag: FeatureFlagDefinition;
};

// --- Experiments ---

export type ExperimentRecord = {
  id: number;
  name: string;
  description?: string;
  featureFlagKey?: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  metrics?: JsonObject[];
};

export type ListExperimentsInput = {
  status?: string;
  limit?: number;
  offset?: number;
};

export type ListExperimentsResult = OkResult & {
  experiments: ExperimentRecord[];
};

export type GetExperimentInput = { id: number };
export type GetExperimentResult = OkResult & {
  experiment: ExperimentRecord | null;
};

// --- Insights / queries ---

export type QueryTrendsInput = {
  event: string;
  dateFrom?: string;
  dateTo?: string;
  interval?: "hour" | "day" | "week" | "month";
};

export type QueryTrendsResult = OkResult & {
  event: string;
  interval: string;
  series: Array<{ date: string; count: number }>;
  total: number;
};

export type QueryFunnelInput = {
  events: string[];
  dateFrom?: string;
  dateTo?: string;
};

export type QueryFunnelResult = OkResult & {
  steps: Array<{ event: string; count: number; conversionRate: number }>;
};

export type QueryRetentionInput = {
  targetEvent?: string;
  returningEvent?: string;
  dateFrom?: string;
  period?: "Day" | "Week" | "Month";
};

export type QueryRetentionResult = OkResult & {
  periods: Array<{ period: number; count: number; rate: number }>;
};

export type InsightRecord = {
  id: number;
  name: string;
  description?: string;
  filters?: JsonObject;
  query?: JsonObject;
  insight?: string;
};

export type ListInsightsInput = {
  search?: string;
  limit?: number;
  offset?: number;
};

export type ListInsightsResult = OkResult & {
  insights: InsightRecord[];
};

export type GetInsightInput = { id: number };
export type GetInsightResult = OkResult & {
  insight: InsightRecord | null;
};

// --- Cohorts ---

export type CohortRecord = {
  id: number;
  name: string;
  description?: string;
  count?: number;
  isStatic?: boolean;
  filters?: JsonObject;
};

export type ListCohortsInput = { limit?: number; offset?: number };
export type ListCohortsResult = OkResult & { cohorts: CohortRecord[] };

export type GetCohortInput = { id: number };
export type GetCohortResult = OkResult & { cohort: CohortRecord | null };

export type GetCohortPersonsInput = {
  id: number;
  limit?: number;
  offset?: number;
};

export type GetCohortPersonsResult = OkResult & {
  cohortId: number;
  persons: PersonRecord[];
  total: number;
};

// --- Groups ---

export type GroupTypeRecord = {
  groupTypeIndex: number;
  groupType: string;
  namePlural?: string;
};

export type GroupRecord = {
  groupTypeIndex: number;
  groupKey: string;
  groupType?: string;
  properties: JsonObject;
  createdAt?: string;
};

export type ListGroupTypesResult = OkResult & {
  groupTypes: GroupTypeRecord[];
};

export type ListGroupsInput = {
  groupTypeIndex: number;
  search?: string;
  limit?: number;
};

export type ListGroupsResult = OkResult & {
  groups: GroupRecord[];
};

export type FindGroupInput = {
  groupTypeIndex: number;
  groupKey: string;
};

export type FindGroupResult = OkResult & {
  group: GroupRecord | null;
};

// --- Project / dashboards ---

export type ProjectRecord = {
  id: number | string;
  name: string;
  uuid?: string;
  timezone?: string;
  apiToken?: string;
};

export type GetProjectResult = OkResult & {
  project: ProjectRecord;
};

export type DashboardRecord = {
  id: number;
  name: string;
  description?: string;
  pinned?: boolean;
  insightIds?: number[];
};

export type ListDashboardsInput = { limit?: number; offset?: number };
export type ListDashboardsResult = OkResult & {
  dashboards: DashboardRecord[];
};

/** Full client surface used by MCP tools. */
export interface PostHogClient {
  readonly mode: PostHogMode;

  captureEvent(input: CaptureEventInput): Promise<CaptureEventResult>;
  identifyUser(input: IdentifyUserInput): Promise<IdentifyUserResult>;
  getPerson(input: GetPersonInput): Promise<GetPersonResult>;
  listPersons(input: ListPersonsInput): Promise<ListPersonsResult>;
  getPersonEvents(input: GetPersonEventsInput): Promise<GetPersonEventsResult>;

  getFeatureFlag(input: GetFeatureFlagInput): Promise<GetFeatureFlagResult>;
  listFeatureFlags(): Promise<ListFeatureFlagsResult>;
  getFeatureFlagDefinition(
    input: GetFeatureFlagDefinitionInput,
  ): Promise<GetFeatureFlagDefinitionResult>;
  createFeatureFlag(input: CreateFeatureFlagInput): Promise<CreateFeatureFlagResult>;
  updateFeatureFlag(input: UpdateFeatureFlagInput): Promise<UpdateFeatureFlagResult>;

  listExperiments(input: ListExperimentsInput): Promise<ListExperimentsResult>;
  getExperiment(input: GetExperimentInput): Promise<GetExperimentResult>;

  queryTrends(input: QueryTrendsInput): Promise<QueryTrendsResult>;
  queryFunnel(input: QueryFunnelInput): Promise<QueryFunnelResult>;
  queryRetention(input: QueryRetentionInput): Promise<QueryRetentionResult>;
  listInsights(input: ListInsightsInput): Promise<ListInsightsResult>;
  getInsight(input: GetInsightInput): Promise<GetInsightResult>;

  listCohorts(input: ListCohortsInput): Promise<ListCohortsResult>;
  getCohort(input: GetCohortInput): Promise<GetCohortResult>;
  getCohortPersons(input: GetCohortPersonsInput): Promise<GetCohortPersonsResult>;

  listGroupTypes(): Promise<ListGroupTypesResult>;
  listGroups(input: ListGroupsInput): Promise<ListGroupsResult>;
  findGroup(input: FindGroupInput): Promise<FindGroupResult>;

  getProject(): Promise<GetProjectResult>;
  listDashboards(input: ListDashboardsInput): Promise<ListDashboardsResult>;
}
