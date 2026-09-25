-- Faz 7: conversations, messages, human_handoffs (SPEC.md → E, J, Faz 7).
-- mark_message_sent()/record_inbound() RPC'leri gönderim/alım yaşam
-- döngüsünü DB'de zorlar; outreach_guard() burada CREATE OR REPLACE ile
-- tamamlanır (kanal bazlı soğuma artık conversations üzerinden — bkz.
-- docs/adr/0005-scoring-and-outreach-guard.md güncellemesi).
-- MAX_FOLLOWUPS hâlâ ertelenmiştir (follow_ups tablosu Faz 8'de).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel text not null check (channel in ('EMAIL', 'INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'LINKEDIN', 'TIKTOK', 'PHONE')),
  contact_channel_id uuid references public.contact_channels (id),
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  handled_by text not null default 'AI_ASSISTED' check (handled_by in ('AI_ASSISTED', 'HUMAN')),
  summary text not null default '',
  summary_upto_message_id uuid,
  requirements jsonb not null default '[]'::jsonb,
  interest_level text check (interest_level is null or interest_level in ('LOW', 'MEDIUM', 'HIGH')),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  email_thread_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, channel)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null check (direction in ('IN', 'OUT')),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'APPROVED', 'SENT', 'FAILED', 'RECEIVED', 'DISCARDED')),
  body text not null,
  subject text,
  author_type text not null check (author_type in ('USER', 'AI', 'SYSTEM', 'JARVIS')),
  author_user_id uuid references public.profiles (id),
  external_message_id text,
  content_hash text,
  intent text,
  intent_confidence numeric,
  ai_run_id uuid references public.ai_runs (id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, external_message_id)
);

create index messages_conversation_id_idx on public.messages (conversation_id, created_at desc);
create index messages_content_hash_idx on public.messages (conversation_id, content_hash) where content_hash is not null;

