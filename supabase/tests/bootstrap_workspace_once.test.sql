-- bootstrap_workspace yalnızca hiç workspace yokken çalışır; ikinci çağrı reddedilir.
begin;

select plan(3);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'first@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'second@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
set local role authenticated;

select lives_ok(
  $$ select public.bootstrap_workspace('First Workspace') $$,
  'İlk bootstrap_workspace çağrısı başarılı olur'
);

reset role;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
set local role authenticated;

select throws_like(
  $$ select public.bootstrap_workspace('Second Workspace') $$,
  '%already exists%',
  'İkinci bootstrap_workspace çağrısı reddedilir'
);

reset role;

select is(
  (select count(*)::int from public.workspaces),
  1,
  'Yalnızca bir workspace oluşmuş olur'
);

select * from finish();

rollback;
