-- Website analizi, sayfadaki sıradan bağlantıları (#bolum, mailto:, "hizmetler" gibi göreli adresler) dört sosyal
-- platformun kullanıcı adı sanıp contact_channels'a yazıyordu (kök neden: packages/core/dedupe/normalize-social.ts,
-- düzeltildi). Bu migration o sahte kayıtları temizler; silinenler önce API'ye kapalı bir yedek tablosuna kopyalanır.
-- Bir konuşmaya bağlı kanallara dokunulmaz.

create schema if not exists maintenance_backup;
revoke all on schema maintenance_backup from public, anon, authenticated;

create table maintenance_backup.contact_channels_bogus_social_20261009 as
select c.*, now() as backed_up_at
from public.contact_channels c
where c.channel in ('INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK')
  and c.found_via in ('WEBSITE', 'JSON_LD')
  and not exists (select 1 from public.conversations v where v.contact_channel_id = c.id)
  and (
    -- Bağlantı o platformun adresi değil.
    c.value !~* ('^((https?:)?//)?([a-z0-9-]+\.)?' || lower(c.channel) || '\.com/')
    -- Platformun adresi ama hesap değil (paylaş düğmesi, giriş sayfası…).
    or split_part(c.normalized_value, ':', 2) in (
      'sharer.php', 'share.php', 'profile.php', 'sharearticle', 'share', 'sharer', 'login', 'plugins', 'dialog',
      'hashtag', 'watch', 'events', 'tr', 'accounts', 'tag', 'discover', 'feed', 'jobs', 'legal', 'help',
      'policies', 'privacy', 'about', 'school', 'company', 'in', 'p', 'reel', 'reels', 'stories', 'explore'
    )
  );

revoke all on maintenance_backup.contact_channels_bogus_social_20261009 from public, anon, authenticated;

delete from public.contact_channels c
using maintenance_backup.contact_channels_bogus_social_20261009 b
where c.id = b.id;

-- TikTok kullanıcı adı "@" ile saklanmıştı ("tiktok:@ad"); yeni biçim "tiktok:ad". Aynı hesap iki biçimde
-- de kayıtlıysa eskisi silinir, değilse yerinde düzeltilir.
delete from public.contact_channels c
where c.channel = 'TIKTOK' and c.normalized_value like 'tiktok:@%'
  and not exists (select 1 from public.conversations v where v.contact_channel_id = c.id)
  and exists (
    select 1 from public.contact_channels d
    where d.workspace_id = c.workspace_id and d.channel = 'TIKTOK'
      and d.normalized_value = replace(c.normalized_value, 'tiktok:@', 'tiktok:')
  );

update public.contact_channels c
set normalized_value = replace(c.normalized_value, 'tiktok:@', 'tiktok:')
where c.channel = 'TIKTOK' and c.normalized_value like 'tiktok:@%'
  and not exists (
    select 1 from public.contact_channels d
    where d.workspace_id = c.workspace_id and d.channel = 'TIKTOK'
      and d.normalized_value = replace(c.normalized_value, 'tiktok:@', 'tiktok:')
  );
