# ADR 0015 — Uygun işletme bulma ihtimalini artırma

Durum: kabul edildi (2026-10-08, kullanıcı onayı). ADR 0014'ün (otomatik müşteri bulma) devamı.

## Bağlam
Fırsatlar listesi "satılabilir" işletmeyi (sitesi yok/açılmıyor/zayıf) bulur, ama "ulaşılabilir ve karar verici mi" sorusunu
yanıtlamaz. Yerel veride 293 fırsatın 232'si yazılabilir kanala sahipti. Ayrıca hangi sektörün ve şehrin cevap verdiğini
gösteren bir ölçüm yoktu; kategori seçimi tahmine dayanıyordu.

## Kararlar
1. **Yorum sayısı süzgeci ve sıralama (Leadler).** `minReviews` süzgeci ve "Yorum sayısına göre" sıralama. Çok yorumlu ama
   sitesi olmayan işletme çalışan ve müşterisi olan işletmedir. Sıralama sunucu tarafındadır (`order review_count`).
2. **Zincir/şube tespiti — `businesses.chain_size`.** Kural: AYNI ad + AYNI kategori + EN AZ ÜÇ FARKLI ilçe/şehir
   (ad en az 4 karakter). Yanlış pozitif gerçek bir lead'i sessizce saklayacağı için bilerek dar tutuldu; Fırsatlar zincirleri
   varsayılan olarak gizler, kaç tane gizlendiğini yazar ve tek tıkla gösterir. Satırda "Zincir · N şube" rozeti çıkar.
   Alan adı/telefon/e-posta/sosyal hesap paylaşan kayıtlar zaten içe aktarmada tek kayıtta birleştirilir
   (`find_duplicate_business`), bu yüzden bunlar ayrıca sinyal değildir. Değer tetikleyiciyle (SECURITY DEFINER) tutulur;
   istemci yazamaz (pgTAP kapsar).
3. **Sektör ve şehir raporu — `market_performance()`.** Sektöre ve şehre göre bulunan / fırsat / yazılan / cevap veren /
   müşteri. "Yazılan" = en az bir `SENT` giden mesajı olan işletme (taslak sayılmaz). Cevap oranı, bir segmentte 20'den az
   işletmeye yazıldıysa "az veri" diye işaretlenir ve "en iyi sonuç" seçimine girmez (3 yazıdan 2 cevap = %67 yanıltıcıdır).
4. **Kategori yazımı.** Elle aramada Türkiye dışında İngilizce terim ("Dentist"), Türkiye'de Türkçe etiket saklanır; şehir
   taraması da artık aynı kuralı izler. Raporda aynı sektörün yazımları `canonicalCategory` ile tek satırda toplanır.

## Bilinen sınırlar
- Zincir kuralı yalnızca birebir aynı adı yakalar ("Starbucks"); "Özel Dentpark Kadıköy" / "Özel Dentpark Şişli" gibi ada
  ilçe eklenmiş şubeler yakalanmaz. Bunu genişletmek yanlış pozitifleri artırır.
- Rapor "tüm zamanlar"dır, tarih aralığına bağlı değildir. Cevap oranı anlamlı olana kadar (segment başına 20+ yazı)
  sektör seçiminde karar verdirmemelidir.
- Bu ADR'deki değişiklikler cevap oranını ÖLÇER; hangi sektörün daha iyi olacağını önceden bilmez.
