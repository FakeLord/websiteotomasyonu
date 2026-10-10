-- ADR 0017: Türkiye dışındaki işletmeye e-posta, yönetici açıkça izin verene kadar kapalıdır.
-- Ülke bazlı uyum kuralları (G5) gelene kadar geçici ama kalıcı güvenli varsayılan.
--   kural: kanal EMAIL + businesses.country_code <> 'TR' + workspace_settings.outreach_limits.allow_foreign_email
--          true değil (anahtar yoksa kapalı) → 'FOREIGN_EMAIL_DISABLED' sebebi.
--   asistanlı kanallar (WhatsApp, Instagram, ...) etkilenmez.
-- Fonksiyonun geri kalanı 20260929102000_outreach_guard_tz.sql ile aynıdır.

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
  v_window jsonb;
  v_biz_tz text;
  v_ws_tz text;
  v_local timestamp;
  v_dow integer;
  v_time time;
  v_days integer[];
  v_from time;
  v_to time;
  v_ws_now timestamp;
  v_cooldown_hours integer;
  v_daily_total_limit integer;
  v_daily_channel_limit integer;
  v_today_contacted_count integer;
  v_today_channel_count integer;
  v_last_outbound timestamptz;
  v_last_inbound timestamptz;
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

  v_window := coalesce(v_settings.followup_policy -> 'sendWindow', '{}'::jsonb);

  v_biz_tz := coalesce(v_business.timezone, v_window ->> 'tz', 'Europe/Istanbul');
  if not exists (select 1 from pg_timezone_names where name = v_biz_tz) then
    v_biz_tz := 'Europe/Istanbul';
  end if;

  v_ws_tz := coalesce(v_settings.timezone, 'Europe/Istanbul');
  if not exists (select 1 from pg_timezone_names where name = v_ws_tz) then
    v_ws_tz := 'Europe/Istanbul';
  end if;

  v_local := now() at time zone v_biz_tz;
  v_dow := extract(isodow from v_local)::integer;
  v_time := v_local::time;

  select coalesce(array_agg(d::integer), array[1, 2, 3, 4, 5])
    into v_days
  from jsonb_array_elements_text(
    case when jsonb_typeof(v_window -> 'days') = 'array' and jsonb_array_length(v_window -> 'days') > 0
         then v_window -> 'days' else '[1,2,3,4,5]'::jsonb end
  ) as d;
  v_from := coalesce(nullif(v_window ->> 'from', '')::time, time '09:00');
  v_to := coalesce(nullif(v_window ->> 'to', '')::time, time '18:30');

  if v_business.do_not_contact then
    v_reasons := array_append(v_reasons, 'DO_NOT_CONTACT');
  end if;

  if p_channel = 'EMAIL'
    and v_business.country_code is distinct from 'TR'
    and coalesce((v_settings.outreach_limits ->> 'allow_foreign_email')::boolean, false) is not true
  then
    v_reasons := array_append(v_reasons, 'FOREIGN_EMAIL_DISABLED');
  end if;

  if not (v_dow = any (v_days)) or v_time < v_from or v_time > v_to then
    v_reasons := array_append(v_reasons, 'OUTSIDE_SEND_WINDOW');
  end if;

  v_cooldown_hours := coalesce((v_settings.outreach_limits ->> 'channel_cooldown_hours')::integer, 72);
  select last_outbound_at, last_inbound_at into v_last_outbound, v_last_inbound
  from public.conversations
  where business_id = p_business_id and channel = p_channel;

  if v_last_outbound is not null
    and v_last_outbound > now() - make_interval(hours => v_cooldown_hours)
    and (v_last_inbound is null or v_last_inbound <= v_last_outbound)
  then
    v_reasons := array_append(v_reasons, 'CHANNEL_COOLDOWN');
  end if;

  v_ws_now := now() at time zone v_ws_tz;

  v_daily_total_limit := coalesce((v_settings.outreach_limits ->> 'daily_total')::integer, 40);
  select count(*)::integer into v_today_contacted_count
  from public.stage_transitions
  where workspace_id = v_business.workspace_id
    and to_stage = 'CONTACTED'
    and created_at >= date_trunc('day', v_ws_now) at time zone v_ws_tz;

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
      and m.sent_at >= date_trunc('day', v_ws_now) at time zone v_ws_tz;

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
