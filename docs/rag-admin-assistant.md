# AI Log Assistant (RAG admin chatbot)

An AI chatbot and three preset reports inside the Admin Dashboard, answering questions about
`app_logs` — the history of translate / OCR-translate / compose / talk / expert-search requests
(11,500+ rows and growing). It never sends the log table to the model: a daily job embeds
new/changed logs into a `pgvector` column in Supabase, and every question or report retrieves only
the handful of most relevant chunks through semantic search.

## Architecture

```
                daily job / "Run now"                admin asks a question
                         │                                     │
                         ▼                                     ▼
  app_logs ──► classify ──► chunk ──► embed ──► log_embeddings ◄── semantic search ──► chat/report
  (Supabase)   (module/       (shared/rag/    (OpenAI            (pgvector,             LLM call
               severity/      chunking.ts)     embeddings.ts)     match_log_embeddings)   (grounded,
               issue_type                                                                 cites sources)
               heuristic)
```

- **Ingestion** (`shared/rag/ingestion.ts`): pages through `app_logs` after a stored cursor
  (`embedding_sync_state`), classifies each row (`shared/rag/classify.ts`), splits it into one or
  more chunks (`shared/rag/chunking.ts`), embeds them (`shared/rag/embeddings.ts`, with retry +
  per-chunk fallback), and upserts into `log_embeddings`. Every run is recorded in
  `embedding_job_runs`; a chunk that still fails after retries is recorded in
  `embedding_job_errors` instead of blocking every log after it.
- **Search** (`shared/rag/vectorSearch.ts`): embeds the query and calls the `match_log_embeddings`
  Postgres function, which does the cosine-similarity search (HNSW-indexed) with optional
  `module` / `severity` / `issueType` / date filters — entirely in SQL, so only the top-K rows ever
  leave the database.
- **Chat** (`shared/rag/chatService.ts`): retrieves the top matches for the admin's question and
  asks the model to answer *only* from those excerpts, citing `[n]` references. Confidence is the
  average retrieval similarity of the sources actually used (`shared/rag/confidence.ts`) — not a
  model self-rating.
- **Reports** (`shared/rag/reportTemplates.ts`, `reportGenerator.ts`): each of the three presets
  (Performance Impact, Quality Impact, Standards and Issues) defines a few retrieval angles and
  section prompts; the generator computes grouped counts via the `log_embedding_stats` RPC,
  retrieves and merges relevant excerpts, and asks the model to write each section strictly from
  that context.
- **Export** (`shared/rag/docxExport.ts`): turns an already-generated report into a `.docx` buffer
  — never re-runs retrieval or calls the LLM again.
- **API** (`shared/ragRoutes.ts`): all routes are mounted under `/admin/rag` and require the
  existing `x-admin-key` header (`shared/adminAuth.ts`), same as `/admin/metrics` and
  `/admin/responses`.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/admin/rag/templates` | GET | List the three report presets |
| `/api/admin/rag/embeddings/status` | GET | Coverage, last run, unresolved error count |
| `/api/admin/rag/embeddings/run` | POST | Trigger an incremental embedding run now |
| `/api/admin/rag/chat` | POST | `{ question, filters? }` → grounded answer + sources |
| `/api/admin/rag/report` | POST | `{ templateId, filters? }` → structured report |
| `/api/admin/rag/report/export` | POST | `{ report }` → `.docx` file |

## Database

Migration: `supabase/migrations/20260928000000_rag_log_embeddings_setup.sql` and
`20260928000100_rag_log_embedding_stats_rpc.sql` (already applied to the linked Supabase project).
To apply on another project (a fresh environment, a restore):

```bash
supabase db push
# or run the two files directly against the target database with `psql`.
```

They add, additively:
- the `vector` extension (`extensions` schema)
- `log_embeddings` — one row per (log, chunk): `embedding vector(1536)`, plus `module`,
  `severity`, `issue_type`, `from_lang`, `to_lang`, `log_created_at` for filtering, and an HNSW
  index on `embedding`
- `embedding_sync_state` — the incremental-processing cursor (last embedded `app_logs.id`)
- `embedding_job_runs` / `embedding_job_errors` — run history and per-log error logging
- `match_log_embeddings(...)` and `log_embedding_stats(...)` SQL functions

All four new tables are RLS-enabled with a `service_role`-only policy — the same pattern
`app_logs` already uses — so only the server (holding `SUPABASE_SERVICE_ROLE_KEY`) can read or
write them; no anon/authenticated policy exists on them at all.

`app_logs` itself is untouched: module/severity/issue type are derived at ingestion time
(`shared/rag/classify.ts`) rather than written back onto the source table.

## Environment variables

Everything below is optional — the feature works with just the variables the app already
requires (`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_API_KEY`).

```env
# Reused from the rest of the app — no new required variables.
OPENAI_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_API_KEY=...

