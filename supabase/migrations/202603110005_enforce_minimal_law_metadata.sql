-- Enforce minimal legal metadata on writes, including cron-driven syncs.

create or replace function public.normalize_law_rag_metadata()
returns trigger
language plpgsql
as $$
begin
  if new.source_type = 'law' then
    if tg_table_name = 'rag_chunks' then
      new.metadata := jsonb_strip_nulls(
        coalesce(new.metadata, '{}'::jsonb)
        - 'articulo_num'
        - 'source_kind'
        - 'label'
        - 'unit_ids'
        - 'unit_title'
        - 'grouped_units_total'
        - 'content_hash'
        - 'eli'
        - 'fecha_actualizacion'
        - 'fecha_iso'
        - 'fecha_vigencia'
        - 'fecha_publicacion'
      );
    elsif tg_table_name = 'rag_sources' then
      new.metadata := jsonb_strip_nulls(
        coalesce(new.metadata, '{}'::jsonb)
        - 'boe_id'
        - 'source_kind'
        - 'label'
        - 'chunks_total'
        - 'units_total'
        - 'blocks_total'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_law_rag_chunks_metadata on public.rag_chunks;
create trigger trg_normalize_law_rag_chunks_metadata
before insert or update of metadata, source_type
on public.rag_chunks
for each row
execute function public.normalize_law_rag_metadata();

drop trigger if exists trg_normalize_law_rag_sources_metadata on public.rag_sources;
create trigger trg_normalize_law_rag_sources_metadata
before insert or update of metadata, source_type
on public.rag_sources
for each row
execute function public.normalize_law_rag_metadata();
