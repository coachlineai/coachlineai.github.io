alter table public.coach_phone_turns add column client_phone text;
create index coach_phone_turns_client on public.coach_phone_turns(creator_id,client_phone,received_at);

create function public.coach_has_paid_access(owner_id uuid, sender text)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.coaching_orders where creator_id=owner_id and client_phone=sender
   and state='active' and (plan='once' or paid_through>now()));
$$;
revoke all on function public.coach_has_paid_access(uuid,text) from public,anon,authenticated;
grant execute on function public.coach_has_paid_access(uuid,text) to service_role;

-- Keep setup replies separate from AI conversation history. Remember every delivery
-- handle so a late webhook retry cannot turn an old unpaid question into coaching.
create table public.coach_setup_replies (
 creator_id uuid not null references public.coach_preview_sessions(creator_id) on delete cascade,
 handle text not null,
 claimed_at timestamptz not null default now(),
 delivered boolean not null default false,
 first_contact boolean not null,
 primary key(creator_id,handle)
);
alter table public.coach_setup_replies enable row level security;
revoke all on public.coach_setup_replies from public,anon,authenticated;
grant select,insert,update on public.coach_setup_replies to service_role;

create function public.client_message_gate(owner_id uuid, sender text, handle text)
returns jsonb language plpgsql set search_path='' as $$
declare
 profile jsonb;
 client public.coach_client_intake;
 prior public.coach_setup_replies;
 first_contact boolean;
begin
 insert into public.coach_client_intake(creator_id,phone) values(owner_id,sender) on conflict do nothing;
 first_contact := found;
 select * into strict client from public.coach_client_intake where creator_id=owner_id and phone=sender for update;
 select r.* into prior from public.coach_setup_replies r where r.creator_id=owner_id and r.handle=client_message_gate.handle;
 if prior.delivered then return jsonb_build_object('stage','duplicate'); end if;
 if prior.claimed_at > now()-interval '45 seconds' then return jsonb_build_object('stage','busy'); end if;
 if client.completed_at is not null and client.birth_date is not null and public.coach_has_paid_access(owner_id,sender) then
   if prior.handle is not null then return jsonb_build_object('stage','duplicate'); end if;
   profile:=public.coach_intake_gate(owner_id,sender,handle);
   return profile || jsonb_build_object('stage','coach');
 end if;
 if client.issued_at <= now()-interval '48 hours' then
   update public.coach_client_intake set invite=gen_random_uuid(),issued_at=now()
    where creator_id=owner_id and phone=sender returning * into client;
 end if;
 insert into public.coach_setup_replies(creator_id,handle,first_contact) values(owner_id,handle,first_contact)
 on conflict on constraint coach_setup_replies_pkey do update set claimed_at=now();
 return jsonb_build_object('first',coalesce(prior.first_contact,first_contact),'invite',client.invite,
   'stage',case when client.completed_at is not null and client.birth_date is not null then 'payment' else 'onboarding' end);
end $$;
revoke all on function public.client_message_gate(uuid,text,text) from public,anon,authenticated;
grant execute on function public.client_message_gate(uuid,text,text) to service_role;

create function public.claim_client_phone_turn(owner_id uuid,sender text,inbound_handle text,question_text text)
returns text language plpgsql set search_path='' as $$
declare decision text;
begin
 if not public.coach_has_paid_access(owner_id,sender) then return 'unpaid'; end if;
 decision:=public.claim_phone_turn(owner_id,inbound_handle,question_text);
 if decision='claimed' then
   update public.coach_phone_turns set client_phone=sender where handle=inbound_handle;
 end if;
 return decision;
end $$;
revoke all on function public.claim_client_phone_turn(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_client_phone_turn(uuid,text,text,text) to service_role;
