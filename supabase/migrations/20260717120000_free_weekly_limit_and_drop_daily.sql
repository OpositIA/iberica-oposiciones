-- Plan gratuito: cuota semanal ≈ 10 preguntas/semana.
-- Coste medio de una pregunta ≈ 22.000 tokens ponderados (contexto legal +
-- síntesis; entrada ×1, salida ×2), así que 230.000 tokens ≈ 10 preguntas.
-- El plan de pago se mantiene en 2.500.000 (paid_weekly_token_limit).
insert into public.ai_quota_settings (key, value_int)
values ('default_weekly_token_limit', 230000)
on conflict (key) do update
set value_int = excluded.value_int,
    updated_at = now();

-- La cuota diaria por número de preguntas quedó sustituida por la cuota semanal
-- por tokens. Su tabla de uso ya no la lee ni escribe nada (ni el frontend ni la
-- edge function). Se elimina. Sus policies e índices caen con ella.
drop table if exists public.ai_daily_usage;

-- Las 2 RPCs que operaban sobre esa tabla quedan huérfanas; nadie las llama.
-- get_ai_daily_limit se conserva (solo lee ai_quota_settings, no la tabla).
drop function if exists public.consume_ai_daily_quota(uuid, integer, text);
drop function if exists public.get_ai_daily_quota(uuid, text);
