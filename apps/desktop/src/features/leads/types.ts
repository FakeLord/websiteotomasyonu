import type { BusinessStage } from "@lbf/core";

export type WebsiteStatus = "NO_WEBSITE" | "BROKEN_WEBSITE" | "LOW_QUALITY_WEBSITE" | "GOOD_WEBSITE";

export interface BusinessListRow {
  id: string;
  name: string;
  stage: BusinessStage;
  category: string | null;
  city: string | null;
  district: string | null;
  country_code: string;
  website_url: string | null;
  website_status: WebsiteStatus | null;
  last_contacted_at: string | null;
  next_action_at?: string | null;
  last_contact_channel?: string | null;
  last_contact_outcome?: string | null;
  last_contact_by?: string | null;
  lead_score: number;
  assigned_to: string | null;
  updated_at: string;
  do_not_contact: boolean;
  possible_duplicate_of: string | null;
  /** Aynı ada sahip şube sayısı (>1: zincir). Yalnızca liste sorgusu ekler. */
  chain_size?: number;
  review_count?: number | null;
  /** Yalnızca liste sorgusu ekler (PostgREST ilişki gömme). */
  contact_channels?: Array<{ channel: string; status: string | null }>;
}

export interface BusinessDetail extends BusinessListRow {
  address: string | null;
  region: string | null;
  postal_code: string | null;
  timezone: string | null;
  language: string | null;
  website_domain: string | null;
  primary_phone_e164: string | null;
  rating: number | null;
  review_count: number | null;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  business_status: string | null;
  score_breakdown: { reasons?: Array<{ code: string; label?: string; points: number }> } | Record<string, unknown>;
  created_at: string;
  version: number;
  merged_into: string | null;
  dnc_reason: string | null;
}
