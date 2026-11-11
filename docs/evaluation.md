# Evaluation guide

This project measures whether PostHog MCP tools help a hosted model complete realistic tasks. Agent evals support **Gemini** and **Groq** via the same OpenAI-compatible chat/completions + tool-calling loop.

## Layers

1. **Deterministic harness** (`npm test` / `npm run eval`)  
   Real MCP over in-memory transport. Contract checks (25 tools, confirm schemas), happy paths, validation failures, and dataset shape (80 tasks). **No LLM API key. Used in CI.**

2. **Agent eval** (`npm run eval:agent`)  
   Gemini or Groq via OpenAI-compatible APIs. Tools come from live MCP `listTools()` schemas (not duplicated). Default mode uses the mock PostHog client so outcomes are checkable.

3. **Compare** (`npm run eval:compare`)  
   Same tasks, same model/prompts, with tools vs without tools. Writes a comparison report.

## Providers

| Provider | Env key | Default model | Default TPM pacing |
|----------|---------|---------------|--------------------|
| `gemini` | `GEMINI_API_KEY` | `gemini-3.5-flash-lite` | `250000` |
| `groq` | `GROQ_API_KEY` | `openai/gpt-oss-120b` | `8000` |

Selection order:

1. `--provider gemini|groq`
2. `EVAL_PROVIDER`
3. Prefer `gemini` if `GEMINI_API_KEY` is set, else `groq` if `GROQ_API_KEY` is set

Gemini uses `https://generativelanguage.googleapis.com/v1beta/openai` (OpenAI compatibility). Get a key from [Google AI Studio](https://aistudio.google.com/apikey).

## Dataset (~80 tasks)

Location: [`eval/dataset/tasks.json`](../eval/dataset/tasks.json)

| Category | Count |
|----------|------:|
| `events_users` | 15 |
| `flags_experiments` | 15 |
| `insights_analytics` | 20 |
| `cohorts_groups` | 10 |
| `project_config` | 10 |
| `multi_step` | 10 |

Each task includes: `id`, `category`, `difficulty`, `prompt`, `expectedBehavior`, `expectedTools`, optional `argumentConstraints`, `expectedOutcome`, and `validation` (response substrings, mock state checks, clarify/refuse flags).

## Scoring (deterministic)

Primary success criteria (not LLM-as-judge):

- Expected tools selected (and ordered when `validation.orderedTools`)
- Argument constraints match
- Mock state updated when the task requires a write (event captured, person props, flag exists)
- Final response includes required substrings
- Clarify / refuse behaviour when marked

KPIs reported: success rate (overall + by category), tool selection accuracy, argument accuracy, latency, retries, token usage, estimated cost, unnecessary/invalid tool calls, per-task multi-trial variance.

## Running

```bash
cp .env.example .env   # set GEMINI_API_KEY and/or GROQ_API_KEY

# Gemini (recommended on free tier)
npm run eval:agent -- --provider gemini --limit 5 --trials 1

# Groq
npm run eval:agent -- --provider groq --limit 5 --trials 1

# category slice
npm run eval:agent -- --provider gemini --category events_users --trials 2

# comparison
npm run eval:compare -- --provider gemini --limit 5 --trials 1
```

Reports land in `eval/reports/<provider>-<timestamp>/` as `summary.json` + `summary.md` (git-ignored).

## Free-tier limits

### Gemini (recommended)

- Default model is **`gemini-3.5-flash-lite`** (best free-tier capacity; `gemini-2.5-flash` 404s for new keys)
- Stronger option: `GEMINI_MODEL=gemini-3.8-flash` (may return 503 under high demand — runner retries)
- Free Flash tiers are often **~250k TPM** (and RPM/RPD limits — check AI Studio for your project)
- Set `GEMINI_TPM_LIMIT=250000` (default) to match pacing
- Cost estimate in reports is **$0** for free-tier Gemini (documented estimate)

### Groq

- Free tier is often **~8000 TPM** for `openai/gpt-oss-120b`
- Set `GROQ_TPM_LIMIT=8000` (default)
- Model does **not** support parallel tool calls; the runner executes one tool per turn

### Shared runner behaviour

- Paces requests against the active provider TPM budget
- Parses `try again in Xs` / quota errors and retries up to 6 times
- Compacts tool JSON schemas before send to cut prompt tokens
- Prefer small slices while testing: `--limit 5 --trials 1`

## Scoring notes

- Success prioritizes **tool selection**, **arguments**, and **mock state** (e.g. event actually captured)
- Soft protocol tokens like `"ok"` in the final prose are not required when tools/mock state already prove success

## CI

GitHub Actions runs `typecheck`, `test`, and `build` only. Never commit API keys. Agent evals are optional local/nightly workflows.
