# ADR 0019 — Ülke bazlı e-posta uyumu, gönderen kimliği, bastırma listesi ve kalıcı silme (G5)

**Durum:** Kabul · 2026-10-10 (kullanıcı onayı: "MVP'yi bitirene kadar yap")
**İlgili:** D1 (hukuk danışmanı yok), D21, ADR 0017 (yurtdışı e-posta kilidi), `docs/phases/PHASE-17.md`

> Bu belge hukuki tavsiye değildir. Kurallar resmi/ikincil kaynaklardan derlenmiş **muhafazakâr varsayılanlardır**; yürürlükteki
> metinler değişebilir ve bazı ayrıntılar birincil kaynaktan doğrulanamamıştır (aşağıda işaretli).

## Karar
- **`country_email_rules`** (DB tablosu, istemci yalnızca okur): ülke başına politika.
  - `OPT_OUT`: önceden onay şartı yok; kimlik + (gerekirse) posta adresi + çıkma yolu zorunlu. → **TR, US, GB**
  - `PUBLISHED_ONLY`: yalnızca alıcının kendi yayımladığı adres (`contact_channels.found_via` WEBSITE/JSON_LD). → **CA, AU**
  - Tabloda olmayan ülke **e-postada reddedilir** (`COUNTRY_RULE`, D21: bilinmeyen = en sıkı).
- **`outreach_guard`** yeni sebepler: `COUNTRY_RULE`, `MISSING_SENDER_PROFILE` (posta adresi zorunlu ülkelerde gönderen profili
  boş), `SUPPRESSED` (bastırma listesi, her kanal). Yalnızca e-posta kanalı ülke kuralına tabidir.
- **Gönderen kimliği:** `workspace_settings.sender_profile` (`legalName`, `postalAddress`); her giden e-postanın sonuna
  `appendComplianceFooter` ile kimlik, adres, (ABD'de) ticari ileti ibaresi ve yanıtla çıkma satırı eklenir (TR/EN).
- **Çıkma:** alıcı e-postayı yanıtlayarak çıkar; gelen kutusu `hasStopKeyword` ("unsubscribe", "çıkmak istiyorum" …) ile DNC yapar.
- **Bastırma listesi (`suppressions`):** e-posta, e-posta alan adı (kişisel posta sağlayıcıları hariç), site alan adı (sosyal
  ağ/site oluşturucular hariç), telefon — yalnızca SHA-256 özeti. Yeni eklenen iletişim kanalı listedeyse işletme otomatik DNC olur.
- **`erase_business(id, reason)`:** yalnızca ADMIN, sebep zorunlu; çocuk kayıtlar FK cascade ile silinir, özetler bastırma
  listesine yazılır, log'a ad yazılmaz.

## Kaynaklar ve kalan belirsizlikler
| Ülke | Kaynak | Not |
| --- | --- | --- |
| US | [FTC CAN-SPAM rehberi](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) | B2B muaf değil; posta adresi + çıkma yolu; 10 iş günü; ihlal başına yüksek ceza |
| GB | [ICO PECR e-posta](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/) | Tüzel kişiliğe onay gerekmez; **şahıs işletmesi/ortaklıkta gerekir — sistem ayırt edemez**; ICO rehberi gözden geçiriliyor |
| CA | [CRTC SSS](https://crtc.gc.ca/eng/com500/faq500.htm), [Torys](https://www.torys.com/insights/publications/2020/06/fca-confirms-casl-is-constitutional-but-limits-business-communications-exemption) | Yayımlanmış adres + istenmeyen ileti notu yok + role ilgili; ispat yükü gönderende; "10 iş günü" ayrıntısı bu oturumda doğrulanamadı |
| AU | [ACMA](https://www.acma.gov.au/avoid-sending-spam) (sayfa alınamadı), ikincil kaynaklar | Yayımlanmış + role ilgili; 5 iş günü; ceza rakamı doğrulanmadı |
| TR | 6563 sayılı Kanun ve ilgili yönetmelik (ikincil kaynaklar) | Tacir/esnaf alıcıya onay gerekmez, **ret hakkı kullanıldıysa gönderilemez; İYS kaydı ve ret sorgusu gönderenindir — otomatik değil** |

## Bilinen sınırlar (riskler)
- Alıcı tüzel mi şahıs mı (GB, TR esnaf) ayırt edilemez; risk kullanıcıdadır. Hukuk danışmanı yoktur (D1).
- Rolle ilgi (CA/AU) elle değerlendirilir; sistem yalnızca adresin site kaynaklı olduğunu denetler.
- **Listeden çıkma bağlantısı / `List-Unsubscribe`**: ADR 0023 ile eklendi (2026-10-11); bulutta denenmedi. Günlük 30 e-posta hacminde Gmail/Yahoo toplu gönderici kuralları (≥5.000/gün) kapsamında değildir.
- Çıkma isteğinin yanıtla gelmesi gelen kutusunun çalışmasına bağlıdır (uygulama açıkken). 10/5 iş günü süresi bu yüzden uygulama
  sürekli açık değilse aşılabilir.
- `activity_logs` yalnızca-ekle olduğundan (kural 4) silme öncesi yazılmış kayıtların özetlerinde işletme adı kalabilir.
- Yurtdışı e-posta ayarı (ADR 0017) kilit olarak kalır; bu kurallar onun üstüne ek denetimdir.
