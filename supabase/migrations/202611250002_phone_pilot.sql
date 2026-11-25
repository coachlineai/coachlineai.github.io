alter table public.coach_preview_sessions
  add column published_style jsonb,
  add column phone_line text unique,
  add column webhook_secret uuid default gen_random_uuid();
update public.coach_preview_sessions set phone_line='+16177106179'
where creator_id=(select id from auth.users where lower(email)='meetaka813@gmail.com');

create table public.coach_phone_turns (
  handle text primary key,
  creator_id uuid not null references public.coach_preview_sessions(creator_id) on delete cascade,
  received_at timestamptz not null default now(),
  question text not null,
  answer text,
  state text not null default 'processing'
);
alter table public.coach_phone_turns enable row level security;
revoke all on public.coach_phone_turns from public,anon,authenticated;
grant select,insert,update on public.coach_phone_turns to service_role;
create index on public.coach_phone_turns(creator_id,received_at);
create function public.claim_phone_turn(owner_id uuid, inbound_handle text, question_text text)
returns text language plpgsql set search_path='' as $$
begin
  perform 1 from public.coach_preview_sessions where creator_id=owner_id for update;
  if exists(select 1 from public.coach_phone_turns where handle=inbound_handle) then return 'duplicate'; end if;
  if exists(select 1 from public.coach_phone_turns where creator_id=owner_id and state='processing' and received_at>now()-interval '1 minute') then return 'busy'; end if;
  if (select count(*) from public.coach_phone_turns where creator_id=owner_id and received_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=20 then return 'limited'; end if;
  insert into public.coach_phone_turns(handle,creator_id,question) values(inbound_handle,owner_id,question_text);
  return 'claimed';
end $$;
revoke all on function public.claim_phone_turn(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_phone_turn(uuid,text,text) to service_role;
