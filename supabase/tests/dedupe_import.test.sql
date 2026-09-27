-- import_business: aynı işletmenin farklı yazımları tek kayıt oluşturur
-- (website_domain eşleşmesi üzerinden); yeni işletme normal şekilde eklenir.
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
truncate table public.workspaces cascade;

select plan(5);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'dedupe@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Dedupe Workspace');

select is(
  (public.import_business(
    (select id from public.workspaces where name = 'Dedupe Workspace'),
    jsonb_build_object('name', 'ABC Diş Kliniği', 'websiteDomain', 'abcdis.com', 'source', 'IMPORT'),
    null
  ) ->> 'status'),
  'CREATED',
  'İlk CSV satırı yeni işletme oluşturur'
);

select is(
  (public.import_business(
    (select id from public.workspaces where name = 'Dedupe Workspace'),
    jsonb_build_object('name', 'Abc Dis Klinigi', 'websiteDomain', 'abcdis.com', 'source', 'IMPORT'),
    null
  ) ->> 'status'),
  'DUPLICATE_MERGED',
  'Aynı website_domain''li farklı yazım DUPLICATE_MERGED döner'
);

select is(
  (select count(*)::int from public.businesses
     where workspace_id = (select id from public.workspaces where name = 'Dedupe Workspace')
       and website_domain = 'abcdis.com'),
  1,
  'İki farklı yazımlı CSV satırı tek businesses kaydı oluşturur'
);

-- external_id verilmediğinde (NULL) Postgres unique/ON CONFLICT eşleşmesi
-- tetiklenmez (NULL <> NULL); bu yüzden her import çağrısı ayrı bir
-- business_sources satırı açar. Asıl dedupe garantisi businesses satır
-- sayısındadır (yukarıdaki test), business_sources yalnızca köken geçmişidir.
select is(
  (select count(*)::int from public.business_sources
     where business_id = (select id from public.businesses where website_domain = 'abcdis.com' limit 1)),
  2,
  'external_id olmadan her import çağrısı ayrı bir business_sources geçmiş satırı açar'
);

select is(
  (public.import_business(
    (select id from public.workspaces where name = 'Dedupe Workspace'),
    jsonb_build_object('name', 'XYZ Veteriner', 'websiteDomain', 'xyzvet.com', 'source', 'IMPORT'),
    null
  ) ->> 'status'),
  'CREATED',
  'Farklı bir işletme normal şekilde yeni kayıt olarak eklenir'
);

reset role;

select * from finish();

rollback;
