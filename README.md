# <img src="docs/images/logo.svg" alt="posthog-mcp" width="40" height="40" align="absmiddle" /> posthog-mcp

MCP server that gives agents a useful PostHog surface: events, persons, feature flags, experiments, insights, cohorts, groups, and project metadata — plus a multi-provider evaluation suite ([Gemini](https://aistudio.google.com/apikey) or [Groq](https://console.groq.com/keys)) that measures whether tools actually help.

**Mock mode is the default** — no API key required. Set `POSTHOG_MODE=live` + credentials to hit a real project. Credentials alone never flip to live.

## Why agents use this

Agents need tools they can call, not dashboards they can screenshot. This repo ships:

- ~25 MCP tools with clear Zod schemas
- A stateful mock PostHog client for offline workflows and evals
- An 80-task evaluation dataset
- Agent evals via Gemini or Groq comparing tool-assisted vs no-tool performance

## Tools (25)

| Category | Tools |
|----------|--------|
| Events & users | `capture_event`, `identify_user`, `get_person`, `list_persons`, `get_person_events` |
| Flags & experiments | `get_feature_flag`, `list_feature_flags`, `get_feature_flag_definition`, `create_feature_flag`, `update_feature_flag`, `list_experiments`, `get_experiment` |
| Insights | `query_trends`, `query_funnel`, `query_retention`, `list_insights`, `get_insight` |
| Cohorts & groups | `list_cohorts`, `get_cohort`, `get_cohort_persons`, `list_group_types`, `list_groups`, `find_group` |
| Project | `get_project`, `list_dashboards` |

Write tools that change flag definitions require `confirm: true`. Deletes and other destructive APIs are intentionally not exposed.

Mock seeded flags: `new-onboarding=true`, `beta-insights=false`, `pricing-experiment="control"`.

## Run locally

```bash
npm install
npm test              # deterministic MCP + dataset contract tests (no Groq key)
npm run eval          # same as npm test
npm run dev           # stdio MCP server
```

### Agent evaluations (Gemini or Groq)

Get API keys:

- **Gemini** — [Google AI Studio](https://aistudio.google.com/apikey)
- **Groq** — [Groq Console](https://console.groq.com/keys)

```bash
# Gemini recommended on free tier (~250k TPM)
npm run eval:agent -- --provider gemini --limit 5 --trials 1
npm run eval:compare -- --provider gemini --limit 5 --trials 1

# Groq still supported
npm run eval:agent -- --provider groq --limit 5
```

Provider resolution: `--provider` > `EVAL_PROVIDER` > `GEMINI_API_KEY` if set > `GROQ_API_KEY`.

See [docs/evaluation.md](./docs/evaluation.md) for scoring, reports, and free-tier limits.

### Configuration (`.env`)

Copy [`.env.example`](./.env.example):

```bash
POSTHOG_MODE=mock
POSTHOG_API_KEY=phc_xxx
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_PERSONAL_API_KEY=phx_xxx
POSTHOG_PROJECT_ID=12345

EVAL_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite

GROQ_API_KEY=gsk_xxx
GROQ_MODEL=openai/gpt-oss-120b
```

| Variable | Default | Notes |
|----------|---------|-------|
| `POSTHOG_MODE` | `mock` | `live` enables real network calls |
| `POSTHOG_API_KEY` | — | Project API key (`phc_...`) for capture/decide |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | Use `https://eu.i.posthog.com` for EU |
| `POSTHOG_PERSONAL_API_KEY` | — | Personal key (`phx_...`) for private REST/query |
| `POSTHOG_PROJECT_ID` | — | Required for live private API tools |
| `EVAL_PROVIDER` | auto | `gemini` or `groq` |
| `GEMINI_API_KEY` | — | Google AI Studio key for agent evals |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Gemini model id (`gemini-3.8-flash` for stronger Flash) |
| `GROQ_API_KEY` | — | Groq key for agent evals |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq model id |

`.env` is git-ignored — never commit real keys.

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector -- npx tsx src/index.ts
```

### Cursor / Claude Desktop MCP config

```json
{
  "mcpServers": {
    "posthog": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/absolute/path/to/posthog-mcp",
      "env": {
        "POSTHOG_MODE": "mock"
      }
    }
  }
}
```

## Scripts

| Script | What it does |
|--------|----------------|
| `npm run dev` | Start stdio MCP server via tsx |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/src/index.js` |
| `npm test` / `npm run eval` | Deterministic MCP + dataset gates (CI-safe) |
| `npm run eval:agent` | Agent eval via Gemini or Groq |
| `npm run eval:compare` | With-tools vs no-tools comparison |
| `npm run typecheck` | Type-check without emitting |

CI runs typecheck → test → build. It does **not** call Groq.

## Layout

```
.env.example
src/
  index.ts              # stdio entry
  server.ts             # MCP server factory
  tools/                # modular tool registration (~25)
  posthog/
    mock/               # stateful mock + seed data
    live/               # live HTTP client
    types.ts errors.ts
eval/
  harness.ts            # deterministic evals
  dataset/tasks.json    # ~80 tasks
  agent/                # LLM providers (Gemini/Groq) + runner
  scoring/              # deterministic scorers
  run-agent.ts
  run-compare.ts
  reports/              # git-ignored outputs
docs/evaluation.md
AGENT.md / llms.txt
```

## Extending

1. Add a method on `PostHogClient` in `src/posthog/types.ts`
2. Implement it in `src/posthog/mock/` and `src/posthog/live/`
3. Register a tool under `src/tools/` and call it from `register.ts`
4. Add harness coverage + dataset tasks as needed

## License

MIT
