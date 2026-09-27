-- SPEC.md → L/M: otomatik yanıtlar ("izindeyim", "mesajınız alındı")
-- AUTO_REPLY niyetiyle kaydedilir; follow-up'ı iptal etmez, yalnızca 2 gün
-- erteler, cevap sayılmaz (last_inbound_at, kampanya REPLIED, soğuma muafiyeti
-- tetiklenmez). record_inbound aynı dış mesaj kimliğiyle ikinci kez
-- çağrılırsa (IMAP poller'ın tekrar çalışması) mevcut kaydı döner.

create or replace function public.record_inbound(
  ws uuid,
  p_business_id uuid,
  p_channel text,
  p_body text,
  p_subject text default null,
  p_external_message_id text default null,
  p_intent text default null,
  p_intent_confidence numeric default null,
  p_stop_request boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
  v_is_auto boolean := coalesce(p_intent = 'AUTO_REPLY', false);
begin
  if auth.uid() is null or not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  if not exists (select 1 from public.businesses where id = p_business_id and workspace_id = ws) then
    raise exception 'business % not found in workspace %', p_business_id, ws;
  end if;

  if p_external_message_id is not null then
    select m.id, m.conversation_id into v_message_id, v_conversation_id
    from public.messages m
    where m.workspace_id = ws and m.external_message_id = p_external_message_id;
    if v_message_id is not null then
      return jsonb_build_object('conversationId', v_conversation_id, 'messageId', v_message_id, 'duplicate', true);
    end if;
  end if;

  insert into public.conversations (workspace_id, business_id, channel, last_inbound_at)
  values (ws, p_business_id, p_channel, case when v_is_auto then null else now() end)
  on conflict (business_id, channel)
    do update set
      last_inbound_at = case when v_is_auto then public.conversations.last_inbound_at else now() end,
      updated_at = now()
  returning id into v_conversation_id;

  insert into public.messages (
    workspace_id, conversation_id, direction, status, body, subject,
    author_type, external_message_id, intent, intent_confidence
  ) values (
    ws, v_conversation_id, 'IN', 'RECEIVED', p_body, p_subject,
    'USER', p_external_message_id, p_intent, p_intent_confidence
  )
  returning id into v_message_id;

  if p_stop_request then
    update public.businesses
    set do_not_contact = true, dnc_reason = 'Müşteri talebi (gelen mesaj)', dnc_at = now(), version = version + 1
    where id = p_business_id and workspace_id = ws and do_not_contact = false;

    perform public.log_activity(
      ws, 'lead.dnc_set', 'business', p_business_id,
      'Gelen mesajda durdurma talebi tespit edildi, DNC işaretlendi', '{}'::jsonb
    );
  end if;

  perform public.log_activity(
    ws, 'message.received', 'conversation', v_conversation_id,
    case when v_is_auto
      then format('%s kanalından otomatik yanıt alındı', p_channel)
      else format('%s kanalından mesaj alındı', p_channel)
    end,
    jsonb_build_object('messageId', v_message_id, 'intent', p_intent)
  );

  return jsonb_build_object('conversationId', v_conversation_id, 'messageId', v_message_id, 'duplicate', false);
end;
$$;

create or replace function public.cancel_followups_on_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  if new.direction = 'IN' then
    select business_id into v_business_id from public.conversations where id = new.conversation_id;
    if v_business_id is null then
      return new;
    end if;

    if new.intent = 'AUTO_REPLY' then
      update public.follow_ups
      set due_at = due_at + interval '2 days', updated_at = now()
      where business_id = v_business_id and status in ('PENDING', 'DRAFTED');
    else
      perform public.cancel_followups(v_business_id, 'Yeni gelen mesaj');
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.campaign_members_track_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.conversations%rowtype;
begin
  select * into v_conversation from public.conversations where id = new.conversation_id;
  if not found then
    return new;
  end if;

  if new.direction = 'OUT' and new.status = 'SENT' and (tg_op = 'INSERT' or old.status is distinct from 'SENT') then
    update public.campaign_members m
    set status = 'SENT', sent_at = coalesce(new.sent_at, now()), conversation_id = v_conversation.id, updated_at = now()
    from public.campaigns c
    where m.campaign_id = c.id
      and c.status = 'ACTIVE'
      and c.channel = v_conversation.channel
      and m.business_id = v_conversation.business_id
      and m.status in ('QUEUED', 'DRAFTED');
  elsif new.direction = 'IN' and tg_op = 'INSERT' and new.intent is distinct from 'AUTO_REPLY' then
    update public.campaign_members
    set status = 'REPLIED', replied_at = now(), updated_at = now()
    where business_id = v_conversation.business_id and status = 'SENT';
  end if;

  return new;
end;
$$;
