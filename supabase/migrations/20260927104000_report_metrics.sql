-- ADR 0007: Raporlar ekranı. Tarih aralığı (Europe/Istanbul günleri, en fazla
-- 366 gün) için özet, günlük seri, kaynak/kanal dağılımı, dönüşüm hunisi,
-- ekip performansı ve AI kullanımı. Yalnızca üyeler çağırabilir.

create function public.report_metrics(ws uuid, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
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
  v_from_ts := v_from::timestamp at time zone 'Europe/Istanbul';
  v_to_ts := (v_to + 1)::timestamp at time zone 'Europe/Istanbul';

  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'totals', public.metrics_period_counts(ws, v_from_ts, v_to_ts),
    'previous', public.metrics_period_counts(
      ws,
      (v_from - v_days)::timestamp at time zone 'Europe/Istanbul',
      v_from_ts
    ),
    'series', (
      select coalesce(jsonb_agg(
        jsonb_build_object('day', d.day) || public.metrics_period_counts(
          ws,
          d.day::timestamp at time zone 'Europe/Istanbul',
          (d.day + 1)::timestamp at time zone 'Europe/Istanbul'
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
        group by c.channel
      ) x
      where sent > 0 or replied > 0
    ),
    'funnel', jsonb_build_object(
      'found', (
        select count(*) from public.businesses
        where workspace_id = ws and merged_into is null and created_at >= v_from_ts and created_at < v_to_ts
      ),
      'contacted', (
        select count(distinct c.business_id)
        from public.messages m join public.conversations c on c.id = m.conversation_id
        where m.workspace_id = ws and m.direction = 'OUT' and m.status = 'SENT'
          and m.sent_at >= v_from_ts and m.sent_at < v_to_ts
      ),
      'replied', (
        select count(distinct c.business_id)
        from public.messages m join public.conversations c on c.id = m.conversation_id
        where m.workspace_id = ws and m.direction = 'IN' and m.created_at >= v_from_ts and m.created_at < v_to_ts
      ),
      'engaged', (
        select count(distinct business_id) from public.stage_transitions
        where workspace_id = ws and to_stage = 'ENGAGED' and created_at >= v_from_ts and created_at < v_to_ts
      ),
      'proposal', (
        select count(distinct business_id) from public.stage_transitions
        where workspace_id = ws and to_stage = 'PROPOSAL_READY' and created_at >= v_from_ts and created_at < v_to_ts
      ),
      'won', (
        select count(distinct business_id) from public.stage_transitions
        where workspace_id = ws and to_stage = 'WON' and created_at >= v_from_ts and created_at < v_to_ts
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
        select currency, sum(amount) as total from public.customer_deals
        where workspace_id = ws and status <> 'ENDED' and amount is not null
          and start_date between v_from and v_to
        group by currency
      ) x
    )
  );
end;
$$;

revoke execute on function public.report_metrics(uuid, date, date) from public, anon;
grant execute on function public.report_metrics(uuid, date, date) to authenticated;
