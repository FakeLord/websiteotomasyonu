/**
 * Listeden çıkma bağlantıları (ADR 0023).
 *
 * İki adres üretilir:
 *  - `headerUrl`: `List-Unsubscribe` başlığına yazılır. RFC 8058 tek tıklama POST ister; posta sağlayıcıları yönlendirmeyi
 *    güvenilir izlemez, bu yüzden her zaman doğrudan Supabase fonksiyonuna gider.
 *  - `linkUrl`: e-postanın altında görünen tıklanabilir bağlantı. İsteğe bağlı olarak kendi alan adından (ör.
 *    `https://hostlys.com/cikis`) verilebilir; o adres belirteci fonksiyona yönlendirir (docs/ops/cikis-yonlendirme.md).
 */
export interface UnsubscribeUrlInput {
  /** Supabase proje adresi (VITE_SUPABASE_URL). https değilse (yerel geliştirme) bağlantı üretilmez. */
  supabaseUrl: string | undefined;
  /** İsteğe bağlı kendi alan adındaki yönlendirme adresi (gönderen kimliğinde). */
  brandedBaseUrl?: string | null | undefined;
  token: string;
  language: string;
}

export interface UnsubscribeUrls {
  headerUrl: string;
  linkUrl: string;
}

/** Yalnızca https, boşluksuz, başlık enjeksiyonuna yol açabilecek karakter içermeyen adresler kabul edilir. */
export function isValidBrandedBase(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!/^https:\/\/[^\s<>"']+$/i.test(v) || v.length > 300) return false;
  try {
    const url = new URL(v);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function buildUnsubscribeUrls(input: UnsubscribeUrlInput): UnsubscribeUrls | null {
  const base = input.supabaseUrl?.trim().replace(/\/+$/, "");
  if (!base || !base.startsWith("https://")) return null;
  if (!/^[0-9a-f]{32,128}$/.test(input.token)) return null;
  const lang = input.language === "en" ? "en" : "tr";
  const query = `t=${encodeURIComponent(input.token)}&lang=${lang}`;
  const headerUrl = `${base}/functions/v1/unsubscribe?${query}`;
  const branded = input.brandedBaseUrl?.trim();
  if (!isValidBrandedBase(branded)) return { headerUrl, linkUrl: headerUrl };
  const sep = branded.includes("?") ? "&" : "?";
  return { headerUrl, linkUrl: `${branded}${sep}${query}` };
}
