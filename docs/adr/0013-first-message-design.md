# ADR 0013 — İlk mesaj tasarımı: şirket kimliği, dil ve çeviri

Durum: kabul edildi (2026-10-09). Kapsam: G4'ün ilk dilimi (çok dilli tam destek G4'te sürer).

## Karar
- **Şirket kimliği tek kaynaktan gelir.** Taslak komutu, şirketin kim olduğunu ve teklifini yalnızca Bilgi Bankası'ndaki aktif
  `COMPANY` kayıtlarından alır. Kayıt yoksa AI hiç çağrılmaz, ekibe açık hata gösterilir (model hizmet uydurmasın).
  Komutta hiçbir hizmet adı (ör. "sosyal medya") gömülü değildir.
- **Teklif işletmeye özeldir.** Komut, teklifi işletmenin sektörüne, sitesinin durumuna ve Google puanına bağlamasını ister;
  aynı kalıp cümle yasaktır. Teklifin içeriği (kısa görüşme + ücretsiz örnek tasarım) `COMPANY` kaydında yazılıdır, kodda değil.
- **Diller: yalnızca Türkçe ve İngilizce.** Varsayılan dil **yoktur**; ekip her taslakta (ve kampanyada) dili seçer, seçmeden
  "Taslak Oluştur" kapalıdır. Almanca kapsam dışıdır.
- **Türkçe çeviri.** İngilizce taslakta model `translation_tr` (ve e-postada `subject_tr`) alanını da döner; arayüz bunu salt okunur
  gösterir, kaydetmez ve göndermez. Türkçe taslakta çeviri istenmez. Çeviri yoksa taslak reddedilir (`INVALID_SHAPE`).
- **Guardrail'lar çok dilli.** Para (₺ TL $ € £ USD EUR GBP…), teslim süresi (gün/hafta/days/weeks) ve yasak kelimeler (TR + EN)
  kontrol edilir; hem gönderilecek metin hem Türkçe çeviri aynı kurallardan geçer. Selamlama/kapanış/"Team" gibi İngilizce
  kelimeler ve Şirket kaydının başlığı (şirket adı) müşteri referansı sayılmaz.
- **Model imzası atılır.** Kapanış satırından sonraki model imzası (`stripSignOff`) silinir.
- Prompt sürümü 2'dir (önbellekteki eski taslaklar kullanılmaz).

## Sınırlar / sonraki adımlar
- Çeviri kaydedilmez; Konuşmalar ekranında kalıcı çeviri G4'ün sonraki diliminde.
- Takip (`followup_draft`) ve cevap (`draft_reply`) komutları hâlâ Türkçe yazar; aynı dil/çeviri şeması G4'te taşınır.
- "Büyük harfli iki kelime = marka" sezgisi İngilizcede yanlış alarm verebilir; G4'te dile duyarlı kontrole geçilecek.
- Gerçek NVIDIA denemesi: `SMOKE_LANGUAGE=en|tr pnpm exec tsx scripts/smoke/nvidia.ts` (elle, anahtarla).
