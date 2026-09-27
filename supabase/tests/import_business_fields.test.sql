-- import_business: Google puanı, yorum sayısı ve işletme durumu kaydedilir;
-- aynı işletme tekrar bulunduğunda bu alanlar tazelenir; Places'ten gelen
-- iletişim kanalları found_via = PLACES olarak işaretlenir.
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(6);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'imp@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Import WS') as ws \gset

select (public.import_business(:'ws', '{
  "name": "Puanlı Diş", "source": "GOOGLE_PLACES", "googlePlaceId": "gp-1", "externalId": "gp-1",
  "phoneE164": "+902125550000", "rating": 4.8, "reviewCount": 124, "businessStatus": "OPERATIONAL",
  "city": "İstanbul", "district": "Kadıköy", "category": "Diş Kliniği"
}'::jsonb) ->> 'businessId') as business_id \gset

reset role;

select is((select rating from public.businesses where id = :'business_id'), 4.8::numeric, 'Google puanı kaydedilir');
select is((select review_count from public.businesses where id = :'business_id'), 124, 'Yorum sayısı kaydedilir');
select is((select business_status from public.businesses where id = :'business_id'), 'OPERATIONAL', 'İşletme durumu kaydedilir');
select is(
  (select found_via from public.contact_channels where business_id = :'business_id' and channel = 'PHONE'),
  'PLACES',
  'Places''ten gelen telefon found_via = PLACES olarak işaretlenir'
);

set local role authenticated;
select public.import_business(:'ws', '{
  "name": "Puanlı Diş", "source": "GOOGLE_PLACES", "googlePlaceId": "gp-1", "externalId": "gp-1",
  "rating": 4.9, "reviewCount": 130, "businessStatus": "CLOSED_TEMPORARILY"
}'::jsonb);
reset role;

select is((select rating from public.businesses where id = :'business_id'), 4.9::numeric, 'Tekrar bulunan işletmenin puanı tazelenir');
select is(
  (select business_status from public.businesses where id = :'business_id'),
  'CLOSED_TEMPORARILY',
  'Tekrar bulunan işletmenin durumu tazelenir'
);

select * from finish();

rollback;
