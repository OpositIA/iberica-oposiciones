drop function if exists public.buscar_ley(vector, double precision, integer, text, text);

create or replace function public.buscar_ley(
  query_embedding vector,
  match_threshold double precision default 0.22,
  match_count integer default 18,
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
    greatest(1, least(coalesce(match_count, 18), 200))::integer as k,
    greatest(0.0, least(coalesce(match_threshold, 0.0), 1.0))::double precision as threshold,
    greatest(96, least(greatest(1, least(coalesce(match_count, 18), 200)) * 20, 4000))::integer as candidate_k,
    subvector(query_embedding, 1, 2000)::vector(2000) as query_subvector,
    upper(nullif(trim(filter_id_boe), '')) as boe_filter,
    lower(
      regexp_replace(
        translate(coalesce(filter_unit_type, ''), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'),
        '[^a-z0-9]+',
        '',
        'g'
      )
    ) as unit_type_filter
),
candidate_chunks as (
  select
    rc.id,
    rc.rag_source_id,
    rc.metadata,
    rc.title,
    rc.content,
    case
      when vector_dims(rc.embedding) = vector_dims(query_embedding)
      then 1 - (rc.embedding <=> query_embedding)
      else null
    end as similarity
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
      nullif(cc.title, ''),
      cc.id::text
    ) as articulo_num,
    coalesce(
      nullif(cc.metadata->>'unit_type', ''),
      'estructura'
    ) as unit_type,
    lower(
      regexp_replace(
        translate(coalesce(cc.metadata->>'unit_type', 'estructura'), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'),
        '[^a-z0-9]+',
        '',
        'g'
      )
    ) as unit_type_norm,
    coalesce(
      nullif(cc.metadata->>'unit_id', ''),
      cc.id::text
    ) as unit_id,
    coalesce(
      nullif(cc.metadata->>'apartado_path', ''),
      ''
    ) as apartado_path,
    cc.content as contenido,
    rs.source_url as url_norma,
    case
      when coalesce(rs.metadata->>'fecha_actualizacion', cc.metadata->>'fecha_actualizacion', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(rs.metadata->>'fecha_actualizacion', cc.metadata->>'fecha_actualizacion')::date
      else null
    end as fecha_actualizacion,
    case
      when coalesce(rs.metadata->>'fecha_vigencia', cc.metadata->>'fecha_vigencia', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(rs.metadata->>'fecha_vigencia', cc.metadata->>'fecha_vigencia')::date
      else null
    end as fecha_vigencia,
    case
      when coalesce(rs.metadata->>'fecha_publicacion', cc.metadata->>'fecha_publicacion', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(rs.metadata->>'fecha_publicacion', cc.metadata->>'fecha_publicacion')::date
      else null
    end as fecha_publicacion,
    coalesce(
      nullif(rs.metadata->>'eli', ''),
      nullif(cc.metadata->>'eli', '')
    ) as eli,
    cc.similarity
  from candidate_chunks cc
  join public.rag_sources rs
    on rs.id = cc.rag_source_id
   and rs.is_current = true
   and rs.source_type = 'law'
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
cross join params p
where a.similarity is not null
  and a.similarity >= p.threshold
  and (p.boe_filter is null or upper(coalesce(a.id_boe, '')) = p.boe_filter)
  and (p.unit_type_filter = '' or a.unit_type_norm = p.unit_type_filter)
order by a.similarity desc
limit (select k from params);
$$;

drop function if exists public.buscar_articulos(vector, double precision, integer);
drop function if exists public.buscar_articulos(vector, double precision, integer, text, text);

create or replace function public.buscar_articulos(
  query_embedding vector,
  match_threshold double precision default 0.18,
  match_count integer default 16,
  filter_id_boe text default null,
  filter_article text default null
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
    greatest(1, least(coalesce(match_count, 16), 200))::integer as k,
    greatest(0.0, least(coalesce(match_threshold, 0.0), 1.0))::double precision as threshold,
    greatest(120, least(greatest(1, least(coalesce(match_count, 16), 200)) * 25, 4000))::integer as candidate_k,
    subvector(query_embedding, 1, 2000)::vector(2000) as query_subvector,
    upper(nullif(trim(filter_id_boe), '')) as boe_filter,
    lower(
      regexp_replace(
        regexp_replace(
          translate(coalesce(filter_article, ''), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'),
          '\bart(?:iculo)?\.?\s*',
          '',
          'gi'
        ),
        '[\sºª]+',
        '',
        'g'
      )
    ) as article_filter
),
candidate_chunks as (
  select
    rc.id,
    rc.rag_source_id,
    rc.metadata,
    rc.title,
    rc.content,
    case
      when vector_dims(rc.embedding) = vector_dims(query_embedding)
      then 1 - (rc.embedding <=> query_embedding)
      else null
    end as similarity
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
      nullif(cc.title, ''),
      cc.id::text
    ) as articulo_num,
    lower(
      regexp_replace(
        regexp_replace(
          translate(
            coalesce(cc.metadata->>'article', cc.title, ''),
            'ÁÉÍÓÚÜáéíóúü',
            'AEIOUUaeiouu'
          ),
          '\bart(?:iculo)?\.?\s*',
          '',
          'gi'
        ),
        '[\sºª]+',
        '',
        'g'
      )
    ) as articulo_num_compact,
    coalesce(
      nullif(cc.metadata->>'unit_type', ''),
      'estructura'
    ) as unit_type,
    lower(
      regexp_replace(
        translate(coalesce(cc.metadata->>'unit_type', 'estructura'), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'),
        '[^a-z0-9]+',
        '',
        'g'
      )
    ) as unit_type_norm,
    coalesce(
      nullif(cc.metadata->>'unit_id', ''),
      cc.id::text
    ) as unit_id,
    coalesce(
      nullif(cc.metadata->>'apartado_path', ''),
      ''
    ) as apartado_path,
    cc.content as contenido,
    rs.source_url as url_norma,
    case
      when coalesce(rs.metadata->>'fecha_actualizacion', cc.metadata->>'fecha_actualizacion', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(rs.metadata->>'fecha_actualizacion', cc.metadata->>'fecha_actualizacion')::date
      else null
    end as fecha_actualizacion,
    case
      when coalesce(rs.metadata->>'fecha_vigencia', cc.metadata->>'fecha_vigencia', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(rs.metadata->>'fecha_vigencia', cc.metadata->>'fecha_vigencia')::date
      else null
    end as fecha_vigencia,
    case
      when coalesce(rs.metadata->>'fecha_publicacion', cc.metadata->>'fecha_publicacion', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(rs.metadata->>'fecha_publicacion', cc.metadata->>'fecha_publicacion')::date
      else null
    end as fecha_publicacion,
    coalesce(
      nullif(rs.metadata->>'eli', ''),
      nullif(cc.metadata->>'eli', '')
    ) as eli,
    cc.similarity
  from candidate_chunks cc
  join public.rag_sources rs
    on rs.id = cc.rag_source_id
   and rs.is_current = true
   and rs.source_type = 'law'
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
cross join params p
where a.similarity is not null
  and a.similarity >= p.threshold
  and (p.boe_filter is null or upper(coalesce(a.id_boe, '')) = p.boe_filter)
  and (
    a.unit_type_norm in ('articulo', 'articulos', 'article', 'articles', 'art')
    or a.articulo_num_compact ~ '^[0-9]+(\.[0-9]+)?(bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies)?$'
  )
  and (
    p.article_filter = ''
    or a.articulo_num_compact = p.article_filter
    or a.articulo_num_compact like p.article_filter || '.%'
    or a.articulo_num_compact like p.article_filter || 'bis%'
    or a.articulo_num_compact like p.article_filter || 'ter%'
    or a.articulo_num_compact like p.article_filter || 'quater%'
    or a.articulo_num_compact like p.article_filter || 'quinquies%'
    or a.articulo_num_compact like p.article_filter || 'sexies%'
    or a.articulo_num_compact like p.article_filter || 'septies%'
    or a.articulo_num_compact like p.article_filter || 'octies%'
    or a.articulo_num_compact like p.article_filter || 'nonies%'
    or a.articulo_num_compact like p.article_filter || 'decies%'
  )
order by
  case
    when p.article_filter <> '' and a.articulo_num_compact = p.article_filter then 0
    when p.article_filter <> '' and a.articulo_num_compact like p.article_filter || '.%' then 1
    when p.article_filter <> '' and (
      a.articulo_num_compact like p.article_filter || 'bis%'
      or a.articulo_num_compact like p.article_filter || 'ter%'
      or a.articulo_num_compact like p.article_filter || 'quater%'
      or a.articulo_num_compact like p.article_filter || 'quinquies%'
      or a.articulo_num_compact like p.article_filter || 'sexies%'
      or a.articulo_num_compact like p.article_filter || 'septies%'
      or a.articulo_num_compact like p.article_filter || 'octies%'
      or a.articulo_num_compact like p.article_filter || 'nonies%'
      or a.articulo_num_compact like p.article_filter || 'decies%'
    ) then 2
    else 3
  end,
  a.similarity desc
limit (select k from params);
$$;
