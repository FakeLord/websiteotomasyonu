-- Faz 1: activity_logs — yalnızca INSERT alan, değiştirilemez denetim izi.

create table public.activity_logs (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_type text not null check (actor_type in ('USER', 'AI', 'JARVIS', 'SYSTEM')),
  actor_user_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_logs_workspace_created_idx
  on public.activity_logs (workspace_id, created_at desc);
create index activity_logs_actor_idx
  on public.activity_logs (workspace_id, actor_type, actor_user_id);

alter table public.activity_logs enable row level security;
alter table public.activity_logs force row level security;

create policy activity_logs_select on public.activity_logs
  for select to authenticated
  using (public.is_member(workspace_id));

-- INSERT/UPDATE/DELETE için hiçbir RLS politikası tanımlanmaz: yazma yalnızca
-- log_activity() RPC'si (SECURITY DEFINER, postgres BYPASSRLS) iledir.
-- authenticated/anon rollerinin tablo düzeyi yazma yetkisi de ayrıca kapatılır
-- (ikinci bir kilit — RPC'nin dışında hiçbir yol INSERT bile yapamaz).
revoke insert, update, delete on public.activity_logs from authenticated, anon;

-- UPDATE/DELETE'i rol farketmeksizin engeller (trigger, RLS/BYPASSRLS'ten
-- bağımsız çalışır; yalnızca proje sahibi trigger'ı DB seviyesinde kapatabilir).
create function public.activity_logs_prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'activity_logs is append-only: % is not allowed', TG_OP;
end;
$$;

create trigger activity_logs_no_update
  before update on public.activity_logs
  for each row execute function public.activity_logs_prevent_mutation();

create trigger activity_logs_no_delete
  before delete on public.activity_logs
  for each row execute function public.activity_logs_prevent_mutation();

-- log_activity RPC: actor_type istemciden alınmaz (SPEC.md → N).
-- USER: auth.uid() bir insan üyeyse. AI/JARVIS/SYSTEM: yalnızca güvenilir
-- sunucu taraflı bağlamlarda set_config('app.actor', '<TİP>', true) ile
-- (ai-gateway, jarvis-gateway, pg_cron — ileri fazlarda) belirlenir.
create function public.log_activity(
  ws uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_type text;
  v_actor_user_id uuid := auth.uid();
  v_id bigint;
begin
  v_actor_type := nullif(current_setting('app.actor', true), '');

  if v_actor_type is null then
    v_actor_type := case when v_actor_user_id is not null then 'USER' else 'SYSTEM' end;
  end if;

  if v_actor_type not in ('USER', 'AI', 'JARVIS', 'SYSTEM') then
    raise exception 'invalid actor_type %', v_actor_type;
  end if;

  if v_actor_type = 'USER' and not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  insert into public.activity_logs (
    workspace_id, actor_type, actor_user_id, action, entity_type, entity_id, summary, metadata
  ) values (
    ws, v_actor_type, v_actor_user_id, p_action, p_entity_type, p_entity_id, p_summary,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Fonksiyon çalıştırma yetkileri: yardımcı fonksiyonlar (is_member/is_admin/
-- my_workspace_ids, önceki migration) ve log_activity yalnızca authenticated'e
-- açık; anon ve PUBLIC'ten alınır.
revoke execute on function public.is_member(uuid) from public;
revoke execute on function public.is_admin(uuid) from public;
revoke execute on function public.my_workspace_ids() from public;
revoke execute on function public.log_activity(uuid, text, text, uuid, text, jsonb) from public;

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.my_workspace_ids() to authenticated;
grant execute on function public.log_activity(uuid, text, text, uuid, text, jsonb) to authenticated;
