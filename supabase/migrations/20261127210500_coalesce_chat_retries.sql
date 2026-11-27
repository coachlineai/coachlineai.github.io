-- Serialize the repeat check with the existing per-creator turn claim.
create function public.claim_client_chat_turn(owner_id uuid,sender text,inbound_handle text,question_text text,greeting boolean,has_media boolean)
returns text language plpgsql set search_path='' as $$
declare previous public.coach_phone_turns;
begin
  perform 1 from public.coach_preview_sessions where creator_id=owner_id for update;
  if not public.coach_has_paid_access(owner_id,sender) then return 'unpaid'; end if;
  if not has_media then
    select * into previous from public.coach_phone_turns
      where creator_id=owner_id and client_phone=sender
      order by received_at desc limit 1;
    if previous.handle<>inbound_handle and (
      (previous.state='processing' and previous.received_at>now()-interval '1 minute'
       and (greeting or lower(trim(previous.question))=lower(trim(question_text))))
      or (greeting and previous.state='accepted' and previous.received_at>now()-interval '20 seconds'
       and previous.question ~* '^(hey|hi|hello|yo|what[''’]?s up)( coach|, [[:alpha:] ''-]{1,50})?[!.? ]*$')
    ) then
      -- The setup gate checks these delivery receipts first, including on retries.
      insert into public.coach_setup_replies(creator_id,handle,delivered,first_contact)
        values(owner_id,inbound_handle,true,false) on conflict do nothing;
      return 'duplicate';
    end if;
  end if;
  return public.claim_client_phone_turn(owner_id,sender,inbound_handle,question_text);
end $$;
revoke all on function public.claim_client_chat_turn(uuid,text,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.claim_client_chat_turn(uuid,text,text,text,boolean,boolean) to service_role;
