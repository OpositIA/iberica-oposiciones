# sync-boe-syllabi

Edge Function de Supabase para sincronizar temarios de oposiciones desde el BOE usando XML como fuente de verdad.

## Qué hace

- Lee `public.opposition_watchlist` activas.
- Revisa el sumario diario del BOE de los últimos `search_days_back` días usando OpenData oficial.
- Filtra candidatos por `search_terms` y `exclude_terms`.
- Soporta además revisión directa de `direct_boe_id` y `direct_xml_url`.
- Descarga el XML del BOE.
- Extrae `ANEXO I` hasta `ANEXO II`.
- Calcula `sha256` del anexo normalizado.
- Si el hash ya existe para la oposición, no inserta nueva versión.
- Si cambia, inserta:
  - `opposition_syllabi`
  - `opposition_topics`
  - `opposition_subtopics`
- Marca la versión más reciente detectada como `is_current = true`.
- Encola un `rag_reindex_job` de tipo `syllabus`.

## Archivos

- `supabase/functions/sync-boe-syllabi/index.ts`
- `supabase/functions/sync-boe-syllabi/parser.ts`

## Requisitos previos

La base debe tener al menos estas tablas y columnas:

- `opposition_watchlist`
- `opposition_syllabi`
- `opposition_topics` con `syllabus_id`, `topic_title`
- `opposition_subtopics` con `syllabus_id`, `topic_number`, `subtopic_title`, `section_title`
- `rag_reindex_jobs`

Si existe la RPC `public.set_current_opposition_syllabus(bigint)`, la función la usará.
Si no existe, hará fallback a actualización manual de `is_current`.

## Variables de entorno

Necesarias en Supabase Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

Ejemplo:

```bash
supabase secrets set \
  SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY \
  CRON_SECRET=YOUR_LONG_RANDOM_SECRET
```

## Despliegue

```bash
supabase functions deploy sync-boe-syllabi --no-verify-jwt
```

Si quieres probarla localmente:

```bash
supabase functions serve sync-boe-syllabi --env-file supabase/.env.local
```

## Invocación manual

Sin body, procesa todas las watchlists activas:

```bash
curl -i \
  -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-boe-syllabi" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: YOUR_LONG_RANDOM_SECRET" \
  -d "{}"
```

Procesar sólo watchlists concretas:

```bash
curl -i \
  -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-boe-syllabi" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: YOUR_LONG_RANDOM_SECRET" \
  -d '{"watchlist_ids":[1,2]}'
```

Modo validación sin insertar:

```bash
curl -i \
  -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-boe-syllabi" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: YOUR_LONG_RANDOM_SECRET" \
  -d '{"dry_run":true}'
```

## Payload de ejemplo

```json
{
  "watchlist_ids": [1, 2],
  "dry_run": false
}
```

## Respuesta JSON de ejemplo

```json
{
  "ok": true,
  "dry_run": false,
  "watchlists_processed": 1,
  "results": [
    {
      "watchlist_id": 1,
      "opposition_id": "agente-hacienda",
      "label": "Agentes de la Hacienda Pública",
      "candidates_found": 2,
      "processed": [
        {
          "status": "inserted",
          "boe_id": "BOE-A-2025-27056",
          "hash": "4d5d5f0c4f3f6f7a8b9c...",
          "syllabus_id": 44,
          "topics_count": 2,
          "subtopics_count": 32,
          "current_applied": true
        },
        {
          "status": "no_change",
          "boe_id": "BOE-A-2025-26000",
          "hash": "4d5d5f0c4f3f6f7a8b9c...",
          "syllabus_id": 44,
          "topics_count": 2,
          "subtopics_count": 32,
          "current_applied": false
        }
      ]
    }
  ]
}
```

## Ejemplo de cron SQL

```sql
select cron.schedule(
  'sync-boe-syllabi-nightly',
  '15 2 * * *',
  $$
  select
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-boe-syllabi',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'YOUR_LONG_RANDOM_SECRET'
      ),
      body := '{"dry_run":false}'::jsonb
    ) as request_id;
  $$
);
```

## Logging esperado

La función escribe logs estructurados con:

- `watchlist_candidates`
- `candidate_parsed`
- `watchlist_candidate_result`
- `watchlist_candidate_error`
- `sync_boe_syllabi_failed`

Incluyen:

- watchlist
- oposición
- candidatos encontrados
- `boe_id`
- hash detectado
- `start_line_idx`
- `end_line_idx`
- `num_temas_detectados`
- bloques y temas insertados

## Notas de operación

- El parser usa XML, no HTML.
- La extracción evita duplicar texto del XML al no mezclar padres e hijos como bloques independientes.
- Si la whitelist de tags pierde el `ANEXO I`, el parser cae a un fallback más amplio con `text nodes`.
- Si hay varias cabeceras `ANEXO I`, se elige la candidata con más `Tema N.` en la ventana posterior y, en empate, la más temprana.
- Si una inserción falla a mitad, se borra el `syllabus` creado para que `ON DELETE CASCADE` limpie `topics` y `subtopics`.
