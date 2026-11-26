-- Both the private browser click and the personal invite must belong to the
-- same creator. The verified inbound line remains the owner of the intake.
create function public.attach_creator_page_click(ticket uuid, click_id uuid)
returns void language sql security definer set search_path='' as $$
 update private.page_message_leads as lead set client_id=client.client_key
 from public.coach_client_intake as client
 where lead.token=click_id and client.invite=ticket
   and lead.creator_id=client.creator_id and lead.client_id is null
   and client.issued_at>=now()-interval '48 hours';
$$;
revoke all on function public.attach_creator_page_click(uuid,uuid) from public;
grant execute on function public.attach_creator_page_click(uuid,uuid) to anon,authenticated;
