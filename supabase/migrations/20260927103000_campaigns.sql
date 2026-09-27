-- ADR 0007: Kampanyalar (SPEC → D'de Faz 11'di). Otomatik gönderim YOK:
-- kampanya bir hedef segment + kanal + üye listesidir; mesajlar mevcut taslak →
-- insan onayı → mark_message_sent akışıyla gönderilir. Üye durumu bu akıştan
-- trigger'larla (SENT, REPLIED) güncellenir.

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 1000),
  channel text not null check (channel in ('EMAIL', 'INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'LINKEDIN', 'TIKTOK')),
  segment jsonb not null default '{}'::jsonb,
  followup_steps integer not null default 2 check (followup_steps between 0 and 5),
  daily_limit integer not null default 20 check (daily_limit between 1 and 200),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_workspace_idx on public.campaigns (workspace_id, created_at desc);

create table public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'DRAFTED', 'SENT', 'REPLIED', 'SKIPPED')),
  skip_reason text,
  conversation_id uuid references public.conversations (id) on delete set null,
  sent_at timestamptz,
  replied_at timestamptz,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, business_id)
);

create index campaign_members_business_idx on public.campaign_members (business_id);
create index campaign_members_campaign_status_idx on public.campaign_members (campaign_id, status);

alter table public.campaigns enable row level security;
alter table public.campaigns force row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_members force row level security;

create policy campaigns_select on public.campaigns
  for select to authenticated using (public.is_member(workspace_id));
create policy campaign_members_select on public.campaign_members
  for select to authenticated using (public.is_member(workspace_id));

-- Yazma yalnızca aşağıdaki RPC'ler ve trigger'larla.
revoke insert, update, delete on public.campaigns from authenticated, anon;
revoke insert, update, delete on public.campaign_members from authenticated, anon;

