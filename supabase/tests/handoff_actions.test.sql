-- Devir kartı: devral / ata / kapat, doğrudan UPDATE'in kapalı olması, yeniden açılabilmesi, yalıtım.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(17);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ea000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ho1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ea000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ho2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Handoff WS') as ws \gset

select (public.import_business(:'ws', '{"name": "Devir Bir", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul"}'::jsonb) ->> 'businessId') as b1 \gset
reset role;
insert into public.conversations (id, workspace_id, business_id, channel) values ('eaaaaaaa-0000-0000-0000-000000000001', :'ws', :'b1', 'EMAIL');
set local role authenticated;
select public.create_handoff(:'b1', 'eaaaaaaa-0000-0000-0000-000000000001', 'Teklif istiyor', '[]'::jsonb, 'USER') as h1 \gset

-- 1) Doğrudan UPDATE kapalı
select throws_ok(format($q$update public.human_handoffs set status = 'CLOSED' where id = %L$q$, :'h1'), '42501', null, 'İstemci devir kartını doğrudan değiştiremez');

-- 2) Devral
select is((public.accept_handoff(:'h1')).status, 'ACCEPTED', 'Devralınca durum ACCEPTED olur');
select is((select assigned_to from public.human_handoffs where id = :'h1'), 'ea000000-0000-0000-0000-000000000001'::uuid, 'Kart devralan kişiye atanır');
select is((select assigned_to from public.businesses where id = :'b1'), 'ea000000-0000-0000-0000-000000000001'::uuid, 'Atanmamış işletme devralan kişiye atanır');
select is((select count(*)::int from public.activity_logs where workspace_id = :'ws' and action = 'handoff.accepted'), 1, 'Devralma aktivite günlüğüne yazılır');
select is((select count(*)::int from public.human_handoffs where business_id = :'b1' and status = 'OPEN'), 0, 'Devralınan kart OPEN sayılmaz (zil sayacından düşer)');

-- Devralınmış kart varken ikinci kart açılamaz
select throws_like(
  format($q$select public.create_handoff(%L, 'eaaaaaaa-0000-0000-0000-000000000001', 'Ikinci', '[]'::jsonb, 'USER')$q$, :'b1'),
  '%already has an active handoff%', 'Devralınmış kart varken yeni kart açılamaz'
);

-- 3) Başka üyeye ata: üye değilse reddedilir
select throws_like(
  format($q$select public.accept_handoff(%L, 'ea000000-0000-0000-0000-000000000002')$q$, :'h1'),
  '%assignee is not a member%', 'Çalışma alanı üyesi olmayana atanamaz'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', 'ea000000-0000-0000-0000-000000000002', 'AGENT');
select set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select is((public.accept_handoff(:'h1', 'ea000000-0000-0000-0000-000000000002')).assigned_to, 'ea000000-0000-0000-0000-000000000002'::uuid, 'Üyeye yeniden atanabilir');
select is((select assigned_to from public.businesses where id = :'b1'), 'ea000000-0000-0000-0000-000000000001'::uuid, 'Zaten atanmış işletmenin sahibi değişmez');

-- 4) Kapat ve yeniden aç
select is((public.close_handoff(:'h1', 'Teklif gönderildi')).status, 'CLOSED', 'Kapatılır');
select is((select metadata ->> 'note' from public.activity_logs where action = 'handoff.closed' and workspace_id = :'ws'), 'Teklif gönderildi', 'Kapatma notu aktivite günlüğüne yazılır');
select throws_like(format($q$select public.close_handoff(%L)$q$, :'h1'), '%handoff is closed%', 'Kapalı kart yeniden kapatılamaz');
select throws_like(format($q$select public.accept_handoff(%L)$q$, :'h1'), '%handoff is closed%', 'Kapalı kart devralınamaz');
select lives_ok(
  format($q$select public.create_handoff(%L, 'eaaaaaaa-0000-0000-0000-000000000001', 'İkinci teklif', '[]'::jsonb, 'USER')$q$, :'b1'),
  'Kapanınca aynı işletme için yeni devir kartı açılabilir'
);

-- 5) Yalıtım
reset role;
select set_config('request.jwt.claim.sub', '', true);
-- Önceki adımda atanan üye çalışma alanından çıkarılır; artık yabancıdır.
delete from public.workspace_members where workspace_id = :'ws' and user_id = 'ea000000-0000-0000-0000-000000000002';
insert into public.workspaces (id, name, created_by) values ('eaffffff-0000-0000-0000-000000000009', 'Other WS', 'ea000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values ('eaffffff-0000-0000-0000-000000000009', 'ea000000-0000-0000-0000-000000000002', 'ADMIN');
insert into public.workspace_settings (workspace_id) values ('eaffffff-0000-0000-0000-000000000009');
select set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000002', true);
select id as h2 from public.human_handoffs where business_id = :'b1' and status = 'OPEN' \gset
set local role authenticated;
select throws_like(format($q$select public.accept_handoff(%L)$q$, :'h2'), '%handoff not found%', 'Başka çalışma alanının kartı devralınamaz');
select throws_like(format($q$select public.close_handoff(%L)$q$, :'h2'), '%handoff not found%', 'Başka çalışma alanının kartı kapatılamaz');

reset role;

select * from finish();

rollback;
