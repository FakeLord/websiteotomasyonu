-- dashboard_metrics / shell_counters: yalnızca üyeler çağırabilir, sayımlar
-- workspace'e göre izole ve günlük seri istenen gün sayısı kadar.
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
set local client_min_messages = warning;
truncate table public.workspaces cascade;
-- G2: businesses.country_code zorunludur (üretimde yalnızca import_business satır ekler). Bu fikstür doğrudan
-- INSERT yaptığı için varsayılan yalnızca bu transaction'da verilir; dosya sonundaki rollback geri alır.
alter table public.businesses alter column country_code set default 'TR';


select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'd1d1d1d1-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'dash-a@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1d1d1d1-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'dash-b@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'd1d1d1d1-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Dash WS') as ws \gset
reset role;

insert into public.businesses (workspace_id, name, normalized_name, stage, created_by)
values
  (:'ws', 'Alfa Diş', 'alfa dis', 'NEW', 'd1d1d1d1-0000-0000-0000-000000000001'),
  (:'ws', 'Beta Kuaför', 'beta kuafor', 'NEW', 'd1d1d1d1-0000-0000-0000-000000000001'),
  (:'ws', 'Gama Vet', 'gama vet', 'WON', 'd1d1d1d1-0000-0000-0000-000000000001');

set local role authenticated;

select is(
  jsonb_array_length(public.dashboard_metrics(:'ws', 7) -> 'series'),
  7,
  '7 günlük seri 7 gün döner'
);

select is(
  (public.dashboard_metrics(:'ws', 7) -> 'current' ->> 'found')::integer,
  3,
  'Bu dönemde bulunan işletme sayısı doğru'
);

select is(
  public.dashboard_metrics(:'ws', 7) -> 'stageCounts',
  '{"NEW": 2, "WON": 1}'::jsonb,
  'Aşama dağılımı doğru'
);

select is(
  public.shell_counters(:'ws'),
  '{"awaitingReply": 0, "overdueFollowUps": 0, "openHandoffs": 0}'::jsonb,
  'Boş workspace için üst çubuk sayaçları sıfır'
);

select set_config('request.jwt.claim.sub', 'd1d1d1d1-0000-0000-0000-000000000002', true);

select throws_like(
  format('select public.dashboard_metrics(%L, 7)', :'ws'),
  '%not a member%',
  'Üye olmayan dashboard_metrics çağıramaz'
);

select throws_like(
  format('select public.shell_counters(%L)', :'ws'),
  '%not a member%',
  'Üye olmayan shell_counters çağıramaz'
);

select throws_like(
  format('select public.metrics_period_counts(%L, now() - interval ''1 day'', now())', :'ws'),
  '%permission denied%',
  'İç yardımcı fonksiyon doğrudan çağrılamaz'
);

select * from finish();

rollback;
