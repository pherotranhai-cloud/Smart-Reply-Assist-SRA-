-- RAG admin assistant: pgvector storage for semantic search over app_logs.
--
-- Applied directly to the linked Supabase project via the Supabase MCP tool;
-- this file is the durable record of that change for anyone re-provisioning
-- the database (supabase db push / a fresh project).

-- Enable pgvector for semantic search over app_logs.
create extension if not exists vector with schema extensions;

-- One row per (log, chunk). A log's input/output text is usually one chunk;
-- long ones split into several, each embedded and searched independently.
create table if not exists public.log_embeddings (
  id bigserial primary key,
  log_id bigint not null references public.app_logs(id) on delete cascade,
  chunk_index integer not null default 0,
  content text not null,
  content_hash text not null,
  embedding extensions.vector(1536) not null,
  module text,
  severity text,
  issue_type text,
  from_lang text,
  to_lang text,
  log_created_at timestamptz,
  token_estimate integer,
  created_at timestamptz not null default now(),
  unique (log_id, chunk_index)
);

create index if not exists log_embeddings_embedding_hnsw_idx
  on public.log_embeddings using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists log_embeddings_log_created_at_idx on public.log_embeddings (log_created_at);
create index if not exists log_embeddings_module_idx on public.log_embeddings (module);
create index if not exists log_embeddings_severity_idx on public.log_embeddings (severity);
create index if not exists log_embeddings_issue_type_idx on public.log_embeddings (issue_type);

alter table public.log_embeddings enable row level security;
create policy "Allow service_role full access on log_embeddings"
  on public.log_embeddings for all to service_role using (true) with check (true);

-- Singleton cursor: the highest app_logs.id already embedded, so the daily
-- job scans only rows newer than this instead of the whole table.
create table if not exists public.embedding_sync_state (
  id smallint primary key default 1,
  last_log_id bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint embedding_sync_state_singleton check (id = 1)
);
insert into public.embedding_sync_state (id, last_log_id)
  values (1, 0)
  on conflict (id) do nothing;

alter table public.embedding_sync_state enable row level security;
create policy "Allow service_role full access on embedding_sync_state"
  on public.embedding_sync_state for all to service_role using (true) with check (true);

-- One row per ingestion run (manual trigger, daily scheduler, or external cron ping).
create table if not exists public.embedding_job_runs (
  id bigserial primary key,
  trigger text not null default 'manual',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  logs_scanned integer not null default 0,
  logs_embedded integer not null default 0,
  logs_failed integer not null default 0,
  chunks_created integer not null default 0,
  error_message text
);
create index if not exists embedding_job_runs_started_at_idx on public.embedding_job_runs (started_at desc);

alter table public.embedding_job_runs enable row level security;
create policy "Allow service_role full access on embedding_job_runs"
  on public.embedding_job_runs for all to service_role using (true) with check (true);

-- Per-log failures within a run, so a bad row is retried/inspected without
-- rerunning (or blocking) the whole batch.
create table if not exists public.embedding_job_errors (
  id bigserial primary key,
  job_run_id bigint references public.embedding_job_runs(id) on delete cascade,
  log_id bigint,
  attempt_count integer not null default 1,
  error_message text not null,
  last_attempted_at timestamptz not null default now(),
  resolved boolean not null default false
);
create index if not exists embedding_job_errors_log_id_idx on public.embedding_job_errors (log_id);
create index if not exists embedding_job_errors_resolved_idx on public.embedding_job_errors (resolved);

alter table public.embedding_job_errors enable row level security;
create policy "Allow service_role full access on embedding_job_errors"
  on public.embedding_job_errors for all to service_role using (true) with check (true);

-- Cosine-similarity search with optional metadata filters, done in SQL so it
-- can use the HNSW index rather than pulling rows to the app to filter.
create or replace function public.match_log_embeddings(
  query_embedding extensions.vector(1536),
  match_count integer default 8,
  filter_module text default null,
  filter_severity text default null,
  filter_issue_type text default null,
  filter_from timestamptz default null,
  filter_to timestamptz default null
)
returns table (
  id bigint,
  log_id bigint,
  chunk_index integer,
  content text,
  module text,
  severity text,
  issue_type text,
  from_lang text,
  to_lang text,
  log_created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    le.id,
    le.log_id,
    le.chunk_index,
    le.content,
    le.module,
    le.severity,
    le.issue_type,
    le.from_lang,
    le.to_lang,
    le.log_created_at,
    1 - (le.embedding <=> query_embedding) as similarity
  from public.log_embeddings le
  where (filter_module is null or le.module = filter_module)
    and (filter_severity is null or le.severity = filter_severity)
    and (filter_issue_type is null or le.issue_type = filter_issue_type)
    and (filter_from is null or le.log_created_at >= filter_from)
    and (filter_to is null or le.log_created_at <= filter_to)
  order by le.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_log_embeddings to service_role;

-- Pin search_path on the RPC (flagged by the Supabase linter otherwise).
alter function public.match_log_embeddings(
  extensions.vector, integer, text, text, text, timestamptz, timestamptz
) set search_path = public, extensions;
