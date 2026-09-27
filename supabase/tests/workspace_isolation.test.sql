-- A workspace'inin üyesi, B workspace'inin hiçbir satırını okuyamaz/yazamaz.
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
truncate table public.workspaces cascade;

select plan(6);

-- İki kullanıcı ve iki workspace kur.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'alice@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'bob@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

-- Alice workspace A'yı bootstrap eder.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select public.bootstrap_workspace('Workspace A');
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Bob workspace B'yi bootstrap etmeye çalışır: ikinci workspace olduğu için reddedilir,
-- bu yüzden Bob'u doğrudan ikinci bir workspace'e postgres context'inde ekliyoruz
-- (yalnızca izolasyon testi için fixture; bootstrap_workspace tek workspace kısıtı
-- ayrı bir test dosyasında test ediliyor).
insert into public.workspaces (id, name, created_by)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Workspace B', '22222222-2222-2222-2222-222222222222');
insert into public.workspace_members (workspace_id, user_id, role)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'ADMIN');
insert into public.workspace_settings (workspace_id)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Alice olarak Bob'un workspace'ini görmeye çalış.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select is(
  (select count(*)::int from public.workspaces where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0,
  'Alice, Workspace B''i SELECT ile göremez'
);

select is(
  (select count(*)::int from public.workspace_members where workspace_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0,
  'Alice, Workspace B''in üyelerini göremez'
);

select is(
  (select count(*)::int from public.workspace_settings where workspace_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0,
  'Alice, Workspace B''in ayarlarını göremez'
);

update public.workspace_settings
set automation_level = 'LEVEL_2'
where workspace_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

reset role;

select is(
  (select automation_level from public.workspace_settings where workspace_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'LEVEL_1',
  'Alice''in UPDATE denemesi RLS tarafından sessizce 0 satır etkiler; değer değişmez'
);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

-- Kendi workspace'ini görebildiğini doğrula (pozitif kontrol).
select ok(
  (select count(*)::int from public.workspaces where name = 'Workspace A') = 1,
  'Alice kendi workspace''ini görebilir'
);

select ok(
  not public.is_member('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
  'is_member(), Alice''i Workspace B üyesi olarak görmüyor'
);

reset role;

select * from finish();

rollback;
