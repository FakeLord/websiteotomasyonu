-- ADR 0015: zincir/şube tespiti (chain_size) ve sektör/şehir performans raporu.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(15);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e6000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'chain1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e6000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'chain2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'e6000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Chain WS') as ws \gset

-- 1) Aynı ad + kategori + 3 farklı ilçe → zincir
select (public.import_business(:'ws', '{"name": "Starbucks", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul", "district": "Kadıköy", "category": "Kafe", "googlePlaceId": "p1"}'::jsonb) ->> 'businessId') as c1 \gset
select is((select chain_size from public.businesses where id = :'c1'), 1, 'Tek kayıt zincir değildir');

select (public.import_business(:'ws', '{"name": "Starbucks", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul", "district": "Beşiktaş", "category": "Kafe", "googlePlaceId": "p2"}'::jsonb) ->> 'businessId') as c2 \gset
select isnt(:'c1'::text, :'c2'::text, 'Aynı ad farklı ilçede ayrı kayıt olarak eklenir');
select is((select chain_size from public.businesses where id = :'c1'), 1, 'İki ilçe henüz zincir sayılmaz (genel ad riski)');

select (public.import_business(:'ws', '{"name": "Starbucks", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul", "district": "Şişli", "category": "Kafe", "googlePlaceId": "p3"}'::jsonb) ->> 'businessId') as c3 \gset
select is((select chain_size from public.businesses where id = :'c1'), 3, 'Üç farklı ilçedeki aynı ad zincirdir; eski kayıt da güncellenir');
select is((select chain_size from public.businesses where id = :'c3'), 3, 'Yeni eklenen kayıt da 3 görür');

-- 2) Aynı ad ama farklı kategori zincir değildir
select (public.import_business(:'ws', '{"name": "Starbucks", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul", "district": "Üsküdar", "category": "Restoran", "googlePlaceId": "p4"}'::jsonb) ->> 'businessId') as c4 \gset
select is((select chain_size from public.businesses where id = :'c4'), 1, 'Farklı kategorideki aynı ad zincire katılmaz');

-- 3) Aynı ilçede tekrarlanan ad zincir sinyali değildir
select (public.import_business(:'ws', '{"name": "Gülümse Diş", "source": "MANUAL", "countryCode": "TR", "city": "Ankara", "district": "Çankaya", "category": "Diş Kliniği", "googlePlaceId": "q1"}'::jsonb) ->> 'businessId') as d1 \gset
select public.import_business(:'ws', '{"name": "Gülümse Diş", "source": "MANUAL", "countryCode": "TR", "city": "Ankara", "district": "Çankaya", "category": "Diş Kliniği", "googlePlaceId": "q2"}'::jsonb);
select public.import_business(:'ws', '{"name": "Gülümse Diş", "source": "MANUAL", "countryCode": "TR", "city": "Ankara", "district": "Çankaya", "category": "Diş Kliniği", "googlePlaceId": "q3"}'::jsonb);
select is((select chain_size from public.businesses where id = :'d1'), 1, 'Aynı ilçede üç kez geçen ad zincir sayılmaz');

-- 4) Birleştirilen kayıt gruptan düşer; istemci chain_size yazamaz
reset role;
update public.businesses set merged_into = :'c3' where id = :'c2';
select is((select chain_size from public.businesses where id = :'c1'), 1, 'Birleştirilen kayıt gruptan düşünce zincir küçülür');
set local role authenticated;
select throws_ok(
  format($q$update public.businesses set chain_size = 9 where id = %L$q$, :'c1'),
  '42501', null, 'İstemci chain_size değerini değiştiremez'
);

-- 5) market_performance
select (public.import_business(:'ws', '{"name": "Cevap Veren Klinik", "source": "MANUAL", "countryCode": "TR", "city": "Bursa", "category": "Veteriner"}'::jsonb) ->> 'businessId') as v1 \gset
select (public.import_business(:'ws', '{"name": "Sessiz Klinik Bursa", "source": "MANUAL", "countryCode": "TR", "city": "Bursa", "category": "Veteriner"}'::jsonb) ->> 'businessId') as v2 \gset
reset role;
update public.businesses set website_status = 'NO_WEBSITE' where id = :'v1';
insert into public.conversations (id, workspace_id, business_id, channel) values
  ('e6aaaaaa-0000-0000-0000-000000000001', :'ws', :'v1', 'EMAIL'),
  ('e6aaaaaa-0000-0000-0000-000000000002', :'ws', :'v2', 'EMAIL');
insert into public.messages (workspace_id, conversation_id, direction, status, body, author_type, sent_at) values
  (:'ws', 'e6aaaaaa-0000-0000-0000-000000000001', 'OUT', 'SENT', 'merhaba', 'USER', now()),
  (:'ws', 'e6aaaaaa-0000-0000-0000-000000000001', 'IN', 'RECEIVED', 'tamam', 'SYSTEM', now()),
  (:'ws', 'e6aaaaaa-0000-0000-0000-000000000002', 'OUT', 'SENT', 'merhaba', 'USER', now()),
  (:'ws', 'e6aaaaaa-0000-0000-0000-000000000002', 'OUT', 'DRAFT', 'taslak', 'USER', null);
set local role authenticated;

select is(
  (select (e ->> 'contacted')::int from jsonb_array_elements(public.market_performance(:'ws') -> 'byCategory') e where e ->> 'key' = 'Veteriner'),
  2, 'Yalnızca SENT giden mesajı olan işletmeler "yazılan" sayılır (taslak sayılmaz)'
);
select is(
  (select (e ->> 'replied')::int from jsonb_array_elements(public.market_performance(:'ws') -> 'byCategory') e where e ->> 'key' = 'Veteriner'),
  1, 'Gelen mesajı olan işletme "cevap veren" sayılır'
);
select is(
  (select (e ->> 'opportunities')::int from jsonb_array_elements(public.market_performance(:'ws') -> 'byCategory') e where e ->> 'key' = 'Veteriner'),
  1, 'Sitesi olmayan işletme fırsat sayılır'
);
select is(
  (select (e ->> 'found')::int from jsonb_array_elements(public.market_performance(:'ws', null, 'Bursa') -> 'byCity') e where e ->> 'key' = 'Bursa'),
  2, 'Şehir kırılımı pazar filtresine uyar'
);
select is(
  jsonb_array_length(public.market_performance(:'ws', 'US', null) -> 'byCategory'), 0,
  'Kaydı olmayan ülkede kırılım boş döner'
);

-- 6) Yalıtım
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspaces (id, name, created_by) values ('e6ffffff-0000-0000-0000-000000000009', 'Other WS', 'e6000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values ('e6ffffff-0000-0000-0000-000000000009', 'e6000000-0000-0000-0000-000000000002', 'ADMIN');
insert into public.workspace_settings (workspace_id) values ('e6ffffff-0000-0000-0000-000000000009');
select set_config('request.jwt.claim.sub', 'e6000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_like(
  format($q$select public.market_performance(%L)$q$, :'ws'),
  '%not a member%', 'Başka çalışma alanının performansı okunamaz'
);

reset role;

select * from finish();

rollback;
