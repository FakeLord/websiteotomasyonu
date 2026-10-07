# PHASE 17 (G5) — Ülke bazlı uyum ve gönderim güvenliği

**Dal:** `feature/p17-compliance` · **Zorluk:** Yüksek · **Bağımlılık:** G2, G4
**Referans:** `docs/SPEC.md` → I.5, P.4, D1, D21 · BACKLOG #8

## Amaç
Hangi ülkeye, hangi kanaldan, hangi saatte, hangi alt bilgiyle yazılabileceği veritabanında zorlanır; "yazmayın" diyen
veya silinen kişiyle bir daha iletişim kurulmaz.

## Kapsam
- **`country_rules`** (`packages/core/compliance/`, saf + testli; workspace ayarıyla sıkılaştırılabilir, gevşetilemez):
  soğuk e-posta durumu `ALLOWED` / `OPT_OUT` / `OPT_IN_REQUIRED`; zorunlu alt bilgi (gönderen kimliği, posta adresi,
  yerel dilde listeden çıkma satırı); yerel gönderim saatleri ve hafta sonu; ülke başına günlük limit.
  İlk kural seti: US, GB, CA, AU, TR. **Kural tanımlı olmayan ülke = en sıkı** (e-posta kapalı, yalnızca asistanlı kanal).
- **`outreach_guard`:** yeni sebepler `COUNTRY_RULE`, `LOCAL_SEND_WINDOW`, `SUPPRESSED`; alt bilgi eksikse gönderim reddi.
- **Listeden çıkma:** e-postalarda `List-Unsubscribe` + imzalı, tek kullanımlık bağlantı → `unsubscribe` Edge Function → DNC + log.
- **Kalıcı silme:** `erase_business(id, reason)` (yalnızca ADMIN, sebep zorunlu) kişisel veriyi siler; activity log'da yalnızca
  kimliksiz kayıt kalır. **Bastırma listesi** (`suppressions`: e-posta, alan adı, telefon özetleri) silinen kişinin yeniden
  içe aktarılıp aranmasını engeller.

## Veritabanı
- `suppressions` (workspace, tür, özet, sebep, tarih) — RLS + pgTAP izolasyon; yazma yalnızca RPC ile.
- `import_business` ve `outreach_guard` bastırma listesini denetler.

## Testler
- Birim: ülke kuralı çözümü (bilinmeyen ülke, workspace sıkılaştırması), alt bilgi üretimi (dil), imzalı belirteç.
- pgTAP: `OPT_IN_REQUIRED` ülkede e-posta reddi; yerel saat dışı red; silinen işletme yeniden içe aktarılınca DNC;
  MEMBER silemez; izolasyon.

## Acceptance criteria
- [ ] İzin şartı olan ülkedeki lead'e e-posta gönderilemez; sebep arayüzde açıkça görünür.
- [ ] Her giden e-posta ülkesinin zorunlu alt bilgisini ve çalışan bir listeden çıkma bağlantısını taşır.
- [ ] Silinen işletmenin kişisel verisi tablolarda kalmaz; aynı e-posta/alan adı yeniden içe aktarılınca bastırılır.

## VERIFY_CURRENT_DOCS
- Ülke başına resmi kaynaklar: ABD CAN-SPAM, İngiltere PECR/ICO, Kanada CASL, Avustralya Spam Act, Türkiye İYS/6563;
  Gmail/Yahoo toplu gönderici kuralları (`List-Unsubscribe`). Bulgular `docs/adr/0015-compliance.md`.
  D1 gereği hukuk danışmanı yoktur; ADR her kuralın kaynağını ve kalan riski yazar.
