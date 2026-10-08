-- ADR 0014: otomatik müşteri bulma — Adım 1 (tarama planı + sunucuda zorlanan aylık Places sayacı).
--
-- 1) places_usage: çalışma alanı × ay başına gerçek Google çağrı sayısı. Sayaç istemcinin bildirdiği
--    search_jobs.api_calls değil, places-search Edge Function'ının her çağrıdan ÖNCE tükettiği sayaçtır
--    (consume_places_call, yalnızca service_role). İstemci güvenilmez kalır; sınır aşılamaz.
-- 2) scan_plans / scan_tiles: şehir sınırı kategoriye göre karelere bölünerek taranır. Kareler RPC ile
--    "claim" edilir (FOR UPDATE SKIP LOCKED + süreli sahiplik): iki cihaz aynı kareyi alamaz.
-- Yazma yalnızca RPC'lerle; tablolar authenticated için salt okunurdur (RLS: is_member).

-- ---------------------------------------------------------------------------------------------------
-- 1) Aylık Places sayacı
-- ---------------------------------------------------------------------------------------------------
create table public.places_usage (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Ayın ilk günü (UTC). Google faturayı Pasifik saatiyle keser; ay sınırında birkaç saatlik kayma kabul edilir.
  month date not null,
  calls integer not null default 0 check (calls >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, month)
);

alter table public.places_usage enable row level security;
alter table public.places_usage force row level security;

create policy places_usage_select on public.places_usage
  for select to authenticated using (public.is_member(workspace_id));

revoke insert, update, delete on public.places_usage from authenticated, anon;

-- Bu aya kadarki kullanım, eski sayaçtan (search_jobs.api_calls) devralınır.
insert into public.places_usage (workspace_id, month, calls)
select workspace_id, date_trunc('month', now())::date, coalesce(sum(api_calls), 0)::integer
from public.search_jobs
where provider = 'GOOGLE_PLACES' and created_at >= date_trunc('month', now())
group by workspace_id
having coalesce(sum(api_calls), 0) > 0;

create function public.places_monthly_cap(ws uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (outreach_limits ->> 'places_monthly_cap')::integer
  from public.workspace_settings where workspace_id = ws;
$$;

create function public.places_calls_this_month(ws uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select calls from public.places_usage where workspace_id = ws and month = date_trunc('month', now())::date),
    0
  );
$$;

-- Yalnızca service_role (places-search Edge Function). Sınır dolduysa sayaç ARTMAZ ve allowed=false döner;
-- fonksiyon bu durumda Google'a hiç gitmez.
create function public.consume_places_call(ws uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_cap integer := public.places_monthly_cap(ws);
  v_calls integer;
begin
  insert into public.places_usage (workspace_id, month, calls)
  values (ws, v_month, 0)
  on conflict (workspace_id, month) do nothing;

  select calls into v_calls from public.places_usage
  where workspace_id = ws and month = v_month
  for update;

  if v_cap is not null and v_calls >= v_cap then
    return jsonb_build_object('allowed', false, 'used', v_calls, 'cap', v_cap);
  end if;

  update public.places_usage set calls = calls + 1, updated_at = now()
  where workspace_id = ws and month = v_month;

  return jsonb_build_object('allowed', true, 'used', v_calls + 1, 'cap', v_cap);
end;
$$;

-- Arayüz sayacı ("Bu ay 124/1.000 çağrı").
create function public.places_usage_status(ws uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_member(ws) then
    raise exception 'not a member of this workspace';
  end if;
  return jsonb_build_object('used', public.places_calls_this_month(ws), 'cap', public.places_monthly_cap(ws));
end;
$$;

-- Elle arama da aynı sayaca bakar (eskiden istemcinin bildirdiği search_jobs.api_calls toplamına bakıyordu).
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
  v_repeat_warning boolean;
begin
  if v_uid is null or not public.is_member(ws) then
    raise exception 'not a member of this workspace';
  end if;

  v_cap := public.places_monthly_cap(ws);
  if v_cap is not null and public.places_calls_this_month(ws) >= v_cap then
    raise exception 'quota_exceeded: monthly Places cap reached (%)', v_cap;
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

-- ---------------------------------------------------------------------------------------------------
-- 2) Tarama planı ve kareler
-- ---------------------------------------------------------------------------------------------------
create table public.scan_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  city text not null check (length(trim(city)) between 1 and 120),
  low_lat double precision not null,
  low_lng double precision not null,
  high_lat double precision not null,
  high_lng double precision not null,
  -- [{ "label": "Oto Servis", "query": "Auto repair shop" }, ...]
  categories jsonb not null check (jsonb_typeof(categories) = 'array'),
  -- Otomatik taslakların dili (ADR 0013: varsayılan yok, plan başına kullanıcı seçer).
  language text not null check (language in ('tr', 'en')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED', 'BUDGET_PAUSED', 'DONE', 'CANCELLED')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scan_plans_bounds_valid check (
    low_lat >= -90 and high_lat <= 90 and low_lng >= -180 and high_lng <= 180
    and low_lat < high_lat and low_lng < high_lng
  )
);

