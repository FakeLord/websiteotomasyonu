-- ADR 0016: elle yapılan temasların (Instagram DM, WhatsApp, arama, e-posta) kaydı ve aşama takibi.
-- "İletişime geç" menüsünden bir adres açıldığında log_contact_attempt() kayıt düşer; kullanıcı sonucu
-- set_contact_attempt_outcome() ile bildirir ve aşama (stage) ilerler. Tüm yazma RPC ile yapılır; istemci doğrudan
-- yazamaz (CLAUDE.md #3, #5, #8).

-- ---------------------------------------------------------------------------------------------------------------
-- businesses: son temasın özeti (liste süzgeçleri için). İstemci güncelleyemez (kolon bazlı UPDATE yetkisi beyaz liste).
alter table public.businesses
  add column last_contact_channel text,
  add column last_contact_outcome text,
  add column last_contact_by uuid references public.profiles (id);

-- ---------------------------------------------------------------------------------------------------------------
create table public.contact_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel text not null check (channel in ('EMAIL', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'PHONE')),
  -- Açılan adres (e-posta, numara, @kullanıcı); kullanıcı sonradan neye yazdığını görebilsin.
  address text not null check (length(address) between 1 and 300),
  outcome text not null default 'ATTEMPTED'
    check (outcome in ('ATTEMPTED', 'SENT', 'REPLIED', 'UNREACHABLE', 'NOT_INTERESTED', 'LATER', 'CANCELLED')),
  note text check (note is null or length(note) <= 1000),
  follow_up_at timestamptz,
  created_by uuid references public.profiles (id),
  -- clock_timestamp: aynı işlemde açılan temaslar da sıralanabilsin ("son temas" belirsiz kalmasın).
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now()
);

create index contact_attempts_business_idx on public.contact_attempts (business_id, created_at desc);
create index contact_attempts_workspace_idx on public.contact_attempts (workspace_id, created_at desc);

alter table public.contact_attempts enable row level security;
alter table public.contact_attempts force row level security;

create policy contact_attempts_select on public.contact_attempts
  for select to authenticated using (public.is_member(workspace_id));

revoke insert, update, delete on public.contact_attempts from authenticated, anon;

