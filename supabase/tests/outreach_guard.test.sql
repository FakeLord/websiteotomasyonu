-- outreach_guard(): DNC her zaman engeller; günlük limit doldurulunca
-- DAILY_OUTREACH_LIMIT eklenir; workspace izolasyonu korunur (SPEC.md → I.5).
-- Not: gönderim saati/kanal soğuma kontrolleri test çalıştırma saatine bağlı
-- olduğu için burada `allowed` üzerinden değil, ilgili `reasons` girdisinin
-- varlığı/yokluğu üzerinden doğrulanır (bkz. docs/adr/0005-scoring-and-outreach-guard.md).
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(5);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'ad111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'og@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

create temporary table og_test_ids (label text primary key, id uuid);
grant all on og_test_ids to authenticated;

select set_config('request.jwt.claim.sub', 'ad111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select public.bootstrap_workspace('OG Workspace');

insert into og_test_ids values ('workspace', (select id from public.workspaces where name = 'OG Workspace'));

select public.import_business(
  (select id from og_test_ids where label = 'workspace'),
  jsonb_build_object('name', 'DNC İşletmesi', 'source', 'MANUAL'),
  null
);
insert into og_test_ids values ('dnc_business', (select id from public.businesses where name = 'DNC İşletmesi'));

select public.import_business(
  (select id from og_test_ids where label = 'workspace'),
  jsonb_build_object('name', 'Normal İşletme', 'source', 'MANUAL'),
  null
);
insert into og_test_ids values ('normal_business', (select id from public.businesses where name = 'Normal İşletme'));

select public.set_dnc((select id from og_test_ids where label = 'dnc_business'), true, 'test');

select is(
  (public.outreach_guard((select id from og_test_ids where label = 'dnc_business'), 'EMAIL') ->> 'allowed')::boolean,
  false,
  'DNC işaretli işletme için outreach_guard allowed=false döner'
);

select ok(
  (public.outreach_guard((select id from og_test_ids where label = 'dnc_business'), 'EMAIL') -> 'reasons') @> '["DO_NOT_CONTACT"]'::jsonb,
  'DNC işletmesi için reasons DO_NOT_CONTACT içerir'
);

select ok(
  not ((public.outreach_guard((select id from og_test_ids where label = 'normal_business'), 'EMAIL') -> 'reasons') @> '["DO_NOT_CONTACT"]'::jsonb),
  'DNC olmayan işletme için reasons DO_NOT_CONTACT içermez'
);

reset role;

-- Günlük limiti postgres context'inde doğrudan stage_transitions'a CONTACTED
-- geçmişi yazarak doldur (transition_stage() her seferinde tam pipeline
-- kuralları uygular; burada yalnızca outreach_guard'ın sayımını test ediyoruz).
insert into public.stage_transitions (workspace_id, business_id, from_stage, to_stage, actor_type, actor_user_id, created_at)
select
  (select id from og_test_ids where label = 'workspace'),
  (select id from og_test_ids where label = 'normal_business'),
  'NEW', 'CONTACTED', 'USER', 'ad111111-1111-1111-1111-111111111111', now()
from generate_series(1, 40);

select set_config('request.jwt.claim.sub', 'ad111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select ok(
  (public.outreach_guard((select id from og_test_ids where label = 'normal_business'), 'EMAIL') -> 'reasons') @> '["DAILY_OUTREACH_LIMIT"]'::jsonb,
  'Günlük limit (varsayılan 40) dolunca DAILY_OUTREACH_LIMIT eklenir'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Bob başka bir workspace'ten DNC işletmesine erişmeye çalışır.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'ad222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'og-bob@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());
insert into public.workspaces (id, name, created_by)
values ('cccccccc-0000-0000-0000-000000000003', 'OG Workspace B', 'ad222222-2222-2222-2222-222222222222');
insert into public.workspace_members (workspace_id, user_id, role)
values ('cccccccc-0000-0000-0000-000000000003', 'ad222222-2222-2222-2222-222222222222', 'ADMIN');
insert into public.workspace_settings (workspace_id)
values ('cccccccc-0000-0000-0000-000000000003');

select set_config('request.jwt.claim.sub', 'ad222222-2222-2222-2222-222222222222', true);
set local role authenticated;

select throws_like(
  format(
    $$select public.outreach_guard(%L, 'EMAIL')$$,
    (select id from og_test_ids where label = 'dnc_business')
  ),
  '%not found or not accessible%',
  'Bob, başka workspace''in işletmesi için outreach_guard çağıramaz'
);

reset role;

select * from finish();

rollback;
