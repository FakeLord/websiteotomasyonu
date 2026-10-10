# AI değerlendirme (ADR 0020) — çalıştırma ve okuma kılavuzu

## Otomatik doğrulananlar
- Birim: `eval-report.test.ts` (özet fonksiyonları), `prompts.test.ts` (çıkma ifadeleri ve eval setinden gelen yeni anahtar kelimeler).
- `pnpm exec tsx scripts/eval/run.ts --mock` (ağsız): 60 taslak + 60 cevap hatsız çalışır ve sonuç dosyası yazılır.

## Gerçek model ile (elle, ücretsiz NVIDIA anahtarı)
1. PowerShell'de (anahtar yalnızca bu oturumda kalır; sohbette paylaşmayın):
   `$env:NVIDIA_API_KEY = "nvapi-..."`
2. Önce küçük deneme: `pnpm exec tsx scripts/eval/run.ts --only draft --limit 3`
3. Tam çalıştırma (≈ 10–15 dk): `pnpm exec tsx scripts/eval/run.ts`
4. Çıktının son bölümünü (anahtar içermez) paylaşın; `scripts/eval/results/*.json` içinde taslak metinleri de vardır.

## Sonuçları okuma
- **Kullanılabilir taslak ≥ %90 (TR ve EN):** hedef; altındaysa red sebeplerine göre istem/kural düzeltilir.
- **İlk denemede geçme:** düşükse kullanıcı beklemesi uzar (taslak 3 kata kadar yavaşlar).
- **"Yazmayın" yakalama %100 olmalı;** yanlış durdurma yüksekse kayıp lead demektir.
- **Sağlayıcı hatası > 0:** kalite değil erişim/hız sınırıdır; `--delay 4000` ile yeniden deneyin.
