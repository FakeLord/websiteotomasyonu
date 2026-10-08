-- ADR 0014: tarama planı, kare sahipliği/bölme, sunucuda zorlanan aylık Places sayacı ve çalışma alanı yalıtımı.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(35);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e5000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'scan1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e5000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'scan2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Scan WS') as ws \gset

\set bounds '{"low": {"lat": 30.0, "lng": -98.0}, "high": {"lat": 30.4, "lng": -97.6}}'
\set cats '[{"label": "Oto Servis", "query": "Auto repair shop"}, {"label": "Berber", "query": "Barber shop"}]'

-- 1) Bütçe zorunlu: aylık sınır yokken plan oluşturulamaz.
select throws_like(
  format($q$select public.create_scan_plan(%L, 'us', 'Austin', %L::jsonb, %L::jsonb, 'en')$q$, :'ws', :'bounds', :'cats'),
  '%budget_required%',
  'Aylık Places sınırı tanımlı değilken tarama planı oluşturulamaz'
);

update public.workspace_settings
set outreach_limits = jsonb_set(outreach_limits, '{places_monthly_cap}', '3')
where workspace_id = :'ws';

-- 2) Plan oluşturma: kategori başına bir kök kare.
select public.create_scan_plan(:'ws', 'us', 'Austin', :'bounds'::jsonb, :'cats'::jsonb, 'en') as plan \gset
select is((select country_code from public.scan_plans where id = :'plan'), 'US', 'Ülke kodu büyük harfe çevrilir');
select is((select status from public.scan_plans where id = :'plan'), 'ACTIVE', 'Yeni plan ACTIVE başlar');
select is((select count(*)::int from public.scan_tiles where plan_id = :'plan'), 2, 'Her kategori için bir kök kare oluşur');
select ok(
  (select bool_and(depth = 0 and status = 'QUEUED' and low_lat = 30.0 and high_lng = -97.6) from public.scan_tiles where plan_id = :'plan'),
  'Kök kareler şehir sınırını kapsar ve kuyruktadır'
);
select is(
  (select count(*)::int from public.activity_logs where workspace_id = :'ws' and action = 'scan.plan_created'), 1,
  'Plan oluşturma aktivite günlüğüne yazılır'
);

-- 3) Geçersiz girdiler.
select throws_like(
  format($q$select public.create_scan_plan(%L, 'US', 'Austin', %L::jsonb, '[]'::jsonb, 'en')$q$, :'ws', :'bounds'),
  '%between 1 and 30%', 'Boş kategori listesi reddedilir'
);
select throws_ok(
  format($q$select public.create_scan_plan(%L, 'US', 'Austin', '{"low": {"lat": 31, "lng": -97}, "high": {"lat": 30, "lng": -98}}'::jsonb, %L::jsonb, 'en')$q$, :'ws', :'cats'),
  '23514', null, 'Ters (güneybatısı kuzeydoğusunun üstünde) sınır reddedilir'
);
select throws_ok(
  format($q$select public.create_scan_plan(%L, 'US', 'Austin', %L::jsonb, %L::jsonb, 'de')$q$, :'ws', :'bounds', :'cats'),
  '23514', null, 'Desteklenmeyen dil reddedilir'
);

-- 4) Doğrudan yazma kapalı.
select throws_ok(
  format($q$insert into public.scan_tiles (workspace_id, plan_id, category_label, text_query, low_lat, low_lng, high_lat, high_lng) values (%L, %L, 'x', 'x', 1, 1, 2, 2)$q$, :'ws', :'plan'),
  '42501', null, 'İstemci kare tablosuna doğrudan yazamaz'
);
select throws_ok(
  format($q$update public.scan_plans set status = 'DONE' where id = %L$q$, :'plan'),
  '42501', null, 'İstemci plan durumunu doğrudan değiştiremez'
);
select throws_ok(
  format($q$select public.consume_places_call(%L)$q$, :'ws'),
  '42501', null, 'Sayaç tüketimi istemciye kapalıdır (yalnızca service_role)'
);

-- 5) Kare sahipliği: iki cihaz aynı kareyi alamaz.
select (public.claim_next_scan_tile(:'ws', 'device-A') ->> 'tileId') as tile_a \gset
select (public.claim_next_scan_tile(:'ws', 'device-B') ->> 'tileId') as tile_b \gset
select isnt(:'tile_a'::text, :'tile_b'::text, 'İki cihaz farklı kareler alır');
select ok(public.claim_next_scan_tile(:'ws', 'device-C') is null, 'Kuyrukta kare kalmayınca null döner');
select throws_like(
  format($q$select public.complete_scan_tile(%L, 'device-B', 'DONE', 5, 5, 1)$q$, :'tile_a'),
  '%not claimed by this device%', 'Başka cihazın karesi kapatılamaz'
);

