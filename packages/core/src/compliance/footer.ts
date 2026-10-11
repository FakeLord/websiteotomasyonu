/**
 * E-posta alt bilgisi (ADR 0019): gönderen kimliği, posta adresi ve alıcının tek yanıtla çıkabileceği satır.
 * CAN-SPAM (kimlik + posta adresi + çıkma yolu), PECR (kimlik gizlenemez + çıkma yolu), CASL ve Spam Act
 * (kimlik + çıkma yolu) için asgari gereklerdir; gönderim sonrası uygulanması DB'deki `outreach_guard` ve
 * gelen kutusundaki STOP algılamasıyla (`hasStopKeyword`) tamamlanır.
 */
export type FooterLanguage = "tr" | "en";

export interface ComplianceFooterInput {
  language: FooterLanguage;
  /** Gönderen şirketin adı (çalışma alanı gönderen profili). */
  legalName: string;
  /** Fiziksel posta adresi; boşsa satır yazılmaz (adres gerektirmeyen ülkelerde). */
  postalAddress: string;
  /** İşletmenin ülkesi (ISO-2); ABD için ticari ileti ibaresi eklenir. */
  countryCode: string;
  /** Tek kullanımlık listeden çıkma bağlantısı (ADR 0023); varsa alt bilgiye satır olarak eklenir. */
  unsubscribeUrl?: string | null | undefined;
}

const OPT_OUT: Record<FooterLanguage, string> = {
  tr: 'Bu iletileri bir daha almak istemiyorsanız bu e-postayı "çıkmak istiyorum" yazarak yanıtlamanız yeterli; bir daha yazmayacağız.',
  en: 'If you would rather not hear from us again, just reply with "unsubscribe" and we will not contact you again.',
};

const UNSUBSCRIBE_LINK: Record<FooterLanguage, string> = {
  tr: "Listeden çıkmak için tıklayın:",
  en: "To unsubscribe, click:",
};

const COMMERCIAL: Record<FooterLanguage, string> = {
  tr: "Bu ileti ticari bir iletidir.",
  en: "This is a commercial message.",
};

/** Gönderilecek gövdeye eklenen alt bilgiyi döner (başında boş satır ve ayraç ile). */
export function buildComplianceFooter(input: ComplianceFooterInput): string {
  const lines: string[] = ["--"];
  const name = input.legalName.trim();
  const address = input.postalAddress.trim();
  if (name) lines.push(name);
  if (address) lines.push(address);
  if (input.countryCode.toUpperCase() === "US") lines.push(COMMERCIAL[input.language]);
  lines.push(OPT_OUT[input.language]);
  if (input.unsubscribeUrl) lines.push(`${UNSUBSCRIBE_LINK[input.language]} ${input.unsubscribeUrl}`);
  return `\n\n${lines.join("\n")}`;
}

/** Gövdede zaten aynı alt bilgi varsa (yeniden gönderim, elle eklenmiş) ikinci kez eklenmez. */
export function appendComplianceFooter(body: string, input: ComplianceFooterInput): string {
  const footer = buildComplianceFooter(input);
  return body.includes(OPT_OUT[input.language]) ? body : `${body.trimEnd()}${footer}`;
}
