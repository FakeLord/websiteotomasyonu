-- G2 (ADR 0012): pazar filtresi (ülke → şehir) ve ekibin saat dilimi.
-- - dashboard_metrics, report_metrics, analytics_summary isteğe bağlı p_country / p_city alır (null = tüm pazarlar).
-- - Gün sınırları sabit 'Europe/Istanbul' yerine workspace_settings.timezone'dan gelir (varsayılan aynı).
-- - market_options(ws): pazar seçicisini besleyen (ülke, şehir, adet) listesi.
-- - populate_campaign_members segmentte 'country' anahtarını da süzer.
-- - customer_deals.currency GBP/CAD/AUD kabul eder.
-- Eski imzalar kaldırılır; yeni imzalar `default null` ile eski çağrılarla uyumludur.
-- shell_counters ve campaign_stats ekip geneli bildirimlerdir, pazar filtresi uygulanmaz.

-- Ekibin geçerli saat dilimi (geçersiz/boş ad İstanbul'a düşer).
create function public.workspace_timezone(ws uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.timezone from public.workspace_settings s
     where s.workspace_id = ws and exists (select 1 from pg_timezone_names n where n.name = s.timezone)),
    'Europe/Istanbul'
  );
$$;

-- İşletme seçili pazarda mı? İki parametre de null ise her işletme geçer.
create function public.in_market(p_business_id uuid, p_country text, p_city text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (p_country is null and p_city is null)
    or exists (
      select 1 from public.businesses b
      where b.id = p_business_id
        and (p_country is null or b.country_code = p_country)
        and (p_city is null or b.city = p_city)
    );
$$;

revoke execute on function public.workspace_timezone(uuid) from public, anon, authenticated;
revoke execute on function public.in_market(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
drop function public.metrics_period_counts(uuid, timestamptz, timestamptz);

create function public.metrics_period_counts(
  ws uuid, p_from timestamptz, p_to timestamptz, p_country text default null, p_city text default null
)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'found', (
      select count(*) from public.businesses b
      where b.workspace_id = ws and b.merged_into is null and b.created_at >= p_from and b.created_at < p_to
        and (p_country is null or b.country_code = p_country) and (p_city is null or b.city = p_city)
    ),
    'sent', (
      select count(*) from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.workspace_id = ws and m.direction = 'OUT' and m.status = 'SENT' and m.sent_at >= p_from and m.sent_at < p_to
        and public.in_market(c.business_id, p_country, p_city)
    ),
    'replied', (
      select count(distinct c.business_id)
      from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.workspace_id = ws and m.direction = 'IN' and m.created_at >= p_from and m.created_at < p_to
        and public.in_market(c.business_id, p_country, p_city)
    ),
    'engaged', (
      select count(*) from public.stage_transitions t
      where t.workspace_id = ws and t.to_stage = 'ENGAGED' and t.created_at >= p_from and t.created_at < p_to
        and public.in_market(t.business_id, p_country, p_city)
    ),
    'proposal', (
      select count(*) from public.stage_transitions t
      where t.workspace_id = ws and t.to_stage = 'PROPOSAL_READY' and t.created_at >= p_from and t.created_at < p_to
        and public.in_market(t.business_id, p_country, p_city)
    ),
    'won', (
      select count(*) from public.stage_transitions t
      where t.workspace_id = ws and t.to_stage = 'WON' and t.created_at >= p_from and t.created_at < p_to
        and public.in_market(t.business_id, p_country, p_city)
    )
  );
$$;

revoke execute on function public.metrics_period_counts(uuid, timestamptz, timestamptz, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
drop function public.dashboard_metrics(uuid, integer);

create function public.dashboard_metrics(
  ws uuid, p_days integer default 7, p_country text default null, p_city text default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_tz text := public.workspace_timezone(ws);
  v_days integer := greatest(1, least(coalesce(p_days, 7), 90));
  v_today date := (now() at time zone v_tz)::date;
  v_start date := v_today - (v_days - 1);
  v_start_ts timestamptz := v_start::timestamp at time zone v_tz;
  v_end_ts timestamptz := (v_today + 1)::timestamp at time zone v_tz;
  v_prev_ts timestamptz := (v_start - v_days)::timestamp at time zone v_tz;
begin
  if not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  return jsonb_build_object(
    'days', v_days,
    'series', (
      select coalesce(jsonb_agg(
        jsonb_build_object('day', d.day) || public.metrics_period_counts(
          ws,
          d.day::timestamp at time zone v_tz,
          (d.day + 1)::timestamp at time zone v_tz,
          p_country, p_city
        )
        order by d.day
      ), '[]'::jsonb)
      from (select generate_series(v_start, v_today, interval '1 day')::date as day) d
    ),
    'current', public.metrics_period_counts(ws, v_start_ts, v_end_ts, p_country, p_city),
    'previous', public.metrics_period_counts(ws, v_prev_ts, v_start_ts, p_country, p_city),
    'stageCounts', (
      select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb)
      from (
        select b.stage, count(*) as n from public.businesses b
        where b.workspace_id = ws and b.merged_into is null
          and (p_country is null or b.country_code = p_country) and (p_city is null or b.city = p_city)
        group by b.stage
      ) s
    ),
    'totalBusinesses', (
      select count(*) from public.businesses b
      where b.workspace_id = ws and b.merged_into is null
        and (p_country is null or b.country_code = p_country) and (p_city is null or b.city = p_city)
    )
  );
end;
$$;

revoke execute on function public.dashboard_metrics(uuid, integer, text, text) from public, anon;
grant execute on function public.dashboard_metrics(uuid, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
drop function public.report_metrics(uuid, date, date);

create function public.report_metrics(
  ws uuid, p_from date, p_to date, p_country text default null, p_city text default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_tz text := public.workspace_timezone(ws);
  v_from date := least(p_from, p_to);
  v_to date := greatest(p_from, p_to);
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_days integer;
begin
  if not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;
  if v_to - v_from > 366 then
    raise exception 'date range too large (max 366 days)';
  end if;

  v_days := v_to - v_from + 1;
  v_from_ts := v_from::timestamp at time zone v_tz;
  v_to_ts := (v_to + 1)::timestamp at time zone v_tz;

  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'totals', public.metrics_period_counts(ws, v_from_ts, v_to_ts, p_country, p_city),
    'previous', public.metrics_period_counts(
      ws,
      (v_from - v_days)::timestamp at time zone v_tz,
      v_from_ts,
      p_country, p_city
    ),
    'series', (
      select coalesce(jsonb_agg(
        jsonb_build_object('day', d.day) || public.metrics_period_counts(
          ws,
          d.day::timestamp at time zone v_tz,
          (d.day + 1)::timestamp at time zone v_tz,
          p_country, p_city
        )
        order by d.day
      ), '[]'::jsonb)
      from (select generate_series(v_from, v_to, interval '1 day')::date as day) d
    ),
    'bySource', (
      select coalesce(jsonb_object_agg(source, n), '{}'::jsonb)
      from (
        select s.source, count(distinct s.business_id) as n
        from public.business_sources s
        join public.businesses b on b.id = s.business_id and b.merged_into is null
        where s.workspace_id = ws and s.first_seen_at >= v_from_ts and s.first_seen_at < v_to_ts
          and (p_country is null or b.country_code = p_country) and (p_city is null or b.city = p_city)
        group by s.source
      ) x
    ),
    'byChannel', (
      select coalesce(jsonb_object_agg(channel, jsonb_build_object('sent', sent, 'replied', replied)), '{}'::jsonb)
      from (
        select c.channel,
          count(*) filter (where m.direction = 'OUT' and m.status = 'SENT' and m.sent_at >= v_from_ts and m.sent_at < v_to_ts) as sent,
          count(*) filter (where m.direction = 'IN' and m.created_at >= v_from_ts and m.created_at < v_to_ts) as replied
        from public.messages m
        join public.conversations c on c.id = m.conversation_id
        where m.workspace_id = ws
          and public.in_market(c.business_id, p_country, p_city)
        group by c.channel
      ) x
      where sent > 0 or replied > 0
    ),
    'funnel', jsonb_build_object(
      'found', (
        select count(*) from public.businesses b
        where b.workspace_id = ws and b.merged_into is null and b.created_at >= v_from_ts and b.created_at < v_to_ts
          and (p_country is null or b.country_code = p_country) and (p_city is null or b.city = p_city)
      ),
      'contacted', (
        select count(distinct c.business_id)
        from public.messages m join public.conversations c on c.id = m.conversation_id
        where m.workspace_id = ws and m.direction = 'OUT' and m.status = 'SENT'
          and m.sent_at >= v_from_ts and m.sent_at < v_to_ts
          and public.in_market(c.business_id, p_country, p_city)
      ),
      'replied', (
        select count(distinct c.business_id)
        from public.messages m join public.conversations c on c.id = m.conversation_id
        where m.workspace_id = ws and m.direction = 'IN' and m.created_at >= v_from_ts and m.created_at < v_to_ts
          and public.in_market(c.business_id, p_country, p_city)
      ),
      'engaged', (
        select count(distinct t.business_id) from public.stage_transitions t
        where t.workspace_id = ws and t.to_stage = 'ENGAGED' and t.created_at >= v_from_ts and t.created_at < v_to_ts
          and public.in_market(t.business_id, p_country, p_city)
      ),
      'proposal', (
        select count(distinct t.business_id) from public.stage_transitions t
        where t.workspace_id = ws and t.to_stage = 'PROPOSAL_READY' and t.created_at >= v_from_ts and t.created_at < v_to_ts
          and public.in_market(t.business_id, p_country, p_city)
      ),
      'won', (
        select count(distinct t.business_id) from public.stage_transitions t
        where t.workspace_id = ws and t.to_stage = 'WON' and t.created_at >= v_from_ts and t.created_at < v_to_ts
          and public.in_market(t.business_id, p_country, p_city)
      )
    ),
    'team', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'userId', wm.user_id,
        'name', coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)),
        'role', wm.role,
        'assigned', (
          select count(*) from public.businesses b
          where b.workspace_id = ws and b.assigned_to = wm.user_id and b.merged_into is null
        ),
        'sent', (
          select count(*) from public.messages m
          where m.workspace_id = ws and m.author_user_id = wm.user_id and m.direction = 'OUT' and m.status = 'SENT'
            and m.sent_at >= v_from_ts and m.sent_at < v_to_ts
        ),
        'won', (
          select count(*) from public.stage_transitions t
          where t.workspace_id = ws and t.actor_user_id = wm.user_id and t.to_stage = 'WON'
            and t.created_at >= v_from_ts and t.created_at < v_to_ts
        ),
        'activities', (
          select count(*) from public.activity_logs a
          where a.workspace_id = ws and a.actor_user_id = wm.user_id
            and a.created_at >= v_from_ts and a.created_at < v_to_ts
        )
      ) order by wm.created_at), '[]'::jsonb)
      from public.workspace_members wm
      join auth.users u on u.id = wm.user_id
      left join public.profiles p on p.id = wm.user_id
      where wm.workspace_id = ws
    ),
    'aiUsage', (
      select coalesce(jsonb_agg(jsonb_build_object('provider', provider, 'status', status, 'count', n)), '[]'::jsonb)
      from (
        select provider, status, count(*) as n from public.ai_runs
        where workspace_id = ws and created_at >= v_from_ts and created_at < v_to_ts
        group by provider, status
      ) x
    ),
    'revenue', (
      select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb)
      from (
        select d.currency, sum(d.amount) as total from public.customer_deals d
        where d.workspace_id = ws and d.status <> 'ENDED' and d.amount is not null
          and d.start_date between v_from and v_to
          and public.in_market(d.business_id, p_country, p_city)
        group by d.currency
      ) x
    )
  );
