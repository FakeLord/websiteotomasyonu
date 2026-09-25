-- Faz 6: services/service_packages/kb_entries (Knowledge Base) ve ai_runs
-- (AI gözlemlenebilirliği). SPEC.md → E (tablo listesi), J (AI Sales Agent).
--
-- ai_runs yalnızca metadata tutar (SPEC.md → E: "Prompt/yanıt metni ve
-- anahtar tutulmaz"). J.4'teki 24 saatlik cache için asıl JSON çıktısı ayrı
-- bir `ai_output_cache` tablosunda durur — bu, ai_runs'ın "metin/anahtar
-- tutulmaz" ilkesini bozmadan cache özelliğini uygular (bkz. docs/qa/phase-06.md).

create table public.services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_packages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  name text not null,
  summary text,
  price_min numeric,
  price_max numeric,
  currency text not null default 'TRY',
  features jsonb not null default '[]'::jsonb,
  delivery_days_min integer,
  delivery_days_max integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (price_min is null or price_max is null or price_min <= price_max),
  check (delivery_days_min is null or delivery_days_max is null or delivery_days_min <= delivery_days_max)
);

create index service_packages_service_id_idx on public.service_packages (service_id);

create table public.kb_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type text not null check (type in ('COMPANY', 'FAQ', 'REFERENCE', 'SALES_RULE', 'OBJECTION')),
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_verified_real boolean not null default false,
  updated_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kb_entries_workspace_type_idx on public.kb_entries (workspace_id, type);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null,
  model text not null,
  operation text not null,
  prompt_version integer not null,
  status text not null check (status in ('OK', 'ERROR', 'REJECTED_BY_VALIDATOR', 'CACHED')),
  error_code text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  entity_type text,
  entity_id uuid,
  requested_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index ai_runs_workspace_created_idx on public.ai_runs (workspace_id, created_at desc);

-- Yalnızca `ai-gateway` Edge Function (service_role) yazar; client'a INSERT
-- yolu açılmaz (activity_logs ile aynı ilke — CLAUDE.md #4'ün AI günlüğü
-- karşılığı).
create table public.ai_output_cache (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  operation text not null,
  input_hash text not null,
  prompt_version integer not null,
  output jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, operation, input_hash, prompt_version)
);

-- services
alter table public.services enable row level security;
alter table public.services force row level security;

create policy services_select on public.services
  for select to authenticated using (public.is_member(workspace_id));
create policy services_admin_write on public.services
  for all to authenticated
  using (public.is_admin(workspace_id))
  with check (public.is_admin(workspace_id));

-- service_packages
alter table public.service_packages enable row level security;
alter table public.service_packages force row level security;

create policy service_packages_select on public.service_packages
  for select to authenticated using (public.is_member(workspace_id));
create policy service_packages_admin_write on public.service_packages
  for all to authenticated
  using (public.is_admin(workspace_id))
  with check (public.is_admin(workspace_id));

-- kb_entries
alter table public.kb_entries enable row level security;
alter table public.kb_entries force row level security;

create policy kb_entries_select on public.kb_entries
  for select to authenticated using (public.is_member(workspace_id));
create policy kb_entries_admin_write on public.kb_entries
  for all to authenticated
  using (public.is_admin(workspace_id))
  with check (public.is_admin(workspace_id));

-- ai_runs: yalnızca admin okur; yazma yalnızca service_role (Edge Function).
alter table public.ai_runs enable row level security;
alter table public.ai_runs force row level security;

create policy ai_runs_admin_select on public.ai_runs
  for select to authenticated using (public.is_admin(workspace_id));

-- ai_output_cache: istemciye hiç açılmaz (yalnızca service_role okur/yazar).
alter table public.ai_output_cache enable row level security;
alter table public.ai_output_cache force row level security;

-- Kullanıcıya dönük her mutasyon activity log yazar (CLAUDE.md #8).
create function public.kb_write_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_entity_id uuid;
  v_name text;
begin
  if TG_OP = 'DELETE' then
    v_ws := old.workspace_id;
    v_entity_id := old.id;
    v_name := coalesce(old.name, old.title, '');
  else
    v_ws := new.workspace_id;
    v_entity_id := new.id;
    v_name := coalesce(new.name, new.title, '');
  end if;

  perform public.log_activity(
    v_ws,
    lower(TG_TABLE_NAME) || '.' || lower(TG_OP),
    TG_TABLE_NAME, v_entity_id,
    format('%s: %s', TG_TABLE_NAME, v_name),
    '{}'::jsonb
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger services_write_log
  after insert or update or delete on public.services
  for each row execute function public.kb_write_log();

create trigger service_packages_write_log
  after insert or update or delete on public.service_packages
  for each row execute function public.kb_write_log();

create trigger kb_entries_write_log
  after insert or update or delete on public.kb_entries
  for each row execute function public.kb_write_log();