-- 6) Bölme: dolu kare dört çeyreğe ayrılır.
select is(
  (public.complete_scan_tile(:'tile_a', 'device-A', 'SPLIT', 60, 41, 3) ->> 'split')::boolean, true,
  'Dolu kare SPLIT ile kapatılınca bölünür'
);
select is((select status from public.scan_tiles where id = :'tile_a'), 'SPLIT', 'Bölünen kare SPLIT olur');
select is(
  (select count(*)::int from public.scan_tiles where plan_id = :'plan' and depth = 1 and status = 'QUEUED'), 4,
  'Dört çocuk kare kuyruğa alınır'
);
select ok(
  (select bool_and(low_lat < high_lat and low_lng < high_lng) and min(low_lat) = 30.0 and max(high_lat) = 30.4
      and min(low_lng) = -98.0 and max(high_lng) = -97.6
      and count(*) filter (where low_lat = 30.2 or high_lat = 30.2) = 4
   from public.scan_tiles where plan_id = :'plan' and depth = 1),
  'Çocuk kareler ebeveynin alanını orta noktadan dörde böler'
);

-- 7) Sıradaki kare: sığ olan önce (kalan kök kare zaten device-B'de; sonra çocuklar gelir).
select is((public.complete_scan_tile(:'tile_b', 'device-B', 'DONE', 12, 12, 1) ->> 'planDone')::boolean, false, 'Çocuk kareler varken plan bitmez');
select (public.claim_next_scan_tile(:'ws', 'device-A') ->> 'tileId') as child1 \gset
select is((select depth from public.scan_tiles where id = :'child1'), 1, 'Sıradaki kare çocuk karelerden biridir');

-- 8) Bütçe: QUOTA ile kapatılan kare kuyruğa döner, plan BUDGET_PAUSED olur.
select is(
  (public.complete_scan_tile(:'child1', 'device-A', 'QUOTA') ->> 'budgetPaused')::boolean, true,
  'Sınır dolunca plan bütçe nedeniyle duraklar'
);
select is((select status from public.scan_plans where id = :'plan'), 'BUDGET_PAUSED', 'Plan BUDGET_PAUSED');
select is((select status || ':' || attempts from public.scan_tiles where id = :'child1'), 'QUEUED:0', 'Kare kuyruğa döner, deneme sayılmaz');

reset role;
-- Sayaç sınırda (3/3): duraklamış plan sürmez.
insert into public.places_usage (workspace_id, month, calls) values (:'ws', date_trunc('month', now())::date, 3)
on conflict (workspace_id, month) do update set calls = 3;
select is((public.consume_places_call(:'ws') ->> 'allowed')::boolean, false, 'Sınır dolduğunda sayaç tüketimi reddedilir');
select is((select calls from public.places_usage where workspace_id = :'ws'), 3, 'Reddedilen çağrı sayacı artırmaz');
-- Başarısız Google çağrısı iade edilir; iade sonrası tüketim yeniden kabul edilir.
select public.refund_places_call(:'ws');
select is((select calls from public.places_usage where workspace_id = :'ws'), 2, 'İade sayacı bir azaltır');
select is((public.consume_places_call(:'ws') ->> 'allowed')::boolean, true, 'İadeden sonra tüketim kabul edilir');
select is((select calls from public.places_usage where workspace_id = :'ws'), 3, 'Kabul edilen çağrı sayacı artırır');

set local role authenticated;
select ok(public.claim_next_scan_tile(:'ws', 'device-A') is null, 'Sınır doluyken BUDGET_PAUSED plan kare vermez');

-- Sınır yükseltilince plan kendiliğinden sürer.
update public.workspace_settings
set outreach_limits = jsonb_set(outreach_limits, '{places_monthly_cap}', '10')
where workspace_id = :'ws';
select ok(public.claim_next_scan_tile(:'ws', 'device-A') is not null, 'Sınır yükseltilince plan sürer ve kare verir');

-- 9) Duraklat / iptal.
select public.set_scan_plan_status(:'plan', 'PAUSED');
select ok(public.claim_next_scan_tile(:'ws', 'device-B') is null, 'Duraklatılmış plan kare vermez');

-- 10) Yalıtım: başka çalışma alanının üyesi planı göremez, kare alamaz, durumunu değiştiremez.
--     (Kurulum oturumsuz yapılır: loglayan tetikler üyelik ister; bootstrap yalnızca ilk çalışma alanı içindir.)
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspaces (id, name, created_by) values ('e5ffffff-0000-0000-0000-000000000009', 'Other WS', 'e5000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values ('e5ffffff-0000-0000-0000-000000000009', 'e5000000-0000-0000-0000-000000000002', 'ADMIN');
insert into public.workspace_settings (workspace_id) values ('e5ffffff-0000-0000-0000-000000000009');

select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is((select count(*)::int from public.scan_plans), 0, 'Başka çalışma alanının planları görünmez');
select throws_like(
  format($q$select public.claim_next_scan_tile(%L, 'device-X')$q$, :'ws'),
  '%not a member%', 'Başka çalışma alanının kareleri alınamaz'
);
select throws_like(
  format($q$select public.set_scan_plan_status(%L, 'CANCELLED')$q$, :'plan'),
  '%scan plan not found%', 'Başka çalışma alanının planı değiştirilemez'
);

reset role;

select * from finish();

rollback;
