begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(13);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ed000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cmp1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ed000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cmp2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'ed000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Campaign WS') as ws \gset
select public.create_campaign(:'ws', 'Eski Ad', 'Açıklama', 'EMAIL', '{}'::jsonb, 2, 20) as c1 \gset
select public.create_campaign(:'ws', 'Yazılmış', null, 'EMAIL', '{}'::jsonb, 2, 20) as c2 \gset
select (public.import_business(:'ws', '{"name": "Kampanya Uyesi", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul"}'::jsonb) ->> 'businessId') as b1 \gset
reset role;
insert into public.campaign_members (workspace_id, campaign_id, business_id, status) values (:'ws', :'c2', :'b1', 'SENT');
set local role authenticated;

-- 1) Düzenleme
select is((public.update_campaign(:'c1', '  Yeni Ad ', '  ', 3, 50)).name, 'Yeni Ad', 'Ad kırpılarak güncellenir');
select is((select followup_steps || ':' || daily_limit from public.campaigns where id = :'c1'), '3:50', 'Takip adımı ve günlük limit güncellenir');
select ok((select description is null from public.campaigns where id = :'c1'), 'Boş açıklama temizlenir');
select is((select channel from public.campaigns where id = :'c1'), 'EMAIL', 'Kanal değişmez');
select is((select count(*)::int from public.activity_logs where workspace_id = :'ws' and action = 'campaign.updated'), 1, 'Güncelleme aktivite günlüğüne yazılır');
select throws_like(format($q$select public.update_campaign(%L, ' ', null, 2, 20)$q$, :'c1'), '%invalid name%', 'Boş ad reddedilir');
select throws_like(format($q$select public.update_campaign(%L, 'X', null, 9, 20)$q$, :'c1'), '%invalid followup_steps%', 'Geçersiz takip adımı reddedilir');
select throws_like(format($q$select public.update_campaign(%L, 'X', null, 2, 999)$q$, :'c1'), '%invalid daily_limit%', 'Geçersiz günlük limit reddedilir');

-- 2) Silme
select throws_like(format($q$select public.delete_campaign(%L)$q$, :'c2'), '%contacted members%', 'Yazılmış kampanya silinemez');
select lives_ok(format($q$select public.delete_campaign(%L)$q$, :'c1'), 'Kimseye yazılmamış kampanya silinir');
select is((select count(*)::int from public.campaigns where id = :'c1'), 0, 'Kampanya gerçekten silinir');
select is((select count(*)::int from public.activity_logs where workspace_id = :'ws' and action = 'campaign.deleted'), 1, 'Silme aktivite günlüğüne yazılır');

-- 3) Yalıtım
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspaces (id, name, created_by) values ('edffffff-0000-0000-0000-000000000009', 'Other WS', 'ed000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values ('edffffff-0000-0000-0000-000000000009', 'ed000000-0000-0000-0000-000000000002', 'ADMIN');
insert into public.workspace_settings (workspace_id) values ('edffffff-0000-0000-0000-000000000009');
select set_config('request.jwt.claim.sub', 'ed000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_like(format($q$select public.update_campaign(%L, 'Hack', null, 2, 20)$q$, :'c2'), '%campaign not found%', 'Başka çalışma alanının kampanyası düzenlenemez');

reset role;

select * from finish();

rollback;
