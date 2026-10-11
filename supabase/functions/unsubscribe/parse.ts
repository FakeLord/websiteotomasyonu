// unsubscribe: saf yardımcılar (Deno testi: parse.test.ts).

export type Lang = "tr" | "en";

/** Anahtar yalnızca onaltılık karakterlerden oluşur ve 32–128 uzunluktadır; başka her şey geçersizdir. */
export function isPlausibleToken(token: string | null | undefined): token is string {
  return typeof token === "string" && /^[0-9a-f]{32,128}$/.test(token);
}

export function pickLang(value: string | null | undefined, acceptLanguage?: string | null): Lang {
  if (value === "tr" || value === "en") return value;
  return /^tr\b/i.test(acceptLanguage ?? "") ? "tr" : "en";
}

export type UnsubscribeStatus = "unsubscribed" | "already" | "invalid" | "error";

const MESSAGES: Record<Lang, Record<UnsubscribeStatus, string>> = {
  tr: {
    unsubscribed: "Listeden çıkarıldınız. Bu adrese bir daha mesaj göndermeyeceğiz.",
    already: "Zaten listeden çıkarılmıştınız. Bu adrese bir daha mesaj göndermeyeceğiz.",
    invalid: "Bu bağlantı geçersiz veya süresi dolmuş. Çıkmak için aldığınız e-postayı \"çıkmak istiyorum\" yazarak yanıtlayabilirsiniz.",
    error: "Şu anda işleminiz tamamlanamadı. Lütfen biraz sonra tekrar deneyin veya e-postayı \"çıkmak istiyorum\" yazarak yanıtlayın.",
  },
  en: {
    unsubscribed: "You have been unsubscribed. We will not send any more messages to this address.",
    already: "You were already unsubscribed. We will not send any more messages to this address.",
    invalid: "This link is invalid or has expired. You can also reply to the email with \"unsubscribe\".",
    error: "We could not complete your request right now. Please try again later or reply to the email with \"unsubscribe\".",
  },
};

export function messageFor(status: UnsubscribeStatus, lang: Lang): string {
  return MESSAGES[lang][status];
}

export function statusCodeFor(status: UnsubscribeStatus): number {
  if (status === "invalid") return 404;
  if (status === "error") return 500;
  return 200;
}
