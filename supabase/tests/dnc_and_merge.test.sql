-- set_dnc: kaldırma yalnızca admin + sebep; merge_businesses: kaynak/not
-- taşıma ve DNC OR'lanması (SPEC.md → I.5, G.4).
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(5);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'dncadmin@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'dncmember@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('DNC Workspace');
reset role;

insert into public.workspace_members (workspace_id, user_id, role)
select id, 'e0000000-0000-0000-0000-000000000002', 'MEMBER'
from public.workspaces where name = 'DNC Workspace';

select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select public.import_business(
  (select id from public.workspaces where name = 'DNC Workspace'),
  jsonb_build_object('name', 'DNC Test A', 'source', 'MANUAL'), null
);
select public.import_business(
  (select id from public.workspaces where name = 'DNC Workspace'),
  jsonb_build_object('name', 'DNC Test B', 'source', 'MANUAL'), null
);

select public.set_dnc((select id from public.businesses where name = 'DNC Test A'), true, 'yazmayın dedi');

reset role;

-- MEMBER, DNC kaldıramaz.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', true);
set local role authenticated;

select throws_like(
  $$ select public.set_dnc((select id from public.businesses where name = 'DNC Test A'), false, 'yanlış girildi') $$,
  '%only ADMIN%',
  'MEMBER, DNC bayrağını kaldıramaz'
);

reset role;

-- ADMIN, sebep vererek kaldırabilir.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$ select public.set_dnc((select id from public.businesses where name = 'DNC Test A'), false, 'yanlışlıkla işaretlenmiş') $$,
  'ADMIN, sebep vererek DNC''yi kaldırabilir'
);

-- Merge: A'ya not ekle, B'yi DNC yap, sonra B'yi A'ya merge et.
insert into public.notes (workspace_id, business_id, author_id, body)
values (
  (select id from public.workspaces where name = 'DNC Workspace'),
  (select id from public.businesses where name = 'DNC Test A'),
  'e0000000-0000-0000-0000-000000000001',
  'Test notu'
);

select public.set_dnc((select id from public.businesses where name = 'DNC Test B'), true, 'ikinci kayıt DNC');

select public.merge_businesses(
  (select id from public.businesses where name = 'DNC Test A'),
  (select id from public.businesses where name = 'DNC Test B')
);

select is(
  (select do_not_contact from public.businesses where name = 'DNC Test A'),
  true,
  'Merge sonrası keep kaydı, drop''un DNC bayrağını devralır (OR)'
);

select is(
  (select merged_into from public.businesses where name = 'DNC Test B'),
  (select id from public.businesses where name = 'DNC Test A'),
  'Drop kaydı merged_into ile işaretlenir, silinmez'
);

select is(
  (select count(*)::int from public.notes
     where business_id = (select id from public.businesses where name = 'DNC Test A')),
  1,
  'Notlar keep kaydında görünür durumda kalır'
);

reset role;

select * from finish();

rollback;
