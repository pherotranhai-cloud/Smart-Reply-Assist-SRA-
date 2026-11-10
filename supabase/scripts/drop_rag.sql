-- Removes everything the (now deleted) RAG admin assistant created in Supabase:
-- the objects from supabase/migrations/20260928000000_rag_log_embeddings_setup.sql
-- and 20260928000100_rag_log_embedding_stats_rpc.sql (see git history).
--
-- Not touched: public.app_logs (usage logs, still written by the AI routes),
-- user_feedbacks and security_rules.
--
-- Run once in the Supabase SQL editor (or `psql -f`). It is idempotent
-- (IF EXISTS everywhere) and atomic: any error rolls the whole thing back.
-- Data in these tables is deleted permanently — export it first if needed.

begin;

-- 1. RPC functions (dropped first; their bodies read public.log_embeddings).
drop function if exists public.match_log_embeddings(
  extensions.vector, integer, text, text, text, timestamptz, timestamptz
);
drop function if exists public.log_embedding_stats(timestamptz, timestamptz);

-- 2. Tables. Indexes, RLS policies, sequences and constraints go with them.
--    embedding_job_errors references embedding_job_runs, so it goes first.
drop table if exists public.embedding_job_errors;
drop table if exists public.embedding_job_runs;
drop table if exists public.embedding_sync_state;
drop table if exists public.log_embeddings;

commit;

-- 3. Optional: the pgvector extension was enabled for RAG only. Dropping it
--    WITHOUT cascade fails safely if anything else in the database still uses
--    the vector type, so it is left out of the transaction above. Uncomment
--    to run it once you have confirmed nothing else needs pgvector.
-- drop extension if exists vector;

-- 4. Check: should return 0 rows.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('log_embeddings', 'embedding_sync_state', 'embedding_job_runs', 'embedding_job_errors')
union all
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('match_log_embeddings', 'log_embedding_stats');
