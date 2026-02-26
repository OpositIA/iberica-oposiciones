create table if not exists public.opposition_subtopics (
  id bigserial primary key,
  opposition_topic_id bigint not null references public.opposition_topics(id) on delete cascade,
  subtopic_code text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opposition_subtopics_topic_id_idx
  on public.opposition_subtopics(opposition_topic_id);

create unique index if not exists opposition_subtopics_unique_code_idx
  on public.opposition_subtopics(opposition_topic_id, subtopic_code);

create unique index if not exists opposition_subtopics_unique_order_idx
  on public.opposition_subtopics(opposition_topic_id, order_index);

alter table public.opposition_subtopics enable row level security;

drop policy if exists "Public can read active opposition subtopics" on public.opposition_subtopics;
create policy "Public can read active opposition subtopics"
on public.opposition_subtopics
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.opposition_topics t
    join public.oppositions o on o.id = t.opposition_id
    where t.id = opposition_subtopics.opposition_topic_id
      and o.is_active = true
  )
);

grant select on public.opposition_subtopics to anon, authenticated;

drop trigger if exists set_opposition_subtopics_updated_at on public.opposition_subtopics;
create trigger set_opposition_subtopics_updated_at
before update on public.opposition_subtopics
for each row
execute function public.set_profiles_updated_at();

with topic_map as (
  select id, topic_code
  from public.opposition_topics
  where opposition_id = 'agente-hacienda'
),
source(topic_code, subtopic_code, order_index) as (
  values
    ('bloque-1-organizacion-estado-y-funcionamiento-age', 'b1-t01-constitucion-española-1978', 10),
    ('bloque-1-organizacion-estado-y-funcionamiento-age', 'b1-t02-cortes-generales', 20),
    ('bloque-1-organizacion-estado-y-funcionamiento-age', 'b1-t03-gobierno', 30),
    ('bloque-1-organizacion-estado-y-funcionamiento-age', 'b1-t04-organizacion-territorial-estado', 40),
    ('bloque-1-organizacion-estado-y-funcionamiento-age', 'b1-t05-funcionamiento-electronico-sector-publico', 50),
    ('bloque-1-organizacion-estado-y-funcionamiento-age', 'b1-t06-politicas-sociales-publicas', 60),
    ('bloque-1-organizacion-estado-y-funcionamiento-age', 'b1-t07-regimen-juridico-personal-aa-pp', 70),
    ('bloque-2-derecho-tributario', 'b2-t01-fuentes-derecho-administrativo', 10),
    ('bloque-2-derecho-tributario', 'b2-t02-actos-administrativos', 20),
    ('bloque-2-derecho-tributario', 'b2-t03-procedimiento-administrativo-comun', 30),
    ('bloque-2-derecho-tributario', 'b2-t04-fases-procedimiento-administrativo', 40),
    ('bloque-2-derecho-tributario', 'b2-t05-recursos-administrativos', 50),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t01-sistema-fiscal-español', 10),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t02-aeat', 20),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t03-derecho-tributario', 30),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t04-derechos-y-garantias-obligados-tributarios', 40),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t05-obligaciones-formales-contribuyentes', 50),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t06-informacion-asistencia-consulta-tributaria', 60),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t07-declaraciones-tributarias-concepto-y-clases', 70),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t08-procedimiento-gestion-tributaria', 80),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t09-procedimiento-inspeccion-funciones-y-facultades', 90),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t10-extincion-deuda-tributaria-i', 100),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t11-extincion-deuda-tributaria-ii', 110),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t12-recaudacion-periodo-voluntario', 120),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t13-embargo', 130),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t14-potestad-sancionadora-tributaria', 140),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t15-revision-actos-tributarios-via-administrativa', 150),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t16-irpf-i', 160),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t17-irpf-ii', 170),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t18-irnr', 180),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t19-impuesto-sociedades', 190),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t20-iva-i', 200),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t21-iva-ii', 210),
    ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t22-aduana', 220)
)
insert into public.opposition_subtopics (
  opposition_topic_id,
  subtopic_code,
  order_index
)
select
  topic_map.id,
  source.subtopic_code,
  source.order_index
from source
join topic_map on topic_map.topic_code = source.topic_code
on conflict (opposition_topic_id, subtopic_code) do update
set
  order_index = excluded.order_index,
  updated_at = now();
