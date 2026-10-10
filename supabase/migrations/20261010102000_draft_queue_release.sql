-- ADR 0018: taslak kuyruğu çalıştırıcısı günlük AI kotası dolunca veya kurulum eksikse (Şirket kaydı yok)
-- işi başarısız saymadan kuyruğa geri bırakmalıdır. complete_draft_job'a 'QUEUED' (bırak) durumu eklenir;
-- bırakılan işin deneme sayısı geri alınır, böylece kota beklemesi 3 deneme hakkını tüketmez.

create or replace function public.complete_draft_job(
  p_job_id uuid,
  p_device_id text,
  p_status text,
  p_error text default null,
  p_message_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.draft_jobs%rowtype;
begin
  if p_status not in ('DONE', 'FAILED', 'QUEUED') then
    raise exception 'status must be DONE, FAILED or QUEUED';
  end if;

  select * into v_job from public.draft_jobs where id = p_job_id;
  if not found or not public.is_member(v_job.workspace_id) then
    raise exception 'draft job % not found or not accessible', p_job_id;
  end if;
  if v_job.claimed_by is distinct from p_device_id then
    return;
  end if;

  update public.draft_jobs
  set status = p_status,
      error = case when p_status = 'DONE' then null else left(coalesce(p_error, 'Bilinmeyen hata'), 500) end,
      message_id = case when p_status = 'DONE' then p_message_id else null end,
      attempts = case when p_status = 'QUEUED' then greatest(attempts - 1, 0) else attempts end,
      claimed_by = null, claimed_until = null, updated_at = now()
  where id = p_job_id;
end;
$$;
