# sync_embeddings.py

Worker batch para generar o actualizar embeddings únicamente cuando hay contenido nuevo o cambiado.

## Decisión de arquitectura

Se implementa como script Python, no como Edge Function.

Motivo:

- El proveedor inicial es Gemini y ya existe antecedente Python en el proyecto.
- Un worker batch con reintentos, lotes y ejecuciones largas encaja mejor en Python que en una Edge Function corta.
- La cola ya está en Supabase (`rag_reindex_jobs`), así que el worker queda desacoplado del descubrimiento BOE y del parseo.

## Qué hace

- Reclama jobs `pending` con la RPC `claim_rag_reindex_jobs()` usando `FOR UPDATE SKIP LOCKED`.
- Busca la `rag_source` objetivo.
- Carga sólo `rag_chunks` vigentes de esa fuente.
- Recalcula embeddings sólo si:
  - `embedding` es `NULL`, o
  - `embedding_content_hash` es `NULL`, o
  - `embedding_content_hash <> content_hash`.
- Guarda el vector y la trazabilidad del embedding en `rag_chunks`.
- Marca el job como `done`.
- Si falla, deja el job como `error` con `error_text`.

Los chunks no vigentes quedan fuera por diseño: no se cargan para generar embeddings y la vista `rag_retrieval_chunks` sólo expone chunks vigentes y embebidos.

## Archivos

- `sync_embeddings.py`
- `rag_worker/__init__.py`
- `rag_worker/providers.py`
- `rag_worker/worker.py`
- `supabase/migrations/202603060003_rag_embedding_worker.sql`

## Requisitos

Instalar dependencias:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Variables de entorno

Obligatorias:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_API_KEY`

Opcionales:

- `EMBEDDING_PROVIDER=gemini`
- `EMBEDDING_MODEL=models/gemini-embedding-001`
- `EMBEDDING_DIM=1536`
- `JOB_BATCH_SIZE=5`
- `EMBED_BATCH_SIZE=16`
- `EMBED_RETRIES=6`
- `EMBED_BACKOFF_BASE=2.0`

`EMBEDDING_DIM` debe coincidir con la dimensión de `rag_chunks.embedding`. Con la migración actual, la columna está definida como `vector(1536)`.

## SQL previo

Aplica antes esta migración:

- `supabase/migrations/202603060003_rag_embedding_worker.sql`

Esa migración añade:

- columnas de trazabilidad de embedding en `rag_chunks`
- índice vectorial parcial HNSW para chunks vigentes con embedding
- índices de filtro por `source_type`, `opposition_id`, `syllabus_id`, `rag_source_id`
- RPC `claim_rag_reindex_jobs`
- vista `rag_retrieval_chunks`

## Uso

Procesar jobs pendientes:

```bash
python sync_embeddings.py
```

Procesar hasta 10 jobs:

```bash
python sync_embeddings.py --limit 10
```

Procesar sólo leyes:

```bash
python sync_embeddings.py --source-type law
```

Procesar sólo temarios:

```bash
python sync_embeddings.py --source-type syllabus
```

## Integración con rag_reindex_jobs

Este worker no descubre BOEs ni genera chunks.

Sólo consume jobs ya encolados por:

- el sincronizador de temarios
- el importador de leyes

Cuando alguno de esos procesos crea o actualiza `rag_chunks`, debe dejar un job `pending`. Este worker recoge esos jobs, actualiza embeddings y marca el resultado final del procesamiento.

## Reintentos y lotes

- Reintentos por chunk en Gemini:
  - por defecto `6`
  - backoff exponencial `2^n`
- Lote razonable:
  - `JOB_BATCH_SIZE=5`
  - `EMBED_BATCH_SIZE=16`

Aunque el procesamiento se agrupa por lotes para control operativo, la implementación con Gemini embebe cada chunk de forma independiente dentro del lote. Eso reduce acoplamiento con cambios de API y hace el retry más fino.

## Recuperación semántica

La vista preparada para el backend de IA es:

- `public.rag_retrieval_chunks`

Devuelve sólo chunks:

- `rc.is_current = true`
- `rs.is_current = true`
- `embedding is not null`

Incluye además:

- `title`
- `source_type`
- `opposition_id`
- `syllabus_id`
- `source_url`
- `metadata`
- `source_title`
- `law_boe_id`
- `source_metadata`

## Índices recomendados

Ya quedan en la migración:

- HNSW parcial sobre `embedding` para chunks vigentes
- índice de filtros sobre `(source_type, opposition_id, syllabus_id, rag_source_id)` para chunks vigentes
- índice sobre `(rag_source_id, content_hash, embedding_content_hash)` para detectar cambios rápido

## Operación

- Si un job falla, queda en `error` con detalle en `error_text`.
- Los chunks embebidos correctamente antes del fallo no se pierden.
- En un reintento posterior sólo se recalculan los que sigan pendientes de embedding o con hash cambiado.
