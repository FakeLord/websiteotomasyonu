-- G2 (ADR 0012): pazar filtresi (ülke → şehir). dashboard_metrics, report_metrics ve analytics_summary
-- p_country/p_city ile yalnızca seçili pazarı sayar; market_options kırılımı verir; başka workspace görünmez;
-- kampanya segmenti ülkeye göre süzer; anlaşma para birimi GBP/CAD/AUD kabul eder.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(15);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e4000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mkt1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e4000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mkt2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'e4000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Market WS') as ws \gset

-- İki ABD (Austin, Dallas), bir İngiltere (London), bir Türkiye (İstanbul) kaydı
select (public.import_business(:'ws', '{"name": "Austin Dental", "source": "MANUAL", "countryCode": "US", "city": "Austin", "email": "a@austin.test"}'::jsonb) ->> 'businessId') as austin \gset
select (public.import_business(:'ws', '{"name": "Dallas Dental", "source": "MANUAL", "countryCode": "US", "city": "Dallas", "email": "d@dallas.test"}'::jsonb) ->> 'businessId') as dallas \gset
select (public.import_business(:'ws', '{"name": "London Dental", "source": "MANUAL", "countryCode": "GB", "city": "London", "email": "l@london.test"}'::jsonb) ->> 'businessId') as london \gset
select (public.import_business(:'ws', '{"name": "Istanbul Dental", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul", "email": "i@istanbul.test"}'::jsonb) ->> 'businessId') as istanbul \gset

-- 1) market_options: ülke ve şehir kırılımı
select is(jsonb_array_length(public.market_options(:'ws')), 4, 'market_options 4 (ülke, şehir) çifti döner');
select ok(
  (select bool_and((e ->> 'count')::int = 1) from jsonb_array_elements(public.market_options(:'ws')) e),
  'Her çiftin adedi 1'
);

-- 2) dashboard_metrics: filtresiz toplam, ülke ve şehir filtresi
select is((public.dashboard_metrics(:'ws', 7) ->> 'totalBusinesses')::int, 4, 'Filtresiz dashboard 4 işletme sayar');
select is((public.dashboard_metrics(:'ws', 7, 'US', null) ->> 'totalBusinesses')::int, 2, 'US filtresi 2 işletme sayar');
select is((public.dashboard_metrics(:'ws', 7, 'US', 'Austin') ->> 'totalBusinesses')::int, 1, 'US/Austin filtresi 1 işletme sayar');
select is((public.dashboard_metrics(:'ws', 7, 'AU', null) ->> 'totalBusinesses')::int, 0, 'Kaydı olmayan ülke 0 sayar');
select is((public.dashboard_metrics(:'ws', 7, 'GB', null) -> 'current' ->> 'found')::int, 1, 'Dönem sayacı (found) pazara göre süzülür');

-- 3) report_metrics: huni ve toplamlar pazara göre
select is(
  (public.report_metrics(:'ws', current_date - 1, current_date + 1) -> 'funnel' ->> 'found')::int, 4,
  'Filtresiz rapor huni 4 bulunan işletme'
);
select is(
  (public.report_metrics(:'ws', current_date - 1, current_date + 1, 'US', null) -> 'funnel' ->> 'found')::int, 2,
  'Rapor huni US filtresiyle 2'
);

-- 4) analytics_summary pazar filtresi
select is((public.analytics_summary(:'ws') ->> 'newLeads')::int, 4, 'analytics_summary filtresiz 4 yeni lead');
select is((public.analytics_summary(:'ws', 'TR', null) ->> 'newLeads')::int, 1, 'analytics_summary TR filtresiyle 1');

-- 5) Anlaşma para birimi: GBP kabul edilir, geçersiz reddedilir (anlaşma WON aşaması ister)
reset role;
update public.businesses set stage = 'WON' where id = :'london';
set local role authenticated;
select lives_ok(
  format($q$select public.upsert_customer_deal(%L, null, 'Standart', 100, 'GBP', 'ONE_TIME', current_date, 'ACTIVE', null)$q$, :'london'),
  'GBP anlaşma para birimi kabul edilir'
);
select throws_like(
  format($q$select public.upsert_customer_deal(%L, null, 'Standart', 100, 'JPY', 'ONE_TIME', current_date, 'ACTIVE', null)$q$, :'london'),
  '%customer_deals_currency_check%',
  'Desteklenmeyen para birimi reddedilir'
);
reset role;

-- 6) Başka workspace'in verisi görünmez (kurulum oturumsuz yapılır: loglayan tetikler üyelik ister)
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspaces (id, name, created_by) values ('e4ffffff-0000-0000-0000-000000000009', 'Diğer WS', 'e4000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values ('e4ffffff-0000-0000-0000-000000000009', 'e4000000-0000-0000-0000-000000000002', 'ADMIN');
insert into public.workspace_settings (workspace_id) values ('e4ffffff-0000-0000-0000-000000000009');

select set_config('request.jwt.claim.sub', 'e4000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is(jsonb_array_length(public.market_options('e4ffffff-0000-0000-0000-000000000009')), 0, 'Diğer workspace boş pazar listesi görür');
select throws_like(
  format($q$select public.market_options(%L)$q$, :'ws'),
  '%not a member%',
  'Üye olmayan başka workspace''in pazarlarını göremez'
);

select * from finish();

rollback;
