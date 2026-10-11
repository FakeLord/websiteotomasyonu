-- ADR 0024: müşteri hizmetleri ve belgeleri. WON şartı, doğrulama, yetki (üye ekler, ADMIN siler), yalıtım, depolama politikaları.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(20);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ec000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cd-admin@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ec000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cd-member@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ec000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cd-out@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'ec000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('CD WS') as ws \gset

select (public.import_business(:'ws', '{"name": "Musteri Bir", "source": "MANUAL", "countryCode": "TR", "city": "Istanbul"}'::jsonb) ->> 'businessId') as won \gset
select (public.import_business(:'ws', '{"name": "Henuz Lead", "source": "MANUAL", "countryCode": "TR", "city": "Ankara"}'::jsonb) ->> 'businessId') as lead \gset
reset role;

update public.businesses set stage = 'WON' where id = :'won';
-- Üyelik eklemesi kullanıcı bağlamında log yazar: ilgili kullanıcının kimliği ayarlanır.
select set_config('request.jwt.claim.sub', 'ec000000-0000-0000-0000-000000000001', true);
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', 'ec000000-0000-0000-0000-000000000002', 'MEMBER');
insert into public.workspaces (id, name, created_by) values ('ecffffff-0000-0000-0000-000000000009', 'Other WS', 'ec000000-0000-0000-0000-000000000003');
select set_config('request.jwt.claim.sub', 'ec000000-0000-0000-0000-000000000003', true);
insert into public.workspace_members (workspace_id, user_id, role) values ('ecffffff-0000-0000-0000-000000000009', 'ec000000-0000-0000-0000-000000000003', 'ADMIN');
insert into public.workspace_settings (workspace_id) values ('ecffffff-0000-0000-0000-000000000009');

-- Üye hizmet ekler
select set_config('request.jwt.claim.sub', 'ec000000-0000-0000-0000-000000000002', true);
set local role authenticated;

select is(
  (public.upsert_customer_service(null, :'won', 'DOMAIN', ' ornek.com ', 'GoDaddy', 'ornek.com', 'https://godaddy.com/login', 'info@ornek.com', 'ACTIVE', '2026-01-01', '2027-01-01', 450, 'TRY', 'Şifre: Bitwarden')).title,
  'ornek.com', 'Üye hizmet ekler; başlık kırpılır'
);
select public.upsert_customer_service(null, :'won', 'HOSTING', 'Paylaşımlı hosting', null, null, null, null, 'ACTIVE', null, null, null, 'TRY', null) as dummy \gset
select is((select count(*)::int from public.customer_services where business_id = :'won'), 2, 'İstenen kadar kalem eklenebilir');
select id as svc from public.customer_services where business_id = :'won' and kind = 'DOMAIN' \gset

select is(
  (public.upsert_customer_service(:'svc', :'won', 'DOMAIN', 'ornek.com', 'Natro', 'ornek.com', null, null, 'ACTIVE', null, '2027-06-01', 500, 'TRY', null)).provider,
  'Natro', 'Mevcut kalem güncellenir'
);
select throws_like(
  format($q$select public.upsert_customer_service(null, %L, 'OTHER', 'x', null, null, null, null, 'ACTIVE', null, null, null, 'TRY', null)$q$, :'lead'),
  '%require stage WON%', 'Kazanılmamış işletmeye hizmet eklenemez'
);
select throws_like(
  format($q$select public.upsert_customer_service(null, %L, 'OTHER', '  ', null, null, null, null, 'ACTIVE', null, null, null, 'TRY', null)$q$, :'won'),
  '%title is required%', 'Boş başlık reddedilir'
);
select throws_like(
  format($q$select public.upsert_customer_service(null, %L, 'OTHER', 'x', null, null, 'javascript:alert(1)', null, 'ACTIVE', null, null, null, 'TRY', null)$q$, :'won'),
  '%login_url%', 'http(s) olmayan giriş adresi reddedilir'
);

-- Belge: yol işletmeye ait olmalı
select throws_like(
  format($q$select public.register_customer_document(%L, 'INVOICE', 'Fatura', 'A-1', 100, 'TRY', '2026-10-01', null, 'baska/yol/fatura.pdf', 'fatura.pdf', 'application/pdf', 1000)$q$, :'won'),
  '%does not belong%', 'Başka yola belge kaydı açılamaz'
);
select is(
  (public.register_customer_document(:'won', 'INVOICE', 'Ekim faturası', 'A-1', 1500, 'TRY', '2026-10-01', :'svc',
    :'ws' || '/' || :'won' || '/11111111-fatura.pdf', 'fatura.pdf', 'application/pdf', 2048)).invoice_number,
  'A-1', 'Belge kaydı oluşur'
);
select id as doc from public.customer_documents where business_id = :'won' \gset

-- Üye silemez
select throws_like(format($q$select public.delete_customer_service(%L)$q$, :'svc'), '%only ADMIN%', 'Üye hizmeti silemez');
select throws_like(format($q$select public.delete_customer_document(%L)$q$, :'doc'), '%only ADMIN%', 'Üye belgeyi silemez');

-- Depolama: üye kendi çalışma alanı yoluna yükleyebilir, başkasınınkine yükleyemez
select lives_ok(
  format($q$insert into storage.objects (bucket_id, name, owner) values ('customer-files', %L, auth.uid())$q$, :'ws' || '/' || :'won' || '/22222222-test.pdf'),
  'Üye kendi çalışma alanına dosya yükleyebilir'
);
select throws_like(
  $q$insert into storage.objects (bucket_id, name, owner) values ('customer-files', 'ecffffff-0000-0000-0000-000000000009/x/33333333-test.pdf', auth.uid())$q$,
  '%row-level security%', 'Üye başka çalışma alanının yoluna yükleyemez'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'customer-files'), 1,
  'Üye kendi çalışma alanının dosyalarını görür'
);
reset role;

-- Dışarıdan biri hiçbirini göremez ve yazamaz
select set_config('request.jwt.claim.sub', 'ec000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select is((select count(*)::int from public.customer_services), 0, 'Yabancı çalışma alanı hizmetleri göremez');
select is((select count(*)::int from public.customer_documents), 0, 'Yabancı çalışma alanı belgeleri göremez');
select is((select count(*)::int from storage.objects where bucket_id = 'customer-files'), 0, 'Yabancı çalışma alanı dosyaları göremez');
select throws_like(
  format($q$select public.upsert_customer_service(null, %L, 'OTHER', 'x', null, null, null, null, 'ACTIVE', null, null, null, 'TRY', null)$q$, :'won'),
  '%not found or not accessible%', 'Yabancı çalışma alanı hizmet ekleyemez'
);
reset role;

-- Yönetici siler
select set_config('request.jwt.claim.sub', 'ec000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select is(public.delete_customer_document(:'doc'), :'ws' || '/' || :'won' || '/11111111-fatura.pdf', 'Yönetici belgeyi siler ve dosya yolunu alır');
select lives_ok(format($q$select public.delete_customer_service(%L)$q$, :'svc'), 'Yönetici hizmeti siler');
select is(
  (select count(*)::int from public.activity_logs where workspace_id = :'ws' and action like 'customer.%'), 6,
  'Her işlem log kaydı bırakır (2 ekleme, 1 güncelleme, 1 belge, 2 silme)'
);

select * from finish();
rollback;
