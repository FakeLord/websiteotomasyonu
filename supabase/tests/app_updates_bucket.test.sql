-- ADR 0026: güncelleme kovası herkese açık okunur, istemci rolleri yazamaz.
begin;

set local client_min_messages = warning;

select plan(4);

select ok(
  (select public from storage.buckets where id = 'app-updates'),
  'app-updates kovası herkese açık'
);
select is(
  (select file_size_limit from storage.buckets where id = 'app-updates'), 52428800::bigint,
  'Dosya boyutu en çok 50 MB'
);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'ee000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'upd@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_like(
  $q$insert into storage.objects (bucket_id, name, owner) values ('app-updates', 'latest.json', auth.uid())$q$,
  '%row-level security%', 'Giriş yapmış kullanıcı güncelleme kovasına yazamaz'
);
reset role;

set local role anon;
select throws_like(
  $q$insert into storage.objects (bucket_id, name) values ('app-updates', 'latest.json')$q$,
  '%row-level security%', 'Anonim kullanıcı güncelleme kovasına yazamaz'
);
reset role;

select * from finish();
rollback;
