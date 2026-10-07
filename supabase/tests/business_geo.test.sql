-- G2 (ADR 0012): işletmeler ülkeye/saat dilimine/dile bağlanır; import_business yeni alanları kabul eder,
-- ülkesizse workspace varsayılanını kullanır, POSSIBLE_DUPLICATE aynı ülkeyle sınırlıdır; yeni sütunlar
-- istemci tarafından güncellenemez.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(13);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'geo@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Geo WS') as ws \gset

-- 1) ABD kaydı yeni alanlarla gelir
select (public.import_business(:'ws', '{
  "name": "Congress Ave Dental", "source": "GOOGLE_PLACES", "googlePlaceId": "gp-us-1", "externalId": "gp-us-1",
  "city": "Austin", "district": "Downtown", "countryCode": "US", "region": "TX", "postalCode": "78701",
  "timezone": "America/Chicago", "language": "en", "phoneE164": "+15125550132"
}'::jsonb) ->> 'businessId') as us_id \gset

reset role;

select is((select country_code from public.businesses where id = :'us_id'), 'US', 'Ülke kodu kaydedilir');
select is((select region from public.businesses where id = :'us_id'), 'TX', 'Bölge kaydedilir');
select is((select postal_code from public.businesses where id = :'us_id'), '78701', 'Posta kodu kaydedilir');
select is((select timezone from public.businesses where id = :'us_id'), 'America/Chicago', 'Saat dilimi kaydedilir');
select is((select language from public.businesses where id = :'us_id'), 'en', 'Dil kaydedilir');
select ok((select places_refreshed_at from public.businesses where id = :'us_id') is not null, 'Places kaynaklı kayıtta places_refreshed_at dolar');

-- 2) Ülkesiz çağrı workspace varsayılanını (TR) kullanır; manuel kayıtta places_refreshed_at boştur
set local role authenticated;
select (public.import_business(:'ws', '{"name": "Eski Çağrı Dental", "source": "MANUAL", "city": "İstanbul"}'::jsonb) ->> 'businessId') as legacy_id \gset
reset role;
select is((select country_code from public.businesses where id = :'legacy_id'), 'TR', 'Ülkesiz çağrı workspace varsayılan ülkesini (TR) kullanır');
select ok((select places_refreshed_at from public.businesses where id = :'legacy_id') is null, 'Manuel kayıtta places_refreshed_at boştur');

-- 3) Aynı ad + aynı ilçe adı başka ülkede ise POSSIBLE_DUPLICATE sayılmaz, aynı ülkede sayılır
set local role authenticated;
select public.import_business(:'ws', '{"name": "Downtown Smile Clinic", "source": "MANUAL", "district": "Downtown", "countryCode": "US"}'::jsonb);
select is(
  public.import_business(:'ws', '{"name": "Downtown Smile Clinic", "source": "MANUAL", "district": "Downtown", "countryCode": "AU"}'::jsonb) ->> 'status',
  'CREATED',
  'Aynı ad ve ilçe adı başka ülkede POSSIBLE_DUPLICATE sayılmaz'
);
select is(
  public.import_business(:'ws', '{"name": "Downtown Smile Clinic", "source": "MANUAL", "district": "Downtown", "countryCode": "US"}'::jsonb) ->> 'status',
  'POSSIBLE_DUPLICATE',
  'Aynı ülkede POSSIBLE_DUPLICATE sayılır'
);

-- 4) Geçersiz ülke kodu reddedilir
select throws_like(
  format($q$select public.import_business(%L, '{"name": "Kötü", "source": "MANUAL", "countryCode": "usa"}'::jsonb)$q$, :'ws'),
  '%invalid country code%',
  'Geçersiz ülke kodu reddedilir'
);

-- 5) Yeni sütunlar istemci tarafından güncellenemez (G6'ya kadar yalnızca sunucu yazar)
select throws_like(
  format($q$update public.businesses set country_code = 'US' where id = %L$q$, :'legacy_id'),
  '%permission denied%',
  'country_code istemci tarafından güncellenemez'
);

-- 6) Aynı işletme tekrar bulununca eksik alanlar tamamlanır (kopya yolu)
select public.import_business(:'ws', '{
  "name": "Congress Ave Dental", "source": "GOOGLE_PLACES", "googlePlaceId": "gp-us-1", "externalId": "gp-us-1",
  "region": "TX", "postalCode": "78702"
}'::jsonb);
reset role;
select is((select postal_code from public.businesses where id = :'us_id'), '78701', 'Dolu alan tekrar bulunmada ezilmez');

select * from finish();

rollback;
