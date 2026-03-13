-- Use a subvector ANN index (2000 dims) for 4096-dim embeddings.
-- Then rerank candidates with full 4096 cosine similarity.

create index if not exists rag_chunks_law_current_embedding_subvec_hnsw_idx
on public.rag_chunks using hnsw ((subvector(embedding, 1, 2000)::vector(2000)) vector_cosine_ops)
where is_current = true
  and source_type = 'law'
  and embedding is not null;

drop function if exists public.buscar_articulos(vector, double precision, integer);

create or replace function public.buscar_articulos(
  query_embedding vector,
  match_threshold double precision default 0.25,
  match_count integer default 80
)
returns table (
  id text,
  titulo_ley text,
  articulo_num text,
  contenido text,
  id_boe text,
  unit_id text,
  similarity double precision
)
language sql
stable
set statement_timeout = '20s'
as $$
with params as (
  select
    greatest(1, least(coalesce(match_count, 80), 200))::integer as k,
    greatest(0.0, least(coalesce(match_threshold, 0.0), 1.0))::double precision as threshold,
    greatest(96, least(greatest(1, least(coalesce(match_count, 80), 200)) * 20, 4000))::integer as candidate_k,
    subvector(query_embedding, 1, 2000)::vector(2000) as query_subvector
),
candidate_chunks as (
  select
    rc.id,
    rc.rag_source_id,
    rc.metadata,
    rc.title,
    rc.content,
    1 - (rc.embedding <=> query_embedding) as similarity
  from public.rag_chunks rc
  where rc.is_current = true
    and rc.source_type = 'law'
    and rc.embedding is not null
  order by (subvector(rc.embedding, 1, 2000)::vector(2000)) <=> (select query_subvector from params)
  limit (select candidate_k from params)
),
annotated as (
  select
    cc.id::text as id,
    coalesce(
      nullif(cc.metadata->>'titulo_ley', ''),
      nullif(rs.title, ''),
      nullif(cc.title, ''),
      'Documento'
    ) as titulo_ley,
    coalesce(
      nullif(cc.metadata->>'article', ''),
      nullif(cc.metadata->>'articulo_num', ''),
      nullif(cc.metadata->>'unit_title', ''),
      nullif(cc.title, ''),
      cc.id::text
    ) as articulo_num,
    cc.content as contenido,
    coalesce(
      nullif(rs.law_boe_id, ''),
      nullif(cc.metadata->>'boe_id', ''),
      nullif(rs.metadata->>'boe_id', '')
    ) as id_boe,
    coalesce(
      nullif(cc.metadata->>'unit_id', ''),
      nullif(cc.metadata->>'chunk_id', ''),
      cc.id::text
    ) as unit_id,
    cc.similarity
  from candidate_chunks cc
  join public.rag_sources rs
    on rs.id = cc.rag_source_id
   and rs.is_current = true
)
select
  a.id,
  a.titulo_ley,
  a.articulo_num,
  a.contenido,
  a.id_boe,
  a.unit_id,
  a.similarity
from annotated a
where a.similarity >= (select threshold from params)
order by a.similarity desc
limit (select k from params);
$$;

drop function if exists public.buscar_ley(vector, double precision, integer, text, text);

create or replace function public.buscar_ley(
  query_embedding vector,
  match_threshold double precision default 0.35,
  match_count integer default 8,
  filter_id_boe text default null,
  filter_unit_type text default null
)
returns table (
  id text,
  id_boe text,
  titulo_ley text,
  articulo_num text,
  unit_type text,
  unit_id text,
  apartado_path text,
  contenido text,
  url_norma text,
  fecha_actualizacion date,
  fecha_vigencia date,
  fecha_publicacion date,
  eli text,
  similarity double precision
)
language sql
stable
set statement_timeout = '20s'
as $$
with params as (
  select
    greatest(1, least(coalesce(match_count, 8), 200))::integer as k,
    greatest(0.0, least(coalesce(match_threshold, 0.0), 1.0))::double precision as threshold,
    greatest(96, least(greatest(1, least(coalesce(match_count, 8), 200)) * 20, 4000))::integer as candidate_k,
    subvector(query_embedding, 1, 2000)::vector(2000) as query_subvector
),
candidate_chunks as (
  select
    rc.id,
    rc.rag_source_id,
    rc.metadata,
    rc.title,
    rc.content,
    1 - (rc.embedding <=> query_embedding) as similarity
  from public.rag_chunks rc
  where rc.is_current = true
    and rc.source_type = 'law'
    and rc.embedding is not null
  order by (subvector(rc.embedding, 1, 2000)::vector(2000)) <=> (select query_subvector from params)
  limit (select candidate_k from params)
),
annotated as (
  select
    cc.id::text as id,
    coalesce(
      nullif(rs.law_boe_id, ''),
      nullif(cc.metadata->>'boe_id', ''),
      nullif(rs.metadata->>'boe_id', '')
    ) as id_boe,
    coalesce(
      nullif(cc.metadata->>'titulo_ley', ''),
      nullif(rs.title, ''),
      nullif(cc.title, ''),
      'Documento'
    ) as titulo_ley,
    coalesce(
      nullif(cc.metadata->>'article', ''),
      nullif(cc.metadata->>'articulo_num', ''),
      nullif(cc.metadata->>'unit_title', ''),
      nullif(cc.title, ''),
      cc.id::text
    ) as articulo_num,
    coalesce(
      nullif(cc.metadata->>'unit_type', ''),
      'estructura'
    ) as unit_type,
    coalesce(
      nullif(cc.metadata->>'unit_id', ''),
      nullif(cc.metadata->>'chunk_id', ''),
      cc.id::text
    ) as unit_id,
    coalesce(
      nullif(cc.metadata->>'apartado_path', ''),
      nullif(cc.metadata->>'bloque_id', ''),
      nullif(cc.metadata->>'bloque_titulo', '')
    ) as apartado_path,
    cc.content as contenido,
    rs.source_url as url_norma,
    nullif(
      coalesce(
        cc.metadata->>'fecha_iso',
        rs.metadata->>'fecha_iso'
      ),
      ''
    )::date as fecha_actualizacion,
    nullif(cc.metadata->>'fecha_vigencia', '')::date as fecha_vigencia,
    nullif(cc.metadata->>'fecha_publicacion', '')::date as fecha_publicacion,
    coalesce(
      nullif(cc.metadata->>'eli', ''),
      nullif(rs.metadata->>'eli', '')
    ) as eli,
    cc.similarity
  from candidate_chunks cc
  join public.rag_sources rs
    on rs.id = cc.rag_source_id
   and rs.is_current = true
  where (filter_id_boe is null or rs.law_boe_id = filter_id_boe)
    and (
      filter_unit_type is null
      or coalesce(cc.metadata->>'unit_type', '') = filter_unit_type
    )
)
select
  a.id,
  a.id_boe,
  a.titulo_ley,
  a.articulo_num,
  a.unit_type,
  a.unit_id,
  a.apartado_path,
  a.contenido,
  a.url_norma,
  a.fecha_actualizacion,
  a.fecha_vigencia,
  a.fecha_publicacion,
  a.eli,
  a.similarity
from annotated a
where a.similarity >= (select threshold from params)
order by a.similarity desc
limit (select k from params);
$$;
