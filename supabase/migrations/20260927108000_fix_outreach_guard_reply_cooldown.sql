-- Hata düzeltmesi: kanal soğuması (channel_cooldown_hours) soğuk erişim içindir
-- (SPEC.md → I.5). İşletme son giden mesajımızdan SONRA cevap verdiyse,
-- cevabımızı soğuma süresi dolmadan gönderebilmeliyiz; önceki sürüm müşteri
-- "ilgileniyoruz" yazsa bile yanıtı 72 saat engelliyordu. Fonksiyonun geri
-- kalanı 20260925196000_conversations.sql ile aynıdır.

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

  if v_business.do_not_contact then
    v_reasons := array_append(v_reasons, 'DO_NOT_CONTACT');
  end if;

  if v_dow > 5 or v_time < time '09:00' or v_time > time '18:30' then
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
