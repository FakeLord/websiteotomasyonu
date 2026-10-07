-- G2 (ADR 0012): gönderim penceresi işletmenin YEREL saat diliminde hesaplanır. Gerçek saate bağlı olmamak için
-- pencere, Sydney'in o anki yerel saatinin etrafına kurulur; Sydney'deki işletme pencerenin içinde, Los Angeles'taki
-- (17–19 saat farklı) dışında kalmalıdır. Sonra pencere Los Angeles'a kaydırılıp tersi doğrulanır.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(7);

-- ±20 dk'lık pencere; gece yarısı taşmasını kenarda keserek testi her saatte kararlı tutar.
create function pg_temp.win(p_tz text) returns jsonb language sql as $f$
  select jsonb_build_object(
    'days', jsonb_build_array(1, 2, 3, 4, 5, 6, 7),
    'from', case when (now() at time zone p_tz)::time < time '00:20' then '00:00'
                 else to_char((now() at time zone p_tz)::time - interval '20 minutes', 'HH24:MI') end,
    'to',   case when (now() at time zone p_tz)::time > time '23:39' then '23:59'
                 else to_char((now() at time zone p_tz)::time + interval '20 minutes', 'HH24:MI') end,
    'tz', 'Europe/Istanbul'
  )
$f$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e3000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'tz@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('TZ WS') as ws \gset

select (public.import_business(:'ws', '{"name": "Sydney Dental", "source": "MANUAL", "countryCode": "AU", "timezone": "Australia/Sydney"}'::jsonb) ->> 'businessId') as syd \gset
select (public.import_business(:'ws', '{"name": "LA Dental", "source": "MANUAL", "countryCode": "US", "timezone": "America/Los_Angeles"}'::jsonb) ->> 'businessId') as la \gset
select (public.import_business(:'ws', '{"name": "Zone Yok Dental", "source": "MANUAL", "countryCode": "TR"}'::jsonb) ->> 'businessId') as notz \gset
reset role;

-- Pencere: 7 gün açık, Sydney yerel saatinin ±20 dk'sı.
update public.workspace_settings
set followup_policy = jsonb_set(
  followup_policy, '{sendWindow}',
  pg_temp.win('Australia/Sydney')
)
where workspace_id = :'ws';

set local role authenticated;
select ok(
  not (public.outreach_guard(:'syd', 'EMAIL') -> 'reasons') ? 'OUTSIDE_SEND_WINDOW',
  'Sydney işletmesi, Sydney yerel saatine kurulu pencerenin içindedir'
);
select ok(
  (public.outreach_guard(:'la', 'EMAIL') -> 'reasons') ? 'OUTSIDE_SEND_WINDOW',
  'Aynı anda Los Angeles işletmesi pencerenin dışındadır'
);
reset role;

-- Pencereyi Los Angeles'a kaydır: sonuçlar tersine döner.
update public.workspace_settings
set followup_policy = jsonb_set(
  followup_policy, '{sendWindow}',
  pg_temp.win('America/Los_Angeles')
)
where workspace_id = :'ws';

set local role authenticated;
select ok(
  not (public.outreach_guard(:'la', 'EMAIL') -> 'reasons') ? 'OUTSIDE_SEND_WINDOW',
  'Los Angeles işletmesi, Los Angeles yerel saatine kurulu pencerenin içindedir'
);
select ok(
  (public.outreach_guard(:'syd', 'EMAIL') -> 'reasons') ? 'OUTSIDE_SEND_WINDOW',
  'Aynı anda Sydney işletmesi pencerenin dışındadır'
);
reset role;

-- Saat dilimi boşsa sendWindow.tz kullanılır: pencere İstanbul saatine kurulur, tz alanı da İstanbul.
update public.workspace_settings
set followup_policy = jsonb_set(
  followup_policy, '{sendWindow}',
  pg_temp.win('Europe/Istanbul')
)
where workspace_id = :'ws';
update public.businesses set timezone = null where id = :'notz';

set local role authenticated;
select ok(
  not (public.outreach_guard(:'notz', 'EMAIL') -> 'reasons') ? 'OUTSIDE_SEND_WINDOW',
  'Saat dilimi boş işletme sendWindow.tz (İstanbul) ile değerlendirilir'
);
reset role;

-- Gün listesi ayarı okunur: hiçbir gün açık değilse (boş dizi → varsayılan Pzt–Cum) değil, yalnızca bugün hariç kalan günler açıkken kapalıdır.
update public.workspace_settings
set followup_policy = jsonb_set(
  followup_policy, '{sendWindow}',
  jsonb_build_object(
    'days', (select jsonb_agg(d) from generate_series(1, 7) d where d <> extract(isodow from now() at time zone 'Australia/Sydney')::integer),
    'from', '00:00', 'to', '23:59', 'tz', 'Europe/Istanbul'
  )
)
where workspace_id = :'ws';

set local role authenticated;
select ok(
  (public.outreach_guard(:'syd', 'EMAIL') -> 'reasons') ? 'OUTSIDE_SEND_WINDOW',
  'Sydney''de bugünün haftaiçi günü ayarda kapalıysa pencere dışıdır (days ayarı okunur)'
);

-- Geçersiz saat dilimi adı hata vermez, İstanbul'a düşer.
reset role;
update public.businesses set timezone = 'Mars/Olympus' where id = :'notz';
set local role authenticated;
select lives_ok(
  format($q$select public.outreach_guard(%L, 'EMAIL')$q$, :'notz'),
  'Geçersiz saat dilimi adı fonksiyonu bozmaz'
);

select * from finish();

rollback;
