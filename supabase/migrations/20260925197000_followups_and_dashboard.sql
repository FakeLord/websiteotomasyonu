-- Faz 8: follow_ups (SPEC.md → M), durma trigger'ları, analytics_summary()
-- RPC'si (Dashboard). due_at hesabı (`computeFollowUpDueDate`,
-- packages/core/followup) TS'de yapılır; bu RPC'ler yalnızca sonucu
-- doğrulayıp yazar ve sekans/durma kurallarını DB'de zorlar (CLAUDE.md #7).

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  step integer not null,
  due_at timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'DRAFTED', 'SENT', 'CANCELLED', 'SKIPPED')),
  cancel_reason text,
  message_id uuid references public.messages (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, step)
);

create index follow_ups_workspace_due_idx on public.follow_ups (workspace_id, due_at)
  where status in ('PENDING', 'DRAFTED');

alter table public.follow_ups enable row level security;
alter table public.follow_ups force row level security;

create policy follow_ups_select on public.follow_ups
  for select to authenticated using (public.is_member(workspace_id));

-- Yazma yalnızca RPC'lerledir (sekans/durma kuralları tek yerde).

create trigger follow_ups_write_log
  after insert or update on public.follow_ups
  for each row execute function public.kb_write_log();

-- Bir işletme için bekleyen follow-up'ları iptal eder (SPEC.md → M: durma
-- koşulları). `cancel_followups` doğrudan çağrılabilir ya da trigger'lardan
-- perform edilir.
create function public.cancel_followups(p_business_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
begin
  select workspace_id into v_ws from public.businesses where id = p_business_id;
  if v_ws is null then
    return;
  end if;

  update public.follow_ups
  set status = 'CANCELLED', cancel_reason = p_reason, updated_at = now()
  where business_id = p_business_id and status in ('PENDING', 'DRAFTED');
end;
$$;

revoke execute on function public.cancel_followups(uuid, text) from public;
grant execute on function public.cancel_followups(uuid, text) to authenticated, service_role;

-- Durma koşulu 1: yeni gelen mesaj (SPEC.md → M).
create function public.cancel_followups_on_inbound()
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
    if v_business_id is not null then
      perform public.cancel_followups(v_business_id, 'Yeni gelen mesaj');
    end if;
  end if;
  return new;
end;
$$;

create trigger messages_cancel_followups_on_inbound
  after insert on public.messages
  for each row execute function public.cancel_followups_on_inbound();

-- Durma koşulu 2: durma aşaması veya DNC (SPEC.md → M).
create function public.cancel_followups_on_business_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.do_not_contact and not old.do_not_contact then
    perform public.cancel_followups(new.id, 'DNC işaretlendi');
  elsif new.stage in ('ENGAGED', 'PROPOSAL_READY', 'HANDED_OFF', 'WON', 'LOST', 'DISQUALIFIED')
        and new.stage is distinct from old.stage then
    perform public.cancel_followups(new.id, format('Aşama %s''e geçti', new.stage));
  end if;
  return new;
end;
$$;

create trigger businesses_cancel_followups_on_change
  after update of stage, do_not_contact on public.businesses
  for each row execute function public.cancel_followups_on_business_change();

-- İlk adımı (step 1) veya bir sonraki adımı (step N+1) planlar. Durma
-- koşulları geçerliyse sessizce hiçbir şey yapmaz (SPEC.md → M).
create function public.schedule_next_followup(
  ws uuid,
  p_business_id uuid,
  p_conversation_id uuid,
  p_step integer,
  p_due_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_id uuid;
begin
  if auth.uid() is null or not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  select * into v_business from public.businesses where id = p_business_id and workspace_id = ws;
  if not found then
    raise exception 'business % not found in workspace %', p_business_id, ws;
  end if;

  if v_business.do_not_contact
     or v_business.stage in ('ENGAGED', 'PROPOSAL_READY', 'HANDED_OFF', 'WON', 'LOST', 'DISQUALIFIED') then
    return null;
  end if;

  insert into public.follow_ups (workspace_id, business_id, conversation_id, step, due_at)
  values (ws, p_business_id, p_conversation_id, p_step, p_due_at)
  on conflict (conversation_id, step) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.schedule_next_followup(uuid, uuid, uuid, integer, timestamptz) from public;
grant execute on function public.schedule_next_followup(uuid, uuid, uuid, integer, timestamptz) to authenticated;

create function public.mark_followup_sent(
  p_followup_id uuid,
  p_message_id uuid,
  p_next_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_followup public.follow_ups%rowtype;
  v_next_id uuid;
begin
  select * into v_followup from public.follow_ups where id = p_followup_id;
  if not found or not public.is_member(v_followup.workspace_id) then
    raise exception 'follow_up % not found or not accessible', p_followup_id;
  end if;

  update public.follow_ups
  set status = 'SENT', message_id = p_message_id, updated_at = now()
  where id = p_followup_id;

  if p_next_due_at is not null then
    v_next_id := public.schedule_next_followup(
      v_followup.workspace_id, v_followup.business_id, v_followup.conversation_id,
      v_followup.step + 1, p_next_due_at
    );
  end if;

  return jsonb_build_object('followUpId', p_followup_id, 'nextFollowUpId', v_next_id);
end;
$$;

create function public.mark_followup_drafted(p_followup_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_followup public.follow_ups%rowtype;
begin
  select * into v_followup from public.follow_ups where id = p_followup_id;
  if not found or not public.is_member(v_followup.workspace_id) then
    raise exception 'follow_up % not found or not accessible', p_followup_id;
  end if;
  if v_followup.status <> 'PENDING' then
    raise exception 'only a PENDING follow_up can be drafted';
  end if;

  update public.follow_ups
  set status = 'DRAFTED', message_id = p_message_id, updated_at = now()
  where id = p_followup_id;
end;
$$;

revoke execute on function public.mark_followup_drafted(uuid, uuid) from public;
grant execute on function public.mark_followup_drafted(uuid, uuid) to authenticated;

create function public.skip_followup(p_followup_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_followup public.follow_ups%rowtype;
begin
  select * into v_followup from public.follow_ups where id = p_followup_id;
  if not found or not public.is_member(v_followup.workspace_id) then
    raise exception 'follow_up % not found or not accessible', p_followup_id;
  end if;
  if v_followup.status not in ('PENDING', 'DRAFTED') then
    raise exception 'only a PENDING or DRAFTED follow_up can be skipped';
  end if;

  update public.follow_ups
  set status = 'SKIPPED', cancel_reason = p_reason, updated_at = now()
  where id = p_followup_id;
end;
$$;

create function public.snooze_followup(p_followup_id uuid, p_new_due_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_followup public.follow_ups%rowtype;
begin
  select * into v_followup from public.follow_ups where id = p_followup_id;
  if not found or not public.is_member(v_followup.workspace_id) then
    raise exception 'follow_up % not found or not accessible', p_followup_id;
  end if;
  if v_followup.status <> 'PENDING' then
    raise exception 'only a PENDING follow_up can be snoozed';
  end if;

  update public.follow_ups set due_at = p_new_due_at, updated_at = now() where id = p_followup_id;
end;
$$;

revoke execute on function public.mark_followup_sent(uuid, uuid, timestamptz) from public;
revoke execute on function public.skip_followup(uuid, text) from public;
revoke execute on function public.snooze_followup(uuid, timestamptz) from public;
grant execute on function public.mark_followup_sent(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.skip_followup(uuid, text) to authenticated;
grant execute on function public.snooze_followup(uuid, timestamptz) to authenticated;

-- Dashboard sayı kartları (SPEC.md → D). Tek bir sorgu ile toplanır ki
-- istemci N ayrı count() çağrısı yapmasın.
create function public.analytics_summary(ws uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_today timestamptz := date_trunc('day', now());
begin
  if not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  return jsonb_build_object(
    'newLeads', (select count(*) from public.businesses where workspace_id = ws and stage = 'NEW' and merged_into is null),
    'foundToday', (select count(*) from public.businesses where workspace_id = ws and merged_into is null and created_at >= v_today),
    'contacted', (select count(*) from public.businesses where workspace_id = ws and stage = 'CONTACTED' and merged_into is null),
    'replied', (select count(*) from public.businesses where workspace_id = ws and stage = 'REPLIED' and merged_into is null),
    'engaged', (select count(*) from public.businesses where workspace_id = ws and stage = 'ENGAGED' and merged_into is null),
    'proposalReady', (select count(*) from public.businesses where workspace_id = ws and stage = 'PROPOSAL_READY' and merged_into is null),
    'customers', (select count(*) from public.businesses where workspace_id = ws and stage = 'WON' and merged_into is null),
    'pendingFollowUps', (select count(*) from public.follow_ups where workspace_id = ws and status in ('PENDING', 'DRAFTED')),
    'overdueFollowUps', (select count(*) from public.follow_ups where workspace_id = ws and status in ('PENDING', 'DRAFTED') and due_at < now()),
    'openAiAssistedConversations', (
      select count(*) from public.conversations
      where workspace_id = ws and status = 'OPEN' and handled_by = 'AI_ASSISTED'
    )
  );
end;
$$;

revoke execute on function public.analytics_summary(uuid) from public;
grant execute on function public.analytics_summary(uuid) to authenticated;
