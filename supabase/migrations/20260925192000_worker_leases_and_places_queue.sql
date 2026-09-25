-- Faz 3: worker_leases (tek aktif worker kilidi), enqueue_search_job (kota +
-- 30 gün tekrar uyarısı), Vault secret yönetimi (SPEC.md → G.1, P.3).

create extension if not exists supabase_vault;

create table public.worker_leases (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  job_type text not null,
  holder_device_id text not null,
  lease_until timestamptz not null,
  primary key (workspace_id, job_type)
);

alter table public.worker_leases enable row level security;
alter table public.worker_leases force row level security;

create policy worker_leases_select on public.worker_leases
  for select to authenticated
  using (public.is_member(workspace_id));

-- Yazma yalnızca acquire/release RPC'leri iledir.

create function public.acquire_worker_lease(
  ws uuid,
  p_job_type text,
  p_device_id text,
  p_ttl_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.worker_leases%rowtype;
begin
  if not public.is_member(ws) then
    raise exception 'not a member of this workspace';
  end if;

  select * into v_existing from public.worker_leases
    where workspace_id = ws and job_type = p_job_type for update;

  if found and v_existing.lease_until > now() and v_existing.holder_device_id <> p_device_id then
    return false;
  end if;

  insert into public.worker_leases (workspace_id, job_type, holder_device_id, lease_until)
  values (ws, p_job_type, p_device_id, now() + make_interval(secs => p_ttl_seconds))
  on conflict (workspace_id, job_type)
    do update set holder_device_id = excluded.holder_device_id, lease_until = excluded.lease_until;

  return true;
end;
$$;

create function public.release_worker_lease(ws uuid, p_job_type text, p_device_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.worker_leases
  where workspace_id = ws and job_type = p_job_type and holder_device_id = p_device_id;
end;
$$;

-- enqueue_search_job: aylık Places kotasını (workspace_settings.outreach_limits
-- .places_monthly_cap) kontrol eder, aşılmışsa reddeder; aynı params 30 gün
-- içinde tekrarlanmışsa engellemez ama repeatWarning=true döner (SPEC.md → G.1).
create function public.enqueue_search_job(ws uuid, p_params jsonb)
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

  select (outreach_limits -> 'places_monthly_cap')::integer into v_cap
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

-- Vault secret yönetimi: yalnızca admin yazar; Edge Function'lar dar bir
-- SECURITY DEFINER arayüzü üzerinden okur (vault.decrypted_secrets'a doğrudan
-- erişim yok — bkz. docs/adr/0004-places-vault.md).
create function public.admin_set_secret(ws uuid, p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_name text := ws::text || ':' || p_name;
  v_existing_id uuid;
begin
  if not public.is_admin(ws) then
    raise exception 'only ADMIN can manage secrets';
  end if;

  select id into v_existing_id from vault.decrypted_secrets where name = v_secret_name;

  if v_existing_id is not null then
    perform vault.update_secret(v_existing_id, p_value);
  else
    perform vault.create_secret(p_value, v_secret_name);
  end if;

  perform public.log_activity(
    ws, 'settings.secret_updated', 'workspace_settings', ws,
    format('%s anahtarı güncellendi', p_name), '{}'::jsonb
  );
end;
$$;

create function public.admin_get_secret_status(ws uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_value text;
begin
  if not public.is_admin(ws) then
    raise exception 'only ADMIN can view secret status';
  end if;

  select decrypted_secret into v_value
  from vault.decrypted_secrets where name = ws::text || ':' || p_name;

  if v_value is null then
    return jsonb_build_object('configured', false);
  end if;

  return jsonb_build_object('configured', true, 'last4', right(v_value, 4));
end;
$$;

-- Yalnızca service_role (Edge Function'lar) çağırabilir; authenticated/anon'a
-- kapalıdır.
create function public.internal_get_secret(ws uuid, p_name text)
returns text
language sql
security definer
stable
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = ws::text || ':' || p_name;
$$;

revoke execute on function public.acquire_worker_lease(uuid, text, text, integer) from public;
revoke execute on function public.release_worker_lease(uuid, text, text) from public;
revoke execute on function public.enqueue_search_job(uuid, jsonb) from public;
revoke execute on function public.admin_set_secret(uuid, text, text) from public;
revoke execute on function public.admin_get_secret_status(uuid, text) from public;
revoke execute on function public.internal_get_secret(uuid, text) from public, authenticated, anon;

grant execute on function public.acquire_worker_lease(uuid, text, text, integer) to authenticated;
grant execute on function public.release_worker_lease(uuid, text, text) to authenticated;
grant execute on function public.enqueue_search_job(uuid, jsonb) to authenticated;
grant execute on function public.admin_set_secret(uuid, text, text) to authenticated;
grant execute on function public.admin_get_secret_status(uuid, text) to authenticated;
grant execute on function public.internal_get_secret(uuid, text) to service_role;
