-- ADR 0019 (G5): ülke bazlı e-posta uyumu, gönderen kimliği, bastırma listesi ve kalıcı silme.
-- Hukuk danışmanı yoktur (D1): kurallar muhafazakârdır ve kaynaklarıyla belgelenmiştir (ADR 0019). Tanımsız ülke = e-posta kapalı.
--   country_email_rules : ülke başına e-posta politikası (OPT_OUT: onay şartı yok ama çıkma hakkı + kimlik; PUBLISHED_ONLY:
--                         yalnızca alıcının kendi yayımladığı adres). Tabloda olmayan ülke COUNTRY_RULE ile reddedilir.
--   workspace_settings.sender_profile : gönderen kimliği (legalName, postalAddress) — e-posta alt bilgisinin kaynağı.
--   suppressions        : "yazmayın" diyen / silinen kişilerin özetleri (e-posta, alan adı, telefon). Yeniden içe aktarma DNC olur.
--   erase_business()    : yalnızca ADMIN; kişisel veriyi siler, özetleri bastırma listesine yazar.

-- ---------------------------------------------------------------------------------------------------
-- 1) Ülke e-posta kuralları
-- ---------------------------------------------------------------------------------------------------
create table public.country_email_rules (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  policy text not null check (policy in ('OPT_OUT', 'PUBLISHED_ONLY')),
  requires_postal_address boolean not null,
  note text not null,
  source_url text not null
);

alter table public.country_email_rules enable row level security;
alter table public.country_email_rules force row level security;
create policy country_email_rules_select on public.country_email_rules
  for select to authenticated using (true);
revoke insert, update, delete on public.country_email_rules from authenticated, anon;

insert into public.country_email_rules (country_code, policy, requires_postal_address, note, source_url) values
  ('TR', 'OPT_OUT', false,
   'Tacir/esnaf alıcıya ticari ileti için önceden onay gerekmez; alıcı ret hakkını kullandıysa gönderilemez. İYS kaydı ve ret kontrolü gönderenin sorumluluğundadır.',
   'https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6563.pdf'),
  ('US', 'OPT_OUT', true,
   'CAN-SPAM: B2B dahil; doğru gönderen bilgisi, reklam olduğu, fiziksel posta adresi ve çıkma yolu zorunlu; ret 10 iş gününde uygulanır.',
   'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business'),
  ('GB', 'OPT_OUT', true,
   'PECR: tüzel kişiliklere onay gerekmez; şahıs işletmesi/ortaklıkta onay gerekir (burada ayırt edilemez, risk gönderendedir). Kimlik gizlenemez, çıkma yolu sunulur.',
   'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/'),
  ('CA', 'PUBLISHED_ONLY', true,
   'CASL: zımni onay yalnızca alıcının kendi yayımladığı, "istenmeyen ileti istemiyorum" notu taşımayan ve rolüyle ilgili adrese; kimlik ve çıkma yolu zorunlu. İspat yükü gönderendedir.',
   'https://crtc.gc.ca/eng/com500/faq500.htm'),
  ('AU', 'PUBLISHED_ONLY', true,
   'Spam Act: zımni onay yalnızca yayımlanmış ve role ilgili adrese; gönderen kimliği ve çıkma yolu zorunlu; çıkma 5 iş gününde uygulanır.',
   'https://www.acma.gov.au/avoid-sending-spam');

-- ---------------------------------------------------------------------------------------------------
-- 2) Gönderen kimliği
-- ---------------------------------------------------------------------------------------------------
alter table public.workspace_settings
  add column sender_profile jsonb not null default '{}'::jsonb
    check (jsonb_typeof(sender_profile) = 'object');

-- ---------------------------------------------------------------------------------------------------
-- 3) Bastırma listesi
-- ---------------------------------------------------------------------------------------------------
-- Yerleşik sha256 kullanılır (pgcrypto arama yolunda olmayabilir). Yalnızca kanonik biçim özetlenir.
create function public.suppression_hash(p_value text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(lower(trim(p_value)), 'UTF8')), 'hex');
$$;

