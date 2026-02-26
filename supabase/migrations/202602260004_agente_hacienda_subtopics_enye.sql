with mappings as (
  select *
  from (
    values
      ('bloque-1-organizacion-estado-y-funcionamiento-age', 'b1-t01-constitucion-espanola-1978', 'b1-t01-constitucion-española-1978'),
      ('bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 'b3-t01-sistema-fiscal-espanol', 'b3-t01-sistema-fiscal-español')
  ) as t(topic_code, old_code, new_code)
),
targets as (
  select
    s.id as subtopic_id,
    s.opposition_topic_id,
    m.new_code
  from public.opposition_subtopics s
  join public.opposition_topics t
    on t.id = s.opposition_topic_id
  join mappings m
    on m.topic_code = t.topic_code
  where t.opposition_id = 'agente-hacienda'
    and s.subtopic_code = m.old_code
)
update public.opposition_subtopics s
set
  subtopic_code = targets.new_code,
  updated_at = now()
from targets
where s.id = targets.subtopic_id
  and not exists (
    select 1
    from public.opposition_subtopics s2
    where s2.opposition_topic_id = targets.opposition_topic_id
      and s2.subtopic_code = targets.new_code
  );
