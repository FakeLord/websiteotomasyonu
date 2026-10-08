-- Toplu atama ve toplu eleme: sınırlar, hepsi-ya-da-hiçbiri, atlananların sayımı, yetki ve aktivite kaydı.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(18);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e9000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'bulk1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e9000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bulk2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'e9000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Bulk WS') as ws \gset

select (public.import_business(:'ws', '{"name": "Toplu Bir", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul"}'::jsonb) ->> 'businessId') as b1 \gset
select (public.import_business(:'ws', '{"name": "Toplu Iki", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul"}'::jsonb) ->> 'businessId') as b2 \gset
select (public.import_business(:'ws', '{"name": "Toplu Uc", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul"}'::jsonb) ->> 'businessId') as b3 \gset
reset role;
select set_config('request.jwt.claim.sub', '', true);
-- Diğer çalışma alanında üye olmayan ikinci kullanıcı ve bir işletmesi (yetkisiz kayıt denemesi için)
insert into public.workspaces (id, name, created_by) values ('e9ffffff-0000-0000-0000-000000000009', 'Other WS', 'e9000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values ('e9ffffff-0000-0000-0000-000000000009', 'e9000000-0000-0000-0000-000000000002', 'ADMIN');
insert into public.workspace_settings (workspace_id) values ('e9ffffff-0000-0000-0000-000000000009');
insert into public.businesses (id, workspace_id, name, normalized_name, country_code, created_by)
values ('e9eeeeee-0000-0000-0000-000000000001', 'e9ffffff-0000-0000-0000-000000000009', 'Yabanci', 'yabanci', 'TR', 'e9000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e9000000-0000-0000-0000-000000000001', true);

-- 1) Toplu atama
select is(public.bulk_assign_businesses(array[:'b1', :'b2']::uuid[], 'e9000000-0000-0000-0000-000000000001'::uuid) ->> 'updated', '2', 'İki işletme atanır');
select is((select count(*)::int from public.businesses where assigned_to = 'e9000000-0000-0000-0000-000000000001'), 2, 'Atama gerçekten yazılır');
select is((select count(*)::int from public.activity_logs where workspace_id = :'ws' and action = 'lead.assigned'), 2, 'Her atama ayrı aktivite kaydı düşer');
select is(public.bulk_assign_businesses(array[:'b1', :'b3']::uuid[], 'e9000000-0000-0000-0000-000000000001'::uuid) ->> 'skipped', '1', 'Zaten o kişide olan atlanır ve sayılır');
select is(public.bulk_assign_businesses(array[:'b1', :'b1']::uuid[], null) ->> 'updated', '1', 'Aynı kayıt iki kez gelse bir kez işlenir; atama kaldırılabilir');
select throws_like(
  format($q$select public.bulk_assign_businesses(array[%L, 'e9eeeeee-0000-0000-0000-000000000001']::uuid[], null)$q$, :'b2'),
  '%not found or not accessible%', 'Başka çalışma alanının kaydı gelirse reddedilir'
);
select is((select assigned_to is not null from public.businesses where id = :'b2'), true, 'Reddedilen çağrıda hiçbir kayıt değişmez (hepsi ya da hiçbiri)');
select throws_like(
  format($q$select public.bulk_assign_businesses(array[%L]::uuid[], 'e9000000-0000-0000-0000-000000000002'::uuid)$q$, :'b2'),
  '%assignee is not a member%', 'Çalışma alanı üyesi olmayana atanamaz'
);
select throws_like(
  $q$select public.bulk_assign_businesses('{}'::uuid[], null)$q$,
  '%between 1 and 500%', 'Boş liste reddedilir'
);
select throws_like(
  $q$select public.bulk_assign_businesses((select array_agg(gen_random_uuid()) from generate_series(1, 501)), null)$q$,
  '%between 1 and 500%', '500''den fazla kayıt reddedilir'
);

-- 2) Toplu eleme
select is(public.bulk_disqualify_businesses(array[:'b1', :'b2']::uuid[], 'Alakasız') ->> 'updated', '2', 'NEW aşamasındaki iki işletme elenir');
select is((select stage from public.businesses where id = :'b1'), 'DISQUALIFIED', 'Aşama DISQUALIFIED olur');
select ok(exists (select 1 from public.stage_transitions where business_id = :'b1' and to_stage = 'DISQUALIFIED' and reason = 'Alakasız'), 'Geçiş sebebiyle birlikte geçmişe yazılır');
reset role;
update public.businesses set stage = 'QUALIFIED' where id = :'b3';
update public.businesses set stage = 'CONTACTED' where id = :'b3' and false;
set local role authenticated;
select is(public.bulk_disqualify_businesses(array[:'b1', :'b3']::uuid[]) ->> 'skipped', '1', 'Zaten elenmiş olan atlanır');
select is((select stage from public.businesses where id = :'b3'), 'DISQUALIFIED', 'QUALIFIED aşamasındaki de elenir');
reset role;
insert into public.businesses (id, workspace_id, name, normalized_name, country_code, created_by, stage)
values ('e9eeeeee-0000-0000-0000-000000000002', :'ws', 'Ilerlemis', 'ilerlemis', 'TR', 'e9000000-0000-0000-0000-000000000001', 'CONTACTED');
set local role authenticated;
select is(public.bulk_disqualify_businesses(array['e9eeeeee-0000-0000-0000-000000000002']::uuid[]) ->> 'updated', '0', 'İletişime geçilmiş işletme elenmez');
select is((select stage from public.businesses where id = 'e9eeeeee-0000-0000-0000-000000000002'), 'CONTACTED', 'Atlanan işletmenin aşaması değişmez');

-- 3) Yetki: başka çalışma alanının üyesi bu kayıtlara dokunamaz
select set_config('request.jwt.claim.sub', 'e9000000-0000-0000-0000-000000000002', true);
select throws_like(
  format($q$select public.bulk_disqualify_businesses(array[%L]::uuid[])$q$, :'b2'),
  '%not found or not accessible%', 'Başka çalışma alanının üyesi eleme yapamaz'
);

reset role;

select * from finish();

rollback;