create index scan_plans_workspace_idx on public.scan_plans (workspace_id, created_at desc);

create table public.scan_tiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_id uuid not null references public.scan_plans (id) on delete cascade,
  category_label text not null,
  text_query text not null check (length(trim(text_query)) between 1 and 200),
  low_lat double precision not null,
  low_lng double precision not null,
  high_lat double precision not null,
  high_lng double precision not null,
  depth integer not null default 0 check (depth between 0 and 6),
  status text not null default 'QUEUED' check (status in ('QUEUED', 'RUNNING', 'DONE', 'SPLIT', 'FAILED')),
  result_count integer not null default 0,
  new_count integer not null default 0,
  api_calls integer not null default 0,
  attempts integer not null default 0,
  error text,
  claimed_by text,
  claimed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scan_tiles_bounds_valid check (low_lat < high_lat and low_lng < high_lng)
);

create index scan_tiles_plan_status_idx on public.scan_tiles (plan_id, status);
create index scan_tiles_claim_idx on public.scan_tiles (workspace_id, status, depth, created_at);

alter table public.scan_plans enable row level security;
alter table public.scan_plans force row level security;
alter table public.scan_tiles enable row level security;
alter table public.scan_tiles force row level security;

create policy scan_plans_select on public.scan_plans
  for select to authenticated using (public.is_member(workspace_id));
create policy scan_tiles_select on public.scan_tiles
  for select to authenticated using (public.is_member(workspace_id));

revoke insert, update, delete on public.scan_plans from authenticated, anon;
revoke insert, update, delete on public.scan_tiles from authenticated, anon;

-- Plan oluşturur ve her kategori için kök kareyi (şehir sınırı) kuyruğa alır.
-- ADR 0014: aylık çağrı sınırı tanımlı değilken tarama başlatılamaz.
create function public.create_scan_plan(
  ws uuid,
  p_country text,
  p_city text,
  p_bounds jsonb,
  p_categories jsonb,
  p_language text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan_id uuid;
  v_count integer;
begin
  if v_uid is null or not public.is_member(ws) then
    raise exception 'not a member of this workspace';
  end if;
  if public.places_monthly_cap(ws) is null then
    raise exception 'budget_required: monthly Places cap must be set before scanning';
  end if;
  if jsonb_typeof(p_categories) is distinct from 'array' then
    raise exception 'categories must be an array';
  end if;

  v_count := jsonb_array_length(p_categories);
  if v_count < 1 or v_count > 30 then
    raise exception 'categories must contain between 1 and 30 items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_categories) c
    where coalesce(length(trim(c ->> 'query')), 0) = 0 or coalesce(length(trim(c ->> 'label')), 0) = 0
  ) then
    raise exception 'each category needs a label and a query';
  end if;

  insert into public.scan_plans (
    workspace_id, country_code, city, low_lat, low_lng, high_lat, high_lng, categories, language, created_by
  ) values (
    ws, upper(p_country), trim(p_city),
    (p_bounds -> 'low' ->> 'lat')::double precision, (p_bounds -> 'low' ->> 'lng')::double precision,
    (p_bounds -> 'high' ->> 'lat')::double precision, (p_bounds -> 'high' ->> 'lng')::double precision,
    p_categories, p_language, v_uid
  )
  returning id into v_plan_id;

  insert into public.scan_tiles (workspace_id, plan_id, category_label, text_query, low_lat, low_lng, high_lat, high_lng)
  select ws, v_plan_id, trim(c ->> 'label'), trim(c ->> 'query'), p.low_lat, p.low_lng, p.high_lat, p.high_lng
  from jsonb_array_elements(p_categories) c
  cross join public.scan_plans p
  where p.id = v_plan_id;

  perform public.log_activity(
    ws, 'scan.plan_created', 'scan_plan', v_plan_id,
    format('%s için tarama planı oluşturuldu (%s kategori)', trim(p_city), v_count),
    jsonb_build_object('country', upper(p_country), 'city', trim(p_city), 'categories', v_count)
  );

  return v_plan_id;
