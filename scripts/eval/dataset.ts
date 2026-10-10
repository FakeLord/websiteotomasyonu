/**
 * Değerlendirme veri seti (PHASE-16, BACKLOG #30): ilk mesaj taslağı için 30 Türkçe + 30 İngilizce işletme ve
 * cevap sınıflandırma için 30 Türkçe + 30 İngilizce müşteri cevabı. Veriler uydurmadır; gerçek kişi/işletme değildir.
 * Elle çalıştırılır: pnpm exec tsx scripts/eval/run.ts
 */
import type { EvalLanguage } from "../../packages/core/src/index.ts";

export interface DraftCase {
  id: string;
  language: EvalLanguage;
  businessName: string;
  category: string;
  district: string | null;
  city: string;
  rating: number | null;
  reviewCount: number | null;
  websiteIssues: string[];
}

export interface ReplyCase {
  id: string;
  language: EvalLanguage;
  message: string;
  intent: string;
  stop: boolean;
}

// Site analizinin gerçekte ürettiği sorun metinleriyle aynı biçim (Türkçe, ekip için).
const NO_SITE = ["Web sitesi yok"];
const BROKEN = ["Site açılmıyor"];
const OLD = ["Site HTTPS kullanmıyor", "Mobilde düzgün görünmüyor"];
const SLOW = ["Sayfa çok yavaş yükleniyor", "Online randevu veya iletişim formu yok"];
const WEAK = ["Mobilde düzgün görünmüyor", "Online randevu veya iletişim formu yok", "Site HTTPS kullanmıyor"];

type DraftRow = [name: string, category: string, district: string | null, city: string, rating: number | null, reviews: number | null, issues: string[]];

const TR_ROWS: DraftRow[] = [
  ["Gülşen Diş Kliniği", "Diş Kliniği", "Çankaya", "Ankara", 4.7, 212, NO_SITE],
  ["Mavi Deniz Restoran", "Restoran", "Beşiktaş", "İstanbul", 4.3, 540, OLD],
  ["Yıldız Güzellik Merkezi", "Güzellik Merkezi", "Konak", "İzmir", 4.8, 98, WEAK],
  ["Pati Veteriner Kliniği", "Veteriner", "Nilüfer", "Bursa", 4.6, 77, NO_SITE],
  ["Akın Oto Servis", "Oto Servis", "Seyhan", "Adana", 4.1, 133, BROKEN],
  ["Elit Kuaför", "Kuaför", "Kadıköy", "İstanbul", 4.5, 305, SLOW],
  ["Sağlık Fizyoterapi", "Fizyoterapi", "Muratpaşa", "Antalya", 4.9, 64, NO_SITE],
  ["Güneş Pilates Stüdyosu", "Pilates Stüdyosu", "Karşıyaka", "İzmir", 4.7, 41, WEAK],
  ["Demir Hukuk Bürosu", "Hukuk Bürosu", "Kızılay", "Ankara", 4.4, 29, OLD],
  ["Çınar Emlak", "Emlak Ofisi", "Şişli", "İstanbul", 4.2, 88, SLOW],
  ["Lale Düğün Fotoğrafçılık", "Fotoğrafçı", "Osmangazi", "Bursa", 4.9, 156, NO_SITE],
  ["Bilge Kurs Merkezi", "Kurs Merkezi", "Selçuklu", "Konya", 4.3, 52, WEAK],
  ["Nur Diş Polikliniği", "Diş Kliniği", "Bornova", "İzmir", 4.6, 190, OLD],
  ["Ege Spor Salonu", "Spor Salonu", "Alsancak", "İzmir", 4.0, 120, BROKEN],
  ["Anadolu Lokantası", "Restoran", "Meram", "Konya", 4.5, 410, NO_SITE],
  ["Zeynep Psikolog", "Psikolog", "Moda", "İstanbul", 4.9, 35, NO_SITE],
  ["Hızır Lastik ve Oto", "Oto Servis", "Yenimahalle", "Ankara", 4.2, 71, SLOW],
  ["Papatya Anaokulu", "Anaokulu", "Mersin Merkez", "Mersin", 4.4, 58, WEAK],
  ["Kozmik Tasarım Atölyesi", "Mobilya Atölyesi", "Nilüfer", "Bursa", 4.6, 25, NO_SITE],
  ["Derya Eczanesi", "Eczane", "Atakum", "Samsun", 4.3, 47, OLD],
  ["Kardelen Butik Otel", "Otel", "Ürgüp", "Nevşehir", 4.7, 322, SLOW],
  ["Sinan Elektrik", "Elektrikçi", "Pendik", "İstanbul", 4.1, 18, NO_SITE],
  ["Bahar Yoga Evi", "Yoga Stüdyosu", "Çankaya", "Ankara", 4.8, 44, WEAK],
  ["Özkan Mimarlık", "Mimarlık Ofisi", "Beylikdüzü", "İstanbul", 4.5, 22, OLD],
  ["Tatlı Köşe Pastanesi", "Pastane", "Tepebaşı", "Eskişehir", 4.6, 267, NO_SITE],
  ["Mert Danışmanlık", "Muhasebe Ofisi", "Merkez", "Denizli", 4.2, 16, BROKEN],
  ["Sahil Dalış Merkezi", "Dalış Okulu", "Bodrum", "Muğla", 4.8, 134, WEAK],
  ["Cemre Gelinlik", "Gelinlik Mağazası", "Nişantaşı", "İstanbul", 4.4, 83, OLD],
  ["Ata Sürücü Kursu", "Sürücü Kursu", "Keçiören", "Ankara", 4.0, 61, SLOW],
  ["Berrak Optik", "Optik", "Cumhuriyet", "Kayseri", 4.5, 39, NO_SITE],
];

