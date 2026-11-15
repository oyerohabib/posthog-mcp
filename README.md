# <img src="docs/images/logo.png" alt="posthog-mcp" width="40" height="40" align="absmiddle" /> posthog-mcp

Use PostHog from Cursor (and other MCP clients) with **one URL** — no API keys pasted into your editor.

**Public MCP endpoint:** [`https://posthog-mcp.up.railway.app/mcp`](https://posthog-mcp.up.railway.app/mcp)

You sign in once (WorkOS), then link your PostHog account and pick a project in the browser. After that, agents can call tools like `list_feature_flags`, `query_trends`, and `capture_event` against **your** project. Secrets stay on the server.

---

## Use it in Cursor (most people)

### 1. Add the server

Open Cursor MCP settings and add:

```json
{
  "mcpServers": {
    "posthog": {
      "url": "https://posthog-mcp.up.railway.app/mcp"
    }
  }
}
```

Save and enable/connect the **posthog** server. You should **not** add `Authorization` headers, `MCP_API_KEY`, or PostHog `phx_` / `phc_` keys here.

### 2. Sign in (WorkOS)

When Cursor connects, it should open a browser for **WorkOS AuthKit** sign-in / sign-up.

- Complete that flow and return to Cursor.
- The MCP server should show as connected (on the order of **26 tools**).

If Cursor shows a connection error that still mentions an onboarding URL, MCP auth may already have succeeded — continue with step 3.

### 3. Link PostHog and pick a project

MCP login ≠ PostHog access. You still need to authorize PostHog once.

1. In Cursor chat, ask the agent to run **`get_setup_status`** (or run that tool yourself).
2. Read the result:
   - `status: "ready"` → you are done; skip to [Using tools](#4-using-tools).
   - `status: "needs_posthog"` or `"needs_project"` → copy **`connectUrl`** and open it in a browser.
3. The page starts **PostHog OAuth** (sign in to PostHog if needed, approve access).
4. **Select the project** you want this MCP to use.
5. When you see **Connected** / **Return to Cursor**, go back to Cursor.
6. Optionally run `get_setup_status` again — it should report `ready` and may include your project name.

If you already have an onboarding link from an error message, you can open that URL directly; it looks like:

`https://posthog-mcp.up.railway.app/onboarding?user=<your-id>`

### 4. Using tools

Examples you can ask for:

| Goal | Example tool |
|------|----------------|
| Check setup | `get_setup_status` |
| List flags | `list_feature_flags` |
| Evaluate a flag | `get_feature_flag` |
| Trends / funnel / retention | `query_trends`, `query_funnel`, `query_retention` |
| Capture an event | `capture_event` |
| Look up a person | `get_person`, `list_persons` |

Flag **create/update** tools require `confirm: true`. There are **no delete** tools.

### 5. Change project or disconnect

Open your onboarding page again (from `get_setup_status` → `connectUrl`, or a previous `/onboarding?user=…` link):

- **Change project** — pick another project you can access  
- **Disconnect** — revoke PostHog access for this MCP user  

Then return to Cursor and retry tools.

### What you never put in Cursor

- PostHog personal keys (`phx_…`) or project keys (`phc_…`)
- Shared `MCP_API_KEY` / bearer tokens
- WorkOS or Railway secrets

### Troubleshooting (consumers)

| What you see | What to do |
|--------------|------------|
| Cursor never opens a login browser | Confirm the URL is exactly `https://posthog-mcp.up.railway.app/mcp` (include `/mcp`). Toggle the server off/on. |
| Connected but tools say PostHog connection required | Run `get_setup_status`, open `connectUrl`, finish authorize + project select. |
| `get_setup_status` missing from the tool list | Disconnect and reconnect the MCP server so Cursor refreshes tools (expect ~26 tools). |
| Tools fail after you thought you connected | Confirm the onboarding page says **Connected** for the right project; run `get_setup_status` again. |
| Want a different PostHog project | Use Change project on the onboarding page, then retry in Cursor. |

Health check (optional): [https://posthog-mcp.up.railway.app/health](https://posthog-mcp.up.railway.app/health) should return `{"ok":true}`.

---

## What this MCP can do

26 tools covering a focused analytics surface: setup, events, persons, feature flags, experiments, insights, cohorts, groups, and project metadata.

| Category | Tools |
|----------|--------|
| Setup | `get_setup_status` |
| Events & users | `capture_event`, `identify_user`, `get_person`, `list_persons`, `get_person_events` |
| Flags & experiments | `get_feature_flag`, `list_feature_flags`, `get_feature_flag_definition`, `create_feature_flag`, `update_feature_flag`, `list_experiments`, `get_experiment` |
| Insights | `query_trends`, `query_funnel`, `query_retention`, `list_insights`, `get_insight` |
| Cohorts & groups | `list_cohorts`, `get_cohort`, `get_cohort_persons`, `list_group_types`, `list_groups`, `find_group` |
| Project | `get_project`, `list_dashboards` |

This is a **sample** of everyday analytics tools, not PostHog’s full hosted catalog. For the broader product MCP, see [PostHog MCP](https://posthog.com/mcp) and the [tools reference](https://posthog.com/docs/model-context-protocol/tools).

### How auth works (short)

| Layer | Purpose |
|-------|---------|
| Cursor ↔ this server | WorkOS proves **who** is using the MCP |
| This server ↔ PostHog | Your linked account + selected project (encrypted on the server) |

More detail: [docs/oauth-onboarding.md](./docs/oauth-onboarding.md).

---

## Self-host or develop (optional)

Most users can ignore this section and use the public URL above.

- **Deploy your own:** [docs/deploy-railway.md](./docs/deploy-railway.md), [docs/oauth-onboarding.md](./docs/oauth-onboarding.md)
- **Local STDIO / mock / evals:** see below

### Local development & STDIO

For contributing, running tests, or stdio MCP with env credentials — **not** required to consume the public server.

```bash
npm install
npm test
npm run dev           # STDIO MCP (mock by default)
npm run dev:http      # local HTTP MCP
```

**Cursor / Claude — local STDIO**

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

Mock seeded flags: `new-onboarding=true`, `beta-insights=false`, `pricing-experiment="control"`.

Copy [`.env.example`](./.env.example) for STDIO live mode (`POSTHOG_MODE=live`, `phc_` / `phx_`, project id) and for self-hosted HTTP OAuth vars. Never commit real keys.

| Script | Purpose |
|--------|---------|
| `npm test` | STDIO + HTTP + OAuth harnesses (CI) |
| `npm run eval:agent` / `eval:compare` | Gemini / Groq agent evals — [docs/evaluation.md](./docs/evaluation.md) |
| `npm run typecheck` / `build` / `start:http` | Typecheck, compile, run HTTP |

```bash
npx @modelcontextprotocol/inspector -- npx tsx src/index.ts
```

### Extending the tools

1. Add a method on `PostHogClient` in `src/posthog/types.ts`
2. Implement in `src/posthog/mock/` and `src/posthog/live/`
3. Register under `src/tools/` via `register.ts`
4. Add harness coverage as needed

## License

MIT
