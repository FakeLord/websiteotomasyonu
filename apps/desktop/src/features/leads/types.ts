import type { BusinessStage } from "@lbf/core";

export interface BusinessListRow {
  id: string;
  name: string;
  stage: BusinessStage;
  city: string | null;
  district: string | null;
  lead_score: number;
  assigned_to: string | null;
  updated_at: string;
  do_not_contact: boolean;
  possible_duplicate_of: string | null;
}

export interface BusinessDetail extends BusinessListRow {
  category: string | null;
  address: string | null;
  website_url: string | null;
  website_domain: string | null;
  primary_phone_e164: string | null;
  version: number;
  merged_into: string | null;
  dnc_reason: string | null;
}
