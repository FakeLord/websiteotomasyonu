-- message_templates: varsayılan boş, yalnızca ADMIN değiştirir, biçim ve uzunluk kısıtı.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ee000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'tpl1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ee000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'tpl2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Template WS') as ws \gset
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', 'ee000000-0000-0000-0000-000000000002', 'MEMBER');

select is((select message_templates from public.workspace_settings where workspace_id = :'ws'), '{}'::jsonb, 'Varsayılan boştur (uygulama varsayılan şablonu kullanır)');

-- ADMIN yazabilir
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000001', true);
set local role authenticated;
update public.workspace_settings set message_templates = '{"tr": "Merhaba {isletme}", "en": "Hi {isletme}"}'::jsonb where workspace_id = :'ws';
reset role;
select is((select message_templates ->> 'tr' from public.workspace_settings where workspace_id = :'ws'), 'Merhaba {isletme}', 'ADMIN şablonu kaydeder');

-- MEMBER yazamaz (satırı göremediği için etkisiz)
select set_config('request.jwt.claim.sub', 'ee000000-0000-0000-0000-000000000002', true);
set local role authenticated;
update public.workspace_settings set message_templates = '{"tr": "Hack"}'::jsonb where workspace_id = :'ws';
reset role;
select is((select message_templates ->> 'tr' from public.workspace_settings where workspace_id = :'ws'), 'Merhaba {isletme}', 'MEMBER şablonu değiştiremez');

-- Kısıtlar (yetkiyi aşan doğrudan yazma bile geçersiz biçimi reddeder)
select throws_ok(
  format($q$update public.workspace_settings set message_templates = '{"de": "Hallo"}'::jsonb where workspace_id = %L$q$, :'ws'),
  '23514', null, 'Yalnızca tr ve en anahtarlarına izin verilir (Almanca yok)'
);
select throws_ok(
  format($q$update public.workspace_settings set message_templates = jsonb_build_object('tr', repeat('a', 1501)) where workspace_id = %L$q$, :'ws'),
  '23514', null, '1500 karakterden uzun şablon reddedilir'
);
select throws_ok(
  format($q$update public.workspace_settings set message_templates = '["x"]'::jsonb where workspace_id = %L$q$, :'ws'),
  '23514', null, 'Nesne olmayan değer reddedilir'
);
select lives_ok(
  format($q$update public.workspace_settings set message_templates = jsonb_build_object('en', repeat('a', 1500)) where workspace_id = %L$q$, :'ws'),
  'Tam 1500 karakter kabul edilir'
);

select * from finish();

rollback;
