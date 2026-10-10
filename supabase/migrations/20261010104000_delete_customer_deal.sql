-- G6 (BACKLOG #17): müşteri anlaşması silinebilir. Yazma yolu yalnızca RPC; silme yalnızca ADMIN (geri alınamaz) ve loglanır.
-- İşletme WON aşamasında kalır; yeni anlaşma tekrar kaydedilebilir.

create function public.delete_customer_deal(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_deal public.customer_deals%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_deal from public.customer_deals where business_id = p_business_id;
  if not found then
    raise exception 'customer deal not found for business %', p_business_id;
  end if;
  v_ws := v_deal.workspace_id;

  if not public.is_member(v_ws) then
    raise exception 'customer deal not found for business %', p_business_id;
  end if;
  if not public.is_admin(v_ws) then
    raise exception 'only ADMIN can delete a customer deal';
  end if;

  delete from public.customer_deals where id = v_deal.id;

  perform public.log_activity(
    v_ws, 'customer.deal_deleted', 'business', p_business_id,
    'Müşteri anlaşması silindi',
    jsonb_build_object('dealId', v_deal.id, 'amount', v_deal.amount, 'currency', v_deal.currency)
  );
end;
$$;

revoke execute on function public.delete_customer_deal(uuid) from public, anon;
grant execute on function public.delete_customer_deal(uuid) to authenticated;
