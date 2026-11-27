-- Queue the worker call in the same transaction as the new starter.
-- The minute schedule still picks up missed calls and retries.
create function private.wake_starter_worker() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.coaching_delivery_config where enabled) then
    perform net.http_post(
      url := 'https://kvpngwwaemdjwchslcov.supabase.co/functions/v1/coaching-worker',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-token',
        (select decrypted_secret from vault.decrypted_secrets where name = 'coachline_cycle_cron_v1')),
      body := '{}'::jsonb, timeout_milliseconds := 90000
    );
  end if;
  return new;
exception when others then
  raise warning 'Starter dispatch deferred to scheduler';
  return new;
end;
$$;
revoke all on function private.wake_starter_worker() from public, anon, authenticated;
create trigger wake_new_starter after insert on public.coaching_jobs
for each row when (new.kind = 'starter' and new.state = 'queued')
execute function private.wake_starter_worker();
