-- Çalışma alanı adını değiştir. workspaces tablosuna istemciden doğrudan yazılamaz; yalnızca ADMIN bu RPC ile değiştirir
-- ve değişiklik activity log'a düşer (CLAUDE.md #8).
create function public.rename_workspace(p_workspace_id uuid, p_name text)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
  v_workspace public.workspaces%rowtype;
begin
  if v_uid is null or not public.is_admin(p_workspace_id) then
    raise exception 'admin role required';
  end if;
  if p_name is null or length(trim(p_name)) not between 2 and 80 then
    raise exception 'workspace name must be between 2 and 80 characters';
  end if;

  select name into v_old from public.workspaces where id = p_workspace_id for update;

  update public.workspaces set name = trim(p_name) where id = p_workspace_id returning * into v_workspace;

  if v_old is distinct from v_workspace.name then
    perform public.log_activity(
      p_workspace_id, 'workspace.renamed', 'workspace', p_workspace_id,
      format('Çalışma alanı adı değişti: %s → %s', v_old, v_workspace.name),
      jsonb_build_object('from', v_old, 'to', v_workspace.name)
    );
  end if;

  return v_workspace;
end;
$$;

revoke execute on function public.rename_workspace(uuid, text) from public, anon;
grant execute on function public.rename_workspace(uuid, text) to authenticated;