create table public.suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('EMAIL', 'DOMAIN', 'PHONE')),
  value_hash text not null,
  reason text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint suppressions_unique unique (workspace_id, kind, value_hash)
);

alter table public.suppressions enable row level security;
alter table public.suppressions force row level security;
create policy suppressions_select on public.suppressions
  for select to authenticated using (public.is_admin(workspace_id));
revoke insert, update, delete on public.suppressions from authenticated, anon;

-- Bir işletmenin bastırma özetleri: e-posta, e-posta alan adı, web sitesi alan adı, telefon.
create function public.business_suppression_keys(p_business_id uuid)
returns table (kind text, value_hash text)
language sql
stable
security definer
set search_path = public
as $$
  select 'EMAIL', public.suppression_hash(c.normalized_value)
  from public.contact_channels c
  where c.business_id = p_business_id and c.channel = 'EMAIL' and coalesce(c.normalized_value, '') <> ''
  union
  select 'DOMAIN', public.suppression_hash(split_part(c.normalized_value, '@', 2))
  from public.contact_channels c
  where c.business_id = p_business_id and c.channel = 'EMAIL'
    and position('@' in coalesce(c.normalized_value, '')) > 0
    and split_part(c.normalized_value, '@', 2) !~* '^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|yandex|proton|protonmail)\.'
  union
  select 'DOMAIN', public.suppression_hash(h.host)
  from (
    select regexp_replace(lower(b.website_url), '^https?://(www\.)?([^/:?#]+).*$', '\2') as host
    from public.businesses b
    where b.id = p_business_id and coalesce(b.website_url, '') <> ''
  ) h
  -- Paylaşılan platformlar (sosyal ağ, site oluşturucu) bastırılırsa başka işletmeler de engellenir; hariç tutulur.
  where h.host !~* '(facebook|instagram|linkedin|tiktok|twitter|youtube|wa\.me|linktr\.ee|google|business\.site|wixsite|wordpress|blogspot|shopify|weebly|squarespace)'
  union
  select 'PHONE', public.suppression_hash(coalesce(b.primary_phone_e164, ''))
  from public.businesses b
  where b.id = p_business_id and coalesce(b.primary_phone_e164, '') <> ''
  union
  select 'PHONE', public.suppression_hash(c.normalized_value)
  from public.contact_channels c
  where c.business_id = p_business_id and c.channel in ('PHONE', 'WHATSAPP') and coalesce(c.normalized_value, '') <> '';
$$;

create function public.is_business_suppressed(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.businesses b
    join public.business_suppression_keys(b.id) k on true
    join public.suppressions s
      on s.workspace_id = b.workspace_id and s.kind = k.kind and s.value_hash = k.value_hash
    where b.id = p_business_id
  );
$$;

revoke execute on function public.business_suppression_keys(uuid) from public, authenticated, anon;
revoke execute on function public.is_business_suppressed(uuid) from public, authenticated, anon;

-- Yeni eklenen iletişim kanalı bastırma listesindeyse işletme DNC olur (yeniden içe aktarma korunur).
create function public.contact_channels_suppression_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_hash text;
begin
  if new.channel = 'EMAIL' and coalesce(new.normalized_value, '') <> '' then
    if exists (
      select 1 from public.suppressions s
      where s.workspace_id = new.workspace_id
        and (
          (s.kind = 'EMAIL' and s.value_hash = public.suppression_hash(new.normalized_value))
          or (s.kind = 'DOMAIN' and s.value_hash = public.suppression_hash(split_part(new.normalized_value, '@', 2)))
        )
    ) then
      v_kind := 'EMAIL';
    end if;
  elsif new.channel in ('PHONE', 'WHATSAPP') and coalesce(new.normalized_value, '') <> '' then
    v_hash := public.suppression_hash(new.normalized_value);
    if exists (
      select 1 from public.suppressions s
      where s.workspace_id = new.workspace_id and s.kind = 'PHONE' and s.value_hash = v_hash
    ) then
      v_kind := 'PHONE';
    end if;
  end if;

  if v_kind is not null then
    update public.businesses
    set do_not_contact = true, dnc_reason = 'Bastırma listesi (silme/çıkma talebi)', dnc_at = now(), version = version + 1
    where id = new.business_id and do_not_contact = false;
  end if;
  return new;