end;
$$;

-- Sıradaki kareyi bu cihaza verir (yoksa null). Önce sığ kareler: şehir genelinden ayrıntıya iner.
-- Sahipliği dolmuş RUNNING kareler yeniden verilir; 3 kez yarım kalan kare FAILED olur.
-- Sınır yükseltildiyse veya yeni aya geçildiyse BUDGET_PAUSED planlar kendiliğinden sürer.
create function public.claim_next_scan_tile(ws uuid, p_device_id text, p_ttl_seconds integer default 180)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer;
  v_tile public.scan_tiles%rowtype;
  v_plan public.scan_plans%rowtype;
begin
  if not public.is_member(ws) then
    raise exception 'not a member of this workspace';
  end if;

  v_cap := public.places_monthly_cap(ws);
  if v_cap is null or public.places_calls_this_month(ws) < v_cap then
    update public.scan_plans set status = 'ACTIVE', updated_at = now()
    where workspace_id = ws and status = 'BUDGET_PAUSED';
  end if;

  update public.scan_tiles
  set status = 'FAILED', error = 'Üç denemede tamamlanamadı', claimed_by = null, claimed_until = null, updated_at = now()
  where workspace_id = ws and status = 'RUNNING' and claimed_until < now() and attempts >= 3;

  select t.* into v_tile
  from public.scan_tiles t
  join public.scan_plans p on p.id = t.plan_id
  where t.workspace_id = ws
    and p.status = 'ACTIVE'
    and (t.status = 'QUEUED' or (t.status = 'RUNNING' and t.claimed_until < now()))
  order by t.depth, t.created_at
  limit 1
  for update of t skip locked;

  if not found then
    return null;
  end if;

  update public.scan_tiles
  set status = 'RUNNING', claimed_by = p_device_id,
      claimed_until = now() + make_interval(secs => p_ttl_seconds),
      attempts = attempts + 1, updated_at = now()
  where id = v_tile.id;

  select * into v_plan from public.scan_plans where id = v_tile.plan_id;

  return jsonb_build_object(
    'tileId', v_tile.id,
    'planId', v_tile.plan_id,
    'categoryLabel', v_tile.category_label,
    'textQuery', v_tile.text_query,
    'depth', v_tile.depth,
    'bounds', jsonb_build_object(
      'low', jsonb_build_object('lat', v_tile.low_lat, 'lng', v_tile.low_lng),
      'high', jsonb_build_object('lat', v_tile.high_lat, 'lng', v_tile.high_lng)
    ),
    'countryCode', v_plan.country_code,
    'city', v_plan.city
  );
end;
$$;

