-- Lead düzenleme (ad, kategori, adres, şehir, ilçe, telefon, web sitesi). İstemci businesses'a doğrudan yazmaz; bu RPC
-- doğrular, sürüm çakışmasını denetler, telefon kanalını senkron tutar, siteyi değiştirince yeniden analizi tetikler ve
-- activity log yazar (CLAUDE.md #3, #5, #8). Alan kuralları packages/core/business/edit-patch.ts ile aynıdır.
create function public.update_business_details(p_business_id uuid, p_patch jsonb, p_expected_version integer)
returns public.businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.businesses%rowtype;
  v_new public.businesses%rowtype;
  v_key text;
  v_fields text[] := '{}';
  v_phone text;
  v_site_changed boolean := false;
begin
  select * into v_old from public.businesses where id = p_business_id for update;
  if v_uid is null or not found or not public.is_member(v_old.workspace_id) then
    raise exception 'business not found';
  end if;
  if v_old.merged_into is not null then
    raise exception 'business is merged into another record';
  end if;
  if v_old.version <> p_expected_version then
    raise exception 'version_conflict: business was updated by someone else';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'patch must be an object';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('name', 'category', 'address', 'city', 'district', 'phone', 'websiteUrl', 'websiteDomain') then
      raise exception 'unknown field %', v_key;
    end if;
  end loop;

  if p_patch ? 'name' then
    if jsonb_typeof(p_patch -> 'name') <> 'string' or length(trim(p_patch ->> 'name')) not between 1 and 200 then
      raise exception 'invalid name';
    end if;
  end if;
  foreach v_key in array array['category', 'address', 'city', 'district'] loop
    if p_patch ? v_key and jsonb_typeof(p_patch -> v_key) not in ('string', 'null') then
      raise exception 'invalid %', v_key;
    end if;
    if p_patch ? v_key and length(coalesce(p_patch ->> v_key, '')) > 300 then
      raise exception 'invalid %', v_key;
    end if;
  end loop;
  if p_patch ? 'phone' and p_patch ->> 'phone' is not null and p_patch ->> 'phone' !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid phone';
  end if;
  if (p_patch ? 'websiteUrl') <> (p_patch ? 'websiteDomain') then
    raise exception 'websiteUrl and websiteDomain must be changed together';
  end if;
  if p_patch ? 'websiteUrl' then
    if p_patch ->> 'websiteUrl' is not null and (p_patch ->> 'websiteUrl' !~* '^https?://[^[:space:]]+$' or length(p_patch ->> 'websiteUrl') > 500) then
      raise exception 'invalid websiteUrl';
    end if;
    if p_patch ->> 'websiteDomain' is not null and p_patch ->> 'websiteDomain' !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' then
      raise exception 'invalid websiteDomain';
    end if;
    v_site_changed := (p_patch ->> 'websiteUrl') is distinct from v_old.website_url;
  end if;

  -- Telefon başka bir işletmenin kanalıysa değişiklik reddedilir (aynı numara iki işletmede olamaz).
  if p_patch ? 'phone' and p_patch ->> 'phone' is not null then
    v_phone := p_patch ->> 'phone';
    if exists (
      select 1 from public.contact_channels
      where workspace_id = v_old.workspace_id and channel = 'PHONE' and normalized_value = v_phone and business_id <> p_business_id
    ) then
      raise exception 'duplicate_contact: phone is registered to another business';
    end if;
  end if;

  update public.businesses
  set name = case when p_patch ? 'name' then trim(p_patch ->> 'name') else name end,
      normalized_name = case when p_patch ? 'name' then lower(trim(p_patch ->> 'name')) else normalized_name end,
      category = case when p_patch ? 'category' then nullif(trim(p_patch ->> 'category'), '') else category end,
      address = case when p_patch ? 'address' then nullif(trim(p_patch ->> 'address'), '') else address end,
      city = case when p_patch ? 'city' then nullif(trim(p_patch ->> 'city'), '') else city end,
      district = case when p_patch ? 'district' then nullif(trim(p_patch ->> 'district'), '') else district end,
      primary_phone_e164 = case when p_patch ? 'phone' then p_patch ->> 'phone' else primary_phone_e164 end,
      website_url = case when p_patch ? 'websiteUrl' then p_patch ->> 'websiteUrl' else website_url end,
      website_domain = case when p_patch ? 'websiteDomain' then p_patch ->> 'websiteDomain' else website_domain end,
      -- Site değişti: analiz sonucu eskidi; arka plan analizi yeniden alır.
      website_status = case when v_site_changed then null else website_status end,
      version = version + 1,
      updated_at = now()
  where id = p_business_id
  returning * into v_new;

  if p_patch ? 'phone' then
    -- Eski numaranın kanal satırları (konuşmaya bağlı olmayanlar) kaldırılır; yeni numara PHONE kanalı olur.
    if v_old.primary_phone_e164 is not null then
      delete from public.contact_channels c
      where c.business_id = p_business_id and c.channel in ('PHONE', 'WHATSAPP')
        and c.normalized_value = v_old.primary_phone_e164
        and not exists (select 1 from public.conversations v where v.contact_channel_id = c.id);
    end if;
    if v_phone is not null then
      insert into public.contact_channels (workspace_id, business_id, channel, value, normalized_value, found_via, confidence)
      values (v_old.workspace_id, p_business_id, 'PHONE', v_phone, v_phone, 'MANUAL', 1)
      on conflict (workspace_id, channel, normalized_value) do nothing;
    end if;
  end if;

  select array_agg(f order by f) into v_fields
  from unnest(array[
    case when p_patch ? 'name' then 'name' end, case when p_patch ? 'category' then 'category' end,
    case when p_patch ? 'address' then 'address' end, case when p_patch ? 'city' then 'city' end,
    case when p_patch ? 'district' then 'district' end, case when p_patch ? 'phone' then 'phone' end,
    case when p_patch ? 'websiteUrl' then 'website' end
  ]) f where f is not null;

  perform public.log_activity(
    v_old.workspace_id, 'lead.updated', 'business', p_business_id,
    format('Lead bilgileri güncellendi: %s', coalesce(array_to_string(v_fields, ', '), '-')),
    jsonb_build_object('fields', coalesce(to_jsonb(v_fields), '[]'::jsonb), 'previousName', v_old.name)
  );

  return v_new;
end;
$$;

revoke execute on function public.update_business_details(uuid, jsonb, integer) from public, anon;
grant execute on function public.update_business_details(uuid, jsonb, integer) to authenticated;
