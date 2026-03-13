-- Normalize legal RAG metadata to a minimal, non-redundant shape.
-- Keep required keys for retrieval and move date-level fields to source metadata.

with chunk_dates as (
  select
    rc.rag_source_id,
    max(nullif(rc.metadata->>'fecha_vigencia', '')) as fecha_vigencia,
    max(nullif(rc.metadata->>'fecha_publicacion', '')) as fecha_publicacion
  from public.rag_chunks rc
  where rc.source_type = 'law'
  group by rc.rag_source_id
),
source_values as (
  select
    rs.id as source_id,
    rs.metadata as source_metadata,
    rs.law_boe_id,
    ls.eli as log_eli,
    ls.fecha_actualizacion as log_fecha_actualizacion,
    ls.fecha_iso as log_fecha_iso,
    cd.fecha_vigencia,
    cd.fecha_publicacion
  from public.rag_sources rs
  left join chunk_dates cd on cd.rag_source_id = rs.id
  left join public.law_sync_log ls on ls.boe_id = rs.law_boe_id
  where rs.source_type = 'law'
)
update public.rag_sources rs
set metadata = (
  (coalesce(sv.source_metadata, '{}'::jsonb) - 'boe_id')
  || jsonb_build_object(
    'eli', coalesce(
      nullif(sv.source_metadata->>'eli', ''),
      nullif(sv.log_eli, ''),
      ''
    ),
    'fecha_actualizacion', coalesce(
      nullif(sv.source_metadata->>'fecha_actualizacion', ''),
      nullif(sv.log_fecha_actualizacion, ''),
      ''
    ),
    'fecha_vigencia', coalesce(
      nullif(sv.source_metadata->>'fecha_vigencia', ''),
      sv.fecha_vigencia,
      ''
    ),
    'fecha_publicacion', coalesce(
      nullif(sv.source_metadata->>'fecha_publicacion', ''),
      sv.fecha_publicacion,
      ''
    ),
    'fecha_iso', coalesce(
      nullif(sv.source_metadata->>'fecha_iso', ''),
      nullif(sv.log_fecha_iso::text, ''),
      ''
    )
  )
)
from source_values sv
where rs.id = sv.source_id
  and rs.source_type = 'law';

update public.rag_chunks rc
set metadata = jsonb_strip_nulls(
  (
    coalesce(rc.metadata, '{}'::jsonb)
    - 'articulo_num'
    - 'bloque_id'
    - 'bloque_titulo'
    - 'content_hash'
    - 'eli'
    - 'fecha_actualizacion'
    - 'fecha_iso'
    - 'source_kind'
    - 'label'
    - 'fecha_vigencia'
    - 'fecha_publicacion'
  )
  || jsonb_build_object(
    'boe_id', coalesce(
      nullif(rc.metadata->>'boe_id', ''),
      rs.law_boe_id
    ),
    'unit_id', coalesce(
      nullif(rc.metadata->>'unit_id', ''),
      nullif(rc.metadata->>'chunk_id', ''),
      rc.id::text
    ),
    'unit_type', coalesce(
      nullif(rc.metadata->>'unit_type', ''),
      'estructura'
    ),
    'article', coalesce(
      nullif(rc.metadata->>'article', ''),
      nullif(rc.metadata->>'articulo_num', ''),
      nullif(rc.metadata->>'unit_title', ''),
      nullif(rc.title, '')
    ),
    'apartado_path', coalesce(
      nullif(rc.metadata->>'apartado_path', ''),
      nullif(rc.metadata->>'bloque_id', ''),
      nullif(rc.metadata->>'bloque_titulo', ''),
      nullif(rc.metadata->>'unit_id', ''),
      rc.id::text
    ),
    'titulo_ley', coalesce(
      nullif(rc.metadata->>'titulo_ley', ''),
      rs.title
    )
  )
)
from public.rag_sources rs
where rs.id = rc.rag_source_id
  and rc.source_type = 'law';

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
    nullif(
      coalesce(
        cc.metadata->>'fecha_vigencia',
        rs.metadata->>'fecha_vigencia'
      ),
      ''
    )::date as fecha_vigencia,
    nullif(
      coalesce(
        cc.metadata->>'fecha_publicacion',
        rs.metadata->>'fecha_publicacion'
      ),
      ''
    )::date as fecha_publicacion,
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
