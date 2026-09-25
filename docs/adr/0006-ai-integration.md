# ADR 0006 — Faz 6 AI entegrasyonu: NVIDIA kullanım koşulları ve operasyon kapsamı

- **Durum:** Kabul edildi
- **Tarih:** 2026-09-26
- **Bağlam:** Faz 6 (Knowledge Base + AI Integration). VERIFY_CURRENT_DOCS: NVIDIA API Trial Terms
  of Service, güncel rate limit, Türkçe destekli model listesi (SPEC.md → J.5).

## Sorun

SPEC.md → J.5, NVIDIA'nın ücretsiz `build.nvidia.com` erişiminin gerçek işletmelere gönderilen
satış mesajları gibi "production" kullanımı kapsam dışı bırakabileceğini belirtiyor ve bunun
doğrulanmasını (VERIFY_CURRENT_DOCS) istiyor.

## Bulgular (2026-09-26 itibarıyla, web araması)

- `build.nvidia.com` üzerindeki ücretsiz NIM API kataloğu, NVIDIA Developer Program üyeliğiyle
  **yalnızca prototipleme/değerlendirme/geliştirme/test amaçlıdır**; gerçek son kullanıcılara hizmet
  veren veya iş işlemi yürüten (ticari) kullanım "production" sayılır ve bu kapsamın dışındadır.
- Ücretsiz katman tipik olarak **40 istek/dakika** ve hesap başına bir kerelik ~1000 "inference
  credit" ile sınırlıdır; model bazında değişebilir.
- Gerçek "production" kullanım için NVIDIA AI Enterprise lisansı (yıllık/GPU-saat ücretli, veya
  90 günlük ücretsiz deneme) gerekir.
- Kaynaklar: [NVIDIA NIM API Pricing 2026](https://decodethefuture.org/en/nvidia-nim-api-pricing-limits-guide/),
  [NVIDIA NIM General FAQ](https://docs.api.nvidia.com/nim/docs/product),
  [NVIDIA Product-Specific Terms for AI Products](https://www.nvidia.com/en-us/agreements/enterprise-software/product-specific-terms-for-ai-products/).

## Karar

1. SPEC.md → J.5'in önerisi aynen uygulanır: **NVIDIA yalnızca geliştirme/pilot içindir**; kod
   hiçbir sağlayıcıya gömülü değildir — `AIProvider` interface'i (packages/providers) arkasında,
   somut sağlayıcı ve model adı `workspace_settings.ai_config`'ten okunur. Gerçek pilot/production
   kullanıcıya gönderim öncesi ekip, OpenAI-uyumlu ücretli bir sağlayıcıya (OpenRouter, Groq, vb.)
   veya NVIDIA AI Enterprise lisansına geçmelidir.
2. `ai-gateway` Edge Function, `ai_config.provider`/`ai_config.baseUrl`/model adını Vault'taki
   sağlayıcıya özgü API key ile birlikte kullanır; kod tarafında NVIDIA'ya özel hiçbir varsayım
   yoktur (OpenAI-uyumlu `chat/completions` sözleşmesi).
3. J.2'deki 6 AI operasyonunun **hepsi** bu fazda saf TypeScript olarak yazılır (context builder +
   prompt + JSON şema + `validateDraft`/operasyon validator'ları), çünkü hepsi pure fonksiyonlardır
   ve DB'ye bağımlı değildir (girdi çağıran tarafından toplanır). Ancak yalnızca `draft_first_message`
   bu fazda gerçek bir UI tetikleyicisine (lead detayında "Taslak oluştur") bağlanır; `classify_reply`,
   `draft_reply`, `update_summary`, `generate_handoff` Faz 7'nin `messages`/`conversations` tabloları,
   `followup_draft` ise Faz 8'in `follow_ups` tablosu olmadan anlamlı bir UI'a sahip olamaz. Bu
   dördü kod + testleriyle hazır durur, Faz 7/8 yalnızca bunları çağıran ekranı ekler.

## Gerekçe

- NVIDIA'nın kullanım koşulları, mimari kararı değiştirmiyor (zaten "1 satırlık konfigürasyonla
  değişebilir" tasarlanmıştı) ama ekip pilot öncesi bilinçli olmalı: gerçek işletmelere gönderilen
  mesajlar "production" sayılabileceğinden ücretsiz katman ihlali riski var.
- Operasyonları şimdiden tam yazıp yalnızca UI bağlamayı ertelemek, hem CLAUDE.md #7'ye (her domain
  kuralı testli olsun) hem #11'e (kapsam dışı ekran eklememe) uyar; Faz 7/8 geldiğinde tekrar
  tasarım yapılmasına gerek kalmaz.

## Sonuçlar

- Pilot öncesi (Faz 9) ekip, `workspace_settings.ai_config`'i gerçek/ücretli bir sağlayıcıya
  çevirmeli veya NVIDIA AI Enterprise değerlendirmesine başvurmalı; bu bir hatırlatma olarak
  `docs/qa/phase-06.md`'a da eklenir.
- Rate limit (40 rpm) göz önüne alınarak `ai-gateway`'de günlük kota + `ai_runs` bazlı 24 saatlik
  cache eklendi (SPEC.md → J.4) — bu hem maliyeti hem NVIDIA'nın rate limitini aşma riskini azaltır.

## Kaynaklar

- https://decodethefuture.org/en/nvidia-nim-api-pricing-limits-guide/
- https://docs.api.nvidia.com/nim/docs/product
- https://www.nvidia.com/en-us/agreements/enterprise-software/product-specific-terms-for-ai-products/
