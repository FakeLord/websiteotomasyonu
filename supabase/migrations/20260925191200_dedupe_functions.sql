-- Faz 2: dedupe RPC'leri (SPEC.md → G.4 eşleştirme sırası, tier 1-5 kesin,
-- tier 6 bulanık isim benzerliği ≥ 0,9 "olası duplicate").
-- Manuel ekleme de aynı import_business() RPC'sinden geçer (source='MANUAL'),
-- ayrı bir create_manual_business fonksiyonuna gerek yoktur.

create extension if not exists pg_trgm with schema extensions;

create function public.find_duplicate_business(
  ws uuid,
  p_google_place_id text,
  p_website_domain text,
  p_phone_e164 text,
  p_instagram text,
  p_facebook text,
  p_email text
)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_google_place_id is not null then
    select id into v_id from public.businesses
      where workspace_id = ws and merged_into is null and google_place_id = p_google_place_id
      limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if p_website_domain is not null then
    select id into v_id from public.businesses
      where workspace_id = ws and merged_into is null and website_domain = p_website_domain
      limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if p_phone_e164 is not null then
    select id into v_id from public.businesses
      where workspace_id = ws and merged_into is null and primary_phone_e164 = p_phone_e164
      limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if p_instagram is not null then
    select business_id into v_id from public.contact_channels
      where workspace_id = ws and channel = 'INSTAGRAM' and normalized_value = p_instagram
      limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if p_facebook is not null then
    select business_id into v_id from public.contact_channels
      where workspace_id = ws and channel = 'FACEBOOK' and normalized_value = p_facebook
      limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if p_email is not null then
    select business_id into v_id from public.contact_channels
      where workspace_id = ws and channel = 'EMAIL' and normalized_value = p_email
      limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  return null;
end;
$$;

create function public.find_possible_duplicate_business(
  ws uuid,
  p_normalized_name text,
  p_district text
)
returns uuid
language sql
security definer
stable
set search_path = public, extensions
as $$
  select id from public.businesses
  where workspace_id = ws
    and merged_into is null
    and district is not distinct from p_district
    and extensions.similarity(normalized_name, p_normalized_name) >= 0.9
  order by extensions.similarity(normalized_name, p_normalized_name) desc
  limit 1;
$$;

-- import_business: CSV import ve manuel ekleme için tek giriş noktası.
-- Dönen status: CREATED | POSSIBLE_DUPLICATE | DUPLICATE_MERGED.
create function public.import_business(
  ws uuid,
  p_payload jsonb,
  p_search_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := p_payload ->> 'name';
  v_normalized_name text;
  v_google_place_id text := nullif(p_payload ->> 'googlePlaceId', '');
  v_website_domain text := nullif(p_payload ->> 'websiteDomain', '');
  v_phone text := nullif(p_payload ->> 'phoneE164', '');
  v_instagram text := nullif(p_payload ->> 'instagram', '');
  v_facebook text := nullif(p_payload ->> 'facebook', '');
  v_email text := nullif(p_payload ->> 'email', '');
  v_source text := coalesce(nullif(p_payload ->> 'source', ''), 'IMPORT');
  v_external_id text := nullif(p_payload ->> 'externalId', '');
  v_source_url text := nullif(p_payload ->> 'sourceUrl', '');
  v_district text := nullif(p_payload ->> 'district', '');
  v_business_id uuid;
  v_possible_dup uuid;
  v_status text;
begin
  if v_uid is null or not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  if v_source not in ('GOOGLE_PLACES', 'META_ADS', 'GOOGLE_ADS', 'MANUAL', 'IMPORT') then
    raise exception 'invalid source %', v_source;
  end if;

  if v_name is null or length(trim(v_name)) = 0 then
    raise exception 'name is required';
  end if;

  v_normalized_name := lower(trim(v_name));

  v_business_id := public.find_duplicate_business(
    ws, v_google_place_id, v_website_domain, v_phone, v_instagram, v_facebook, v_email
  );

  if v_business_id is not null then
    insert into public.business_sources (
      workspace_id, business_id, source, external_id, source_url, search_job_id, snapshot, last_seen_at
    ) values (
      ws, v_business_id, v_source, v_external_id, v_source_url, p_search_job_id, p_payload, now()
    )
    on conflict (workspace_id, source, external_id)
      do update set last_seen_at = now(), snapshot = excluded.snapshot;

    v_status := 'DUPLICATE_MERGED';
  else
    v_possible_dup := public.find_possible_duplicate_business(ws, v_normalized_name, v_district);

    insert into public.businesses (
      workspace_id, name, normalized_name, category, address, city, district, lat, lng,
      google_place_id, website_url, website_domain, primary_phone_e164,
      possible_duplicate_of, created_by
    ) values (
      ws, v_name, v_normalized_name, p_payload ->> 'category', p_payload ->> 'address',
      p_payload ->> 'city', v_district,
      nullif(p_payload ->> 'lat', '')::double precision,
      nullif(p_payload ->> 'lng', '')::double precision,
      v_google_place_id, nullif(p_payload ->> 'websiteUrl', ''), v_website_domain, v_phone,
      v_possible_dup, v_uid
    )
    returning id into v_business_id;

    insert into public.business_sources (workspace_id, business_id, source, external_id, source_url, search_job_id, snapshot)
    values (ws, v_business_id, v_source, v_external_id, v_source_url, p_search_job_id, p_payload);

    if v_instagram is not null then
      insert into public.contact_channels (workspace_id, business_id, channel, value, normalized_value, found_via, confidence)
      values (ws, v_business_id, 'INSTAGRAM', v_instagram, v_instagram, 'MANUAL', 0.7)
      on conflict (workspace_id, channel, normalized_value) do nothing;
    end if;

    if v_facebook is not null then
      insert into public.contact_channels (workspace_id, business_id, channel, value, normalized_value, found_via, confidence)
      values (ws, v_business_id, 'FACEBOOK', v_facebook, v_facebook, 'MANUAL', 0.7)
      on conflict (workspace_id, channel, normalized_value) do nothing;
    end if;

    if v_email is not null then
      insert into public.contact_channels (workspace_id, business_id, channel, value, normalized_value, found_via, confidence)
      values (ws, v_business_id, 'EMAIL', v_email, v_email, 'MANUAL', 0.9)
      on conflict (workspace_id, channel, normalized_value) do nothing;
    end if;

    if v_phone is not null then
      insert into public.contact_channels (workspace_id, business_id, channel, value, normalized_value, found_via, confidence)
      values (ws, v_business_id, 'PHONE', v_phone, v_phone, 'MANUAL', 0.9)
      on conflict (workspace_id, channel, normalized_value) do nothing;
    end if;

    v_status := case when v_possible_dup is not null then 'POSSIBLE_DUPLICATE' else 'CREATED' end;
  end if;

  perform public.log_activity(
    ws, 'business.imported', 'business', v_business_id,
    format('%s: %s', v_status, v_name),
    jsonb_build_object('status', v_status, 'source', v_source)
  );

  return jsonb_build_object('businessId', v_business_id, 'status', v_status);
end;
$$;

revoke execute on function public.find_duplicate_business(uuid, text, text, text, text, text, text) from public;
revoke execute on function public.find_possible_duplicate_business(uuid, text, text) from public;
revoke execute on function public.import_business(uuid, jsonb, uuid) from public;

grant execute on function public.find_duplicate_business(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.find_possible_duplicate_business(uuid, text, text) to authenticated;
grant execute on function public.import_business(uuid, jsonb, uuid) to authenticated;
