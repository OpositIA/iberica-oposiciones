-- Drop redundant metadata keys for legal RAG rows.

update public.rag_chunks
set metadata = jsonb_strip_nulls(
  coalesce(metadata, '{}'::jsonb)
  - 'unit_ids'
  - 'unit_title'
  - 'grouped_units_total'
  - 'source_kind'
  - 'label'
)
where source_type = 'law';

update public.rag_sources
set metadata = jsonb_strip_nulls(
  coalesce(metadata, '{}'::jsonb)
  - 'label'
  - 'chunks_total'
  - 'units_total'
  - 'blocks_total'
  - 'boe_id'
  - 'source_kind'
)
where source_type = 'law';
