-- save_website_analysis(): website_analyses satırı + businesses.website_status +
-- contact_channels yazar; website_status doğrudan UPDATE ile değiştirilemez;
-- A workspace'inin analizleri B workspace'inden görünmez (SPEC.md → H, I.2).
begin;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'alice-wa@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'bob-wa@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

create temporary table wa_test_ids (label text primary key, id uuid);
grant all on wa_test_ids to authenticated;

select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select public.bootstrap_workspace('WA Workspace A');

insert into wa_test_ids values ('workspace_a', (select id from public.workspaces where name = 'WA Workspace A'));

select public.import_business(
  (select id from wa_test_ids where label = 'workspace_a'),
  jsonb_build_object('name', 'ABC Diş Kliniği', 'source', 'MANUAL'),
  null
);

insert into wa_test_ids values ('business_a', (select id from public.businesses where name = 'ABC Diş Kliniği'));

select public.save_website_analysis(
  (select id from wa_test_ids where label = 'workspace_a'),
  (select id from wa_test_ids where label = 'business_a'),
  jsonb_build_object(
    'status', 'LOW_QUALITY_WEBSITE',
    'pagesFetched', 1,
    'httpStatus', 200,
    'checks', jsonb_build_object('https', false),
    'issues', jsonb_build_array('Site HTTPS kullanmıyor (güvenli değil).'),
    'analyzerVersion', 1,
    'contacts', jsonb_build_array(
      jsonb_build_object('channel', 'PHONE', 'value', '+905321234567', 'normalizedValue', '+905321234567', 'foundVia', 'WEBSITE', 'confidence', 0.9)
    )
  )
);

select is(
  (select website_status from public.businesses where name = 'ABC Diş Kliniği'),
  'LOW_QUALITY_WEBSITE',
  'save_website_analysis() businesses.website_status''u günceller'
);

select is(
  (select count(*)::int from public.website_analyses
     where business_id = (select id from public.businesses where name = 'ABC Diş Kliniği')),
  1,
  'save_website_analysis() bir website_analyses satırı ekler'
);

select is(
  (select count(*)::int from public.contact_channels
     where business_id = (select id from public.businesses where name = 'ABC Diş Kliniği')
       and channel = 'PHONE' and normalized_value = '+905321234567'),
  1,
  'save_website_analysis() analizde bulunan iletişim kanalını contact_channels''a ekler'
);

select throws_like(
  $$ update public.businesses set website_status = 'GOOD_WEBSITE' where name = 'ABC Diş Kliniği' $$,
  '%permission denied%',
  'website_status doğrudan UPDATE ile değiştirilemez (kolon bazlı GRANT reddi)'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Bob, ikinci bir workspace'e postgres context'inde eklenir (izolasyon testi fixture'ı).
insert into public.workspaces (id, name, created_by)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'WA Workspace B', 'b2222222-2222-2222-2222-222222222222');
insert into public.workspace_members (workspace_id, user_id, role)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'b2222222-2222-2222-2222-222222222222', 'ADMIN');
insert into public.workspace_settings (workspace_id)
values ('bbbbbbbb-0000-0000-0000-000000000002');

select set_config('request.jwt.claim.sub', 'b2222222-2222-2222-2222-222222222222', true);
set local role authenticated;

select is(
  (select count(*)::int from public.website_analyses
     where workspace_id = (select id from wa_test_ids where label = 'workspace_a')),
  0,
  'Bob, Workspace A''nın website_analyses satırlarını SELECT ile göremez'
);

select throws_like(
  format(
    $$select public.save_website_analysis(%L, %L, '{"status": "GOOD_WEBSITE"}'::jsonb)$$,
    (select id from wa_test_ids where label = 'workspace_a'),
    (select id from wa_test_ids where label = 'business_a')
  ),
  '%not a member of workspace%',
  'Bob, Workspace A için save_website_analysis() çağıramaz'
);

reset role;

select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select throws_like(
  format(
    $$select public.save_website_analysis(%L, %L, '{"status": "NOT_A_REAL_STATUS"}'::jsonb)$$,
    (select id from wa_test_ids where label = 'workspace_a'),
    (select id from wa_test_ids where label = 'business_a')
  ),
  '%invalid website status%',
  'Geçersiz status değeri reddedilir'
);

select is(
  (select count(*)::int from public.website_analyses),
  1,
  'Geçersiz analiz denemesi yeni bir website_analyses satırı oluşturmaz'
);

reset role;

select * from finish();

rollback;
