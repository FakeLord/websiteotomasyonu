-- Faz 3-8 doğrulama: enqueue_search_job(), workspace_settings.outreach_limits
-- içinde varsayılan olarak explicit JSON null olan places_monthly_cap'i
-- `->` (jsonb) ile okuyup doğrudan ::integer'a cast ediyordu; jsonb 'null'
-- değeri integer'a cast edilemediği için "cannot cast jsonb null to type
-- integer" hatası veriyordu. `->>` (text) kullanmak JSON null'u SQL NULL'a
-- çevirir ve cast güvenli hale gelir. Fonksiyonun geri kalanı değişmedi.
create or replace function public.enqueue_search_job(ws uuid, p_params jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_job_id uuid;
  v_cap integer;
  v_used integer;
  v_repeat_warning boolean;
begin
  if v_uid is null or not public.is_member(ws) then
    raise exception 'not a member of this workspace';
  end if;

  select (outreach_limits ->> 'places_monthly_cap')::integer into v_cap
  from public.workspace_settings where workspace_id = ws;

  if v_cap is not null then
    select coalesce(sum(api_calls), 0) into v_used
    from public.search_jobs
    where workspace_id = ws and provider = 'GOOGLE_PLACES'
      and created_at >= date_trunc('month', now());

    if v_used >= v_cap then
      raise exception 'quota_exceeded: monthly Places cap reached (%)', v_cap;
    end if;
  end if;

  v_repeat_warning := exists (
    select 1 from public.search_jobs
    where workspace_id = ws and provider = 'GOOGLE_PLACES'
      and params = p_params
      and created_at >= now() - interval '30 days'
  );

  insert into public.search_jobs (workspace_id, provider, params, status, requested_by)
  values (ws, 'GOOGLE_PLACES', p_params, 'QUEUED', v_uid)
  returning id into v_job_id;

  perform public.log_activity(
    ws, 'search.enqueued', 'search_job', v_job_id,
    'Google Places araması kuyruğa alındı', p_params
  );

  return jsonb_build_object('jobId', v_job_id, 'repeatWarning', v_repeat_warning);
end;
$$;
