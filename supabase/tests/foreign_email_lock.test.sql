-- ADR 0017: Türkiye dışındaki işletmeye e-posta, yönetici açıkça izin verene kadar kapalıdır.
-- Kilit yalnızca EMAIL kanalını etkiler; ayar workspace_settings.outreach_limits.allow_foreign_email'dedir
-- (anahtar yoksa kapalı). Yetki: yalnızca ADMIN ayarı değiştirir (mevcut RLS politikası).
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@fel.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'member@fel.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('FEL WS') as ws \gset
select (public.import_business(:'ws', '{"name": "Istanbul Dental", "source": "MANUAL", "countryCode": "TR"}'::jsonb) ->> 'businessId') as tr \gset
select (public.import_business(:'ws', '{"name": "Texas Dental", "source": "MANUAL", "countryCode": "US"}'::jsonb) ->> 'businessId') as us \gset
reset role;

-- Pencere/limit sebepleri karışmasın: 7 gün, gün boyu açık.
update public.workspace_settings
set followup_policy = jsonb_set(
  followup_policy, '{sendWindow}',
  '{"days": [1,2,3,4,5,6,7], "from": "00:00", "to": "23:59", "tz": "Europe/Istanbul"}'::jsonb
)
where workspace_id = :'ws';
update public.businesses set timezone = 'Europe/Istanbul' where id in (:'tr', :'us');

set local role authenticated;
select ok(
  not (public.outreach_guard(:'tr', 'EMAIL') -> 'reasons') ? 'FOREIGN_EMAIL_DISABLED',
  'TR işletmesine e-posta kilitlenmez'
);
select ok(
  (public.outreach_guard(:'us', 'EMAIL') -> 'reasons') ? 'FOREIGN_EMAIL_DISABLED',
  'Ayar yokken ABD işletmesine e-posta reddedilir'
);
select ok(
  not (public.outreach_guard(:'us', 'WHATSAPP') -> 'reasons') ? 'FOREIGN_EMAIL_DISABLED',
  'Kilit yalnızca e-posta kanalına uygulanır'
);
reset role;

-- Yönetici ayarı açar.
set local role authenticated;
update public.workspace_settings
set outreach_limits = jsonb_set(outreach_limits, '{allow_foreign_email}', 'true'::jsonb)
where workspace_id = :'ws';
select ok(
  not (public.outreach_guard(:'us', 'EMAIL') -> 'reasons') ? 'FOREIGN_EMAIL_DISABLED',
  'Yönetici ayarı açınca ABD işletmesine e-posta kilitlenmez'
);
reset role;

-- Ayar açıkça false ise de kapalıdır.
update public.workspace_settings
set outreach_limits = jsonb_set(outreach_limits, '{allow_foreign_email}', 'false'::jsonb)
where workspace_id = :'ws';
set local role authenticated;
select ok(
  (public.outreach_guard(:'us', 'EMAIL') -> 'reasons') ? 'FOREIGN_EMAIL_DISABLED',
  'allow_foreign_email=false iken ABD işletmesine e-posta reddedilir'
);
reset role;

-- mark_message_sent da kilidi uygular (arayüz atlansa bile).
insert into public.conversations (id, workspace_id, business_id, channel)
values ('f2000000-0000-0000-0000-000000000001', :'ws', :'us', 'EMAIL');
insert into public.messages (id, workspace_id, conversation_id, direction, status, body, author_type)
values ('f3000000-0000-0000-0000-000000000001', :'ws', 'f2000000-0000-0000-0000-000000000001', 'OUT', 'APPROVED', 'Merhaba', 'USER');

set local role authenticated;
select throws_like(
  $q$select public.mark_message_sent('f3000000-0000-0000-0000-000000000001', 'hash-1', null)$q$,
  '%FOREIGN_EMAIL_DISABLED%',
  'mark_message_sent kilitliyken yurtdışı e-postayı reddeder'
);
reset role;

-- MEMBER ayarı açamaz (güncelleme sessizce 0 satır etkiler).
insert into public.workspace_members (workspace_id, user_id, role)
values (:'ws', 'f1000000-0000-0000-0000-000000000002', 'MEMBER');

select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000002', true);
set local role authenticated;
update public.workspace_settings
set outreach_limits = jsonb_set(outreach_limits, '{allow_foreign_email}', 'true'::jsonb)
where workspace_id = :'ws';
reset role;

select is(
  (select outreach_limits ->> 'allow_foreign_email' from public.workspace_settings where workspace_id = :'ws'),
  'false',
  'MEMBER yurtdışı e-posta ayarını açamaz'
);

select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select lives_ok(
  format($q$select public.outreach_guard(%L, 'EMAIL')$q$, :'tr'),
  'Fonksiyon TR işletmesi için hatasız çalışır'
);

select * from finish();

rollback;
