drop view if exists public.rag_retrieval_chunks;

drop index if exists public.rag_chunks_current_embedding_hnsw_idx;
drop index if exists public.rag_chunks_embedding_hnsw_idx;

alter table public.rag_chunks
  alter column embedding type vector(4096) using null::vector(4096);

update public.rag_chunks
set
  embedding_content_hash = null,
  embedding_provider = null,
  embedding_model = null,
  embedding_updated_at = null,
  embedding_error = null;

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
  and rs.is_current = true;
