-- remove_workspace_member: yetki, kendini çıkarma yasağı, sahipsiz kalan iş temizliği, son yönetici koruması, yalıtım.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'eb000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rm1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'eb000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rm2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'eb000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'rm3@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'eb000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Remove WS') as ws \gset
select (public.import_business(:'ws', '{"name": "Atanmis Isletme", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul"}'::jsonb) ->> 'businessId') as b1 \gset

reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspace_members (workspace_id, user_id, role) values
  (:'ws', 'eb000000-0000-0000-0000-000000000002', 'AGENT'),
  (:'ws', 'eb000000-0000-0000-0000-000000000003', 'MEMBER');
insert into public.conversations (id, workspace_id, business_id, channel) values ('ebaaaaaa-0000-0000-0000-000000000001', :'ws', :'b1', 'EMAIL');
select set_config('request.jwt.claim.sub', 'eb000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.assign_business(:'b1', 'eb000000-0000-0000-0000-000000000002');
select public.create_handoff(:'b1', 'ebaaaaaa-0000-0000-0000-000000000001', 'Teklif bekliyor', '[]'::jsonb, 'USER') as h1 \gset
select public.accept_handoff(:'h1', 'eb000000-0000-0000-0000-000000000002');

-- 1) Yetki ve kısıtlar
select throws_like(
  format($q$select public.remove_workspace_member(%L, 'eb000000-0000-0000-0000-000000000001')$q$, :'ws'),
  '%cannot remove yourself%', 'Yönetici kendini çıkaramaz'
);
select throws_like(
  format($q$select public.remove_workspace_member(%L, 'eb000000-0000-0000-0000-00000000ffff')$q$, :'ws'),
  '%member not found%', 'Üye olmayan çıkarılamaz'
);
select set_config('request.jwt.claim.sub', 'eb000000-0000-0000-0000-000000000003', true);
select throws_like(
  format($q$select public.remove_workspace_member(%L, 'eb000000-0000-0000-0000-000000000002')$q$, :'ws'),
  '%admin role required%', 'Yönetici olmayan üye çıkaramaz'
);
select set_config('request.jwt.claim.sub', 'eb000000-0000-0000-0000-000000000001', true);

-- 2) Çıkarma ve temizlik
select is(public.remove_workspace_member(:'ws', 'eb000000-0000-0000-0000-000000000002') ->> 'unassignedBusinesses', '1', 'Çıkarılan kişinin işletmesinin ataması kalkar');
select ok(not exists (select 1 from public.workspace_members where workspace_id = :'ws' and user_id = 'eb000000-0000-0000-0000-000000000002'), 'Üyelik silinir');
select ok((select assigned_to is null from public.businesses where id = :'b1'), 'İşletme sahipsiz olur');
select is((select status from public.human_handoffs where id = :'h1'), 'OPEN', 'Devralınmış kart yeniden açılır');
select ok((select assigned_to is null from public.human_handoffs where id = :'h1'), 'Kartın sorumlusu kalkar');
select is((select count(*)::int from public.activity_logs where workspace_id = :'ws' and action = 'member.removed'), 1, 'Üye çıkarma aktivite günlüğüne yazılır');

-- 3) Son yönetici koruması: diğer yönetici ADMIN yapılıp ilki çıkarılabilir, tek yönetici çıkarılamaz
reset role;
update public.workspace_members set role = 'ADMIN' where workspace_id = :'ws' and user_id = 'eb000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claim.sub', 'eb000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select lives_ok(
  format($q$select public.remove_workspace_member(%L, 'eb000000-0000-0000-0000-000000000001')$q$, :'ws'),
  'İki yönetici varken biri diğerini çıkarabilir'
);

-- 4) Yalıtım
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspaces (id, name, created_by) values ('ebffffff-0000-0000-0000-000000000009', 'Other WS', 'eb000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values ('ebffffff-0000-0000-0000-000000000009', 'eb000000-0000-0000-0000-000000000002', 'ADMIN');
insert into public.workspace_settings (workspace_id) values ('ebffffff-0000-0000-0000-000000000009');
select set_config('request.jwt.claim.sub', 'eb000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_like(
  format($q$select public.remove_workspace_member(%L, 'eb000000-0000-0000-0000-000000000003')$q$, :'ws'),
  '%admin role required%', 'Başka çalışma alanının yöneticisi bu çalışma alanından üye çıkaramaz'
);

reset role;

select * from finish();

rollback;
