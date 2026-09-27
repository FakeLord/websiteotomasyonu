-- Hata düzeltmesi: import_business Google puanını, yorum sayısını ve işletme
-- durumunu hiç kaydetmiyordu (places-search alan maskesi bunları çekiyordu).
-- Sonuç: tüm lead'lerde rating NULL, skorlamadaki HIGH_RATING/HIGH_REVIEW_COUNT
-- ve NOT_OPERATIONAL kuralları hiç tetiklenmiyordu. Ayrıca:
-- - Aynı işletme tekrar bulunduğunda bu alanlar (ve boş kategori/şehir/ilçe) tazelenir.
-- - Places'ten gelen iletişim kanalları found_via = PLACES olarak işaretlenir.
-- - Activity log özeti ham durum kodu yerine okunur Türkçe metin yazar.
-- Fonksiyonun geri kalanı 20260925191200_dedupe_functions.sql ile aynıdır.

create or replace function public.import_business(
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
  v_city text := nullif(p_payload ->> 'city', '');
  v_category text := nullif(p_payload ->> 'category', '');
  v_rating numeric := case when jsonb_typeof(p_payload -> 'rating') = 'number' then (p_payload ->> 'rating')::numeric end;
  v_review_count integer := case when jsonb_typeof(p_payload -> 'reviewCount') = 'number' then (p_payload ->> 'reviewCount')::integer end;
  v_business_status text := case
    when p_payload ->> 'businessStatus' in ('OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY')
      then p_payload ->> 'businessStatus'
  end;
  v_found_via text;
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
  v_found_via := case when v_source = 'GOOGLE_PLACES' then 'PLACES' else 'MANUAL' end;

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

    update public.businesses
    set rating = coalesce(v_rating, rating),
        review_count = coalesce(v_review_count, review_count),
        business_status = coalesce(v_business_status, business_status),
        category = coalesce(category, v_category),
        city = coalesce(city, v_city),
        district = coalesce(district, v_district),
        updated_at = now()
    where id = v_business_id
      and (
        v_rating is distinct from rating or v_review_count is distinct from review_count
        or v_business_status is distinct from business_status
        or (category is null and v_category is not null)
        or (city is null and v_city is not null)
        or (district is null and v_district is not null)
      );

    v_status := 'DUPLICATE_MERGED';
  else
    v_possible_dup := public.find_possible_duplicate_business(ws, v_normalized_name, v_district);

    insert into public.businesses (
      workspace_id, name, normalized_name, category, address, city, district, lat, lng,
      google_place_id, website_url, website_domain, primary_phone_e164,
      rating, review_count, business_status,
      possible_duplicate_of, created_by
    ) values (
      ws, v_name, v_normalized_name, v_category, p_payload ->> 'address',
      v_city, v_district,
      nullif(p_payload ->> 'lat', '')::double precision,
      nullif(p_payload ->> 'lng', '')::double precision,
      v_google_place_id, nullif(p_payload ->> 'websiteUrl', ''), v_website_domain, v_phone,
      v_rating, v_review_count, v_business_status,
      v_possible_dup, v_uid
    )
    returning id into v_business_id;

    insert into public.business_sources (workspace_id, business_id, source, external_id, source_url, search_job_id, snapshot)
    values (ws, v_business_id, v_source, v_external_id, v_source_url, p_search_job_id, p_payload);

    if v_instagram is not null then
      insert into public.contact_channels (workspace_id, business_id, channel, value, normalized_value, found_via, confidence)
      values (ws, v_business_id, 'INSTAGRAM', v_instagram, v_instagram, v_found_via, 0.7)
      on conflict (workspace_id, channel, normalized_value) do nothing;
    end if;

    if v_facebook is not null then
      insert into public.contact_channels (workspace_id, business_id, channel, value, normalized_value, found_via, confidence)
      values (ws, v_business_id, 'FACEBOOK', v_facebook, v_facebook, v_found_via, 0.7)
      on conflict (workspace_id, channel, normalized_value) do nothing;
    end if;

    if v_email is not null then
      insert into public.contact_channels (workspace_id, business_id, channel, value, normalized_value, found_via, confidence)
      values (ws, v_business_id, 'EMAIL', v_email, v_email, v_found_via, 0.9)
      on conflict (workspace_id, channel, normalized_value) do nothing;
    end if;

    if v_phone is not null then
      insert into public.contact_channels (workspace_id, business_id, channel, value, normalized_value, found_via, confidence)
      values (ws, v_business_id, 'PHONE', v_phone, v_phone, v_found_via, 0.9)
      on conflict (workspace_id, channel, normalized_value) do nothing;
    end if;

    v_status := case when v_possible_dup is not null then 'POSSIBLE_DUPLICATE' else 'CREATED' end;
  end if;

  perform public.log_activity(
    ws, 'business.imported', 'business', v_business_id,
    case v_status
      when 'CREATED' then format('Yeni işletme eklendi: %s', v_name)
      when 'POSSIBLE_DUPLICATE' then format('Olası duplicate olarak eklendi: %s', v_name)
      else format('Mevcut kayıt tekrar bulundu: %s', v_name)
    end,
    jsonb_build_object('status', v_status, 'source', v_source)
  );

  return jsonb_build_object('businessId', v_business_id, 'status', v_status);
end;
$$;

-- Mevcut kayıtlar: Places'ten içe aktarılmış kanalları doğru kaynakla işaretle.
update public.contact_channels cc
set found_via = 'PLACES'
where cc.found_via = 'MANUAL'
  and cc.channel in ('PHONE', 'INSTAGRAM', 'FACEBOOK', 'EMAIL')
  and exists (
    select 1 from public.business_sources s
    where s.business_id = cc.business_id and s.source = 'GOOGLE_PLACES'
  )
  and not exists (
    select 1 from public.business_sources s
    where s.business_id = cc.business_id and s.source in ('MANUAL', 'IMPORT')
  );
