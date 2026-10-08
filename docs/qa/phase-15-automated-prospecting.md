# PHASE-15 — Otomatik müşteri bulma, Adım 1 (ADR 0014) — manuel test listesi

Ön koşul (bulut): `supabase db push` (20261009100000, 20261009101000, 20261009102000) ve
`supabase functions deploy places-search`. Ayarlar → Puanlama ve Limitler → "Aylık Places çağrısı" dolu olmalı.

## Otomatik doğrulananlar
- Birim: `scan-tile.test.ts` (kare kapatma kararı), `scan-loop.test.ts` (çalıştırıcı), `tiling.test.ts`,
  `opportunity.test.ts`, `discover-markets.test.ts`.
- pgTAP: `scan_plans.test.sql` (41 doğrulama: bütçe, sahiplik, bölme, duraklatma, yeniden deneme, yalıtım).
- Yerelde tarayıcıda (2026-10-08): Fırsatlar sekmesi ve kanal süzgeçleri gerçek veriyle; "Bütün şehri tara" penceresi
  (sınır tanımlı değil uyarısı, kategori/dil seçimi); İşler kutusu (plan satırı, hata nedeni, Places sayacı, analiz);
  başarısız kare → "Taranamayanları yeniden dene" → yeniden kuyruğa alınıp çalıştırıldı.

## Bulutta elle doğrulanacaklar (yerelde Google anahtarı olmadığı için denenemedi)
- [ ] Keşfet → şehir yaz → "Bütün şehri tara" → 1–2 kategori + dil → "Şehri bul": Google'ın bulduğu yer adı doğru.
- [ ] "Taramayı başlat": İşler kutusunda plan "Sürüyor", üst çubukta "Tarama: şehir · kategori" görünür.
- [ ] Bölge sayısı arttıkça (kalabalık kare dörde bölünür) ilerleme ve "yeni işletme · çağrı" sayıları güncellenir.
- [ ] Bulunan işletmeler kendiliğinden analiz edilir ve Leadler → Fırsatlar'a düşer.
- [ ] İşler kutusundaki "Bu ay X / Y çağrı" ile Google Cloud Console'daki kullanım uyumludur.
- [ ] Duraklat → tarama sıradaki bölgeden sonra durur; Sürdür → kaldığı yerden devam eder.
- [ ] Sekme kapatılıp açılınca tarama kaldığı yerden sürer.
- [ ] Aylık sınır küçük bir değere çekilince plan "Aylık sınır doldu" olur; sınır artırılınca kendiliğinden sürer.
- [ ] İki cihaz aynı anda açıkken aynı bölge iki kez taranmaz.

## ADR 0015 — uygun işletme bulma (2026-10-08)
Otomatik: `chain_and_performance.test.sql` (15), `report-math.test.ts` (segmentRate/bestSegment/mergeSegments),
`discover-markets.test.ts` (canonicalCategory). Yerelde tarayıcıda geçici kayıtlarla doğrulandı: zincir gizleme/gösterme ve
rozet, yorum süzgeci + sıralama (veritabanı sorgusuyla aynı sıra ve 23 kayıt), Raporlar → "Sektör ve şehir".

Bulutta elle:
- [ ] `db push` sonrası Leadler → Fırsatlar: "N zincir/şube gizlendi" satırı çıkıyorsa tıklayınca şubeler "Zincir · N şube" rozetiyle gelir.
- [ ] Zincir sayılan bir işletme gerçekten zincir mi? Yanlış pozitif görürsen ADR 0015'teki kuralı daralt.
- [ ] Filtrele → "Min. yorum" ve "Yorum sayısına göre" sıralama Google'daki yorum sayısıyla uyuşuyor.
- [ ] İlk ~60 mesaj gönderildikten sonra Raporlar → "Sektör ve şehir": sektör başına 20+ yazı olunca "en iyi sonuç" satırı çıkıyor.

## ADR 0016 — temas kaydı ve ilerleme takibi (2026-10-08)
Otomatik: `contact_attempts.test.sql` (36), `contact-outcome.test.ts` (her adım geçerli geçiş), `progress-timeline.test.ts`,
`contact-filters.test.ts`, `contact-attempts.test.ts`. Yerelde tarayıcıda gerçek RPC'lerle doğrulandı: menüden Instagram →
"Ne oldu?" kutusu → Yazdım → aşama NEW → CONTACTED (3 adım), takip +3 gün, İlerleme sekmesi, Takip görünümü, tüm süzgeçler
(veritabanı sorgusuyla aynı sayılar), Raporlar → İletişim → "Elle yapılan temaslar".

Bulutta elle:
- [ ] `db push` sonrası bir işletmede İletişime geç → bir adres seç: bağlantı açılır VE köşede "Ne oldu?" kutusu çıkar.
- [ ] "Yazdım" → İlerleme sekmesinde 3 aşama adımı ve temas kaydı görünür; Leadler'de aşama "İletişime Geçildi".
- [ ] "Sonra" + tarih → Takip sekmesinde o gün görünür.
- [ ] "İlgilenmedi" → Kapanan aşamasına geçer; Fırsatlar listesinden çıkar.
- [ ] Kutuyu kapatınca temas "Denendi" olarak kalır (İlerleme sekmesinde).
- [ ] İki ekip üyesi: biri yazınca diğerinin listesinde "Son temas" ve "Yazan" süzgeci güncellenir.

## MVP tamamlama — günlük kullanım eksikleri (2026-10-08/09)
Otomatik: pgTAP `update_business_details` (24), `bulk_actions` (18), `handoff_actions` (17), `remove_member` (11),
`rename_workspace` (8), `campaign_edit_delete` (13); birim `edit-patch.test.ts` (16), `contact-attempts.test.ts`.
Yerelde tarayıcıda gerçek RPC'lerle doğrulandı: lead düzenleme (hata mesajları + kayıt + site değişince yeniden analiz),
toplu atama (3 işletme, 3 aktivite kaydı), devir kartı devralma, ekipten üye çıkarma (atamalar temizlendi), çalışma alanı adı,
kampanya düzenleme ve silme (silince listeye döner), Dashboard "Bugünün işleri" ve "Benim işlerim".

Bulutta elle:
- [ ] Lead detay → kalem simgesi → telefon/site değiştir: eski telefon kanalı kalkar, site değişince analiz yeniden çalışır.
- [ ] Leadler → birkaç satır seç → Ata / Ele: sonuç mesajı "N işletme atandı"; başka sayfaya geçince seçim temizlenir.
- [ ] Devir kartı: konuşmadan oluştur → lead detayında Devral → zil sayacından düşer → Kapat.
- [ ] Ekip: üye çıkar → onun işletmeleri "Atanmamış" olur; bekleyen daveti "Yeniden gönder" → yeni kod gösterilir.
- [ ] Ayarlar → Genel: şifre değiştir (12+ karakter); yönetici çalışma alanı adını değiştirir, üye göremez.
- [ ] Kampanya: düzenle / sil; mesaj gönderilmiş kampanyada "silmek yerine Tamamlandı yapın" uyarısı.
