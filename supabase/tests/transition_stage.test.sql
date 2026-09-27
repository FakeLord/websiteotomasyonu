-- transition_stage: geçerli geçişler kabul edilir, geçersizler ve versiyon
-- çakışmaları reddedilir (SPEC.md → K).
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(5);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pipeline@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Pipeline Workspace');

select public.import_business(
  (select id from public.workspaces where name = 'Pipeline Workspace'),
  jsonb_build_object('name', 'Pipeline Test İşletmesi', 'source', 'MANUAL'),
  null
);

-- NEW -> QUALIFIED geçerli.
select lives_ok(
  $$ select public.transition_stage(
       (select id from public.businesses where name = 'Pipeline Test İşletmesi'),
       'QUALIFIED', null, 1
     ) $$,
  'NEW -> QUALIFIED geçişi kabul edilir'
);

-- QUALIFIED -> WON geçersiz (doğrudan atlanamaz).
select throws_like(
  $$ select public.transition_stage(
       (select id from public.businesses where name = 'Pipeline Test İşletmesi'),
       'WON', null, 2
     ) $$,
  '%invalid_transition%',
  'QUALIFIED -> WON geçişi reddedilir'
);

-- Yanlış expected_version ile geçiş reddedilir (iyimser kilit).
select throws_like(
  $$ select public.transition_stage(
       (select id from public.businesses where name = 'Pipeline Test İşletmesi'),
       'OUTREACH_READY', null, 99
     ) $$,
  '%version_conflict%',
  'Yanlış expected_version ile geçiş reddedilir'
);

-- Doğru versiyonla devam edilebilir.
select lives_ok(
  $$ select public.transition_stage(
       (select id from public.businesses where name = 'Pipeline Test İşletmesi'),
       'OUTREACH_READY', null, 2
     ) $$,
  'QUALIFIED -> OUTREACH_READY doğru versiyonla kabul edilir'
);

select is(
  (select count(*)::int from public.stage_transitions
     where business_id = (select id from public.businesses where name = 'Pipeline Test İşletmesi')),
  2,
  'Her başarılı geçiş stage_transitions''a bir satır yazar'
);

reset role;

select * from finish();

rollback;
