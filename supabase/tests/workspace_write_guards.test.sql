-- İstemcinin gönderdiği workspace_id başka bir workspace'e yazmaya izin vermez;
-- workspace_invites yalnızca admin-invite Edge Function'ı (service role) ile yazılır;
-- accept_invite() e-posta eşleşmeyen davetleri reddeder.
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
truncate table public.workspaces cascade;

select plan(4);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ownera@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ownerb@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'wrongperson@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Workspace A (guards)');
reset role;

-- Not: uygulama tek workspace varsayar (SPEC.md D-kararı); bootstrap_workspace() ikinci
-- kez çağrılamaz. Workspace B, izolasyon testlerindeki gibi doğrudan postgres context'inde
-- fixture olarak eklenir.
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspaces (id, name, created_by)
values ('bbbbbbbb-0000-0000-0000-000000000099', 'Workspace B (guards)', 'aaaaaaaa-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role)
values ('bbbbbbbb-0000-0000-0000-000000000099', 'aaaaaaaa-0000-0000-0000-000000000002', 'ADMIN');
insert into public.workspace_settings (workspace_id)
values ('bbbbbbbb-0000-0000-0000-000000000099');

-- Workspace A'nın sahibi, doğrudan INSERT ile kendini Workspace B'ye ADMIN yapmaya
-- çalışır (client'ın gönderdiği workspace_id ile spoofing denemesi).
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
set local role authenticated;

select throws_like(
  $$ insert into public.workspace_members (workspace_id, user_id, role)
       values ('bbbbbbbb-0000-0000-0000-000000000099', 'aaaaaaaa-0000-0000-0000-000000000001', 'ADMIN') $$,
  '%row-level security policy%',
  'Client, doğrudan INSERT ile başka bir workspace''e üye ekleyemez (RLS reddi)'
);

reset role;

-- Admin dahil, workspace_invites'e doğrudan INSERT yapılamaz (yalnızca admin-invite
-- Edge Function'ı service role ile yazabilir).
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
set local role authenticated;

select throws_like(
  $$ insert into public.workspace_invites (workspace_id, email, role, token_hash, invited_by, expires_at)
       select id, 'invitee@test.local', 'MEMBER', 'deadbeef', 'aaaaaaaa-0000-0000-0000-000000000001', now() + interval '7 days'
       from public.workspaces where name = 'Workspace A (guards)' $$,
  '%row-level security policy%',
  'Admin bile client''tan doğrudan workspace_invites INSERT edemez'
);

reset role;

-- accept_invite: e-posta eşleşmeyen kullanıcı daveti kabul edemez.
insert into public.workspace_invites (workspace_id, email, role, token_hash, invited_by, expires_at)
select id, 'invitee@test.local', 'MEMBER', encode(extensions.digest('secret-code', 'sha256'), 'hex'),
       'aaaaaaaa-0000-0000-0000-000000000001', now() + interval '7 days'
from public.workspaces where name = 'Workspace A (guards)';

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
set local role authenticated;

select throws_like(
  $$ select public.accept_invite('secret-code') $$,
  '%does not match%',
  'E-postası davetle eşleşmeyen kullanıcı daveti kabul edemez'
);

reset role;

select is(
  (select count(*)::int from public.workspace_members
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  0,
  'Reddedilen accept_invite hiçbir üyelik oluşturmaz'
);

select * from finish();

rollback;
