-- Faz 3-8 doğrulama: gerçek Postgres'e karşı pgTAP çalıştırılınca bulunan güvenlik
-- açığı. Postgres'te `revoke update (kolon) on tablo from rol` yalnızca kolon
-- bazlı yetkiyi kaldırır; rol tablo genelinde zaten UPDATE yetkisine sahipse
-- (Supabase'in şema varsayılanı `authenticated` için budur), tablo-geneli yetki
-- öncelikli sayılır ve kolon reddi hiçbir işe yaramaz. Böylece stage,
-- do_not_contact, lead_score, website_status, messages.status gibi CLAUDE.md #5
-- kolonları hâlâ doğrudan UPDATE ile değiştirilebiliyordu.
--
-- Doğru desen: tablo genelindeki UPDATE'i tamamen kaldırıp yalnızca korumasız
-- kolonlara açık GRANT vermek. Önceki üç REVOKE (kolon) ifadesi (pipeline_and_merge,
-- website_analyses, conversations) etkisizdi ve olduğu gibi kalır; bu migration
-- gerçek korumayı sağlar.

revoke update on public.businesses from authenticated;
grant update (
  id, workspace_id, name, normalized_name, category, address, city, district,
  lat, lng, google_place_id, website_url, website_domain, primary_phone_e164,
  rating, review_count, business_status, lost_reason, assigned_to,
  last_contacted_at, next_action_at, possible_duplicate_of, version,
  created_by, created_at, updated_at
) on public.businesses to authenticated;

revoke update on public.messages from authenticated;
grant update (
  id, workspace_id, conversation_id, direction, body, subject, author_type,
  author_user_id, intent, intent_confidence, ai_run_id, created_at
) on public.messages to authenticated;
