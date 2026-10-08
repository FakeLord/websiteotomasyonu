-- ADR 0014: taranamayan (FAILED) kareleri yeniden kuyruğa alır. Bağlantı kesintisi gibi geçici bir hata
-- yüzünden şehirde boşluk kalmasın diye kullanıcı "Taranamayanları yeniden dene" der.
-- Tamamlanmış plan yeniden ACTIVE olur; iptal edilmiş plan açılamaz.
create function public.retry_failed_scan_tiles(p_plan_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.scan_plans%rowtype;
  v_count integer;
begin
  select * into v_plan from public.scan_plans where id = p_plan_id for update;
  if not found or not public.is_member(v_plan.workspace_id) then
    raise exception 'scan plan not found';
  end if;
  if v_plan.status = 'CANCELLED' then
    raise exception 'scan plan is cancelled';
  end if;

  update public.scan_tiles
  set status = 'QUEUED', attempts = 0, error = null, claimed_by = null, claimed_until = null, updated_at = now()
  where plan_id = p_plan_id and status = 'FAILED';
  get diagnostics v_count = row_count;

  if v_count > 0 then
    update public.scan_plans set status = 'ACTIVE', updated_at = now()
    where id = p_plan_id and status = 'DONE';

    perform public.log_activity(
      v_plan.workspace_id, 'scan.tiles_retried', 'scan_plan', p_plan_id,
      format('%s bölge yeniden taranmak üzere kuyruğa alındı', v_count), jsonb_build_object('tiles', v_count)
    );
  end if;

  return v_count;
end;
$$;

revoke execute on function public.retry_failed_scan_tiles(uuid) from public;
grant execute on function public.retry_failed_scan_tiles(uuid) to authenticated;
