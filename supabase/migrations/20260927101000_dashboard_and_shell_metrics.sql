-- Yeni arayüzün (ADR 0007) üst çubuk rozetleri ve Dashboard grafikleri için
-- salt-okunur metrik RPC'leri. PostgREST gruplama yapamadığı için sayımlar
-- burada; yalnızca workspace üyeleri çağırabilir. Günler Europe/Istanbul'a göre.

create function public.metrics_period_counts(ws uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'found', (
      select count(*) from public.businesses
      where workspace_id = ws and merged_into is null and created_at >= p_from and created_at < p_to
    ),
    'sent', (
      select count(*) from public.messages
      where workspace_id = ws and direction = 'OUT' and status = 'SENT' and sent_at >= p_from and sent_at < p_to
    ),
    'replied', (
      select count(distinct c.business_id)
      from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.workspace_id = ws and m.direction = 'IN' and m.created_at >= p_from and m.created_at < p_to
    ),
    'engaged', (
      select count(*) from public.stage_transitions
      where workspace_id = ws and to_stage = 'ENGAGED' and created_at >= p_from and created_at < p_to
    ),
    'proposal', (
      select count(*) from public.stage_transitions
      where workspace_id = ws and to_stage = 'PROPOSAL_READY' and created_at >= p_from and created_at < p_to
    ),
    'won', (
      select count(*) from public.stage_transitions
      where workspace_id = ws and to_stage = 'WON' and created_at >= p_from and created_at < p_to
    )
  );
$$;

-- Yalnızca aşağıdaki SECURITY DEFINER fonksiyonlarının içinden çağrılır.
revoke execute on function public.metrics_period_counts(uuid, timestamptz, timestamptz) from public, anon, authenticated;

create function public.dashboard_metrics(ws uuid, p_days integer default 7)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 7), 90));
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_start date := v_today - (v_days - 1);
  v_start_ts timestamptz := v_start::timestamp at time zone 'Europe/Istanbul';
  v_end_ts timestamptz := (v_today + 1)::timestamp at time zone 'Europe/Istanbul';
  v_prev_ts timestamptz := (v_start - v_days)::timestamp at time zone 'Europe/Istanbul';
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
          d.day::timestamp at time zone 'Europe/Istanbul',
          (d.day + 1)::timestamp at time zone 'Europe/Istanbul'
        )
        order by d.day
      ), '[]'::jsonb)
      from (select generate_series(v_start, v_today, interval '1 day')::date as day) d
    ),
    'current', public.metrics_period_counts(ws, v_start_ts, v_end_ts),
    'previous', public.metrics_period_counts(ws, v_prev_ts, v_start_ts),
    'stageCounts', (
      select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb)
      from (
        select stage, count(*) as n from public.businesses
        where workspace_id = ws and merged_into is null
        group by stage
      ) s
    ),
    'totalBusinesses', (
      select count(*) from public.businesses where workspace_id = ws and merged_into is null
    )
  );
end;
$$;

revoke execute on function public.dashboard_metrics(uuid, integer) from public, anon;
grant execute on function public.dashboard_metrics(uuid, integer) to authenticated;

create function public.shell_counters(ws uuid)
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

  return jsonb_build_object(
    'awaitingReply', (
      select count(*) from public.conversations
      where workspace_id = ws and status = 'OPEN' and last_inbound_at is not null
        and (last_outbound_at is null or last_inbound_at > last_outbound_at)
    ),
    'overdueFollowUps', (
      select count(*) from public.follow_ups
      where workspace_id = ws and status in ('PENDING', 'DRAFTED') and due_at < now()
    ),
    'openHandoffs', (
      select count(*) from public.human_handoffs where workspace_id = ws and status = 'OPEN'
    )
  );
end;
$$;

revoke execute on function public.shell_counters(uuid) from public, anon;
grant execute on function public.shell_counters(uuid) to authenticated;
