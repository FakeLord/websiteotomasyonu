-- Faz 1: workspaces, workspace_members, workspace_invites, workspace_settings
-- + is_member/is_admin/my_workspace_ids yardımcı fonksiyonları + RLS.
--
-- Not: kullanıcı referansları auth.users(id) yerine public.profiles(id)'e FK
-- edilir (profiles, on_auth_user_created trigger'ı ile auth.users'ın her zaman
-- 1:1 gölgesidir). Bu, PostgREST'in workspace_members→profiles gibi ilişkileri
-- otomatik "embed" edebilmesi için gerekli standart bir Supabase pratiğidir;
-- auth.users doğrudan FK hedefi olduğunda PostgREST embedding çalışmaz.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('ADMIN', 'MEMBER', 'AGENT')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role text not null check (role in ('ADMIN', 'MEMBER', 'AGENT')),
  token_hash text not null unique,
  invited_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index workspace_invites_workspace_id_idx on public.workspace_invites (workspace_id);

-- Karar Kaydı D3 (outreach limitleri), D6 (hedef kategoriler), D11 (kanal önceliği)
-- ve I.1/I.3/M bölümlerindeki varsayılanlarla dolu tek satırlık ayar tablosu.
create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  automation_level text not null default 'LEVEL_1'
    check (automation_level in ('LEVEL_1', 'LEVEL_2', 'LEVEL_3')),
  target_categories jsonb not null default '[
    "dis_klinigi", "estetik_guzellik_merkezi", "veteriner", "kuafor_berber",
    "fizyoterapi_psikolog_diyetisyen", "spor_salonu_pilates", "restoran_kafe",
    "oto_servis_galeri", "emlak_ofisi", "hukuk_burosu", "egitim_kurumu_kurs",
    "dugun_fotografci"
  ]'::jsonb,
  channel_priority jsonb not null default
    '["EMAIL", "INSTAGRAM", "FACEBOOK", "WHATSAPP", "LINKEDIN", "TIKTOK"]'::jsonb,
  channel_modes jsonb not null default '{
    "EMAIL": "DRAFT", "INSTAGRAM": "ASSISTED", "FACEBOOK": "ASSISTED",
    "LINKEDIN": "MANUAL", "TIKTOK": "MANUAL", "WHATSAPP": "ASSISTED", "PHONE": "MANUAL"
  }'::jsonb,
  outreach_limits jsonb not null default '{
    "daily_total": 40,
    "channels": {"EMAIL": 30, "INSTAGRAM": 15, "FACEBOOK": 15, "WHATSAPP": 10},
    "channel_cooldown_hours": 72,
    "max_followups": 2,
    "places_monthly_cap": null
  }'::jsonb,
  followup_policy jsonb not null default '{
    "steps": [{"afterDays": 3}, {"afterDays": 4}],
    "maxFollowUps": 2,
    "sendWindow": {"days": [1, 2, 3, 4, 5], "from": "09:00", "to": "18:30", "tz": "Europe/Istanbul"},
    "skipHolidays": true,
    "afterSequence": "MARK_LOST_NO_RESPONSE",
    "secondChannelAfterDays": null
  }'::jsonb,
  scoring_rules jsonb not null default '{
    "version": 1,
    "qualifyThreshold": 50,
    "rules": {
      "NO_WEBSITE": 40, "BROKEN_WEBSITE": 35, "LOW_QUALITY_WEBSITE": 25,
      "GOOD_WEBSITE": -20, "NO_BOOKING": 8, "NO_CONTACT_FORM": 5,
      "HIGH_RATING": 8, "HIGH_REVIEW_COUNT": 10, "RUNS_ADS": 10,
      "HAS_INSTAGRAM": 4, "HAS_EMAIL": 4, "HAS_WHATSAPP_MOBILE": 3,
      "HAS_PHONE": 2, "NO_CONTACT_CHANNEL": -30
    }
  }'::jsonb,
  ai_config jsonb not null default '{"provider": "nvidia", "routes": {}}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Yardımcı fonksiyonlar: RLS politikalarında ve RPC'lerde kullanılır.
-- SECURITY DEFINER + sabit search_path; postgres BYPASSRLS'e sahip olduğu için
-- bu fonksiyonların kendisi RLS'ten etkilenmez, yalnızca auth.uid() bazlı
-- filtreleme uygular (bkz. docs/adr/0002-auth.md → madde 4).
create function public.is_member(ws uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid()
  );
$$;

create function public.is_admin(ws uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid() and role = 'ADMIN'
  );
$$;

create function public.my_workspace_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select workspace_id from public.workspace_members where user_id = auth.uid();
$$;

-- profiles: workspace_members artık var, bir workspace'i paylaşan kullanıcıların
-- profillerini görme politikası eklenir (önceki migration yalnızca kendi profilini
-- görmeye izin veriyordu).
create policy profiles_select_shared_workspace on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm1
      join public.workspace_members wm2 on wm1.workspace_id = wm2.workspace_id
      where wm1.user_id = auth.uid() and wm2.user_id = profiles.id
    )
  );

alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;

create policy workspaces_select on public.workspaces
  for select to authenticated
  using (public.is_member(id));

-- workspaces için client tarafından doğrudan INSERT/UPDATE/DELETE politikası
-- yoktur; oluşturma yalnızca bootstrap_workspace() RPC'si iledir (bir sonraki
-- migration), bu da SECURITY DEFINER olarak RLS'i bypass eder.

alter table public.workspace_members enable row level security;
alter table public.workspace_members force row level security;

create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (public.is_member(workspace_id));

create policy workspace_members_admin_update on public.workspace_members
  for update to authenticated
  using (public.is_admin(workspace_id))
  with check (public.is_admin(workspace_id));

create policy workspace_members_admin_delete on public.workspace_members
  for delete to authenticated
  using (public.is_admin(workspace_id));

-- workspace_members INSERT için client politikası yoktur; üyelik yalnızca
-- bootstrap_workspace() ve accept_invite() RPC'leri ile (SECURITY DEFINER) oluşur.

alter table public.workspace_invites enable row level security;
alter table public.workspace_invites force row level security;

create policy workspace_invites_select on public.workspace_invites
  for select to authenticated
  using (public.is_admin(workspace_id));

create policy workspace_invites_admin_delete on public.workspace_invites
  for delete to authenticated
  using (public.is_admin(workspace_id));

-- workspace_invites INSERT yalnızca admin-invite Edge Function'ı (service role)
-- ile yapılır; accept_invite() RPC'si accepted_at'i SECURITY DEFINER olarak günceller.

alter table public.workspace_settings enable row level security;
alter table public.workspace_settings force row level security;

create policy workspace_settings_select on public.workspace_settings
  for select to authenticated
  using (public.is_member(workspace_id));

create policy workspace_settings_admin_update on public.workspace_settings
  for update to authenticated
  using (public.is_admin(workspace_id))
  with check (public.is_admin(workspace_id));

-- workspace_settings satırı yalnızca bootstrap_workspace() ile oluşur (INSERT
-- politikası yok).
