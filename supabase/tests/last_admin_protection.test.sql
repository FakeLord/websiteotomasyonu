-- Bir workspace'in son ADMIN'i düşürülemez veya silinemez.
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
truncate table public.workspaces cascade;

select plan(4);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888', 'authenticated', 'authenticated', 'soleadmin@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999', 'authenticated', 'authenticated', 'secondadmin@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);
set local role authenticated;
select public.bootstrap_workspace('Admin Test Workspace');
reset role;

-- Tek admin varken düşürme/silme denemesi reddedilmeli.
select throws_like(
  $$ update public.workspace_members set role = 'MEMBER'
       where user_id = '88888888-8888-8888-8888-888888888888' $$,
  '%last ADMIN%',
  'Tek admin''i MEMBER''e düşürme reddedilir'
);

select throws_like(
  $$ delete from public.workspace_members
       where user_id = '88888888-8888-8888-8888-888888888888' $$,
  '%last ADMIN%',
  'Tek admin''i silme reddedilir'
);

-- İkinci bir admin eklenince artık ilk admin düşürülebilir/silinebilir.
insert into public.workspace_members (workspace_id, user_id, role)
select id, '99999999-9999-9999-9999-999999999999', 'ADMIN'
from public.workspaces where name = 'Admin Test Workspace';

select lives_ok(
  $$ update public.workspace_members set role = 'MEMBER'
       where user_id = '88888888-8888-8888-8888-888888888888' $$,
  'İkinci admin varken ilk admin MEMBER''e düşürülebilir'
);

select throws_like(
  $$ delete from public.workspace_members
       where user_id = '99999999-9999-9999-9999-999999999999' $$,
  '%last ADMIN%',
  'Şimdi tek admin olan ikinci kullanıcı silinemez'
);

select * from finish();

rollback;
