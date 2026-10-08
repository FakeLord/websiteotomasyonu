-- worker_leases tek kilit garantisi + enqueue_search_job kota/tekrar uyarısı.
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(6);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'places@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Places Workspace');

-- İlk cihaz kilidi alır.
select ok(
  (public.acquire_worker_lease(
    (select id from public.workspaces where name = 'Places Workspace'),
    'SEARCH', 'device-A', 120
  )),
  'device-A ilk kilidi alır'
);

-- İkinci cihaz, kilit süresi dolmadan alamaz.
select ok(
  not (public.acquire_worker_lease(
    (select id from public.workspaces where name = 'Places Workspace'),
    'SEARCH', 'device-B', 120
  )),
  'device-B, device-A''nın aktif kilidini alamaz'
);

-- device-A kilidi bırakır, device-B artık alabilir.
select public.release_worker_lease(
  (select id from public.workspaces where name = 'Places Workspace'), 'SEARCH', 'device-A'
);

select ok(
  (public.acquire_worker_lease(
    (select id from public.workspaces where name = 'Places Workspace'),
    'SEARCH', 'device-B', 120
  )),
  'device-A bıraktıktan sonra device-B kilidi alabilir'
);

-- İlk arama kuyruğa alınır, tekrar uyarısı false olmalı.
select is(
  (public.enqueue_search_job(
    (select id from public.workspaces where name = 'Places Workspace'),
    '{"query": "dis klinigi kadikoy"}'::jsonb
  ) ->> 'repeatWarning')::boolean,
  false,
  'İlk arama için tekrar uyarısı yok'
);

-- Aynı params ile ikinci kez çağrılınca tekrar uyarısı true (yine de engellenmez).
select is(
  (public.enqueue_search_job(
    (select id from public.workspaces where name = 'Places Workspace'),
    '{"query": "dis klinigi kadikoy"}'::jsonb
  ) ->> 'repeatWarning')::boolean,
  true,
  'Aynı params 30 gün içinde tekrar edilince repeatWarning true döner'
);

-- Kota aşılınca yeni arama reddedilir.
update public.workspace_settings
set outreach_limits = jsonb_set(outreach_limits, '{places_monthly_cap}', '1')
where workspace_id = (select id from public.workspaces where name = 'Places Workspace');

-- Sayaç artık sunucuda tutulan places_usage'tır (ADR 0014); istemcinin bildirdiği api_calls değil.
reset role;
insert into public.places_usage (workspace_id, month, calls)
select id, date_trunc('month', now())::date, 5 from public.workspaces where name = 'Places Workspace';
set local role authenticated;

select throws_like(
  $$ select public.enqueue_search_job(
       (select id from public.workspaces where name = 'Places Workspace'),
       '{"query": "yeni arama"}'::jsonb
     ) $$,
  '%quota_exceeded%',
  'Aylık kota aşıldığında yeni arama reddedilir'
);

reset role;

select * from finish();

rollback;
