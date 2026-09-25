-- Faz 2: contact_channels, notes, stage_transitions, search_jobs.

create table public.contact_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel text not null check (channel in (
    'INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'EMAIL', 'WHATSAPP', 'PHONE', 'WEBSITE_FORM'
  )),
  value text not null,
  normalized_value text not null,
  found_via text not null check (found_via in ('PLACES', 'WEBSITE', 'JSON_LD', 'MANUAL')),
  confidence numeric not null default 0.5,
  status text not null default 'UNVERIFIED' check (status in ('UNVERIFIED', 'VALID', 'INVALID', 'BOUNCED')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, channel, normalized_value)
);

create index contact_channels_business_id_idx on public.contact_channels (business_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index notes_business_id_idx on public.notes (business_id, created_at desc);

create table public.stage_transitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  from_stage text,
  to_stage text not null,
  reason text,
  actor_type text not null check (actor_type in ('USER', 'AI', 'JARVIS', 'SYSTEM')),
  actor_user_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index stage_transitions_business_id_idx on public.stage_transitions (business_id, created_at desc);

create table public.search_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('GOOGLE_PLACES', 'META_ADS', 'GOOGLE_ADS', 'MANUAL', 'IMPORT')),
  params jsonb not null default '{}'::jsonb,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED')),
  requested_by uuid not null references public.profiles (id),
  api_calls integer not null default 0,
  result_count integer not null default 0,
  new_count integer not null default 0,
  duplicate_count integer not null default 0,
  next_page_token text,
  error text,
  is_saved boolean not null default false,
  locked_by text,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create index search_jobs_workspace_idx on public.search_jobs (workspace_id, created_at desc);

alter table public.business_sources
  add constraint business_sources_search_job_id_fkey
  foreign key (search_job_id) references public.search_jobs (id) on delete set null;

-- contact_channels
alter table public.contact_channels enable row level security;
alter table public.contact_channels force row level security;

create policy contact_channels_select on public.contact_channels
  for select to authenticated
  using (public.is_member(workspace_id));

create policy contact_channels_insert on public.contact_channels
  for insert to authenticated
  with check (public.is_member(workspace_id));

create policy contact_channels_update on public.contact_channels
  for update to authenticated
  using (public.is_member(workspace_id))
  with check (public.is_member(workspace_id));

create policy contact_channels_delete on public.contact_channels
  for delete to authenticated
  using (public.is_member(workspace_id));

-- notes: yalnızca yazar düzenler/siler.
alter table public.notes enable row level security;
alter table public.notes force row level security;

create policy notes_select on public.notes
  for select to authenticated
  using (public.is_member(workspace_id));

create policy notes_insert on public.notes
  for insert to authenticated
  with check (public.is_member(workspace_id) and author_id = auth.uid());

create policy notes_update on public.notes
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy notes_delete on public.notes
  for delete to authenticated
  using (author_id = auth.uid());

-- stage_transitions: yalnızca transition_stage() RPC'si yazar.
alter table public.stage_transitions enable row level security;
alter table public.stage_transitions force row level security;

create policy stage_transitions_select on public.stage_transitions
  for select to authenticated
  using (public.is_member(workspace_id));

-- search_jobs
alter table public.search_jobs enable row level security;
alter table public.search_jobs force row level security;

create policy search_jobs_select on public.search_jobs
  for select to authenticated
  using (public.is_member(workspace_id));

create policy search_jobs_insert on public.search_jobs
  for insert to authenticated
  with check (public.is_member(workspace_id) and requested_by = auth.uid());

create policy search_jobs_update on public.search_jobs
  for update to authenticated
  using (public.is_member(workspace_id))
  with check (public.is_member(workspace_id));