create function public.create_campaign(
  ws uuid,
  p_name text,
  p_description text,
  p_channel text,
  p_segment jsonb,
  p_followup_steps integer,
  p_daily_limit integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  insert into public.campaigns (workspace_id, name, description, channel, segment, followup_steps, daily_limit, created_by)
  values (
    ws, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_channel,
    coalesce(p_segment, '{}'::jsonb), coalesce(p_followup_steps, 2), coalesce(p_daily_limit, 20), auth.uid()
  )
  returning id into v_id;

  perform public.log_activity(ws, 'campaign.created', 'campaign', v_id, format('Kampanya oluşturuldu: %s', trim(p_name)), '{}'::jsonb);
  return v_id;
end;
$$;

create function public.set_campaign_status(p_campaign_id uuid, p_status text)
returns public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.campaigns%rowtype;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if not found or not public.is_member(v_campaign.workspace_id) then
    raise exception 'campaign % not found or not accessible', p_campaign_id;
  end if;

  if not (
    (v_campaign.status = 'DRAFT' and p_status = 'ACTIVE') or
    (v_campaign.status = 'ACTIVE' and p_status in ('PAUSED', 'COMPLETED')) or
    (v_campaign.status = 'PAUSED' and p_status in ('ACTIVE', 'COMPLETED'))
  ) then
    raise exception 'invalid campaign status transition % -> %', v_campaign.status, p_status;
  end if;

  update public.campaigns set status = p_status, updated_at = now()
  where id = p_campaign_id
  returning * into v_campaign;

  perform public.log_activity(
    v_campaign.workspace_id, 'campaign.status_changed', 'campaign', p_campaign_id,
    format('%s kampanyasının durumu %s oldu', v_campaign.name, p_status), jsonb_build_object('status', p_status)
  );
  return v_campaign;
end;
$$;

-- Segmente uyan işletmeleri kampanyaya ekler: DNC, birleştirilmiş, kapanmış
-- (WON/LOST/DISQUALIFIED) işletmeler ve kampanya kanalında geçerli iletişim
-- kanalı olmayanlar alınmaz. Eklenen sayıyı döner.
create function public.populate_campaign_members(p_campaign_id uuid, p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_segment jsonb;
  v_added integer;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id;
  if not found or not public.is_member(v_campaign.workspace_id) then
    raise exception 'campaign % not found or not accessible', p_campaign_id;
  end if;
  if v_campaign.status = 'COMPLETED' then
    raise exception 'cannot add members to a completed campaign';
  end if;

  v_segment := v_campaign.segment;

  with candidates as (
    select b.id
    from public.businesses b
    where b.workspace_id = v_campaign.workspace_id
      and b.merged_into is null
      and b.do_not_contact = false
      and b.stage not in ('WON', 'LOST', 'DISQUALIFIED')
      and (nullif(v_segment ->> 'city', '') is null or b.city ilike v_segment ->> 'city')
      and (nullif(v_segment ->> 'district', '') is null or b.district ilike v_segment ->> 'district')
      and (nullif(v_segment ->> 'category', '') is null or b.category ilike '%' || (v_segment ->> 'category') || '%')
      and (v_segment -> 'minScore' is null or jsonb_typeof(v_segment -> 'minScore') <> 'number'
           or b.lead_score >= (v_segment ->> 'minScore')::integer)
      and (
        coalesce(jsonb_array_length(case when jsonb_typeof(v_segment -> 'websiteStatuses') = 'array' then v_segment -> 'websiteStatuses' end), 0) = 0
        or b.website_status in (select jsonb_array_elements_text(v_segment -> 'websiteStatuses'))
      )
      and (
        coalesce(jsonb_array_length(case when jsonb_typeof(v_segment -> 'stages') = 'array' then v_segment -> 'stages' end), 0) = 0
        or b.stage in (select jsonb_array_elements_text(v_segment -> 'stages'))
      )
      and exists (
        select 1 from public.contact_channels cc
        where cc.business_id = b.id and cc.channel = v_campaign.channel and cc.status not in ('INVALID', 'BOUNCED')
      )
      and not exists (
        select 1 from public.campaign_members m where m.campaign_id = p_campaign_id and m.business_id = b.id
      )
    order by b.lead_score desc
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  ), inserted as (
    insert into public.campaign_members (workspace_id, campaign_id, business_id)
    select v_campaign.workspace_id, p_campaign_id, id from candidates
    returning 1
  )
  select count(*) into v_added from inserted;

  update public.campaigns set updated_at = now() where id = p_campaign_id;

  perform public.log_activity(
    v_campaign.workspace_id, 'campaign.members_added', 'campaign', p_campaign_id,
    format('%s kampanyasına %s işletme eklendi', v_campaign.name, v_added), jsonb_build_object('added', v_added)
  );
  return v_added;
end;
$$;

create function public.set_campaign_member_status(p_member_id uuid, p_status text, p_skip_reason text default null)
returns public.campaign_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.campaign_members%rowtype;
begin
  select * into v_member from public.campaign_members where id = p_member_id for update;
  if not found or not public.is_member(v_member.workspace_id) then
    raise exception 'campaign member % not found or not accessible', p_member_id;
  end if;

  -- SENT/REPLIED yalnızca gerçek mesaj akışından (trigger) gelir.
  if not (
    (v_member.status = 'QUEUED' and p_status in ('DRAFTED', 'SKIPPED')) or
    (v_member.status = 'DRAFTED' and p_status in ('QUEUED', 'SKIPPED')) or
    (v_member.status = 'SKIPPED' and p_status = 'QUEUED')
  ) then
    raise exception 'invalid campaign member transition % -> %', v_member.status, p_status;
  end if;

  update public.campaign_members
  set status = p_status,
      skip_reason = case when p_status = 'SKIPPED' then nullif(trim(coalesce(p_skip_reason, '')), '') end,
      updated_at = now()
  where id = p_member_id
  returning * into v_member;

  return v_member;
end;
$$;

revoke execute on function public.create_campaign(uuid, text, text, text, jsonb, integer, integer) from public, anon;
revoke execute on function public.set_campaign_status(uuid, text) from public, anon;
revoke execute on function public.populate_campaign_members(uuid, integer) from public, anon;
revoke execute on function public.set_campaign_member_status(uuid, text, text) from public, anon;
grant execute on function public.create_campaign(uuid, text, text, text, jsonb, integer, integer) to authenticated;
grant execute on function public.set_campaign_status(uuid, text) to authenticated;
grant execute on function public.populate_campaign_members(uuid, integer) to authenticated;
grant execute on function public.set_campaign_member_status(uuid, text, text) to authenticated;

-- Mesaj akışından kampanya ilerlemesi: aktif kampanyadaki üyeye, kampanya
-- kanalında giden bir mesaj SENT olunca SENT; o işletmeden cevap gelince REPLIED.
create function public.campaign_members_track_messages()
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
  elsif new.direction = 'IN' and tg_op = 'INSERT' then
    update public.campaign_members
    set status = 'REPLIED', replied_at = now(), updated_at = now()
    where business_id = v_conversation.business_id and status = 'SENT';
  end if;

  return new;
end;
$$;

create trigger messages_track_campaign_members
  after insert or update of status on public.messages
  for each row execute function public.campaign_members_track_messages();

-- Kampanya kartlarındaki ilerleme sayaçları.
create function public.campaign_stats(ws uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  return coalesce((
    select jsonb_object_agg(campaign_id, counts)
    from (
      select campaign_id, jsonb_build_object(
        'total', count(*),
        'queued', count(*) filter (where status = 'QUEUED'),
        'drafted', count(*) filter (where status = 'DRAFTED'),
        'sent', count(*) filter (where status in ('SENT', 'REPLIED')),
        'replied', count(*) filter (where status = 'REPLIED'),
        'skipped', count(*) filter (where status = 'SKIPPED'),
        'lastSentAt', max(sent_at)
      ) as counts
      from public.campaign_members
      where workspace_id = ws
      group by campaign_id
    ) s
  ), '{}'::jsonb);
end;
$$;

revoke execute on function public.campaign_stats(uuid) from public, anon;
grant execute on function public.campaign_stats(uuid) to authenticated;

-- Ekranlar arası anlık güncelleme (ADR 0003 ilkesi: bu tablolardan istemci
-- yolu ile DELETE yapılmaz). activity_logs zaten yalnızca INSERT alır.
alter publication supabase_realtime add table public.campaigns, public.campaign_members, public.customer_deals, public.activity_logs;
alter table public.campaigns replica identity full;
alter table public.campaign_members replica identity full;
alter table public.customer_deals replica identity full;
