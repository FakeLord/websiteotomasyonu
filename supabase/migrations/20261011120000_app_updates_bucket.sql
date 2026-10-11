-- ADR 0026: masaüstü uygulamasının otomatik güncelleme dosyaları (latest.json + kurulum dosyası).
-- Kurulu uygulama oturumsuz kontrol eder, bu yüzden kova herkese açık okunur (public). Yazma yalnızca service_role'dedir
-- (yayın iş akışı); istemci rolleri için `storage.objects` üzerinde politika tanımlanmaz, yani yazamaz.
-- Dosyalar sır içermez: kurulum dosyası imzalıdır ve Supabase adresi/anon anahtarı zaten uygulamaya gömülüdür.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-updates', 'app-updates', true, 52428800,
  array['application/json', 'application/octet-stream', 'application/x-msdownload', 'text/plain']
)
on conflict (id) do nothing;
