import { describe, expect, it } from "vitest";
import { extractContacts } from "./extract-contacts";

function findAll(contacts: ReturnType<typeof extractContacts>, channel: string) {
  return contacts.filter((c) => c.channel === channel);
}

describe("extractContacts", () => {
  it("extracts a tel: link and flags TR mobile numbers as WhatsApp candidates", () => {
    const html = `<a href="tel:+905321234567">Bizi arayın</a>`;
    const contacts = extractContacts(html);
    expect(findAll(contacts, "PHONE")).toHaveLength(1);
    expect(findAll(contacts, "PHONE")[0]?.normalizedValue).toBe("+905321234567");
    const whatsapp = findAll(contacts, "WHATSAPP");
    expect(whatsapp).toHaveLength(1);
    expect(whatsapp[0]?.confidence).toBe(0.5);
  });

  it("does not flag a landline as a WhatsApp candidate", () => {
    const html = `<a href="tel:+902125550000">Ara</a>`;
    const contacts = extractContacts(html);
    expect(findAll(contacts, "PHONE")).toHaveLength(1);
    expect(findAll(contacts, "WHATSAPP")).toHaveLength(0);
  });

  it("extracts a mailto: link", () => {
    const html = `<a href="mailto:info@abcdis.com">Yaz</a>`;
    const contacts = extractContacts(html);
    expect(findAll(contacts, "EMAIL")[0]?.normalizedValue).toBe("info@abcdis.com");
  });

  it("extracts a wa.me link with 0.9 confidence", () => {
    const html = `<a href="https://wa.me/905321234567">WhatsApp</a>`;
    const contacts = extractContacts(html);
    const whatsapp = findAll(contacts, "WHATSAPP");
    expect(whatsapp).toHaveLength(1);
    expect(whatsapp[0]?.confidence).toBe(0.9);
  });

  it("extracts an api.whatsapp.com link with a phone query param", () => {
    const html = `<a href="https://api.whatsapp.com/send?phone=905321234567">WhatsApp</a>`;
    const contacts = extractContacts(html);
    expect(findAll(contacts, "WHATSAPP")).toHaveLength(1);
  });

  it("extracts Instagram/Facebook handles from header links", () => {
    const html = `
      <header>
        <a href="https://www.instagram.com/abc_dental/?hl=tr">IG</a>
        <a href="https://facebook.com/abcdental">FB</a>
      </header>`;
    const contacts = extractContacts(html);
    expect(findAll(contacts, "INSTAGRAM")[0]?.normalizedValue).toBe("instagram:abc_dental");
    expect(findAll(contacts, "FACEBOOK")[0]?.normalizedValue).toBe("facebook:abcdental");
  });

  it("ignores Instagram post/reel links", () => {
    const html = `<a href="https://www.instagram.com/p/Cxyz123/">Post</a>`;
    expect(findAll(extractContacts(html), "INSTAGRAM")).toHaveLength(0);
  });

  it("excludes agency signature links in the footer", () => {
    const html = `<footer><a href="https://facebook.com/webajans" title="Designed by WebAjans">Designed by WebAjans</a></footer>`;
    expect(findAll(extractContacts(html), "FACEBOOK")).toHaveLength(0);
  });

  it("extracts telephone/email/sameAs from a JSON-LD LocalBusiness block", () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "LocalBusiness", "telephone": "+905321234567", "email": "info@abcdis.com",
         "sameAs": ["https://www.instagram.com/abcdis/"]}
      </script>`;
    const contacts = extractContacts(html);
    expect(findAll(contacts, "PHONE")[0]?.foundVia).toBe("JSON_LD");
    expect(findAll(contacts, "EMAIL")[0]?.foundVia).toBe("JSON_LD");
    expect(findAll(contacts, "INSTAGRAM")[0]?.normalizedValue).toBe("instagram:abcdis");
  });

  it("handles a JSON-LD array with an Organization entry", () => {
    const html = `
      <script type="application/ld+json">
        [{"@type": "Organization", "telephone": "+902125550000"}]
      </script>`;
    const contacts = extractContacts(html);
    expect(findAll(contacts, "PHONE")).toHaveLength(1);
  });

  it("ignores malformed JSON-LD without throwing", () => {
    const html = `<script type="application/ld+json">{ not valid json </script><p>info@abcdis.com</p>`;
    expect(() => extractContacts(html)).not.toThrow();
    expect(findAll(extractContacts(html), "EMAIL")).toHaveLength(1);
  });

  it("extracts a plain email from visible text", () => {
    const html = `<p>Bize yazın: info@abcdis.com</p>`;
    expect(findAll(extractContacts(html), "EMAIL")[0]?.normalizedValue).toBe("info@abcdis.com");
  });

  it("extracts an obfuscated email with [at]/(dot)", () => {
    const html = `<p>info [at] abcdis (dot) com adresinden ulaşabilirsiniz</p>`;
    const contacts = findAll(extractContacts(html), "EMAIL");
    expect(contacts.some((c) => c.normalizedValue === "info@abcdis.com")).toBe(true);
  });

  it("extracts a TR mobile phone number written in text", () => {
    const html = `<p>Randevu için: 0532 123 45 67</p>`;
    const contacts = findAll(extractContacts(html), "PHONE");
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.normalizedValue).toBe("+905321234567");
  });

  it("deduplicates the same contact found via multiple sources, keeping the highest confidence", () => {
    const html = `
      <a href="tel:+905321234567">Ara</a>
      <p>0532 123 45 67</p>`;
    const contacts = findAll(extractContacts(html), "PHONE");
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.confidence).toBe(0.9);
  });

  it("returns an empty array for a page with no contact info", () => {
    const html = `<html><body><h1>Hakkımızda</h1><p>Biz kimiz...</p></body></html>`;
    expect(extractContacts(html)).toHaveLength(0);
  });

  it("extracts a LinkedIn company link", () => {
    const html = `<a href="https://www.linkedin.com/company/abc-dental">LinkedIn</a>`;
    expect(findAll(extractContacts(html), "LINKEDIN")[0]?.normalizedValue).toBe("linkedin:abc-dental");
  });

  it("does not extract an email from inline <script> JS code", () => {
    const html = `<script>var fake = "noreply@internal-fake.com"; console.log(fake);</script><p>Gerçek adres: info@abcdis.com</p>`;
    const emails = findAll(extractContacts(html), "EMAIL");
    expect(emails).toHaveLength(1);
    expect(emails[0]?.normalizedValue).toBe("info@abcdis.com");
  });

  it("extracts a TikTok profile link", () => {
    const html = `<a href="https://www.tiktok.com/@abcdental">TikTok</a>`;
    expect(findAll(extractContacts(html), "TIKTOK")[0]?.normalizedValue).toBe("tiktok:abcdental");
  });
});

describe("extractContacts — performans ve gizlenmiş e-posta doğruluğu", () => {
  const emails = (html: string) => extractContacts(html).filter((c) => c.channel === "EMAIL").map((c) => c.normalizedValue);

  it("uzun boşluk dizileri olan sayfada kilitlenmez (regex geri izleme patlaması)", () => {
    // Gerçek sitelerde (ör. şablon motoru çıktısı) binlerce boşluk/satır sonu art arda gelir.
    const filler = `<div>${" \n\t".repeat(4000)}metin${" \n\t".repeat(4000)}</div>`;
    const html = `<html><body>${filler.repeat(6)}<p>info@abcdis.com</p></body></html>`;
    const started = Date.now();
    const result = emails(html);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(result).toContain("info@abcdis.com");
  });

  it("@ içermeyen çok uzun harf-rakam dizisinde kilitlenmez", () => {
    const html = `<html><body><p>${"a1b2c3d4".repeat(20000)}</p> <p>info@abcdis.com</p></body></html>`;
    const started = Date.now();
    const result = emails(html);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(result).toContain("info@abcdis.com");
  });

  it("düz İngilizce 'at' kelimesini e-postaya çevirmez (us@example.com gibi sahte adres üretmez)", () => {
    expect(emails(`<p>Contact us at example.com or visit us at facebook.com today.</p>`)).toEqual([]);
    expect(emails(`<p>We are open at 9.30 and close at 18.00, see you at home.com</p>`)).toEqual([]);
  });

  it("köşeli/normal parantezli ve düz yazılmış gizlemeleri çözer", () => {
    expect(emails(`<p>info [at] abcdis [dot] com</p>`)).toContain("info@abcdis.com");
    expect(emails(`<p>info(at)abcdis(dot)com</p>`)).toContain("info@abcdis.com");
    expect(emails(`<p>info [at] abcdis.com</p>`)).toContain("info@abcdis.com");
    expect(emails(`<p>Mail: info at abcdis dot com.tr</p>`)).toContain("info@abcdis.com.tr");
    expect(emails(`<p>destek (at) klinik (dot) com (dot) tr</p>`)).toContain("destek@klinik.com.tr");
  });
});

describe("extractContacts — sosyal medya yalnızca gerçek platform bağlantılarından çıkar", () => {
  const socials = (html: string) =>
    extractContacts(html).filter((c) => ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK"].includes(c.channel));

  it("sayfa içi çapa, mailto ve göreli bağlantıları sosyal hesap saymaz", () => {
    const html = `
      <a href="#tgl_5351">Aç</a>
      <a href="#collapse2210">Detay</a>
      <a href="mailto:">Yaz</a>
      <a href="kuretaj-tedavisi">Küretaj</a>
      <a href="emdr-terapisi">EMDR</a>
      <a href="javascript:void(0)">Menü</a>`;

    expect(socials(html)).toEqual([]);
  });

  it("gerçek Instagram bağlantısını yalnızca Instagram olarak kaydeder", () => {
    const found = socials(`<a href="https://www.instagram.com/ecesubeautystudio/">Instagram</a>`);

    expect(found.map((c) => [c.channel, c.normalizedValue])).toEqual([["INSTAGRAM", "instagram:ecesubeautystudio"]]);
  });

  it("LinkedIn şirket sayfasını ve TikTok hesabını tanır", () => {
    const found = socials(`
      <a href="https://www.linkedin.com/company/acme-dental/">LinkedIn</a>
      <a href="https://www.tiktok.com/@acmedental">TikTok</a>`);

    expect(found.map((c) => c.normalizedValue).sort()).toEqual(["linkedin:acme-dental", "tiktok:acmedental"]);
  });

  it("paylaş düğmelerini ve platformun kendi sayfalarını hesap saymaz", () => {
    const html = `
      <a href="https://www.facebook.com/sharer.php?u=https://a.com">Paylaş</a>
      <a href="https://www.facebook.com/profile.php?id=1">Profil</a>
      <a href="https://www.instagram.com/accounts/login/">Giriş</a>
      <a href="https://www.linkedin.com/shareArticle?url=https://a.com">Paylaş</a>
      <a href="https://www.tiktok.com/share?url=https://a.com">Paylaş</a>`;

    expect(socials(html)).toEqual([]);
  });
});