const EN_ROWS: DraftRow[] = [
  ["Maple Street Dental", "Dental Clinic", "Downtown", "Austin", 4.8, 241, NO_SITE],
  ["Brick Oven Pizzeria", "Restaurant", "Soho", "New York", 4.4, 612, OLD],
  ["Glow Beauty Studio", "Beauty Salon", "Camden", "London", 4.7, 109, WEAK],
  ["Happy Paws Veterinary", "Veterinarian", "Mission District", "San Francisco", 4.9, 87, NO_SITE],
  ["Redline Auto Repair", "Auto Repair", "Eastside", "Denver", 4.2, 156, BROKEN],
  ["The Gentleman's Barber", "Barber Shop", "Shoreditch", "London", 4.6, 330, SLOW],
  ["Harbor Physio", "Physiotherapy", "Harbourfront", "Toronto", 4.8, 72, NO_SITE],
  ["Core Pilates Studio", "Pilates Studio", "Surry Hills", "Sydney", 4.7, 48, WEAK],
  ["Whitmore Law Office", "Law Firm", "Midtown", "Atlanta", 4.5, 31, OLD],
  ["Cedar Realty Group", "Real Estate Agency", "Westside", "Portland", 4.3, 94, SLOW],
  ["Lantern Wedding Photography", "Photographer", "Old Town", "Edinburgh", 4.9, 140, NO_SITE],
  ["Bright Minds Tutoring", "Tutoring Center", "Northgate", "Seattle", 4.4, 56, WEAK],
  ["Summit Family Dentistry", "Dental Clinic", "Uptown", "Dallas", 4.6, 203, OLD],
  ["Ironworks Gym", "Gym", "South End", "Boston", 4.1, 118, BROKEN],
  ["Olive & Thyme Bistro", "Restaurant", "Gastown", "Vancouver", 4.5, 389, NO_SITE],
  ["Dr. Emma Clarke Counselling", "Psychologist", "Clifton", "Bristol", 4.9, 33, NO_SITE],
  ["Northside Tyres", "Auto Repair", "Northside", "Manchester", 4.2, 67, SLOW],
  ["Little Acorns Nursery", "Nursery School", "Riverside", "Leeds", 4.4, 59, WEAK],
  ["Oakwood Furniture Workshop", "Furniture Maker", "Brooklyn", "New York", 4.7, 26, NO_SITE],
  ["Greenleaf Pharmacy", "Pharmacy", "Lakeview", "Chicago", 4.3, 41, OLD],
  ["Seaview Boutique Hotel", "Hotel", "Waterfront", "Melbourne", 4.6, 298, SLOW],
  ["Spark Electric Services", "Electrician", "Westend", "Calgary", 4.1, 19, NO_SITE],
  ["Lotus Yoga House", "Yoga Studio", "Fitzroy", "Melbourne", 4.8, 52, WEAK],
  ["Kerr & Associates Architects", "Architecture Firm", "Gallowgate", "Glasgow", 4.5, 24, OLD],
  ["Sweet Crumb Bakery", "Bakery", "Capitol Hill", "Seattle", 4.7, 274, NO_SITE],
  ["Hartley Accounting", "Accounting Firm", "Oxford Road", "Reading", 4.2, 15, BROKEN],
  ["Blue Reef Dive Centre", "Dive Shop", "Cairns Central", "Cairns", 4.8, 126, WEAK],
  ["Ivory Bridal Boutique", "Bridal Shop", "Beacon Hill", "Boston", 4.4, 79, OLD],
  ["Roadwise Driving School", "Driving School", "Eastgate", "Birmingham", 4.0, 63, SLOW],
  ["ClearView Optometry", "Optometrist", "Main Street", "Ottawa", 4.5, 38, NO_SITE],
];

