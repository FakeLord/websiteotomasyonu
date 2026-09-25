-- Faz 1: bootstrap_workspace / accept_invite RPC'leri, son-admin koruması,
-- üye ve ayar değişikliği activity log trigger'ları.
--
-- Desktop mimari notu (bkz. docs/adr/0002-auth.md): uygulama bir web sunucusu
-- olmadığı için Supabase'in invite e-postasındaki linki derin bağlantı (deep
-- link) ile yakalamak yerine, workspace_invites.token_hash kısa bir davet
-- kodunun hash'idir; admin bu kodu Team ekranından görüp davetliye elden/
-- mesajla iletir, davetli Supabase şifresini e-postadaki linkle belirledikten
-- sonra masaüstü uygulamasında oturum açar ve "Davet bekleniyor" ekranında bu
-- kodu girerek accept_invite() çağırır.

create extension if not exists pgcrypto with schema extensions;

create function public.bootstrap_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if exists (select 1 from public.workspaces) then
    raise exception 'a workspace already exists; bootstrap_workspace can only run once';
  end if;

  insert into public.workspaces (name, created_by)
  values (p_name, v_uid)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_uid, 'ADMIN');

  insert into public.workspace_settings (workspace_id)
  values (v_workspace_id);

  perform public.log_activity(
    v_workspace_id,
    'workspace.bootstrapped',
    'workspace',
    v_workspace_id,
    'Workspace oluşturuldu',
    '{}'::jsonb
  );

  return v_workspace_id;
end;
$$;

create function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite public.workspace_invites%rowtype;
  v_token_hash text;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select email into v_email from auth.users where id = v_uid;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v_invite
  from public.workspace_invites
  where token_hash = v_token_hash
  for update;

  if not found then
    raise exception 'invalid invite code';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'invite already accepted';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'invite expired';
  end if;

  if v_email is null or lower(v_invite.email) <> lower(v_email) then
    raise exception 'invite email does not match authenticated user';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invite.workspace_id, v_uid, v_invite.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invites
  set accepted_at = now()
  where id = v_invite.id;

  perform public.log_activity(
    v_invite.workspace_id,
    'member.invite_accepted',
    'workspace_member',
    v_uid,
    'Davet kabul edildi',
    jsonb_build_object('role', v_invite.role)
  );

  return v_invite.workspace_id;
end;
$$;

-- Son ADMIN'i düşürme veya silme engellenir.
create function public.workspace_members_protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid := coalesce(old.workspace_id, new.workspace_id);
  v_admin_count int;
begin
  if TG_OP = 'DELETE' and old.role <> 'ADMIN' then
    return old;
  end if;

  if TG_OP = 'UPDATE' and (old.role <> 'ADMIN' or new.role = 'ADMIN') then
    return new;
  end if;

  select count(*) into v_admin_count
  from public.workspace_members
  where workspace_id = v_workspace_id and role = 'ADMIN';

  if v_admin_count <= 1 then
    raise exception 'cannot remove or demote the last ADMIN of a workspace';
  end if;

  if TG_OP = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger workspace_members_protect_last_admin
  before update or delete on public.workspace_members
  for each row execute function public.workspace_members_protect_last_admin();

-- Üye ekleme/çıkarma/rol değişikliği activity log'a düşer (SPEC.md → PHASE-01).
create function public.workspace_members_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.log_activity(
      new.workspace_id, 'member.added', 'workspace_member', new.user_id,
      format('Üye eklendi (rol: %s)', new.role),
      jsonb_build_object('role', new.role)
    );
    return new;
  elsif TG_OP = 'DELETE' then
    perform public.log_activity(
      old.workspace_id, 'member.removed', 'workspace_member', old.user_id,
      format('Üye çıkarıldı (rol: %s)', old.role),
      jsonb_build_object('role', old.role)
    );
    return old;
  elsif TG_OP = 'UPDATE' and old.role is distinct from new.role then
    perform public.log_activity(
      new.workspace_id, 'member.role_changed', 'workspace_member', new.user_id,
      format('Rol değişti: %s → %s', old.role, new.role),
      jsonb_build_object('from_role', old.role, 'to_role', new.role)
    );
    return new;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger workspace_members_log_change
  after insert or update or delete on public.workspace_members
  for each row execute function public.workspace_members_log_change();

-- Ayar değişikliği activity log'a düşer + updated_at otomatik güncellenir.
create function public.workspace_settings_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_activity(
    new.workspace_id, 'settings.updated', 'workspace_settings', new.workspace_id,
    'Workspace ayarları güncellendi', '{}'::jsonb
  );
  new.updated_at := now();
  return new;
end;
$$;

create trigger workspace_settings_log_change
  before update on public.workspace_settings
  for each row execute function public.workspace_settings_log_change();

revoke execute on function public.bootstrap_workspace(text) from public;
revoke execute on function public.accept_invite(text) from public;

grant execute on function public.bootstrap_workspace(text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
