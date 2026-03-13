-- Enforce Qwen/OpenRouter-only embeddings for legal RAG chunks.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rag_chunks_qwen_embedding_guard'
      and conrelid = 'public.rag_chunks'::regclass
  ) then
    alter table public.rag_chunks
      add constraint rag_chunks_qwen_embedding_guard
      check (
        embedding is null
        or (
          vector_dims(embedding) = 4096
          and coalesce(embedding_provider, '') = 'openrouter'
          and coalesce(embedding_model, '') = 'qwen/qwen3-embedding-8b'
        )
      );
  end if;
end
$$;

-- Make the daily kickoff more reliable (avoid 5-law timeout bursts).
do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'sync-laws-rag-daily'
  limit 1;

  if v_job_id is not null then
    perform cron.alter_job(
      job_id => v_job_id,
      command => $cmd$
        select public.invoke_internal_edge_function(
          'sync-laws-rag',
          jsonb_build_object('force', false, 'max_laws', 1),
          300000
        );
      $cmd$
    );
  end if;
end
$$;