const toCases = (rows: DraftRow[], language: EvalLanguage): DraftCase[] =>
  rows.map(([businessName, category, district, city, rating, reviewCount, websiteIssues], index) => ({
    id: `draft-${language}-${String(index + 1).padStart(2, "0")}`,
    language,
    businessName,
    category,
    district,
    city,
    rating,
    reviewCount,
    websiteIssues,
  }));

export const DRAFT_CASES: DraftCase[] = [...toCases(TR_ROWS, "tr"), ...toCases(EN_ROWS, "en")];

type ReplyRow = [intent: string, message: string];

const TR_REPLIES: ReplyRow[] = [
  ["INTERESTED", "Merhaba, teklifiniz ilgimi çekti. Bu hafta kısa bir görüşme yapabilir miyiz?"],
  ["INTERESTED", "Güzel bir fikir, örnek tasarımı görmek isteriz. Ne zaman gönderebilirsiniz?"],
  ["INTERESTED", "Sitemiz gerçekten eski, yenilemeyi düşünüyorduk. Detayları paylaşır mısınız?"],
  ["INTERESTED", "Teşekkürler, evet ilgileniyoruz. Perşembe öğleden sonra uygun muyuz?"],
  ["INTERESTED", "Ücretsiz örnek tasarım derken nasıl bir şey kastediyorsunuz? Denemek isteriz."],
  ["INTERESTED", "Mesajınızı ortağıma ilettim, o da bakmak istiyor. Bizi arayabilir misiniz?"],
  ["NOT_INTERESTED", "Teşekkürler ama şu an böyle bir ihtiyacımız yok."],
  ["NOT_INTERESTED", "İlgilenmiyoruz, kolay gelsin."],
  ["NOT_INTERESTED", "Bu dönem bütçemiz yok, şimdilik hayır."],
  ["NOT_INTERESTED", "Sitemizden memnunuz, değişiklik düşünmüyoruz."],
  ["NOT_INTERESTED", "Hayır, teşekkürler."],
  ["QUESTION", "Bu hizmetin kapsamı tam olarak nedir? Bakım ve barındırma da dahil mi?"],
  ["QUESTION", "Siz hangi şirketsiniz, daha önce hangi işletmelerle çalıştınız?"],
  ["QUESTION", "Örnek tasarım için bizden ne bilgi istiyorsunuz?"],
  ["QUESTION", "Mobil uygulama da yapıyor musunuz? Rezervasyon sistemi entegre edilebilir mi?"],
  ["QUESTION", "Süreç kaç hafta sürüyor?"],
  ["STOP_CONTACT", "Lütfen bana bir daha yazmayın."],
  ["STOP_CONTACT", "Bu tür mesajlar istemiyorum, listenizden çıkarın."],
  ["STOP_CONTACT", "Rahatsız etmeyin, tekrar yazarsanız şikayet edeceğim."],
  ["STOP_CONTACT", "Çıkmak istiyorum."],
  ["STOP_CONTACT", "Numaramı ve adresimi kayıtlarınızdan silin, bir daha iletişime geçmeyin."],
  ["AUTO_REPLY", "Şu an ofis dışındayım, 15 Ekim'de döneceğim. Acil durumlar için lütfen asistanımla iletişime geçin."],
  ["AUTO_REPLY", "Mesajınız alınmıştır. En kısa sürede dönüş yapılacaktır. Bu otomatik bir yanıttır."],
  ["AUTO_REPLY", "Yıllık izindeyiz. Dönüşümüzde mesajınıza cevap vereceğiz."],
  ["WRONG_CONTACT", "Bu adres artık bize ait değil, kliniği devrettik. Yeni sahiple görüşmeniz gerekir."],
  ["WRONG_CONTACT", "Yanlış kişiye yazdınız, ben bu işletmede çalışmıyorum."],
  ["ALREADY_HAS_PROVIDER", "Sitemizi zaten bir ajans yapıyor, onlarla devam ediyoruz."],
  ["ALREADY_HAS_PROVIDER", "Bir yazılım firmamızla yıllık sözleşmemiz var, teşekkürler."],
  ["ALREADY_HAS_PROVIDER", "Web işlerimizi kardeşim yürütüyor, ihtiyacımız yok."],
  ["UNCLEAR", "Hmm, bakarız."],
];

