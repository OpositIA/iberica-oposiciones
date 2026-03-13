-- Speed up legal RAG lookups by using ANN preselection over rag_chunks embeddings.
-- This avoids full scans over rag_retrieval_chunks that can hit statement_timeout.

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
as $$
with params as (
  select
    greatest(1, least(coalesce(match_count, 80), 200))::integer as k,
    greatest(0.0, least(coalesce(match_threshold, 0.0), 1.0))::double precision as threshold,
    vector_dims(query_embedding)::integer as query_dim,
    greatest(64, least(greatest(1, least(coalesce(match_count, 80), 200)) * 12, 1200))::integer as candidate_k
),
candidates as (
  select
    rc.id::text as id,
    coalesce(
      nullif(rc.metadata->>'titulo_ley', ''),
      nullif(rs.title, ''),
      nullif(rc.title, ''),
      'Documento'
    ) as titulo_ley,
    coalesce(
      nullif(rc.metadata->>'article', ''),
      nullif(rc.metadata->>'articulo_num', ''),
      nullif(rc.metadata->>'unit_title', ''),
      nullif(rc.title, ''),
      rc.id::text
    ) as articulo_num,
    rc.content as contenido,
    coalesce(
      nullif(rs.law_boe_id, ''),
      nullif(rc.metadata->>'boe_id', ''),
      nullif(rs.metadata->>'boe_id', '')
    ) as id_boe,
    coalesce(
      nullif(rc.metadata->>'unit_id', ''),
      nullif(rc.metadata->>'chunk_id', ''),
      rc.id::text
    ) as unit_id,
    1 - (rc.embedding <=> query_embedding) as similarity
  from public.rag_chunks rc
  join public.rag_sources rs on rs.id = rc.rag_source_id
  where rc.is_current = true
    and rs.is_current = true
    and rc.source_type = 'law'
    and rc.embedding is not null
    and vector_dims(rc.embedding) = (select query_dim from params)
  order by rc.embedding <=> query_embedding
  limit (select candidate_k from params)
)
select
  c.id,
  c.titulo_ley,
  c.articulo_num,
  c.contenido,
  c.id_boe,
  c.unit_id,
  c.similarity
from candidates c
where c.similarity >= (select threshold from params)
order by c.similarity desc
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
as $$
with params as (
  select
    greatest(1, least(coalesce(match_count, 8), 200))::integer as k,
    greatest(0.0, least(coalesce(match_threshold, 0.0), 1.0))::double precision as threshold,
    vector_dims(query_embedding)::integer as query_dim,
    greatest(64, least(greatest(1, least(coalesce(match_count, 8), 200)) * 12, 1200))::integer as candidate_k
),
candidates as (
  select
    rc.id::text as id,
    coalesce(
      nullif(rs.law_boe_id, ''),
      nullif(rc.metadata->>'boe_id', ''),
      nullif(rs.metadata->>'boe_id', '')
    ) as id_boe,
    coalesce(
      nullif(rc.metadata->>'titulo_ley', ''),
      nullif(rs.title, ''),
      nullif(rc.title, ''),
      'Documento'
    ) as titulo_ley,
    coalesce(
      nullif(rc.metadata->>'article', ''),
      nullif(rc.metadata->>'articulo_num', ''),
      nullif(rc.metadata->>'unit_title', ''),
      nullif(rc.title, ''),
      rc.id::text
    ) as articulo_num,
    coalesce(
      nullif(rc.metadata->>'unit_type', ''),
      'estructura'
    ) as unit_type,
    coalesce(
      nullif(rc.metadata->>'unit_id', ''),
      nullif(rc.metadata->>'chunk_id', ''),
      rc.id::text
    ) as unit_id,
    coalesce(
      nullif(rc.metadata->>'apartado_path', ''),
      nullif(rc.metadata->>'bloque_id', ''),
      nullif(rc.metadata->>'bloque_titulo', '')
    ) as apartado_path,
    rc.content as contenido,
    rs.source_url as url_norma,
    nullif(
      coalesce(
        rc.metadata->>'fecha_iso',
        rs.metadata->>'fecha_iso'
      ),
      ''
    )::date as fecha_actualizacion,
    nullif(rc.metadata->>'fecha_vigencia', '')::date as fecha_vigencia,
    nullif(rc.metadata->>'fecha_publicacion', '')::date as fecha_publicacion,
    coalesce(
      nullif(rc.metadata->>'eli', ''),
      nullif(rs.metadata->>'eli', '')
    ) as eli,
    1 - (rc.embedding <=> query_embedding) as similarity
  from public.rag_chunks rc
  join public.rag_sources rs on rs.id = rc.rag_source_id
  where rc.is_current = true
    and rs.is_current = true
    and rc.source_type = 'law'
    and rc.embedding is not null
    and vector_dims(rc.embedding) = (select query_dim from params)
    and (filter_id_boe is null or rs.law_boe_id = filter_id_boe)
    and (
      filter_unit_type is null
      or coalesce(rc.metadata->>'unit_type', '') = filter_unit_type
    )
  order by rc.embedding <=> query_embedding
  limit (select candidate_k from params)
)
select
  c.id,
  c.id_boe,
  c.titulo_ley,
  c.articulo_num,
  c.unit_type,
  c.unit_id,
  c.apartado_path,
  c.contenido,
  c.url_norma,
  c.fecha_actualizacion,
  c.fecha_vigencia,
  c.fecha_publicacion,
  c.eli,
  c.similarity
from candidates c
where c.similarity >= (select threshold from params)
order by c.similarity desc
limit (select k from params);
$$;
