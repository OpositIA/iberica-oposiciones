insert into public.opposition_topics (
  opposition_id,
  topic_code,
  order_index
)
values
  ('agente-hacienda', 'bloque-1-organizacion-estado-y-funcionamiento-age', 10),
  ('agente-hacienda', 'bloque-2-derecho-tributario', 20),
  ('agente-hacienda', 'bloque-3-organizacion-hacienda-publica-y-derecho-administrativo', 30)
on conflict (opposition_id, topic_code) do update
set
  order_index = excluded.order_index,
  updated_at = now();
