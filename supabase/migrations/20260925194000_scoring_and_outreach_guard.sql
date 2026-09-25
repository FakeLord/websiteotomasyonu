-- Faz 5: update_lead_score() RPC (lead_score/score_breakdown/scoring_version
-- Faz 2'den beri REVOKE UPDATE'li — bu RPC onları yazan tek yol) ve
-- outreach_guard() RPC (SPEC.md → I.5). Skor hesaplama mantığının kendisi
-- packages/core/scoring'dedir (saf TS); bu RPC yalnızca sonucu doğrulayıp
-- yazar (CLAUDE.md #5, #7).
--
-- NOT: outreach_guard() bu fazda yalnızca şu an var olan verilerle
-- zorlanabilen kontrolleri yapar: DO_NOT_CONTACT, gönderim saatleri, kanal
-- soğuma (businesses.last_contacted_at üzerinden, henüz kanal bazlı değil) ve
-- günlük limit (stage_transitions'daki CONTACTED geçişleri proxy olarak
-- kullanılır). DUPLICATE_MESSAGE_PROTECTION ve MAX_FOLLOWUPS, messages/
-- conversations ve follow_ups tabloları (Faz 7/8) olmadan anlamlı şekilde
-- uygulanamaz; bu kontroller o fazlarda CREATE OR REPLACE ile tamamlanacak
-- (bkz. docs/adr/0005-scoring-and-outreach-guard.md).

create function public.update_lead_score(
  ws uuid,
  p_business_id uuid,
  p_score integer,
  p_score_breakdown jsonb,
  p_scoring_version integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  if not exists (select 1 from public.businesses where id = p_business_id and workspace_id = ws) then
    raise exception 'business % not found in workspace %', p_business_id, ws;
  end if;

  if p_score < 0 or p_score > 100 then
    raise exception 'score must be between 0 and 100';
  end if;

  update public.businesses
  set lead_score = p_score,
      score_breakdown = p_score_breakdown,
      scoring_version = p_scoring_version,
      updated_at = now()
  where id = p_business_id and workspace_id = ws;
end;
$$;

revoke execute on function public.update_lead_score(uuid, uuid, integer, jsonb, integer) from public;
grant execute on function public.update_lead_score(uuid, uuid, integer, jsonb, integer) to authenticated;

create function public.outreach_guard(p_business_id uuid, p_channel text)
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
  v_today_contacted_count integer;
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
  if v_business.last_contacted_at is not null
     and v_business.last_contacted_at > now() - make_interval(hours => v_cooldown_hours) then
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

  return jsonb_build_object(
    'allowed', array_length(v_reasons, 1) is null,
    'reasons', to_jsonb(v_reasons),
    'channel', p_channel
  );
end;
$$;

revoke execute on function public.outreach_guard(uuid, text) from public;
grant execute on function public.outreach_guard(uuid, text) to authenticated;
