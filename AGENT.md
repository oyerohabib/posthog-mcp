# AGENT.md — posthog-mcp

Instructions for AI agents using this MCP server.

## Purpose

Drive a PostHog analytics surface over MCP (~25 tools). Default mode is **mock** (in-memory, no credentials). Use live mode only when env vars are explicitly set.

## Connection

- Transport: **stdio**
- Start: `npx tsx src/index.ts` (or `node dist/src/index.js` after build)
- Env:
  - `POSTHOG_MODE` = `mock` (default) | `live`
  - `POSTHOG_API_KEY` — project API key (`phc_…`), required for live capture/decide
  - `POSTHOG_HOST` — default `https://us.i.posthog.com`
  - `POSTHOG_PERSONAL_API_KEY` — personal key (`phx_…`) for private REST + query
  - `POSTHOG_PROJECT_ID` — numeric project id for private API paths

Do not write logs to stdout; the protocol owns stdout.

## Tool categories

### Events & users

| Tool | Notes |
|------|--------|
| `capture_event` | `distinctId`, `event`, optional `properties` |
| `identify_user` | `distinctId`, non-empty `properties` ($set) |
| `get_person` | by `distinctId` → person or null |
| `list_persons` | optional `search`, `limit`, `offset` |
| `get_person_events` | recent events for a `distinctId` |

### Feature flags & experiments

| Tool | Notes |
|------|--------|
| `get_feature_flag` | evaluate for user; mock seeds below |
| `list_feature_flags` | list definitions |
| `get_feature_flag_definition` | by `key` or `id` |
| `create_feature_flag` | requires `confirm: true` |
| `update_feature_flag` | requires `confirm: true` |
| `list_experiments` | optional `status` |
| `get_experiment` | by numeric `id` |

Mock seeded flags:

| key | value |
|-----|-------|
| `new-onboarding` | `true` |
| `beta-insights` | `false` |
| `pricing-experiment` | `"control"` |

### Insights

`query_trends`, `query_funnel`, `query_retention`, `list_insights`, `get_insight`

### Cohorts & groups

`list_cohorts`, `get_cohort`, `get_cohort_persons`, `list_group_types`, `list_groups` (needs `groupTypeIndex`), `find_group`

### Project

`get_project`, `list_dashboards`

## Safety

- Never invent PostHog data when tools are available — call tools.
- Flag create/update: only with explicit user confirmation and `confirm: true`.
- There are **no delete tools**. Refuse permanent deletes / destructive SQL / token changes.
- If `distinctId`, flag key, or other required fields are missing, ask for clarification.

## Preferred discovery order

1. `get_project` / `list_feature_flags` / `list_group_types` — orient
2. Read tools (`get_*`, `list_*`, `query_*`)
3. `identify_user` / `capture_event` when recording state
4. Flag writes only when confirmed

## Error handling

- Treat `isError: true` or `ok: false` as failure; read `message` and `error`.
- Do not retry validation errors with the same arguments.
- Live upstream / rate-limit errors may get one retry with backoff.

## Eval

```bash
npm test                 # deterministic, CI-safe
npm run eval:agent -- --provider gemini   # Gemini or Groq + tools
npm run eval:compare -- --provider gemini # with vs without tools
```

See `docs/evaluation.md`.
