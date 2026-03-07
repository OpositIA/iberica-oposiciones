# sync_laws.py

Importador de legislación consolidada del BOE para la capa RAG.

## Qué hace

- Lee leyes activas desde `public.law_watchlist`.
- También permite pasar `boe_id` concretos por CLI.
- Consulta la API oficial de legislación consolidada:
  - `/metadatos`
  - `/texto/indice`
  - `/texto/bloque/{id_bloque}`
- Detecta cambios por `fecha_actualizacion`.
- Si no hay cambios y no usas `--force`, no rehace chunks ni toca jobs.
- Si hay cambios:
  - genera una versión RAG de la ley en `rag_sources`
  - upserta chunks en `rag_chunks`
  - marca la nueva fuente como `is_current = true`
  - marca versiones anteriores equivalentes como `is_current = false`
  - actualiza `law_sync_log`
  - crea o reactiva un `rag_reindex_job` de tipo `law`

## Archivos

- `sync_laws.py`
- `law_sync/boe_api.py`
- `law_sync/chunking.py`
- `law_sync/legacy_laws.py`
- `law_sync/syncer.py`
- `requirements.txt`
- `supabase/seeds/law_watchlist_seed.sql`

## Instalación

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Variables de entorno

Necesarias:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Ejemplo PowerShell:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

## Uso

Usar `law_watchlist` activa:

```bash
python sync_laws.py
```

Forzar resincronización:

```bash
python sync_laws.py --force
```

Procesar leyes concretas:

```bash
python sync_laws.py BOE-A-2015-10565 BOE-A-2015-10566
```

Procesar leyes concretas forzando:

```bash
python sync_laws.py --force BOE-A-2015-10565
```

## Seed inicial de `law_watchlist`

Carga la lista antigua `LEYES` con:

```sql
\i supabase/seeds/law_watchlist_seed.sql
```

O pega el contenido de `supabase/seeds/law_watchlist_seed.sql` en Supabase SQL Editor.

## Integración con `rag_reindex_jobs`

Este script no genera embeddings.

Cuando detecta una ley nueva o cambiada:

- crea o reutiliza la fuente correspondiente en `rag_sources`
- deja sus chunks en `rag_chunks`
- crea o reactiva un job en `rag_reindex_jobs` con:
  - `source_type = 'law'`
  - `law_boe_id = <boe_id>`
  - `rag_source_id = <source_id>`
  - `status = 'pending'`

El pipeline posterior de embeddings sólo tiene que consumir esos jobs pendientes.

## Notas de operación

- El importador usa `is_current = false` para chunks obsoletos del mismo `rag_source`; no hace borrado duro.
- Si una ley cambia y genera una nueva `rag_source`, las fuentes anteriores equivalentes se marcan como no vigentes.
- Si una inserción falla tras crear una `rag_source` nueva, se borra esa fuente para que `ON DELETE CASCADE` limpie sus chunks.
- El importador usa párrafos `<p>` como base cuando existen; si no, cae a texto consolidado del bloque.
- El `source_hash` se calcula a partir de la secuencia estable de chunks.
