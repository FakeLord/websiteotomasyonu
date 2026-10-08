-- Ekip üyesini çıkar. Doğrudan DELETE zaten ADMIN'e açıktı ve son yönetici korumasıyla loglanıyordu, ama çıkarılan kişinin
-- atanmış işletmeleri ve devralınmış devir kartları sahipsiz kalıyordu. Bu RPC temizliği aynı işlemde yapar:
--   * kişinin işletmelerinin ataması kaldırılır,
--   * devralınmış (ACCEPTED) devir kartları yeniden OPEN olur ve sorumlusuz kalır (zil sayacına geri düşer).
-- Yetki: yalnızca ADMIN; kendini çıkaramaz (rolünü değiştirmek için başka bir yönetici gerekir). Son yönetici tetikleyicisi korunur.
create function public.remove_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_unassigned integer;
  v_handoffs integer;
begin
  if v_uid is null or not public.is_admin(p_workspace_id) then
    raise exception 'admin role required';
  end if;
  if p_user_id = v_uid then
    raise exception 'you cannot remove yourself';
  end if;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id) then
    raise exception 'member not found';
  end if;

  update public.businesses
  set assigned_to = null, version = version + 1, updated_at = now()
  where workspace_id = p_workspace_id and assigned_to = p_user_id;
  get diagnostics v_unassigned = row_count;

  update public.human_handoffs
  set assigned_to = null, status = 'OPEN', updated_at = now()
  where workspace_id = p_workspace_id and assigned_to = p_user_id and status = 'ACCEPTED';
  get diagnostics v_handoffs = row_count;

  -- Son yönetici tetikleyicisi ve "Üye çıkarıldı" aktivite kaydı burada çalışır.
  delete from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;

  return jsonb_build_object('unassignedBusinesses', v_unassigned, 'reopenedHandoffs', v_handoffs);
end;
$$;

revoke execute on function public.remove_workspace_member(uuid, uuid) from public, anon;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
