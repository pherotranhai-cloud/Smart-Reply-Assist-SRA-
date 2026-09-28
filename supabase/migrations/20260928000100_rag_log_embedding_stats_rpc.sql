-- Grouped counts for report generation, computed in SQL rather than pulling
-- rows to the app to aggregate (log_embeddings can hold tens of thousands of
-- chunk rows once fully backfilled).
create or replace function public.log_embedding_stats(
  filter_from timestamptz default null,
  filter_to timestamptz default null
)
returns table (
  module text,
  severity text,
  issue_type text,
  log_count bigint
)
language sql stable
as $$
  select module, severity, issue_type, count(distinct log_id) as log_count
  from public.log_embeddings
  where chunk_index = 0
    and (filter_from is null or log_created_at >= filter_from)
    and (filter_to is null or log_created_at <= filter_to)
  group by module, severity, issue_type
  order by log_count desc;
$$;

grant execute on function public.log_embedding_stats to service_role;

alter function public.log_embedding_stats(timestamptz, timestamptz) set search_path = public;
