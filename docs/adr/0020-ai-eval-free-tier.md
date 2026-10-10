# ADR 0020 — AI değerlendirme seti ve yalnızca ücretsiz sağlayıcı (G4'ün kalanı)

**Durum:** Kabul · 2026-10-10 (kullanıcı kararı: ücretli anahtar yok, yalnızca ücretsiz sağlayıcı)
**İlgili:** ADR 0006, ADR 0013, `docs/phases/PHASE-16.md`, BACKLOG #30

## Karar
- **Yalnızca ücretsiz sağlayıcı:** NVIDIA (`nvidia/nemotron-3.5-lightning-30b-a3b`, `integrate.api.nvidia.com`). OpenAI anahtarı yoksa
  sağlayıcı zinciri o halkayı `missing_key` ile atlayıp NVIDIA'ya düşer; kod değişikliği gerekmez. Ayarlar → API'de OpenAI
  halkası kapatılabilir.
- **Değerlendirme seti** (`scripts/eval/dataset.ts`): 30 Türkçe + 30 İngilizce işletme (ilk mesaj taslağı) ve 30 Türkçe +
  30 İngilizce müşteri cevabı (niyet sınıflandırma). Veriler uydurmadır.
- **Koşucu** (`scripts/eval/run.ts`): gerçek model çağrısı yalnızca burada ve elle (CLAUDE.md #6). Uygulamayla aynı kontrol
  sırası: `stripSignOff` → dil tespiti → yabancı kelime → `validateDraft`, en çok 3 yeniden üretim (`retryRejected`).
  Cevaplarda uygulamadaki gibi model **veya** `hasStopKeyword` yedeği durdurma sayılır. Hız sınırına karşı bekleme ve 429
  yeniden denemesi vardır. `--mock` ağsız hat kontrolüdür.
- **Ölçütler** (`summarizeDraftEval` / `summarizeClassifyEval`): kullanılabilir taslak oranı (hedef ≥ %90, her iki dilde),
  ilk denemede geçme oranı, red sebepleri; niyet doğruluğu, "yazmayın" yakalama oranı, yanlış durdurma oranı.
- **Bu çalışmayla yapılan iyileştirmeler:** `classify_reply` istemi Türkçe+İngilizce (sürüm 2); `hasStopKeyword` yedeği
  net durdurma ifadeleriyle genişletildi (eval setindeki 10 durdurma örneğinin hepsini tek başına yakalar).

## Sınırlar
- Küçük ücretsiz modelin Türkçe dil bilgisi hataları kodla yakalanamaz (ADR 0006 notu); ölçüm "kullanılabilir" oranı verir,
  anlatım kalitesini değil. Taslakları insan onayı (Onay Bekleyenler) zaten süzer.
- Ücretsiz katmanın hız ve günlük kotası belirsizdir; koşucu varsayılan olarak 2 sn arayla çağırır.
- Sonuç dosyaları `scripts/eval/results/` altındadır ve git dışındadır.