# Optional tuning (defaults shown):
RAG_EMBEDDING_MODEL=text-embedding-3-small   # must stay 1536-dim to match the schema
RAG_CHAT_MODEL=                              # falls back to APP_ENGINE_ID, then gpt-5.6-luna
RAG_EMBEDDING_BATCH_SIZE=64
RAG_EMBEDDING_MAX_RETRIES=3
RAG_CHUNK_CHAR_SIZE=3200
RAG_CHUNK_OVERLAP_CHARS=400
RAG_MAX_LOGS_PER_RUN=2000
RAG_INGESTION_PAGE_SIZE=200
RAG_UPSERT_BATCH_SIZE=20                     # rows per log_embeddings statement — see "Statement timeouts" below
RAG_REPROCESS_BATCH_SIZE=200                 # previously-failed logs retried per run, before scanning new ones
RAG_SEARCH_TOP_K=8
RAG_SCHEDULER_CHECK_INTERVAL_MS=3600000       # 1h — how often the in-process scheduler checks
RAG_SCHEDULER_RUN_INTERVAL_MS=86400000        # 24h — minimum time between runs

# Only needed if you wire an external cron (see "Scheduling" below):
RAG_CRON_SECRET=some-long-random-string
```

## First backfill

The daily job only processes logs *after* the stored cursor, so on a fresh setup the cursor
starts at 0 and the first run embeds from the oldest log forward. With ~11,500 existing rows and
`RAG_MAX_LOGS_PER_RUN=2000`, the initial backfill takes about 6 runs. Trigger it manually from the
Admin Dashboard's "Run now" button (AI Log Assistant section), or:

```bash
curl -X POST https://<your-host>/api/admin/rag/embeddings/run \
  -H "x-admin-key: $ADMIN_API_KEY"
