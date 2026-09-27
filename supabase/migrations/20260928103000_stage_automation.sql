-- SPEC.md → K geçiş tablosundaki otomatik (SYSTEM) tetikleyiciler:
--   CONTACTED → REPLIED   : gelen mesaj (AUTO_REPLY hariç)
--   STOP_CONTACT          : DNC + stage LOST (NOT_INTERESTED)
--   CONTACTED → LOST      : sekans bitti + 7 gün cevapsız (NO_RESPONSE, SPEC → M)
-- Kural kontrolü is_valid_stage_transition ile aynıdır; geçiş SYSTEM aktörüyle
-- stage_transitions ve activity_logs'a yazılır.

-- Yalnızca diğer SECURITY DEFINER fonksiyonlarından çağrılır (istemciye açık değil).
create function public.system_transition_stage(p_business_id uuid, p_to_stage text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_prev_actor text := current_setting('app.actor', true);
begin
  select * into v_business from public.businesses where id = p_business_id for update;
  if not found or not public.is_valid_stage_transition(v_business.stage, p_to_stage) then
    return false;
  end if;

  update public.businesses
  set stage = p_to_stage,
      version = version + 1,
      updated_at = now(),
      lost_reason = case when p_to_stage = 'LOST' then p_reason else null end
  where id = p_business_id;

  insert into public.stage_transitions (workspace_id, business_id, from_stage, to_stage, reason, actor_type, actor_user_id)
  values (v_business.workspace_id, p_business_id, v_business.stage, p_to_stage, p_reason, 'SYSTEM', null);

  perform set_config('app.actor', 'SYSTEM', true);
  perform public.log_activity(
    v_business.workspace_id, 'lead.stage_changed', 'business', p_business_id,
    format('Stage: %s → %s (otomatik)', v_business.stage, p_to_stage),
    jsonb_build_object('from', v_business.stage, 'to', p_to_stage, 'reason', p_reason)
  );
  perform set_config('app.actor', coalesce(v_prev_actor, ''), true);

  return true;
end;
$$;

revoke execute on function public.system_transition_stage(uuid, text, text) from public, anon, authenticated;

-- record_inbound: 20260928100000_inbound_intents.sql ile aynı, sonuna otomatik
-- aşama geçişleri eklendi.
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
  v_stage text;
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

  select stage into v_stage from public.businesses where id = p_business_id;
  if p_stop_request then
    perform public.system_transition_stage(p_business_id, 'LOST', 'NOT_INTERESTED');
  elsif not v_is_auto and v_stage = 'CONTACTED' then
    perform public.system_transition_stage(p_business_id, 'REPLIED', 'Gelen mesaj');
  end if;

  return jsonb_build_object('conversationId', v_conversation_id, 'messageId', v_message_id, 'duplicate', false);
end;
$$;

-- Sekans sonu: tüm politika adımları SENT/SKIPPED, bekleyen adım yok, son
-- giden mesajın üzerinden 7 gün geçmiş ve ilk temastan beri (otomatik yanıt
-- dışında) cevap gelmemiş CONTACTED lead'ler LOST (NO_RESPONSE) olur.
-- Masaüstü açılışta ve saatte bir çağırır; döndürdüğü sayı kapatılan lead'lerdir.
create function public.close_stale_sequences(ws uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy jsonb;
  v_steps integer;
  v_business_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null or not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  select followup_policy into v_policy from public.workspace_settings where workspace_id = ws;
  if coalesce(v_policy ->> 'afterSequence', '') <> 'MARK_LOST_NO_RESPONSE' then
    return 0;
  end if;
  v_steps := coalesce(jsonb_array_length(v_policy -> 'steps'), 0);

  for v_business_id in
    select b.id
    from public.businesses b
    where b.workspace_id = ws
      and b.stage = 'CONTACTED'
      and b.merged_into is null
      and not exists (
        select 1 from public.follow_ups f where f.business_id = b.id and f.status in ('PENDING', 'DRAFTED')
      )
      and (
        select count(distinct f.step) from public.follow_ups f
        where f.business_id = b.id and f.status in ('SENT', 'SKIPPED') and f.step between 1 and v_steps
      ) >= v_steps
      and (
        select max(m.sent_at) from public.messages m
        join public.conversations c on c.id = m.conversation_id
        where c.business_id = b.id and m.direction = 'OUT' and m.status = 'SENT'
      ) <= now() - interval '7 days'
      and not exists (
        select 1 from public.messages m
        join public.conversations c on c.id = m.conversation_id
        where c.business_id = b.id and m.direction = 'IN' and m.intent is distinct from 'AUTO_REPLY'
          and m.created_at >= (
            select min(o.sent_at) from public.messages o
            join public.conversations oc on oc.id = o.conversation_id
            where oc.business_id = b.id and o.direction = 'OUT' and o.status = 'SENT'
          )
      )
    for update of b skip locked
  loop
    if public.system_transition_stage(v_business_id, 'LOST', 'NO_RESPONSE') then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.close_stale_sequences(uuid) from public;
grant execute on function public.close_stale_sequences(uuid) to authenticated;
