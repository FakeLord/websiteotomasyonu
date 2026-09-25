-- services/service_packages/kb_entries: yalnızca admin yazar, üyeler okur;
-- yazma activity_logs'a düşer. ai_runs: yalnızca admin okuyabilir, client
-- INSERT edemez (SPEC.md → E, J).
begin;

select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'cb111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'kb-admin@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cb222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'kb-member@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

create temporary table kb_test_ids (label text primary key, id uuid);
grant all on kb_test_ids to authenticated;

select set_config('request.jwt.claim.sub', 'cb111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select public.bootstrap_workspace('KB Workspace');
insert into kb_test_ids values ('workspace', (select id from public.workspaces where name = 'KB Workspace'));

-- Admin bir hizmet + paket oluşturur.
insert into public.services (workspace_id, name)
values ((select id from kb_test_ids where label = 'workspace'), 'Website Tasarımı')
returning id;

select is(
  (select count(*)::int from public.services where workspace_id = (select id from kb_test_ids where label = 'workspace')),
  1,
  'Admin bir services kaydı oluşturabilir'
);

select is(
  (select count(*)::int from public.activity_logs
     where workspace_id = (select id from kb_test_ids where label = 'workspace') and action = 'services.insert'),
  1,
  'services INSERT işlemi activity_logs''a düşer'
);

reset role;

-- Bob'u aynı workspace'e MEMBER olarak ekle (postgres context'inde fixture).
insert into public.workspace_members (workspace_id, user_id, role)
values ((select id from kb_test_ids where label = 'workspace'), 'cb222222-2222-2222-2222-222222222222', 'MEMBER');

select set_config('request.jwt.claim.sub', 'cb222222-2222-2222-2222-222222222222', true);
set local role authenticated;

select is(
  (select count(*)::int from public.services where workspace_id = (select id from kb_test_ids where label = 'workspace')),
  1,
  'MEMBER services''i SELECT ile görebilir'
);

select throws_like(
  format(
    $$insert into public.services (workspace_id, name) values (%L, 'Yetkisiz Hizmet')$$,
    (select id from kb_test_ids where label = 'workspace')
  ),
  '%row-level security%',
  'MEMBER services''e INSERT yapamaz (yalnızca admin)'
);

select is(
  (select count(*)::int from public.ai_runs where workspace_id = (select id from kb_test_ids where label = 'workspace')),
  0,
  'MEMBER, hiç ai_runs satırı olmadığından 0 görür (yazma zaten yalnızca service_role''dedir)'
);

reset role;

-- postgres (service_role benzeri, RLS'ten bağımsız) bir ai_runs satırı ekler.
insert into public.ai_runs (workspace_id, provider, model, operation, prompt_version, status, requested_by)
values ((select id from kb_test_ids where label = 'workspace'), 'nvidia', 'test-model', 'draft_first_message', 1, 'OK', 'cb111111-1111-1111-1111-111111111111');

select set_config('request.jwt.claim.sub', 'cb222222-2222-2222-2222-222222222222', true);
set local role authenticated;

select is(
  (select count(*)::int from public.ai_runs where workspace_id = (select id from kb_test_ids where label = 'workspace')),
  0,
  'MEMBER, admin olmadığı için ai_runs satırlarını göremez'
);

reset role;

select set_config('request.jwt.claim.sub', 'cb111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select is(
  (select count(*)::int from public.ai_runs where workspace_id = (select id from kb_test_ids where label = 'workspace')),
  1,
  'ADMIN ai_runs satırını görebilir'
);

reset role;

select * from finish();

rollback;