```

Repeat until `GET /api/admin/rag/embeddings/status` reports `pendingLogs: 0`. Raise
`RAG_MAX_LOGS_PER_RUN` if you'd rather do it in fewer, larger runs (mind OpenAI rate limits).

## Scheduling the daily job

- **Render** (`server.ts`): the Express process is long-lived, so `shared/rag/scheduler.ts` runs
  in-process — no extra infrastructure needed. It checks hourly and runs once ≥24h have passed
  since its last successful run (see `RAG_SCHEDULER_*` above).
- **Netlify Functions** (`netlify/functions/api.ts`): each invocation is stateless and short-lived,
  so nothing can run in-process there. Point an external scheduler at
  `POST /admin/rag/embeddings/run` with the `x-rag-cron-secret` header set to `RAG_CRON_SECRET`
  instead of the human admin key:
  - a Render Cron Job hitting the Render URL, or
  - a scheduled GitHub Actions workflow (`schedule:` trigger) running `curl`.

  Both paths call the same `runIncrementalEmbeddingJob`, and it is idempotent (the cursor only
  advances past a log once it's been attempted), so running it from both Render's in-process
  scheduler and an external cron at the same time is harmless — the second call is simply a no-op
  once the first has caught up.

## Error handling & observability

- **Retries**: each embeddings API call retries with exponential backoff
  (`RAG_EMBEDDING_MAX_RETRIES`); a batch that still fails is retried chunk-by-chunk so one bad
  chunk doesn't take the rest of the batch down with it.
- **Statement timeouts**: Supabase's PostgREST role (`authenticator`) enforces an 8s
  `statement_timeout`, and HNSW index-maintenance cost per inserted row grows with the index's
  size. Writing an entire ingestion page (hundreds of `vector(1536)` rows) in one `upsert` call
  will eventually exceed that timeout as `log_embeddings` grows — this is what caused the bulk of
  `embedding_job_errors` in early testing (all `"canceling statement due to statement timeout"`).
  `shared/rag/ingestion.ts` now writes in sub-batches of `RAG_UPSERT_BATCH_SIZE` rows (default 20),
  falling back to one-row-at-a-time on a batch failure; lower it further if the table grows very
  large and timeouts return.
- **Backlog reprocessing**: every run first retries up to `RAG_REPROCESS_BATCH_SIZE` logs already
  recorded in `embedding_job_errors` (unresolved), before scanning new ones — the cursor has
  already passed a previously-failed log, so nothing else would ever revisit it. A log that
  succeeds on retry has its error rows marked `resolved`; one that fails again gets its existing
  row refreshed rather than duplicated.
- **Processing status**: every run is a row in `embedding_job_runs`
  (`status`: `completed` / `completed_with_errors` / `failed` / `noop`), visible in the dashboard's
  "Embedding index" widget along with total/embedded/pending counts.
- **Error logging**: a chunk that fails all retries is recorded in `embedding_job_errors` with the
  log id and error message, without blocking the rest of the run.
- **Chat/report model calls** go through `shared/modelConfig.ts`'s `createChatCompletion` (the
  same wrapper `/translate`, `/compose`, etc. use), not a raw `openai.chat.completions.create`
  call. That wrapper degrades and retries once if the configured model rejects an optional
  parameter — relevant because `APP_ENGINE_ID` can point at a custom/gateway model (e.g.
  `gpt-5.6-luna`) whose supported parameter surface isn't fully known; sending an unproven
  parameter like `temperature` unconditionally is what caused `POST /admin/rag/chat` to 500 in
  production. Per-model tuning for the `rag-chat` / `rag-report` tasks lives in
  `shared/modelConfig.ts`'s `MODEL_TUNING` table.
- Server logs (`console.error`/`console.warn`) are prefixed `[rag/ingestion]`, `[rag/scheduler]`,
  `[ragRoutes]` for easy filtering.

## Security

- Every `/admin/rag/*` route requires the same `x-admin-key` header as the rest of
  `/api/admin/*` — fail-closed if `ADMIN_API_KEY` is unset (`shared/adminAuth.ts`).
- `log_embeddings`, `embedding_sync_state`, `embedding_job_runs`, and `embedding_job_errors` are
  RLS-enabled with a `service_role`-only policy; the anon/publishable key used by the client bundle
  has no access to them at all.
- The chat and report LLM calls are grounded: the system prompt instructs the model to answer only
  from the retrieved excerpts and to say so when the data is insufficient, rather than fall back on
  general knowledge.
- `RAG_CRON_SECRET` (if set) only grants access to the embedding-run endpoint, never to chat or
  reports.

## Testing

```bash
npm test        # vitest — chunking, classification, confidence scoring, template shape
npm run lint     # tsc --noEmit
```

The pure functions (`classify.ts`, `chunking.ts`, `confidence.ts`, `vectorSearch.ts`'s parameter
builder, `reportTemplates.ts`) are unit-tested without a database or network call. Ingestion,
search, chat, and report generation depend on Supabase + OpenAI and are exercised through the
Admin Dashboard against a real (or staging) deployment.
