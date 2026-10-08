begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ec000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rn1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ec000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rn2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'ec000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Eski Ad') as ws \gset

select is((public.rename_workspace(:'ws', '  Yeni Ad  ')).name, 'Yeni Ad', 'Ad kırpılarak güncellenir');
select is((select name from public.workspaces where id = :'ws'), 'Yeni Ad', 'Değişiklik kalıcıdır');
select is((select count(*)::int from public.activity_logs where workspace_id = :'ws' and action = 'workspace.renamed'), 1, 'Ad değişikliği aktivite günlüğüne yazılır');
select public.rename_workspace(:'ws', 'Yeni Ad');
select is((select count(*)::int from public.activity_logs where workspace_id = :'ws' and action = 'workspace.renamed'), 1, 'Aynı ad tekrar gönderilirse yeni kayıt düşmez');
select throws_like(format($q$select public.rename_workspace(%L, 'x')$q$, :'ws'), '%between 2 and 80%', 'Çok kısa ad reddedilir');
select throws_like(format($q$select public.rename_workspace(%L, %L)$q$, :'ws', repeat('a', 81)), '%between 2 and 80%', 'Çok uzun ad reddedilir');
update public.workspaces set name = 'Hack' where id = :'ws';
select is((select name from public.workspaces where id = :'ws'), 'Yeni Ad', 'İstemcinin doğrudan UPDATE''i adı değiştirmez (güncelleme politikası yok)');

reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', 'ec000000-0000-0000-0000-000000000002', 'AGENT');
select set_config('request.jwt.claim.sub', 'ec000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_like(format($q$select public.rename_workspace(%L, 'Hack Ad')$q$, :'ws'), '%admin role required%', 'Yönetici olmayan üye adı değiştiremez');

reset role;

select * from finish();

rollback;
