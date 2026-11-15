# <img src="docs/images/logo.png" alt="posthog-mcp" width="40" height="40" align="absmiddle" /> posthog-mcp

MCP server that gives agents a useful PostHog surface: events, persons, feature flags, experiments, insights, cohorts, groups, and project metadata — plus a multi-provider evaluation suite ([Gemini](https://aistudio.google.com/apikey) or [Groq](https://console.groq.com/keys)) that measures whether tools actually help.

**Mock mode is the default** — no API key required. Set `POSTHOG_MODE=live` + credentials to hit a real project. Credentials alone never flip to live.

## Why agents use this

Agents need tools they can call, not dashboards they can screenshot. This repo ships:

- ~25 MCP tools with clear Zod schemas
- A stateful mock PostHog client for offline workflows and evals
- An 80-task evaluation dataset
- Agent evals via Gemini or Groq comparing tool-assisted vs no-tool performance

## Tools (26)

| Category | Tools |
|----------|--------|
| Setup | `get_setup_status` (remote: PostHog connect link / ready check) |
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
npm test              # deterministic MCP + HTTP auth/transport tests (no LLM keys)
npm run eval          # STDIO contract tests only
npm run dev           # stdio MCP server
npm run dev:http      # remote Streamable HTTP MCP (needs MCP_API_KEY)
```

### Local STDIO vs remote HTTP

| Mode | Entry | Auth | PostHog credentials |
|------|--------|------|---------------------|
| **STDIO** (local) | `npm run dev` | Process env | `.env` / `POSTHOG_MODE` |
| **HTTP** (remote) | `npm run dev:http` / Railway | **OAuth 2.1** (WorkOS AuthKit) | **PostHog OAuth** + project picker (stored encrypted) |

End users add only the MCP URL in Cursor — no shared `MCP_API_KEY` and no `phx_` / `phc_` headers. See [docs/oauth-onboarding.md](./docs/oauth-onboarding.md).

Ops may still use `MCP_API_KEY` + `X-PostHog-*` headers when `ALLOW_POSTHOG_HEADER_CREDENTIALS=1`.

See [docs/deploy-railway.md](./docs/deploy-railway.md) for hosting.

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

# Remote HTTP (Railway / npm run dev:http)
MCP_API_KEY=your_long_random_secret
PORT=8787

EVAL_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite

GROQ_API_KEY=gsk_xxx
GROQ_MODEL=openai/gpt-oss-120b
```

| Variable | Default | Notes |
|----------|---------|-------|
| `POSTHOG_MODE` | `mock` | STDIO only — `live` enables real network calls |
| `POSTHOG_API_KEY` | — | STDIO project API key (`phc_...`) |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | Use `https://eu.i.posthog.com` for EU |
| `POSTHOG_PERSONAL_API_KEY` | — | STDIO personal key (`phx_...`) |
| `POSTHOG_PROJECT_ID` | — | STDIO project id |
| `MCP_API_KEY` | — | **Required in production HTTP** — bearer secret |
| `PORT` | `8787` | HTTP listen port (Railway sets this) |
| `MCP_ALLOWED_ORIGINS` | empty | Comma-separated browser Origins (optional) |
| `POSTHOG_ALLOWED_HOSTS` | cloud defaults | Extra allowed PostHog hostnames |
| `EVAL_PROVIDER` | auto | `gemini` or `groq` |
| `GEMINI_API_KEY` | — | Google AI Studio key for agent evals |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Gemini model id |
| `GROQ_API_KEY` | — | Groq key for agent evals |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq model id |

`.env` is git-ignored — never commit real keys. Do **not** put PostHog/Gemini/Groq keys in Railway for the HTTP service; PostHog credentials are sent per request.

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector -- npx tsx src/index.ts
```

### Cursor / Claude Desktop — local STDIO

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

### Cursor — remote HTTP (Railway)

After deploying OAuth (see [docs/oauth-onboarding.md](./docs/oauth-onboarding.md)):

```json
{
  "mcpServers": {
    "posthog": {
      "url": "https://YOUR-RAILWAY-DOMAIN/mcp"
    }
  }
}
```

Cursor performs MCP OAuth with WorkOS AuthKit. Then call `get_setup_status` and open `connectUrl` to authorize PostHog and pick a project. Endpoints: `GET /health`, Streamable HTTP `/mcp`, CIMD `/oauth/posthog-client`.

## Scripts

| Script | What it does |
|--------|----------------|
| `npm run dev` | Start stdio MCP server via tsx |
| `npm run dev:http` | Start Streamable HTTP MCP server |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled STDIO server |
| `npm run start:http` | Run compiled HTTP server (Railway) |
| `npm test` | STDIO + HTTP + OAuth harness tests |
| `npm run eval` | STDIO contract tests only |
| `npm run eval:agent` | Agent eval via Gemini or Groq |
| `npm run eval:compare` | With-tools vs no-tools comparison |
| `npm run typecheck` | Type-check without emitting |

CI runs typecheck → test → build. It does **not** call Groq, Gemini, or live PostHog.

## Layout

```
.env.example
railway.toml
src/
  index.ts              # stdio entry
  http.ts               # Streamable HTTP entry (Railway)
  http/                 # auth (API key + WorkOS JWT), OAuth PRM, onboarding, DB
  server.ts             # MCP server factory
  tools/                # modular tool registration (~25)
  posthog/
    mock/               # stateful mock + seed data
    live/               # live HTTP client
    types.ts errors.ts
eval/
  harness.ts            # deterministic STDIO evals
  http-harness.ts       # HTTP auth + transport tests
  dataset/tasks.json    # ~80 tasks
  agent/                # LLM providers (Gemini/Groq) + runner
  scoring/              # deterministic scorers
  run-agent.ts
  run-compare.ts
  reports/              # git-ignored outputs
docs/evaluation.md
docs/deploy-railway.md
AGENT.md / llms.txt
```

## Extending

1. Add a method on `PostHogClient` in `src/posthog/types.ts`
2. Implement it in `src/posthog/mock/` and `src/posthog/live/`
3. Register a tool under `src/tools/` and call it from `register.ts`
4. Add harness coverage + dataset tasks as needed

## License

MIT
