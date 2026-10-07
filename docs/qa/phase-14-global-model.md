# QA — Faz 14 (G2): Küresel veri modeli

Otomatik testler: 529 birim testi, 192 pgTAP, 16 Deno testi (hepsi yeşil). Aşağıdakiler elle doğrulanır.

## Yerelde doğrulananlar (2026-10-08, yerel Supabase + tarayıcı)
- [x] 578 mevcut Türkiye kaydı `TR` / `Europe/Istanbul` / `tr` olarak doldu; yeni sütunlar okunuyor.
- [x] ABD, İngiltere, Kanada, Avustralya'dan birer kayıt `import_business` ile eklendi; `market_options` dokuz (ülke, şehir) satırı verdi.
- [x] Üst çubuk "Pazar" seçicisi: ABD seçilince Dashboard "Toplam İşletme 1", Leadler yalnızca Austin kaydını gösterdi.
- [x] Lead detayı: ülke, yerel saat (Austin saati), `+1 512 555 0132` uluslararası telefon, bölge (TX).
- [x] Keşfet: ülke seçici (US), şehir önerileri (Austin), Places isteği ülke/dil taşır (birim + Deno testi).

## Bulutta ve gerçek hesapla doğrulanacaklar (kullanıcı)
- [ ] `supabase db push` ile 4 yeni migration buluta uygulanır (önce `--dry-run`).
- [ ] `supabase functions deploy places-search` ile güncel arama fonksiyonu yayınlanır.
- [ ] Keşfet → Ülke: ABD, Şehir: Austin, Kategori: Diş Kliniği → küçük bir gerçek arama. Sonuçlarda ülke `US`, bölge `TX`,
      posta kodu, saat dilimi `America/Chicago`, telefon `+1…` dolu olmalı. İngiltere (London) ve Avustralya (Sydney) için tekrarlanır.
- [ ] Aynı aramayı iki kez çalıştırınca yinelenen kayıt oluşmaz (`DUPLICATE_MERGED`).
- [ ] Türkiye araması (İstanbul, Diş Kliniği) eskisi gibi çalışır (Türkçe sonuç, `TR`, `Europe/Istanbul`).
- [ ] Pazar filtresi: bir ülke seçilince Leadler, Dashboard, Raporlar, Kampanyalar, Pipeline, Müşteriler, Konuşmalar yalnızca o pazarı gösterir.
- [ ] Yeni kampanya: ülke + şehir seçilince önizleme sayısı yalnızca o pazarı sayar.
- [ ] Müşteri anlaşması: ABD işletmesinde varsayılan para birimi USD; Müşteriler ve Raporlar toplamları para birimine göre ayrı görünür.
- [ ] Lead Ekle: ülke ABD iken `(512) 555-0132` yazılınca `+1 512 555 0132` kaydedilir; geçersiz numara hata verir.
- [ ] CSV içe aktarma: `country` sütunlu bir dosya (US, GB karışık) doğru ülkelerle yüklenir; sütun yoksa seçilen varsayılan ülke kullanılır.
- [ ] Follow-up: ABD (Los Angeles) işletmesine mesaj gönderince bir sonraki takip tarihi yerel saat 09:00'a kurulur (Leadler → Follow-up'ta saat işletme saatine göre).

## Bilinen sınırlar (G2 kapsamı dışı)
- Windows bayrak emojisini çizemediği için ülke kodu (US, GB…) gösterilir.
- Tatil takvimi 5 pazarı kapsar; Türkiye dinî bayramları 2026 dışında yaklaşık hesaplanır (ADR 0012).
- Keşfet kategorileri Türkçe etiket + İngilizce terim; tam dil/kategori sözlüğü G3–G4'te.
- Pipeline/Müşteriler/Konuşmalar'da sabit 500 satır sınırı sürüyor (sayfalama G3).