end;
$$;

create trigger contact_channels_suppression
  after insert on public.contact_channels
  for each row execute function public.contact_channels_suppression_trigger();

-- ---------------------------------------------------------------------------------------------------
-- 4) Kalıcı silme (yalnızca ADMIN, sebep zorunlu)
-- ---------------------------------------------------------------------------------------------------
create function public.erase_business(p_business_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
  v_suppressed integer;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select workspace_id into v_ws from public.businesses where id = p_business_id;
  if v_ws is null or not public.is_member(v_ws) then
    raise exception 'business % not found or not accessible', p_business_id;
  end if;
  if not public.is_admin(v_ws) then
    raise exception 'only ADMIN can erase a business';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'reason is required to erase a business';
  end if;

  insert into public.suppressions (workspace_id, kind, value_hash, reason, created_by)
  select v_ws, k.kind, k.value_hash, left(trim(p_reason), 200), v_uid
  from public.business_suppression_keys(p_business_id) k
  on conflict (workspace_id, kind, value_hash) do nothing;
  get diagnostics v_suppressed = row_count;

  -- Başka kayıtların bu işletmeye işaretçileri temizlenir (FK cascade değil).
  update public.businesses set merged_into = null where merged_into = p_business_id;
  update public.businesses set possible_duplicate_of = null where possible_duplicate_of = p_business_id;

  -- Etkin devir/takip/kanal kayıtları dahil tüm çocuk tablolar FK cascade ile silinir.
  delete from public.businesses where id = p_business_id;

  -- Kişisel veri (ad, adres) log'a yazılmaz.
  perform public.log_activity(
    v_ws, 'business.erased', 'business', p_business_id,
    'İşletme kalıcı olarak silindi', jsonb_build_object('reason', left(trim(p_reason), 200), 'suppressed', v_suppressed)
  );

  return jsonb_build_object('erased', true, 'suppressed', v_suppressed);
end;
$$;

revoke execute on function public.erase_business(uuid, text) from public;
grant execute on function public.erase_business(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- 5) outreach_guard: COUNTRY_RULE, MISSING_SENDER_PROFILE, SUPPRESSED
-- ---------------------------------------------------------------------------------------------------
-- Fonksiyonun geri kalanı 20261010100000_foreign_email_lock.sql ile aynıdır.
create or replace function public.outreach_guard(p_business_id uuid, p_channel text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_settings public.workspace_settings%rowtype;
  v_rule public.country_email_rules%rowtype;
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

  if public.is_business_suppressed(p_business_id) then
    v_reasons := array_append(v_reasons, 'SUPPRESSED');
  end if;

  if p_channel = 'EMAIL' then
    if v_business.country_code is distinct from 'TR'
      and coalesce((v_settings.outreach_limits ->> 'allow_foreign_email')::boolean, false) is not true
    then
      v_reasons := array_append(v_reasons, 'FOREIGN_EMAIL_DISABLED');
    end if;

    select * into v_rule from public.country_email_rules where country_code = v_business.country_code;
    if not found then
      -- Kural tanımlı olmayan ülke = en sıkı (D21): e-posta kapalı.
      v_reasons := array_append(v_reasons, 'COUNTRY_RULE');
    else
      if v_rule.policy = 'PUBLISHED_ONLY' and not exists (
        select 1 from public.contact_channels c
        where c.business_id = p_business_id and c.channel = 'EMAIL'
          and coalesce(c.status, '') not in ('INVALID', 'BOUNCED')
          and c.found_via in ('WEBSITE', 'JSON_LD')
      ) then
        v_reasons := array_append(v_reasons, 'COUNTRY_RULE');
      end if;
      if v_rule.requires_postal_address
        and length(trim(coalesce(v_settings.sender_profile ->> 'postalAddress', ''))) = 0
      then
        v_reasons := array_append(v_reasons, 'MISSING_SENDER_PROFILE');
      end if;
    end if;
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
