-- The webhook already claims each provider handle. Also coalesce separate
-- greetings from one client while their first invitation is being composed.
alter table public.coach_setup_replies add column greeting_client uuid,
  add column greeting_stage text;
create index coach_setup_greeting_window on public.coach_setup_replies
  (greeting_client, greeting_stage, claimed_at) where greeting_client is not null;

create function public.claim_setup_greeting(owner_id uuid, client uuid, inbound_handle text, stage text)
returns boolean language plpgsql set search_path='' as $$
begin
  perform 1 from public.coach_client_intake where client_key=client and creator_id=owner_id for update;
  if not found then raise exception 'Unknown client'; end if;
  if exists(select from public.coach_setup_replies where creator_id=owner_id and greeting_client=client
    and greeting_stage=stage and handle<>inbound_handle and claimed_at>now()-interval '20 seconds') then
    update public.coach_setup_replies set delivered=true where creator_id=owner_id and handle=inbound_handle;
    return false;
  end if;
  update public.coach_setup_replies set greeting_client=client,greeting_stage=stage
    where creator_id=owner_id and handle=inbound_handle;
  if not found then raise exception 'Missing setup turn'; end if;
  return true;
end $$;
revoke all on function public.claim_setup_greeting(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_setup_greeting(uuid,uuid,text,text) to service_role;