create table public.human_handoffs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  summary text not null,
  requirements jsonb not null default '[]'::jsonb,
  assigned_to uuid references public.profiles (id),
  status text not null default 'OPEN' check (status in ('OPEN', 'ACCEPTED', 'CLOSED')),
  created_by_type text not null check (created_by_type in ('USER', 'AI', 'SYSTEM')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lead başına tek OPEN handoff (SPEC.md → E).
create unique index human_handoffs_one_open_per_business
  on public.human_handoffs (business_id) where status = 'OPEN';

-- conversations
alter table public.conversations enable row level security;
alter table public.conversations force row level security;

create policy conversations_select on public.conversations
  for select to authenticated using (public.is_member(workspace_id));
create policy conversations_insert on public.conversations
  for insert to authenticated with check (public.is_member(workspace_id));
create policy conversations_update on public.conversations
  for update to authenticated
  using (public.is_member(workspace_id))
  with check (public.is_member(workspace_id));

-- messages
alter table public.messages enable row level security;
alter table public.messages force row level security;

create policy messages_select on public.messages
  for select to authenticated using (public.is_member(workspace_id));
create policy messages_insert on public.messages
  for insert to authenticated
  with check (public.is_member(workspace_id) and status in ('DRAFT', 'RECEIVED'));
create policy messages_update on public.messages
  for update to authenticated
  using (public.is_member(workspace_id))
  with check (public.is_member(workspace_id));

-- Gerçek gönderim/teslim durumu yalnızca RPC ile değişir (CLAUDE.md #5'in aynı
-- ilkesi: "yalnızca gönderim yapan RPC'ler zorlar" — outreach_guard, duplicate
-- protection ve businesses/conversations senkronu buraya bağlı).
revoke update (status, sent_at, external_message_id, content_hash) on public.messages from authenticated;

-- human_handoffs
alter table public.human_handoffs enable row level security;
alter table public.human_handoffs force row level security;

create policy human_handoffs_select on public.human_handoffs
  for select to authenticated using (public.is_member(workspace_id));
create policy human_handoffs_update on public.human_handoffs
  for update to authenticated
  using (public.is_member(workspace_id))
  with check (public.is_member(workspace_id));
-- INSERT yalnızca create_handoff() RPC'si iledir (tek OPEN kuralı + log).

-- Kullanıcıya dönük her mutasyon activity log yazar.
create trigger conversations_write_log
  after insert or update on public.conversations
  for each row execute function public.kb_write_log();

create function public.record_inbound(
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
begin
  if auth.uid() is null or not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  if not exists (select 1 from public.businesses where id = p_business_id and workspace_id = ws) then
    raise exception 'business % not found in workspace %', p_business_id, ws;
  end if;

  insert into public.conversations (workspace_id, business_id, channel, last_inbound_at)
  values (ws, p_business_id, p_channel, now())
  on conflict (business_id, channel)
    do update set last_inbound_at = now(), updated_at = now()
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
    format('%s kanalından mesaj alındı', p_channel), jsonb_build_object('messageId', v_message_id)
  );

  return jsonb_build_object('conversationId', v_conversation_id, 'messageId', v_message_id);
end;
$$;

create function public.approve_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages%rowtype;
begin
  select * into v_message from public.messages where id = p_message_id;
  if not found or not public.is_member(v_message.workspace_id) then
    raise exception 'message % not found or not accessible', p_message_id;
  end if;
  if v_message.status <> 'DRAFT' then
    raise exception 'only a DRAFT message can be approved';
  end if;

  update public.messages set status = 'APPROVED' where id = p_message_id;

  perform public.log_activity(
    v_message.workspace_id, 'message.approved', 'message', p_message_id, 'Taslak onaylandı', '{}'::jsonb
  );
end;
$$;

create function public.discard_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages%rowtype;
begin
  select * into v_message from public.messages where id = p_message_id;
  if not found or not public.is_member(v_message.workspace_id) then
    raise exception 'message % not found or not accessible', p_message_id;
  end if;
  if v_message.status not in ('DRAFT', 'APPROVED') then
    raise exception 'only a DRAFT or APPROVED message can be discarded';
  end if;

  update public.messages set status = 'DISCARDED' where id = p_message_id;
end;
$$;

-- mark_message_sent: outreach_guard() + 30 günlük content_hash duplicate
-- kontrolü + businesses/conversations senkronu (SPEC.md → I.5, D16: ilk
-- gönderen otomatik assigned_to olur).
create function public.mark_message_sent(
  p_message_id uuid,
  p_content_hash text,
  p_external_message_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages%rowtype;
  v_conversation public.conversations%rowtype;
  v_guard jsonb;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_message from public.messages where id = p_message_id;
  if not found or not public.is_member(v_message.workspace_id) then
    raise exception 'message % not found or not accessible', p_message_id;
  end if;
  if v_message.status <> 'APPROVED' then
    raise exception 'only an APPROVED message can be sent';
  end if;

  select * into v_conversation from public.conversations where id = v_message.conversation_id;

  v_guard := public.outreach_guard(v_conversation.business_id, v_conversation.channel);
  if not (v_guard ->> 'allowed')::boolean then
    raise exception 'outreach_guard rejected: %', v_guard -> 'reasons';
  end if;

  if exists (
    select 1 from public.messages
    where conversation_id = v_message.conversation_id
      and direction = 'OUT' and status = 'SENT'
      and content_hash = p_content_hash
      and created_at >= now() - interval '30 days'
      and id <> p_message_id
  ) then
    raise exception 'duplicate_message: aynı içerik son 30 günde bu konuşmada gönderildi';
  end if;

  update public.messages
  set status = 'SENT', sent_at = now(), content_hash = p_content_hash,
      external_message_id = coalesce(p_external_message_id, external_message_id)
  where id = p_message_id;

  update public.conversations
  set last_outbound_at = now(), updated_at = now()
  where id = v_message.conversation_id;

  update public.businesses
  set last_contacted_at = now(),
      assigned_to = coalesce(assigned_to, v_uid),
      version = version + 1
  where id = v_conversation.business_id;

  if (select stage from public.businesses where id = v_conversation.business_id) = 'OUTREACH_READY' then
    perform public.transition_stage(
      v_conversation.business_id, 'CONTACTED', 'İlk mesaj gönderildi',
      (select version from public.businesses where id = v_conversation.business_id)
    );
  end if;

  perform public.log_activity(
    v_message.workspace_id, 'message.sent', 'message', p_message_id,
    format('%s kanalından mesaj gönderildi', v_conversation.channel), '{}'::jsonb
  );

  return jsonb_build_object('messageId', p_message_id, 'status', 'SENT');
end;
$$;

create function public.mark_message_failed(p_message_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages%rowtype;
begin
  select * into v_message from public.messages where id = p_message_id;
  if not found or not public.is_member(v_message.workspace_id) then
    raise exception 'message % not found or not accessible', p_message_id;
  end if;

  update public.messages set status = 'FAILED' where id = p_message_id;

  perform public.log_activity(
    v_message.workspace_id, 'message.failed', 'message', p_message_id,
    coalesce(p_reason, 'Gönderim başarısız'), '{}'::jsonb
  );
end;
$$;

create function public.create_handoff(
  p_business_id uuid,
  p_conversation_id uuid,
  p_summary text,
  p_requirements jsonb default '[]'::jsonb,
  p_created_by_type text default 'USER'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_handoff_id uuid;
begin
  select workspace_id into v_ws from public.businesses where id = p_business_id;
  if v_ws is null or not public.is_member(v_ws) then
    raise exception 'business % not found or not accessible', p_business_id;
  end if;

  if exists (select 1 from public.human_handoffs where business_id = p_business_id and status = 'OPEN') then
    raise exception 'business already has an OPEN handoff';
  end if;

  insert into public.human_handoffs (workspace_id, business_id, conversation_id, summary, requirements, created_by_type)
  values (v_ws, p_business_id, p_conversation_id, p_summary, p_requirements, p_created_by_type)
  returning id into v_handoff_id;

  perform public.log_activity(
    v_ws, 'handoff.created', 'business', p_business_id, 'Devir kartı oluşturuldu', '{}'::jsonb
  );

  return v_handoff_id;
end;
$$;

revoke execute on function public.record_inbound(uuid, uuid, text, text, text, text, text, numeric, boolean) from public;
revoke execute on function public.approve_message(uuid) from public;
revoke execute on function public.discard_message(uuid) from public;
revoke execute on function public.mark_message_sent(uuid, text, text) from public;
revoke execute on function public.mark_message_failed(uuid, text) from public;
revoke execute on function public.create_handoff(uuid, uuid, text, jsonb, text) from public;

grant execute on function public.record_inbound(uuid, uuid, text, text, text, text, text, numeric, boolean) to authenticated;
grant execute on function public.approve_message(uuid) to authenticated;
grant execute on function public.discard_message(uuid) to authenticated;
grant execute on function public.mark_message_sent(uuid, text, text) to authenticated;
grant execute on function public.mark_message_failed(uuid, text) to authenticated;
grant execute on function public.create_handoff(uuid, uuid, text, jsonb, text) to authenticated;

-- outreach_guard() tamamlanıyor: kanal bazlı soğuma artık conversations
-- üzerinden (docs/adr/0005'te vaat edildiği gibi). MAX_FOLLOWUPS hâlâ
-- ertelenmiştir (follow_ups tablosu Faz 8'de).
create or replace function public.outreach_guard(p_business_id uuid, p_channel text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_settings public.workspace_settings%rowtype;
  v_uid uuid := auth.uid();
  v_now_ist timestamp := now() at time zone 'Europe/Istanbul';
  v_dow integer := extract(isodow from v_now_ist)::integer;
  v_time time := v_now_ist::time;
  v_cooldown_hours integer;
  v_daily_total_limit integer;
  v_daily_channel_limit integer;
  v_today_contacted_count integer;
  v_today_channel_count integer;
  v_last_outbound timestamptz;
  v_reasons text[] := '{}';
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_business from public.businesses where id = p_business_id;
  if not found or not public.is_member(v_business.workspace_id) then
    raise exception 'business % not found or not accessible', p_business_id;
  end if;

  select * into v_settings from public.workspace_settings where workspace_id = v_business.workspace_id;

  if v_business.do_not_contact then
    v_reasons := array_append(v_reasons, 'DO_NOT_CONTACT');
  end if;

  if v_dow > 5 or v_time < time '09:00' or v_time > time '18:30' then
    v_reasons := array_append(v_reasons, 'OUTSIDE_SEND_WINDOW');
  end if;

  v_cooldown_hours := coalesce((v_settings.outreach_limits ->> 'channel_cooldown_hours')::integer, 72);
  select last_outbound_at into v_last_outbound
  from public.conversations
  where business_id = p_business_id and channel = p_channel;

  if v_last_outbound is not null and v_last_outbound > now() - make_interval(hours => v_cooldown_hours) then
    v_reasons := array_append(v_reasons, 'CHANNEL_COOLDOWN');
  end if;

  v_daily_total_limit := coalesce((v_settings.outreach_limits ->> 'daily_total')::integer, 40);
  select count(*)::integer into v_today_contacted_count
  from public.stage_transitions
  where workspace_id = v_business.workspace_id
    and to_stage = 'CONTACTED'
    and created_at >= date_trunc('day', v_now_ist) at time zone 'Europe/Istanbul';

  if v_today_contacted_count >= v_daily_total_limit then
    v_reasons := array_append(v_reasons, 'DAILY_OUTREACH_LIMIT');
  end if;

  v_daily_channel_limit := (v_settings.outreach_limits -> 'channels' ->> p_channel)::integer;
  if v_daily_channel_limit is not null then
    select count(*)::integer into v_today_channel_count
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where c.workspace_id = v_business.workspace_id
      and c.channel = p_channel
      and m.direction = 'OUT' and m.status = 'SENT'
      and m.sent_at >= date_trunc('day', v_now_ist) at time zone 'Europe/Istanbul';

    if v_today_channel_count >= v_daily_channel_limit then
      v_reasons := array_append(v_reasons, 'DAILY_CHANNEL_LIMIT');
    end if;
  end if;

  return jsonb_build_object(
    'allowed', array_length(v_reasons, 1) is null,
    'reasons', to_jsonb(v_reasons),
    'channel', p_channel
  );
end;
$$;
