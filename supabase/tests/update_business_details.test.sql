-- update_business_details: doğrulama, sürüm çakışması, telefon kanalı senkronu, site değişince yeniden analiz, yalıtım.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(24);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e8000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'edit1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e8000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'edit2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Edit WS') as ws \gset

select (public.import_business(:'ws', '{"name": "Eski Ad", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul", "district": "Kadıköy", "category": "Kafe", "phoneE164": "+905321112233", "websiteUrl": "https://eski.com", "websiteDomain": "eski.com"}'::jsonb) ->> 'businessId') as b1 \gset
select (public.import_business(:'ws', '{"name": "Baska Isletme", "source": "MANUAL", "countryCode": "TR", "city": "Ankara", "phoneE164": "+905445556677"}'::jsonb) ->> 'businessId') as b2 \gset
reset role;
update public.businesses set website_status = 'GOOD_WEBSITE' where id = :'b1';
select version as v1 from public.businesses where id = :'b1' \gset
set local role authenticated;

-- 1) Temel düzenleme
select is((public.update_business_details(:'b1', '{"name": "  Yeni Ad ", "district": "Şişli", "category": null}'::jsonb, :'v1')).name, 'Yeni Ad', 'Ad kırpılarak güncellenir');
select is((select normalized_name from public.businesses where id = :'b1'), 'yeni ad', 'normalized_name ad ile birlikte güncellenir');
select is((select district from public.businesses where id = :'b1'), 'Şişli', 'İlçe güncellenir');
select ok((select category is null from public.businesses where id = :'b1'), 'null gönderilen alan temizlenir');
select is((select city from public.businesses where id = :'b1'), 'İstanbul', 'Yamada olmayan alana dokunulmaz');
select is((select version from public.businesses where id = :'b1'), :'v1' + 1, 'Sürüm bir artar');
select is((select count(*)::int from public.activity_logs where workspace_id = :'ws' and action = 'lead.updated'), 1, 'Güncelleme aktivite günlüğüne yazılır');

-- 2) Sürüm çakışması ve doğrulama
select throws_like(
  format($q$select public.update_business_details(%L, '{"name": "X"}'::jsonb, %s)$q$, :'b1', :'v1'),
  '%version_conflict%', 'Eski sürümle yazılamaz'
);
select version as v2 from public.businesses where id = :'b1' \gset
select throws_like(format($q$select public.update_business_details(%L, '{"name": "  "}'::jsonb, %s)$q$, :'b1', :'v2'), '%invalid name%', 'Boş ad reddedilir');
select throws_like(format($q$select public.update_business_details(%L, '{"stage": "WON"}'::jsonb, %s)$q$, :'b1', :'v2'), '%unknown field%', 'Korumalı alan (stage) yamayla değiştirilemez');
select throws_like(format($q$select public.update_business_details(%L, '{"lead_score": 100}'::jsonb, %s)$q$, :'b1', :'v2'), '%unknown field%', 'Korumalı alan (lead_score) yamayla değiştirilemez');
select throws_like(format($q$select public.update_business_details(%L, '{"phone": "0532 111"}'::jsonb, %s)$q$, :'b1', :'v2'), '%invalid phone%', 'E.164 olmayan telefon reddedilir');
select throws_like(format($q$select public.update_business_details(%L, '{"websiteUrl": "https://a.com"}'::jsonb, %s)$q$, :'b1', :'v2'), '%together%', 'Site ve alan adı birlikte gelmelidir');
select throws_like(format($q$select public.update_business_details(%L, '{"websiteUrl": "javascript:alert(1)", "websiteDomain": null}'::jsonb, %s)$q$, :'b1', :'v2'), '%invalid websiteUrl%', 'http(s) olmayan adres reddedilir');

-- 3) Telefon: kanal senkronu, başka işletmenin numarası reddi
select public.update_business_details(:'b1', '{"phone": "+905329998877"}'::jsonb, :'v2');
select is((select primary_phone_e164 from public.businesses where id = :'b1'), '+905329998877', 'Telefon güncellenir');
select ok(exists (select 1 from public.contact_channels where business_id = :'b1' and channel = 'PHONE' and normalized_value = '+905329998877'), 'Yeni numara PHONE kanalı olur');
select ok(not exists (select 1 from public.contact_channels where business_id = :'b1' and channel = 'PHONE' and normalized_value = '+905321112233'), 'Eski numaranın kanalı kaldırılır');
select version as v3 from public.businesses where id = :'b1' \gset
select throws_like(
  format($q$select public.update_business_details(%L, '{"phone": "+905445556677"}'::jsonb, %s)$q$, :'b1', :'v3'),
  '%duplicate_contact%', 'Başka işletmenin numarası reddedilir'
);
select public.update_business_details(:'b1', '{"phone": null}'::jsonb, :'v3');
select ok((select primary_phone_e164 is null from public.businesses where id = :'b1'), 'Telefon boşaltılabilir');

-- 4) Site değişince analiz sıfırlanır
select version as v4 from public.businesses where id = :'b1' \gset
select public.update_business_details(:'b1', '{"websiteUrl": "https://yeni.com", "websiteDomain": "yeni.com"}'::jsonb, :'v4');
select ok((select website_status is null and website_domain = 'yeni.com' from public.businesses where id = :'b1'), 'Site değişince website_status sıfırlanır ve alan adı güncellenir');
select version as v5 from public.businesses where id = :'b1' \gset
select public.update_business_details(:'b1', '{"name": "Site Aynı"}'::jsonb, :'v5');
reset role;
update public.businesses set website_status = 'GOOD_WEBSITE' where id = :'b1';
set local role authenticated;
select version as v6 from public.businesses where id = :'b1' \gset
select public.update_business_details(:'b1', '{"websiteUrl": "https://yeni.com", "websiteDomain": "yeni.com"}'::jsonb, :'v6');
select is((select website_status from public.businesses where id = :'b1'), 'GOOD_WEBSITE', 'Aynı site yeniden gönderilirse analiz sıfırlanmaz');

-- 5) Yalıtım
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspaces (id, name, created_by) values ('e8ffffff-0000-0000-0000-000000000009', 'Other WS', 'e8000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values ('e8ffffff-0000-0000-0000-000000000009', 'e8000000-0000-0000-0000-000000000002', 'ADMIN');
insert into public.workspace_settings (workspace_id) values ('e8ffffff-0000-0000-0000-000000000009');
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_like(format($q$select public.update_business_details(%L, '{"name": "Hack"}'::jsonb, 1)$q$, :'b1'), '%business not found%', 'Başka çalışma alanının işletmesi düzenlenemez');
select lives_ok(format($q$update public.businesses set name = 'Hack' where id = %L$q$, :'b1'), 'Başka çalışma alanında doğrudan UPDATE hata vermez (RLS satırı göstermez)');

reset role;
select is((select name from public.businesses where id = :'b1'), 'Site Aynı', 'Başka çalışma alanının doğrudan UPDATE''i adı değiştirmedi');

select * from finish();

rollback;
