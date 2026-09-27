-- AI sağlayıcı zinciri (ADR 0007): ai_config artık sıralı bir sağlayıcı listesi
-- tutar; ai-gateway sırayla dener (varsayılan OpenAI → NVIDIA). Şekil
-- packages/core/src/ai/provider-chain.ts → normalizeAiConfig() ile okunur;
-- eski tek sağlayıcılı şekil de geçerli kalır, burada yalnızca varsayılan
-- NVIDIA yapılandırmasındaki workspace'ler yeni zincire taşınır.

alter table public.workspace_settings
  alter column ai_config set default
    '{"providers": [{"id": "openai"}, {"id": "nvidia"}], "dailyLimit": 300}'::jsonb;

update public.workspace_settings
set ai_config = jsonb_build_object(
  'providers', '[{"id": "openai"}, {"id": "nvidia"}]'::jsonb,
  'dailyLimit', coalesce((ai_config ->> 'dailyLimit')::integer, 300)
)
where not (ai_config ? 'providers')
  and coalesce(ai_config ->> 'provider', 'nvidia') = 'nvidia'
  and not (ai_config ? 'baseUrl');
