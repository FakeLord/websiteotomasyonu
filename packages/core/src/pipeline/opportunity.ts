import type { BusinessStage } from "./stage";

/** Yeni site satılabilecek durumlar: sitesi yok, açılmıyor veya zayıf. */
export const OPPORTUNITY_WEBSITE_STATUSES = ["NO_WEBSITE", "BROKEN_WEBSITE", "LOW_QUALITY_WEBSITE"] as const;

/** Henüz ilk mesaj atılmamış aşamalar. */
export const OPPORTUNITY_STAGES = ["NEW", "QUALIFIED", "OUTREACH_READY"] as const satisfies readonly BusinessStage[];

export interface OpportunityInput {
  websiteStatus: string | null;
  stage: string;
  doNotContact: boolean;
  businessStatus: string | null;
}

/**
 * "Fırsat" (ADR 0014): sitesi olmayan/açılmayan/zayıf, faaliyette, aranabilir ve henüz yazılmamış işletme.
 * Analiz edilmemiş (`websiteStatus` boş) işletme fırsat sayılmaz; önce analiz edilmelidir.
 */
export function isOpportunity(input: OpportunityInput): boolean {
  return (
    (OPPORTUNITY_WEBSITE_STATUSES as readonly string[]).includes(input.websiteStatus ?? "") &&
    (OPPORTUNITY_STAGES as readonly string[]).includes(input.stage) &&
    !input.doNotContact &&
    (input.businessStatus === null || input.businessStatus === "OPERATIONAL")
  );
}
