create index if not exists rag_chunks_law_current_source_idx
  on public.rag_chunks (rag_source_id)
  where is_current = true
    and source_type = 'law';

create index if not exists rag_chunks_law_current_article_compact_idx
  on public.rag_chunks (
    (
      lower(
        regexp_replace(
          replace(coalesce(metadata->>'article', title, ''), ',', '.'),
          '[^0-9a-z.]+',
          '',
          'g'
        )
      )
    )
  )
  where is_current = true
    and source_type = 'law';

create index if not exists rag_chunks_law_current_unit_id_compact_idx
  on public.rag_chunks (
    (
      lower(
        regexp_replace(
          coalesce(metadata->>'unit_id', ''),
          '[^0-9a-z]+',
          '',
          'g'
        )
      )
    )
  )
  where is_current = true
    and source_type = 'law';

create index if not exists rag_chunks_law_current_apartado_path_compact_idx
  on public.rag_chunks (
    (
      lower(
        regexp_replace(
          coalesce(metadata->>'apartado_path', ''),
          '[^0-9a-z]+',
          '',
          'g'
        )
      )
    )
  )
  where is_current = true
    and source_type = 'law';

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
    case
      when upper(nullif(trim(filter_id_boe), '')) is null
        and lower(regexp_replace(coalesce(filter_unit_type, ''), '[^a-z0-9]+', '', 'g')) = ''
      then greatest(48, least(greatest(1, least(coalesce(match_count, 18), 200)) * 10, 600))::integer
      else greatest(120, least(greatest(1, least(coalesce(match_count, 18), 200)) * 36, 2400))::integer
    end as candidate_k,
    subvector(query_embedding, 1, 2000)::vector(2000) as query_subvector,
    upper(nullif(trim(filter_id_boe), '')) as boe_filter,
    lower(regexp_replace(coalesce(filter_unit_type, ''), '[^a-z0-9]+', '', 'g')) as unit_type_filter
),
ann_candidates as (
  select
    rc.id,
    rc.rag_source_id,
    case
      when vector_dims(rc.embedding) = vector_dims(query_embedding)
      then 1 - (rc.embedding <=> query_embedding)
      else null
    end as similarity
  from public.rag_chunks rc
  cross join params p
  where rc.is_current = true
    and rc.source_type = 'law'
    and rc.embedding is not null
  order by (subvector(rc.embedding, 1, 2000)::vector(2000)) <=> p.query_subvector
  limit (select candidate_k from params)
),
annotated as (
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
      nullif(rc.title, ''),
      rc.id::text
    ) as articulo_num,
    coalesce(
      nullif(rc.metadata->>'unit_type', ''),
      'estructura'
    ) as unit_type,
    lower(regexp_replace(coalesce(rc.metadata->>'unit_type', 'estructura'), '[^a-z0-9]+', '', 'g')) as unit_type_norm,
    coalesce(
      nullif(rc.metadata->>'unit_id', ''),
      rc.id::text
    ) as unit_id,
    coalesce(
      nullif(rc.metadata->>'apartado_path', ''),
      ''
    ) as apartado_path,
    rc.content as contenido,
    rs.source_url as url_norma,
    case
      when coalesce(rs.metadata->>'fecha_actualizacion', rc.metadata->>'fecha_actualizacion', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(rs.metadata->>'fecha_actualizacion', rc.metadata->>'fecha_actualizacion')::date
      else null
    end as fecha_actualizacion,
    case
      when coalesce(rs.metadata->>'fecha_vigencia', rc.metadata->>'fecha_vigencia', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(rs.metadata->>'fecha_vigencia', rc.metadata->>'fecha_vigencia')::date
      else null
    end as fecha_vigencia,
    case
      when coalesce(rs.metadata->>'fecha_publicacion', rc.metadata->>'fecha_publicacion', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(rs.metadata->>'fecha_publicacion', rc.metadata->>'fecha_publicacion')::date
      else null
    end as fecha_publicacion,
    coalesce(
      nullif(rs.metadata->>'eli', ''),
      nullif(rc.metadata->>'eli', '')
    ) as eli,
    ac.similarity
  from ann_candidates ac
  join public.rag_chunks rc
    on rc.id = ac.id
  join public.rag_sources rs
    on rs.id = ac.rag_source_id
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
order by
  a.similarity desc,
  a.fecha_actualizacion desc nulls last,
  a.fecha_publicacion desc nulls last
limit (select k from params);
$$;

drop function if exists public.buscar_articulos(vector, double precision, integer);
drop function if exists public.buscar_articulos(vector, double precision, integer, text, text);

create or replace function public.buscar_articulos(
  query_embedding vector,
  match_threshold double precision default 0.16,
  match_count integer default 18,
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
    greatest(1, least(coalesce(match_count, 18), 200))::integer as k,
    greatest(0.0, least(coalesce(match_threshold, 0.0), 1.0))::double precision as threshold,
    greatest(72, least(greatest(1, least(coalesce(match_count, 18), 200)) * 12, 900))::integer as candidate_k,
    greatest(24, least(greatest(1, least(coalesce(match_count, 18), 200)) * 8, 400))::integer as structured_k,
    subvector(query_embedding, 1, 2000)::vector(2000) as query_subvector,
    upper(nullif(trim(filter_id_boe), '')) as boe_filter,
    lower(
      regexp_replace(
        replace(
          regexp_replace(coalesce(filter_article, ''), '\bart(?:iculo)?s?\.?\s*', '', 'gi'),
          ',',
          '.'
        ),
        '[^0-9a-z.]+',
        '',
        'g'
      )
    ) as article_filter
),
article_params as (
  select
    p.*,
    coalesce(substring(p.article_filter from '^([0-9]+)'), '') as article_base
  from params p
),
ann_candidates as (
  select
    rc.id,
    rc.rag_source_id,
    case
      when vector_dims(rc.embedding) = vector_dims(query_embedding)
      then 1 - (rc.embedding <=> query_embedding)
      else null
    end as similarity
  from public.rag_chunks rc
  cross join article_params p
  where rc.is_current = true
    and rc.source_type = 'law'
    and rc.embedding is not null
  order by (subvector(rc.embedding, 1, 2000)::vector(2000)) <=> p.query_subvector
  limit (select candidate_k from article_params)
),
structured_candidates as (
  select
    rc.id,
    rc.rag_source_id,
    null::double precision as similarity
  from public.rag_chunks rc
  cross join article_params p
  where rc.is_current = true
    and rc.source_type = 'law'
    and p.article_filter <> ''
    and (
      lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) = p.article_filter
      or lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) like p.article_filter || '.%'
      or (
        p.article_base <> ''
        and (
          lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) = p.article_base
          or lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) like p.article_base || '.%'
          or lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) like p.article_base || 'bis%'
          or lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) like p.article_base || 'ter%'
          or lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) like p.article_base || 'quater%'
          or lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) like p.article_base || 'quinquies%'
          or lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) like p.article_base || 'sexies%'
          or lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) like p.article_base || 'septies%'
          or lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) like p.article_base || 'octies%'
          or lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) like p.article_base || 'nonies%'
          or lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) like p.article_base || 'decies%'
          or lower(regexp_replace(coalesce(rc.metadata->>'unit_id', ''), '[^0-9a-z]+', '', 'g')) like 'a' || p.article_base || '%'
          or lower(regexp_replace(coalesce(rc.metadata->>'apartado_path', ''), '[^0-9a-z]+', '', 'g')) like 'a' || p.article_base || '%'
        )
      )
    )
  order by
    case
      when lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) = p.article_filter then 0
      when lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) like p.article_filter || '.%' then 1
      when p.article_base <> '' and lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) = p.article_base then 2
      else 3
    end,
    rc.updated_at desc nulls last
  limit (select structured_k from article_params)
),
candidate_pool as (
  select * from ann_candidates
  union all
  select * from structured_candidates
),
candidate_chunks as (
  select distinct on (cp.id)
    cp.id,
    cp.rag_source_id,
    cp.similarity
  from candidate_pool cp
  order by cp.id, cp.similarity desc nulls last
),
annotated as (
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
      nullif(rc.title, ''),
      rc.id::text
    ) as articulo_num,
    lower(regexp_replace(replace(coalesce(rc.metadata->>'article', rc.title, ''), ',', '.'), '[^0-9a-z.]+', '', 'g')) as articulo_num_compact,
    lower(regexp_replace(coalesce(rc.metadata->>'unit_id', ''), '[^0-9a-z]+', '', 'g')) as unit_id_compact,
    lower(regexp_replace(coalesce(rc.metadata->>'apartado_path', ''), '[^0-9a-z]+', '', 'g')) as apartado_path_compact,
    coalesce(
      nullif(rc.metadata->>'unit_type', ''),
      'estructura'
    ) as unit_type,
    coalesce(
      nullif(rc.metadata->>'unit_id', ''),
      rc.id::text
    ) as unit_id,
    coalesce(
      nullif(rc.metadata->>'apartado_path', ''),
      ''
    ) as apartado_path,
    rc.content as contenido,
    rs.source_url as url_norma,
    case
      when coalesce(rs.metadata->>'fecha_actualizacion', rc.metadata->>'fecha_actualizacion', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(rs.metadata->>'fecha_actualizacion', rc.metadata->>'fecha_actualizacion')::date
      else null
    end as fecha_actualizacion,
    case
      when coalesce(rs.metadata->>'fecha_vigencia', rc.metadata->>'fecha_vigencia', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(rs.metadata->>'fecha_vigencia', rc.metadata->>'fecha_vigencia')::date
      else null
    end as fecha_vigencia,
    case
      when coalesce(rs.metadata->>'fecha_publicacion', rc.metadata->>'fecha_publicacion', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(rs.metadata->>'fecha_publicacion', rc.metadata->>'fecha_publicacion')::date
      else null
    end as fecha_publicacion,
    coalesce(
      nullif(rs.metadata->>'eli', ''),
      nullif(rc.metadata->>'eli', '')
    ) as eli,
    cc.similarity
  from candidate_chunks cc
  join public.rag_chunks rc
    on rc.id = cc.id
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
  coalesce(a.similarity, 0)::double precision as similarity
from annotated a
cross join article_params p
where (p.boe_filter is null or upper(coalesce(a.id_boe, '')) = p.boe_filter)
  and (
    (
      a.similarity is not null
      and a.similarity >= p.threshold
    )
    or (
      p.article_filter <> ''
      and (
        a.articulo_num_compact = p.article_filter
        or a.articulo_num_compact like p.article_filter || '.%'
        or (
          p.article_base <> ''
          and (
            a.articulo_num_compact = p.article_base
            or a.articulo_num_compact like p.article_base || '.%'
            or a.articulo_num_compact like p.article_base || 'bis%'
            or a.articulo_num_compact like p.article_base || 'ter%'
            or a.articulo_num_compact like p.article_base || 'quater%'
            or a.articulo_num_compact like p.article_base || 'quinquies%'
            or a.articulo_num_compact like p.article_base || 'sexies%'
            or a.articulo_num_compact like p.article_base || 'septies%'
            or a.articulo_num_compact like p.article_base || 'octies%'
            or a.articulo_num_compact like p.article_base || 'nonies%'
            or a.articulo_num_compact like p.article_base || 'decies%'
            or a.unit_id_compact like 'a' || p.article_base || '%'
            or a.apartado_path_compact like 'a' || p.article_base || '%'
          )
        )
      )
    )
  )
order by
  case
    when p.article_filter <> '' and a.articulo_num_compact = p.article_filter then 0
    when p.article_filter <> '' and a.articulo_num_compact like p.article_filter || '.%' then 1
    when p.article_base <> '' and a.articulo_num_compact = p.article_base then 2
    when p.article_base <> '' and a.articulo_num_compact like p.article_base || '.%' then 3
    when p.article_base <> '' and (
      a.unit_id_compact like 'a' || p.article_base || '%'
      or a.apartado_path_compact like 'a' || p.article_base || '%'
    ) then 4
    else 5
  end,
  a.similarity desc nulls last,
  a.fecha_actualizacion desc nulls last,
  a.fecha_publicacion desc nulls last
limit (select k from article_params);
$$;