const EN_REPLIES: ReplyRow[] = [
  ["INTERESTED", "Hi, this sounds interesting. Could we set up a quick call this week?"],
  ["INTERESTED", "We'd love to see the sample design. When can you send it over?"],
  ["INTERESTED", "Our website is really outdated, so the timing is perfect. Can you share more details?"],
  ["INTERESTED", "Thanks for reaching out. Yes, we're interested. Does Thursday afternoon work?"],
  ["INTERESTED", "A free mockup? Sure, let's give it a try."],
  ["INTERESTED", "I've forwarded your email to my partner and she'd like to talk. Please give us a call."],
  ["NOT_INTERESTED", "Thanks, but we're not interested at the moment."],
  ["NOT_INTERESTED", "No thank you."],
  ["NOT_INTERESTED", "We don't have the budget for this right now, sorry."],
  ["NOT_INTERESTED", "We're happy with our current site and not planning any changes."],
  ["NOT_INTERESTED", "Not for us, but good luck."],
  ["QUESTION", "What exactly does your service include? Is hosting and maintenance part of it?"],
  ["QUESTION", "Who are you and which businesses have you worked with before?"],
  ["QUESTION", "What information do you need from us for the sample design?"],
  ["QUESTION", "Do you also build mobile apps? Can a booking system be integrated?"],
  ["QUESTION", "How many weeks does a project usually take?"],
  ["STOP_CONTACT", "Please do not contact me again."],
  ["STOP_CONTACT", "I don't want these emails. Remove me from your list."],
  ["STOP_CONTACT", "Stop emailing us or I will report this as spam."],
  ["STOP_CONTACT", "Unsubscribe."],
  ["STOP_CONTACT", "Delete my details from your records and do not reach out to us again."],
  ["AUTO_REPLY", "I am currently out of the office until October 15th. For urgent matters please contact my assistant."],
  ["AUTO_REPLY", "Thank you for your message. We have received it and will respond shortly. This is an automated reply."],
  ["AUTO_REPLY", "We're closed for the holidays and will reply when we return."],
  ["WRONG_CONTACT", "This address no longer belongs to us, the practice was sold. You'd need to contact the new owner."],
  ["WRONG_CONTACT", "You've got the wrong person, I don't work at this company."],
  ["ALREADY_HAS_PROVIDER", "We already have an agency that manages our website, thanks."],
  ["ALREADY_HAS_PROVIDER", "We have a yearly contract with a web company, so we're all set."],
  ["ALREADY_HAS_PROVIDER", "My nephew takes care of our website, we don't need anyone else."],
  ["UNCLEAR", "Hmm, maybe. We'll see."],
];

const toReplies = (rows: ReplyRow[], language: EvalLanguage): ReplyCase[] =>
  rows.map(([intent, message], index) => ({
    id: `reply-${language}-${String(index + 1).padStart(2, "0")}`,
    language,
    message,
    intent,
    stop: intent === "STOP_CONTACT",
  }));

export const REPLY_CASES: ReplyCase[] = [...toReplies(TR_REPLIES, "tr"), ...toReplies(EN_REPLIES, "en")];

/** Taslak değerlendirmesinde kullanılan sabit şirket tanıtımı ve paket (Bilgi Bankası'nın yerine). */
export const EVAL_COMPANY_FACTS =
  "Şirket: Biz bir yazılım şirketiyiz. İşletmeler için premium, canlı hissiyatlı, yeni nesil web siteleri, mobil uygulamalar ve iş süreçlerini kolaylaştıran otomasyonlar geliştiriyoruz. Teklifimiz: 15 dakikalık kısa bir görüşme ve işletmenin sitesi için ücretsiz bir örnek tasarım.";

export const EVAL_PACKAGES = [
  {
    id: "pkg-1",
    name: "Website Yenileme",
    summary: "Mobil uyumlu, hızlı yüklenen kurumsal site",
    priceMin: 15000,
    priceMax: 25000,
    deliveryDaysMin: 10,
    deliveryDaysMax: 20,
  },
];

export const EVAL_SALES_RULES = "Fiyat, indirim veya teslim süresi verme; ekip arkadaşım netleştirir.";
