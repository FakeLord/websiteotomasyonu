-- Sabit mesaj şablonları (WhatsApp'a hazır yazılmış açılan mesaj). Yalnızca Türkçe ve İngilizce; her biri en çok 1500 karakter.
-- Boş kalırsa uygulama varsayılan şablonu kullanır (packages/core/outreach/message-template.ts). Güncelleme yetkisi
-- workspace_settings'in mevcut politikasıyla (yalnızca ADMIN) korunur; değişiklik mevcut ayar günlüğü tetikleyicisiyle loglanır.
alter table public.workspace_settings
  add column message_templates jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(message_templates) = 'object'
      and message_templates - 'tr' - 'en' = '{}'::jsonb
      and coalesce(length(message_templates ->> 'tr'), 0) <= 1500
      and coalesce(length(message_templates ->> 'en'), 0) <= 1500
    );