-- Kareyi kapatır. p_outcome:
--   'DONE'   : tamamlandı.
--   'SPLIT'  : kare dolu döndü; dört çeyrek kuyruğa alınır (bölme kararı packages/core/discovery/tiling.ts'tedir,
--              burada yalnızca derinlik sınırı ve geometri zorlanır). En fazla derinlikte DONE'a düşer.
--   'QUOTA'  : aylık sınır doldu; kare kuyruğa geri döner (deneme sayılmaz), plan BUDGET_PAUSED olur.
--   'FAILED' : hata; kare FAILED olur, plan diğer karelerle sürer.
create function public.complete_scan_tile(
  p_tile_id uuid,
  p_device_id text,
  p_outcome text,
  p_result_count integer default 0,
  p_new_count integer default 0,
  p_api_calls integer default 0,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tile public.scan_tiles%rowtype;
  v_mid_lat double precision;
  v_mid_lng double precision;
  v_split boolean := false;
  v_plan_done boolean := false;
begin
  select * into v_tile from public.scan_tiles where id = p_tile_id for update;
  if not found or not public.is_member(v_tile.workspace_id) then
    raise exception 'scan tile not found';
  end if;
  if v_tile.status <> 'RUNNING' or v_tile.claimed_by is distinct from p_device_id then
    raise exception 'scan tile is not claimed by this device';
  end if;
  if p_outcome not in ('DONE', 'SPLIT', 'QUOTA', 'FAILED') then
    raise exception 'invalid outcome %', p_outcome;
  end if;

  if p_outcome = 'QUOTA' then
    update public.scan_tiles
    set status = 'QUEUED', claimed_by = null, claimed_until = null,
        attempts = greatest(attempts - 1, 0), api_calls = api_calls + greatest(p_api_calls, 0), updated_at = now()
    where id = p_tile_id;
    update public.scan_plans set status = 'BUDGET_PAUSED', updated_at = now()
    where id = v_tile.plan_id and status = 'ACTIVE';
    return jsonb_build_object('split', false, 'planDone', false, 'budgetPaused', true);
  end if;

  if p_outcome = 'FAILED' then
    update public.scan_tiles
    set status = 'FAILED', error = left(coalesce(p_error, 'Bilinmeyen hata'), 500), claimed_by = null, claimed_until = null,
        api_calls = api_calls + greatest(p_api_calls, 0), updated_at = now()
    where id = p_tile_id;
  else
    v_split := p_outcome = 'SPLIT' and v_tile.depth < 6;

    update public.scan_tiles
    set status = case when v_split then 'SPLIT' else 'DONE' end,
        result_count = greatest(p_result_count, 0), new_count = greatest(p_new_count, 0),
        api_calls = api_calls + greatest(p_api_calls, 0),
        claimed_by = null, claimed_until = null, error = null, updated_at = now()
    where id = p_tile_id;

    if v_split then
      v_mid_lat := (v_tile.low_lat + v_tile.high_lat) / 2;
      v_mid_lng := (v_tile.low_lng + v_tile.high_lng) / 2;
      insert into public.scan_tiles (
        workspace_id, plan_id, category_label, text_query, low_lat, low_lng, high_lat, high_lng, depth
      ) values
        (v_tile.workspace_id, v_tile.plan_id, v_tile.category_label, v_tile.text_query, v_tile.low_lat, v_tile.low_lng, v_mid_lat, v_mid_lng, v_tile.depth + 1),
        (v_tile.workspace_id, v_tile.plan_id, v_tile.category_label, v_tile.text_query, v_tile.low_lat, v_mid_lng, v_mid_lat, v_tile.high_lng, v_tile.depth + 1),
        (v_tile.workspace_id, v_tile.plan_id, v_tile.category_label, v_tile.text_query, v_mid_lat, v_tile.low_lng, v_tile.high_lat, v_mid_lng, v_tile.depth + 1),
        (v_tile.workspace_id, v_tile.plan_id, v_tile.category_label, v_tile.text_query, v_mid_lat, v_mid_lng, v_tile.high_lat, v_tile.high_lng, v_tile.depth + 1);
    end if;
  end if;

  if not exists (
    select 1 from public.scan_tiles where plan_id = v_tile.plan_id and status in ('QUEUED', 'RUNNING')
  ) then
    update public.scan_plans set status = 'DONE', updated_at = now()
    where id = v_tile.plan_id and status = 'ACTIVE';
    v_plan_done := found;
    if v_plan_done then
      perform public.log_activity(
        v_tile.workspace_id, 'scan.plan_done', 'scan_plan', v_tile.plan_id, 'Tarama planı tamamlandı', '{}'::jsonb
      );
    end if;
  end if;

  return jsonb_build_object('split', v_split, 'planDone', v_plan_done, 'budgetPaused', false);
end;
$$;

-- Duraklat / sürdür / iptal. Tamamlanmış veya iptal edilmiş plan yeniden açılamaz.
create function public.set_scan_plan_status(p_plan_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.scan_plans%rowtype;
begin
  select * into v_plan from public.scan_plans where id = p_plan_id for update;
  if not found or not public.is_member(v_plan.workspace_id) then
    raise exception 'scan plan not found';
  end if;
  if p_status not in ('ACTIVE', 'PAUSED', 'CANCELLED') then
    raise exception 'invalid status %', p_status;
  end if;
  if v_plan.status in ('DONE', 'CANCELLED') then
    raise exception 'scan plan is already finished';
  end if;

  update public.scan_plans set status = p_status, updated_at = now() where id = p_plan_id;

  perform public.log_activity(
    v_plan.workspace_id, 'scan.plan_status', 'scan_plan', p_plan_id,
    format('Tarama planı durumu: %s', p_status), jsonb_build_object('from', v_plan.status, 'to', p_status)
  );
end;
$$;

-- İşler kutusu için plan başına ilerleme (son 20 plan).
create function public.scan_plan_progress(ws uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_member(ws) then
    raise exception 'not a member of this workspace';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(x) order by x."createdAt" desc)
    from (
      select
        p.id, p.city, p.country_code as "countryCode", p.status, p.language, p.created_at as "createdAt",
        jsonb_array_length(p.categories) as "categoryCount",
        count(t.id) as "tilesTotal",
        count(t.id) filter (where t.status in ('DONE', 'SPLIT', 'FAILED')) as "tilesFinished",
        count(t.id) filter (where t.status = 'FAILED') as "tilesFailed",
        coalesce(sum(t.new_count), 0) as "newBusinesses",
        coalesce(sum(t.api_calls), 0) as "apiCalls",
        (select t2.error from public.scan_tiles t2 where t2.plan_id = p.id and t2.status = 'FAILED' order by t2.updated_at desc limit 1) as "lastError"
      from public.scan_plans p
      left join public.scan_tiles t on t.plan_id = p.id
      where p.workspace_id = ws
      group by p.id
      order by p.created_at desc
      limit 20
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.places_monthly_cap(uuid) from public, authenticated, anon;
revoke execute on function public.places_calls_this_month(uuid) from public, authenticated, anon;
revoke execute on function public.consume_places_call(uuid) from public, authenticated, anon;
revoke execute on function public.places_usage_status(uuid) from public;
revoke execute on function public.create_scan_plan(uuid, text, text, jsonb, jsonb, text) from public;
revoke execute on function public.claim_next_scan_tile(uuid, text, integer) from public;
revoke execute on function public.complete_scan_tile(uuid, text, text, integer, integer, integer, text) from public;
revoke execute on function public.set_scan_plan_status(uuid, text) from public;
revoke execute on function public.scan_plan_progress(uuid) from public;

grant execute on function public.consume_places_call(uuid) to service_role;
grant execute on function public.places_usage_status(uuid) to authenticated;
grant execute on function public.create_scan_plan(uuid, text, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.claim_next_scan_tile(uuid, text, integer) to authenticated;
grant execute on function public.complete_scan_tile(uuid, text, text, integer, integer, integer, text) to authenticated;
grant execute on function public.set_scan_plan_status(uuid, text) to authenticated;
grant execute on function public.scan_plan_progress(uuid) to authenticated;
