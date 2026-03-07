# Deployment

## Hallazgos cerrados antes del despliegue

- El esquema base real del repo usa `public.oppositions.id` como `text`, no `bigint`.
- La primera version de la arquitectura RAG y la Edge Function habian derivado a `bigint` para `opposition_id`. Eso hacia incompatible `opposition_watchlist`, `rag_sources`, `rag_chunks`, `rag_reindex_jobs` y parte del pipeline de temarios.
- `202603060001_opposition_syllabi.sql` crea `opposition_syllabi` sin `is_current`, mientras que la arquitectura RAG y la sincronizacion de temarios si lo necesitan.
- `202603060001_opposition_syllabi.sql` crea el trigger `set_opposition_syllabi_updated_at`; la arquitectura posterior creaba otro trigger distinto y podia dejar duplicidad.

Esto queda resuelto en:

- [202603060002_rag_architecture_base.sql](C:\Users\Oscar\Desktop\study-brilliance\supabase\migrations\202603060002_rag_architecture_base.sql)
- [202603060004_release_realign_text_oppositions.sql](C:\Users\Oscar\Desktop\study-brilliance\supabase\migrations\202603060004_release_realign_text_oppositions.sql)

`202603060004` es la red de seguridad si algun entorno llego a aplicar la version incoherente.

## Orden exacto de despliegue

1. Confirmar que el repo contiene las migraciones:
   - `202603060001_opposition_syllabi.sql`
   - `202603060002_rag_architecture_base.sql`
   - `202603060003_rag_embedding_worker.sql`
   - `202603060004_release_realign_text_oppositions.sql`
2. Aplicar migraciones SQL:

```bash
supabase db push
```

3. Poblar seeds minimos:
   - [opposition_watchlist_seed.sql](C:\Users\Oscar\Desktop\study-brilliance\supabase\seeds\opposition_watchlist_seed.sql)
   - [law_watchlist_seed.sql](C:\Users\Oscar\Desktop\study-brilliance\supabase\seeds\law_watchlist_seed.sql)

4. Configurar secretos para Edge Function:

```bash
supabase secrets set ^
  SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co ^
  SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY ^
  CRON_SECRET=YOUR_LONG_RANDOM_SECRET
```

5. Desplegar la Edge Function:

```bash
supabase functions deploy sync-boe-syllabi --no-verify-jwt
```

6. Preparar entorno Python para workers/importadores:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

7. Exportar variables de entorno locales:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
$env:GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
```

8. Probar sincronizacion manual de temarios:

```bash
curl -i ^
  -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-boe-syllabi" ^
  -H "Content-Type: application/json" ^
  -H "x-cron-secret: YOUR_LONG_RANDOM_SECRET" ^
  -d "{\"dry_run\":true}"
```

9. Lanzar una sincronizacion real de leyes:

```bash
python sync_laws.py
```

10. Procesar embeddings pendientes:

```bash
python sync_embeddings.py --limit 5
```

11. Crear cron nocturno:

```sql
select cron.schedule(
  'sync-boe-syllabi-nightly',
  '15 2 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-boe-syllabi',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_LONG_RANDOM_SECRET'
    ),
    body := '{"dry_run":false}'::jsonb
  );
  $$
);
```

## Variables de entorno

### Supabase Edge Function

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

### Python sync_laws.py

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Python sync_embeddings.py

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_API_KEY`
- opcionales:
  - `EMBEDDING_PROVIDER`
  - `EMBEDDING_MODEL`
  - `EMBEDDING_DIM`
  - `JOB_BATCH_SIZE`
  - `EMBED_BATCH_SIZE`
  - `EMBED_RETRIES`
  - `EMBED_BACKOFF_BASE`

## Como poblar opposition_watchlist

Seed minima:

```sql
\i supabase/seeds/opposition_watchlist_seed.sql
```

O pegar el contenido de:

- [opposition_watchlist_seed.sql](C:\Users\Oscar\Desktop\study-brilliance\supabase\seeds\opposition_watchlist_seed.sql)

## Como poblar law_watchlist

Seed inicial:

```sql
\i supabase/seeds/law_watchlist_seed.sql
```

## Como lanzar una sincronizacion manual

### Temarios

Todas las watchlists activas:

```bash
curl -i ^
  -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-boe-syllabi" ^
  -H "Content-Type: application/json" ^
  -H "x-cron-secret: YOUR_LONG_RANDOM_SECRET" ^
  -d "{}"
```

Solo watchlists concretas:

```bash
curl -i ^
  -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-boe-syllabi" ^
  -H "Content-Type: application/json" ^
  -H "x-cron-secret: YOUR_LONG_RANDOM_SECRET" ^
  -d "{\"watchlist_ids\":[1]}"
```

### Leyes

```bash
python sync_laws.py
python sync_laws.py BOE-A-2015-10565
python sync_laws.py --force BOE-A-2015-10565
```

### Embeddings

```bash
python sync_embeddings.py
python sync_embeddings.py --source-type law --limit 5
python sync_embeddings.py --source-type syllabus --limit 5
```

## Como verificar que el cron corre

Comprobar jobs programados:

```sql
select jobid, schedule, command, active
from cron.job
where jobname = 'sync-boe-syllabi-nightly';
```

Comprobar ultimas ejecuciones:

```sql
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid in (
  select jobid
  from cron.job
  where jobname = 'sync-boe-syllabi-nightly'
)
order by start_time desc
limit 10;
```

## Como verificar que el RAG lee solo chunks vigentes

La vista operativa es `public.rag_retrieval_chunks`.

Chequeos:

```sql
select count(*) as total
from public.rag_retrieval_chunks;
```

```sql
select source_type, opposition_id, syllabus_id, count(*) as chunks
from public.rag_retrieval_chunks
group by source_type, opposition_id, syllabus_id
order by source_type, opposition_id nulls last, syllabus_id nulls last;
```

```sql
select count(*) as invalid_current_chunks
from public.rag_chunks rc
left join public.rag_sources rs on rs.id = rc.rag_source_id
where rc.is_current = true
  and (rs.id is null or rs.is_current = false);
```

El resultado esperado del ultimo chequeo es `0`.

## Validacion manual recomendada

Parser BOE con fixture real:

```bash
python scripts/validate_boe_parser.py
```

Estado de integridad de la release:

```bash
python scripts/validate_release_state.py
```
