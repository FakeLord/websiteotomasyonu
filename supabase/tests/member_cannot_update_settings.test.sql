-- MEMBER rolü workspace_settings güncelleyemez; ADMIN güncelleyebilir.
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
truncate table public.workspaces cascade;

select plan(3);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'admin@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'member@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;
select public.bootstrap_workspace('Test Workspace');
reset role;

insert into public.workspace_members (workspace_id, user_id, role)
select id, '44444444-4444-4444-4444-444444444444', 'MEMBER'
from public.workspaces where name = 'Test Workspace';

-- MEMBER güncelleyemez.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
set local role authenticated;

update public.workspace_settings
set automation_level = 'LEVEL_2'
where workspace_id = (select id from public.workspaces where name = 'Test Workspace');

reset role;

select is(
  (select automation_level from public.workspace_settings
     where workspace_id = (select id from public.workspaces where name = 'Test Workspace')),
  'LEVEL_1',
  'MEMBER''in güncelleme denemesi hiçbir satırı değiştirmez'
);

-- ADMIN güncelleyebilir.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;

update public.workspace_settings
set automation_level = 'LEVEL_2'
where workspace_id = (select id from public.workspaces where name = 'Test Workspace');

reset role;

select is(
  (select automation_level from public.workspace_settings
     where workspace_id = (select id from public.workspaces where name = 'Test Workspace')),
  'LEVEL_2',
  'ADMIN ayarları başarıyla günceller'
);

select is(
  (select count(*)::int from public.activity_logs
     where workspace_id = (select id from public.workspaces where name = 'Test Workspace')
       and action = 'settings.updated'),
  1,
  'Ayar güncellemesi activity log''a düşer'
);

select * from finish();

rollback;
