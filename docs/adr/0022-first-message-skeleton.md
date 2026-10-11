# ADR 0022 — İlk mesaj iskeleti kodda, teklif paragrafı modelde (taslak kalitesi turu)

**Durum:** Kabul · 2026-10-11 (kullanıcı geri bildirimi: "hazır taslak yazıları çok saçma, basit")
**İlgili:** ADR 0013 (ilk mesaj tasarımı), ADR 0020 (ücretsiz NVIDIA + eval seti)

## Bağlam
Ücretsiz küçük modelin baştan sona serbest yazdığı taslaklar eval çıktısında kullanılabilir ama kötüydü: bozuk Türkçe
("sitelerimiz erişilemiyor", "hayvan hastalıklarının önlenmesine… canlı hissiyatlı çözümler"), alakasız konu satırları,
yanlış özneler ve KB'deki süslü ifadelerin ("premium", "canlı hissiyatlı") bağlamsızca yapıştırılması.

## Karar
- **İskelet kodda** (`packages/core/src/ai/prompts/compose-first-message.ts`): selamlama, işletmeye özel **gözlem**, konu satırı ve
  kapanış deterministik, elle yazılmış cümlelerle üretilir. Gözlem yalnızca işletme verisinden beslenir: Google puanı/yorum
  (≥ 4,5 güçlü itibar; 4,0–4,4 yalnızca olgu; altı veya < 10 yorum anılmaz), `website_status` ve site sorunları
  (en çok ikisi, okunur cümleyle). Aynı işletme aynı çeşidi alır; farklı işletmeler 2 çeşit arasında dağılır.
- **Model yalnızca teklif paragrafını yazar** (2–3 kısa cümle, ≤ 45 kelime): şirket kimdir, KB'deki teklif bu işletmeye uyarlı,
  tek soru. Süslü KB sözcüklerini olduğu gibi yapıştırmaz; `{"body": "..."}` döner, sıcaklık 0,4, prompt sürümü 9.
- **Doğrulama aynı:** birleşik metin `detectDraftLanguage`, `findForeignWords`, `validateDraft` ve en çok 3 yeniden üretimden geçer.
- **Doğruluk:** analiz yapılmamış işletmede "sitesi yok" denmez (`website_status` null → nötr gözlem); bot engeli site sorunu sayılmaz.
- DM kanallarında tek cümlelik kısa gözlem + ≤ 25 kelimelik paragraf; kapanış yok.

## Sonuçlar
- Teklif KB'den gelmeye devam eder (KB tek kaynak); kodda sabit teklif metni yoktur.
- Eval koşucusu (`scripts/eval/run.ts`) aynı birleştirmeyi kullanır; veri seti gerçek analiz biçimine (sitesiz = boş sorun listesi,
  `websiteStatus`) uyduruldu.
- Gözlem cümleleri Türkçe ek (-in/-e) gerektiren yapılardan bilerek kaçınır (işletme adı özne olarak durur).
- Takip (follow-up) ve cevap taslakları bu turda değişmedi.
