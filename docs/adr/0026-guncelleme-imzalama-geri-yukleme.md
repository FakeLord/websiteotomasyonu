# ADR 0026 — Otomatik güncelleme, kod imzalama ve yedekten geri yükleme provası

**Durum:** Kabul · 2026-10-11 (kullanıcı kararı: .exe kurulum sihirbazı ile dağıtım, uygulama kurulduğu bilgisayarda yerel kullanılacak). Bölüm 1 uygulandı (yerelde doğrulandı); Bölüm 2 kapsam dışı; Bölüm 3 uygulandı (bulutta denenmedi); Windows kod imzalama (3.4) bilerek ertelendi
**İlgili:** `docs/phases/PHASE-22.md` (G10), BACKLOG #26 ve #27, ADR 0009 (web kipi), ADR 0011 (yedek)

## Mevcut durum (kodda doğrulandı)
| Konu | Durum |
| --- | --- |
| Gerçek kullanım | `baslat.cmd` ile **web kipi** (yerel Node sunucusu + tarayıcı). Güncelleme = kodu çek + yeniden derle |
| Masaüstü (Tauri) kurulumu | Kod var (`release.yml`, NSIS), ama `tauri-plugin-updater` ve imzalama anahtarı **yok**; `bundle.createUpdaterArtifacts` kapalı |
| Yedek | `backup.yml`: haftalık `pg_dump` (public + auth), AES-256, 30 gün saklanan Actions çıktısı; açılabildiği otomatik doğrulanıyor |
| Geri yükleme | **Betik ve prova yok.** Yedek hiç geri yüklenmedi |
| Yedekte olmayanlar | **Storage dosyaları** (müşteri faturaları, `customer-files` kovası), Vault sırları (bilerek), Edge Function'lar, ayarlar |

## Ayrım: üç ayrı iş
1. **Otomatik güncelleme:** kullanıcıya yeni sürümü ulaştırmak.
2. **Kod imzalama:** Windows'un "Bilinmeyen yayımcı" (SmartScreen) uyarısını azaltmak. **Yalnızca .exe kurulumu varsa anlamlıdır;**
   web kipinde imzalanacak bir dosya yoktur.
3. **Yedekten geri yükleme provası:** felaket durumunda verinin gerçekten geri gelebildiğini kanıtlamak.

## Güncel bilgiler (2026-10-11 araştırması, ikincil kaynaklara dayanır; uygulamadan önce resmi belgeyle doğrulanır)
- **Tauri updater imzası ücretsizdir** ve işletim sistemi sertifikasından ayrıdır: `tauri signer generate` ile anahtar çifti;
  genel anahtar `tauri.conf.json`'a, özel anahtar `TAURI_SIGNING_PRIVATE_KEY` olarak GitHub sırrına girer. Özel anahtar
  kaybedilirse kurulu uygulamalara bir daha güncelleme gönderilemez.
- Güncelleme adresi GitHub Releases'taki `latest.json` olabilir; `tauri-action` bunu üretip yükler.
- **Windows kod imzalama ücretlidir.** Microsoft'un düşük maliyetli "Azure Artifact Signing" hizmeti genel (SmartScreen
  güvenilir) imza için yalnızca ABD, Kanada, AB, Birleşik Krallık kuruluşlarına (ve ABD/Kanada bireylerine) açıktır;
  **Türkiye listede görünmüyor.** Alternatif: OV sertifika, yaklaşık 130–300 USD/yıl (+ donanım anahtarı/bulut HSM şartı,
  sertifika ömrü ~15 ay). EV'nin SmartScreen'de anında güven avantajı 2024'te kaldırıldı; itibar zamanla birikir.
  Şahıs olarak OV almak sertifika otoritesine göre zor olabilir; satın almadan otoriteye sorulmalı.
- İmzasız kurulum çalışır; Windows "Bilinmeyen yayımcı" uyarısı verir ("Yine de çalıştır"). Küçük ekip için kabul edilebilir.

## Karar önerisi
### Soru A — Dağıtım şekli ne olacak?
| Seçenek | Kim kullanır | Güncelleme | İmzalama |
| --- | --- | --- | --- |
| **A1 (önerilen): yalnızca web kipi** | Sen ve ekip, `baslat.cmd` ile | `baslat.cmd` kendisi güncelleme kontrol eder | Gerekmez (ücret yok) |
| A2: .exe kurulumu da olsun | Teknik olmayan kişiler | Tauri updater + `latest.json` | İsteğe bağlı OV sertifikası (ücretli) |

