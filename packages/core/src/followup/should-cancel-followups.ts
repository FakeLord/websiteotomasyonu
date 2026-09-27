import type { BusinessStage } from "../pipeline/stage";

const STOPPING_STAGES: readonly BusinessStage[] = [
  "ENGAGED",
  "PROPOSAL_READY",
  "HANDED_OFF",
  "WON",
  "LOST",
  "DISQUALIFIED",
];

export interface FollowUpCancelInput {
  stage: BusinessStage;
  doNotContact: boolean;
  channelStatus: "UNVERIFIED" | "VALID" | "INVALID" | "BOUNCED";
  hasNewInboundMessage: boolean;
  /** Yeni gelen mesaj otomatik yanıtsa (AUTO_REPLY) sekans iptal edilmez, ertelenir. */
  inboundIsAutoReply?: boolean;
}

/**
 * M bölümündeki durma koşullarının saf mantığı (asıl zorlama DB trigger'ında
 * — SQL, tek yerde). Bu, mantığı önden unit test edebilmek ve SQL tarafıyla
 * ayna tutmak içindir.
 */
export function shouldCancelFollowUps(input: FollowUpCancelInput): boolean {
  if (input.hasNewInboundMessage && !input.inboundIsAutoReply) return true;
  if (STOPPING_STAGES.includes(input.stage)) return true;
  if (input.doNotContact) return true;
  if (input.channelStatus === "INVALID" || input.channelStatus === "BOUNCED") return true;
  return false;
}
