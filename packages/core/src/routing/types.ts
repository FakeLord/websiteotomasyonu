export type Channel = "EMAIL" | "INSTAGRAM" | "FACEBOOK" | "LINKEDIN" | "TIKTOK" | "WHATSAPP" | "PHONE";
export type ChannelMode = "AUTOMATIC" | "DRAFT" | "ASSISTED" | "MANUAL";
export type ChannelStatus = "UNVERIFIED" | "VALID" | "INVALID" | "BOUNCED";

export interface RoutingChannelCandidate {
  channel: Channel;
  status: ChannelStatus;
  confidence: number;
}

export interface RoutingSettings {
  channelPriority: Channel[];
  channelModes: Record<Channel, ChannelMode>;
}

export interface RoutingHistoryEntry {
  channel: Channel;
  sentAt: Date;
}

export interface RoutingHistory {
  lastMessageAtByChannel: Partial<Record<Channel, Date>>;
  firstMessageChannelWithin30Days: Channel | null;
  dailyCountByChannel: Partial<Record<Channel, number>>;
  dailyCountTotal: number;
}

export interface RoutingInput {
  doNotContact: boolean;
  candidates: RoutingChannelCandidate[];
  settings: RoutingSettings;
  history: RoutingHistory;
  limits: {
    dailyTotal: number;
    dailyByChannel: Partial<Record<Channel, number>>;
    channelCooldownHours: number;
  };
  now: Date;
}

export interface RoutingRejection {
  channel: Channel;
  reason:
    | "STATUS_INVALID"
    | "LOW_CONFIDENCE"
    | "COOLDOWN"
    | "DAILY_CHANNEL_LIMIT"
    | "DAILY_TOTAL_LIMIT"
    | "OTHER_CHANNEL_ALREADY_CONTACTED";
}

export type RoutingResult =
  | { ok: true; channel: Channel; mode: ChannelMode }
  | { ok: false; doNotContact: boolean; reasons: RoutingRejection[] };
