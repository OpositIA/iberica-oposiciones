# Operations

## Si falla el BOE

### Edge Function sync-boe-syllabi

1. Revisar logs de la funcion:

```bash
supabase functions logs sync-boe-syllabi
```

2. Ejecutar en `dry_run` para ver candidatos sin insertar:

```bash
curl -i ^
  -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-boe-syllabi" ^
  -H "Content-Type: application/json" ^
  -H "x-cron-secret: YOUR_LONG_RANDOM_SECRET" ^
  -d "{\"dry_run\":true}"
```

3. Si el problema es descubrimiento, fijar temporalmente `direct_boe_id` y `direct_xml_url` en `opposition_watchlist`.

4. Validar parser localmente con:

```bash
python scripts/validate_boe_parser.py --url-xml "https://www.boe.es/diario_boe/xml.php?id=BOE-A-2025-27056"
```

## Si falla el embedding provider

1. Revisar jobs en error:

```sql
select id, source_type, rag_source_id, law_boe_id, syllabus_id, error_text, updated_at
from public.rag_reindex_jobs
where status = 'error'
order by updated_at desc
limit 50;
```

2. Comprobar que `GOOGLE_API_KEY` y `EMBEDDING_DIM` son correctas.

3. Reintentar solo jobs en error:

```sql
update public.rag_reindex_jobs
set status = 'pending',
    error_text = null,
    updated_at = now()
where status = 'error';
```

4. Volver a lanzar el worker:

```bash
python sync_embeddings.py --limit 10
```

## Como reintentar jobs en error

### Todos

```sql
update public.rag_reindex_jobs
set status = 'pending',
    error_text = null,
    updated_at = now()
where status = 'error';
```

### Solo leyes

```sql
update public.rag_reindex_jobs
set status = 'pending',
    error_text = null,
    updated_at = now()
where status = 'error'
  and source_type = 'law';
```

### Solo una ley

```sql
update public.rag_reindex_jobs
set status = 'pending',
    error_text = null,
    updated_at = now()
where status = 'error'
  and source_type = 'law'
  and law_boe_id = 'BOE-A-2015-10565';
```

## Como reindexar una sola oposicion

Para reencolar el temario vigente de una oposicion:

```sql
insert into public.rag_reindex_jobs (
  source_type,
  opposition_id,
  syllabus_id,
  rag_source_id,
  law_boe_id,
  status,
  reason
)
select
  'syllabus',
  s.opposition_id,
  s.id,
  rs.id,
  null,
  'pending',
  'manual-reindex'
from public.opposition_syllabi s
left join public.rag_sources rs
  on rs.source_type = 'syllabus'
 and rs.syllabus_id = s.id
 and rs.is_current = true
where s.opposition_id = 'agente-hacienda'
  and s.is_current = true;
```

Despues ejecutar:

```bash
python sync_embeddings.py --source-type syllabus --limit 1
```

## Como forzar refresco de una sola ley

```bash
python sync_laws.py --force BOE-A-2015-10565
python sync_embeddings.py --source-type law --limit 1
```

## Separacion operativa de capas

### Estructura de app

- `oppositions`
- `opposition_syllabi`
- `opposition_topics`
- `opposition_subtopics`

### Fuentes RAG

- `rag_sources`
- `rag_chunks`

### Cola de reindexado

- `rag_reindex_jobs`

### Embeddings

- columna `rag_chunks.embedding`
- trazabilidad:
  - `embedding_content_hash`
  - `embedding_provider`
  - `embedding_model`
  - `embedding_updated_at`
  - `embedding_error`

No mezclar estas responsabilidades en otras tablas.

## Chequeos rapidos de salud

### Fuentes RAG vigentes duplicadas

```sql
select source_type, law_boe_id, syllabus_id, count(*)
from public.rag_sources
where is_current = true
group by source_type, law_boe_id, syllabus_id
having count(*) > 1;
```

### Chunks vigentes cuyo source no esta vigente

```sql
select count(*) as invalid_current_chunks
from public.rag_chunks rc
left join public.rag_sources rs on rs.id = rc.rag_source_id
where rc.is_current = true
  and (rs.id is null or rs.is_current = false);
```

### Jobs atascados en processing

```sql
select id, source_type, rag_source_id, updated_at
from public.rag_reindex_jobs
where status = 'processing'
order by updated_at asc;
```

Si hay jobs bloqueados y el worker ya no esta corriendo, se pueden devolver a `pending`:

```sql
update public.rag_reindex_jobs
set status = 'pending',
    error_text = null,
    updated_at = now()
where status = 'processing';
```
