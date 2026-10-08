-- Kampanya düzenleme ve silme. Kanal ve segment değiştirilemez: üyeler (ve taslaklar) bunlara göre eklenmiştir; değiştirmek
-- kampanyayı sessizce başka bir şeye çevirirdi. Düzenlenebilen: ad, açıklama, takip adımı sayısı, günlük limit.
-- Silme yalnızca kimseye yazılmamış kampanyada olur (SENT/REPLIED üye yoksa); yazılmış kampanya "Tamamlandı" yapılır.
create function public.update_campaign(
  p_campaign_id uuid,
  p_name text,
  p_description text,
  p_followup_steps integer,
  p_daily_limit integer
)
returns public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.campaigns%rowtype;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if auth.uid() is null or not found or not public.is_member(v_campaign.workspace_id) then
    raise exception 'campaign not found';
  end if;
  if v_campaign.status = 'COMPLETED' then
    raise exception 'completed campaign cannot be edited';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 120 then
    raise exception 'invalid name';
  end if;
  if p_description is not null and length(p_description) > 1000 then
    raise exception 'invalid description';
  end if;
  if p_followup_steps not between 0 and 5 then
    raise exception 'invalid followup_steps';
  end if;
  if p_daily_limit not between 1 and 200 then
    raise exception 'invalid daily_limit';
  end if;

  update public.campaigns
  set name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), ''),
      followup_steps = p_followup_steps, daily_limit = p_daily_limit, updated_at = now()
  where id = p_campaign_id
  returning * into v_campaign;

  perform public.log_activity(
    v_campaign.workspace_id, 'campaign.updated', 'campaign', p_campaign_id,
    format('Kampanya güncellendi: %s', v_campaign.name), '{}'::jsonb
  );
  return v_campaign;
end;
$$;

create function public.delete_campaign(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.campaigns%rowtype;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if auth.uid() is null or not found or not public.is_member(v_campaign.workspace_id) then
    raise exception 'campaign not found';
  end if;
  if exists (select 1 from public.campaign_members where campaign_id = p_campaign_id and status in ('SENT', 'REPLIED')) then
    raise exception 'campaign has contacted members; complete it instead of deleting';
  end if;

  delete from public.campaigns where id = p_campaign_id;

  perform public.log_activity(
    v_campaign.workspace_id, 'campaign.deleted', 'campaign', p_campaign_id,
    format('Kampanya silindi: %s', v_campaign.name), '{}'::jsonb
  );
end;
$$;

revoke execute on function public.update_campaign(uuid, text, text, integer, integer) from public, anon;
revoke execute on function public.delete_campaign(uuid) from public, anon;
grant execute on function public.update_campaign(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.delete_campaign(uuid) to authenticated;
