create or replace function public.claim_rag_reindex_jobs(
  p_limit integer default 5,
  p_source_type text default null
)
returns setof public.rag_reindex_jobs
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  return query
  with candidates as (
    select j.id
    from public.rag_reindex_jobs j
    where (
      j.status = 'pending'
      or (
        j.status = 'processing'
        and j.updated_at < now() - interval '30 minutes'
      )
    )
      and (p_source_type is null or j.source_type = p_source_type)
    order by j.created_at asc, j.id asc
    for update skip locked
    limit greatest(coalesce(p_limit, 1), 1)
  ), updated as (
    update public.rag_reindex_jobs j
    set status = 'processing', error_text = null, updated_at = now()
    where j.id in (select id from candidates)
    returning j.*
  )
  select * from updated order by created_at asc, id asc;
end;
$$;
