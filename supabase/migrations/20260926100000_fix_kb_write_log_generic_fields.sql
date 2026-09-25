-- Faz 3-8 doğrulama (gerçek Postgres'e karşı pgTAP çalıştırılınca bulundu):
-- kb_write_log() yalnızca `name`/`title` kolonu olan tablolar (services,
-- service_packages, kb_entries) için yazılmıştı ama conversations ve
-- followups tablolarına da trigger olarak bağlanmış; bu tablolarda `name`/
-- `title` kolonu olmadığından "record new has no field name" hatasıyla
-- patlıyordu. new/old'u jsonb'ye çevirip ->> ile okumak, alan yoksa hata
-- yerine null döner.
create or replace function public.kb_write_log()
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
    v_name := coalesce(to_jsonb(old) ->> 'name', to_jsonb(old) ->> 'title', '');
  else
    v_ws := new.workspace_id;
    v_entity_id := new.id;
    v_name := coalesce(to_jsonb(new) ->> 'name', to_jsonb(new) ->> 'title', '');
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
