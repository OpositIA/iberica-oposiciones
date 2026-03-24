-- Remove the automatic daily BOE scanner cron job.
-- Syllabus sync is now triggered manually via sync-boe-syllabi endpoint.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'scan-boe-daily') then
    perform cron.unschedule('scan-boe-daily');
  end if;
end;
$$;
