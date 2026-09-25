-- Faz 2: businesses — workspace'in merkezi lead tablosu (SPEC.md → E, K).
--
-- possible_duplicate_of ve merged_into alanları SPEC'in E listesinde birebir
-- yok; "olası duplicate kuyruğu" ve merge sonrası kayıt yönetimi için eklenen,
-- gerekçesi docs/adr/0003-realtime-dedupe.md'de belgelenen tasarım kararlarıdır.

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  normalized_name text not null,
  category text,
  address text,
  city text,
  district text,
  lat double precision,
  lng double precision,
  google_place_id text,
  website_url text,
  website_domain text,
  primary_phone_e164 text,
  rating numeric,
  review_count integer,
  business_status text
    check (business_status is null or business_status in ('OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY')),
  website_status text
    check (website_status is null or website_status in ('NO_WEBSITE', 'BROKEN_WEBSITE', 'LOW_QUALITY_WEBSITE', 'GOOD_WEBSITE')),
  lead_score integer not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  scoring_version integer not null default 0,
  stage text not null default 'NEW' check (stage in (
    'NEW', 'QUALIFIED', 'OUTREACH_READY', 'CONTACTED', 'REPLIED', 'ENGAGED',
    'PROPOSAL_READY', 'HANDED_OFF', 'WON', 'DISQUALIFIED', 'LOST'
  )),
  lost_reason text
    check (lost_reason is null or lost_reason in ('NOT_INTERESTED', 'NO_RESPONSE', 'UNREACHABLE', 'HAS_PROVIDER', 'BUDGET', 'OTHER')),
  do_not_contact boolean not null default false,
  dnc_reason text,
  dnc_at timestamptz,
  assigned_to uuid references public.profiles (id),
  last_contacted_at timestamptz,
  next_action_at timestamptz,
  possible_duplicate_of uuid references public.businesses (id),
  merged_into uuid references public.businesses (id),
  version integer not null default 1,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, google_place_id)
);

create index businesses_workspace_website_domain_idx on public.businesses (workspace_id, website_domain);
create index businesses_workspace_phone_idx on public.businesses (workspace_id, primary_phone_e164);
create index businesses_workspace_stage_idx on public.businesses (workspace_id, stage);
create index businesses_workspace_possible_dup_idx
  on public.businesses (workspace_id) where possible_duplicate_of is not null;
create index businesses_workspace_active_idx
  on public.businesses (workspace_id) where merged_into is null;

create table public.business_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  source text not null check (source in ('GOOGLE_PLACES', 'META_ADS', 'GOOGLE_ADS', 'MANUAL', 'IMPORT')),
  external_id text,
  source_url text,
  search_job_id uuid,
  snapshot jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (workspace_id, source, external_id)
);

create index business_sources_business_id_idx on public.business_sources (business_id);

alter table public.businesses enable row level security;
alter table public.businesses force row level security;

create policy businesses_select on public.businesses
  for select to authenticated
  using (public.is_member(workspace_id));

-- businesses için doğrudan client INSERT politikası yoktur: oluşturma yalnızca
-- import_business()/create_manual_business() RPC'leri iledir (dedupe kontrolü
-- bu RPC'lerin dışından bypass edilemesin diye — SECURITY DEFINER, BYPASSRLS).

create policy businesses_update on public.businesses
  for update to authenticated
  using (public.is_member(workspace_id))
  with check (public.is_member(workspace_id));

-- businesses için client tarafından doğrudan DELETE yoktur (SPEC.md → E,
-- soft-delete ilkesi); silme yalnızca ileri fazlarda admin RPC'si ile.

alter table public.business_sources enable row level security;
alter table public.business_sources force row level security;

create policy business_sources_select on public.business_sources
  for select to authenticated
  using (public.is_member(workspace_id));

-- business_sources yalnızca import_business() RPC'si (SECURITY DEFINER) ile
-- yazılır; client'tan doğrudan INSERT/UPDATE politikası yoktur.