-- ---------------------------------------------------------------------------------------------------------------
-- businesses.last_contacted_at ve last_contact_* alanlarını kalan kaynaklardan yeniden hesaplar
-- (vazgeçilen temas silinmiş sayılır). Kaynaklar: iptal edilmemiş temaslar ve gönderilmiş giden mesajlar.
create function public.refresh_last_contact(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.contact_attempts%rowtype;
  v_message_at timestamptz;
begin
  select * into v_attempt from public.contact_attempts
  where business_id = p_business_id and outcome <> 'CANCELLED'
  order by created_at desc limit 1;

  select max(m.sent_at) into v_message_at
  from public.messages m join public.conversations c on c.id = m.conversation_id
  where c.business_id = p_business_id and m.direction = 'OUT' and m.status = 'SENT';

  update public.businesses
  set last_contacted_at = greatest(v_attempt.created_at, v_message_at),
      last_contact_channel = v_attempt.channel,
      last_contact_outcome = v_attempt.outcome,
      last_contact_by = v_attempt.created_by
  where id = p_business_id;
end;
$$;

revoke execute on function public.refresh_last_contact(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Aşamayı geçerli adımlarla ilerletir (her adım stage_transitions ve activity_logs'a yazılır). `p_path` adımlardır.
create function public.advance_stage_path(p_business_id uuid, p_path text[], p_reason text, p_lost_reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_next text;
  v_uid uuid := auth.uid();
begin
  select * into v_business from public.businesses where id = p_business_id for update;
  foreach v_next in array p_path loop
    if not public.is_valid_stage_transition(v_business.stage, v_next) then
      raise exception 'invalid_transition: % -> %', v_business.stage, v_next;
    end if;

    update public.businesses
    set stage = v_next, version = version + 1, updated_at = now(),
        lost_reason = case when v_next = 'LOST' then p_lost_reason else null end
    where id = p_business_id;

    -- clock_timestamp: aynı işlemdeki ardışık adımlar zaman çizelgesinde doğru sırada görünsün.
    insert into public.stage_transitions (workspace_id, business_id, from_stage, to_stage, reason, actor_type, actor_user_id, created_at)
    values (v_business.workspace_id, p_business_id, v_business.stage, v_next, p_reason, case when v_uid is not null then 'USER' else 'SYSTEM' end, v_uid, clock_timestamp());

    perform public.log_activity(
      v_business.workspace_id, 'lead.stage_changed', 'business', p_business_id,
      format('Stage: %s → %s', v_business.stage, v_next),
      jsonb_build_object('from', v_business.stage, 'to', v_next, 'reason', p_reason)
    );
    v_business.stage := v_next;
  end loop;
  return v_business.stage;
end;
$$;

revoke execute on function public.advance_stage_path(uuid, text[], text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Temas kaydı: bağlantı açıldığı anda çağrılır (sonuç henüz bilinmez: ATTEMPTED).
create function public.log_contact_attempt(p_business_id uuid, p_channel text, p_address text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_business public.businesses%rowtype;
  v_id uuid;
begin
  select * into v_business from public.businesses where id = p_business_id;
  if v_uid is null or not found or not public.is_member(v_business.workspace_id) then
    raise exception 'business not found';
  end if;
  if v_business.do_not_contact then
    raise exception 'business is marked do_not_contact';
  end if;

  insert into public.contact_attempts (workspace_id, business_id, channel, address, created_by)
  values (v_business.workspace_id, p_business_id, p_channel, p_address, v_uid)
  returning id into v_id;

  perform public.refresh_last_contact(p_business_id);

  perform public.log_activity(
    v_business.workspace_id, 'contact.attempted', 'business', p_business_id,
    format('İletişime geçildi: %s', p_channel),
    jsonb_build_object('channel', p_channel, 'attemptId', v_id)
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Sonuç bildirimi. Aşama ilerlemesi packages/core/pipeline/contact-outcome.ts (stagePathForOutcome) ile aynı kuraldır.
-- Varsayılan takip tarihi: SENT +3 gün, UNREACHABLE +2 gün; REPLIED / NOT_INTERESTED takibi temizler; LATER tarih ister.
create function public.set_contact_attempt_outcome(
  p_attempt_id uuid,
  p_outcome text,
  p_note text default null,
  p_follow_up_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.contact_attempts%rowtype;
  v_business public.businesses%rowtype;
  v_path text[];
  v_next_action timestamptz;
  v_set_next boolean := true;
begin
  select * into v_attempt from public.contact_attempts where id = p_attempt_id for update;
  if v_uid is null or not found or not public.is_member(v_attempt.workspace_id) then
    raise exception 'contact attempt not found';
  end if;
  if p_outcome not in ('ATTEMPTED', 'SENT', 'REPLIED', 'UNREACHABLE', 'NOT_INTERESTED', 'LATER', 'CANCELLED') then
    raise exception 'invalid outcome %', p_outcome;
  end if;
  if v_attempt.outcome = 'CANCELLED' then
    raise exception 'contact attempt is cancelled';
  end if;
  -- Vazgeçme yalnızca henüz sonuç girilmemiş temasta geçerlidir; ilerlemiş bir aşama geri alınmaz.
  if p_outcome = 'CANCELLED' and v_attempt.outcome <> 'ATTEMPTED' then
    raise exception 'only an attempt without an outcome can be cancelled';
  end if;
  if p_outcome = 'LATER' and (p_follow_up_at is null or p_follow_up_at < now() - interval '5 minutes') then
    raise exception 'follow_up_at is required and must not be in the past';
  end if;

  select * into v_business from public.businesses where id = v_attempt.business_id for update;

  v_path := case
    when p_outcome = 'SENT' and v_business.stage = 'NEW' then array['QUALIFIED', 'OUTREACH_READY', 'CONTACTED']
    when p_outcome = 'SENT' and v_business.stage = 'QUALIFIED' then array['OUTREACH_READY', 'CONTACTED']
    when p_outcome = 'SENT' and v_business.stage = 'OUTREACH_READY' then array['CONTACTED']
    when p_outcome = 'REPLIED' and v_business.stage = 'NEW' then array['QUALIFIED', 'OUTREACH_READY', 'CONTACTED', 'REPLIED']
    when p_outcome = 'REPLIED' and v_business.stage = 'QUALIFIED' then array['OUTREACH_READY', 'CONTACTED', 'REPLIED']
    when p_outcome = 'REPLIED' and v_business.stage = 'OUTREACH_READY' then array['CONTACTED', 'REPLIED']
    when p_outcome = 'REPLIED' and v_business.stage = 'CONTACTED' then array['REPLIED']
    when p_outcome = 'NOT_INTERESTED' and v_business.stage = 'NEW' then array['QUALIFIED', 'OUTREACH_READY', 'CONTACTED', 'LOST']
    when p_outcome = 'NOT_INTERESTED' and v_business.stage = 'QUALIFIED' then array['OUTREACH_READY', 'CONTACTED', 'LOST']
    when p_outcome = 'NOT_INTERESTED' and v_business.stage = 'OUTREACH_READY' then array['CONTACTED', 'LOST']
    when p_outcome = 'NOT_INTERESTED' and v_business.stage in ('CONTACTED', 'REPLIED', 'ENGAGED', 'HANDED_OFF') then array['LOST']
    else array[]::text[]
  end;

  update public.contact_attempts
  set outcome = p_outcome, note = coalesce(nullif(trim(p_note), ''), note),
      follow_up_at = case when p_outcome = 'LATER' then p_follow_up_at else follow_up_at end,
      updated_at = now()
  where id = p_attempt_id;

  if coalesce(array_length(v_path, 1), 0) > 0 then
    perform public.advance_stage_path(
      v_attempt.business_id, v_path,
      format('Elle temas: %s', v_attempt.channel),
      case when p_outcome = 'NOT_INTERESTED' then 'NOT_INTERESTED' end
    );
  end if;

  v_next_action := case
    when p_outcome = 'LATER' then p_follow_up_at
    when p_outcome = 'SENT' then coalesce(p_follow_up_at, now() + interval '3 days')
    when p_outcome = 'UNREACHABLE' then coalesce(p_follow_up_at, now() + interval '2 days')
    when p_outcome in ('REPLIED', 'NOT_INTERESTED') then null
    else null
  end;
  v_set_next := p_outcome in ('LATER', 'SENT', 'UNREACHABLE', 'REPLIED', 'NOT_INTERESTED');

  if v_set_next then
    update public.businesses set next_action_at = v_next_action where id = v_attempt.business_id;
  end if;

  perform public.refresh_last_contact(v_attempt.business_id);

  perform public.log_activity(
    v_attempt.workspace_id, 'contact.outcome', 'business', v_attempt.business_id,
    format('Temas sonucu: %s (%s)', p_outcome, v_attempt.channel),
    jsonb_build_object('channel', v_attempt.channel, 'outcome', p_outcome, 'attemptId', p_attempt_id)
  );

  select * into v_business from public.businesses where id = v_attempt.business_id;
  return jsonb_build_object('stage', v_business.stage, 'nextActionAt', v_business.next_action_at, 'version', v_business.version);
end;
$$;

revoke execute on function public.log_contact_attempt(uuid, text, text) from public, anon;
revoke execute on function public.set_contact_attempt_outcome(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.log_contact_attempt(uuid, text, text) to authenticated;
grant execute on function public.set_contact_attempt_outcome(uuid, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Raporlar: kanala göre elle yapılan temaslar. Dönem ve pazar filtresi uygulanır; vazgeçilenler sayılmaz.
create function public.contact_attempt_stats(
  ws uuid, p_from date, p_to date, p_country text default null, p_city text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text := public.workspace_timezone(ws);
  v_from_ts timestamptz := least(p_from, p_to)::timestamp at time zone v_tz;
  v_to_ts timestamptz := (greatest(p_from, p_to) + 1)::timestamp at time zone v_tz;
begin
  if not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.attempts desc)
    from (
      select
        a.channel,
        count(*) as attempts,
        count(*) filter (where a.outcome in ('SENT', 'REPLIED', 'NOT_INTERESTED')) as written,
        count(*) filter (where a.outcome = 'REPLIED') as replied,
        count(*) filter (where a.outcome = 'NOT_INTERESTED') as not_interested,
        count(*) filter (where a.outcome = 'UNREACHABLE') as unreachable
      from public.contact_attempts a
      where a.workspace_id = ws and a.outcome <> 'CANCELLED'
        and a.created_at >= v_from_ts and a.created_at < v_to_ts
        and public.in_market(a.business_id, p_country, p_city)
      group by a.channel
    ) r
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.contact_attempt_stats(uuid, date, date, text, text) from public, anon;
grant execute on function public.contact_attempt_stats(uuid, date, date, text, text) to authenticated;