Önerim **A1** ile başlamak; kimseye .exe vermeyeceksen imzalama paranı boşa harcar.

## Program
### Bölüm 1 — Yedekten geri yükleme provası (her iki senaryoda gerekli, öncelik 1)
| # | Adım | Çıktı | Doğrulama |
| --- | --- | --- | --- |
| 1.1 | `scripts/ops/restore-backup.ps1`: `.gpg` çöz → boş Postgres'e `pg_restore` → tablo satır sayısı raporu | Betik | Yerel Docker'da üretilen sahte yedekle benim testim |
| 1.2 | Geri yükleme belgesi `docs/ops/geri-yukleme.md`: yeni Supabase projesi aç, migration'lar, yedeği içeri al, Edge Function deploy, anahtarları yeniden gir, `.env` adresini değiştir | Belge | Prova ile birlikte |
| 1.3 | **Storage yedeği:** `backup.yml`'e `customer-files` kovasının şifreli kopyası (service_role sırrı Actions'ta tutulur) | Haftalık dosya yedeği | Çıktı listesi |
| 1.4 | Prova: gerçek bir yedek, ücretsiz ikinci Supabase projesine veya yerel Docker'a geri yüklenir; satır sayıları ve bir müşteri kaydı kontrol edilir | `docs/qa` kaydı | Kullanıcı + ben |
| 1.5 | Saklama süresi: Actions çıktısı 30 gün; ayda bir yedek **bilgisayara/Drive'a** indirilir (belgeye yazılır) | Belge | — |

### Bölüm 2 — Web kipi güncelleme (A1)
| # | Adım | Çıktı | Doğrulama |
| --- | --- | --- | --- |
| 2.1 | Sürüm numarası tek kaynaktan gösterilir (Ayarlar'da "Sürüm"), `baslat.cmd` açılışta `git fetch` ile yeni sürüm var mı bakar | Bilgi satırı | Elle |
| 2.2 | Onayla güncelle: `git pull --ff-only` + bağımlılık + derleme; yerel değişiklik varsa dokunmaz ve söyler | `baslat.cmd guncelle` | Elle |
| 2.3 | Veritabanı migration'ları otomatik uygulanmaz (bulut); güncelleme sonrası "yeni migration var, `db push` çalıştırın" uyarısı | Uyarı | Elle |

### Bölüm 3 — Masaüstü güncelleme ve imzalama (yalnızca A2 seçilirse)
| # | Adım | Çıktı | Doğrulama |
| --- | --- | --- | --- |
| 3.1 | `tauri-plugin-updater` ekle, `tauri signer generate`, genel anahtar ve `createUpdaterArtifacts` | Yapılandırma | `cargo check`, derleme |
| 3.2 | `release.yml`: imza anahtarı sırları, `latest.json` yükleme | Yayın iş akışı | Etiketle deneme sürümü |
| 3.3 | Arayüzde "Güncelleme var" bildirimi ve onayla-kur | Arayüz | Eski sürümden yeni sürüme deneme |
| 3.4 | (İsteğe bağlı, ücretli) OV sertifika ile Windows imzalama | İmzalı kurulum | SmartScreen kontrolü |

## Kullanıcıdan gereken (Claude yapmaz)
- Bölüm 1.3: GitHub'a `SUPABASE_SERVICE_ROLE_KEY` sırrı (yalnızca Actions'ta; bana gönderme).
- Bölüm 1.4: Yedeği `BACKUP_PASSPHRASE` ile açmak (parola yalnızca sende) ve geri yükleme provasını yerel/yeni projede onaylamak.
- Bölüm 3: `TAURI_SIGNING_PRIVATE_KEY` oluşturup yedeklemek; sertifika satın alma kararı.

## Riskler
- Yedek parolasının kaybı = yedeğin açılamaması; parola yöneticisinde saklanmalı.
- Aynı Supabase projesine geri yükleme mevcut veriyi bozabilir; prova **yeni/boş** hedefe yapılır.
- Storage yedeği kişisel/finansal belgeler içerir; yalnızca şifreli çıktı olarak saklanır.
