create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-laws-rag-daily') then
    perform cron.unschedule('sync-laws-rag-daily');
  end if;

  if exists (select 1 from cron.job where jobname = 'process-rag-law-jobs-half-hour') then
    perform cron.unschedule('process-rag-law-jobs-half-hour');
  end if;
end;
$$;

select cron.schedule(
  'sync-laws-rag-daily',
  '10 2 * * *',
  $$
  select public.invoke_internal_edge_function(
    'sync-laws-rag',
    jsonb_build_object('force', false, 'max_laws', 5),
    300000
  );
  $$
);

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
    coalesce(match_threshold, 0.0)::double precision as threshold,
    vector_dims(query_embedding)::integer as query_dim
),
base as (
  select
    rrc.chunk_id::text as id,
    coalesce(
      nullif(rrc.metadata->>'titulo_ley', ''),
      nullif(rrc.source_title, ''),
      nullif(rrc.title, ''),
      'Documento'
    ) as titulo_ley,
    coalesce(
      nullif(rrc.metadata->>'article', ''),
      nullif(rrc.metadata->>'articulo_num', ''),
      nullif(rrc.metadata->>'unit_title', ''),
      nullif(rrc.title, ''),
      rrc.chunk_id::text
    ) as articulo_num,
    rrc.content as contenido,
    coalesce(
      nullif(rrc.law_boe_id, ''),
      nullif(rrc.metadata->>'boe_id', ''),
      nullif(rrc.source_metadata->>'boe_id', '')
    ) as id_boe,
    coalesce(
      nullif(rrc.metadata->>'unit_id', ''),
      nullif(rrc.metadata->>'chunk_id', ''),
      rrc.chunk_id::text
    ) as unit_id,
    1 - (rrc.embedding <=> query_embedding) as similarity
  from public.rag_retrieval_chunks rrc
  where rrc.source_type = 'law'
    and rrc.embedding is not null
    and vector_dims(rrc.embedding) = (select query_dim from params)
)
select
  b.id,
  b.titulo_ley,
  b.articulo_num,
  b.contenido,
  b.id_boe,
  b.unit_id,
  b.similarity
from base b
where b.similarity >= (select threshold from params)
order by b.similarity desc
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
    coalesce(match_threshold, 0.0)::double precision as threshold,
    vector_dims(query_embedding)::integer as query_dim
),
base as (
  select
    rrc.chunk_id::text as id,
    coalesce(
      nullif(rrc.law_boe_id, ''),
      nullif(rrc.metadata->>'boe_id', ''),
      nullif(rrc.source_metadata->>'boe_id', '')
    ) as id_boe,
    coalesce(
      nullif(rrc.metadata->>'titulo_ley', ''),
      nullif(rrc.source_title, ''),
      nullif(rrc.title, ''),
      'Documento'
    ) as titulo_ley,
    coalesce(
      nullif(rrc.metadata->>'article', ''),
      nullif(rrc.metadata->>'articulo_num', ''),
      nullif(rrc.metadata->>'unit_title', ''),
      nullif(rrc.title, ''),
      rrc.chunk_id::text
    ) as articulo_num,
    coalesce(
      nullif(rrc.metadata->>'unit_type', ''),
      'estructura'
    ) as unit_type,
    coalesce(
      nullif(rrc.metadata->>'unit_id', ''),
      nullif(rrc.metadata->>'chunk_id', ''),
      rrc.chunk_id::text
    ) as unit_id,
    coalesce(
      nullif(rrc.metadata->>'apartado_path', ''),
      nullif(rrc.metadata->>'bloque_id', ''),
      nullif(rrc.metadata->>'bloque_titulo', '')
    ) as apartado_path,
    rrc.content as contenido,
    rrc.source_url as url_norma,
    nullif(
      coalesce(
        rrc.metadata->>'fecha_iso',
        rrc.source_metadata->>'fecha_iso'
      ),
      ''
    )::date as fecha_actualizacion,
    nullif(rrc.metadata->>'fecha_vigencia', '')::date as fecha_vigencia,
    nullif(rrc.metadata->>'fecha_publicacion', '')::date as fecha_publicacion,
    coalesce(
      nullif(rrc.metadata->>'eli', ''),
      nullif(rrc.source_metadata->>'eli', '')
    ) as eli,
    1 - (rrc.embedding <=> query_embedding) as similarity
  from public.rag_retrieval_chunks rrc
  where rrc.source_type = 'law'
    and rrc.embedding is not null
    and vector_dims(rrc.embedding) = (select query_dim from params)
    and (filter_id_boe is null or rrc.law_boe_id = filter_id_boe)
    and (
      filter_unit_type is null
      or coalesce(rrc.metadata->>'unit_type', '') = filter_unit_type
    )
)
select
  b.id,
  b.id_boe,
  b.titulo_ley,
  b.articulo_num,
  b.unit_type,
  b.unit_id,
  b.apartado_path,
  b.contenido,
  b.url_norma,
  b.fecha_actualizacion,
  b.fecha_vigencia,
  b.fecha_publicacion,
  b.eli,
  b.similarity
from base b
where b.similarity >= (select threshold from params)
order by b.similarity desc
limit (select k from params);
$$;
