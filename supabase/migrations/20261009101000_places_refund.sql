-- ADR 0014: Google çağrısı başarısız olursa (ağ hatası, 4xx/5xx; Google bunları faturalamaz) places-search
-- önceden tükettiği sayacı iade eder. Aksi halde yanlış yapılandırılmış bir anahtar sınırı boşa tüketirdi.
-- Yalnızca service_role.
create function public.refund_places_call(ws uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.places_usage
  set calls = greatest(calls - 1, 0), updated_at = now()
  where workspace_id = ws and month = date_trunc('month', now())::date;
$$;

revoke execute on function public.refund_places_call(uuid) from public, authenticated, anon;
grant execute on function public.refund_places_call(uuid) to service_role;
