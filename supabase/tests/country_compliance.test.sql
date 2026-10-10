-- ADR 0019 (G5): ülke kuralları, gönderen kimliği, bastırma listesi ve kalıcı silme.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(21);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'adm@cc.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mem@cc.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('CC WS') as ws \gset
select (public.import_business(:'ws', '{"name": "Istanbul Klinik", "source": "MANUAL", "countryCode": "TR", "email": "info@istanbulklinik.test"}'::jsonb) ->> 'businessId') as tr \gset
select (public.import_business(:'ws', '{"name": "Texas Dental", "source": "MANUAL", "countryCode": "US", "email": "hello@texasdental.test"}'::jsonb) ->> 'businessId') as us \gset
select (public.import_business(:'ws', '{"name": "Toronto Dental", "source": "MANUAL", "countryCode": "CA", "email": "info@torontodental.test"}'::jsonb) ->> 'businessId') as ca \gset
select (public.import_business(:'ws', '{"name": "Berlin Zahnarzt", "source": "MANUAL", "countryCode": "DE", "email": "info@berlinzahn.test"}'::jsonb) ->> 'businessId') as de \gset
reset role;

-- Pencere/limit sebepleri karışmasın; yurtdışı kilidi açık (ülke kuralı ayrıca denenir).
update public.workspace_settings
set followup_policy = jsonb_set(followup_policy, '{sendWindow}',
      '{"days": [1,2,3,4,5,6,7], "from": "00:00", "to": "23:59", "tz": "Europe/Istanbul"}'::jsonb),
    outreach_limits = jsonb_set(outreach_limits, '{allow_foreign_email}', 'true'::jsonb)
where workspace_id = :'ws';
update public.businesses set timezone = 'Europe/Istanbul' where workspace_id = :'ws';
-- Kanalların kaynağı: CA işletmesinin adresi elle girilmiş (yayımlanmış sayılmaz).
update public.contact_channels set found_via = 'MANUAL' where business_id = :'ca';

set local role authenticated;

select ok(
  not (public.outreach_guard(:'tr', 'EMAIL') -> 'reasons') ? 'COUNTRY_RULE'
  and not (public.outreach_guard(:'tr', 'EMAIL') -> 'reasons') ? 'MISSING_SENDER_PROFILE',
  'TR işletmesi: posta adresi gerekmez, ülke kuralı engellemez'
);
select ok(
  (public.outreach_guard(:'us', 'EMAIL') -> 'reasons') ? 'MISSING_SENDER_PROFILE',
  'ABD işletmesi: gönderen posta adresi yokken reddedilir'
);
select ok(
  (public.outreach_guard(:'de', 'EMAIL') -> 'reasons') ? 'COUNTRY_RULE',
  'Kuralı tanımlı olmayan ülke (DE) e-postada COUNTRY_RULE ile reddedilir'
);
select ok(
  not (public.outreach_guard(:'de', 'INSTAGRAM') -> 'reasons') ? 'COUNTRY_RULE',
  'Ülke kuralı yalnızca e-posta kanalına uygulanır'
);
select ok(
  (public.outreach_guard(:'ca', 'EMAIL') -> 'reasons') ? 'COUNTRY_RULE',
  'Kanada: elle girilmiş (yayımlanmamış) adres COUNTRY_RULE ile reddedilir'
);
reset role;

-- Gönderen kimliği doldurulur; Kanada adresi web sitesinden bulunmuş sayılır.
update public.workspace_settings
set sender_profile = '{"legalName": "Test Ajans", "postalAddress": "1 Test St, Istanbul"}'::jsonb
where workspace_id = :'ws';
update public.contact_channels set found_via = 'WEBSITE' where business_id = :'ca';

set local role authenticated;
select ok(
  not (public.outreach_guard(:'us', 'EMAIL') -> 'reasons') ? 'MISSING_SENDER_PROFILE'
  and not (public.outreach_guard(:'us', 'EMAIL') -> 'reasons') ? 'COUNTRY_RULE',
  'Posta adresi girilince ABD işletmesi bu kurallardan geçer'
);
select ok(
  not (public.outreach_guard(:'ca', 'EMAIL') -> 'reasons') ? 'COUNTRY_RULE',
  'Kanada: web sitesinden bulunmuş adres geçer'
);
reset role;

-- Silme: üye silemez.
insert into public.workspace_members (workspace_id, user_id, role)
values (:'ws', 'fb000000-0000-0000-0000-000000000002', 'MEMBER');
select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_ok(
  format($q$select public.erase_business(%L, 'talep')$q$, :'us'),
  'only ADMIN can erase a business',
  'MEMBER işletmeyi kalıcı silemez'
);
reset role;

select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_ok(
  format($q$select public.erase_business(%L, '')$q$, :'us'),
  'reason is required to erase a business',
  'Sebep zorunludur'
);

select is(
  (public.erase_business(:'us', 'Silme talebi') ->> 'erased')::boolean,
  true,
  'ADMIN işletmeyi sebeple kalıcı siler'
);
select is(
  (select count(*)::int from public.businesses where id = :'us'),
  0,
  'İşletme satırı silindi'
);
select is(
  (select count(*)::int from public.contact_channels where business_id = :'us'),
  0,
  'İletişim kanalları cascade ile silindi'
);
reset role;

select ok(
  (select count(*) from public.suppressions where workspace_id = :'ws') >= 2,
  'E-posta ve alan adı özetleri bastırma listesine yazıldı'
);
select ok(
  not exists (select 1 from public.suppressions where value_hash like '%texasdental%'),
  'Bastırma listesinde düz metin e-posta bulunmaz (yalnızca özet)'
);
select ok(
  exists (select 1 from public.activity_logs where workspace_id = :'ws' and action = 'business.erased'),
  'Silme etkinlik kaydına yazıldı'
);
select ok(
  not exists (select 1 from public.activity_logs where workspace_id = :'ws' and action = 'business.erased' and summary ilike '%Texas%'),
  'Etkinlik kaydında işletme adı yok'
);

-- Aynı e-posta yeniden içe aktarılınca DNC olur ve SUPPRESSED sebebiyle engellenir.
set local role authenticated;
select (public.import_business(:'ws', '{"name": "Texas Dental Yeni", "source": "MANUAL", "countryCode": "US", "email": "hello@texasdental.test"}'::jsonb) ->> 'businessId') as us2 \gset
reset role;
select is(
  (select do_not_contact from public.businesses where id = :'us2'),
  true,
  'Silinen e-postayla yeniden içe aktarılan işletme DNC olur'
);
set local role authenticated;
select ok(
  (public.outreach_guard(:'us2', 'EMAIL') -> 'reasons') ? 'SUPPRESSED',
  'Yeniden içe aktarılan kayıt SUPPRESSED ile engellenir'
);
reset role;

-- Aynı alan adındaki başka bir adres de engellenir.
set local role authenticated;
select (public.import_business(:'ws', '{"name": "Texas Dental Sube", "source": "MANUAL", "countryCode": "US", "email": "sube@texasdental.test"}'::jsonb) ->> 'businessId') as us3 \gset
reset role;
select is(
  (select do_not_contact from public.businesses where id = :'us3'),
  true,
  'Aynı alan adındaki başka adres de DNC olur'
);

-- Yalıtım: bastırma listesini üye göremez, ülke kuralı tablosu herkese okunur.
select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is(
  (select count(*)::int from public.suppressions),
  0,
  'MEMBER bastırma listesini göremez'
);
select ok(
  (select count(*) from public.country_email_rules) >= 5,
  'Ülke kuralları okunabilir'
);

select * from finish();

rollback;
