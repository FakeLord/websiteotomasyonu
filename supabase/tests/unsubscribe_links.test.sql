-- ADR 0023: listeden çıkma bağlantısı. Yetki, tek kullanım, DNC + bastırma listesi, yalıtım.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(14);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ea000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'unsub1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ea000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'unsub2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Unsub WS') as ws \gset

select (public.import_business(:'ws', '{"name": "Cikan Isletme", "source": "MANUAL", "countryCode": "US", "city": "Austin", "phoneE164": "+15125550101", "websiteUrl": "https://cikan-ornek.com", "websiteDomain": "cikan-ornek.com"}'::jsonb) ->> 'businessId') as b1 \gset
select (public.import_business(:'ws', '{"name": "Diger Isletme", "source": "MANUAL", "countryCode": "US", "city": "Dallas", "phoneE164": "+12145550102"}'::jsonb) ->> 'businessId') as b2 \gset

select public.issue_unsubscribe_token(:'b1') as tok \gset
select public.issue_unsubscribe_token(:'b1') as tok_other \gset

select ok(length(:'tok'::text) >= 32, 'Anahtar yeterince uzundur');
select isnt(:'tok'::text, :'tok_other'::text, 'Her çağrı farklı anahtar üretir');

reset role;
select is((select count(*)::int from public.unsubscribe_tokens where business_id = :'b1'), 2, 'Anahtarlar kaydedilir');
select is((select count(*)::int from public.unsubscribe_tokens where token_hash = :'tok'), 0, 'Ham anahtar saklanmaz, yalnızca özeti');

-- Başka çalışma alanının üyesi anahtar üretemez
select set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_like(
  format($q$select public.issue_unsubscribe_token(%L)$q$, :'b1'),
  '%not found or not accessible%', 'Yabancı çalışma alanı anahtar üretemez'
);
select throws_like(
  $q$select * from public.unsubscribe_tokens$q$,
  '%permission denied%', 'İstemci anahtar tablosunu okuyamaz'
);
select throws_like(
  format($q$select public.consume_unsubscribe_token(%L)$q$, :'tok'),
  '%permission denied%', 'Kullanıcı rolü anahtarı tüketemez'
);
reset role;

-- Herkese açık fonksiyon (service_role) anahtarı tüketir
set local role service_role;
select is((public.consume_unsubscribe_token(:'tok') ->> 'status'), 'unsubscribed', 'Geçerli anahtar çıkarır');
select is((public.consume_unsubscribe_token(:'tok') ->> 'status'), 'already', 'İkinci tıklama hata vermez');
select is((public.consume_unsubscribe_token('yanlis') ->> 'status'), 'invalid', 'Kısa/bozuk anahtar geçersizdir');
select is(
  (public.consume_unsubscribe_token(repeat('a', 64)) ->> 'status'), 'invalid', 'Bilinmeyen anahtar geçersizdir'
);
reset role;

select ok((select do_not_contact from public.businesses where id = :'b1'), 'İşletme DNC olur');
select is((select count(*)::int from public.activity_logs where workspace_id = :'ws' and action = 'lead.unsubscribed'), 1, 'Tek log kaydı düşer');
select ok(not (select do_not_contact from public.businesses where id = :'b2'), 'Diğer işletme etkilenmez');

select * from finish();
rollback;
