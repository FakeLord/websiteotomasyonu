import type { BusinessStage } from "./stage";

/**
 * Elle yapılan temasın (Instagram DM, WhatsApp, arama, e-posta) sonucu. `ATTEMPTED`: bağlantı açıldı, sonuç henüz
 * girilmedi. `CANCELLED`: "Vazgeçtim"; temas hiç yapılmadı sayılır.
 */
export const CONTACT_OUTCOMES = ["ATTEMPTED", "SENT", "REPLIED", "UNREACHABLE", "NOT_INTERESTED", "LATER", "CANCELLED"] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

// Teması izleyen ilerleme sırası. ENGAGED ve ötesi elle yönetilir; temas kaydı oraya taşımaz.
const FORWARD: readonly BusinessStage[] = ["NEW", "QUALIFIED", "OUTREACH_READY", "CONTACTED", "REPLIED"];

/** Kapatılabilen (LOST'a geçişi geçerli) ve ilerlemeden önce İletişime geçilen'e uğraması gereken aşamalar. */
const BEFORE_CONTACTED: readonly BusinessStage[] = ["NEW", "QUALIFIED", "OUTREACH_READY"];
const CAN_BE_LOST: readonly BusinessStage[] = ["CONTACTED", "REPLIED", "ENGAGED", "HANDED_OFF"];

/**
 * Bir temas sonucunun işletmeyi hangi aşamalardan geçirerek ilerleteceğini döner (mevcut aşama hariç). Aşama asla
 * geriye alınmaz; ilerlemiş (ENGAGED+), kapanmış veya müşteri olmuş işletmeye dokunulmaz. Her adım pipeline'ın geçerli
 * geçişidir. SQL tarafı (`set_contact_attempt_outcome`) aynı kuralı uygular; biri değişirse diğeri de değişmelidir.
 */
export function stagePathForOutcome(current: BusinessStage, outcome: ContactOutcome): BusinessStage[] {
  if (outcome === "SENT" || outcome === "REPLIED") {
    const target: BusinessStage = outcome === "SENT" ? "CONTACTED" : "REPLIED";
    const from = FORWARD.indexOf(current);
    const to = FORWARD.indexOf(target);
    return from === -1 || from >= to ? [] : FORWARD.slice(from + 1, to + 1);
  }
  if (outcome === "NOT_INTERESTED") {
    if (BEFORE_CONTACTED.includes(current)) return [...stagePathForOutcome(current, "SENT"), "LOST"];
    return CAN_BE_LOST.includes(current) ? ["LOST"] : [];
  }
  return [];
}