end;
$$;

revoke execute on function public.report_metrics(uuid, date, date, text, text) from public, anon;
grant execute on function public.report_metrics(uuid, date, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
drop function public.analytics_summary(uuid);

create function public.analytics_summary(ws uuid, p_country text default null, p_city text default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_tz text := public.workspace_timezone(ws);
  v_today timestamptz := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
begin
  if not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  return jsonb_build_object(
    'newLeads', (select count(*) from public.businesses b where b.workspace_id = ws and b.stage = 'NEW' and b.merged_into is null
      and (p_country is null or b.country_code = p_country) and (p_city is null or b.city = p_city)),
    'foundToday', (select count(*) from public.businesses b where b.workspace_id = ws and b.merged_into is null and b.created_at >= v_today
      and (p_country is null or b.country_code = p_country) and (p_city is null or b.city = p_city)),
    'contacted', (select count(*) from public.businesses b where b.workspace_id = ws and b.stage = 'CONTACTED' and b.merged_into is null
      and (p_country is null or b.country_code = p_country) and (p_city is null or b.city = p_city)),
    'replied', (select count(*) from public.businesses b where b.workspace_id = ws and b.stage = 'REPLIED' and b.merged_into is null
      and (p_country is null or b.country_code = p_country) and (p_city is null or b.city = p_city)),
    'engaged', (select count(*) from public.businesses b where b.workspace_id = ws and b.stage = 'ENGAGED' and b.merged_into is null
      and (p_country is null or b.country_code = p_country) and (p_city is null or b.city = p_city)),
    'proposalReady', (select count(*) from public.businesses b where b.workspace_id = ws and b.stage = 'PROPOSAL_READY' and b.merged_into is null
      and (p_country is null or b.country_code = p_country) and (p_city is null or b.city = p_city)),
    'customers', (select count(*) from public.businesses b where b.workspace_id = ws and b.stage = 'WON' and b.merged_into is null
      and (p_country is null or b.country_code = p_country) and (p_city is null or b.city = p_city)),
    'pendingFollowUps', (select count(*) from public.follow_ups f where f.workspace_id = ws and f.status in ('PENDING', 'DRAFTED')
      and public.in_market(f.business_id, p_country, p_city)),
    'overdueFollowUps', (select count(*) from public.follow_ups f where f.workspace_id = ws and f.status in ('PENDING', 'DRAFTED') and f.due_at < now()
      and public.in_market(f.business_id, p_country, p_city)),
    'openAiAssistedConversations', (
      select count(*) from public.conversations c
      where c.workspace_id = ws and c.status = 'OPEN' and c.handled_by = 'AI_ASSISTED'
        and public.in_market(c.business_id, p_country, p_city)
    )
  );
end;
$$;

revoke execute on function public.analytics_summary(uuid, text, text) from public;
grant execute on function public.analytics_summary(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Pazar seçicisi: çalışma alanındaki (ülke, şehir, adet) kırılımı.
create function public.market_options(ws uuid)
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
    select jsonb_agg(jsonb_build_object('country', country_code, 'city', city, 'count', n) order by n desc, country_code, city)
    from (
      select b.country_code, b.city, count(*) as n
      from public.businesses b
      where b.workspace_id = ws and b.merged_into is null
      group by b.country_code, b.city
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.market_options(uuid) from public, anon;
grant execute on function public.market_options(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Kampanya segmenti 'country' anahtarını da süzer (20260927103000'daki gövde, tek satır eklenerek).
create or replace function public.populate_campaign_members(p_campaign_id uuid, p_limit integer default 200)
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
      and (nullif(v_segment ->> 'country', '') is null or b.country_code = v_segment ->> 'country')
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

-- ---------------------------------------------------------------------------------------------------------------
-- Anlaşma para birimi: ilk pazarların para birimleri.
alter table public.customer_deals drop constraint customer_deals_currency_check;
alter table public.customer_deals
  add constraint customer_deals_currency_check check (currency in ('TRY', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'));
