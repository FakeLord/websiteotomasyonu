import type { OutreachChannel } from "../types";
import { displayName } from "./compose-first-message";
import type { OutreachLanguage } from "./draft-first-message";

export interface FollowUpFacts {
  language: OutreachLanguage;
  channel: OutreachChannel;
  /** 1'den başlar: kaçıncı hatırlatma. */
  step: number;
  /** Sekansta toplam hatırlatma sayısı (politikadaki `maxFollowUps`). */
  totalSteps: number;
  businessName: string;
}

type Stage = "SOFT" | "MIDDLE" | "FINAL";

/** İlk hatırlatma yumuşak, aradakiler kısa bir yineleme, sonuncusu "bir daha yazmayacağız" der. */
function stageOf(step: number, totalSteps: number): Stage {
  if (step <= 1) return "SOFT";
  return step >= totalSteps ? "FINAL" : "MIDDLE";
}

const TR: Record<Stage, (name: string) => string> = {
  SOFT: (name) =>
    `${name} için daha önce gönderdiğimiz mesajı hatırlatmak istedik. Uygun olursanız kısa bir görüşmeyle detayları paylaşabiliriz. Size uygun bir gün ve saat var mı?`,
  MIDDLE: () =>
    "Önceki mesajımıza dönüş yapamamış olabilirsiniz; yoğunluğunuzu anlıyoruz. İlginizi çekerse sorularınızı kısa bir görüşmede yanıtlayabiliriz. Bu hafta uygun bir zamanınız var mı?",
  FINAL: () =>
    "Bu konuda size son kez yazıyoruz. Şu an uygun değilse sorun değil; bu mesajdan sonra tekrar yazmayacağız. İlginiz olursa bu mesaja yanıt vermeniz yeterli.",
};

const EN: Record<Stage, (name: string) => string> = {
  SOFT: (name) =>
    `We wanted to follow up on the message we sent earlier for ${name}. If it suits you, we can walk you through the details in a short call. Is there a day and time that works for you?`,
  MIDDLE: () =>
    "You may not have had a chance to reply to our earlier message, and we understand you are busy. If it interests you, we can answer your questions in a short call. Do you have time this week?",
  FINAL: () =>
    "This is our last message about this. If now is not a good time, no problem; we will not write again after this. If you are interested, simply reply to this message.",
};

/**
 * Takip (hatırlatma) mesajı. Model çağrılmaz: metin kısa, kalıplaşmış ve her seferinde düzgündür; ücretsiz modelin
 * serbest yazdığı hatırlatmalar bozuk Türkçe ve uydurma ayrıntı üretiyordu. Fiyat, süre veya referans içermez.
 */
export function composeFollowUp(facts: FollowUpFacts): string {
  const stage = stageOf(facts.step, facts.totalSteps);
  const name = displayName(facts.businessName) || (facts.language === "tr" ? "işletmeniz" : "your business");
  const text = (facts.language === "tr" ? TR : EN)[stage](name);
  if (facts.channel !== "EMAIL") {
    return `${facts.language === "tr" ? "Merhaba," : "Hello,"} ${text}`;
  }
  const greeting = facts.language === "tr" ? "Merhaba," : "Hello,";
  const closing = facts.language === "tr" ? "Saygılarımla" : "Best regards";
  return [greeting, text, closing].join("\n\n");
}
