-- Faz 1: profiles tablosu + auth.users için otomatik profil oluşturma trigger'ı.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Bir kullanıcı kendi profilini ve kendisiyle en az bir workspace paylaşan
-- kullanıcıların profillerini görebilir. workspace_members henüz bu migration'da
-- yok; policy bir sonraki migration'da (workspace_members oluşturulduktan sonra)
-- ayrı bir migration ile eklenir ki her migration kendi tablosunu tanımlasın.
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Yeni auth kullanıcısı oluşunca otomatik profil satırı açar.
-- SECURITY DEFINER + postgres sahipliği sayesinde FORCE RLS'i bypass eder
-- (bkz. docs/adr/0002-auth.md → madde 4).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
