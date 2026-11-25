create table public.coach_client_intake (
 creator_id uuid not null references public.coach_preview_sessions(creator_id) on delete cascade,
 phone text not null,
 invite uuid unique default gen_random_uuid(),
 last_handle text,
 issued_at timestamptz not null default now(),
 completed_at timestamptz,
 first_name text,
 sex text,
 workouts text,
 primary key(creator_id,phone)
);
alter table public.coach_client_intake enable row level security;
revoke all on public.coach_client_intake from public, anon, authenticated;
grant select,insert,update,delete on public.coach_client_intake to service_role;

create function public.coach_intake_gate(owner_id uuid, sender text, handle text)
returns jsonb language plpgsql set search_path='' as $$
declare client public.coach_client_intake; first_contact boolean;
begin
 insert into public.coach_client_intake(creator_id,phone) values(owner_id,sender) on conflict do nothing;
 first_contact := found;
 select * into strict client from public.coach_client_intake where creator_id=owner_id and phone=sender for update;
 if client.completed_at is not null then
  return jsonb_build_object('ready',true,'name',client.first_name,'workouts',client.workouts,'sex',client.sex);
 end if;
 if client.last_handle=handle then return jsonb_build_object('duplicate',true); end if;
 if client.issued_at < now()-interval '48 hours' then client.invite:=gen_random_uuid(); client.issued_at:=now(); end if;
 update public.coach_client_intake set last_handle=handle,invite=client.invite,issued_at=client.issued_at where creator_id=owner_id and phone=sender;
 return jsonb_build_object('invite',client.invite,'first',first_contact);
end $$;
revoke all on function public.coach_intake_gate(uuid,text,text) from public,anon,authenticated;
grant execute on function public.coach_intake_gate(uuid,text,text) to service_role;

create function public.finish_coach_intake(ticket uuid, client_name text, client_sex text, weekly text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if client_name is null or length(trim(client_name)) not between 1 and 60 or client_name ~ '[[:cntrl:]]' or client_sex is null or client_sex not in ('Male','Female','Other','Prefer not to say') or weekly is null or weekly not in ('0–2','3–5','6+') then return false; end if;
 update public.coach_client_intake set first_name=trim(client_name),sex=client_sex,workouts=weekly,completed_at=now()
 where invite=ticket and completed_at is null and issued_at>=now()-interval '48 hours';
 return found or exists(select 1 from public.coach_client_intake where invite=ticket and completed_at is not null and issued_at>=now()-interval '48 hours');
end $$;
revoke all on function public.finish_coach_intake(uuid,text,text,text) from public;
grant execute on function public.finish_coach_intake(uuid,text,text,text) to anon,authenticated;