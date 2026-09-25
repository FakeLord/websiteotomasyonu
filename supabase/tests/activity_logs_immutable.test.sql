-- activity_logs hiçbir rol tarafından UPDATE/DELETE edilemez (admin/service role dahil).
begin;

select plan(4);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'owner@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
set local role authenticated;
select public.bootstrap_workspace('Log Test Workspace');

-- authenticated rolü: tablo düzeyinde REVOKE edildiği için UPDATE/DELETE
-- doğrudan yetki hatası (42501) verir.
select throws_like(
  $$ update public.activity_logs set summary = 'hacked' where action = 'workspace.bootstrapped' $$,
  '%permission denied%',
  'authenticated rolü activity_logs UPDATE edemez (yetki reddi)'
);

select throws_like(
  $$ delete from public.activity_logs where action = 'workspace.bootstrapped' $$,
  '%permission denied%',
  'authenticated rolü activity_logs DELETE edemez (yetki reddi)'
);

reset role;

-- postgres (tablo sahibi, BYPASSRLS) bile trigger nedeniyle UPDATE/DELETE yapamaz.
select throws_like(
  $$ update public.activity_logs set summary = 'hacked' where action = 'workspace.bootstrapped' $$,
  '%append-only%',
  'postgres rolü bile trigger nedeniyle activity_logs UPDATE edemez'
);

select throws_like(
  $$ delete from public.activity_logs where action = 'workspace.bootstrapped' $$,
  '%append-only%',
  'postgres rolü bile trigger nedeniyle activity_logs DELETE edemez'
);

select * from finish();

rollback;
