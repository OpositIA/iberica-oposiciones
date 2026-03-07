begin;

alter table public.rag_chunks
  add column if not exists embedding_content_hash text,
  add column if not exists embedding_provider text,
  add column if not exists embedding_model text,
  add column if not exists embedding_updated_at timestamptz,
  add column if not exists embedding_error text;

alter table public.rag_chunks
  drop constraint if exists rag_chunks_embedding_content_hash_chk;

alter table public.rag_chunks
  add constraint rag_chunks_embedding_content_hash_chk
  check (
    embedding_content_hash is null
    or char_length(embedding_content_hash) = 64
  );

drop index if exists public.rag_chunks_embedding_hnsw_idx;

create index if not exists rag_chunks_current_filter_idx
  on public.rag_chunks(source_type, opposition_id, syllabus_id, rag_source_id)
  where is_current = true;

create index if not exists rag_chunks_current_hash_idx
  on public.rag_chunks(rag_source_id, content_hash, embedding_content_hash)
  where is_current = true;

create index if not exists rag_chunks_current_embedding_hnsw_idx
  on public.rag_chunks using hnsw (embedding extensions.vector_cosine_ops)
  where is_current = true and embedding is not null;

create or replace function public.claim_rag_reindex_jobs(
  p_limit integer default 5,
  p_source_type text default null
)
returns setof public.rag_reindex_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select j.id
    from public.rag_reindex_jobs j
    where j.status = 'pending'
      and (p_source_type is null or j.source_type = p_source_type)
    order by j.created_at asc, j.id asc
    for update skip locked
    limit greatest(coalesce(p_limit, 1), 1)
  ),
  updated as (
    update public.rag_reindex_jobs j
    set
      status = 'processing',
      error_text = null,
      updated_at = now()
    where j.id in (select id from candidates)
    returning j.*
  )
  select *
  from updated
  order by created_at asc, id asc;
end;
$$;

create or replace view public.rag_retrieval_chunks as
select
  rc.id as chunk_id,
  rc.rag_source_id,
  rc.opposition_id,
  rc.syllabus_id,
  rc.source_type,
  rc.chunk_index,
  rc.title,
  rc.content,
  rc.content_hash,
  rc.embedding,
  rc.metadata,
  rs.source_url,
  rs.title as source_title,
  rs.law_boe_id,
  rs.metadata as source_metadata
from public.rag_chunks rc
join public.rag_sources rs on rs.id = rc.rag_source_id
where rc.is_current = true
  and rs.is_current = true
  and rc.embedding is not null;

commit;
